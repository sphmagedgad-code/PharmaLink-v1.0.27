/**
 * PharmaLink OS - WhatsApp Messages Repository
 * Sole access point for the `whatsappMessages` object store: RAW
 * messages only (parsed structured data lives in parsedEntitiesRepo,
 * each row linked back via sourceMessageId). Raw messages are
 * operationally disposable - archiving/deleting them never touches
 * medicines/contacts/deals.
 *
 * Bulk inserts are chunked (IMPORT_BATCH_SIZE) into multiple short
 * synchronous transactions rather than one giant transaction, so a
 * 500k-message import doesn't hold a single IndexedDB transaction
 * open for an unbounded time on low-end hardware. Yielding to the
 * event loop happens BETWEEN transactions, never inside one.
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateWhatsAppMessage } from '../schemaGuards.js';
import { STORE_NAMES, IMPORT_BATCH_SIZE, SEARCH_ENTITY_TYPE } from '../../shared/constants.js';
import { buildTokens, MESSAGE_TOKEN_CAP } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';
import * as searchIndexRepo from './searchIndexRepo.js';

const STORE = STORE_NAMES.WHATSAPP_MESSAGES;

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Returns existing (groupId -> Set of "receivedAt|text" keys) already
 * stored for the given groups, using the by_groupId index (bounded to
 * just those groups, not a full-store scan). Used for dedup during
 * import without needing a dedicated dedupe-key index.
 */
export const getExistingDedupeKeys = wrapAsync('whatsappRepo.getExistingDedupeKeys', async function getExistingDedupeKeys(groupIds) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_groupId');
  const keys = new Set();
  for (const groupId of groupIds) {
    const rows = (await requestToPromise(index.getAll(groupId))) || [];
    for (const row of rows) {
      keys.add(`${groupId}|${row.receivedAt}|${row.text}`);
    }
  }
  return keys;
});

/**
 * Inserts many validated messages in chunked atomic transactions.
 * `messages` must already be deduped by the caller. Returns the
 * inserted messages (with search index synced).
 */
export const addMessagesBulk = wrapAsync('whatsappRepo.addMessagesBulk', async function addMessagesBulk(messages, onProgress) {
  for (const message of messages) {
    validateWhatsAppMessage(message);
  }

  const db = await getDatabase();
  for (let i = 0; i < messages.length; i += IMPORT_BATCH_SIZE) {
    const chunk = messages.slice(i, i + IMPORT_BATCH_SIZE);

    await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
      const store = tx.objectStore(STORE);
      for (const message of chunk) {
        store.put(message);
      }
    });

    for (const message of chunk) {
      const tokens = buildTokens([message.groupId, message.text], MESSAGE_TOKEN_CAP);
      await searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE, message.id, tokens, message.text.slice(0, 80));
    }

    if (onProgress) onProgress(Math.min(i + IMPORT_BATCH_SIZE, messages.length), messages.length);
    await yieldToEventLoop();
  }

  return messages;
});

export const getMessageById = wrapAsync('whatsappRepo.getMessageById', async function getMessageById(id) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(id));
});

/** Cursor-based count - never loads the whole store into memory. */
export const countMessages = wrapAsync('whatsappRepo.countMessages', async function countMessages() {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  return requestToPromise(tx.objectStore(STORE).count());
});

/**
 * Cursor-paginated read: returns up to `limit` messages received
 * on/after `sinceIso`, ordered by receivedAt. Screens must use this
 * (or getMessagesByGroup) instead of loading the entire store at
 * 500k+ message scale.
 */
export const getMessagesPage = wrapAsync('whatsappRepo.getMessagesPage', async function getMessagesPage(sinceIso = '', limit = 100) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_receivedAt');
  const range = sinceIso ? IDBKeyRange.lowerBound(sinceIso, true) : null;

  return new Promise((resolve, reject) => {
    const results = [];
    const request = index.openCursor(range, 'next');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }
      results.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
});

export const getMessagesByGroup = wrapAsync('whatsappRepo.getMessagesByGroup', async function getMessagesByGroup(groupId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_groupId');
  const result = await requestToPromise(index.getAll(groupId));
  return result || [];
});

/**
 * Deletes all messages received strictly before `beforeIso`, using a
 * cursor over the by_receivedAt index (bounded range, not a scan of
 * unrelated rows). Returns the deleted message ids so the caller can
 * cascade-delete their parsed entities and search index rows.
 */
export const deleteMessagesBefore = wrapAsync('whatsappRepo.deleteMessagesBefore', async function deleteMessagesBefore(beforeIso) {
  const db = await getDatabase();
  const range = IDBKeyRange.upperBound(beforeIso, true);
  const deletedIds = [];

  await new Promise((resolve, reject) => {
    const tx = db.transaction([STORE], 'readwrite');
    const index = tx.objectStore(STORE).index('by_receivedAt');
    const request = index.openCursor(range, 'next');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      deletedIds.push(cursor.value.id);
      cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  for (const id of deletedIds) {
    await searchIndexRepo.removeEntity(SEARCH_ENTITY_TYPE.WHATSAPP_MESSAGE, id);
  }
  return deletedIds;
});

/**
 * Exports all messages received strictly before `beforeIso` as plain
 * objects (for the "safe export before delete" requirement), reading
 * via cursor rather than getAll() to stay bounded at large scale.
 */
export const exportMessagesBefore = wrapAsync('whatsappRepo.exportMessagesBefore', async function exportMessagesBefore(beforeIso) {
  const db = await getDatabase();
  const range = IDBKeyRange.upperBound(beforeIso, true);
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_receivedAt');

  return new Promise((resolve, reject) => {
    const results = [];
    const request = index.openCursor(range, 'next');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(results);
        return;
      }
      results.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
});
