/**
 * Coast Internet Radio — analytics collection endpoint.
 *
 * Design notes:
 *  - Writes a small batch shard per request (no read-modify-write race).
 *  - Aggregation happens on admin-side reads.
 *  - Allowlist event names AND fields. Drops anything else silently.
 *  - 8 KB body cap, 20 events per batch.
 *  - Salted hashed IP+UA-major rate limit; 24 h retention; no raw IP stored.
 *  - Returns 204 always (success and quiet failure both 204; malformed JSON 400).
 *  - FEATURE_ANALYTICS=off kill switch returns 204 with no writes.
 */
const crypto = require("crypto");
const { siteBlobStore } = require("./_auth");

const STORE = "coast-site-analytics";
const MAX_BODY = 8 * 1024;
const MAX_BATCH = 20;
const MAX_STRING = 200;
const RATE_LIMIT_PER_DAY = 600;
const RECENT_BUFFER_MAX = 200;

// Phase 1 event allowlist with per-event field allowlists + enums.
const ALLOWED_THEMES = ["light", "dark"];
const ALLOWED_VIEWPORTS = ["narrow", "mobile", "tablet", "desktop"];
const ALLOWED_TZ_REGIONS = ["Europe", "America", "Asia", "Africa", "Australia", "Pacific", "Atlantic", "Indian", "Antarctica", "other"];
const ALLOWED_REFERRER_TYPES = ["direct", "internal", "external", "search", "social"];
const ALLOWED_PLAY_STATES = ["paused", "playing", "buffering"];
const ALLOWED_PLAY_ERRORS = ["network", "decode", "autoplay-blocked", "unknown"];
const ALLOWED_DURATION = ["<10s", "10-30s", "30s-1m", "1-3m", "3-10m", "10m+"];
const ALLOWED_QUERY_LEN = ["1-3", "4-10", "11-30", "30+"];
const ALLOWED_RESULT = ["success", "error"];
const ALLOWED_DONATE_LOC = ["hero-banner", "support-panel", "footer", "unknown"];
const ALLOWED_TEXT_SIZE = ["small", "normal", "large", "x-large"];
const ALLOWED_FEEDBACK_ERR = ["network", "server", "rate-limit", "validation", "unknown"];
const ALLOWED_CONSENT = ["yes", "no", "unset"];
const ALLOWED_VISIT_BUCKET = ["1", "2-5", "6-20", "20+"];

const EVENT_SCHEMA = {
  page_view: { path: "string", referrer_type: ALLOWED_REFERRER_TYPES, theme: ALLOWED_THEMES, is_mobile: "boolean" },
  session_start: {
    lang_short: "string",
    viewport_bucket: ALLOWED_VIEWPORTS,
    timezone_region: ALLOWED_TZ_REGIONS,
    consent: ALLOWED_CONSENT,
    visitor_id: "string",
    is_returning: "boolean",
    visit_number_bucket: ALLOWED_VISIT_BUCKET,
    first_seen: "string"
  },
  session_end: { duration_bucket: ALLOWED_DURATION },
  play_click: { state_before: ALLOWED_PLAY_STATES },
  play_success: {},
  play_error: { error_code: ALLOWED_PLAY_ERRORS },
  pause_click: {},
  listen_elsewhere_open: {},
  listen_elsewhere_click: { option_id: "string" },
  helper_open: {},
  helper_intent: { intent_id: "string" },
  helper_no_result: { query_length_bucket: ALLOWED_QUERY_LEN },
  request_form_open: {},
  request_form_submit: { result: ALLOWED_RESULT },
  donate_click: { location: ALLOWED_DONATE_LOC },
  announcement_click: {},
  accessibility_open: {},
  theme_change: { theme: ALLOWED_THEMES },
  text_size_change: { size: ALLOWED_TEXT_SIZE },
  feedback_open: {},
  feedback_submit: {},
  feedback_success: {},
  feedback_error: { error_code: ALLOWED_FEEDBACK_ERR }
};

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SAFE_STRING_PATTERN = /^[A-Za-z0-9._/\- ]{1,200}$/;

function nocontent() {
  return { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };
}

function badRequest() {
  return { statusCode: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify({ ok: false }) };
}

function dateKey(now) {
  return now.toISOString().slice(0, 10);
}

function hourKey(now) {
  return now.toISOString().slice(0, 13).replace(":", "").replace("T", "T");
}

function pickField(value, allowed) {
  if (Array.isArray(allowed)) {
    return typeof value === "string" && allowed.indexOf(value) !== -1 ? value : null;
  }
  if (allowed === "string") {
    if (typeof value !== "string") return null;
    var v = value.slice(0, MAX_STRING);
    return SAFE_STRING_PATTERN.test(v) ? v : null;
  }
  if (allowed === "boolean") {
    return typeof value === "boolean" ? value : null;
  }
  return null;
}

function sanitiseEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  var name = typeof raw.name === "string" ? raw.name.slice(0, 40) : "";
  if (!Object.prototype.hasOwnProperty.call(EVENT_SCHEMA, name)) return null;
  var schema = EVENT_SCHEMA[name];
  var fields = (raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)) ? raw.fields : {};
  var cleaned = Object.create(null);
  Object.keys(schema).forEach(function (key) {
    if (FORBIDDEN_KEYS.has(key)) return;
    if (!Object.prototype.hasOwnProperty.call(fields, key)) return;
    var v = pickField(fields[key], schema[key]);
    if (v !== null) cleaned[key] = v;
  });
  return { name: name, fields: cleaned };
}

function hashRateBucket(ip, ua, salt) {
  var uaMajor = (typeof ua === "string" ? ua : "").slice(0, 40);
  return crypto.createHash("sha256").update(salt + "|" + ip + "|" + uaMajor).digest("base64url").slice(0, 22);
}

async function checkRateLimit(store, ip, ua) {
  var now = new Date();
  var key = "rate-" + dateKey(now);
  var blob;
  try {
    blob = await store.get(key, { type: "json", consistency: "strong" });
  } catch (_) { blob = null; }
  if (!blob || typeof blob !== "object") {
    blob = { v: 1, date: dateKey(now), salt: crypto.randomBytes(16).toString("base64url"), buckets: {} };
  }
  var bucketKey = hashRateBucket(ip, ua, blob.salt);
  var entry = blob.buckets[bucketKey] || { count: 0 };
  if (entry.count >= RATE_LIMIT_PER_DAY) return { ok: false, blob: null, bucketKey: null };
  entry.count += 1;
  blob.buckets[bucketKey] = entry;
  try { await store.setJSON(key, blob); } catch (_) { /* non-fatal */ }
  return { ok: true };
}

exports.handler = async (event) => {
  // Kill switch.
  if (String(process.env.FEATURE_ANALYTICS || "on").toLowerCase() === "off") {
    return nocontent();
  }
  if (event.httpMethod !== "POST") return nocontent();
  if (event.headers && event.headers["content-length"] && Number(event.headers["content-length"]) > MAX_BODY) {
    return nocontent();
  }
  if (!event.body || event.body.length > MAX_BODY) return nocontent();

  var payload;
  try { payload = JSON.parse(event.body); } catch (_) { return badRequest(); }
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.events)) return badRequest();

  // Rate limit (best effort; never blocks on store failure).
  try {
    var ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || event.headers["client-ip"]) || "").toString().split(",")[0].trim() || "0.0.0.0";
    var ua = (event.headers && event.headers["user-agent"]) || "";
    var rateStore = siteBlobStore(STORE);
    var rl = await checkRateLimit(rateStore, ip, ua);
    if (!rl.ok) return nocontent();
  } catch (_) { /* keep going on rate-limit failure */ }

  // Sanitise the batch.
  var cleaned = [];
  for (var i = 0; i < payload.events.length && i < MAX_BATCH; i++) {
    var ev = sanitiseEvent(payload.events[i]);
    if (ev) cleaned.push(ev);
  }
  if (!cleaned.length) return nocontent();

  // Write a single small shard for this batch. No read-modify-write.
  // Admin aggregates shards on read.
  try {
    var store = siteBlobStore(STORE);
    var now = new Date();
    var date = dateKey(now);
    var shardId = crypto.randomBytes(8).toString("base64url");
    var key = "shard-" + date + "-" + shardId;
    await store.setJSON(key, {
      v: 1,
      date: date,
      at: now.toISOString(),
      hour: now.getUTCHours(),
      events: cleaned
    });
  } catch (_) { /* swallow — analytics must never break the public site */ }

  // Update the recent ring buffer (debug only, capped at 200).
  // Read-modify-write: under concurrent load some entries may be lost
  // from the buffer, but the shard above is the authoritative record,
  // and the cap means storage stays bounded. Public site must never
  // be affected by a failure here.
  try {
    var buffStore = siteBlobStore(STORE);
    var nowIso = new Date().toISOString();
    var existing = null;
    try { existing = await buffStore.get("recent", { type: "json", consistency: "strong" }); } catch (_) { existing = null; }
    var arr = (existing && Array.isArray(existing.events)) ? existing.events : [];
    for (var bi = 0; bi < cleaned.length; bi++) {
      // Only safe, already-allowlisted fields. No IP, no UA, no path query/hash.
      arr.push({
        at: nowIso,
        name: cleaned[bi].name,
        fields: cleaned[bi].fields || {}
      });
    }
    if (arr.length > RECENT_BUFFER_MAX) {
      arr = arr.slice(arr.length - RECENT_BUFFER_MAX);
    }
    await buffStore.setJSON("recent", { v: 1, events: arr, updatedAt: nowIso });
  } catch (_) { /* swallow */ }

  return nocontent();
};
