/**
 * PharmaLink OS - Deals Repository
 * Sole access point for the `deals` object store. Lifecycle:
 * pending -> confirmed -> delivered -> commission_collected ->
 * completed, with cancelled reachable from any pre-completion stage.
 * Every write keeps searchIndex synchronized.
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateDeal } from '../schemaGuards.js';
import { generateId } from '../schema.js';
import { STORE_NAMES, DEAL_STATUS, DEAL_STATUS_ORDER, SEARCH_ENTITY_TYPE } from '../../shared/constants.js';
import { buildTokens } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';
import * as searchIndexRepo from './searchIndexRepo.js';
import { getMedicineById } from './medicinesRepo.js';
import { getContactById } from './contactsRepo.js';

const STORE = STORE_NAMES.DEALS;

async function syncSearchIndex(deal) {
  const [medicine, buyer, seller] = await Promise.all([
    getMedicineById(deal.medicineId),
    getContactById(deal.buyerId),
    getContactById(deal.sellerId),
  ]);
  const tokens = buildTokens([
    medicine && medicine.name,
    buyer && buyer.name,
    seller && seller.name,
    deal.status,
    deal.notes,
    deal.price,
    deal.quantity,
  ]);
  const snippet = medicine ? medicine.name : deal.id;
  return searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.DEAL, deal.id, tokens, snippet);
}

export const addDeal = wrapAsync('dealsRepo.addDeal', async function addDeal(input) {
  const deal = {
    id: generateId(),
    medicineId: input.medicineId,
    buyerId: input.buyerId,
    sellerId: input.sellerId,
    quantity: input.quantity,
    price: input.price,
    status: input.status || DEAL_STATUS.PENDING,
    commissionAmount: input.commissionAmount === undefined || input.commissionAmount === null ? null : input.commissionAmount,
    notes: input.notes || null,
    createdAt: new Date().toISOString(),
  };
  validateDeal(deal);

  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).add(deal);
  });
  await syncSearchIndex(deal);
  return deal;
});

export const updateDeal = wrapAsync('dealsRepo.updateDeal', async function updateDeal(deal) {
  validateDeal(deal);
  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).put(deal);
  });
  await syncSearchIndex(deal);
  return deal;
});

/** Advances a deal to the next lifecycle stage (or sets a given status, e.g. cancelled). */
export const setDealStatus = wrapAsync('dealsRepo.setDealStatus', async function setDealStatus(id, status) {
  if (!Object.values(DEAL_STATUS).includes(status)) {
    throw new Error(`setDealStatus: invalid status "${status}"`);
  }
  const existing = await getDealById(id);
  if (!existing) throw new Error(`setDealStatus: deal ${id} not found`);
  return updateDeal({ ...existing, status });
});

/** Returns the next lifecycle status after the given one, or null if already at/after completed/cancelled. */
export function getNextStatus(currentStatus) {
  const index = DEAL_STATUS_ORDER.indexOf(currentStatus);
  if (index === -1 || index === DEAL_STATUS_ORDER.length - 1) return null;
  return DEAL_STATUS_ORDER[index + 1];
}

export const deleteDeal = wrapAsync('dealsRepo.deleteDeal', async function deleteDeal(id) {
  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).delete(id);
  });
  await searchIndexRepo.removeEntity(SEARCH_ENTITY_TYPE.DEAL, id);
});

export const getDealById = wrapAsync('dealsRepo.getDealById', async function getDealById(id) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(id));
});

export const getAllDeals = wrapAsync('dealsRepo.getAllDeals', async function getAllDeals() {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const result = await requestToPromise(tx.objectStore(STORE).getAll());
  return result || [];
});

export const getDealsByStatus = wrapAsync('dealsRepo.getDealsByStatus', async function getDealsByStatus(status) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_status');
  const result = await requestToPromise(index.getAll(status));
  return result || [];
});

export const getDealsByMedicine = wrapAsync('dealsRepo.getDealsByMedicine', async function getDealsByMedicine(medicineId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_medicineId');
  const result = await requestToPromise(index.getAll(medicineId));
  return result || [];
});

export const getDealsByBuyer = wrapAsync('dealsRepo.getDealsByBuyer', async function getDealsByBuyer(buyerId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_buyerId');
  const result = await requestToPromise(index.getAll(buyerId));
  return result || [];
});

export const getDealsBySeller = wrapAsync('dealsRepo.getDealsBySeller', async function getDealsBySeller(sellerId) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_sellerId');
  const result = await requestToPromise(index.getAll(sellerId));
  return result || [];
});
