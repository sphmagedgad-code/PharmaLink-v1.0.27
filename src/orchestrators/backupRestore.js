/**
 * PharmaLink OS - Backup & Restore Orchestrator
 * Exports/imports data entirely through existing repositories (no
 * direct IndexedDB access here), so every write still runs through
 * schemaGuards validation and keeps searchIndex synchronized.
 *
 * Two backup scopes, per the "WhatsApp data is temporary operational
 * data" decision:
 * - Business data (default, recommended): medicines + contacts + deals.
 *   Small, fast, safe to back up often.
 * - Full data (opt-in): also includes whatsappMessages + parsedEntities.
 *   Can be large at 500k-message scale - the Backup screen warns
 *   before including it.
 */

import { DB_VERSION } from '../shared/constants.js';
import * as medicinesRepo from '../db/repositories/medicinesRepo.js';
import * as contactsRepo from '../db/repositories/contactsRepo.js';
import * as dealsRepo from '../db/repositories/dealsRepo.js';
import * as whatsappRepo from '../db/repositories/whatsappRepo.js';
import * as parsedEntitiesRepo from '../db/repositories/parsedEntitiesRepo.js';
import { wrapAsync } from '../shared/errorHandler.js';

export const exportBusinessData = wrapAsync('backupRestore.exportBusinessData', async function exportBusinessData() {
  const [medicines, contacts, deals] = await Promise.all([
    medicinesRepo.getAllMedicines(),
    contactsRepo.getAllContacts(),
    dealsRepo.getAllDeals(),
  ]);
  return {
    scope: 'business',
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    medicines,
    contacts,
    deals,
  };
});

/**
 * Full export additionally walks WhatsApp messages page by page
 * (cursor-based, bounded per page) rather than a single getAll(),
 * staying consistent with the large-store-safety decision even
 * though this is an explicit, user-initiated, one-time operation.
 */
export const exportFullData = wrapAsync('backupRestore.exportFullData', async function exportFullData() {
  const business = await exportBusinessData();
  const messages = [];
  let cursor = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await whatsappRepo.getMessagesPage(cursor, 500);
    if (page.length === 0) break;
    messages.push(...page);
    cursor = page[page.length - 1].receivedAt;
    if (page.length < 500) break;
  }

  const parsedEntities = [];
  for (const message of messages) {
    const entities = await parsedEntitiesRepo.getEntitiesBySourceMessage(message.id);
    parsedEntities.push(...entities);
  }

  return { ...business, scope: 'full', whatsappMessages: messages, parsedEntities };
});

/**
 * Restores business data using each repo's update*() function (an
 * IndexedDB `put`, so records are inserted-or-replaced by their
 * original id - safe to re-run). searchIndex is re-synced
 * automatically because these are the same repo functions normal
 * screens use, not a bypass.
 */
export const restoreBusinessData = wrapAsync('backupRestore.restoreBusinessData', async function restoreBusinessData(backup) {
  const counts = { medicines: 0, contacts: 0, deals: 0 };

  for (const medicine of backup.medicines || []) {
    await medicinesRepo.updateMedicine(medicine);
    counts.medicines += 1;
  }
  for (const contact of backup.contacts || []) {
    await contactsRepo.updateContact(contact);
    counts.contacts += 1;
  }
  for (const deal of backup.deals || []) {
    await dealsRepo.updateDeal(deal);
    counts.deals += 1;
  }

  return counts;
});

export const restoreFullData = wrapAsync('backupRestore.restoreFullData', async function restoreFullData(backup) {
  const businessCounts = await restoreBusinessData(backup);

  if (backup.whatsappMessages && backup.whatsappMessages.length > 0) {
    await whatsappRepo.addMessagesBulk(backup.whatsappMessages);
  }
  if (backup.parsedEntities && backup.parsedEntities.length > 0) {
    await parsedEntitiesRepo.addEntitiesBulk(backup.parsedEntities);
  }

  return {
    ...businessCounts,
    whatsappMessages: (backup.whatsappMessages || []).length,
    parsedEntities: (backup.parsedEntities || []).length,
  };
});
