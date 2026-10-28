/**
 * PharmaLink OS - Parsed Entities Repository
 * Sole access point for the `parsedEntities` store: structured data
 * extracted from WhatsApp messages (one row per medicine mention per
 * message). Every row keeps sourceMessageId back to the raw message
 * it came from. Archiving/deleting these never touches medicines,
 * contacts, or deals - only the raw+parsed WhatsApp data.
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateParsedEntity } from '../schemaGuards.js';
import { STORE_NAMES, IMPORT_BATCH_SIZE, SEARCH_ENTITY_TYPE } from '../../shared/constants.js';
import { buildTokens } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';
import * as searchIndexRepo from './searchIndexRepo.js';

const STORE = STORE_NAMES.PARSED_ENTITIES;

function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export const addEntitiesBulk = wrapAsync('parsedEntitiesRepo.addEntitiesBulk', async function addEntitiesBulk(entities) {
  for (const entity of entities) {
    validateParsedEntity(entity);
  }

  const db = await getDatabase();
  for (let i = 0; i < entities.length; i += IMPORT_BATCH_SIZE) {
    const chunk = entities.slice(i, i + IMPORT_BATCH_SIZE);

    await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
      const store = tx.objectStore(STORE);
      for (const entity of chunk) {
        store.put(entity);
      }
    });

    for (const entity of chunk) {
      const tokens = buildTokens([entity.rawMedicineText, entity.normalizedMedicineName, entity.phone, entity.type]);
      await searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.PARSED_ENTITY, entity.id, tokens, entity.rawMedicineText);
    }

    await yieldToEventLoop();
  }
  return entities;
});

export const getEntityById = wrapAsync('parsedEntitiesRepo.getEntityById', async function getEntityById(id) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(id));
});

export const getEntitiesBySourceMessage = wrapAsync('parsedEntitiesRepo.getEntitiesBySourceMessage', async function getEntitiesBySourceMessage(sourceMessageId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_sourceMessageId');
  const result = await requestToPromise(index.getAll(sourceMessageId));
  return result || [];
});

export const getEntitiesByMedicine = wrapAsync('parsedEntitiesRepo.getEntitiesByMedicine', async function getEntitiesByMedicine(medicineId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_medicineId');
  const result = await requestToPromise(index.getAll(medicineId));
  return result || [];
});

export const getEntitiesByContact = wrapAsync('parsedEntitiesRepo.getEntitiesByContact', async function getEntitiesByContact(contactId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_contactId');
  const result = await requestToPromise(index.getAll(contactId));
  return result || [];
});

export const getEntitiesByPhone = wrapAsync('parsedEntitiesRepo.getEntitiesByPhone', async function getEntitiesByPhone(phone) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_phone');
  const result = await requestToPromise(index.getAll(phone));
  return result || [];
});

/** Cursor-paginated recent entities, used by Dashboard/Search without loading the whole store. */
export const getRecentEntities = wrapAsync('parsedEntitiesRepo.getRecentEntities', async function getRecentEntities(limit = 200) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_receivedAt');

  return new Promise((resolve, reject) => {
    const results = [];
    const request = index.openCursor(null, 'prev');
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

/** Cascading cleanup: deletes parsed entities for a set of source message ids (used by archive/delete). */
export const deleteBySourceMessageIds = wrapAsync('parsedEntitiesRepo.deleteBySourceMessageIds', async function deleteBySourceMessageIds(sourceMessageIds) {
  if (sourceMessageIds.length === 0) return;
  const db = await getDatabase();
  const idSet = new Set(sourceMessageIds);
  const deletedIds = [];

  for (const sourceMessageId of sourceMessageIds) {
    const rows = await getEntitiesBySourceMessage(sourceMessageId);
    if (rows.length === 0) continue;
    await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
      const store = tx.objectStore(STORE);
      for (const row of rows) {
        store.delete(row.id);
        deletedIds.push(row.id);
      }
    });
  }

  for (const id of deletedIds) {
    await searchIndexRepo.removeEntity(SEARCH_ENTITY_TYPE.PARSED_ENTITY, id);
  }
  return deletedIds;
});
