/**
 * PharmaLink OS - Search Tokenization
 * Turns any searchable record into a bounded set of lowercase tokens
 * for the searchIndex store. Tokens are the unit indexed by
 * searchIndexRepo's `by_token` index, enabling prefix-range lookups
 * instead of full-store scans.
 */

import { normalizeText } from './normalize.js';
import { SEARCH_MIN_TOKEN_LENGTH, SEARCH_MAX_TOKENS_PER_MESSAGE } from './constants.js';

/**
 * Splits normalized text into unique word tokens, dropping tokens
 * shorter than SEARCH_MIN_TOKEN_LENGTH (cuts index bloat from single
 * Arabic prefixes/stopwords-like fragments).
 */
export function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const words = normalized.split(' ').filter((w) => w.length >= SEARCH_MIN_TOKEN_LENGTH);
  return Array.from(new Set(words));
}

/**
 * Builds the full token set for an entity from a list of field
 * values. `cap` bounds the total token count (used for large free
 * text like raw WhatsApp messages, to keep searchIndex growth
 * manageable at 500k+ message scale); structured entities (contacts,
 * medicines, deals) pass no cap since their fields are already short.
 */
export function buildTokens(fieldValues, cap = null) {
  const all = new Set();
  for (const value of fieldValues) {
    if (value === null || value === undefined) continue;
    for (const token of tokenize(String(value))) {
      all.add(token);
    }
  }
  const tokens = Array.from(all);
  return cap ? tokens.slice(0, cap) : tokens;
}

export const MESSAGE_TOKEN_CAP = SEARCH_MAX_TOKENS_PER_MESSAGE;
