# PharmaLink OS — Ready 2 Engine Upgrade

Offline-first, Arabic RTL PWA for pharmaceutical brokerage operations. Original screen structure and frozen design system are preserved. This package improves the opportunity matching engine only.

## Matching behavior
- Uses imported WhatsApp parsed buy and sell messages and indexed lookups by medicine.
- Shows buyer/seller phone numbers and offer timestamps.
- Orders priced offers by lowest explicit price, then recency; no-price offers remain visible but cannot be converted to a deal.
- Historical median is displayed only as an estimate when a seller offer has no explicit price; estimates are never treated as confirmed prices.
- Shows a clearly labeled indicative brokerage estimate at 7% of the explicit offer price. This is not realized profit or a guaranteed commission.
- Does not auto-create deals or represent a match as confirmed; user confirmation is required.

## Deploy to GitHub Pages
1. Extract the ZIP contents.
2. Upload all files/folders to the repository root, preserving folder structure.
3. In repository Settings → Pages, select the intended branch and `/ (root)`.
4. Open the published HTTPS URL. Do not open `index.html` via `file://`; ES modules and IndexedDB require HTTP(S).
5. If an older version is cached, close the app and reload the site; the service worker may need one refresh cycle.

## Important limits
This is a local-first app: data stays in that browser's IndexedDB and does not sync automatically between phone and laptop. Import the same WhatsApp exports on each device if you need the same dataset. Prices can only be learned from data actually imported; no external live market-price feed is claimed.
