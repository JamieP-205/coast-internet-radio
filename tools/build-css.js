#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const parts = [
  "00-base.css",
  "01-header-hero.css",
  "02-player.css",
  "03-content-sections.css",
  "04-footer-info-pages.css",
  "05-overlays-forms.css",
  "06-responsive-print.css",
  "07-now-playing-polish.css",
  "08-station-helper.css",
  "09-light-mode-polish.css",
  "10-final-accessibility-light-fix.css"
];

const root = process.cwd();
const sourceDir = path.join(root, "src", "css");
const output = parts.map((file) => {
  const full = path.join(sourceDir, file);
  if (!fs.existsSync(full)) throw new Error(`Missing CSS partial: ${file}`);
  return fs.readFileSync(full, "utf8").trimEnd();
}).join("\n\n") + "\n";

fs.writeFileSync(path.join(root, "styles.css"), output);
console.log("Built styles.css from src/css partials.");
