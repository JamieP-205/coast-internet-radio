#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules"]);

function findJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findJavaScriptFiles(fullPath);
    return entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

const files = findJavaScriptFiles(root);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    const relativePath = path.relative(root, file);
    console.error(result.stderr || result.stdout || `Syntax check failed: ${relativePath}`);
    process.exit(result.status || 1);
  }
}

console.log(`JavaScript syntax check passed for ${files.length} files.`);
