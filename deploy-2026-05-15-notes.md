# Coast Internet Radio — final validator/polish pass

## What this build is

Tiny validator-cleanup pass on top of the working CLS-fixed deploy.
No behavioural changes. No functional changes. Only:
- W3C HTML validator cleanups
- WAVE alert fix on the announcement link text
- Schema.org RadioStation warning fix (two unrecognised properties removed)
- PRS broken-link fix (logo kept, clickable link removed)

## Admin login

Controlled by Netlify environment variables only. No hard-coded credentials.

## Files changed (2)

### index.html (multiple small edits)

1. Volume slider — removed redundant ARIA attributes that duplicate the
   native input semantics:
   - Removed: aria-valuemin="0", aria-valuemax="100", aria-valuenow="85"
   - Native <input type="range" min="0" max="100" value="85"> provides
     these values to assistive tech automatically.

2. Queue cards — changed from <section> to <div> because they are UI
   cards within the player and do not have their own document-level
   headings:
   - .queue-card#coming-up-row
   - .queue-card#previous-panel

3. Generic divs with aria-label — added role="group" where the labelled
   region is correct, or removed the aria-label where the parent
   already provides the label:
   - .schedule-times -> role="group"
   - .socials -> role="group"
   - .licensed-by -> role="group"
   - .listen-options-list -> aria-label removed (parent modal already
     has aria-labelledby="listen-options-title")

4. Announcement link text — changed from "Click Here For The Original
   Website" to "Visit the original Coast Internet Radio website" for
   better accessibility and link description.

5. Schema.org RadioStation - removed two unrecognised properties that
   Schema.org warns about (Google Rich Results was already passing):
   - broadcastDisplayName
   - broadcaster (Person)
   Other RadioStation properties (name, alternateName, description,
   url, logo, image, areaServed, address, sameAs) retained.

6. PRS logo - removed the clickable <a> wrapper that pointed at
   https://www.prsformusic.com/. PRS blocks automated link checkers and
   the URL was flagged as broken. The PRS logo image is preserved and
   visible. The image now carries proper alt="PRS for Music" text since
   the link's aria-label was the previous source of the accessible name.

### _headers (one hash updated)

The Content Security Policy whitelists inline scripts by sha256 hash.
The JSON-LD schema block was edited, so its hash changed. The CSP entry
for the JSON-LD block is updated accordingly:

  Old: 'sha256-WWhpBawchVb0c0ZlH5xZfemE8fZ+GPZZvNi/z/H+gOI='
  New: 'sha256-3jW/Z0BOy4qmuCm16NjEj+69AZ+ZumpVmDxr906HY0Q='

The pre-paint inline accessibility-preferences script in <head> was not
touched, so its hash is unchanged.

## Files NOT touched
- All Netlify Functions (auth, content, history, diagnostics).
- All Cloudflare Worker reference files.
- Worker URLs in station-config.js, _headers, script.js.
- script.js, live-ui.js, station-helper.js, managed-content.js (since
  the CLS fix), listen-options.js, site-preferences.js.
- station-helper-knowledge.json.
- All CSS partials.
- All images and icons.
- Light-mode hero image setup.
- Admin HTML files, admin.css.
- netlify.toml, package.json, manifest.json, site.webmanifest,
  robots.txt, sitemap.xml.
- privacy.html, terms.html, 404.html.

## Files added (1)
- DEPLOY-2026-05-15-NOTES.md (this file)

## Files removed
- None.

## Verification

```
node tools/build-css.js              PASS
node tools/check-deploy-structure.js PASS
node tools/check-js-syntax.js        PASS
JSON validity (6 files)              PASS
JSON-LD schema parses                PASS
Sitemap XML validity                 PASS
Worker URLs preserved                PASS
No hard-coded credentials            PASS
CSP hash audit                       PASS (5/5 inline scripts whitelisted,
                                            no orphans)
Image references resolve             PASS
Image-edge audit                     PASS (0 problems)
Helper matcher                       PASS (14/14)
Light-mode hero image present        PASS
File count                           83
```

## Item 5 — 1200x630 Open Graph image (NOT done)

You suggested this is optional. I did not create one. A genuinely
good 1200x630 share image needs purposeful typography and the
station's photo at a precise crop — not something to synthesise.
The current 1092x1092 round-logo OG image still works fine; previews
just appear square instead of landscape. Easy to add later when you
commission or supply a designed 1200x630 PNG/JPEG.

## Rollback

If anything visibly breaks: Netlify -> Deploys -> previous deploy ->
"Publish deploy".

The riskiest change here is the CSP hash update. If the live page logs
a CSP error like "Refused to execute inline script because it
violates...", that means the deployed _headers and deployed index.html
fell out of sync. Rollback fixes it; on the next deploy, ensure both
files are deployed together (they are in this zip).

## Manual checks after deploy

1. Homepage loads with no console errors (especially no CSP errors).
2. The yellow announcement banner shows the new "Visit the original
   Coast Internet Radio website" text.
3. PRS logo is still visible in the footer (just no longer clickable).
4. Volume slider still works.
5. Standard checklist: play button works, helper opens, request form
   opens, listen elsewhere opens, admin login works, sitemap loads.
6. Optional: re-run W3C HTML validator — the four validator issues
   should now be gone.
