/**
 * Coast Internet Radio — public analytics client.
 *
 * Goals:
 *   - Lightweight, privacy-first, no cookies, no fingerprinting.
 *   - Never block, never throw uncaught errors, fail silently.
 *   - Only emit allowlisted events. Server has its own allowlist too.
 *   - sessionStorage marker only; never sent to server, clears on tab close.
 *
 * Loaded with `defer`, runs after DOMContentLoaded.
 */
(function () {
  "use strict";

  var ENDPOINT = "/.netlify/functions/collect-site-analytics";
  var BATCH_MAX = 20;
  var FLUSH_MS = 5000;
  var MAX_STRING = 200;

  // Skip analytics on admin / debug pages entirely.
  if (/^\/admin\/?($|\/)/.test(location.pathname) ||
      /metadata-test|metadata-source-finder/.test(location.pathname)) {
    return;
  }

  var queue = [];
  var flushTimer = null;
  var sessionStartedSent = false;
  var pageViewSent = false;
  var sessionStartedAt = Date.now();

  function truncate(value) {
    if (typeof value !== "string") return value;
    return value.slice(0, MAX_STRING);
  }

  function safeStorage(method, key, value) {
    try {
      if (method === "get") return sessionStorage.getItem(key);
      if (method === "set") return sessionStorage.setItem(key, value);
    } catch (_) { /* private mode, quota etc. */ }
    return null;
  }

  // Persistent storage for consent decision and the (opt-in) visitor UUID.
  // Wrapped so that any storage exception (private mode, quota) does not
  // break analytics or the page.
  function safeLocal(method, key, value) {
    try {
      if (method === "get") return localStorage.getItem(key);
      if (method === "set") { localStorage.setItem(key, value); return value; }
      if (method === "del") { localStorage.removeItem(key); return null; }
    } catch (_) { /* swallow */ }
    return null;
  }

  function getConsent() {
    var c = safeLocal("get", "coast-consent");
    return c === "yes" || c === "no" ? c : null;
  }

  function getOrCreateVisitorId() {
    if (getConsent() !== "yes") return null;
    var id = safeLocal("get", "coast-visitor-id");
    if (id) return id;
    try {
      id = (window.crypto && typeof window.crypto.randomUUID === "function")
        ? window.crypto.randomUUID()
        : ("v-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36));
    } catch (_) { id = "v-" + Date.now().toString(36); }
    safeLocal("set", "coast-visitor-id", id);
    return id;
  }

  function getVisitNumber() {
    if (getConsent() !== "yes") return 0;
    var n = parseInt(safeLocal("get", "coast-visit-count") || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }

  function bumpVisitNumber() {
    if (getConsent() !== "yes") return 0;
    var n = getVisitNumber() + 1;
    safeLocal("set", "coast-visit-count", String(n));
    return n;
  }

  function getFirstSeenDate() {
    if (getConsent() !== "yes") return null;
    var d = safeLocal("get", "coast-first-seen");
    if (!d) {
      d = new Date().toISOString().slice(0, 10);
      safeLocal("set", "coast-first-seen", d);
    }
    return d;
  }

  function detectMobile() {
    try { return matchMedia("(max-width: 720px)").matches; } catch (_) { return false; }
  }

  function viewportBucket() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w < 380) return "narrow";
    if (w < 720) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function languageShort() {
    try {
      var lang = (navigator.language || "en").toLowerCase().split("-")[0];
      return /^[a-z]{2}$/.test(lang) ? lang : "other";
    } catch (_) { return "other"; }
  }

  function timezoneRegion() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      var region = tz.split("/")[0];
      if (["Europe", "America", "Asia", "Africa", "Australia", "Pacific", "Atlantic", "Indian", "Antarctica"].indexOf(region) !== -1) {
        return region;
      }
      return "other";
    } catch (_) { return "other"; }
  }

  function referrerType() {
    try {
      var ref = document.referrer || "";
      if (!ref) return "direct";
      var refHost = new URL(ref).hostname.toLowerCase();
      if (refHost === location.hostname) return "internal";
      if (/\b(google|bing|duckduckgo|yahoo|ecosia|qwant|brave)\./.test(refHost)) return "search";
      if (/\b(facebook|twitter|x\.com|linkedin|reddit|t\.co|instagram|tiktok|youtube)\./.test(refHost)) return "social";
      return "external";
    } catch (_) { return "direct"; }
  }

  function pathOnly() {
    try {
      // No query string, no hash, length-capped.
      return truncate(location.pathname || "/");
    } catch (_) { return "/"; }
  }

  function currentTheme() {
    try {
      var t = document.documentElement.getAttribute("data-theme") || "dark";
      return t === "light" ? "light" : "dark";
    } catch (_) { return "dark"; }
  }

  function durationBucket(ms) {
    if (ms < 10000) return "<10s";
    if (ms < 30000) return "10-30s";
    if (ms < 60000) return "30s-1m";
    if (ms < 3 * 60000) return "1-3m";
    if (ms < 10 * 60000) return "3-10m";
    return "10m+";
  }

  // -- Queue + flush --------------------------------------------------------

  function track(name, fields) {
    try {
      if (!name || typeof name !== "string") return;
      var event = { name: truncate(name), at: new Date().toISOString() };
      if (fields && typeof fields === "object") {
        var cleaned = {};
        Object.keys(fields).forEach(function (k) {
          if (k === "__proto__" || k === "constructor" || k === "prototype") return;
          var v = fields[k];
          if (typeof v === "string") cleaned[k] = truncate(v);
          else if (typeof v === "number" || typeof v === "boolean") cleaned[k] = v;
          // skip other types
        });
        event.fields = cleaned;
      }
      queue.push(event);
      if (queue.length >= BATCH_MAX) flush();
      else scheduleFlush();
    } catch (_) { /* swallow */ }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function flush(reason) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return;
    var batch = queue.splice(0, BATCH_MAX);
    var body = JSON.stringify({ v: 1, events: batch });
    try {
      if (reason === "unload" && navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(ENDPOINT, blob);
        return;
      }
      // Use keepalive so the request survives page unload.
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit",
        mode: "same-origin"
      }).catch(function () { /* silent */ });
    } catch (_) { /* silent */ }
  }

  // -- Event emission -------------------------------------------------------

  function emitSessionStart() {
    if (sessionStartedSent) return;
    sessionStartedSent = true;
    var alreadyThisTab = safeStorage("get", "coast-analytics-session");
    if (alreadyThisTab) return; // counted earlier in this tab
    safeStorage("set", "coast-analytics-session", String(Date.now()));
    var fields = {
      lang_short: languageShort(),
      viewport_bucket: viewportBucket(),
      timezone_region: timezoneRegion(),
      consent: getConsent() || "unset"
    };
    // Extra fields only when the visitor has explicitly opted in.
    if (getConsent() === "yes") {
      var vid = getOrCreateVisitorId();
      if (vid) fields.visitor_id = vid;
      var visitNumber = bumpVisitNumber();
      fields.is_returning = visitNumber > 1;
      fields.visit_number_bucket = visitNumber === 1 ? "1" : visitNumber <= 5 ? "2-5" : visitNumber <= 20 ? "6-20" : "20+";
      var firstSeen = getFirstSeenDate();
      if (firstSeen) fields.first_seen = firstSeen;
    }
    track("session_start", fields);
  }

  function emitPageView() {
    if (pageViewSent) return;
    pageViewSent = true;
    track("page_view", {
      path: pathOnly(),
      referrer_type: referrerType(),
      theme: currentTheme(),
      is_mobile: detectMobile()
    });
  }

  function emitSessionEnd() {
    var ms = Date.now() - sessionStartedAt;
    if (ms < 3000) return;
    track("session_end", { duration_bucket: durationBucket(ms) });
    flush("unload");
  }

  // -- Bindings to existing site UI -----------------------------------------

  function on(selector, evType, handler) {
    document.addEventListener(evType, function (ev) {
      var target = ev.target;
      while (target && target !== document) {
        if (target.matches && target.matches(selector)) {
          handler(ev, target);
          return;
        }
        target = target.parentNode;
      }
    }, true);
  }

  function bindPlayer() {
    var audio = document.querySelector("audio");
    var playBtn = document.getElementById("play-button");
    if (playBtn) {
      playBtn.addEventListener("click", function () {
        var state = "paused";
        if (audio) {
          if (!audio.paused) state = "playing";
          else if (audio.readyState > 0 && audio.readyState < 3) state = "buffering";
        }
        track(state === "playing" ? "pause_click" : "play_click", { state_before: state });
      }, true);
    }
    if (audio) {
      audio.addEventListener("playing", function () { track("play_success"); }, true);
      audio.addEventListener("error", function () {
        var code = "unknown";
        try {
          var c = audio.error && audio.error.code;
          if (c === 2) code = "network";
          else if (c === 3 || c === 4) code = "decode";
        } catch (_) {}
        track("play_error", { error_code: code });
      }, true);
    }
  }

  function bindModals() {
    on("#open-stream", "click", function () { track("listen_elsewhere_open"); });
    on(".listen-option-open", "click", function (ev, el) {
      var id = "unknown";
      try {
        var card = el.closest && el.closest(".listen-option-card");
        if (card) {
          var m = (card.className || "").match(/is-([a-z0-9-]+)/);
          id = (card.id || "").replace(/^option-/, "") || (m ? m[1] : "unknown");
        }
        var label = (el.previousElementSibling && el.previousElementSibling.querySelector && el.previousElementSibling.querySelector("strong"));
        if (label && label.textContent) {
          id = label.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
        }
      } catch (_) {}
      track("listen_elsewhere_click", { option_id: id });
    });

    on("#open-request", "click", function () { track("request_form_open"); });
    document.addEventListener("coast:request-submit-result", function (ev) {
      track("request_form_submit", { result: (ev && ev.detail && ev.detail.result) === "success" ? "success" : "error" });
    });

    on("#feedback-open", "click", function () { track("feedback_open"); });
    document.addEventListener("coast:feedback-submit", function () { track("feedback_submit"); });
    document.addEventListener("coast:feedback-result", function (ev) {
      var d = (ev && ev.detail) || {};
      if (d.result === "success") track("feedback_success");
      else track("feedback_error", { error_code: d.error_code || "unknown" });
    });

    on(".station-helper-toggle", "click", function () { track("helper_open"); });
    document.addEventListener("coast:helper-intent", function (ev) {
      var id = (ev && ev.detail && ev.detail.intent_id) || "unknown";
      track("helper_intent", { intent_id: String(id).slice(0, 40) });
    });
    document.addEventListener("coast:helper-no-result", function (ev) {
      var q = (ev && ev.detail && ev.detail.query_length) || 0;
      var bucket = q <= 3 ? "1-3" : q <= 10 ? "4-10" : q <= 30 ? "11-30" : "30+";
      track("helper_no_result", { query_length_bucket: bucket });
    });

    on("#a11y-toggle", "click", function () { track("accessibility_open"); });

    on("[data-donate-location]", "click", function (ev, el) {
      track("donate_click", { location: (el.dataset.donateLocation || "unknown").slice(0, 30) });
    });

    on("#managed-announcement-banner a", "click", function () { track("announcement_click"); });
  }

  function bindThemeAndSizeChanges() {
    // Watch <html data-theme> + data-text changes via MutationObserver,
    // because the theme toggle lives inside the a11y panel.
    try {
      var html = document.documentElement;
      var lastTheme = html.getAttribute("data-theme") || "dark";
      var lastSize = html.getAttribute("data-text") || "normal";
      var observer = new MutationObserver(function () {
        var t = html.getAttribute("data-theme") || "dark";
        var s = html.getAttribute("data-text") || "normal";
        if (t !== lastTheme) { lastTheme = t; track("theme_change", { theme: t === "light" ? "light" : "dark" }); }
        if (s !== lastSize) {
          lastSize = s;
          var bucket = (s === "small" || s === "normal" || s === "large" || s === "x-large") ? s : "normal";
          track("text_size_change", { size: bucket });
        }
      });
      observer.observe(html, { attributes: true, attributeFilter: ["data-theme", "data-text"] });
    } catch (_) {}
  }

  function bindUnload() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        emitSessionEnd();
      }
    });
    window.addEventListener("pagehide", function () { emitSessionEnd(); });
  }

  // -- Consent banner -------------------------------------------------------

  function showConsentBannerIfNeeded() {
    try {
      if (getConsent() !== null) return;  // already decided
      var banner = document.getElementById("consent-banner");
      if (!banner) return;
      // Small delay so the banner appears after the page settles, not at first paint.
      setTimeout(function () {
        banner.hidden = false;
        banner.classList.add("is-visible");
      }, 1200);
      var yes = document.getElementById("consent-yes");
      var no = document.getElementById("consent-no");
      function dismiss(choice) {
        safeLocal("set", "coast-consent", choice);
        if (choice === "yes") {
          // Seed the visitor id + first-seen so the next session_start picks it up.
          getOrCreateVisitorId();
          getFirstSeenDate();
        }
        banner.hidden = true;
        banner.classList.remove("is-visible");
        try { document.dispatchEvent(new CustomEvent("coast:consent-set", { detail: { choice: choice } })); } catch (_) {}
      }
      if (yes) yes.addEventListener("click", function () { dismiss("yes"); });
      if (no) no.addEventListener("click", function () { dismiss("no"); });
    } catch (_) {}
  }

  // -- Boot -----------------------------------------------------------------

  function boot() {
    emitSessionStart();
    emitPageView();
    bindPlayer();
    bindModals();
    bindThemeAndSizeChanges();
    bindUnload();
    showConsentBannerIfNeeded();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 1);
  } else {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
