const { json, requireAdmin } = require("./_auth");
const { getStore } = require("@netlify/blobs");

function blobOptions() {
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

function safeEnvReport() {
  return {
    builtIn_SITE_ID: !!process.env.SITE_ID,
    COAST_BLOBS_SITE_ID: !!process.env.COAST_BLOBS_SITE_ID,
    BLOBS_SITE_ID: !!process.env.BLOBS_SITE_ID,
    NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID,
    COAST_BLOBS_TOKEN: !!process.env.COAST_BLOBS_TOKEN,
    BLOBS_TOKEN: !!process.env.BLOBS_TOKEN,
    NETLIFY_BLOBS_TOKEN: !!process.env.NETLIFY_BLOBS_TOKEN,
    NETLIFY_AUTH_TOKEN: !!process.env.NETLIFY_AUTH_TOKEN,
    tokenLength: String(process.env.COAST_BLOBS_TOKEN || process.env.BLOBS_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN || "").length,
    usedExplicitSiteID: !!blobOptions().siteID,
    usedExplicitToken: !!blobOptions().token,
    node: process.version
  };
}

function makeSiteStore() {
  const opts = blobOptions();
  if (opts.siteID && opts.token) {
    return getStore({ name: "coast-site-content", siteID: opts.siteID, token: opts.token });
  }
  return getStore("coast-site-content");
}

async function testStore(label, makeStore) {
  const key = "storage-test";
  const value = { ok: true, label, at: new Date().toISOString() };
  try {
    const store = makeStore();
    await store.setJSON(key, value);
    const readBack = await store.get(key, { type: "json", consistency: "strong" });
    return { label, write: true, read: !!readBack, value: readBack, error: null };
  } catch (error) {
    return {
      label,
      write: false,
      read: false,
      error: String(error && (error.stack || error.message || error) || "unknown").replace(/\s+/g, " ").slice(0, 1200)
    };
  }
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  const results = [];
  results.push(await testStore("site-wide store", makeSiteStore));

  return json(200, {
    ok: true,
    message: "This version passes name, siteID and token in one getStore object. The site-wide store should write and read true.",
    environment: safeEnvReport(),
    results
  });
};
