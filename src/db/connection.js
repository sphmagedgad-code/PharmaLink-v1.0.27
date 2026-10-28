/**
 * PharmaLink OS - Database Connection
 * Provides a single shared IndexedDB connection for the whole app.
 * Repositories (added in later phases) must call getDatabase() rather
 * than opening their own connections.
 */

import { DB_NAME, DB_VERSION } from '../shared/constants.js';
import { applySchema } from './schema.js';
import { AppError, ERROR_CATEGORY } from '../shared/errorHandler.js';
import { logger } from '../shared/logger.js';

let dbInstance = null;
let openPromise = null;

/**
 * Opens (or returns the already-open) shared IndexedDB connection.
 * Idempotent and safe to call from multiple places concurrently;
 * concurrent callers receive the same in-flight promise.
 */
export function getDatabase() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new AppError('IndexedDB is not supported on this device/browser.', ERROR_CATEGORY.DATABASE));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const upgradeTransaction = request.transaction;
      logger.info('db.connection', `Upgrading database from v${event.oldVersion} to v${event.newVersion}`);
      applySchema(db, upgradeTransaction);
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // If another tab/version deletes or upgrades the DB, drop our
      // handle so the next getDatabase() call re-opens cleanly instead
      // of operating against a stale, closed connection.
      dbInstance.onversionchange = () => {
        logger.warn('db.connection', 'Database version change detected; closing connection.');
        dbInstance.close();
        dbInstance = null;
        openPromise = null;
      };

      dbInstance.onclose = () => {
        dbInstance = null;
        openPromise = null;
      };

      logger.info('db.connection', 'Database connection established.');
      resolve(dbInstance);
    };

    request.onerror = () => {
      openPromise = null;
      reject(
        new AppError(
          `Failed to open database: ${request.error ? request.error.message : 'unknown error'}`,
          ERROR_CATEGORY.DATABASE,
          request.error
        )
      );
    };

    request.onblocked = () => {
      logger.warn('db.connection', 'Database open request blocked by another open connection/tab.');
    };
  });

  return openPromise;
}

/**
 * Explicitly closes the shared connection. Primarily used by
 * backup/restore flows (Phase 3+) that need exclusive DB access.
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    openPromise = null;
  }
}
