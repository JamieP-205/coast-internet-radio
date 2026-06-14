# Coast Internet Radio

[![CI](https://github.com/JamieP-205/coast-internet-radio/actions/workflows/ci.yml/badge.svg)](https://github.com/JamieP-205/coast-internet-radio/actions/workflows/ci.yml)

I built and maintain this production website for Coast Internet Radio. The project combines a listener-focused public site with a private content editor, live programme information, first-party analytics, feedback management, and playlist history.

Live site: [coastinternetradio.com](https://coastinternetradio.com/)

## What I Built

- A responsive live-radio player with now-playing, coming-up, and recent-track information
- Programme-aware presentation for live shows, repeats, and automated music
- A private admin area for content, analytics, feedback, and playlist history
- Netlify Functions for authentication, managed content, analytics, feedback, and live status
- Cloudflare Workers that bridge the station's existing stream and metadata services to HTTPS
- A browser-based Station Helper for common listener questions
- Accessibility controls for colour theme, text size, contrast, and reduced motion

## Technical Approach

The public site uses semantic HTML, modular CSS, and vanilla JavaScript. I chose this stack to keep the listener experience fast and dependable without adding a client framework that the project did not need.

Netlify Functions own the server-side work:

- signed admin sessions and password verification
- managed homepage content
- playlist and listener history
- first-party anonymous analytics
- visitor feedback and admin actions
- safe public live-status responses

Netlify Blobs stores the application data. Cloudflare Workers provide HTTPS-compatible routes for the existing radio stream and metadata source.

## Project Structure

- `index.html` - public listener homepage
- `src/css/` - maintainable CSS source files
- `styles.css` - generated production stylesheet
- `script.js` - player, metadata polling, forms, and accessibility behaviour
- `live-ui.js` - shared programme and now-playing rendering
- `managed-content.js` - public managed-content loading
- `station-helper.js` and `station-helper-knowledge.json` - guided listener help
- `admin/` - authenticated content, history, analytics, and feedback screens
- `netlify/functions/` - serverless API and scheduled functions
- `workers-reference/` - source references for the deployed Cloudflare Workers
- `tools/` - build and validation scripts

## Privacy And Security

I designed the analytics system to avoid third-party tracking. It uses allowlisted events, does not store raw IP addresses, and keeps detailed data retention rules in the application logic.

The admin area uses signed `HttpOnly` sessions, same-origin checks, CSRF protection for sensitive actions, environment-based secrets, and protected diagnostic routes. Credentials and production data are never stored in this repository.

## Local Development

```bash
npm ci
npm run check
npx netlify dev
```

`npm run check` rebuilds the CSS bundle, validates the deployment structure, checks JavaScript syntax, validates JSON, and verifies local HTML references with exact filename casing.

## Deployment

The site is deployed from the repository root on Netlify. The production environment requires:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`
- `COAST_BLOBS_SITE_ID`
- `COAST_BLOBS_TOKEN`

`ADMIN_BACKUP_PASSWORD_HASH` is optional and is only used when a controlled secondary login is required.

The Cloudflare Worker URLs are part of the production architecture. I keep their reference implementations in [`workers-reference/`](workers-reference/) so changes can be reviewed and tested alongside the website.

## Further Documentation

- [Changelog](CHANGELOG.md)
- [Testing checklist](TESTING_CHECKLIST.md)
- [Security policy](SECURITY.md)
- [Contribution guidance](CONTRIBUTING.md)

The source code and station assets remain copyright Jamie Parr and Coast Internet Radio. See [LICENSE](LICENSE).
