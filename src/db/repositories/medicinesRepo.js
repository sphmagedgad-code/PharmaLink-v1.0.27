/**
 * PharmaLink OS - Medicines Repository
 * Sole access point for the `medicines` object store. Every write
 * keeps searchIndex synchronized (frozen search-first-class decision).
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateMedicine } from '../schemaGuards.js';
import { generateId } from '../schema.js';
import { STORE_NAMES, SEARCH_ENTITY_TYPE } from '../../shared/constants.js';
import { normalizeMedicineName } from '../../shared/normalize.js';
import { buildTokens } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';
import * as searchIndexRepo from './searchIndexRepo.js';

const STORE = STORE_NAMES.MEDICINES;

function syncSearchIndex(medicine) {
  const tokens = buildTokens([medicine.name, medicine.normalizedName, medicine.category]);
  return searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.MEDICINE, medicine.id, tokens, medicine.name);
}

export const addMedicine = wrapAsync('medicinesRepo.addMedicine', async function addMedicine(input) {
  const medicine = {
    id: generateId(),
    name: input.name,
    normalizedName: normalizeMedicineName(input.name),
    category: input.category,
    unit: input.unit || null,
    createdAt: new Date().toISOString(),
  };
  validateMedicine(medicine);

  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).add(medicine);
  });
  await syncSearchIndex(medicine);
  return medicine;
});

export const updateMedicine = wrapAsync('medicinesRepo.updateMedicine', async function updateMedicine(medicine) {
  const updated = { ...medicine, normalizedName: normalizeMedicineName(medicine.name) };
  validateMedicine(updated);
  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).put(updated);
  });
  await syncSearchIndex(updated);
  return updated;
});

export const deleteMedicine = wrapAsync('medicinesRepo.deleteMedicine', async function deleteMedicine(id) {
  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).delete(id);
  });
  await searchIndexRepo.removeEntity(SEARCH_ENTITY_TYPE.MEDICINE, id);
});

export const getMedicineById = wrapAsync('medicinesRepo.getMedicineById', async function getMedicineById(id) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(id));
});

export const getAllMedicines = wrapAsync('medicinesRepo.getAllMedicines', async function getAllMedicines() {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const result = await requestToPromise(tx.objectStore(STORE).getAll());
  return result || [];
});

/**
 * Find-or-create by normalized name, using the by_normalizedName
 * index (not a full scan). Used by WhatsApp import to merge spelling
 * variants of the same medicine into one record.
 */
export const findOrCreateByName = wrapAsync('medicinesRepo.findOrCreateByName', async function findOrCreateByName(rawName, category) {
  const normalizedName = normalizeMedicineName(rawName);
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_normalizedName');
  const existing = await requestToPromise(index.get(normalizedName));
  if (existing) return existing;
  return addMedicine({ name: rawName, category });
});
