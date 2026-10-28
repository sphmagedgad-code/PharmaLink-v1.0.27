/**
 * PharmaLink OS - App Store
 * Plain in-memory pub/sub state container. No external state library.
 * Feature modules (Phase 2+) read/write slices of this shared state
 * and subscribe to changes to re-render their screens.
 */

import { DEFAULT_LANGUAGE } from '../shared/constants.js';

const state = {
  ui: {
    route: null,
    language: DEFAULT_LANGUAGE,
    isOnline: navigator.onLine,
  },
  medicines: [],
  suppliers: [],
  deals: [],
  whatsappMessages: [],
};

const listeners = new Set();

/**
 * Returns the current state object directly. Callers must treat this
 * as read-only; use setState() to mutate.
 */
export function getState() {
  return state;
}

/**
 * Shallow-merges a partial state patch into the top-level state (or
 * into a named slice) and notifies subscribers.
 * @param {string|object} sliceOrPatch - slice name (e.g. 'ui') or a top-level patch object
 * @param {object} [patch] - patch to merge, required if a slice name was given
 */
export function setState(sliceOrPatch, patch) {
  if (typeof sliceOrPatch === 'string') {
    if (!(sliceOrPatch in state)) {
      throw new Error(`appStore.setState: unknown slice "${sliceOrPatch}"`);
    }
    state[sliceOrPatch] = { ...state[sliceOrPatch], ...patch };
  } else {
    Object.assign(state, sliceOrPatch);
  }
  notify();
}

/**
 * Subscribes a listener to any state change.
 * @param {(state: object) => void} listener
 * @returns {() => void} unsubscribe function
 */
export function subscribe(listener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}
