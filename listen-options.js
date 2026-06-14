(() => {
  "use strict";

  const DEFAULT_LINKS = [
  { id: "this-site", label: "This website", description: "Use the main Listen Live player on this updated website.", url: "https://coastinternetradio.com/#listen", visible: true, status: "working" },
  { id: "direct-stream", label: "Direct audio stream", description: "Opens the live audio feed directly in your browser or audio player.", url: "https://coast-stream.jamieparr05.workers.dev/stream", visible: true, status: "working" },
  { id: "online-radio-box", label: "Online Radio Box", description: "External radio-directory page that is currently playing correctly.", url: "https://onlineradiobox.com/uk/coastinternet/", visible: true, status: "working" },
  { id: "current-site", label: "Original website", description: "The current/original Coast Internet Radio website during the review period.", url: "https://www.coastinternetradio.co.uk/", visible: true, status: "working" },
  { id: "tunein", label: "TuneIn", description: "Directory link kept in admin, currently hidden until playback is working again.", url: "https://tunein.com/radio/coast-internet-Radio-C-I-R-s224937/", visible: false, status: "issue" },
  { id: "radio-uk", label: "Radio UK / eRadio", description: "Directory link kept in admin, currently hidden until playback is working again.", url: "https://www.radio-uk.co.uk/coast-internet-radio", visible: false, status: "issue" },
  { id: "mytuner", label: "myTuner", description: "Directory link kept in admin, currently hidden until playback is working again.", url: "https://mytuner-radio.com/radio/coast-internet-radio-467601/", visible: false, status: "issue" },
  { id: "streema", label: "Streema", description: "Directory link kept in admin, currently hidden until playback is working again.", url: "https://streema.com/radios/Coast_Internet_Radio", visible: false, status: "issue" },
  { id: "radio-garden", label: "Radio Garden", description: "Directory link kept in admin, currently hidden until playback is working again.", url: "https://radio.garden/listen/coast-internet-radio/qHxj8c7q", visible: false, status: "issue" },
  { id: "live-online-radio", label: "Live Online Radio", description: "Directory link kept in admin, currently hidden until playback is working again.", url: "https://liveonlineradio.net/coast-internet-radio", visible: false, status: "issue" }
  ];

  let links = DEFAULT_LINKS;
  let lastFocus = null;

  const statusText = { working: "Available", issue: "Currently unavailable", untested: "Check first" };

  function clean(value, fallback = "") {
    return String(value || fallback).replace(/\s+/g, " ").trim();
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      if (url.protocol !== "https:" && url.origin !== window.location.origin) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function sanitiseLinks(input) {
    const byId = new Map();
    if (Array.isArray(input)) {
      input.forEach((item) => {
        if (item && typeof item === "object" && item.id) byId.set(String(item.id), item);
      });
    }
    return DEFAULT_LINKS.map((fallback) => {
      const item = byId.get(fallback.id) || {};
      const status = ["working", "issue", "untested"].includes(item.status) ? item.status : fallback.status;
      return {
        id: fallback.id,
        label: clean(item.label, fallback.label).slice(0, 60),
        description: clean(item.description, fallback.description).slice(0, 180),
        url: safeUrl(item.url) || fallback.url,
        visible: item.visible === undefined ? fallback.visible : !!item.visible,
        status
      };
    });
  }

  function render() {
    const list = document.getElementById("listen-options-list");
    if (!list) return;
    list.replaceChildren();
    const visibleLinks = links.filter((item) => item.visible);
    if (!visibleLinks.length) {
      const empty = document.createElement("p");
      empty.className = "help-text";
      empty.textContent = "No extra listening links are currently shown. Use the main Listen Live button on this website.";
      list.appendChild(empty);
      return;
    }
    visibleLinks.forEach((item) => {
      const card = document.createElement("article");
      card.className = `listen-option-card is-${item.status}`;

      const copy = document.createElement("div");
      copy.className = "listen-option-copy";
      const title = document.createElement("strong");
      title.textContent = item.label;
      const description = document.createElement("p");
      description.textContent = item.description;
      const badge = document.createElement("span");
      badge.className = "listen-option-status";
      badge.textContent = statusText[item.status] || "Untested";
      copy.append(title, description, badge);

      const link = document.createElement("a");
      link.className = "listen-option-open";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open";

      card.append(copy, link);
      list.appendChild(card);
    });
  }

  function openPanel() {
    const panel = document.getElementById("listen-options-panel");
    const trigger = document.getElementById("open-stream");
    if (!panel) return;
    lastFocus = document.activeElement;
    render();
    panel.hidden = false;
    panel.setAttribute("open", "");
    trigger?.setAttribute("aria-expanded", "true");
    setTimeout(() => document.getElementById("listen-options-close-x")?.focus({ preventScroll: true }), 40);
  }

  function closePanel() {
    const panel = document.getElementById("listen-options-panel");
    const trigger = document.getElementById("open-stream");
    if (!panel) return;
    panel.removeAttribute("open");
    panel.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) { lastFocus.focus(); }
    }
  }

  function init() {
    const trigger = document.getElementById("open-stream");
    const panel = document.getElementById("listen-options-panel");
    const close = document.getElementById("listen-options-close-x");
    if (!trigger || !panel) return;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", openPanel);
    close?.addEventListener("click", closePanel);
    panel.addEventListener("click", (event) => { if (event.target === panel) closePanel(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) closePanel();
    });
    render();
  }

  window.CoastListenOptions = {
    setLinks(nextLinks) {
      links = sanitiseLinks(nextLinks);
      render();
    },
    open: openPanel,
    close: closePanel
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
