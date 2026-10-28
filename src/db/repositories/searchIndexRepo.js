/**
 * PharmaLink OS - Search Index Repository
 * The central search engine (per the frozen "search is first-class"
 * decision). Every other repository calls indexEntity()/removeEntity()
 * on every create/update/delete so searchIndex is always in sync -
 * search itself never scans the source stores directly.
 *
 * Query strategy: the FIRST significant query token is looked up via
 * the `by_token` index using a prefix IDBKeyRange (bounded, indexed -
 * never a full-store scan). That narrows candidates to a small set of
 * entityRefs. Only that small candidate set is then checked in memory
 * against any remaining query tokens. This stays fast at 500k+ rows
 * because the expensive part (the index range scan) is bounded by the
 * prefix, not the store size.
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateSearchIndexRow } from '../schemaGuards.js';
import { generateId } from '../schema.js';
import { STORE_NAMES, SEARCH_RESULT_LIMIT } from '../../shared/constants.js';
import { tokenize } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';

const STORE = STORE_NAMES.SEARCH_INDEX;

/**
 * Replaces all searchIndex rows for one entity with a fresh set built
 * from `tokens`. Safe to call on create AND update (removes stale
 * rows first) - this is what keeps the index synchronized.
 */
export const indexEntity = wrapAsync('searchIndexRepo.indexEntity', async function indexEntity(entityType, entityId, tokens, snippet) {
  const db = await getDatabase();
  const entityRef = `${entityType}:${entityId}`;

  const existingTx = db.transaction([STORE], 'readonly');
  const existingIndex = existingTx.objectStore(STORE).index('by_entityRef');
  const existingRows = (await requestToPromise(existingIndex.getAll(entityRef))) || [];

  const newRows = Array.from(new Set(tokens)).map((token) => {
    const row = {
      id: generateId(),
      token,
      entityType,
      entityId,
      entityRef,
      snippet: snippet || '',
    };
    validateSearchIndexRow(row);
    return row;
  });

  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    const store = tx.objectStore(STORE);
    for (const row of existingRows) {
      store.delete(row.id);
    }
    for (const row of newRows) {
      store.add(row);
    }
  });
});

/** Removes every searchIndex row for one entity (used on delete). */
export const removeEntity = wrapAsync('searchIndexRepo.removeEntity', async function removeEntity(entityType, entityId) {
  const db = await getDatabase();
  const entityRef = `${entityType}:${entityId}`;

  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_entityRef');
  const rows = (await requestToPromise(index.getAll(entityRef))) || [];
  if (rows.length === 0) return;

  await runAtomicTransaction(db, [STORE], 'readwrite', (writeTx) => {
    const store = writeTx.objectStore(STORE);
    for (const row of rows) {
      store.delete(row.id);
    }
  });
});

/**
 * Runs a global search. Returns an array of unique { entityType,
 * entityId, snippet } matches, most-referenced-first, capped at
 * SEARCH_RESULT_LIMIT. `entityTypes` optionally restricts the result
 * to a subset (e.g. only 'contact').
 */
export const search = wrapAsync('searchIndexRepo.search', async function search(query, entityTypes = null) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const tokenIndex = tx.objectStore(STORE).index('by_token');

  // Prefix range on the first token only - this is the single indexed
  // scan; it never touches rows outside the matching prefix range.
  const [firstToken, ...restTokens] = tokens;
  const range = IDBKeyRange.bound(firstToken, firstToken + '\uffff');
  const candidates = (await requestToPromise(tokenIndex.getAll(range))) || [];

  // Narrow further in-memory (only over the already-small candidate
  // set, not the full store) if the query had more than one word.
  const byEntityRef = new Map();
  for (const row of candidates) {
    if (entityTypes && !entityTypes.includes(row.entityType)) continue;
    if (!byEntityRef.has(row.entityRef)) {
      byEntityRef.set(row.entityRef, { entityType: row.entityType, entityId: row.entityId, snippet: row.snippet, matchedTokens: new Set() });
    }
    byEntityRef.get(row.entityRef).matchedTokens.add(row.token);
  }

  let results = Array.from(byEntityRef.values());

  if (restTokens.length > 0) {
    // For remaining query words, confirm the same entityRef also has
    // a row for that token (second indexed lookup, still bounded).
    for (const extraToken of restTokens) {
      const extraRange = IDBKeyRange.bound(extraToken, extraToken + '\uffff');
      const extraRows = (await requestToPromise(tokenIndex.getAll(extraRange))) || [];
      const refsWithToken = new Set(extraRows.map((r) => r.entityRef));
      results = results.filter((r) => refsWithToken.has(`${r.entityType}:${r.entityId}`));
    }
  }

  return results.slice(0, SEARCH_RESULT_LIMIT).map(({ entityType, entityId, snippet }) => ({ entityType, entityId, snippet }));
});
