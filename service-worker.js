/**
 * PharmaLink OS - Service Worker
 *
 * Runs in its own global scope and cannot import the app's ES modules
 * (importScripts only loads classic scripts, and ES-module service
 * workers are not reliably supported on older Android WebView, which
 * is the Realme C12 deployment target).
 *
 * Caching strategy: source files (JS/CSS/HTML/manifest) are
 * network-first with cache fallback, so a fixed bug always reaches
 * the browser on the next online visit even if CACHE_VERSION is
 * forgotten in some future release - this was a real, confirmed bug:
 * an earlier cache-first strategy plus a never-bumped CACHE_VERSION
 * meant several source fixes never actually reached deployed
 * browsers, because the same-named cache was never evicted and
 * cache-first never re-checked the network. Only binary/image assets
 * (icons) remain cache-first, since they never change between
 * releases. CACHE_VERSION should still be bumped on every release as
 * defense-in-depth (it also controls the offline-fallback cache
 * eviction), but correctness of source files no longer depends on it.
 */

const CACHE_VERSION = 'v1.0.10-rc1-final-audit-pass';
const CACHE_NAME = `pharmalink-os-${CACHE_VERSION}`;
const FONTS_CACHE_NAME = 'pharmalink-os-fonts-v1';

const PRECACHE_URLS = [
  './index.html',
  './offline.html',
  './manifest.json',
  './src/ui/styles.css',
  './src/ui/nav.js',
  './src/state/appStore.js',
  './src/db/connection.js',
  './src/db/schema.js',
  './src/db/schemaGuards.js',
  './src/db/repositories/transactions.js',
  './src/db/repositories/medicinesRepo.js',
  './src/db/repositories/contactsRepo.js',
  './src/db/repositories/dealsRepo.js',
  './src/db/repositories/whatsappRepo.js',
  './src/db/repositories/parsedEntitiesRepo.js',
  './src/db/repositories/searchIndexRepo.js',
  './src/orchestrators/classifyWhatsAppMessage.js',
  './src/orchestrators/importWhatsAppFile.js',
  './src/orchestrators/matchSupplier.js',
  './src/orchestrators/completeDeal.js',
  './src/orchestrators/findSalesOpportunities.js',
  './src/orchestrators/archiveWhatsApp.js',
  './src/orchestrators/backupRestore.js',
  './src/shared/constants.js',
  './src/shared/logger.js',
  './src/shared/errorHandler.js',
  './src/shared/messageKeywords.js',
  './src/shared/normalize.js',
  './src/shared/searchTokens.js',
  './src/ui/dashboard/dashboard.js',
  './src/ui/medicines/medicines.js',
  './src/ui/contacts/contacts.js',
  './src/ui/deals/deals.js',
  './src/ui/opportunities/opportunities.js',
  './src/ui/whatsapp/whatsapp.js',
  './src/ui/search/search.js',
  './src/ui/reports/reports.js',
  './src/ui/backup/backup.js',
  './src/ui/settings/settings.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME && key !== FONTS_CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  // Cairo font (frozen typography) is served from Google Fonts and
  // requires network on first load; cache it afterward so the RTL
  // typography still renders correctly offline. Mirrors the fonts
  // caching behavior in the frozen reference's own inline SW.
  if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONTS_CACHE_NAME).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
    return;
  }

  // Navigation requests: network-first so users get fresh HTML when
  // online, falling back to cache, then to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./offline.html')))
    );
    return;
  }

  // Source files (JS/CSS/HTML/manifest) change on every release and
  // correctness matters more than the marginal speed gain of
  // cache-first for these - network-first with cache fallback, same
  // pattern as navigation requests above. This is what actually
  // guarantees a fixed bug reaches the browser even if CACHE_VERSION
  // is ever forgotten in a future release; cache-first previously let
  // a stale cached JS file silently outlive any number of source
  // fixes as long as the cache name didn't change.
  const isSourceFile = /\.(js|css|html|json)$/.test(new URL(request.url).pathname);
  if (isSourceFile) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Binary/image assets (icons): these never change between releases,
  // so cache-first is safe and faster on low-end devices.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
