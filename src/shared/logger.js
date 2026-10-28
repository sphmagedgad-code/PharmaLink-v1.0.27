/**
 * PharmaLink OS - Logger
 * Centralized, leveled logging. All modules must log through this
 * instead of calling console.* directly, so log verbosity and
 * destinations can be controlled from one place.
 */

const LEVELS = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
});

// Production devices (Realme C12) should not be flooded with debug noise.
// Change this single value to raise/lower verbosity app-wide.
const ACTIVE_LEVEL = LEVELS.INFO;

function format(scope, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${scope}]`.concat(' ', message);
}

function debug(scope, message, ...rest) {
  if (ACTIVE_LEVEL <= LEVELS.DEBUG) {
    console.debug(format(scope, message), ...rest);
  }
}

function info(scope, message, ...rest) {
  if (ACTIVE_LEVEL <= LEVELS.INFO) {
    console.info(format(scope, message), ...rest);
  }
}

function warn(scope, message, ...rest) {
  if (ACTIVE_LEVEL <= LEVELS.WARN) {
    console.warn(format(scope, message), ...rest);
  }
}

function error(scope, message, ...rest) {
  if (ACTIVE_LEVEL <= LEVELS.ERROR) {
    console.error(format(scope, message), ...rest);
  }
}

export const logger = Object.freeze({
  debug,
  info,
  warn,
  error,
  LEVELS,
});
