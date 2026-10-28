/**
 * PharmaLink OS - Database Schema (v2)
 * Declarative definition of every IndexedDB object store and index.
 * connection.js reads this definition during onupgradeneeded.
 *
 * v2 changes (authorized architecture update):
 * - `suppliers` replaced by unified `contacts` (isBuyer/isSeller flags).
 * - `deals` now reference buyerId + sellerId instead of supplierId.
 * - New `parsedEntities` store: structured data extracted from
 *   WhatsApp messages, each row keeps `sourceMessageId` back to the
 *   original raw message (raw + parsed are stored separately).
 * - New `searchIndex` store: token -> entity reference rows powering
 *   global search without full-store scans.
 */

import { STORE_NAMES } from '../shared/constants.js';

export const SCHEMA_DEFINITION = Object.freeze([
  {
    name: STORE_NAMES.MEDICINES,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'by_name', keyPath: 'name', options: { unique: false } },
      { name: 'by_category', keyPath: 'category', options: { unique: false } },
      { name: 'by_normalizedName', keyPath: 'normalizedName', options: { unique: false } },
    ],
  },
  {
    name: STORE_NAMES.CONTACTS,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'by_name', keyPath: 'name', options: { unique: false } },
      { name: 'by_whatsapp', keyPath: 'whatsapp', options: { unique: false } },
      { name: 'by_governorate', keyPath: 'governorate', options: { unique: false } },
      { name: 'by_isBuyer', keyPath: 'isBuyer', options: { unique: false } },
      { name: 'by_isSeller', keyPath: 'isSeller', options: { unique: false } },
    ],
  },
  {
    name: STORE_NAMES.DEALS,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'by_status', keyPath: 'status', options: { unique: false } },
      { name: 'by_buyerId', keyPath: 'buyerId', options: { unique: false } },
      { name: 'by_sellerId', keyPath: 'sellerId', options: { unique: false } },
      { name: 'by_medicineId', keyPath: 'medicineId', options: { unique: false } },
      { name: 'by_createdAt', keyPath: 'createdAt', options: { unique: false } },
    ],
  },
  {
    name: STORE_NAMES.WHATSAPP_MESSAGES,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'by_groupId', keyPath: 'groupId', options: { unique: false } },
      { name: 'by_receivedAt', keyPath: 'receivedAt', options: { unique: false } },
      { name: 'by_status', keyPath: 'status', options: { unique: false } },
    ],
  },
  {
    name: STORE_NAMES.PARSED_ENTITIES,
    options: { keyPath: 'id' },
    indexes: [
      { name: 'by_sourceMessageId', keyPath: 'sourceMessageId', options: { unique: false } },
      { name: 'by_medicineId', keyPath: 'medicineId', options: { unique: false } },
      { name: 'by_contactId', keyPath: 'contactId', options: { unique: false } },
      { name: 'by_phone', keyPath: 'phone', options: { unique: false } },
      { name: 'by_groupId', keyPath: 'groupId', options: { unique: false } },
      { name: 'by_receivedAt', keyPath: 'receivedAt', options: { unique: false } },
      { name: 'by_type', keyPath: 'type', options: { unique: false } },
    ],
  },
  {
    name: STORE_NAMES.SEARCH_INDEX,
    options: { keyPath: 'id' },
    indexes: [
      // Primary lookup path: prefix range query on `token`.
      { name: 'by_token', keyPath: 'token', options: { unique: false } },
      { name: 'by_entityType', keyPath: 'entityType', options: { unique: false } },
      // Used to remove/replace all index rows for one entity on update/delete.
      { name: 'by_entityRef', keyPath: 'entityRef', options: { unique: false } },
    ],
  },
]);

/**
 * Applies SCHEMA_DEFINITION to a database during a version-upgrade
 * transaction. Only ever called from connection.js's onupgradeneeded.
 * Safe to run against an existing DB: stores/indexes already present
 * are left untouched. The v1 -> v2 upgrade drops the old `suppliers`
 * store (no production data exists on any deployed device yet, so
 * this is a clean recreate, not a data migration).
 */
export function applySchema(db, upgradeTransaction) {
  if (db.objectStoreNames.contains('suppliers') && !db.objectStoreNames.contains(STORE_NAMES.CONTACTS)) {
    db.deleteObjectStore('suppliers');
  }

  for (const storeDef of SCHEMA_DEFINITION) {
    let store;
    if (!db.objectStoreNames.contains(storeDef.name)) {
      store = db.createObjectStore(storeDef.name, storeDef.options);
    } else {
      store = upgradeTransaction.objectStore(storeDef.name);
    }

    for (const indexDef of storeDef.indexes) {
      if (!store.indexNames.contains(indexDef.name)) {
        store.createIndex(indexDef.name, indexDef.keyPath, indexDef.options);
      }
    }
  }
}

/**
 * Generates a locally-unique identifier.
 * Uses Date.now() + Math.random() rather than crypto.randomUUID()
 * for compatibility with older Android WebView (Realme C12 target).
 */
export function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
