# Changelog

## 14 May 2026 - Station Helper redesign and light-mode polish
- Reworked Station Helper into a compact chat-style panel with conversation bubbles, smaller mobile footprint, clearer Close button and horizontal suggestion chips.
- Fixed question submission and suggestion selection so selected/typed questions immediately show a visible answer in the conversation area.
- Added site-wide preference loader for static pages and admin pages so saved accessibility theme/text choices apply consistently.
- Improved light-mode contrast across public sections, information pages and admin surfaces.


## 2026-05-14 - Station Helper

- Added a floating Station Helper for common listener questions.
- Added guided search-as-you-type suggestions with typo-tolerant matching for listening, stream help, show times, song requests, support links, contact details, accessibility settings, current website information, and common platform questions.
- Added `station-helper-knowledge.json` so answers can be maintained without changing the matching code.
- Added `station-helper.js` using safe DOM rendering and controlled action types for scroll, click, and internal/external links.
- Added `src/css/08-station-helper.css` with a mobile bottom-sheet layout, desktop floating-card layout, light theme support, high contrast support, larger text support, reduced-motion compatibility, and print hiding.
- Updated build and deploy checks so the helper files are included in structure and syntax checks.

## 2026-05-14 - Volume slider playback fix

- Fixed a mobile playback issue where moving the volume slider could interrupt the live stream while the play button still appeared active.
- The audio element now keeps its stream source stable during volume changes instead of reassigning the stream URL.
- The volume control now handles `input` and `change` events without bubbling the gesture into surrounding controls.


## Maintainability and asset polish build

- Added `live-ui.js` so now-playing, programme status, and listener-count rendering are owned by one shared public UI module.
- Reduced overlap between `script.js` and `managed-content.js`; `script.js` now owns playback/metadata polling, while `managed-content.js` owns admin-managed content loading.
- Split public CSS source into `src/css/` partials and added `tools/build-css.js` so future styling changes can be made in smaller files while Netlify still serves one fast `styles.css` bundle.
- Added `tools/check-js-syntax.js` and expanded the `npm run check` command.
- Converted image assets to correct WebP/PNG formats and resized display icons/portraits to reduce transfer size.
- Kept the public homepage and private admin `index.html` files separated in the correct folders.
- Kept `_headers` correctly named for Netlify.
- Preserved the listener-focused homepage, live player, admin editor, private history dashboard, Cloudflare Worker routes, and Netlify Blobs storage setup.

## Production polish build

- Hardened diagnostic endpoints so technical checks require an admin session.
- Removed the built-in backup admin password hash and replaced it with optional `ADMIN_BACKUP_PASSWORD_HASH`.
- Added timeout handling to live status fetches so slow upstream services fail cleanly.
- Added deployment documentation and a post-deploy testing checklist.

## 2026-05-14 - Mobile accessibility layout fix
- Fixed mobile overflow when larger text sizes are selected.
- Changed the header accessibility control from a generic gear to a clearer Aa accessibility control.
- Added an optional light theme in the accessibility settings.
- Improved announcement/banner wrapping on narrow screens.

## 2026-05-14 - Final mobile accessibility and light mode polish

- Locked the Station Helper to a safe independent text scale so the site's largest accessibility text setting no longer causes horizontal clipping.
- Improved mobile helper panel sizing, button wrapping and input layout on narrow screens.
- Added a final light-mode contrast pass for Now Playing, schedule, support, footer and info pages.
- Improved hero text separation in light mode while preserving the station artwork.


## 2026-05-14 final listening/admin reliability pass

- Added Listen Elsewhere popup with managed radio-directory links.
- Added admin controls for showing/hiding external listening links and marking link status.
- Improved repeat-show display so repeat-show filenames are not shown as normal song metadata.
- Reduced playlist-history payload size and removed automatic history polling to save usage.
- Expanded Station Helper answers around listening options, repeat shows, current website dependency and private history.
