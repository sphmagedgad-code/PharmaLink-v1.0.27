/**
 * PharmaLink OS - Schema Guards (v2)
 * Validates entity shape/types before any IndexedDB add/put.
 * Repositories must call the relevant guard before every write;
 * guards throw AppError(VALIDATION) on failure and never mutate input.
 */

import { AppError, ERROR_CATEGORY } from '../shared/errorHandler.js';
import { DEAL_STATUS, MEDICINE_CATEGORY, PARSED_ENTITY_TYPE, WHATSAPP_MESSAGE_STATUS } from '../shared/constants.js';

function fail(entity, reason) {
  throw new AppError(`Invalid ${entity}: ${reason}`, ERROR_CATEGORY.VALIDATION);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

/** Medicine: { id, name, normalizedName, category, unit? } */
export function validateMedicine(medicine) {
  if (!medicine || typeof medicine !== 'object') fail('medicine', 'must be an object');
  if (!isNonEmptyString(medicine.id)) fail('medicine', 'id is required');
  if (!isNonEmptyString(medicine.name)) fail('medicine', 'name is required');
  if (!isNonEmptyString(medicine.normalizedName)) fail('medicine', 'normalizedName is required');
  if (!isNonEmptyString(medicine.category)) fail('medicine', 'category is required');
  if (!Object.values(MEDICINE_CATEGORY).includes(medicine.category)) {
    fail('medicine', `category must be one of ${Object.values(MEDICINE_CATEGORY).join(', ')}`);
  }
  return true;
}

/**
 * Contact (unified buyer/seller): { id, name, whatsapp, isBuyer,
 * isSeller, governorate?, notes?, lastPrices? }
 */
export function validateContact(contact) {
  if (!contact || typeof contact !== 'object') fail('contact', 'must be an object');
  if (!isNonEmptyString(contact.id)) fail('contact', 'id is required');
  if (!isNonEmptyString(contact.name)) fail('contact', 'name is required');
  if (!isNonEmptyString(contact.whatsapp)) fail('contact', 'whatsapp is required');
  if (typeof contact.isBuyer !== 'boolean') fail('contact', 'isBuyer must be a boolean');
  if (typeof contact.isSeller !== 'boolean') fail('contact', 'isSeller must be a boolean');

  if (contact.lastPrices !== undefined) {
    if (typeof contact.lastPrices !== 'object' || contact.lastPrices === null || Array.isArray(contact.lastPrices)) {
      fail('contact', 'lastPrices must be a map keyed by medicineId');
    }
    for (const [medicineId, entry] of Object.entries(contact.lastPrices)) {
      if (!isNonEmptyString(medicineId)) fail('contact', 'lastPrices key must be a medicineId string');
      if (!entry || typeof entry !== 'object') fail('contact', `lastPrices.${medicineId} must be an object`);
      if (!isPositiveNumber(entry.price)) fail('contact', `lastPrices.${medicineId}.price must be a positive number`);
      if (!isNonEmptyString(entry.date)) fail('contact', `lastPrices.${medicineId}.date is required`);
    }
  }
  return true;
}

/**
 * Deal: { id, medicineId, buyerId, sellerId, quantity, price, status,
 * commissionAmount?, notes?, createdAt }
 */
export function validateDeal(deal) {
  if (!deal || typeof deal !== 'object') fail('deal', 'must be an object');
  if (!isNonEmptyString(deal.id)) fail('deal', 'id is required');
  if (!isNonEmptyString(deal.medicineId)) fail('deal', 'medicineId is required');
  if (!isNonEmptyString(deal.buyerId)) fail('deal', 'buyerId is required');
  if (!isNonEmptyString(deal.sellerId)) fail('deal', 'sellerId is required');
  if (!isPositiveNumber(deal.quantity)) fail('deal', 'quantity must be a positive number');
  if (!isPositiveNumber(deal.price)) fail('deal', 'price must be a positive number');
  if (!Object.values(DEAL_STATUS).includes(deal.status)) {
    fail('deal', `status must be one of ${Object.values(DEAL_STATUS).join(', ')}`);
  }
  if (deal.commissionAmount !== undefined && deal.commissionAmount !== null && !isFiniteNumber(deal.commissionAmount)) {
    fail('deal', 'commissionAmount must be a number when present');
  }
  if (!isNonEmptyString(deal.createdAt)) fail('deal', 'createdAt is required');
  return true;
}

/** WhatsApp message (raw only): { id, groupId, text, receivedAt, status } */
export function validateWhatsAppMessage(message) {
  if (!message || typeof message !== 'object') fail('whatsapp message', 'must be an object');
  if (!isNonEmptyString(message.id)) fail('whatsapp message', 'id is required');
  if (!isNonEmptyString(message.groupId)) fail('whatsapp message', 'groupId is required');
  if (!isNonEmptyString(message.text)) fail('whatsapp message', 'text is required');
  if (!isNonEmptyString(message.receivedAt)) fail('whatsapp message', 'receivedAt is required');
  if (!Object.values(WHATSAPP_MESSAGE_STATUS).includes(message.status)) {
    fail('whatsapp message', `status must be one of ${Object.values(WHATSAPP_MESSAGE_STATUS).join(', ')}`);
  }
  return true;
}

/**
 * Parsed entity: structured data extracted from one WhatsApp message.
 * { id, sourceMessageId, groupId, receivedAt, type, medicineId,
 *   normalizedMedicineName, rawMedicineText, contactId, phone, price?,
 *   quantity?, isUrgent }
 */
export function validateParsedEntity(entity) {
  if (!entity || typeof entity !== 'object') fail('parsed entity', 'must be an object');
  if (!isNonEmptyString(entity.id)) fail('parsed entity', 'id is required');
  if (!isNonEmptyString(entity.sourceMessageId)) fail('parsed entity', 'sourceMessageId is required');
  if (!isNonEmptyString(entity.groupId)) fail('parsed entity', 'groupId is required');
  if (!isNonEmptyString(entity.receivedAt)) fail('parsed entity', 'receivedAt is required');
  if (!Object.values(PARSED_ENTITY_TYPE).includes(entity.type)) {
    fail('parsed entity', `type must be one of ${Object.values(PARSED_ENTITY_TYPE).join(', ')}`);
  }
  if (!isNonEmptyString(entity.medicineId)) fail('parsed entity', 'medicineId is required');
  if (!isNonEmptyString(entity.normalizedMedicineName)) fail('parsed entity', 'normalizedMedicineName is required');
  if (!isNonEmptyString(entity.rawMedicineText)) fail('parsed entity', 'rawMedicineText is required');
  if (!isNonEmptyString(entity.contactId)) fail('parsed entity', 'contactId is required');
  if (!isNonEmptyString(entity.phone)) fail('parsed entity', 'phone is required');
  if (entity.price !== undefined && entity.price !== null && !isPositiveNumber(entity.price)) {
    fail('parsed entity', 'price must be a positive number when present');
  }
  if (entity.quantity !== undefined && entity.quantity !== null && !isPositiveNumber(entity.quantity)) {
    fail('parsed entity', 'quantity must be a positive number when present');
  }
  if (typeof entity.isUrgent !== 'boolean') fail('parsed entity', 'isUrgent must be a boolean');
  return true;
}

/**
 * Search index row: { id, token, entityType, entityId, entityRef,
 * snippet }. `entityRef` = `${entityType}:${entityId}`, used to
 * delete/replace all rows for one entity in one indexed lookup.
 */
export function validateSearchIndexRow(row) {
  if (!row || typeof row !== 'object') fail('search index row', 'must be an object');
  if (!isNonEmptyString(row.id)) fail('search index row', 'id is required');
  if (!isNonEmptyString(row.token)) fail('search index row', 'token is required');
  if (!isNonEmptyString(row.entityType)) fail('search index row', 'entityType is required');
  if (!isNonEmptyString(row.entityId)) fail('search index row', 'entityId is required');
  if (!isNonEmptyString(row.entityRef)) fail('search index row', 'entityRef is required');
  return true;
}
