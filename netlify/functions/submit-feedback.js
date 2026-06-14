/**
 * Coast Internet Radio — public feedback submission endpoint.
 *
 *  - POST JSON only, 4 KB body cap.
 *  - Honeypot field must be empty.
 *  - Minimum submit delay (2 s from page load).
 *  - Per-IP-hash rate limit: 10 submissions / 24 h.
 *  - Strict allowlist on type field.
 *  - Length caps: message 1500, name 80, contact 120, path 120.
 *  - Stores plain text only. Never HTML.
 *  - Returns { ok: true } on success, friendly { ok: false, error } on validation failure.
 *  - FEATURE_FEEDBACK=off kill switch returns a friendly unavailable response.
 */
const crypto = require("crypto");
const { json, siteBlobStore } = require("./_auth");

const STORE = "coast-feedback";
const MAX_BODY = 4 * 1024;
const MIN_DELAY_MS = 2000;
const RATE_LIMIT_PER_DAY = 10;

const ALLOWED_TYPES = ["general", "website", "audio", "song", "accessibility", "other"];
const DEVICE_BUCKETS = ["narrow", "mobile", "tablet", "desktop", "unknown"];

function truncate(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function stripHtml(value) {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function dateKey(now) {
  return now.toISOString().slice(0, 10);
}

function unavailable(reason) {
  return json(200, { ok: false, error: reason || "Feedback is temporarily unavailable. Please try again later or email coastradio@hotmail.com." });
}

function validation(reason) {
  return json(400, { ok: false, error: reason });
}

function randomId() {
  return crypto.randomBytes(8).toString("base64url");
}

function hashRateBucket(ip, ua, salt) {
  var uaMajor = (typeof ua === "string" ? ua : "").slice(0, 40);
  return crypto.createHash("sha256").update(salt + "|" + ip + "|" + uaMajor).digest("base64url").slice(0, 22);
}

async function checkAndRecordRateLimit(store, ip, ua) {
  var now = new Date();
  var key = "feedback-rate-" + dateKey(now);
  var blob;
  try { blob = await store.get(key, { type: "json", consistency: "strong" }); } catch (_) { blob = null; }
  if (!blob || typeof blob !== "object") {
    blob = { v: 1, date: dateKey(now), salt: crypto.randomBytes(16).toString("base64url"), buckets: {} };
  }
  var bucketKey = hashRateBucket(ip, ua, blob.salt);
  var entry = blob.buckets[bucketKey] || { count: 0 };
  if (entry.count >= RATE_LIMIT_PER_DAY) return { ok: false };
  entry.count += 1;
  blob.buckets[bucketKey] = entry;
  try { await store.setJSON(key, blob); } catch (_) {}
  return { ok: true };
}

async function appendItem(store, item) {
  var key = "feedback-" + item.date;
  var existing;
  try { existing = await store.get(key, { type: "json", consistency: "strong" }); } catch (_) { existing = null; }
  var items = (existing && Array.isArray(existing.items)) ? existing.items : [];
  items.push(item);
  await store.setJSON(key, { v: 1, date: item.date, items: items, updatedAt: new Date().toISOString() });
}

exports.handler = async (event) => {
  if (String(process.env.FEATURE_FEEDBACK || "on").toLowerCase() === "off") {
    return unavailable("Feedback is temporarily disabled. Please email coastradio@hotmail.com.");
  }
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed." });
  if (event.headers && event.headers["content-length"] && Number(event.headers["content-length"]) > MAX_BODY) {
    return validation("Message is too long. Please shorten it.");
  }
  if (!event.body || event.body.length > MAX_BODY) return validation("Message is too long. Please shorten it.");

  var payload;
  try { payload = JSON.parse(event.body); } catch (_) { return validation("We could not read that submission. Please try again."); }
  if (!payload || typeof payload !== "object") return validation("We could not read that submission. Please try again.");

  // Honeypot check.
  if (typeof payload.hp === "string" && payload.hp.trim() !== "") {
    // Pretend success so spam bots don't retry.
    return json(200, { ok: true });
  }

  // Minimum delay check.
  var loadedAt = Number(payload.loadedAt) || 0;
  if (loadedAt && (Date.now() - loadedAt) < MIN_DELAY_MS) {
    return validation("Please wait a moment, then try again.");
  }

  // Validate fields.
  var type = typeof payload.type === "string" ? payload.type.toLowerCase().trim() : "";
  if (ALLOWED_TYPES.indexOf(type) === -1) return validation("Please choose a feedback type.");

  var message = stripHtml(truncate(payload.message, 1500));
  if (message.length < 3) return validation("Please write a longer message.");

  var name = stripHtml(truncate(payload.name, 80));
  var contact = stripHtml(truncate(payload.contact, 120));
  var path = truncate(typeof payload.path === "string" ? payload.path.split("?")[0].split("#")[0] : "", 120);
  var device = (typeof payload.device_bucket === "string" && DEVICE_BUCKETS.indexOf(payload.device_bucket) !== -1) ? payload.device_bucket : "unknown";

  // Rate limit.
  var ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || event.headers["client-ip"]) || "").toString().split(",")[0].trim() || "0.0.0.0";
  var ua = (event.headers && event.headers["user-agent"]) || "";
  try {
    var store = siteBlobStore(STORE);
    var rl = await checkAndRecordRateLimit(store, ip, ua);
    if (!rl.ok) return validation("You've sent quite a few messages today. Please try again tomorrow.");
    var now = new Date();
    var item = {
      id: randomId(),
      at: now.toISOString(),
      date: dateKey(now),
      type: type,
      message: message,
      name: name,
      contact: contact,
      path: path,
      device_bucket: device,
      status: "unread"
    };
    await appendItem(store, item);
    return json(200, { ok: true });
  } catch (_) {
    return unavailable();
  }
};
