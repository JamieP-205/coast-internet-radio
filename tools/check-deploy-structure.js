#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const required = [
  "index.html",
  "paypal-redirect.html",
  "paypal-redirect.js",
  "styles.css",
  "live-ui.js",
  "script.js",
  "managed-content.js",
  "station-helper.js",
  "station-helper-knowledge.json",
  "site-preferences.js",
  "station-config.js",
  "netlify.toml",
  "_headers",
  "admin/index.html",
  "admin/history.html",
  "admin/admin.css",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/images/jim-studio-on-air.jpg",
  "assets/images/jim-hero-studio.webp",
  "assets/images/jim-hero-studio-light.webp",
  "assets/images/jim-portrait-500.webp",
  "assets/images/coast-round-logo-192.webp",
  "netlify/functions/_auth.js",
  "netlify/functions/admin-login.js",
  "netlify/functions/admin-content.js",
  "netlify/functions/public-content.js",
  "netlify/functions/public-live-status.js",
  "netlify/functions/collect-play-history.js",
  "netlify/functions/collect-site-analytics.js",
  "netlify/functions/admin-site-analytics.js",
  "netlify/functions/submit-feedback.js",
  "netlify/functions/admin-feedback.js",
  "analytics.js",
  "feedback.js",
  "admin/analytics.html",
  "admin/feedback.html",
  "src/css/00-base.css",
  "src/css/07-now-playing.css",
  "src/css/08-station-helper.css",
  "src/css/09-light-theme.css",
  "tools/build-css.js",
  "tools/check-js-syntax.js"
];

const root = process.cwd();
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));

if (missing.length) {
  console.error("Missing required deploy files:");
  for (const file of missing) console.error("- " + file);
  process.exit(1);
}

console.log("Deploy structure check passed.");
