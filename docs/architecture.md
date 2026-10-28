# PharmaLink OS - Architecture Reference (Frozen)

## Stack
Vanilla JavaScript ES Modules, IndexedDB, PWA. No frameworks, no UI libraries, no CDN dependencies.

## Frozen field-name contracts
- **Deal**: `id, medicineId, supplierId, quantity, price, status, createdAt` - no buyer-side fields.
- **Supplier**: `id, name, whatsapp, lastPrices` where `lastPrices` is a map keyed by `medicineId`, each entry `{ price, date }`.
- **WhatsApp message**: `id, groupId, text, receivedAt, status` - not `groupName`.
- **Medicine**: `id, name, category`.

## Frozen decisions
- `generateId()` uses `Date.now() + Math.random()`, not `crypto.randomUUID()` (older Android WebView compatibility).
- `completeDeal.js` (Phase 3+) must use raw store operations inside a single `runAtomicTransaction` call, not individual repo calls, and its callback must be synchronous (no `await` inside the transaction callback) to avoid premature auto-commit on the Realme C12.
- All UI screens access data only via repositories - zero direct IndexedDB access from screen code.
- `schemaGuards.js` validates every entity before add/put.
- WhatsApp input is manual paste only; no live integration.
- Supplier sorting is price-based; no AI weighting in v1.
- Out of scope for v1: buyers store, analyticsSnapshots, virtualized lists, automatic follow-up engine, AI-weighted matching.

## Known defects tracked for resolution
- `deals` store `status` index is defined in schema but not yet queried via `IDBIndex` anywhere - decide to use it or remove it before Phase 3 closes.
- `appStore.subscribe()`'s returned `unsubscribe()` must actually be called by any screen that mounts/unmounts repeatedly, once screens exist (Phase 2+).

## Frozen visual design system

Source of truth (uploaded once, never re-derived): `PharmaLink.html` (primary
- mobile shell, fixed header, PWA install banner, toast, drug-card pattern)
and `pharma_search.html` (secondary - contributes the 3-column card body used
at wider viewports). No other visual reference exists or should be assumed.

- **Typography**: Cairo (300/400/600/700/900), RTL-first (`dir="rtl"`).
- **Palette**: `--navy #0D1B4E`, `--royal #1A3B9E`, `--gold #FFD600`,
  `--orange #FF6D00`, `--green #00897B`, `--red #E53935`, `--mist #F4F6FB`,
  `--border #DDE3F0`, `--card rgba(255,255,255,.97)`.
- **Shell**: fixed gradient header (`#hdr`), gold logo-icon box, gold pill nav
  (`.pills`/`.pill`), content padding tracked dynamically via `pad()` since
  the header is fixed, not sticky.
- **Cards**: `.entity-card` (ported from `.dc`) with urgent strip, badge
  (`.badge--deal/buy/sell`), sectioned rows (`.entity-row`, ported from
  `.pr`), price row, action row with a navy/gold call-to-action button.
- **Feedback**: gold pill toast (`.toast`), green install banner, orange
  offline banner - all using the same `.banner` structural pattern.
- There is no light/dark theme toggle in the frozen reference - one fixed
  navy/gold identity applies everywhere. An earlier Phase 1 draft invented a
  light/dark theme system before the reference was attached; it has been
  removed to comply with "do not create your own design system."
- Any new screen must reuse these classes/tokens rather than introducing new
  colors, spacing, or component shapes. Update tokens in `styles.css` only if
  the person supplies a revised reference file.

## Phase log
- **Phase 1 (this phase): Foundation** - bootstrap, routing shell, IndexedDB schema/connection/guards/transaction helper, shared state store, shared utilities, theme/RTL, PWA/service worker, error handling. No feature screens.
