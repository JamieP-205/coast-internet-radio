/*
 * Coast Internet Radio
 * client script
 */

(() => {
  "use strict";

  const config = window.COAST_RADIO_CONFIG || {};
  const STREAM_FALLBACK = "https://coast-stream.jamieparr05.workers.dev/stream";
  const METADATA_FALLBACK = "https://coast-metadata.jamieparr05.workers.dev";
  const FACEBOOK_FALLBACK = "https://www.facebook.com/share/1aN1Jtus5Y/";
  const META_REFRESH_MS = 10000;
  const NEWS_REFRESH_MS = 5 * 60 * 1000;

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const liveUI = window.CoastLiveUI || {};

  /* Year in footer */
  const yearEl = $("#copyright-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* Player */
  const playButton  = $("#play-button");
  const playIcon    = $("#play-icon");
  const playerNote  = $("#player-note");
  const volumeSlider = $("#volume-slider");

  const streamUrl = (() => {
    const raw = (typeof config.streamUrl === "string" && config.streamUrl.trim())
      ? config.streamUrl.trim()
      : STREAM_FALLBACK;
    // If a Cloudflare worker URL was given without the /stream path, append it.
    if (/\.(workers|pages)\.dev\/?$/.test(raw)) {
      return raw.replace(/\/$/, "") + "/stream";
    }
    return raw;
  })();

  let audio = $("#audio");
  let isToggling = false;
  let lastMediaTitle = "Coast Internet Radio";
  let lastMediaArtist = "Jim Parr";

  function ensureAudio() {
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = "audio";
      document.body.appendChild(audio);
    }

    // Keep one long-lived audio element on the page. Do not reset the src here:
    // controls such as the volume slider call ensureAudio(), and reassigning
    // the same stream URL can interrupt live audio on some mobile browsers
    // while leaving the visual play state unchanged.
    audio.preload = "none";
    if (!audio.getAttribute("src")) audio.setAttribute("src", streamUrl);
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.setAttribute("title", "Coast Internet Radio live stream");
    return audio;
  }
  audio = ensureAudio();

  function updateMediaSession(title = lastMediaTitle, artist = lastMediaArtist) {
    lastMediaTitle = cleanText(title) || "Coast Internet Radio";
    lastMediaArtist = cleanText(artist) || "Jim Parr";

    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: lastMediaTitle,
      artist: lastMediaArtist,
      album: "Coast Internet Radio - Live from Newry",
      artwork: [
        { src: "/assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/assets/icons/icon-512.png", sizes: "512x512", type: "image/png" }
      ]
    });

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        const player = ensureAudio();
        if (player.paused) togglePlay();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        const player = ensureAudio();
        if (!player.paused) togglePlay();
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        const player = ensureAudio();
        player.pause();
      });
    } catch {
      // Some browsers expose Media Session but not every action handler.
    }
  }
  updateMediaSession();

  window.coastRadioUpdateMediaSession = updateMediaSession;

  function setMediaPlaybackState(state) {
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = state; } catch { /* ignore */ }
    }
  }

  if (volumeSlider) {
    audio.volume = Number(volumeSlider.value) / 100;

    function updateVolume() {
      const player = audio || ensureAudio();
      const raw = Number(volumeSlider.value);
      const v = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 85;
      player.volume = v / 100;
      volumeSlider.setAttribute("aria-valuenow", String(v));
    }

    ["input", "change"].forEach((eventName) => {
      volumeSlider.addEventListener(eventName, (event) => {
        // The slider should only adjust volume. Keep the gesture away from any
        // surrounding controls and avoid touching the stream source.
        event.stopPropagation();
        updateVolume();
      });
    });
  }

  async function togglePlay() {
    if (isToggling) return;
    isToggling = true;
    const player = ensureAudio();

    try {
      if (player.paused) {
        if (playerNote) {
          playerNote.textContent = "Connecting to Coast Internet Radio…";
          playerNote.classList.remove("warn");
        }
        player.src = streamUrl;
        player.load();
        await player.play();

        playButton?.classList.add("is-playing");
        playButton?.setAttribute("aria-label", "Pause Coast Internet Radio");
        if (playIcon) playIcon.textContent = "❚❚";
        if (playerNote) {
          playerNote.textContent = "Coast Internet Radio is playing. You can usually lock your screen or switch apps while it continues.";
          playerNote.classList.remove("warn");
        }
        updateMediaSession();
        setMediaPlaybackState("playing");
      } else {
        player.pause();
        playButton?.classList.remove("is-playing");
        playButton?.setAttribute("aria-label", "Play Coast Internet Radio");
        if (playIcon) playIcon.textContent = "▶";
        if (playerNote) {
          playerNote.textContent = "Paused. Press play again to continue listening.";
          playerNote.classList.remove("warn");
        }
      }
    } catch {
      playButton?.classList.remove("is-playing");
      if (playIcon) playIcon.textContent = "▶";
      if (playerNote) {
        playerNote.textContent = "The in-page player was blocked. Tap Open Stream to listen in your audio app.";
        playerNote.classList.add("warn");
      }
    } finally {
      setTimeout(() => { isToggling = false; }, 350);
    }
  }
  window.coastRadioTogglePlay = togglePlay;

  playButton?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlay();
  });

  audio?.addEventListener("pause", () => {
    playButton?.classList.remove("is-playing");
    if (playIcon) playIcon.textContent = "▶";
    setMediaPlaybackState("paused");
  });
  audio?.addEventListener("playing", () => {
    playButton?.classList.add("is-playing");
    playButton?.setAttribute("aria-label", "Pause Coast Internet Radio");
    if (playIcon) playIcon.textContent = "❚❚";
    if (playerNote) {
      playerNote.textContent = "Coast Internet Radio is playing. You can usually lock your screen or switch apps while it continues.";
      playerNote.classList.remove("warn");
    }
    updateMediaSession();
    setMediaPlaybackState("playing");
  });
  audio?.addEventListener("waiting", () => setMediaPlaybackState("playing"));
  audio?.addEventListener("error", () => {
    playButton?.classList.remove("is-playing");
    playButton?.setAttribute("aria-label", "Play Coast Internet Radio");
    if (playIcon) playIcon.textContent = "▶";
    setMediaPlaybackState("none");
    if (playerNote) {
      playerNote.textContent = "The stream could not load. Tap Open Stream to listen in your audio app.";
      playerNote.classList.add("warn");
    }
  });

  /* Wire up action-row and footer links */
  function setHref(id, href) {
    const el = document.getElementById(id);
    if (el && href) el.href = href;
  }

  (function wireLinks() {
    const email = config.email || "coastradio@hotmail.com";
    const facebook = config.facebookUrl || FACEBOOK_FALLBACK;

    setHref("facebook-link", facebook);
    setHref("paypal-link", config.paypalUrl || "https://coast-paypal-redirect.jamieparr05.workers.dev/");
    setHref("footer-facebook", facebook);
    setHref("footer-email", `mailto:${email}`);
    setHref("footer-x", config.xUrl || "https://x.com/coast_radio");

    const phoneText = config.requestPhoneDisplay || "07935 889228";
    const phoneHref = config.requestPhoneHref || "sms:+447935889228";
    ["request-phone-link", "request-sms"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.href = phoneHref;
      el.textContent = phoneText;
    });
  })();

  /* Helpers */
  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\(\s*\)/g, "")
      .trim();
  }

  function cacheBustedUrl(baseUrl) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function fetchJsonFresh(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(cacheBustedUrl(url), {
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      if (!r.ok) return null;
      return await r.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function hasUsefulMetadata(data) {
    return !!(
      data &&
      typeof data === "object" &&
      (data.title || data.artist || data.comingUp || (Array.isArray(data.previous) && data.previous.length))
    );
  }

  async function fetchMetadata() {
    const urls = [];
    if (typeof config.metadataProxyUrl === "string" && config.metadataProxyUrl.trim()) {
      urls.push(config.metadataProxyUrl.trim());
    }
    urls.push(METADATA_FALLBACK);

    const uniqueUrls = [...new Set(urls)];
    for (const url of uniqueUrls) {
      try {
        const liveData = await fetchJsonFresh(url, 10000);
        if (hasUsefulMetadata(liveData)) {
          if (liveData.online === undefined) liveData.online = true;
          return liveData;
        }
      } catch {
        // Try the next live metadata URL.
      }
    }

    // Important: do not use now-playing.json on the public website. It is only
    // a static local preview file and can make the site display stale song data.
    const isLocalPreview =
      window.location.protocol === "file:" ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname);

    if (isLocalPreview) {
      try {
        const fallbackData = await fetchJsonFresh("now-playing.json");
        if (fallbackData) {
          if (fallbackData.online === undefined) fallbackData.online = true;
          return fallbackData;
        }
      } catch { /* ignore */ }

      const island = document.querySelector("#inline-now-playing-fallback");
      if (island) {
        try {
          const d = JSON.parse(island.textContent);
          if (d.online === undefined) d.online = true;
          return d;
        } catch { /* ignore */ }
      }
    }

    return null;
  }

  let metadataPollTimer = null;
  let metadataRequestInFlight = false;

  function scheduleMetadataPoll(delay = META_REFRESH_MS) {
    if (metadataPollTimer) clearTimeout(metadataPollTimer);
    metadataPollTimer = setTimeout(() => {
      updateNowPlaying();
    }, delay);
  }

  async function updateNowPlaying() {
    if (metadataRequestInFlight) return;
    metadataRequestInFlight = true;

    try {
      const data = await fetchMetadata();
      if (data) {
        liveUI.renderMetadata?.(data);
      } else {
        // Metadata source returned nothing useful. Stay on "checking" so the
        // listener sees a calm placeholder rather than a developer message.
        liveUI.setRadioPillState?.("checking", "Live status unavailable right now");
      }
    } catch {
      liveUI.setRadioPillState?.("offline", "Radio status unavailable");
    } finally {
      metadataRequestInFlight = false;
      scheduleMetadataPoll();
    }
  }

  updateNowPlaying();

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateNowPlaying();
  });

  window.addEventListener("focus", updateNowPlaying);
  window.addEventListener("pageshow", updateNowPlaying);

  /* Important News */
  function normaliseNewsItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item && typeof item === "object")
      .filter((item) => item.active !== false)
      .filter((item) => cleanText(item.title || item.body || item.link));
  }

  function renderNews(items) {
    const wrap = $("#news-items");
    const card = $("#news-card");
    if (!wrap || !card) return;

    const newsItems = normaliseNewsItems(items);

    wrap.replaceChildren();
    card.classList.remove("is-empty");

    if (!newsItems.length) {
      card.hidden = true;
      return;
    }

    newsItems.forEach((item) => {
      const article = document.createElement("article");
      article.className = "news-item";

      const h = document.createElement("h3");
      h.textContent = cleanText(item.title || "Update");
      article.appendChild(h);

      if (item.date) {
        const d = document.createElement("p");
        d.className = "news-date";
        d.textContent = cleanText(item.date);
        article.appendChild(d);
      }
      if (item.body) {
        const p = document.createElement("p");
        p.className = "news-body";
        p.textContent = cleanText(item.body);
        article.appendChild(p);
      }
      if (item.link) {
        const a = document.createElement("a");
        a.href = item.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "news-link";
        a.textContent = cleanText(item.linkLabel || "Read more");
        article.appendChild(a);
      }
      wrap.appendChild(article);
    });

    card.hidden = false;
  }

  async function loadNews() {
    const url = `${config.newsUrl || "news.json"}?t=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("news fetch failed");
      const items = await r.json();
      renderNews(items);
    } catch {
      const island = document.querySelector("#inline-news-fallback");
      if (island) {
        try {
          renderNews(JSON.parse(island.textContent));
          return;
        } catch { /* ignore */ }
      }
      renderNews([]);
    }
  }

  loadNews();
  setInterval(loadNews, NEWS_REFRESH_MS);

  /* Accessibility menu */
  const A11Y_KEY = "coast-a11y";
  const a11yToggle = $("#a11y-toggle");
  const a11yPanel  = $("#a11y-panel");
  const a11yClose  = $("#a11y-close");
  const a11yReset  = $("#a11y-reset");

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(A11Y_KEY) || "{}");
    } catch { return {}; }
  }
  function writePrefs(p) {
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(p)); } catch {}
  }
  function applyPrefs(p) {
    const html = document.documentElement;
    ["text", "contrast", "font", "motion", "theme"].forEach((k) => {
      if (p[k] && p[k] !== "default") {
        html.setAttribute(`data-${k}`, p[k]);
      } else {
        html.removeAttribute(`data-${k}`);
      }
    });
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", p.theme === "light" && p.contrast !== "high" ? "#f6ead6" : "#02070d");
    }

    // Update aria-pressed buttons
    $$("[data-prop]").forEach((btn) => {
      const prop = btn.dataset.prop;
      const value = btn.dataset.value;
      const current = p[prop] || "default";
      btn.setAttribute("aria-pressed", String(value === current));
    });
  }

  // Initial sync
  applyPrefs(readPrefs());

  $$("[data-prop]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prefs = readPrefs();
      prefs[btn.dataset.prop] = btn.dataset.value;
      writePrefs(prefs);
      applyPrefs(prefs);
    });
  });

  function openPanel() {
    if (!a11yPanel) return;
    a11yPanel.hidden = false;
    // Force reflow before adding [open] so the opacity transition runs
    void a11yPanel.offsetWidth;
    a11yPanel.setAttribute("open", "");
    a11yToggle?.setAttribute("aria-expanded", "true");
    setTimeout(() => a11yClose?.focus(), 50);
  }
  function closePanel() {
    if (!a11yPanel) return;
    a11yPanel.removeAttribute("open");
    a11yToggle?.setAttribute("aria-expanded", "false");
    // Wait for fade-out before applying [hidden]
    setTimeout(() => { a11yPanel.hidden = true; }, 200);
    a11yToggle?.focus();
  }

  a11yToggle?.addEventListener("click", () => {
    if (a11yPanel?.hasAttribute("open")) closePanel(); else openPanel();
  });
  a11yClose?.addEventListener("click", closePanel);
  a11yReset?.addEventListener("click", () => {
    writePrefs({});
    applyPrefs({});
    // Also clear analytics consent + visitor identifiers as a privacy escape hatch.
    try {
      localStorage.removeItem("coast-consent");
      localStorage.removeItem("coast-visitor-id");
      localStorage.removeItem("coast-visit-count");
      localStorage.removeItem("coast-first-seen");
    } catch (_) {}
  });
  a11yPanel?.addEventListener("click", (e) => {
    if (e.target === a11yPanel) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && a11yPanel?.hasAttribute("open")) closePanel();
  });

  /* Translate link */
  const a11yTranslate = $("#a11y-translate");
  if (a11yTranslate) {
    let pageUrl = window.location.href;
    // Google Translate can't translate file:// URLs. Fall back to the canonical
    // URL from the meta tag if available, or hide the link entirely.
    if (pageUrl.startsWith("file:")) {
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      if (canonical && canonical.startsWith("http")) {
        pageUrl = canonical;
      } else {
        a11yTranslate.hidden = true;
      }
    }
    if (!a11yTranslate.hidden) {
      a11yTranslate.href = `https://translate.google.com/translate?sl=en&tl=auto&u=${encodeURIComponent(pageUrl)}`;
    }
  }

  /* Language detection banner */
  function setupLanguageBanner() {
    const banner = $("#lang-banner");
    if (!banner) return;

    // Browser language code (e.g. "fr-FR", "es", "de-DE")
    const lang = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    const isEnglish = lang.startsWith("en");
    if (isEnglish) return;

    // Respect "user dismissed" persistence
    const dismissed = localStorage.getItem("coast-lang-dismissed");
    if (dismissed === lang) return;

    const langNames = new Intl.DisplayNames([lang], { type: "language" });
    let langName = lang;
    try { langName = langNames.of(lang.split("-")[0]) || lang; } catch {}

    banner.className = "banner lang";
    banner.hidden = false;
    banner.replaceChildren();

    const p = document.createElement("p");
    p.textContent = `This page is in English. Translate to ${langName}?`;
    banner.appendChild(p);

    const a = document.createElement("a");
    let pageUrl = window.location.href;
    if (pageUrl.startsWith("file:")) {
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      if (canonical && canonical.startsWith("http")) pageUrl = canonical;
      else return; // Can't translate a local file
    }
    a.href = `https://translate.google.com/translate?sl=en&tl=${lang.split("-")[0]}&u=${encodeURIComponent(pageUrl)}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Translate";
    banner.appendChild(a);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "dismiss";
    dismiss.textContent = "No thanks";
    dismiss.addEventListener("click", () => {
      try { localStorage.setItem("coast-lang-dismissed", lang); } catch {}
      banner.hidden = true;
    });
    banner.appendChild(dismiss);
  }
  setupLanguageBanner();

  /* Song request modal */
  const requestBtn    = $("#request-link");
  const requestPanel  = $("#request-panel");
  const requestForm   = $("#request-form");
  const requestSubmit = $("#request-submit");
  const requestCancel = $("#request-cancel");
  const requestCloseX = $("#request-close-x");
  const requestStatus = $("#request-status");
  const requestMailto = $("#request-mailto");

  // Update the mailto fallback URL with the configured email
  if (requestMailto && config.email) {
    requestMailto.href = `mailto:${config.email}?subject=${encodeURIComponent("Song request for Coast Internet Radio")}`;
  }

  // Track focus return target so closing the modal sends focus back to where it came from
  let requestReturnFocus = null;

  function openRequestPanel() {
    if (!requestPanel) return;
    requestReturnFocus = document.activeElement;
    requestPanel.hidden = false;
    void requestPanel.offsetWidth;
    requestPanel.setAttribute("open", "");
    setTimeout(() => $("#req-song")?.focus(), 50);
  }
  function closeRequestPanel() {
    if (!requestPanel) return;
    requestPanel.removeAttribute("open");
    setTimeout(() => { requestPanel.hidden = true; }, 200);
    if (requestReturnFocus && typeof requestReturnFocus.focus === "function") {
      requestReturnFocus.focus();
    }
  }

  requestBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openRequestPanel();
  });
  requestCancel?.addEventListener("click", closeRequestPanel);
  requestCloseX?.addEventListener("click", closeRequestPanel);
  requestPanel?.addEventListener("click", (e) => {
    if (e.target === requestPanel) closeRequestPanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && requestPanel?.hasAttribute("open")) closeRequestPanel();
  });

  // Rate limit: at most one submit every 10 seconds per tab
  let lastSubmitTime = 0;

  function setStatus(state, message) {
    if (!requestStatus) return;
    if (state) requestStatus.dataset.state = state;
    else requestStatus.removeAttribute("data-state");
    requestStatus.textContent = message || "";
  }

  requestForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requestForm) return;

    const now = Date.now();
    if (now - lastSubmitTime < 10000) {
      setStatus("error", "Please wait a few seconds before sending again.");
      return;
    }

    // Honeypot - bots fill this; silently drop the submission
    const honeypot = requestForm.querySelector('[name="bot-field"]');
    if (honeypot && honeypot.value) {
      setStatus("success", "Thanks - your request has been sent.");
      requestForm.reset();
      return;
    }

    // Basic client-side validation (browser already enforces required + maxlength)
    const data = new FormData(requestForm);
    const song = (data.get("song") || "").toString().trim();
    const artist = (data.get("artist") || "").toString().trim();
    if (!song || !artist) {
      setStatus("error", "Please fill in both the song title and artist.");
      return;
    }

    requestSubmit.disabled = true;
    setStatus(null, "Sending your request…");

    try {
      // Convert FormData → URL-encoded form body (Netlify's expected format)
      const body = new URLSearchParams();
      for (const [k, v] of data.entries()) body.append(k, v.toString());

      const r = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      if (r.ok) {
        lastSubmitTime = now;
        setStatus("success", "Thanks - your request has been sent. Listen out for it on the show.");
        requestForm.reset();
        try { document.dispatchEvent(new CustomEvent("coast:request-submit-result", { detail: { result: "success" } })); } catch (_) {}
        // Auto-close after a short pause so the user sees the message
        setTimeout(closeRequestPanel, 2500);
      } else {
        throw new Error(`server returned ${r.status}`);
      }
    } catch (err) {
      // Form backend unavailable (local file or network error) - offer email fallback
      const mailto = requestMailto?.href;
      if (mailto) {
        setStatus("error", "We couldn't send the form right now. Use the email link below instead, or try again in a moment.");
      } else {
        setStatus("error", "Something went wrong. Please try again, or email coastradio@hotmail.com.");
      }
      try { document.dispatchEvent(new CustomEvent("coast:request-submit-result", { detail: { result: "error" } })); } catch (_) {}
    } finally {
      requestSubmit.disabled = false;
    }
  });

})();
