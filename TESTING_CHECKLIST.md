# Testing Checklist

Run these checks after every production deploy.

## Public website

- Open `/` on desktop and mobile.
- Confirm the hero image, logo, footer logos, favicon, and Apple touch icon load.
- Press **Listen Live** and confirm audio starts.
- Pause and resume the player.
- Lock a phone screen or switch app/tab and confirm background playback behaves as expected for that browser.
- Confirm Now Playing, Coming Up Next, and Previously Played update from live data.
- Confirm Jim live-show/repeat/playlist wording changes appropriately during scheduled windows.
- Submit a test song request or verify the email/text fallback links.
- Test Privacy, Terms, and the 404 page.

## Station Helper

- Open the floating Help control on mobile and desktop.
- Confirm popular question buttons appear.
- Type misspelled queries such as `strem not wrking`, `reqest song`, and `jim live` and confirm useful suggestions appear.
- Submit a typed question and confirm the answer renders without layout shift or horizontal scrolling.
- Test helper action buttons such as Listen Live, Request a Song, Schedule, Support, Privacy, and Aa settings.
- Test the helper with Largest text, Light theme, High contrast, and Reduced motion enabled.

## Admin

- Open `/admin/`.
- Sign in.
- Save a small temporary announcement, refresh the homepage, then switch it off again.
- Toggle display settings only long enough to confirm they work, then restore the intended settings.
- Open `/admin/history.html` and confirm the latest snapshot appears.
- Download JSON and CSV history exports.

## Technical checks

- Visit `/.netlify/functions/admin-storage-test` while signed in and confirm storage write/read succeed.
- Visit `/.netlify/functions/admin-diagnostics` while signed in and confirm required environment variables are present.
- Check `https://coast-metadata.jamieparr05.workers.dev/debug` if Now Playing looks wrong.
- Check Cloudflare Worker metrics for `coast-stream`, `coast-metadata`, and `coast-paypal-redirect`.

## Rollback trigger

Rollback if the public player does not start, the homepage fails to load, the admin cannot save, or the live metadata fails across multiple browsers after cache refresh.


## 2026-05-14 final listening/admin reliability pass

- Added Listen Elsewhere popup with managed radio-directory links.
- Added admin controls for showing/hiding external listening links and marking link status.
- Improved repeat-show display so repeat-show filenames are not shown as normal song metadata.
- Reduced playlist-history payload size and removed automatic history polling to save usage.
- Expanded Station Helper answers around listening options, repeat shows, current website dependency and private history.
