/**
 * PharmaLink OS - WhatsApp Archive Orchestrator
 * WhatsApp exports are temporary operational data. This lets old
 * imported chats be exported (JSON download) and/or deleted without
 * ever touching Medicines, Contacts, Deals, or their statistics -
 * only whatsappMessages + their linked parsedEntities are affected.
 */

import * as whatsappRepo from '../db/repositories/whatsappRepo.js';
import * as parsedEntitiesRepo from '../db/repositories/parsedEntitiesRepo.js';
import { wrapAsync } from '../shared/errorHandler.js';

/** Returns a JSON-serializable export of all messages older than beforeIso. */
export const exportOldMessages = wrapAsync('archiveWhatsApp.exportOldMessages', async function exportOldMessages(beforeIso) {
  const messages = await whatsappRepo.exportMessagesBefore(beforeIso);
  return {
    exportedAt: new Date().toISOString(),
    cutoff: beforeIso,
    count: messages.length,
    messages,
  };
});

/**
 * Deletes messages older than beforeIso and cascades to their parsed
 * entities. Medicines/Contacts/Deals are never touched - a deal or
 * contact created from an archived message remains fully intact.
 */
export const deleteOldMessages = wrapAsync('archiveWhatsApp.deleteOldMessages', async function deleteOldMessages(beforeIso) {
  const deletedMessageIds = await whatsappRepo.deleteMessagesBefore(beforeIso);
  const deletedEntityIds = await parsedEntitiesRepo.deleteBySourceMessageIds(deletedMessageIds);
  return {
    deletedMessages: deletedMessageIds.length,
    deletedEntities: (deletedEntityIds || []).length,
  };
});

/** Safe combined flow: export first, then delete, returning both results. */
export const archiveAndDeleteOldMessages = wrapAsync('archiveWhatsApp.archiveAndDeleteOldMessages', async function archiveAndDeleteOldMessages(beforeIso) {
  const exportResult = await exportOldMessages(beforeIso);
  const deleteResult = await deleteOldMessages(beforeIso);
  return { export: exportResult, delete: deleteResult };
});
