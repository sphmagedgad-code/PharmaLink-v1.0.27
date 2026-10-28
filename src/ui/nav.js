/**
 * PharmaLink OS - Navigation & Router
 * Renders the primary navigation and drives hash-based routing.
 * Visual behavior (fixed header + dynamic content padding, pill nav,
 * gold toast) is a direct port of #hdr / .pills / #toast / pad() /
 * toast() in PharmaLink.html (frozen visual reference). Feature
 * screens (Phase 2+) are loaded lazily via dynamic import so the
 * Foundation can ship and run before any screen module exists.
 */

import { ROUTES, DEFAULT_ROUTE, LANGUAGES, TEXT_DIRECTION, PREFERENCE_KEYS } from '../shared/constants.js';
import { getState, setState, subscribe } from '../state/appStore.js';
import { logger } from '../shared/logger.js';

const NAV_LABELS = {
  [LANGUAGES.AR]: {
    'nav.dashboard': 'الرئيسية',
    'nav.medicines': 'الأدوية',
    'nav.contacts': 'جهات الاتصال',
    'nav.deals': 'الصفقات',
    'nav.opportunities': 'الفرص',
    'nav.whatsapp': 'واتساب',
    'nav.search': 'بحث',
    'nav.reports': 'التقارير',
    'nav.backup': 'نسخ احتياطي',
    'nav.settings': 'الإعدادات',
  },
  [LANGUAGES.EN]: {
    'nav.dashboard': 'Dashboard',
    'nav.medicines': 'Medicines',
    'nav.contacts': 'Contacts',
    'nav.deals': 'Deals',
    'nav.opportunities': 'Opportunities',
    'nav.whatsapp': 'WhatsApp',
    'nav.search': 'Search',
    'nav.reports': 'Reports',
    'nav.backup': 'Backup',
    'nav.settings': 'Settings',
  },
};

let navMount = null;
let contentMount = null;
let headerEl = null;
let toastEl = null;
let toastTimer = null;

function getRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  const match = ROUTES.find((r) => r.path === raw);
  return match ? match.path : DEFAULT_ROUTE;
}

/**
 * Renders the route list as pills, exactly matching the .pills/.pill
 * treatment used for filters in the frozen reference (gold = active).
 */
function renderNav() {
  const { ui } = getState();
  const labels = NAV_LABELS[ui.language] || NAV_LABELS[LANGUAGES.AR];

  navMount.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'pills';
  list.setAttribute('role', 'navigation');

  for (const route of ROUTES) {
    const link = document.createElement('a');
    link.href = `#/${route.path}`;
    link.className = 'pill';
    link.dataset.route = route.path;
    link.textContent = labels[route.labelKey] || route.labelKey;
    if (route.path === ui.route) {
      link.classList.add('on');
      link.setAttribute('aria-current', 'page');
    }
    list.appendChild(link);
  }

  navMount.appendChild(list);
}

/**
 * Source: pad() in PharmaLink.html. Header is fixed, so content
 * padding-top must track its real rendered height (varies with
 * banners/stats being shown or hidden).
 */
function pad() {
  if (!headerEl || !contentMount) return;
  const height = headerEl.offsetHeight;
  contentMount.style.paddingTop = `${height + 4}px`;
}

/**
 * Source: toast() in PharmaLink.html. Exposed so feature screens
 * (Phase 2+) can import this directly for consistent gold-toast
 * feedback across the app.
 */
export function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600);
}

function renderOfflineBanner() {
  const { ui } = getState();
  let banner = document.getElementById('offline-banner');

  if (!ui.isOnline) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'banner banner--offline on';
      const text = document.createElement('p');
      text.textContent =
        ui.language === LANGUAGES.AR
          ? '📴 أنت غير متصل بالإنترنت — البيانات محفوظة محليًا'
          : '📴 You are offline — data is saved locally';
      banner.appendChild(text);
      headerEl.insertBefore(banner, headerEl.firstChild);
    }
  } else if (banner) {
    banner.remove();
  }
  pad();
}

async function loadRoute(routePath) {
  const route = ROUTES.find((r) => r.path === routePath) || ROUTES.find((r) => r.path === DEFAULT_ROUTE);
  setState('ui', { route: route.path });
  renderNav();

  contentMount.setAttribute('aria-busy', 'true');

  try {
    const module = await import(route.modulePath);
    contentMount.innerHTML = '';
    if (module && typeof module.render === 'function') {
      await module.render(contentMount);
    } else {
      throw new Error(`Module for route "${route.path}" does not export a render(mountEl) function.`);
    }
  } catch (err) {
    const isMissingModule = /Failed to fetch dynamic import|does not export a render/i.test(err.message || '');
    logger.warn('ui.nav', `Route "${route.path}" failed: ${err.message}`, err);
    contentMount.innerHTML = '';
    const notice = document.createElement('div');
    notice.className = 'empty-state';
    const icon = document.createElement('div');
    icon.className = 'empty-state__icon';
    icon.textContent = isMissingModule ? '🛠️' : '⚠️';
    const text = document.createElement('p');
    if (isMissingModule) {
      // Expected during Phase 1/incomplete screens: module genuinely
      // does not exist yet - reuses the same empty-state pattern.
      text.textContent =
        getState().ui.language === LANGUAGES.AR
          ? 'هذه الشاشة لم يتم تفعيلها بعد.'
          : 'This screen has not been implemented yet.';
    } else {
      // TEMPORARY debug visibility: a real render() failure. Shows
      // the actual error instead of masking it, so remaining runtime
      // bugs are visible instead of leaving a silently blank screen.
      text.textContent = `Screen error: ${err.message}`;
    }
    notice.appendChild(icon);
    notice.appendChild(text);
    contentMount.appendChild(notice);
  } finally {
    contentMount.removeAttribute('aria-busy');
    pad();
  }
}

function applyDirection() {
  const { ui } = getState();
  const root = document.documentElement;
  root.setAttribute('lang', ui.language);
  root.setAttribute('dir', TEXT_DIRECTION[ui.language] || 'rtl');
}

/**
 * Initializes navigation, restores saved language preference, wires
 * hash routing and online/offline reactivity, and performs the first
 * route render. Must be called once during app bootstrap.
 */
export function initNav({ headerEl: header, navEl, contentEl, toastEl: toast }) {
  headerEl = header;
  navMount = navEl;
  contentMount = contentEl;
  toastEl = toast;

  const savedLanguage = localStorage.getItem(PREFERENCE_KEYS.LANGUAGE);

  setState('ui', {
    language: Object.values(LANGUAGES).includes(savedLanguage) ? savedLanguage : getState().ui.language,
    isOnline: navigator.onLine,
  });

  subscribe(() => {
    applyDirection();
    renderOfflineBanner();
  });

  applyDirection();
  renderOfflineBanner();

  window.addEventListener('hashchange', () => {
    loadRoute(getRouteFromHash());
  });

  window.addEventListener('online', () => setState('ui', { isOnline: true }));
  window.addEventListener('offline', () => setState('ui', { isOnline: false }));
  window.addEventListener('load', pad);
  window.addEventListener('resize', pad);

  if (!window.location.hash) {
    window.location.hash = `#/${DEFAULT_ROUTE}`;
  }

  loadRoute(getRouteFromHash());
  pad();
}

/**
 * Persists a language preference change to localStorage and applies
 * it immediately. Exposed for the Settings screen (Phase 2+).
 */
export function setLanguage(language) {
  if (!Object.values(LANGUAGES).includes(language)) return;
  localStorage.setItem(PREFERENCE_KEYS.LANGUAGE, language);
  setState('ui', { language });
  renderNav();
  pad();
}
