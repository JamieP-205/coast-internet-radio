# Testing Checklist

Run these checks after a production deploy.

## Public website

- Open `/` on desktop and mobile.
- Confirm the hero image, logo, footer logo and favicon load.
- Press **Listen Live** and confirm audio starts.
- Pause and resume the player.
- Confirm the volume control changes audio without interrupting the stream.
- Confirm Now Playing, Coming Up Next and Previously Played update from live data.
- Confirm Jim's live-show wording changes correctly during scheduled windows.
- Open **Listen elsewhere** and check the currently enabled links.
- Open the song-request form and check the email/text fallbacks.
- Check the 404 page.

## Accessibility and language

- Open Accessibility on mobile and desktop.
- Check larger text, high contrast, light/dark theme and reduced motion.
- Check that the language selector lists languages and opens the chosen translation in the same tab.
- Return to English and confirm the normal site loads again.

## Station Helper

- Open the Help control on mobile and desktop.
- Confirm the popular questions appear.
- Search for listening, no sound, show times, song requests and accessibility.
- Try a small typo and confirm the closest useful result still appears.
- Check helper actions such as Go to player, Request a song, Show times and Accessibility.
- Confirm the helper still fits with Largest text and High contrast enabled.

## Admin

- Open `/admin/` and sign in.
- Save a small temporary announcement, refresh the homepage, then switch it off again.
- Check the feedback, analytics and play-history screens.
- Download JSON and CSV history exports.
- Confirm logout clears the admin session.

## Technical checks

- Visit `/.netlify/functions/admin-diagnostics` while signed in and confirm required environment variables are present.
- Check `https://coast-metadata.jamieparr05.workers.dev/debug` if Now Playing looks wrong.
- Check the Cloudflare Worker metrics for `coast-stream` and `coast-metadata` if stream or metadata problems appear.
- Run `npm test` locally before a production change when possible.

## Rollback trigger

Rollback if the homepage fails to load, the public player cannot start, the admin cannot save, or live metadata fails across multiple browsers after a cache refresh.
