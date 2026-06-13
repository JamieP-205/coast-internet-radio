# Coast Internet Radio — 2026-05-16 deploy
# Phase 1 final: analytics + history redesign + visitor feedback
# + rollups + recent buffer + shard pruning

## What this build adds
1. First-party anonymous analytics with admin dashboard.
2. Public visitor feedback form with admin review/action console.
3. Redesigned song-history Overview tab.
4. Admin section nav strip across all four admin pages.
5. Privacy policy updated honestly.
6. **Monthly + yearly rollups for long-term trends.**
7. **Recent-event ring buffer (cap 200) for admin debug visibility.**
8. **Automatic shard pruning after daily summary materialisation.**

## Admin login
Unchanged. Env-var only.

Required env vars: ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET (32+ chars), COAST_BLOBS_SITE_ID, COAST_BLOBS_TOKEN.
Optional: ADMIN_BACKUP_PASSWORD_HASH.

Kill switches (new):
- FEATURE_ANALYTICS=off  -> collection function 204s with no writes; admin returns featureEnabled:false.
- FEATURE_FEEDBACK=off   -> public form returns friendly unavailable; no writes.

## Files added (8)
- analytics.js
- feedback.js
- netlify/functions/collect-site-analytics.js
- netlify/functions/admin-site-analytics.js
- netlify/functions/submit-feedback.js
- netlify/functions/admin-feedback.js
- admin/analytics.html
- admin/feedback.html

## Files changed (12)
- index.html, admin/index.html, admin/history.html
- admin/admin.css (~280 lines added)
- script.js (2 CustomEvent dispatches on request submit)
- station-helper.js (3 CustomEvent dispatches for helper intent/no-result)
- src/css/04-footer-info-pages.css (.footer-link-button)
- src/css/10-final-accessibility-light-fix.css (light-mode .footer-link-button)
- _headers (CSP: replaced 1 orphan hash, added 2 new hashes; no other CSP changes)
- privacy.html (analytics + feedback disclosure)
- tools/check-deploy-structure.js (+ 8 new required files)
- robots.txt (+ 3 explicit admin disallow entries)

## Files removed
None.

## Files NOT touched (intentionally)
_auth.js, admin-login.js, admin-session.js, admin-logout.js, admin-content.js,
public-content.js, public-live-status.js, collect-play-history.js,
admin-play-history.js, live-ui.js, managed-content.js, listen-options.js,
station-config.js, site-preferences.js, all Cloudflare Worker files,
all Worker URLs, all images, light-hero setup, netlify.toml, package.json,
sitemap.xml, terms.html, 404.html.

## Data collected
- 23 allowlisted event names with strict per-event field allowlists.
- Aggregated counters in `coast-site-analytics` Blob store via:
    - shard-YYYY-MM-DD-<random>   per-batch raw events (deleted after rollup)
    - summary-YYYY-MM-DD          aggregated counters per day (180 days)
    - rollup-month-YYYY-MM        aggregated counters per month (long-term)
    - rollup-year-YYYY            aggregated counters per year (long-term)
    - recent                      ring buffer of last 200 events (debug)
    - rate-YYYY-MM-DD             salted IP+UA hash buckets (24h)
- Feedback in separate `coast-feedback` Blob store. Plain text only.

## Data NOT collected
- No names, emails, phone numbers, addresses.
- No raw IPs.
- No GPS, no city/postcode.
- No exact UA strings.
- No exact viewport dimensions (only narrow/mobile/tablet/desktop bucket).
- No full referrer URLs.
- No URL query strings or hashes.
- No helper search text, request form text, feedback message text inside analytics.
- No mouse/key/scroll tracking, no heatmaps, no session recording.
- No demographic inference.
- No third-party analytics, no Google Analytics, no cookies.

## Retention policy (final)
| Data                   | Retention             | Pruning mechanism                                                        |
|------------------------|-----------------------|--------------------------------------------------------------------------|
| Shards                 | Until next admin read of the day after | Deleted in getDailySummary() when a completed day is materialised |
| Daily summaries        | 180 days              | Deleted by pruneOldSummaries() only after covering complete monthly rollup exists |
| Monthly rollups        | Long-term             | Never auto-deleted                                                       |
| Yearly rollups         | Long-term             | Never auto-deleted                                                       |
| Recent buffer          | Capped at 200 entries | Oldest entries dropped on each write                                     |
| Rate-limit blobs       | 24 hours              | New day creates fresh blob; old key is unreachable                      |
| Feedback items         | Until admin acts      | Manual archive or delete via admin UI                                    |

## Shard growth bound
- Cap per request: 20 events.
- Cap per (IP+UA hashed) bucket per day: 600 requests.
- Realistic small-station traffic: 50-200 events/day, 5-20 shards/day.
- After day rollover, first admin read materialises a summary blob and
  deletes all shards. Result: shards are bounded to today only.
- Long-term storage after 10 years: ~120 monthly rollups + 10 yearly rollups
  + 180 daily summaries + today's shards = ~310 blobs total.

## Idempotency + correctness
- `getDailySummary` is idempotent: a completed day re-read returns the
  cached summary blob without rebuilding.
- `buildMonthlyRollup` short-circuits only when the existing rollup is
  complete AND daysCovered == daysInMonth. Catches partial early builds.
- `buildYearlyRollup` short-circuits only when the existing rollup is
  complete AND monthsCovered == 12 AND its builtAt is newer than every
  underlying monthly rollup's builtAt. If any monthly is rebuilt later,
  the yearly is automatically rebuilt.
- Pruning of old summaries only happens when a complete covering
  monthly rollup exists. If no rollup exists (e.g. very old data
  predating the analytics system), summaries are preserved.

## Recent buffer
- Written by collect-site-analytics after each shard write.
- Read-modify-write design: under high concurrent load some entries may
  be lost from the buffer, but the shard remains the authoritative
  record. Buffer is debug-only and capped at 200, so storage is bounded.
- Entries contain only {at, name, fields} where fields are already
  allowlist-sanitised. No IP, UA, full referrer, or query string.
- Buffer write failure is swallowed: never affects public site or
  authoritative shard data.

## Privacy / security
- Same headers preserved: HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy.
- CSP: only inline-script hashes updated. No new external hosts. No unsafe-eval.
- Admin pages require existing admin session. Admin feedback POST actions
  require CSRF (X-CSRF-Token) + same-origin check.
- Public collect endpoint rate-limited (600/24h per hashed bucket),
  8 KB body cap, 20-event batch cap, strict allowlist, __proto__ rejection.
- Public feedback endpoint rate-limited (10/24h per hashed bucket),
  4 KB body cap, honeypot, 2s min delay, allowlisted type, HTML strip.
- Admin pages excluded from analytics collection.
- All admin rendering uses textContent only.

## Performance impact
- New JS on public site: analytics.js (~7 KB) + feedback.js (~4 KB), both defer.
- No new render-blocking resources, no new fonts, no new images, no new external connections.
- Feedback modal pre-rendered in HTML (no CLS).
- Analytics emits via sendBeacon + keepalive fetch; never blocks unload.
- Expected Lighthouse: 100/100/100/100 preserved, CLS ~0.001. Re-run after deploy to confirm.

## Tests passed (full gauntlet)
- build-css                                    PASS
- check-deploy-structure                       PASS
- check-js-syntax                              PASS
- node --check on 6 new JS files               PASS
- JSON validity (6 files)                      PASS
- Sitemap XML                                  PASS
- Worker URLs preserved (8 references)         PASS
- No hard-coded credentials                    PASS
- CSP inline-script hashes (7/7)               PASS, no orphans
- Image references resolve                     PASS
- Image-edge audit                             PASS (0 problems)
- Helper matcher                               PASS (14/14)
- Light-mode hero image present                PASS
- Legacy files absent (5/5)                    PASS
- Endpoint test suite                          PASS (65/65)
    Suite A (collect-site-analytics): 7/7
    Suite B (admin-site-analytics basic): 6/6
    Suite C (recent.json ring buffer): 7/7  -- including cap at 200, oldest dropped, no IP/UA
    Suite D (daily summary + shard pruning): 8/8  -- including idempotency
    Suite E (monthly/yearly rollups): 12/12  -- including aggregation, counters-only, partial/complete
    Suite F (180-day pruning): 2/2  -- including safety: no prune without complete monthly rollup
    Suite G (public site safety on store failure): 2/2  -- collect returns 204 even if store throws
    Suite H (FEATURE_ANALYTICS=off): 5/5  -- no writes, admin reports featureEnabled:false
    Suite I (FEATURE_FEEDBACK=off): 3/3  -- friendly unavailable, no writes
    Suite J (submit-feedback): 7/7  -- honeypot, min-delay, HTML-strip, bad-type, empty
    Suite K (admin-feedback): 6/6  -- 401 unauth, CSRF required, bad action rejected

## Manual post-deploy checklist
1. Homepage loads, no CSP errors in browser console.
2. Play button works.
3. Now Playing / Coming Up / Previously Played show as before.
4. Light/dark mode works.
5. Helper opens, searches, closes.
6. Listen Elsewhere opens.
7. Request form opens, submits.
8. Footer "Feedback" link opens the feedback modal.
9. Send a test feedback message; confirm success.
10. Admin login works.
11. Admin nav strip shows all four pages.
12. /admin/history.html: insight tiles, metadata-health, plain-English insights.
13. /admin/analytics.html: page renders. After visits, populates.
14. /admin/feedback.html: page renders. Test message appears.
    Mark-as-read / Archive / Delete work.
15. Re-run Lighthouse on mobile: confirm 100/100/100/100.

## Rollback
Netlify -> Deploys -> previous deploy -> "Publish deploy".
Quick toggles before rolling back: FEATURE_ANALYTICS=off, FEATURE_FEEDBACK=off.

## Status
Production-ready for deploy. All Phase 1 completion patches implemented.
