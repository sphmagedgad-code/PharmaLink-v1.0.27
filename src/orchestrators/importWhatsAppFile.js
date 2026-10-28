/**
 * PharmaLink OS - WhatsApp Import Orchestrator
 * Coordinates multi-file import: reads raw text, reconstructs logical
 * multi-line messages (a WhatsApp header line plus any continuation
 * lines that follow it - real exports very often carry the BUY/SELL
 * signal on the header line while the actual medicine/price/quantity
 * details are on the continuation lines that follow), classifies
 * each logical message, deduplicates against both the existing
 * database and the rest of the current batch, then writes raw
 * messages, parsed entities, medicines, and contacts through their
 * repositories (which keep searchIndex synchronized on every write).
 */

import { classifyMessage, normalizeDigits, extractPhones } from './classifyWhatsAppMessage.js';
import { generateId } from '../db/schema.js';
import { MEDICINE_CATEGORY } from '../shared/constants.js';
import * as whatsappRepo from '../db/repositories/whatsappRepo.js';
import * as parsedEntitiesRepo from '../db/repositories/parsedEntitiesRepo.js';
import * as medicinesRepo from '../db/repositories/medicinesRepo.js';
import * as contactsRepo from '../db/repositories/contactsRepo.js';
import { normalizeMedicineName } from '../shared/normalize.js';

const MAX_PHONES_PER_MESSAGE = 5;

// Strips Unicode bidi/directional control characters (RLM, LRM, LRE,
// PDF, isolates, BOM) that real WhatsApp exports embed liberally
// around dates, phone numbers, and names. Left in place, these break
// exact-position regex matching (e.g. a header's date/time pattern
// straddling an invisible mark never matches).
const BIDI_STRIP_RE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

// Header line: "D/M/Y, H:MM [AM/PM marker] - sender or event...".
// Digits are matched as \d because normalizeDigits() is applied to
// the whole file text before this regex ever runs (Arabic-Indic and
// Extended Arabic-Indic dates are just as common as Arabic-Indic
// phone numbers in real exports). Both Arabic ("،") and Western (",")
// commas are accepted, and both Arabic (ص/م) and English (AM/PM)
// meridiem markers.
const HEADER_LINE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[،,]\s*(\d{1,2}):(\d{2})\s*(ص|م|AM|PM|am|pm)?\s*-\s*(.*)$/;

/**
 * Safely converts a candidate Date to an ISO 8601 string. This is the
 * ONE normalized timestamp representation used for persistence -
 * never throws. Returns null if the Date is invalid (NaN internal
 * time) or - defensively - if toISOString() itself somehow throws
 * (e.g. a value outside the representable date range), so callers
 * always have a safe fallback path instead of ever passing an
 * invalid value into IndexedDB.
 */
function toSafeIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  try {
    return date.toISOString();
  } catch (err) {
    return null;
  }
}

function fallbackTimestamp(fallbackBaseMs, lineIndex) {
  return toSafeIso(new Date(fallbackBaseMs + lineIndex)) || new Date(Date.now() + lineIndex).toISOString();
}

/** Applies AM/PM (or ص/م) correction to a 24-hour-assumed hour value. */
function applyMeridiem(hour, marker) {
  if (!marker) return hour;
  const isPm = marker === 'م' || marker.toLowerCase() === 'pm';
  const isAm = marker === 'ص' || marker.toLowerCase() === 'am';
  if (isPm && hour < 12) return hour + 12;
  if (isAm && hour === 12) return 0;
  return hour;
}

/**
 * Splits one raw file's normalized text into logical messages: each
 * one starts at a header line and absorbs every following line up to
 * (not including) the next header line. This is what lets a header's
 * "موجود" (available/SELL signal) combine with its continuation
 * lines' drug/price/quantity details into one classifiable text.
 */
function reconstructLogicalMessages(fileText, groupId, fallbackBaseMs) {
  const lines = fileText.split(/\r?\n/);
  const messages = [];
  let current = null;
  let lineIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headerMatch = line.match(HEADER_LINE_RE);

    if (headerMatch) {
      if (current) messages.push(current);
      const [, day, month, yearRaw, hour, minute, meridiem, rest] = headerMatch;
      const year = yearRaw.length === 2 ? Number(`20${yearRaw}`) : Number(yearRaw);
      const correctedHour = applyMeridiem(Number(hour), meridiem);
      const receivedAt =
        toSafeIso(new Date(year, Number(month) - 1, Number(day), correctedHour, Number(minute))) ||
        fallbackTimestamp(fallbackBaseMs, lineIndex);

      const separatorIndex = rest.indexOf(': ');
      const senderSegment = separatorIndex === -1 ? rest.trim() : rest.slice(0, separatorIndex).trim();
      const firstLineText = separatorIndex === -1 ? '' : rest.slice(separatorIndex + 2).trim();

      current = {
        groupId,
        receivedAt,
        senderSegment,
        bodyLines: firstLineText ? [firstLineText] : [],
      };
    } else if (current && line) {
      current.bodyLines.push(line);
    }
    // Lines before any header has appeared yet, or blank lines, are dropped.
    lineIndex += 1;
  }
  if (current) messages.push(current);
  return messages;
}

/**
 * @param {{ name: string, text: string }[]} files
 * @param {(progress: { phase: string, current: number, total: number }) => void} [onProgress]
 * @returns {Promise<{ totalLines: number, imported: number, duplicates: number, ignored: number, urgentCount: number, messages: object[] }>}
 */
export async function importWhatsAppFiles(files, onProgress) {
  const baseMs = Date.now();
  const groupIds = files.map((f) => f.name);
  const existingKeys = await whatsappRepo.getExistingDedupeKeys(groupIds);
  const seenInBatch = new Set();

  const messagesToInsert = [];
  const entityDrafts = []; // { message, classification, drug, phone } - when a phone is available
  const medicineOnlyDrugs = new Set(); // drug names to persist even when no phone is available
  let totalLines = 0;
  let duplicates = 0;
  let ignored = 0;
  let urgentCount = 0;

  files.forEach((file, fileIndex) => {
    const groupId = file.name;
    const normalizedText = normalizeDigits(file.text.replace(BIDI_STRIP_RE, ''));
    const logicalMessages = reconstructLogicalMessages(normalizedText, groupId, baseMs + fileIndex * 1000000);
    totalLines += logicalMessages.length;

    logicalMessages.forEach((logicalMessage) => {
      const combinedText = logicalMessage.bodyLines.join('\n');
      const classification = classifyMessage(combinedText, logicalMessage.groupId, logicalMessage.receivedAt);

      if (!classification) {
        ignored += 1;
        return;
      }

      const dedupeKey = `${logicalMessage.groupId}|${classification.receivedAt}|${classification.text}`;
      if (existingKeys.has(dedupeKey) || seenInBatch.has(dedupeKey)) {
        duplicates += 1;
        return;
      }
      seenInBatch.add(dedupeKey);

      if (classification.isUrgent) urgentCount += 1;

      const message = {
        id: generateId(),
        groupId: logicalMessage.groupId,
        text: classification.text,
        receivedAt: classification.receivedAt,
        status: classification.status,
      };
      messagesToInsert.push(message);

      const drugs = classification.drugs;

      // Phone can come from the message body (existing behavior) OR
      // from the WhatsApp header's sender segment (new - real exports
      // very often identify the sender only by phone in the header,
      // never repeating it inside the message body).
      const headerPhones = extractPhones(logicalMessage.senderSegment.replace(/\s+/g, ''));
      const phones = Array.from(new Set([...headerPhones, ...classification.phones])).slice(0, MAX_PHONES_PER_MESSAGE);

      if (phones.length === 0) {
        // No actionable contact phone anywhere (header or body) - the
        // raw message and its medicines are still persisted; there is
        // just no contact to link a parsed entity to.
        for (const drug of drugs) medicineOnlyDrugs.add(drug);
        return;
      }

      for (const drug of drugs) {
        for (const phone of phones) {
          entityDrafts.push({ message, classification, drug, phone });
        }
      }
    });
  });

  if (onProgress) onProgress({ phase: 'classifying', current: totalLines, total: totalLines });

  // Resolve medicines and contacts (find-or-create, deduped by
  // normalized name / phone) before writing parsed entities.
  const medicineCache = new Map();
  const contactCache = new Map();
  const preparedEntities = [];

  async function ensureMedicine(drug) {
    const key = normalizeMedicineName(drug);
    let medicine = medicineCache.get(key);
    if (!medicine) {
      medicine = await medicinesRepo.findOrCreateByName(drug, MEDICINE_CATEGORY.GENERAL);
      medicineCache.set(key, medicine);
    }
    return medicine;
  }

  // Medicines mentioned in messages with no available contact phone -
  // still persisted, per the "medicines must exist even without phone
  // data" requirement.
  for (const drug of medicineOnlyDrugs) {
    await ensureMedicine(drug);
  }

  for (let i = 0; i < entityDrafts.length; i += 1) {
    const { message, classification, drug, phone } = entityDrafts[i];
    const medicine = await ensureMedicine(drug);
    const normalizedMedicineName = normalizeMedicineName(drug);

    // Always resolve roles for this specific line (not gated on cache
    // hit) - findOrCreateWithRole only writes when a role actually
    // needs to change, but it must still be CALLED every time so a
    // contact seen as buyer on one line and seller on another within
    // the same import batch ends up with both role flags set, not
    // just whichever role was seen first.
    const contact = await contactsRepo.findOrCreateWithRole(phone, {
      isBuyer: classification.type === 'buy',
      isSeller: classification.type === 'sell',
    });
    contactCache.set(phone, contact);

    // A logical message can list several distinct medicines (e.g.
    // "3 boxes X / 2 boxes Y 50 / 1 box Z 150"), but only ONE price
    // and ONE quantity are ever extracted per message (first regex
    // match in the combined text) - there is no reliable way to tell
    // which price belongs to which drug when more than one drug is
    // present. Attaching that single value to every drug would
    // silently invent a price/quantity relationship that doesn't
    // exist in the source text. Only trust price/quantity when this
    // message names exactly one medicine (classification.isSingle);
    // for multi-drug messages, the medicine/contact/role/message data
    // is still fully preserved - only the price/quantity fields are
    // honestly left null instead of guessed.
    const trustedPrice = classification.isSingle ? classification.price : null;
    const trustedQuantity = classification.isSingle ? classification.quantity : null;

    if (classification.type === 'sell' && trustedPrice) {
      await contactsRepo.updateLastPrice(contact.id, medicine.id, trustedPrice, classification.receivedAt);
    }

    preparedEntities.push({
      id: generateId(),
      sourceMessageId: message.id,
      groupId: message.groupId,
      receivedAt: message.receivedAt,
      type: classification.type,
      medicineId: medicine.id,
      normalizedMedicineName,
      rawMedicineText: drug,
      contactId: contact.id,
      phone,
      price: trustedPrice,
      quantity: trustedQuantity,
      isUrgent: classification.isUrgent,
    });

    if (onProgress && i % 50 === 0) {
      onProgress({ phase: 'linking', current: i, total: entityDrafts.length });
    }
  }

  if (onProgress) onProgress({ phase: 'saving', current: 0, total: messagesToInsert.length });
  await whatsappRepo.addMessagesBulk(messagesToInsert, (current, total) => {
    if (onProgress) onProgress({ phase: 'saving', current, total });
  });

  if (preparedEntities.length > 0) {
    await parsedEntitiesRepo.addEntitiesBulk(preparedEntities);
  }

  return {
    totalLines,
    imported: messagesToInsert.length,
    duplicates,
    ignored,
    urgentCount,
    entitiesCreated: preparedEntities.length,
    messages: messagesToInsert,
  };
}
