/**
 * PharmaLink OS - WhatsApp Message Classifier
 * Pure parsing logic (no IndexedDB access here): takes one raw
 * WhatsApp export line and extracts everything importWhatsAppFile.js
 * needs to create raw message + parsed entity records. Kept
 * side-effect free and synchronous so it's trivially testable and
 * cheap to run across hundreds of thousands of lines.
 */

import { BUY_KEYWORDS, SELL_KEYWORDS, URGENT_KEYWORDS, KNOWN_DRUGS, PRICE_RE, PHONE_RE, QTY_RE } from '../shared/messageKeywords.js';
import { PARSED_ENTITY_TYPE, WHATSAPP_MESSAGE_STATUS } from '../shared/constants.js';
import { normalizeText } from '../shared/normalize.js';

function containsAny(text, keywords) {
  return keywords.some((kw) => text.includes(kw));
}

export function extractPhones(text) {
  const matches = text.match(PHONE_RE) || [];
  const normalized = matches.map((m) => `01${m.replace(/\D/g, '').slice(-9)}`);
  return Array.from(new Set(normalized));
}

function extractPrice(text) {
  const match = text.match(PRICE_RE);
  if (!match) return null;
  const numeric = parseFloat(match[1].replace(/,/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function extractQuantity(text) {
  const match = text.match(QTY_RE);
  if (!match) return null;
  const numeric = parseInt(match[1], 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Finds every known drug name mentioned in the text (case-insensitive
 * for English, exact-substring for Arabic). Also picks up capitalized
 * English words as a fallback so brand names outside KNOWN_DRUGS still
 * surface (lower-confidence, kept for the reference's parity: an
 * unrecognized capitalized word can still be treated as a drug hint).
 */
// Structural medicine markers: real exports use several different
// emoji as "this line names a drug" signals, not just one fixed
// format - confirmed present at volume in real production data:
// pill (name+strength+name), syringe (name, sometimes marker
// repeated before the Arabic name), and test-tube (active-ingredient
// listings). All three are treated as equally reliable structural
// signals, NOT gated by KNOWN_DRUGS, so real medicines the curated
// dictionary has never seen are still recovered regardless of which
// marker format a given catalog uses.
const STRUCTURAL_MARKER_RE = /[\u{1F48A}\u{1F489}\u{1F9EA}]\s*([^\n\u{1F48A}\u{1F489}\u{1F9EA}]{2,60})/gu;

// Real catalogs sometimes spread one product across several separate
// marker lines - a brand-name line, then a pack-size line like
// "\ud83d\udc8a 100 TAB" (100 tablets - a quantity/form descriptor,
// not a drug name). Reject candidate names that are exactly a common
// dosage-form/unit/packaging word so these never get treated as
// medicines (confirmed real false positives from this exact pattern).
const NON_DRUG_UNIT_WORDS = new Set([
  'TAB', 'TABS', 'TABLET', 'TABLETS', 'CAP', 'CAPS', 'CAPSULE', 'CAPSULES',
  'VIAL', 'VIALS', 'AMP', 'AMPS', 'AMPOULE', 'AMPOULES', 'ML', 'MG', 'GM', 'IU',
  'PCS', 'BOX', 'PACK', 'PACKS', 'WITH', 'AND', 'INJ', 'INJECTION', 'SPRAY',
]);

// Arabic words that, if present ANYWHERE in a candidate, mean the
// whole candidate is not a single specific medicine - request/offer
// verbs, bundle/kit words, supplier-name indicators, marketing
// phrasing. Confirmed real false positives this rejects: a supplier's
// named kit ("Zakaria Set"), a bundled test kit ("kit Fers C Farco"),
// marketing copy ("the strongest product..."). Matched by STEM
// (startsWith), not exact word, so inflected/plural forms are caught
// too (e.g. plural/dual forms of "syringe" are rejected by the
// "syringe" stem).
const ARABIC_REJECT_STEMS = [
  'متوفر', 'مطلوب', 'طقم', 'سرنج', 'شركة', 'سعر', 'فرط', 'لاقل', 'هندي',
  'يوناني', 'الاقوي', 'المنتج', 'محدودة', 'الاصناف', 'الأصناف', 'الأولوية',
  'الاولوية', 'للحجز', 'التأكيد', 'التاكيد', 'مذيب', 'ماء',
];

// Arabic words safe to STRIP out of a mixed candidate while keeping
// the real remainder (packaging/unit descriptors commonly attached
// directly to a real drug name, e.g. "box Enbrel" -> "Enbrel").
// Matched by stem so inflected forms (dual/plural) are also caught.
const ARABIC_STRIP_STEMS = [
  'علب', 'درج', 'امبول', 'فيال', 'فايل', 'قلم', 'اقلام', 'كبسول', 'اقراص',
  'لبوس', 'بديل', 'نص', 'ربع', 'محلول', 'هيئة', 'شراب', 'اقماع', 'سبراي', 'ملين',
];

function stemMatches(word, stems) {
  const normalizedWord = normalizeText(word);
  return stems.some((stem) => normalizedWord.startsWith(normalizeText(stem)));
}

/**
 * Rejects a candidate if any of its Arabic words carries the definite
 * article prefix "ال" (al-). Real transliterated drug/brand names in
 * this data never carry it (they are phonetic renderings of foreign
 * proper nouns); ordinary Arabic nouns/adjectives in descriptive
 * sentences or category headers almost always do ("the ampoules",
 * "the sugar", "the product"). This is the single highest-value
 * generalizable filter found from auditing the real data - it
 * rejects category-header and marketing-sentence false positives as
 * a class, not one hardcoded phrase at a time.
 */
function hasDefiniteArticleWord(words) {
  return words.some((w) => normalizeText(w).startsWith('ال') && w.length > 3);
}

function extractStructuralMarkerDrugs(text) {
  const found = [];
  let match;
  STRUCTURAL_MARKER_RE.lastIndex = 0;
  while ((match = STRUCTURAL_MARKER_RE.exec(text)) !== null) {
    const segment = match[1];
    // Capped to 3 words for English, 2 for Arabic - real brand/generic
    // names are short; anything longer in this position is a
    // descriptive sentence fragment, not a product name. Hyphen is
    // included in the Arabic class so compound names are captured
    // whole, not truncated at the hyphen.
    const englishMatch = segment.match(/[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,2}/);
    const arabicMatch = segment.match(/[\u0621-\u064A\u0640-]{3,}(?:[\u0640\s-]+[\u0621-\u064A\u0640-]{2,}){0,1}/);
    const candidates = [
      englishMatch ? englishMatch[0].trim() : null,
      arabicMatch ? arabicMatch[0].replace(/\u0640/g, '').trim() : null,
    ];
    for (const rawName of candidates) {
      if (!rawName || rawName.length < 3) continue;

      const rawWords = rawName.split(/\s+/);
      if (rawWords.some((w) => stemMatches(w, ARABIC_REJECT_STEMS))) continue;
      if (hasDefiniteArticleWord(rawWords)) continue;

      // Strip both Arabic packaging/unit stems AND exact English
      // dosage-form/unit words (checked per-word now, not only when
      // they are the whole candidate - "MG CAZANAT" must still yield
      // "CAZANAT", not be silently kept as-is or fully discarded).
      const words = rawWords.filter(
        (w) => !stemMatches(w, ARABIC_STRIP_STEMS) && !NON_DRUG_UNIT_WORDS.has(w.toUpperCase())
      );
      const name = words.join(' ').trim();
      if (!name || name.length < 3) continue;
      found.push(name);
    }
  }
  return found;
}

/**
 * Finds every medicine mentioned in the text. KNOWN_DRUGS is a
 * high-confidence dictionary, not a mandatory gate: real medicine
 * mentions outside that list are also recovered via the pharmacy-
 * marker (\ud83d\udc8a) pattern, which is a structural signal (an
 * explicit "this line names a drug" marker used by the source data
 * itself), not a guess. Both sources are UNIONED (not "first match
 * wins"), so a message naming several drugs - some in the
 * dictionary, some not - keeps all of them.
 *
 * Deliberately NOT included: a generic "any capitalized English word"
 * fallback. That heuristic has no structural basis - it matches any
 * capitalized word regardless of context (confirmed false positives
 * on real data: "TAB", "WITH") - so it is removed rather than
 * restricted. Recall for genuinely unknown medicine names now comes
 * only from the pharmacy-marker signal, which trades some recall for
 * zero false positives.
 */
// Conservative fallback for WhatsApp catalogs that list a medicine on
// its own line without a 💊/💉/🧪 marker and without a dictionary hit.
// Only short, product-like lines in a message already classified as buy/sell
// are eligible; promotional sentences, contact details and common packaging
// words are rejected. This improves recall without treating every capitalized
// word in a message as a medicine.
const FALLBACK_NOISE_RE = /(?:واتس|واتساب|تواصل|للتواصل|اتصال|صيدليه|صيدلية|مخزن|شركة|شركه|خصم|سعر|اسعار|أسعار|نهائي|نهائى|مطلوب|متوفر|متاح|موجود|عاجل|ضروري|فوري|للبيع|للشراء|للحجز|تاريخ|صلاحية|صلاحيه|كمية|كميه|بديل|مجان|توصيل|شحن|عرض|عروض|مليون|ايجار|إيجار|للإيجار|جنيه|جنيهات|ج|EGP|TAB|TABS|CAPS?|VIALS?|AMPS?|ML|MG|BOX|PACK)/i;
const FALLBACK_LEADING_RE = /^[\s*•▪️♦️✔️✅🔥⚡💥🚨📌➖—–-]+/u;

function extractUnmarkedLineCandidates(text) {
  const found = [];
  const lines = text.split(/\r?\n/);
  for (const sourceLine of lines) {
    let line = sourceLine.replace(FALLBACK_LEADING_RE, '').replace(/[>*_~`]/g, '').trim();
    if (!line || line.length < 3 || line.length > 48) continue;
    // Emoji-heavy/marketing and conversational lines are not product names.
    if (/[\u{1F000}-\u{1FAFF}؟?!]/u.test(line)) continue;
    // Remove request/offer boilerplate and leading stock quantities/pack words.
    line = line.replace(/^(?:(?:مطلوب|محتاج|عايز|عاوز|متوفر|متاح|موجود|عندي|عندنا|للبيع|نريد|ابحث)\s*)+/u, '').trim();
    line = line.replace(/^\d+\s*(?:علب|علبة|قلم|اقلام|فيال|فايل|امبول|امبولات|كرتون)?\s*/u, '').trim();
    if (line.length < 3 || line.length > 42) continue;
    if (FALLBACK_NOISE_RE.test(line)) continue;
    // If a known dictionary name already explains this line, do not add
    // a second synthetic candidate such as "4 علب مونجارو".
    const lineHasKnownDrug = KNOWN_DRUGS.some((drug) => {
      const isArabic = /[\u0600-\u06FF]/.test(drug);
      return isArabic ? line.includes(drug) : line.toLowerCase().includes(drug.toLowerCase());
    });
    if (lineHasKnownDrug) continue;
    if (!/[A-Za-z\u0621-\u064A]{3}/u.test(line)) continue;
    // Candidate must be a compact name (optionally followed by strength/pack size),
    // not a sentence or a phone/price-only fragment.
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length > 4) continue;
    const name = line.replace(/[|,:;]+.*$/, '').replace(/\s+(?:نص|ربع|تركي|هندي|يوناني|شركة|شركه|تاريخ|صلاحية).*$/u, '').replace(/\s+\d+(?:[./-]\d+)?\s*(?:mg|g|ml|iu|mcg|ميلي|مجم|مج|جم|مل)?\s*$/iu, '').replace(/\s+(?:علب|علبة|فيال|امبول|امبولات|قلم|كرتون)\b.*$/u, '').trim();
    if (name.length >= 3 && name.length <= 36 && !FALLBACK_NOISE_RE.test(name)) found.push(name);
  }
  return found;
}

function extractDrugMentions(text) {
  const found = new Set();

  for (const drug of KNOWN_DRUGS) {
    const isArabic = /[\u0600-\u06FF]/.test(drug);
    if (isArabic ? text.includes(drug) : text.toLowerCase().includes(drug.toLowerCase())) {
      found.add(drug);
    }
  }

  for (const name of extractStructuralMarkerDrugs(text)) {
    found.add(name);
  }

  // Only use the unmarked fallback when the message contains an actionable
  // buy/sell cue. It is intentionally line-based, never a whole-message
  // capitalization heuristic.
  if (containsAny(text, BUY_KEYWORDS) || containsAny(text, SELL_KEYWORDS)) {
    for (const name of extractUnmarkedLineCandidates(text)) found.add(name);
  }

  return Array.from(found);
}

/**
 * Converts Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits
 * to Western digits (0-9). The shared PHONE_RE/PRICE_RE/QTY_RE
 * regexes use \d, which only matches ASCII digits - without this,
 * phone numbers/prices typed with an Arabic numeral keyboard (the
 * common default on Egyptian Arabic Android devices, including the
 * Realme C12 target) were silently invisible to extraction.
 */
export function normalizeDigits(text) {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.codePointAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Classifies an already-assembled message text (the caller,
 * importWhatsAppFile.js, is responsible for combining a WhatsApp
 * header line with any continuation lines into one logical message
 * before calling this - a real export's BUY/SELL signal is often on
 * the header line while the actual medicine/price/quantity details
 * are on the following continuation lines, so classification must
 * see them together). Digit normalization is re-applied here too
 * (idempotent, cheap) as a safety net for any caller that hasn't
 * already normalized. Returns null if the text carries no actionable
 * buy/sell signal (e.g. small talk, media placeholders, system
 * events like "joined the group").
 */
export function classifyMessage(rawText, groupId, receivedAt) {
  const text = normalizeDigits(rawText).trim();
  if (!text || text.length < 3) return null;

  const isBuySignal = containsAny(text, BUY_KEYWORDS);
  const isSellSignal = containsAny(text, SELL_KEYWORDS);
  const drugs = extractDrugMentions(text);

  if (!isBuySignal && !isSellSignal) return null;
  if (drugs.length === 0) return null;

  const type = isSellSignal ? PARSED_ENTITY_TYPE.SELL : PARSED_ENTITY_TYPE.BUY;
  const status = type === PARSED_ENTITY_TYPE.SELL ? WHATSAPP_MESSAGE_STATUS.OFFER : WHATSAPP_MESSAGE_STATUS.REQUEST;

  const phones = extractPhones(text);
  const price = extractPrice(text);
  const quantity = extractQuantity(text);
  const isUrgent = containsAny(text, URGENT_KEYWORDS);
  const isSingle = drugs.length === 1;

  return {
    groupId,
    receivedAt,
    text,
    status,
    type,
    drugs,
    phones,
    price,
    quantity,
    isUrgent,
    isSingle,
  };
}
