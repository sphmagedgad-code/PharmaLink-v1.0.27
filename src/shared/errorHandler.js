/**
 * PharmaLink OS - Error Handler
 * Centralized error classification, global capture, and safe wrapping
 * for async operations. All orchestrators/repositories in later phases
 * must throw AppError (or let raw errors pass through wrapAsync) rather
 * than handling errors ad-hoc.
 */

import { logger } from './logger.js';

export const ERROR_CATEGORY = Object.freeze({
  DATABASE: 'database',
  VALIDATION: 'validation',
  NETWORK: 'network',
  UNKNOWN: 'unknown',
});

export class AppError extends Error {
  constructor(message, category = ERROR_CATEGORY.UNKNOWN, cause = null) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.cause = cause;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Wraps an async function so that any thrown error is logged and
 * normalized into an AppError before propagating. Callers still need
 * to catch/handle the rejection; this only guarantees consistent
 * logging and error shape.
 */
export function wrapAsync(scope, fn) {
  return async function wrapped(...args) {
    try {
      return await fn(...args);
    } catch (err) {
      const appError =
        err instanceof AppError
          ? err
          : new AppError(err && err.message ? err.message : String(err), ERROR_CATEGORY.UNKNOWN, err);
      logger.error(scope, appError.message, appError);
      throw appError;
    }
  };
}

let handlersInstalled = false;

/**
 * Installs a single set of global listeners for uncaught errors and
 * unhandled promise rejections. Safe to call multiple times; only
 * attaches once per page/session.
 */
export function installGlobalErrorHandlers() {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    logger.error('global', event.message || 'Uncaught error', event.error || event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason && reason.message ? reason.message : String(reason);
    logger.error('global', `Unhandled promise rejection: ${message}`, reason);
  });
}
