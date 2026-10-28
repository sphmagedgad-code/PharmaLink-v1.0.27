/**
 * PharmaLink live WhatsApp bridge.
 * Receives queued Android notification events and feeds them through the
 * same classifier/repositories used by the TXT import path.
 * The Android layer is the transport; this module remains the source of
 * truth for medicine persistence and structured entity creation.
 */
import { classifyMessage, extractPhones, normalizeDigits } from '../orchestrators/classifyWhatsAppMessage.js';
import { generateId } from '../db/schema.js';
import * as whatsappRepo from '../db/repositories/whatsappRepo.js';
import * as parsedEntitiesRepo from '../db/repositories/parsedEntitiesRepo.js';
import * as medicinesRepo from '../db/repositories/medicinesRepo.js';
import * as contactsRepo from '../db/repositories/contactsRepo.js';
import { MEDICINE_CATEGORY } from '../shared/constants.js';

let running = false;

function native() {
  return window.PharmaLinkNative || null;
}

function iso(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date().toISOString();
}

async function processEvent(event) {
  const groupId = String(event.conversation || event.packageName || 'WhatsApp');
  const receivedAt = iso(event.receivedAt);
  const text = normalizeDigits(String(event.text || '').trim());
  if (!text) return 'ignored';

  const existing = await whatsappRepo.getExistingDedupeKeys([groupId]);
  const dedupeKey = `${groupId}|${receivedAt}|${text}`;
  if (existing.has(dedupeKey)) return 'duplicate';

  const classification = classifyMessage(text, groupId, receivedAt);
  if (!classification) {
    // Preserve the event in Android history, but do not pollute the
    // operational WhatsApp store with non-actionable notifications.
    return 'ignored';
  }

  const message = {
    id: generateId(),
    groupId,
    text: classification.text,
    receivedAt,
    status: classification.status,
  };
  await whatsappRepo.addMessagesBulk([message]);

  const phones = Array.from(new Set([
    ...extractPhones(text),
    ...(event.sender && /\d/.test(String(event.sender)) ? extractPhones(String(event.sender)) : []),
  ]));

  const medicineCache = new Map();
  const ensureMedicine = async (drug) => {
    const key = drug.toLowerCase();
    if (medicineCache.has(key)) return medicineCache.get(key);
    const medicine = await medicinesRepo.findOrCreateByName(drug, MEDICINE_CATEGORY.GENERAL);
    medicineCache.set(key, medicine);
    return medicine;
  };

  // Every real medicine mention is persisted even if WhatsApp exposes no
  // usable phone in the notification. Structured parsed entities require a
  // contact/phone by the frozen schema, so those are created only when a
  // phone is genuinely available.
  for (const drug of classification.drugs) await ensureMedicine(drug);

  if (phones.length === 0) return 'processed-no-phone';

  const trustedPrice = classification.isSingle ? classification.price : null;
  const trustedQuantity = classification.isSingle ? classification.quantity : null;
  const entities = [];

  for (const phone of phones) {
    const contact = await contactsRepo.findOrCreateWithRole(phone, {
      isBuyer: classification.type === 'buy',
      isSeller: classification.type === 'sell',
      name: event.sender && !/\d/.test(String(event.sender)) ? String(event.sender) : phone,
    });

    for (const drug of classification.drugs) {
      const medicine = await ensureMedicine(drug);
      if (classification.type === 'sell' && trustedPrice) {
        await contactsRepo.updateLastPrice(contact.id, medicine.id, trustedPrice, receivedAt);
      }
      entities.push({
        id: generateId(),
        sourceMessageId: message.id,
        groupId,
        receivedAt,
        type: classification.type,
        medicineId: medicine.id,
        normalizedMedicineName: medicine.normalizedName,
        rawMedicineText: drug,
        contactId: contact.id,
        phone,
        price: trustedPrice,
        quantity: trustedQuantity,
        isUrgent: classification.isUrgent,
      });
    }
  }

  if (entities.length) await parsedEntitiesRepo.addEntitiesBulk(entities);
  return 'processed';
}

async function drain() {
  const bridge = native();
  if (!bridge || running) return;
  running = true;
  try {
    const raw = bridge.getPendingEvents();
    const events = JSON.parse(raw || '[]');
    for (const event of events) {
      try {
        await processEvent(event);
        bridge.markProcessed(Number(event.id));
      } catch (error) {
        bridge.markFailed(Number(event.id), error?.message || String(error));
      }
    }
  } finally {
    running = false;
  }
}

window.PharmaLinkLive = Object.freeze({ drain });

export function initLiveWhatsApp() {
  if (!native()) return false;
  void drain();
  window.addEventListener('focus', () => void drain());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void drain();
  });
  return true;
}
