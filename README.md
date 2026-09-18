# Coast Internet Radio

[![CI](https://github.com/JamieP-205/coast-internet-radio/actions/workflows/ci.yml/badge.svg)](https://github.com/JamieP-205/coast-internet-radio/actions/workflows/ci.yml)

Live at [coastinternetradio.com](https://coastinternetradio.com/).

This is the website I built and maintain for Coast Internet Radio, a small station in Newry run by Jim Parr. It is used by real listeners, so changes have to work on the live site rather than only in a local demo.

## Working with the station

I worked with Jim on the replacement site and still handle the technical side. He tells me what the station and listeners need, I work out how to build it, and we adjust things from real use and feedback.

That has included:

- replacing the older site with a mobile-friendly listener experience
- deciding which content Jim should be able to update himself
- dealing with the station's older HTTP stream on a modern HTTPS website
- deploying and maintaining changes without interrupting normal listening

I am the sole developer in this repository. Jim is the stakeholder and station owner rather than a code contributor.

## Main technical constraint

The station's audio stream and now-playing feed are served over HTTP while the website is HTTPS. Browsers block that mixed content, so the site cannot use those sources directly.

Two Cloudflare Workers sit in front of the station's sources and provide the audio stream and metadata over HTTPS. The site talks to those workers instead. Copies of both Worker scripts are kept in [`workers-reference/`](workers-reference/) for reference.

![Coast Internet Radio architecture](coast-architecture.svg)

## What is in the project

- Live player with current, upcoming and recently played tracks
- Media Session support for phone and lock-screen media controls
- Admin area for homepage content, feedback, analytics and play history
- First-party analytics without storing raw IP addresses
- Station Helper for common listener questions
- Light/dark themes, larger text, high contrast and reduced motion
- Netlify Functions and Netlify Blobs for the server-side parts
- Automated checks for the parts that are easiest to break during changes

The admin screens manage real station data, so they are not linked from the public website. Their code is included in the repository.

## Main files

- `index.html` - public listener page
- `src/css/*.css` - stylesheet source
- `styles.css` - generated CSS bundle
- `script.js` - player, metadata, preferences and request form
- `station-helper.js` and `station-helper-knowledge.json` - listener help
- `netlify/functions/` - admin API, authentication, analytics, feedback and play history
- `workers-reference/` - reference copies of the two Cloudflare Workers
- `admin/` - private admin screens
- `tools/` - build and validation scripts

## Running it locally

```bash
npm ci
npm run check
npx netlify dev
```

`npm test` runs the project checks and unit tests.

## Things to know before editing

- `styles.css` is generated from `src/css/*.css` by `tools/build-css.js`, so the partials are the source of truth.
- Inline scripts are allowed by SHA-256 hashes in `_headers`. `npm run check` verifies those hashes so an edited inline script cannot be silently blocked in production.
- `now-playing.json` is only for local previews and is not used by the live website.
- The public player must use the HTTPS Worker stream rather than the station's HTTP origin.

## Security and privacy

Admin sessions are signed HttpOnly cookies. Passwords are verified against scrypt hashes. State-changing admin requests use a CSRF token and same-origin check, and repeated failed logins are rate limited. Analytics do not store raw IP addresses. Production secrets stay in Netlify environment variables rather than the repository. Reporting information is in [SECURITY.md](SECURITY.md).

## Known limitations

- There are focused automated tests for authentication and site checks, but the admin area does not yet have full end-to-end browser tests.
- Analytics aggregate some data when it is read, which is acceptable for the station's current size but would need revisiting at a much larger scale.
- The live site depends on the two Cloudflare Workers, which are deployed separately from this repository.

Dated changes are in [CHANGELOG.md](CHANGELOG.md), manual release checks are in [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md), and contribution notes are in [CONTRIBUTING.md](CONTRIBUTING.md).
