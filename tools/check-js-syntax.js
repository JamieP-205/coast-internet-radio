#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const files = [
  "live-ui.js",
  "script.js",
  "managed-content.js",
  "station-helper.js",
  "metadata-test.js",
  "netlify/functions/_auth.js",
  "netlify/functions/admin-content.js",
  "netlify/functions/admin-diagnostics.js",
  "netlify/functions/admin-login.js",
  "netlify/functions/admin-logout.js",
  "netlify/functions/admin-play-history.js",
  "netlify/functions/admin-session.js",
  "netlify/functions/admin-storage-test.js",
  "netlify/functions/collect-play-history.js",
  "netlify/functions/metadata-source-finder.js",
  "netlify/functions/public-content.js",
  "netlify/functions/public-live-status.js",
  "netlify/functions/stream-metadata-test.js",
  "tools/build-css.js",
  "tools/check-deploy-structure.js",
  "tools/generate-admin-password-hash.js"
];

for (const file of files) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.error(`Missing JavaScript file: ${file}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, ["--check", full], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `Syntax check failed: ${file}`);
    process.exit(result.status || 1);
  }
}
console.log("JavaScript syntax check passed.");
