/**
 * PharmaLink OS - Contacts Repository
 * Sole access point for the `contacts` object store. A contact can be
 * a buyer, a seller, or both (role flags, not separate entities) -
 * roles update automatically as WhatsApp messages are classified.
 * Every write keeps searchIndex synchronized.
 */

import { getDatabase } from '../connection.js';
import { requestToPromise, runAtomicTransaction } from './transactions.js';
import { validateContact } from '../schemaGuards.js';
import { generateId } from '../schema.js';
import { STORE_NAMES, SEARCH_ENTITY_TYPE } from '../../shared/constants.js';
import { buildTokens } from '../../shared/searchTokens.js';
import { wrapAsync } from '../../shared/errorHandler.js';
import * as searchIndexRepo from './searchIndexRepo.js';

const STORE = STORE_NAMES.CONTACTS;

function syncSearchIndex(contact) {
  const tokens = buildTokens([contact.name, contact.whatsapp, contact.governorate, contact.notes]);
  return searchIndexRepo.indexEntity(SEARCH_ENTITY_TYPE.CONTACT, contact.id, tokens, contact.name);
}

export const addContact = wrapAsync('contactsRepo.addContact', async function addContact(input) {
  const contact = {
    id: generateId(),
    name: input.name,
    whatsapp: input.whatsapp,
    isBuyer: Boolean(input.isBuyer),
    isSeller: Boolean(input.isSeller),
    governorate: input.governorate || null,
    notes: input.notes || null,
    lastPrices: input.lastPrices || {},
    createdAt: new Date().toISOString(),
  };
  validateContact(contact);

  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).add(contact);
  });
  await syncSearchIndex(contact);
  return contact;
});

export const updateContact = wrapAsync('contactsRepo.updateContact', async function updateContact(contact) {
  validateContact(contact);
  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).put(contact);
  });
  await syncSearchIndex(contact);
  return contact;
});

export const deleteContact = wrapAsync('contactsRepo.deleteContact', async function deleteContact(id) {
  const db = await getDatabase();
  await runAtomicTransaction(db, [STORE], 'readwrite', (tx) => {
    tx.objectStore(STORE).delete(id);
  });
  await searchIndexRepo.removeEntity(SEARCH_ENTITY_TYPE.CONTACT, id);
});

export const getContactById = wrapAsync('contactsRepo.getContactById', async function getContactById(id) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(id));
});

export const getAllContacts = wrapAsync('contactsRepo.getAllContacts', async function getAllContacts() {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const result = await requestToPromise(tx.objectStore(STORE).getAll());
  return result || [];
});

// NOTE: isBuyer/isSeller are booleans (schemaGuards.validateContact
// requires this). Booleans are never a valid IndexedDB key type in
// any browser, so the by_isBuyer/by_isSeller indexes declared in
// schema.js can never be queried directly (index.getAll(true) throws
// "The parameter is not a valid key" - a real, confirmed runtime
// error, not a syntax mistake). Contacts are a small collection by
// design (see getAllContacts), so filtering in memory is both correct
// and fast - no index needed for this.
export const getSellers = wrapAsync('contactsRepo.getSellers', async function getSellers() {
  const all = await getAllContacts();
  return all.filter((c) => c.isSeller === true);
});

export const getBuyers = wrapAsync('contactsRepo.getBuyers', async function getBuyers() {
  const all = await getAllContacts();
  return all.filter((c) => c.isBuyer === true);
});

export const findContactByWhatsapp = wrapAsync('contactsRepo.findContactByWhatsapp', async function findContactByWhatsapp(whatsapp) {
  const db = await getDatabase();
  const tx = db.transaction([STORE], 'readonly');
  const index = tx.objectStore(STORE).index('by_whatsapp');
  return requestToPromise(index.get(whatsapp));
});

/**
 * Finds a contact by phone or creates one, then applies the given
 * role flags (OR'd onto any existing roles - a contact seen as both
 * buyer and seller across different messages keeps both flags true).
 * This is how roles "change automatically" from imported messages.
 */
export const findOrCreateWithRole = wrapAsync('contactsRepo.findOrCreateWithRole', async function findOrCreateWithRole(whatsapp, { isBuyer = false, isSeller = false, name = null } = {}) {
  const existing = await findContactByWhatsapp(whatsapp);
  if (!existing) {
    return addContact({
      name: name || whatsapp,
      whatsapp,
      isBuyer,
      isSeller,
    });
  }
  if ((isBuyer && !existing.isBuyer) || (isSeller && !existing.isSeller)) {
    return updateContact({
      ...existing,
      isBuyer: existing.isBuyer || isBuyer,
      isSeller: existing.isSeller || isSeller,
    });
  }
  return existing;
});

/** Updates (or adds) lastPrices[medicineId] for a seller contact. */
export const updateLastPrice = wrapAsync('contactsRepo.updateLastPrice', async function updateLastPrice(contactId, medicineId, price, date) {
  const contact = await getContactById(contactId);
  if (!contact) throw new Error(`updateLastPrice: contact ${contactId} not found`);
  return updateContact({
    ...contact,
    lastPrices: { ...contact.lastPrices, [medicineId]: { price, date } },
  });
});
