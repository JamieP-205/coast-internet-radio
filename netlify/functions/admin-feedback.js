/**
 * Coast Internet Radio — admin feedback endpoint.
 *
 *  GET: list feedback for ?days=N (default 31, max 180), optional ?type=, ?status=, ?search=.
 *  POST: mutate. Body { id, date, action } where action ∈ mark_read/mark_unread/archive/delete.
 *        Requires CSRF token via X-CSRF-Token header (same as admin-content).
 *
 *  All admin endpoints require the existing admin session.
 */
const { json, requireAdmin, requireCsrf, sameOriginOk, siteBlobStore } = require("./_auth");

const STORE = "coast-feedback";
const ALLOWED_TYPES = ["general", "website", "audio", "song", "accessibility", "other"];
const ALLOWED_STATUS = ["unread", "read", "archived"];
const ALLOWED_ACTIONS = ["mark_read", "mark_unread", "archive", "delete"];

function dateKey(offsetDays) {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function readDay(store, date) {
  try {
    var blob = await store.get("feedback-" + date, { type: "json", consistency: "strong" });
    if (blob && Array.isArray(blob.items)) return { date: date, items: blob.items };
  } catch (_) {}
  return { date: date, items: [] };
}

function matchesFilter(item, type, status, search) {
  if (type && item.type !== type) return false;
  if (status && item.status !== status) return false;
  if (search) {
    var haystack = (item.message + " " + (item.name || "") + " " + (item.type || "")).toLowerCase();
    if (haystack.indexOf(search) === -1) return false;
  }
  return true;
}

function summarise(allItems) {
  var summary = { total: allItems.length, today: 0, unread: 0, byType: { general: 0, website: 0, audio: 0, song: 0, accessibility: 0, other: 0 } };
  var todayKey = dateKey(0);
  allItems.forEach(function (it) {
    if (it.date === todayKey) summary.today += 1;
    if (it.status === "unread") summary.unread += 1;
    if (summary.byType[it.type] !== undefined) summary.byType[it.type] += 1;
  });
  return summary;
}

async function handleGet(event) {
  var params = event.queryStringParameters || {};
  var days = Math.min(Math.max(Number(params.days || 31), 1), 180);
  var typeFilter = ALLOWED_TYPES.indexOf(params.type) !== -1 ? params.type : "";
  var statusFilter = ALLOWED_STATUS.indexOf(params.status) !== -1 ? params.status : "";
  var search = (typeof params.search === "string" ? params.search : "").trim().toLowerCase().slice(0, 80);

  var store = siteBlobStore(STORE);
  var allItems = [];
  for (var offset = 0; offset > -days; offset--) {
    var day = await readDay(store, dateKey(offset));
    allItems = allItems.concat(day.items);
  }
  allItems.sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });

  var summary = summarise(allItems);
  var filtered = allItems.filter(function (it) { return matchesFilter(it, typeFilter, statusFilter, search); });

  return json(200, {
    ok: true,
    days: days,
    summary: summary,
    items: filtered.slice(0, 200),
    retrievedAt: new Date().toISOString()
  });
}

async function handlePost(event, session) {
  if (!sameOriginOk(event)) return json(403, { ok: false, error: "Same-origin check failed." });
  var csrfError = requireCsrf(event, session);
  if (csrfError) return csrfError;

  var payload;
  try { payload = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { ok: false, error: "Bad request." }); }
  var id = typeof payload.id === "string" ? payload.id.slice(0, 40) : "";
  var date = typeof payload.date === "string" ? payload.date.slice(0, 10) : "";
  var action = typeof payload.action === "string" ? payload.action : "";
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || ALLOWED_ACTIONS.indexOf(action) === -1) {
    return json(400, { ok: false, error: "Bad request." });
  }

  var store = siteBlobStore(STORE);
  var key = "feedback-" + date;
  var blob;
  try { blob = await store.get(key, { type: "json", consistency: "strong" }); } catch (_) { blob = null; }
  if (!blob || !Array.isArray(blob.items)) return json(404, { ok: false, error: "Feedback not found." });

  var nextItems = blob.items;
  var found = false;
  if (action === "delete") {
    nextItems = blob.items.filter(function (it) { if (it.id === id) { found = true; return false; } return true; });
  } else {
    nextItems = blob.items.map(function (it) {
      if (it.id !== id) return it;
      found = true;
      if (action === "mark_read") return Object.assign({}, it, { status: "read" });
      if (action === "mark_unread") return Object.assign({}, it, { status: "unread" });
      if (action === "archive") return Object.assign({}, it, { status: "archived" });
      return it;
    });
  }

  if (!found) return json(404, { ok: false, error: "Feedback item not found." });
  try {
    await store.setJSON(key, Object.assign({}, blob, { items: nextItems, updatedAt: new Date().toISOString() }));
  } catch (_) {
    return json(500, { ok: false, error: "Could not save change." });
  }
  return json(200, { ok: true, action: action });
}

exports.handler = async (event) => {
  var auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod === "GET") return handleGet(event);
  if (event.httpMethod === "POST") return handlePost(event, auth.session);
  return json(405, { ok: false, error: "Method not allowed." });
};
