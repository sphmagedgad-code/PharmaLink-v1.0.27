/**
 * PharmaLink OS - Complete Deal Orchestrator
 * Creates a deal AND updates the seller's lastPrices atomically,
 * using raw store operations inside a single runAtomicTransaction
 * (not individual repo calls) exactly per the frozen atomicity
 * constraint - this is the resolution of the previously tracked
 * "await inside readwrite transaction" defect: every operation
 * inside the transaction callback below is synchronous; the only
 * `await` in this file happens BEFORE the transaction opens.
 */

import { getDatabase } from '../db/connection.js';
import { runAtomicTransaction } from '../db/repositories/transactions.js';
import { validateDeal } from '../db/schemaGuards.js';
import { generateId } from '../db/schema.js';
import { STORE_NAMES, DEAL_STATUS, SEARCH_ENTITY_TYPE } from '../shared/constants.js';
import { buildTokens } from '../shared/searchTokens.js';
import { wrapAsync } from '../shared/errorHandler.js';
import * as searchIndexRepo from '../db/repositories/searchIndexRepo.js';
import { getMedicineById } from '../db/repositories/medicinesRepo.js';
import { getContactById } from '../db/repositories/contactsRepo.js';

export const completeDeal = wrapAsync('completeDeal', async function completeDeal(input) {
  const deal = {
    id: generateId(),
    medicineId: input.medicineId,
    buyerId: input.buyerId,
    sellerId: input.sellerId,
    quantity: input.quantity,
    price: input.price,
    status: DEAL_STATUS.PENDING,
    commissionAmount: input.commissionAmount === undefined || input.commissionAmount === null ? null : input.commissionAmount,
    notes: input.notes || null,
    createdAt: new Date().toISOString(),
  };
  validateDeal(deal);

  const db = await getDatabase();
  let updatedSeller = null;

  await runAtomicTransaction(db, [STORE_NAMES.DEALS, STORE_NAMES.CONTACTS], 'readwrite', (tx) => {
    tx.objectStore(STORE_NAMES.DEALS).add(deal);

    const contactsStore = tx.objectStore(STORE_NAMES.CONTACTS);
    const sellerRequest = contactsStore.get(deal.sellerId);
    sellerRequest.onsuccess = () => {
      const seller = sellerRequest.result;
      if (!seller) return;
      updatedSeller = {
        ...seller,
        lastPrices: { ...seller.lastPrices, [deal.medicineId]: { price: deal.price, date: deal.createdAt } },
      };
      contactsStore.put(updatedSeller);
    };
  });

  // Search index writes happen after the transaction has committed -
  // safe to await here since we are no longer inside the transaction.
  const [medicine, buyer] = await Promise.all([getMedicineById(deal.medicineId), getContactById(deal.buyerId)]);
  const dealTokens = buildTokens([medicine && medicine.name, buyer && buyer.name, updatedSeller && updatedSeller.name, deal.status]);
  await searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.DEAL, deal.id, dealTokens, medicine ? medicine.name : deal.id);

  if (updatedSeller) {
    const sellerTokens = buildTokens([updatedSeller.name, updatedSeller.whatsapp, updatedSeller.governorate, updatedSeller.notes]);
    await searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.CONTACT, updatedSeller.id, sellerTokens, updatedSeller.name);
  }

  return deal;
});
