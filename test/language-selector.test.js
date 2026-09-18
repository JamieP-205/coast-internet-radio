const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("station-config.js", "utf8");

test("language selector offers explicit languages and stays in the same tab", () => {
  assert.match(source, /id = "site-language"/);
  assert.match(source, /\["ga", "Gaeilge"\]/);
  assert.match(source, /\["fr", "Français"\]/);
  assert.match(source, /\["pl", "Polski"\]/);
  assert.match(source, /window\.location\.assign\(translatedUrl\)/);
  assert.doesNotMatch(source, /tl=auto/);
  assert.doesNotMatch(source, /target\s*=\s*["']_blank["']/);
});

test("English returns to the original canonical page", () => {
  assert.match(source, /language === "en"/);
  assert.match(source, /window\.location\.assign\(originalUrl\)/);
});
