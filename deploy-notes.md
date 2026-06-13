# Coast Internet Radio final deploy notes

This ZIP is the final static website package for Netlify deployment.

Included final polish:
- Song request form keeps the text/SMS option: 07935 889228.
- Accessibility/settings panel keeps the compact mobile layout fix.
- PayPal support link is reverted to paypal.me/coastinternetradio because copied PayPal donate token URLs expire.
- Homepage-only sitemap is retained because privacy/terms pages are noindex.
- robots.txt allows news.json so Google can render the page cleanly, while blocking fallback now-playing.json and worker reference files.
- Smaller display versions of the logo and Jim portrait are included to reduce page weight without changing the visible design.

Do not casually change the two Cloudflare Workers:
- coast-stream Worker: keeps the HTTP audio stream playable from the HTTPS website.
- coast-metadata Worker: reads the old Coast page and supplies the live now-playing data.
- News panel now stays visible. If `news.json` is empty, the site shows a compact "No new announcements right now" message instead of hiding the whole section.
