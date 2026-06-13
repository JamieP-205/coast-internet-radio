/**
 * Coast Internet Radio — public feedback modal handler.
 *
 *  - Open/close + Escape-to-close + focus management.
 *  - Submit posts JSON to /.netlify/functions/submit-feedback.
 *  - Fires CustomEvents that analytics.js listens for, no analytics
 *    coupling other than dispatchEvent.
 *  - Fails gracefully with email fallback.
 */
(function () {
  "use strict";

  var ENDPOINT = "/.netlify/functions/submit-feedback";
  var pageLoadedAt = Date.now();
  var lastFocus = null;

  function $(id) { return document.getElementById(id); }

  function getPanel() { return $("feedback-panel"); }
  function getForm() { return $("feedback-form"); }
  function getStatus() { return $("feedback-status"); }
  function getSubmit() { return $("feedback-submit"); }

  function setStatus(message, type) {
    var el = getStatus();
    if (!el) return;
    el.textContent = message || "";
    el.className = "status-box" + (type ? " " + type : "");
  }

  function deviceBucket() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    if (w < 380) return "narrow";
    if (w < 720) return "mobile";
    if (w < 1024) return "tablet";
    return "desktop";
  }

  function openPanel() {
    var panel = getPanel();
    if (!panel) return;
    lastFocus = document.activeElement;
    panel.hidden = false;
    panel.setAttribute("open", "");
    document.documentElement.classList.add("modal-open");
    setStatus("");
    setTimeout(function () {
      var t = $("feedback-type");
      if (t) try { t.focus({ preventScroll: true }); } catch (_) { t.focus(); }
    }, 30);
  }

  function closePanel() {
    var panel = getPanel();
    if (!panel) return;
    panel.hidden = true;
    panel.removeAttribute("open");
    document.documentElement.classList.remove("modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) { lastFocus.focus(); }
    }
  }

  function getFieldValue(id) {
    var el = $(id);
    return el ? String(el.value || "") : "";
  }

  function submitFeedback(event) {
    event.preventDefault();
    var submit = getSubmit();
    if (submit) submit.disabled = true;
    setStatus("Sending…");

    var payload = {
      type: getFieldValue("feedback-type"),
      message: getFieldValue("feedback-message").trim(),
      name: getFieldValue("feedback-name").trim(),
      contact: getFieldValue("feedback-contact").trim(),
      hp: getFieldValue("feedback-hp"),
      loadedAt: pageLoadedAt,
      path: location.pathname,
      device_bucket: deviceBucket()
    };

    if (!payload.message || payload.message.length < 3) {
      setStatus("Please write a longer message.", "err");
      if (submit) submit.disabled = false;
      return;
    }

    try {
      document.dispatchEvent(new CustomEvent("coast:feedback-submit"));
    } catch (_) {}

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      mode: "same-origin"
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok && data && data.ok !== false, data: data || {}, status: res.status }; });
    }).then(function (result) {
      if (result.ok) {
        setStatus("Thanks — your feedback has been sent.", "ok");
        var form = getForm();
        if (form) form.reset();
        try { document.dispatchEvent(new CustomEvent("coast:feedback-result", { detail: { result: "success" } })); } catch (_) {}
        setTimeout(closePanel, 1800);
      } else {
        var errCode = result.status === 429 ? "rate-limit" : (result.status >= 500 ? "server" : "validation");
        var msg = (result.data && result.data.error) || "We could not send your feedback. Please try emailing coastradio@hotmail.com.";
        setStatus(msg, "err");
        try { document.dispatchEvent(new CustomEvent("coast:feedback-result", { detail: { result: "error", error_code: errCode } })); } catch (_) {}
      }
    }).catch(function () {
      setStatus("We could not reach the server. Please email coastradio@hotmail.com.", "err");
      try { document.dispatchEvent(new CustomEvent("coast:feedback-result", { detail: { result: "error", error_code: "network" } })); } catch (_) {}
    }).then(function () {
      if (submit) submit.disabled = false;
    });
  }

  function init() {
    var opener = $("feedback-open");
    if (opener) opener.addEventListener("click", openPanel);

    var closer = $("feedback-close-x");
    if (closer) closer.addEventListener("click", closePanel);

    var form = getForm();
    if (form) form.addEventListener("submit", submitFeedback);

    document.addEventListener("keydown", function (ev) {
      var panel = getPanel();
      if (!panel || panel.hidden) return;
      if (ev.key === "Escape") { ev.preventDefault(); closePanel(); }
    });

    var panel = getPanel();
    if (panel) {
      panel.addEventListener("click", function (ev) {
        if (ev.target === panel) closePanel();
      });
    }
  }

  if (document.readyState === "complete" || document.readyState === "interactive") init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
