Coast Internet Radio - Live Display Fix Deploy Pack
==================================================

What this version fixes
-----------------------
1. During Jim Parr's live show times, the Now Playing area changes to a clear live presenter display:
   "Jim Parr is live now".

2. It avoids showing the same live-show information twice in the normal song/artist format.

3. When the live show ends, the page automatically returns to the normal playlist display with song and artist info.

4. The listener-count pill has been tightened for mobile so the dot stays beside the number instead of jumping above it.

5. The audio player uses a real button and tries to keep playback active while the phone screen is locked or the browser is in the background. Browsers still require the listener to press play once; websites cannot force autoplay with sound.

Files
-----
index.html                       Main website page
assets/css/styles.css             Styling and mobile fixes
assets/js/app.js                  Player, now-playing, live-show logic
assets/images/jim-portrait-500.webp  Jim image used on the page
assets/images/favicon.svg         Site icon
functions/api/status.js           Cloudflare Pages function for stream metadata proxy
cloudflare-worker/status-proxy.js Standalone Cloudflare Worker alternative

Recommended deployment
----------------------
Option A: Cloudflare Pages
1. Upload the whole unzipped folder to Cloudflare Pages.
2. Keep the functions/api/status.js file in place.
3. The website will call /api/status for now-playing metadata.

Option B: Static hosting only
1. Upload index.html and the assets folder.
2. The audio player will still work.
3. Now-playing metadata may not update if the browser blocks direct stream-status access because of CORS or mixed-content rules.

Live show schedule
------------------
The schedule is set in assets/js/app.js under COAST_CONFIG.liveSchedule:
- Monday, Tuesday, Thursday & Friday: 10:00am-12:00pm
- Sunday: 10:00am-1:00pm
Timezone: Europe/London

Quick test links
----------------
Add ?forceLive=1 to the page URL to preview the live-show display.
Add ?forceLive=0 to the page URL to preview the normal playlist display.

Important note
--------------
This deploy pack is rebuilt as a clean, complete package from the latest available public station details and the requested display behaviour. If you need it patched into an older exact codebase, upload that older zip and the same fix can be merged into it directly.
