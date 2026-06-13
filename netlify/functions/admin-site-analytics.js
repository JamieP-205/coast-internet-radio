/**
 * Coast Internet Radio — admin analytics read endpoint.
 *
 *  Auth-protected via the existing requireAdmin().
 *  Reads shard or summary blobs for the requested day range, aggregates
 *  in-memory into daily counters + hourly buckets + breakdowns.
 *
 *  Maintenance work performed on each request (best-effort, never blocking):
 *    1. For every COMPLETED day (UTC) that still has shards, build a
 *       summary-YYYY-MM-DD blob and delete the shards (180-day retention).
 *    2. For every COMPLETED prior month with no rollup-YYYY-MM, build one.
 *    3. For the COMPLETED prior year, build rollup-YYYY if missing.
 *    4. Prune summary blobs older than 180 days (the monthly/yearly
 *       rollups still cover them for long-term trends).
 *
 *  Rollups contain only aggregated event counters and breakdowns. No raw
 *  events, no IP hashes, no session identifiers.
 *
 *  GET only. No mutating client actions. CSRF not required.
 */
const { json, requireAdmin, siteBlobStore } = require("./_auth");

const STORE = "coast-site-analytics";
const MIN_SMALL_GROUP = 3;
const SUMMARY_RETENTION_DAYS = 180;
const SCHEMA_VERSION = 1;

// ---------- date helpers ----------

function dateKey(offsetDays) {
  var d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function todayUTC() { return dateKey(0); }

function dateBefore(date, days) {
  var d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function isCompletedMonth(month) {
  return month < todayUTC().slice(0, 7);
}
function isCompletedYear(year) {
  return year < todayUTC().slice(0, 4);
}

// ---------- aggregation primitives ----------

function blankCounters() {
  return {
    events: Object.create(null),
    breakdowns: Object.create(null),
    hourly: Object.create(null)
  };
}

function addEvent(counters, ev) {
  counters.events[ev.name] = (counters.events[ev.name] || 0) + 1;
  Object.keys(ev.fields || {}).forEach(function (k) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") return;
    var key = ev.name + "." + k;
    var value = String(ev.fields[k]);
    if (!counters.breakdowns[key]) counters.breakdowns[key] = Object.create(null);
    counters.breakdowns[key][value] = (counters.breakdowns[key][value] || 0) + 1;
  });
}

function addHourly(counters, name, hour) {
  if (!counters.hourly[name]) counters.hourly[name] = new Array(24).fill(0);
  if (Number.isFinite(hour) && hour >= 0 && hour < 24) counters.hourly[name][hour] += 1;
}

function mergeCounters(into, add) {
  Object.keys(add.events || {}).forEach(function (k) {
    into.events[k] = (into.events[k] || 0) + add.events[k];
  });
  Object.keys(add.breakdowns || {}).forEach(function (k) {
    if (!into.breakdowns[k]) into.breakdowns[k] = Object.create(null);
    Object.keys(add.breakdowns[k]).forEach(function (v) {
      into.breakdowns[k][v] = (into.breakdowns[k][v] || 0) + add.breakdowns[k][v];
    });
  });
  Object.keys(add.hourly || {}).forEach(function (name) {
    if (!into.hourly[name]) into.hourly[name] = new Array(24).fill(0);
    for (var h = 0; h < 24; h++) into.hourly[name][h] += add.hourly[name][h] || 0;
  });
  return into;
}

function maskSmallCounts(map) {
  var out = Object.create(null);
  var otherCount = 0;
  Object.keys(map).forEach(function (k) {
    if (map[k] < MIN_SMALL_GROUP) otherCount += map[k];
    else out[k] = map[k];
  });
  if (otherCount) out["Fewer than 3"] = (out["Fewer than 3"] || 0) + otherCount;
  return out;
}

function maskedBreakdownsByName(breakdowns, sensitiveKeys) {
  var out = Object.create(null);
  Object.keys(breakdowns).forEach(function (k) {
    if (sensitiveKeys.indexOf(k) !== -1) out[k] = maskSmallCounts(breakdowns[k]);
    else out[k] = breakdowns[k];
  });
  return out;
}

// ---------- blob helpers ----------

async function listKeys(store, prefix) {
  try {
    var res = await store.list({ prefix: prefix });
    if (res && Array.isArray(res.blobs)) return res.blobs.map(function (b) { return b.key; });
  } catch (_) {}
  return [];
}

async function safeGet(store, key) {
  try { return await store.get(key, { type: "json", consistency: "strong" }); }
  catch (_) { return null; }
}

async function safeSet(store, key, value) {
  try { await store.setJSON(key, value); return true; }
  catch (_) { return false; }
}

async function safeDelete(store, key) {
  try { await store.delete(key); return true; }
  catch (_) { return false; }
}

// ---------- shard reading + materialisation ----------

async function readShardsFor(store, date) {
  var counters = blankCounters();
  var shardKeys = await listKeys(store, "shard-" + date + "-");
  for (var i = 0; i < shardKeys.length; i++) {
    var blob = await safeGet(store, shardKeys[i]);
    if (!blob || !Array.isArray(blob.events)) continue;
    var hour = Number.isFinite(blob.hour) ? Number(blob.hour) : null;
    for (var j = 0; j < blob.events.length; j++) {
      addEvent(counters, blob.events[j]);
      var name = blob.events[j].name;
      if (name === "page_view" || name === "play_click" || name === "session_start") {
        if (hour !== null) addHourly(counters, name, hour);
      }
    }
  }
  return { counters: counters, shardKeys: shardKeys };
}

/**
 * Materialise a daily summary blob from shards. Idempotent: if a summary
 * already exists AND the day is complete, returns the existing summary
 * unchanged. For today (incomplete), always re-aggregates from shards.
 */
async function getDailySummary(store, date) {
  var summaryKey = "summary-" + date;
  var isComplete = date < todayUTC();
  var existing = await safeGet(store, summaryKey);

  if (existing && existing.v === SCHEMA_VERSION && isComplete) {
    return { counters: existing, source: "summary-blob" };
  }

  var live = await readShardsFor(store, date);

  // Merge any pre-existing summary so we don't lose data on partial runs.
  if (existing && existing.v === SCHEMA_VERSION) {
    mergeCounters(live.counters, {
      events: existing.events || {},
      breakdowns: existing.breakdowns || {},
      hourly: existing.hourly || {}
    });
  }

  if (isComplete) {
    // Persist + prune shards.
    var summary = {
      v: SCHEMA_VERSION,
      date: date,
      events: live.counters.events,
      breakdowns: live.counters.breakdowns,
      hourly: live.counters.hourly,
      builtAt: new Date().toISOString()
    };
    await safeSet(store, summaryKey, summary);
    for (var i = 0; i < live.shardKeys.length; i++) {
      await safeDelete(store, live.shardKeys[i]);
    }
    return { counters: summary, source: "materialised" };
  }

  // Today (incomplete): return aggregated counters but do not persist.
  return { counters: live.counters, source: "live-today" };
}

// ---------- monthly + yearly rollups ----------

async function buildMonthlyRollup(store, month) {
  var rollupKey = "rollup-month-" + month;
  // Compute days-in-month so we can verify a cached rollup is complete.
  var monthStart = new Date(month + "-01T00:00:00Z");
  var nextMonth = new Date(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  var daysInMonth = Math.round((nextMonth - monthStart) / 86400000);
  var existing = await safeGet(store, rollupKey);
  // Short-circuit only if the existing rollup is complete AND covers all
  // days in the month. If daysCovered is wrong (e.g. built early), rebuild
  // to pick up missing days.
  if (existing && existing.v === SCHEMA_VERSION && existing.complete && existing.daysCovered === daysInMonth) {
    return existing;
  }
  var start = new Date(month + "-01T00:00:00Z");
  var monthCounters = blankCounters();
  var daysCovered = 0;
  for (var day = 0; day < 31; day++) {
    var d = new Date(start);
    d.setUTCDate(d.getUTCDate() + day);
    if (d.toISOString().slice(0, 7) !== month) break;
    var date = d.toISOString().slice(0, 10);
    if (date >= todayUTC()) break;
    var dayResult = await getDailySummary(store, date);
    mergeCounters(monthCounters, dayResult.counters);
    daysCovered += 1;
  }
  var rollup = {
    v: SCHEMA_VERSION,
    month: month,
    daysCovered: daysCovered,
    events: monthCounters.events,
    breakdowns: monthCounters.breakdowns,
    hourly: monthCounters.hourly,
    complete: isCompletedMonth(month),
    builtAt: new Date().toISOString()
  };
  await safeSet(store, rollupKey, rollup);
  return rollup;
}

async function buildYearlyRollup(store, year) {
  var rollupKey = "rollup-year-" + year;
  var existing = await safeGet(store, rollupKey);
  // Short-circuit only if the existing rollup is complete, covers all 12
  // months, AND is newer than every underlying monthly rollup. If any
  // monthly has been rebuilt since the yearly was built, the yearly is
  // stale and must be rebuilt.
  if (existing && existing.v === SCHEMA_VERSION && existing.complete && existing.monthsCovered === 12) {
    var stale = false;
    for (var mm = 1; mm <= 12; mm++) {
      var mKey = year + "-" + String(mm).padStart(2, "0");
      var monthly = await safeGet(store, "rollup-month-" + mKey);
      if (!monthly || !monthly.complete) { stale = true; break; }
      if (monthly.builtAt && existing.builtAt && monthly.builtAt > existing.builtAt) { stale = true; break; }
    }
    if (!stale) return existing;
  }
  var yearCounters = blankCounters();
  var monthsCovered = 0;
  for (var m = 1; m <= 12; m++) {
    var month = year + "-" + String(m).padStart(2, "0");
    if (month >= todayUTC().slice(0, 7)) break;
    var monthly2 = await buildMonthlyRollup(store, month);
    if (monthly2 && monthly2.complete) {
      mergeCounters(yearCounters, {
        events: monthly2.events || {},
        breakdowns: monthly2.breakdowns || {},
        hourly: monthly2.hourly || {}
      });
      monthsCovered += 1;
    }
  }
  var rollup = {
    v: SCHEMA_VERSION,
    year: year,
    monthsCovered: monthsCovered,
    events: yearCounters.events,
    breakdowns: yearCounters.breakdowns,
    hourly: yearCounters.hourly,
    complete: isCompletedYear(year),
    builtAt: new Date().toISOString()
  };
  await safeSet(store, rollupKey, rollup);
  return rollup;
}

// ---------- retention pruning ----------

async function pruneOldSummaries(store) {
  var cutoff = dateBefore(todayUTC(), SUMMARY_RETENTION_DAYS);
  var summaryKeys = await listKeys(store, "summary-");
  for (var i = 0; i < summaryKeys.length; i++) {
    var key = summaryKeys[i];
    var date = key.replace(/^summary-/, "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date >= cutoff) continue;
    var month = date.slice(0, 7);
    var rollup = await safeGet(store, "rollup-month-" + month);
    if (rollup && rollup.complete) {
      await safeDelete(store, key);
    }
  }
}

// ---------- recent buffer ----------

async function readRecent(store) {
  var blob = await safeGet(store, "recent");
  if (blob && Array.isArray(blob.events)) return blob.events.slice(-200);
  return [];
}

// ---------- insights ----------

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function busiestHour(arr) {
  if (!Array.isArray(arr) || arr.length !== 24) return null;
  var best = -1; var idx = -1;
  for (var h = 0; h < 24; h++) {
    if (arr[h] > best) { best = arr[h]; idx = h; }
  }
  if (best <= 0) return null;
  return { hour: idx, count: best };
}

function topEntry(map) {
  if (!map) return null;
  var best = null; var bestCount = 0;
  Object.keys(map).forEach(function (k) {
    if (map[k] > bestCount) { best = k; bestCount = map[k]; }
  });
  return best ? { key: best, count: bestCount } : null;
}

function buildInsights(counters, days) {
  var insights = [];
  var ev = counters.events;
  var br = counters.breakdowns;
  var range = days === 1 ? "today" : days === 2 ? "yesterday" : "in the last " + days + " days";

  var visits = ev.page_view || 0;
  var sessions = ev.session_start || 0;
  if (visits > 0) insights.push("In " + range + ", the website had " + visits + " page " + (visits === 1 ? "visit" : "visits") + " across " + sessions + " " + (sessions === 1 ? "session" : "sessions") + ".");
  else insights.push("No analytics data has been collected yet for this period.");

  var playClicks = ev.play_click || 0;
  var playSuccess = ev.play_success || 0;
  var playErrors = ev.play_error || 0;
  if (playClicks > 0) {
    insights.push(playClicks + " " + (playClicks === 1 ? "person pressed" : "people pressed") + " Play and " + playSuccess + " started listening successfully (" + pct(playSuccess, playClicks) + "%).");
    if (playErrors > 0) {
      var topErr = topEntry(br["play_error.error_code"]);
      var topErrLabel = topErr ? topErr.key : "unknown";
      insights.push("There were " + playErrors + " playback " + (playErrors === 1 ? "error" : "errors") + ". Most common reason: " + topErrLabel + ".");
    }
  }

  var helperOpens = ev.helper_open || 0;
  var helperIntents = ev.helper_intent || 0;
  var helperNoResults = ev.helper_no_result || 0;
  if (helperOpens > 0) {
    insights.push("The Station Helper opened " + helperOpens + " " + (helperOpens === 1 ? "time" : "times") + "; " + helperIntents + " " + (helperIntents === 1 ? "question matched" : "questions matched") + " an answer.");
    if (helperNoResults > 0) {
      insights.push(helperNoResults + " helper " + (helperNoResults === 1 ? "search returned" : "searches returned") + " no useful answer. Consider adding more helper content for these.");
    }
  }

  var requestOpens = ev.request_form_open || 0;
  var requestSubmits = ev.request_form_submit || 0;
  if (requestOpens > 0) {
    insights.push("The Request a Song form opened " + requestOpens + " " + (requestOpens === 1 ? "time" : "times") + " and was submitted " + requestSubmits + " " + (requestSubmits === 1 ? "time" : "times") + ".");
  }

  var donateClicks = ev.donate_click || 0;
  if (donateClicks > 0) insights.push("The Support button was clicked " + donateClicks + " " + (donateClicks === 1 ? "time" : "times") + ".");
  else if (visits > 50) insights.push("No support/donate clicks in this period.");

  var viewports = br["session_start.viewport_bucket"];
  if (viewports) {
    var topV = topEntry(viewports);
    if (topV) insights.push("Most visits came from " + topV.key + " devices.");
  }

  var refTypes = br["page_view.referrer_type"];
  if (refTypes) {
    var topR = topEntry(refTypes);
    if (topR) {
      var phrase = topR.key === "direct" ? "directly" : topR.key === "search" ? "through search" : topR.key === "social" ? "from social links" : topR.key === "internal" ? "from another page on the site" : "from external links";
      insights.push("Most visits came " + phrase + ".");
    }
  }

  var bh = busiestHour(counters.hourly && counters.hourly.page_view);
  if (bh) {
    var hour = bh.hour;
    var ampm = hour === 0 ? "midnight" : hour < 12 ? (hour + " am") : hour === 12 ? "noon" : ((hour - 12) + " pm");
    insights.push("The busiest hour was around " + ampm + ".");
  }

  return insights;
}

function buildPossibleIssues(counters) {
  var issues = [];
  var ev = counters.events;
  var playClicks = ev.play_click || 0;
  var playErrors = ev.play_error || 0;
  if (playClicks > 10 && playErrors / playClicks > 0.1) {
    issues.push({ level: "warn", message: "More than 10% of Play attempts failed in this period. Worth checking the stream." });
  }
  var helperOpens = ev.helper_open || 0;
  var helperNoResults = ev.helper_no_result || 0;
  if (helperOpens > 5 && helperNoResults / helperOpens > 0.3) {
    issues.push({ level: "warn", message: "Many helper searches returned no useful answer. Consider adding helper content." });
  }
  var requestOpens = ev.request_form_open || 0;
  var requestSubmits = ev.request_form_submit || 0;
  if (requestOpens >= 5 && requestSubmits / Math.max(requestOpens, 1) < 0.3) {
    issues.push({ level: "info", message: "The Request form opens are higher than submits. Some people open it but don't send it." });
  }
  var feedbackErrors = ev.feedback_error || 0;
  if (feedbackErrors > 0) {
    issues.push({ level: "warn", message: "The feedback form had errors in this period." });
  }
  return issues;
}

// ---------- main handler ----------

exports.handler = async (event) => {
  var killed = String(process.env.FEATURE_ANALYTICS || "on").toLowerCase() === "off";
  var auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  var params = event.queryStringParameters || {};
  var days = Math.min(Math.max(Number(params.days || 7), 1), 366);
  var rangeMode = String(params.range || "").toLowerCase();

  try {
    var store = siteBlobStore(STORE);

    if (killed) {
      return json(200, {
        ok: true,
        featureEnabled: false,
        days: [],
        summary: { events: {}, breakdowns: {}, hourly: {} },
        insights: [],
        issues: [],
        recent: [],
        rollups: { monthly: [], yearly: [] },
        retrievedAt: new Date().toISOString(),
        note: "Analytics collection is currently switched off via FEATURE_ANALYTICS=off."
      });
    }

    var combined = blankCounters();
    var dayResults = [];

    // 1. Aggregate the requested range; materialises completed days.
    for (var offset = 0; offset > -days; offset--) {
      var d = dateKey(offset);
      var dayResult;
      try { dayResult = await getDailySummary(store, d); }
      catch (_) { dayResult = { counters: blankCounters(), source: "error" }; }
      mergeCounters(combined, dayResult.counters);
      dayResults.push({ date: d, source: dayResult.source });
    }

    // 2. Build monthly rollup for the prior month (idempotent).
    var thisMonth = todayUTC().slice(0, 7);
    var prevMonthDate = new Date(thisMonth + "-01T00:00:00Z");
    prevMonthDate.setUTCDate(prevMonthDate.getUTCDate() - 1);
    var prevMonth = prevMonthDate.toISOString().slice(0, 7);
    try { await buildMonthlyRollup(store, prevMonth); } catch (_) {}

    // 3. Build yearly rollup for the prior year (idempotent).
    var thisYear = todayUTC().slice(0, 4);
    var prevYear = String(Number(thisYear) - 1);
    try { await buildYearlyRollup(store, prevYear); } catch (_) {}

    // 4. Prune summaries older than retention (only if covered by complete monthly rollup).
    try { await pruneOldSummaries(store); } catch (_) {}

    // 5. Optional month-scoped aggregation.
    var monthScope = null;
    if (rangeMode === "this-month" || rangeMode === "previous-month") {
      var targetMonth = rangeMode === "this-month" ? thisMonth : prevMonth;
      monthScope = blankCounters();
      var start = new Date(targetMonth + "-01T00:00:00Z");
      for (var dd = 0; dd < 31; dd++) {
        var di = new Date(start);
        di.setUTCDate(di.getUTCDate() + dd);
        if (di.toISOString().slice(0, 7) !== targetMonth) break;
        var dKey = di.toISOString().slice(0, 10);
        if (dKey > todayUTC()) break;
        try { var monthDay = await getDailySummary(store, dKey); mergeCounters(monthScope, monthDay.counters); } catch (_) {}
      }
    }

    var monthlyKeys = await listKeys(store, "rollup-month-");
    var yearlyKeys = await listKeys(store, "rollup-year-");

    var sensitiveKeys = [
      "session_start.timezone_region",
      "session_start.lang_short",
      "page_view.referrer_type"
    ];
    var maskedBreakdowns = maskedBreakdownsByName(combined.breakdowns, sensitiveKeys);

    var recent = await readRecent(store);

    return json(200, {
      ok: true,
      featureEnabled: true,
      schemaVersion: SCHEMA_VERSION,
      retention: {
        dailySummaryDays: SUMMARY_RETENTION_DAYS,
        monthlyRollupRetained: "long-term",
        yearlyRollupRetained: "long-term",
        recentBufferMaxEntries: 200,
        rateLimitBlobHours: 24
      },
      days: dayResults,
      summary: {
        events: combined.events,
        breakdowns: maskedBreakdowns,
        hourly: combined.hourly
      },
      monthScope: monthScope ? {
        mode: rangeMode,
        events: monthScope.events,
        breakdowns: maskedBreakdownsByName(monthScope.breakdowns, sensitiveKeys),
        hourly: monthScope.hourly
      } : null,
      insights: buildInsights(monthScope || combined, days),
      issues: buildPossibleIssues(monthScope || combined),
      recent: recent,
      rollups: {
        monthly: monthlyKeys.map(function (k) { return k.replace(/^rollup-month-/, ""); }).sort(),
        yearly: yearlyKeys.map(function (k) { return k.replace(/^rollup-year-/, ""); }).sort()
      },
      retrievedAt: new Date().toISOString(),
      note: "Anonymous counters only. No names, emails, IP addresses, or typed messages are stored."
    });
  } catch (error) {
    return json(500, { ok: false, error: "Analytics could not be loaded. Try a shorter date range." });
  }
};
