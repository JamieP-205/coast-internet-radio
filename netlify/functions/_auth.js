const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

const COOKIE_NAME = "coast_admin_session";
const SESSION_SECONDS = 90 * 24 * 60 * 60;

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input) {
  const b64 = String(input).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64 + "=".repeat((4 - b64.length % 4) % 4), "base64");
}

function sign(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function makeSession(username) {
  const payload = {
    u: username,
    iat: Date.now(),
    exp: Date.now() + SESSION_SECONDS * 1000,
    csrf: crypto.randomBytes(24).toString("base64url")
  };
  const encoded = base64url(JSON.stringify(payload));
  return { token: `${encoded}.${sign(encoded)}`, payload };
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function getSession(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;

  const [encoded, sig] = token.split(".");
  const expected = sign(encoded);
  const a = Buffer.from(sig || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64url(encoded).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return { token, payload };
}

function requireAdmin(event) {
  const session = getSession(event);
  if (!session) return { error: json(401, { ok: false, error: "Please sign in again." }) };
  return { session };
}

function requireCsrf(event, session) {
  const token = event.headers["x-csrf-token"] || event.headers["X-CSRF-Token"];
  if (!token || token !== session.payload.csrf) {
    return json(403, { ok: false, error: "Security check failed. Refresh the page and try again." });
  }
  return null;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function verifyPassword(password, stored) {
  const [kind, n, r, p, salt64, hash64] = String(stored || "").split("$");
  if (kind !== "scrypt") return false;
  const salt = fromBase64url(salt64);
  const expected = fromBase64url(hash64);
  const actual = crypto.scryptSync(String(password || ""), salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function ipKey(event) {
  const raw = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || event.headers["x-forwarded-for"] || "unknown";
  const ip = String(raw).split(",")[0].trim();
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function checkLoginLimit(event) {
  const opts = netlifyBlobOptions();
  const store = siteBlobStore("coast-admin-rate-limit");
  const key = `login-${ipKey(event)}`;
  const now = Date.now();
  let record = { count: 0, resetAt: now + 15 * 60 * 1000, blockedUntil: 0 };
  try {
    const existing = await store.get(key, { type: "json" });
    if (existing && typeof existing === "object") record = existing;
  } catch {}
  if (record.blockedUntil && now < record.blockedUntil) {
    return { blocked: true, waitSeconds: Math.ceil((record.blockedUntil - now) / 1000), key, store, record };
  }
  if (record.resetAt && now > record.resetAt) {
    record = { count: 0, resetAt: now + 15 * 60 * 1000, blockedUntil: 0 };
  }
  return { blocked: false, key, store, record };
}

async function recordFailedLogin(limit) {
  const now = Date.now();
  const record = limit.record || { count: 0, resetAt: now + 15 * 60 * 1000, blockedUntil: 0 };
  record.count = Number(record.count || 0) + 1;
  record.resetAt = record.resetAt || now + 15 * 60 * 1000;
  if (record.count >= 6) record.blockedUntil = now + 15 * 60 * 1000;
  try { await limit.store.setJSON(limit.key, record); } catch {}
}

async function clearLoginLimit(limit) {
  try { await limit.store.delete(limit.key); } catch {}
}

function sameOriginOk(event) {
  const origin = event.headers.origin || event.headers.Origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = event.headers.host || event.headers.Host;
    return originUrl.host === host;
  } catch {
    return false;
  }
}


const DEFAULT_LISTEN_LINKS = [
  { id: "this-site", label: "This website", description: "Use the main Listen Live player on this updated website.", icon: "", url: "https://coastinternetradio.com/#listen", visible: true, status: "working" },
  { id: "direct-stream", label: "Direct audio stream", description: "Opens the live audio feed directly in your browser or audio player.", icon: "", url: "https://coast-stream.jamieparr05.workers.dev/stream", visible: true, status: "working" },
  { id: "online-radio-box", label: "Online Radio Box", description: "External radio-directory page that is currently playing correctly.", icon: "", url: "https://onlineradiobox.com/uk/coastinternet/", visible: true, status: "working" },
  { id: "current-site", label: "Original website", description: "The current/original Coast Internet Radio website during the review period.", icon: "", url: "https://www.coastinternetradio.co.uk/", visible: true, status: "working" },
  { id: "tunein", label: "TuneIn", description: "Directory link kept in admin, currently hidden until playback is working again.", icon: "", url: "https://tunein.com/radio/coast-internet-Radio-C-I-R-s224937/", visible: false, status: "issue" },
  { id: "radio-uk", label: "Radio UK / eRadio", description: "Directory link kept in admin, currently hidden until playback is working again.", icon: "", url: "https://www.radio-uk.co.uk/coast-internet-radio", visible: false, status: "issue" },
  { id: "mytuner", label: "myTuner", description: "Directory link kept in admin, currently hidden until playback is working again.", icon: "", url: "https://mytuner-radio.com/radio/coast-internet-radio-467601/", visible: false, status: "issue" },
  { id: "streema", label: "Streema", description: "Directory link kept in admin, currently hidden until playback is working again.", icon: "", url: "https://streema.com/radios/Coast_Internet_Radio", visible: false, status: "issue" },
  { id: "radio-garden", label: "Radio Garden", description: "Directory link kept in admin, currently hidden until playback is working again.", icon: "", url: "https://radio.garden/listen/coast-internet-radio/qHxj8c7q", visible: false, status: "issue" },
  { id: "live-online-radio", label: "Live Online Radio", description: "Directory link kept in admin, currently hidden until playback is working again.", icon: "", url: "https://liveonlineradio.net/coast-internet-radio", visible: false, status: "issue" }
];

const DEFAULT_CONTENT = {
  announcement: {
    enabled: false,
    text: "",
    linkLabel: "Listen live",
    linkUrl: "https://coastinternetradio.com"
  },
  news: {
    active: false,
    title: "",
    date: "",
    body: "",
    linkLabel: "Read more",
    link: ""
  },
  contact: {
    requestPhoneDisplay: "07935 889228",
    requestPhoneHref: "sms:+447935889228",
    email: "coastradio@hotmail.com",
    facebookUrl: "https://www.facebook.com/share/1aN1Jtus5Y/",
    xUrl: "https://x.com/coast_radio",
    paypalUrl: "https://coast-paypal-redirect.jamieparr05.workers.dev/",
    tuneInUrl: "https://tunein.com/radio/coast-internet-Radio-C-I-R-s224937/"
  },
  listenLinks: DEFAULT_LISTEN_LINKS,
  listenLinksVersion: 2,
  homepage: {
    playSubtitle: "Country, Irish country & classic hits",
    supportMessage: "Your support keeps the music playing and helps us keep broadcasting."
  },
  stats: {
    showNowPlaying: true,
    showComingUp: true,
    showPrevious: true,
    showListeners: false
  },
  updatedAt: ""
};


function netlifyBlobOptions() {
  const siteID = (
    process.env.COAST_BLOBS_SITE_ID ||
    process.env.BLOBS_SITE_ID ||
    process.env.NETLIFY_SITE_ID ||
    process.env.SITE_ID ||
    ""
  ).trim();

  const token = (
    process.env.COAST_BLOBS_TOKEN ||
    process.env.BLOBS_TOKEN ||
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    ""
  ).trim();

  const opts = {};
  if (siteID) opts.siteID = siteID;
  if (token) opts.token = token;
  return opts;
}

function siteBlobStore(name) {
  const opts = netlifyBlobOptions();
  // IMPORTANT: @netlify/blobs v9 only accepts explicit siteID/token when they are
  // passed in the same object as the store name. Passing getStore(name, opts)
  // ignores opts and causes MissingBlobsEnvironmentError on manual/drop deploys.
  if (opts.siteID && opts.token) {
    return getStore({ name, siteID: opts.siteID, token: opts.token });
  }
  return getStore(name);
}

function siteStore() {
  return siteBlobStore("coast-site-content");
}

function text(value, max = 500) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function url(value, allowed = ["https:", "mailto:", "sms:"]) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return allowed.includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}


function sanitiseListenLinks(input) {
  const byId = new Map();
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const id = text(item.id, 60).toLowerCase();
      if (!id) continue;
      byId.set(id, item);
    }
  }

  const allowedStatus = new Set(["working", "issue", "untested"]);
  return DEFAULT_LISTEN_LINKS.map((fallback) => {
    const src = byId.get(fallback.id) || {};
    const status = text(src.status, 20).toLowerCase();
    return {
      id: fallback.id,
      label: text(src.label, 60) || fallback.label,
      description: text(src.description, 180) || fallback.description,
      icon: "",
      url: url(src.url, ["https:"]) || fallback.url,
      visible: src.visible === undefined ? fallback.visible : !!src.visible,
      status: allowedStatus.has(status) ? status : fallback.status
    };
  });
}

function sanitiseContent(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    announcement: {
      enabled: !!src.announcement?.enabled,
      text: text(src.announcement?.text, 240),
      linkLabel: text(src.announcement?.linkLabel, 40),
      linkUrl: url(src.announcement?.linkUrl, ["https:"])
    },
    news: {
      active: !!src.news?.active,
      title: text(src.news?.title, 120),
      date: text(src.news?.date, 60),
      body: text(src.news?.body, 1000),
      linkLabel: text(src.news?.linkLabel, 50),
      link: url(src.news?.link, ["https:"])
    },
    contact: {
      requestPhoneDisplay: text(src.contact?.requestPhoneDisplay, 40),
      requestPhoneHref: url(src.contact?.requestPhoneHref, ["sms:", "tel:"]),
      email: text(src.contact?.email, 120),
      facebookUrl: url(src.contact?.facebookUrl, ["https:"]),
      xUrl: url(src.contact?.xUrl, ["https:"]),
      paypalUrl: url(src.contact?.paypalUrl, ["https:"]),
      tuneInUrl: url(src.contact?.tuneInUrl, ["https:"])
    },
    listenLinks: sanitiseListenLinks(src.listenLinks),
    listenLinksVersion: 2,
    homepage: {
      playSubtitle: text(src.homepage?.playSubtitle, 90),
      supportMessage: text(src.homepage?.supportMessage, 220)
    },
    stats: {
      showNowPlaying: src.stats?.showNowPlaying === undefined ? true : !!src.stats.showNowPlaying,
      showComingUp: src.stats?.showComingUp === undefined ? true : !!src.stats.showComingUp,
      showPrevious: src.stats?.showPrevious === undefined ? true : !!src.stats.showPrevious,
      showListeners: !!src.stats?.showListeners
    },
    updatedAt: new Date().toISOString()
  };
}

function mergeWithDefaults(saved) {
  const savedVersion = Number(saved?.listenLinksVersion || 0);
  const listenLinks = savedVersion >= 2 ? sanitiseListenLinks(saved?.listenLinks) : DEFAULT_LISTEN_LINKS;
  return sanitiseContent({
    ...DEFAULT_CONTENT,
    ...(saved || {}),
    announcement: { ...DEFAULT_CONTENT.announcement, ...(saved?.announcement || {}) },
    news: { ...DEFAULT_CONTENT.news, ...(saved?.news || {}) },
    contact: { ...DEFAULT_CONTENT.contact, ...(saved?.contact || {}) },
    listenLinks,
    listenLinksVersion: 2,
    homepage: { ...DEFAULT_CONTENT.homepage, ...(saved?.homepage || {}) },
    stats: { ...DEFAULT_CONTENT.stats, ...(saved?.stats || {}) }
  });
}

function shortStorageError(error) {
  return String(error && (error.message || error) || "unknown storage error")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

async function readFromAnyStore() {
  try {
    const saved = await siteStore().get("content", { type: "json", consistency: "strong" });
    if (saved && typeof saved === "object") return saved;
  } catch {}
  return null;
}

async function writeToAnyStore(clean) {
  try {
    await siteStore().setJSON("content", clean);
    return "site store";
  } catch (error) {
    throw new Error(`Netlify storage refused the save. site store: ${shortStorageError(error)}`);
  }
}

async function readContent() {
  const saved = await readFromAnyStore();
  return mergeWithDefaults(saved);
}

async function writeContent(content) {
  const clean = sanitiseContent(content);
  const storageMode = await writeToAnyStore(clean);
  return { ...clean, storageMode };
}

module.exports = {
  COOKIE_NAME,
  json,
  makeSession,
  getSession,
  requireAdmin,
  requireCsrf,
  sessionCookie,
  clearCookie,
  verifyPassword,
  checkLoginLimit,
  recordFailedLogin,
  clearLoginLimit,
  sameOriginOk,
  readContent,
  writeContent,
  siteBlobStore
};
