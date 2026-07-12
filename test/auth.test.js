process.env.SESSION_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { COOKIE_NAME, makeSession, getSession, requireCsrf, verifyPassword, sameOriginOk } = require("../netlify/functions/_auth");

function eventWithCookie(token, extraHeaders = {}) {
  return { headers: { cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}`, ...extraHeaders } };
}

function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

test("sessions round-trip and carry the username and csrf token", () => {
  const { token, payload } = makeSession("editor");
  const session = getSession(eventWithCookie(token));
  assert.ok(session);
  assert.equal(session.payload.u, "editor");
  assert.equal(session.payload.csrf, payload.csrf);
});

test("tampered or unsigned session tokens are rejected", () => {
  const { token } = makeSession("editor");
  const [encoded] = token.split(".");
  assert.equal(getSession(eventWithCookie(`${encoded}.wrong-signature`)), null);
  assert.equal(getSession(eventWithCookie(encoded)), null);
  const forged = Buffer.from(JSON.stringify({ u: "editor", exp: Date.now() + 60000 })).toString("base64url");
  assert.equal(getSession(eventWithCookie(`${forged}.${"a".repeat(43)}`)), null);
});

test("expired sessions are rejected even with a valid signature", () => {
  const { token } = makeSession("editor");
  const session = getSession(eventWithCookie(token));
  session.payload.exp = Date.now() - 1000;
  const encoded = Buffer.from(JSON.stringify(session.payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(encoded).digest("base64url");
  assert.equal(getSession(eventWithCookie(`${encoded}.${signature}`)), null);
});

test("verifyPassword accepts the stored password and nothing else", () => {
  const stored = scryptHash("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
  assert.equal(verifyPassword("correct horse battery staple", "bcrypt$whatever"), false);
  assert.equal(verifyPassword("anything", ""), false);
});

test("requireCsrf only passes the token issued with the session", () => {
  const { payload } = makeSession("editor");
  const session = { payload };
  assert.equal(requireCsrf({ headers: { "x-csrf-token": payload.csrf } }, session), null);
  const rejected = requireCsrf({ headers: { "x-csrf-token": "not-the-token" } }, session);
  assert.equal(rejected.statusCode, 403);
  assert.equal(requireCsrf({ headers: {} }, session).statusCode, 403);
});

test("write requests must come from the site's own origin", () => {
  assert.equal(sameOriginOk({ headers: { origin: "https://coastinternetradio.com", host: "coastinternetradio.com" } }), true);
  assert.equal(sameOriginOk({ headers: { origin: "https://evil.example", host: "coastinternetradio.com" } }), false);
  assert.equal(sameOriginOk({ headers: { origin: "not a url", host: "coastinternetradio.com" } }), false);
  assert.equal(sameOriginOk({ headers: { host: "coastinternetradio.com" } }), true);
});
