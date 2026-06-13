# Coast Internet Radio

[![CI](https://github.com/jamieparr05/coast-internet-radio/actions/workflows/ci.yml/badge.svg)](https://github.com/jamieparr05/coast-internet-radio/actions/workflows/ci.yml)

Production website package for Coast Internet Radio.

## Overview

This project is a static Netlify website with Netlify Functions for private admin editing, public managed content, live status, and playlist/listener history. Cloudflare Workers provide the HTTPS stream route and live metadata helper used by the public player.

## Main public files

- `index.html` - public homepage.
- `styles.css` - deployed public stylesheet bundle.
- `src/css/` - editable CSS source partials. Run `npm run build:css` after editing these files.
- `live-ui.js` - shared now-playing, programme-status and listener-count UI helpers.
- `script.js` - live player, metadata polling, accessibility controls, language banner, news fallback, and request form behaviour.
- `managed-content.js` - loads admin-managed homepage content and calls the shared live UI helpers for programme/listener status.
- `station-config.js` - public stream, metadata, contact, social, and support configuration.
- `privacy.html`, `terms.html`, `404.html` - supporting public pages.


## Station Helper

The public site includes a client-side guided helper for common listener questions.

- `station-helper.js` - floating helper UI, search-as-you-type suggestions, safe response rendering, and action buttons.
- `station-helper-knowledge.json` - prepared questions, keywords, accepted phrasing, answers, actions, and related suggestions.
- `src/css/08-station-helper.css` - helper styling for mobile bottom-sheet and desktop floating-card layouts.

The helper runs in the browser, loads its question data from the same Netlify site, and does not require a paid external service. User text is rendered with safe text nodes rather than inserted as HTML.

## Admin area

- `/admin/` - private content editor.
- `/admin/history.html` - private playlist and listener history dashboard.
- `/admin/admin.css` - admin and history dashboard styling.

The admin editor can update announcements, news, display switches, contact links, support link, and small homepage wording. It does not change the stream server, Cloudflare Workers, domains, radio directory listings, or broadcast software.

## Netlify Functions

Runtime functions live in `netlify/functions/`. The key functions are:

- `admin-login.js`, `admin-session.js`, `admin-logout.js` - admin authentication.
- `admin-content.js` - private content read/write.
- `public-content.js` - safe public content read endpoint.
- `public-live-status.js` - listener counts, programme context, metadata snapshot, and history logging.
- `admin-play-history.js` - private history data endpoint.
- `collect-play-history.js` - scheduled history collector.

Diagnostic functions are protected by the same admin session before returning technical information.

## Required Netlify environment variables

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`
- `COAST_BLOBS_SITE_ID`
- `COAST_BLOBS_TOKEN`

Optional:

- `ADMIN_BACKUP_PASSWORD_HASH` - secondary admin password hash, only if a controlled backup login is required.

## Cloudflare Workers

The website expects these existing Workers to remain available:

- `https://coast-stream.jamieparr05.workers.dev/stream`
- `https://coast-metadata.jamieparr05.workers.dev`
- `https://coast-paypal-redirect.jamieparr05.workers.dev/`

Do not change Worker names or URLs unless there is a specific fault being fixed and the website configuration is updated/tested at the same time.

## Development checks

Install dependencies and run the complete validation suite:

```bash
npm ci
npm run check
```

This rebuilds the deployed CSS bundle from `src/css/`, checks the required deploy structure, verifies JavaScript syntax, validates JSON files, and checks local HTML references with exact filename casing.

For local development with Netlify Functions:

```bash
npx netlify dev
```

## Deployment

Deploy the project root to Netlify. The root must contain `index.html`, `netlify.toml`, `_headers`, `assets/`, `admin/`, and `netlify/functions/`.

The scheduled history collector is configured in `netlify.toml`.

## Repository policy

- Production secrets belong in Netlify environment variables and must never be committed.
- Security reports should follow [SECURITY.md](SECURITY.md).
- Small, focused contributions are welcome through the process in [CONTRIBUTING.md](CONTRIBUTING.md).
- The source and station assets remain copyright Jamie Parr and Coast Internet Radio; see [LICENSE](LICENSE).

## 2026-05-14 final listening/admin reliability pass

- Added Listen Elsewhere popup with managed radio-directory links.
- Added admin controls for showing/hiding external listening links and marking link status.
- Improved repeat-show display so repeat-show filenames are not shown as normal song metadata.
- Reduced playlist-history payload size and removed automatic history polling to save usage.
- Expanded Station Helper answers around listening options, repeat shows, current website dependency and private history.
