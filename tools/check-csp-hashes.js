#!/usr/bin/env node
// The site allows its inline scripts by sha256 hash rather than 'unsafe-inline'.
// Editing an inline script changes its hash, and the browser then silently blocks
// it in production, so this check keeps _headers and the HTML in step.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules"]);
const nonExecutableType = /type\s*=\s*["'](?:application\/(?:ld\+)?json|text\/(?:template|plain))["']/i;
const inlineScript = /<script(?![^>]*\ssrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi;

function findHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(fullPath);
    return entry.name.endsWith(".html") ? [fullPath] : [];
  });
}

function hash(source) {
  return `sha256-${crypto.createHash("sha256").update(source, "utf8").digest("base64")}`;
}

const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
const scriptSrc = headers.match(/script-src\s+[^;]*/i);
if (!scriptSrc) {
  console.error("_headers has no script-src directive to check.");
  process.exit(1);
}
const allowed = new Set(scriptSrc[0].match(/sha256-[A-Za-z0-9+/=]+/g) || []);

const used = new Map();
for (const file of findHtmlFiles(root)) {
  const html = fs.readFileSync(file, "utf8");
  for (const [, attributes, source] of html.matchAll(inlineScript)) {
    if (nonExecutableType.test(attributes)) continue;
    used.set(hash(source), path.relative(root, file));
  }
}

const errors = [];
for (const [digest, file] of used) {
  if (!allowed.has(digest)) {
    errors.push(`${file} has an inline script the CSP would block. Add '${digest}' to script-src in _headers.`);
  }
}
for (const digest of allowed) {
  if (!used.has(digest)) {
    errors.push(`_headers allows '${digest}', which no inline script matches. Remove it.`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`CSP hash check passed for ${used.size} inline scripts.`);
