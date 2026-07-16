const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("PayPal handoff keeps the hosted button contract on the Coast origin", () => {
  const html = read("paypal-redirect.html");

  assert.match(html, /<html lang="en-GB" data-theme="light">/);
  assert.match(html, /src="\/site-preferences\.js/);
  assert.match(html, /action="https:\/\/www\.paypal\.com\/cgi-bin\/webscr" method="post"/);
  assert.match(html, /name="hosted_button_id" value="QYFZXU895WSE8"/);
  assert.match(html, /src="\/paypal-redirect\.js/);
  assert.doesNotMatch(html, /<script>(?:.|\n)*submit\(\)(?:.|\n)*<\/script>/);
});

test("legacy support settings migrate to the same-origin handoff page", () => {
  const index = read("index.html");
  const config = read("station-config.js");
  const managed = read("managed-content.js");
  const script = read("script.js");

  assert.match(index, /id="paypal-link"[\s\S]*href="\/paypal-redirect\.html"/);
  assert.match(config, /paypalUrl: "\/paypal-redirect\.html"/);
  assert.match(script, /config\.paypalUrl \|\| "\/paypal-redirect\.html"/);
  assert.match(managed, /LEGACY_PAYPAL_REDIRECT/);
  assert.match(managed, /return "\/paypal-redirect\.html"/);
});
