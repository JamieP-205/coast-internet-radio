const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("theme changes keep the hero artwork and crop fixed", () => {
  const hero = read("src/css/01-header-hero.css");
  const darkTheme = read("src/css/09-light-theme.css");
  const accessibility = read("src/css/10-light-theme-accessibility.css");

  assert.match(hero, /jim-hero-studio-light\.webp/);
  assert.match(hero, /\.hero-banner::after[\s\S]*transition: opacity 220ms ease/);
  assert.match(darkTheme, /html\[data-theme="dark"\] \.hero-banner::after \{ opacity: 1; \}/);
  assert.doesNotMatch(darkTheme, /url\(/);
  assert.doesNotMatch(accessibility, /jim-studio-on-air\.jpg/);
});
