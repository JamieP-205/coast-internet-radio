#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules"]);
const localReferencePattern = /(?:href|src)=["']([^"'#?]+)["']/gi;
const externalPattern = /^(?:[a-z]+:|\/\/)/i;
const errors = [];

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function exactPathExists(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;

  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    const entries = fs.readdirSync(current);
    if (!entries.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return true;
}

const files = walk(root);

for (const file of files.filter((item) => item.endsWith(".json"))) {
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(root, file)} contains invalid JSON: ${error.message}`);
  }
}

for (const file of files.filter((item) => /\.html?$/i.test(item))) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(localReferencePattern)) {
    const reference = match[1];
    if (externalPattern.test(reference)) continue;

    let target = reference.startsWith("/")
      ? path.join(root, reference.slice(1))
      : path.resolve(path.dirname(file), reference);

    if (reference.endsWith("/")) target = path.join(target, "index.html");
    if (!exactPathExists(target)) {
      errors.push(`${path.relative(root, file)} references missing or case-mismatched file: ${reference}`);
    }
  }
}

const requiredNonEmptyFiles = [
  "index.html",
  "styles.css",
  "station-helper-knowledge.json",
  "netlify.toml",
  "_headers"
];

for (const relativePath of requiredNonEmptyFiles) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
    errors.push(`${relativePath} must exist and must not be empty`);
  }
}

if (errors.length) {
  console.error("Site validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("HTML references, JSON files, and required content passed validation.");
