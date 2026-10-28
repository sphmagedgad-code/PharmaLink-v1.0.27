/**
 * PharmaLink OS - Atomic Transaction Helper
 * Generic, reusable wrapper around IDBTransaction lifecycle.
 *
 * Production risk this exists to prevent:
 * IndexedDB transactions auto-commit as soon as the microtask queue
 * drains with no pending requests. Awaiting a Promise (even
 * Promise.resolve()) inside a transaction callback yields control
 * back to the event loop, which can cause the browser to auto-commit
 * the transaction before subsequent store operations run - especially
 * on low-end devices/older WebView (Realme C12 target) where this
 * timing is tighter. To avoid this class of bug, callbacks passed to
 * runAtomicTransaction must be SYNCHRONOUS and must only issue
 * request-based IDB operations (store.add/put/get/delete/etc). Any
 * async work (parsing, computation, network) must happen BEFORE
 * calling runAtomicTransaction, not inside the callback.
 */

import { AppError, ERROR_CATEGORY } from '../../shared/errorHandler.js';
import { logger } from '../../shared/logger.js';

/**
 * @param {IDBDatabase} db
 * @param {string[]} storeNames - object stores this transaction touches
 * @param {'readonly'|'readwrite'} mode
 * @param {(transaction: IDBTransaction) => void} callback - MUST be synchronous
 * @returns {Promise<void>} resolves when the transaction completes (oncomplete)
 */
export function runAtomicTransaction(db, storeNames, mode, callback) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new AppError('runAtomicTransaction called without an open database connection.', ERROR_CATEGORY.DATABASE));
      return;
    }

    let transaction;
    try {
      transaction = db.transaction(storeNames, mode);
    } catch (err) {
      reject(new AppError(`Failed to open transaction on [${storeNames.join(', ')}]: ${err.message}`, ERROR_CATEGORY.DATABASE, err));
      return;
    }

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      reject(
        new AppError(
          `Transaction on [${storeNames.join(', ')}] failed: ${transaction.error ? transaction.error.message : 'unknown error'}`,
          ERROR_CATEGORY.DATABASE,
          transaction.error
        )
      );
    };

    transaction.onabort = () => {
      reject(
        new AppError(
          `Transaction on [${storeNames.join(', ')}] aborted: ${transaction.error ? transaction.error.message : 'unknown reason'}`,
          ERROR_CATEGORY.DATABASE,
          transaction.error
        )
      );
    };

    try {
      // callback MUST run synchronously to keep the transaction alive.
      callback(transaction);
    } catch (err) {
      logger.error('db.transactions', `Synchronous transaction callback threw: ${err.message}`, err);
      // Let the browser's onabort/onerror handlers settle the promise;
      // re-throwing here would be redundant since the transaction is
      // already in the process of aborting.
    }
  });
}

/**
 * Wraps a single IDBRequest in a Promise. Convenience for simple
 * single-operation reads/writes that don't need the full multi-store
 * atomicity of runAtomicTransaction.
 * @param {IDBRequest} request
 */
export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(
        new AppError(
          request.error ? request.error.message : 'IndexedDB request failed',
          ERROR_CATEGORY.DATABASE,
          request.error
        )
      );
    };
  });
}
