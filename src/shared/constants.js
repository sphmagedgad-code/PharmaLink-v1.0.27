/**
 * PharmaLink OS - Shared Constants
 * Single source of truth for configuration values used across the app.
 * No module in the codebase should hardcode these values directly.
 *
 * v2: Contacts (unified buyer/seller entity) replaces Suppliers.
 * Deals now reference buyerId + sellerId. New parsedEntities and
 * searchIndex stores support the global search architecture.
 */

export const APP_NAME = 'PharmaLink OS';
export const APP_VERSION = '2.0.0';

/* ---------------------------------------------------------------- */
/* IndexedDB Configuration                                          */
/* ---------------------------------------------------------------- */

export const DB_NAME = 'pharmalink_os_db';
export const DB_VERSION = 2;

export const STORE_NAMES = Object.freeze({
  MEDICINES: 'medicines',
  CONTACTS: 'contacts',
  DEALS: 'deals',
  WHATSAPP_MESSAGES: 'whatsappMessages',
  PARSED_ENTITIES: 'parsedEntities',
  SEARCH_INDEX: 'searchIndex',
});

/* ---------------------------------------------------------------- */
/* Domain Enums                                                     */
/* ---------------------------------------------------------------- */

export const DEAL_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DELIVERED: 'delivered',
  COMMISSION_COLLECTED: 'commission_collected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/** Ordered lifecycle used by the UI to render the "next step" action. */
export const DEAL_STATUS_ORDER = Object.freeze([
  DEAL_STATUS.PENDING,
  DEAL_STATUS.CONFIRMED,
  DEAL_STATUS.DELIVERED,
  DEAL_STATUS.COMMISSION_COLLECTED,
  DEAL_STATUS.COMPLETED,
]);

export const WHATSAPP_MESSAGE_STATUS = Object.freeze({
  UNCLASSIFIED: 'unclassified',
  REQUEST: 'request',
  OFFER: 'offer',
  IGNORED: 'ignored',
});

export const PARSED_ENTITY_TYPE = Object.freeze({
  BUY: 'buy',
  SELL: 'sell',
});

export const MEDICINE_CATEGORY = Object.freeze({
  SHORTAGE: 'shortage',
  HIGH_VALUE: 'high_value',
  CANCER: 'cancer',
  HORMONAL: 'hormonal',
  IMMUNOLOGY: 'immunology',
  GENERAL: 'general',
});

export const SEARCH_ENTITY_TYPE = Object.freeze({
  CONTACT: 'contact',
  MEDICINE: 'medicine',
  DEAL: 'deal',
  PARSED_ENTITY: 'parsedEntity',
  WHATSAPP_MESSAGE: 'whatsappMessage',
});

/* ---------------------------------------------------------------- */
/* Theme & Localization                                             */
/* ---------------------------------------------------------------- */

export const LANGUAGES = Object.freeze({
  AR: 'ar',
  EN: 'en',
});

export const DEFAULT_LANGUAGE = LANGUAGES.AR;

export const TEXT_DIRECTION = Object.freeze({
  [LANGUAGES.AR]: 'rtl',
  [LANGUAGES.EN]: 'ltr',
});

/* ---------------------------------------------------------------- */
/* Storage Keys (localStorage - UI preferences only, never domain    */
/* data, which lives exclusively in IndexedDB)                      */
/* ---------------------------------------------------------------- */

export const PREFERENCE_KEYS = Object.freeze({
  LANGUAGE: 'pharmalink_pref_language',
});

/* ---------------------------------------------------------------- */
/* Navigation Routes                                                */
/* ---------------------------------------------------------------- */

export const ROUTES = Object.freeze([
  { path: 'dashboard', labelKey: 'nav.dashboard', modulePath: '../ui/dashboard/dashboard.js', icon: 'home' },
  { path: 'search', labelKey: 'nav.search', modulePath: '../ui/search/search.js', icon: 'search' },
  { path: 'opportunities', labelKey: 'nav.opportunities', modulePath: '../ui/opportunities/opportunities.js', icon: 'target' },
  { path: 'medicines', labelKey: 'nav.medicines', modulePath: '../ui/medicines/medicines.js', icon: 'pill' },
  { path: 'whatsapp', labelKey: 'nav.whatsapp', modulePath: '../ui/whatsapp/whatsapp.js', icon: 'message' },
  { path: 'contacts', labelKey: 'nav.contacts', modulePath: '../ui/contacts/contacts.js', icon: 'contacts' },
  { path: 'deals', labelKey: 'nav.deals', modulePath: '../ui/deals/deals.js', icon: 'handshake' },
  { path: 'reports', labelKey: 'nav.reports', modulePath: '../ui/reports/reports.js', icon: 'chart' },
  { path: 'backup', labelKey: 'nav.backup', modulePath: '../ui/backup/backup.js', icon: 'backup' },
  { path: 'settings', labelKey: 'nav.settings', modulePath: '../ui/settings/settings.js', icon: 'settings' },
]);

export const DEFAULT_ROUTE = 'dashboard';

/* ---------------------------------------------------------------- */
/* Search                                                           */
/* ---------------------------------------------------------------- */

export const SEARCH_MIN_TOKEN_LENGTH = 2;
export const SEARCH_MAX_TOKENS_PER_MESSAGE = 12;
export const SEARCH_RESULT_LIMIT = 50;

/* ---------------------------------------------------------------- */
/* Bulk Import                                                      */
/* ---------------------------------------------------------------- */

/** Lines per atomic transaction batch during WhatsApp import (keeps
 *  each transaction short-lived on low-end devices). */
export const IMPORT_BATCH_SIZE = 200;
