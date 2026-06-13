(() => {
  "use strict";

  const COAST_CONFIG = {
    stationName: "Coast Internet Radio",
    presenterName: "Jim Parr",
    streamUrl: "http://65.108.98.93:7293/live",
    tuneInUrl: "https://tunein.com/radio/coast-internet-Radio-C-I-R-s224937/",
    requestEmail: "coastradio@hotmail.com",
    timeZone: "Europe/London",
    // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
    liveSchedule: [
      { days: [1, 2, 4, 5], start: "10:00", end: "12:00", label: "Monday, Tuesday, Thursday & Friday 10:00am – 12:00pm" },
      { days: [0], start: "10:00", end: "13:00", label: "Sunday 10:00am – 1:00pm" }
    ],
    // The first one works if the included Cloudflare Pages function is deployed.
    // The final direct Icecast URL may be blocked by browser CORS/mixed-content rules on some hosts, so keep /api/status first.
    metadataSources: [
      "/api/status",
      "http://65.108.98.93:7293/status-json.xsl"
    ],
    pollMs: 20000
  };

  const els = {
    audio: document.getElementById("radioAudio"),
    playButton: document.getElementById("playButton"),
    playIcon: document.getElementById("playIcon"),
    playStatus: document.getElementById("playStatus"),
    playHint: document.getElementById("playHint"),
    volume: document.getElementById("volumeSlider"),
    stationStatusPill: document.getElementById("stationStatusPill"),
    stationStatusText: document.getElementById("stationStatusText"),
    listenerPill: document.getElementById("listenerPill"),
    listenerText: document.getElementById("listenerText"),
    liveDot: document.getElementById("liveDot"),
    nowCard: document.getElementById("nowCard"),
    nowEyebrow: document.getElementById("nowEyebrow"),
    nowTitle: document.getElementById("nowTitle"),
    nowArtist: document.getElementById("nowArtist"),
    nowNote: document.getElementById("nowNote"),
    onAirCard: document.getElementById("onAirCard"),
    onAirTitle: document.getElementById("onAirTitle"),
    onAirDescription: document.getElementById("onAirDescription"),
    onAirTime: document.getElementById("onAirTime"),
    nextTitle: document.getElementById("nextTitle"),
    nextNote: document.getElementById("nextNote"),
    recentList: document.getElementById("recentList"),
    requestForm: document.getElementById("requestForm"),
    accessibilityButton: document.getElementById("accessibilityButton"),
    accessibilityPanel: document.getElementById("accessibilityPanel"),
    accessibilityClose: document.getElementById("accessibilityClose"),
    resetAccessibility: document.getElementById("resetAccessibility")
  };

  const state = {
    isPlaying: false,
    lastTrackKey: "",
    recentTracks: loadRecentTracks(),
    metadata: null,
    lastMetadataOk: false
  };

  init();

  function init() {
    els.audio.src = COAST_CONFIG.streamUrl;
    els.audio.volume = Number(els.volume.value || 0.85);

    wirePlayer();
    wireRequestForm();
    wireAccessibility();
    renderRecentTracks();
    refreshStatus();
    window.setInterval(refreshStatus, COAST_CONFIG.pollMs);
    window.setInterval(() => renderAll(state.metadata), 60000);
  }

  function wirePlayer() {
    els.playButton.addEventListener("click", async () => {
      if (state.isPlaying) {
        els.audio.pause();
        return;
      }

      try {
        setPlayUi("loading");
        els.audio.src = COAST_CONFIG.streamUrl;
        await els.audio.play();
      } catch (error) {
        console.warn("Stream play failed", error);
        setPlayUi("error");
        window.open(COAST_CONFIG.tuneInUrl, "_blank", "noopener,noreferrer");
      }
    });

    els.audio.addEventListener("playing", () => setPlayUi("playing"));
    els.audio.addEventListener("pause", () => setPlayUi("paused"));
    els.audio.addEventListener("waiting", () => setPlayUi("loading"));
    els.audio.addEventListener("error", () => setPlayUi("error"));
    els.volume.addEventListener("input", () => {
      els.audio.volume = Number(els.volume.value || 0.85);
    });
  }

  function setPlayUi(mode) {
    const messages = {
      playing: ["Pause", "Playing live", "The stream is playing. It should continue while your phone is locked or in the background."],
      paused: ["Play", "Paused", "Tap play to restart the live stream."],
      loading: ["…", "Connecting…", "Loading the live stream now."],
      error: ["▶", "Stream could not start here", "Your browser may have blocked the stream. Opening TuneIn as a fallback."],
      ready: ["▶", "Ready to play", "Tap once to start the stream. It should keep playing while your phone screen is off."]
    };
    const [icon, status, hint] = messages[mode] || messages.ready;
    state.isPlaying = mode === "playing" || mode === "loading";
    els.playIcon.textContent = icon;
    els.playStatus.textContent = status;
    els.playHint.textContent = hint;
    els.playButton.setAttribute("aria-label", mode === "playing" ? "Pause Coast Internet Radio" : "Play Coast Internet Radio");

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.metadata?.title || COAST_CONFIG.stationName,
        artist: state.metadata?.artist || COAST_CONFIG.presenterName,
        album: COAST_CONFIG.stationName,
        artwork: [{ src: "assets/images/jim-portrait-500.webp", sizes: "500x500", type: "image/webp" }]
      });
      navigator.mediaSession.setActionHandler("play", () => els.audio.play());
      navigator.mediaSession.setActionHandler("pause", () => els.audio.pause());
    }
  }

  async function refreshStatus() {
    const metadata = await fetchMetadata();
    state.metadata = metadata || state.metadata;
    state.lastMetadataOk = Boolean(metadata);
    renderAll(state.metadata);
  }

  async function fetchMetadata() {
    for (const source of COAST_CONFIG.metadataSources) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) continue;
        const payload = await response.json();
        const normalised = normaliseMetadata(payload);
        if (normalised) return normalised;
      } catch (error) {
        // Try the next source. CORS/mixed-content failures are expected on some hosts.
      }
    }
    return null;
  }

  function normaliseMetadata(payload) {
    if (!payload || typeof payload !== "object") return null;

    if (payload.status === "ok" && payload.now) {
      return {
        rawTitle: payload.now.rawTitle || [payload.now.artist, payload.now.title].filter(Boolean).join(" - "),
        title: payload.now.title || "Coast Internet Radio",
        artist: payload.now.artist || "",
        listeners: Number(payload.listeners || payload.now.listeners || 0),
        next: payload.next || "",
        online: payload.online !== false,
        fetchedAt: Date.now()
      };
    }

    const icestats = payload.icestats || payload;
    let source = icestats.source;
    if (Array.isArray(source)) {
      source = source.find((entry) => String(entry.listenurl || entry.server_name || "").toLowerCase().includes("live")) || source[0];
    }
    if (!source || typeof source !== "object") return null;

    const rawTitle = cleanText(source.title || source.yp_currently_playing || source.server_name || source.server_description || "");
    const split = splitTrack(rawTitle);
    return {
      rawTitle,
      title: split.title,
      artist: split.artist,
      listeners: Number(source.listeners || source.listener_count || 0),
      next: cleanText(source.next || source.upcoming || ""),
      online: true,
      fetchedAt: Date.now()
    };
  }

  function renderAll(metadata) {
    const liveInfo = getPresenterLiveInfo(new Date(), metadata);
    const isPresenterLive = liveInfo.isLive;
    renderGlobalStatus(isPresenterLive, metadata);

    if (isPresenterLive) {
      renderPresenterLive(liveInfo, metadata);
    } else {
      renderPlaylistMode(metadata);
    }
  }

  function renderGlobalStatus(isPresenterLive, metadata) {
    els.stationStatusPill.classList.toggle("is-live", isPresenterLive);
    els.stationStatusPill.classList.toggle("is-offline", metadata?.online === false);
    els.stationStatusText.textContent = metadata?.online === false
      ? "Stream offline"
      : isPresenterLive
        ? `${COAST_CONFIG.presenterName} live now`
        : "Music playing 24/7";

    const listenerCount = Number(metadata?.listeners || 0);
    if (listenerCount > 0) {
      els.listenerPill.hidden = false;
      els.listenerText.textContent = `${listenerCount.toLocaleString("en-GB")} listener${listenerCount === 1 ? "" : "s"}`;
    } else {
      els.listenerPill.hidden = true;
    }
  }

  function renderPresenterLive(liveInfo, metadata) {
    els.nowCard.classList.add("is-presenter-live");
    els.onAirCard.classList.add("is-presenter-live");
    els.liveDot.textContent = "LIVE NOW";
    els.nowEyebrow.textContent = "Live show on air";
    els.nowTitle.textContent = `${COAST_CONFIG.presenterName} is live now`;
    els.nowArtist.textContent = "Coast Internet Radio";
    els.nowNote.textContent = "This is a live presenter show, so the site is showing the live show clearly instead of repeating the normal artist and song layout.";

    els.onAirTitle.textContent = `${COAST_CONFIG.presenterName} is live now`;
    els.onAirDescription.textContent = "Live music, requests and chat from Newry. When the show ends, this area automatically returns to the normal song and artist display.";
    els.onAirTime.textContent = liveInfo.endsAt ? `Live until ${liveInfo.endsAt}.` : "Times shown in UK/Ireland time.";

    els.nextTitle.textContent = "Normal playlist display returns after the show";
    els.nextNote.textContent = metadata?.rawTitle && !looksLikePresenterShow(metadata.rawTitle)
      ? `Stream metadata currently says: ${metadata.rawTitle}`
      : "Song and artist info will show here again once Jim is no longer live.";

    els.recentList.innerHTML = `<li>Live show in progress — recent playlist tracks are paused on-screen to avoid confusion.</li>`;
    updateMediaSession(`${COAST_CONFIG.presenterName} is live now`, COAST_CONFIG.stationName);
  }

  function renderPlaylistMode(metadata) {
    els.nowCard.classList.remove("is-presenter-live");
    els.onAirCard.classList.remove("is-presenter-live");
    els.liveDot.textContent = "LIVE";
    els.nowEyebrow.textContent = "Now playing";

    const raw = metadata?.rawTitle || "";
    const split = metadata?.title ? metadata : splitTrack(raw);
    const title = cleanText(split.title || "Song loading…");
    const artist = cleanText(split.artist || "Artist loading…");

    els.nowTitle.textContent = title;
    els.nowArtist.textContent = artist;
    els.nowNote.textContent = state.lastMetadataOk
      ? "Current song, next track and recent plays are updating from the station status."
      : "Unable to read live metadata right now. The player still works; the display will update when the station status is reachable.";

    els.onAirTitle.textContent = "Coast playlist";
    els.onAirDescription.textContent = "The station is broadcasting music as normal. Jim's live presenter box will appear automatically during live show times.";
    els.onAirTime.textContent = "Monday, Tuesday, Thursday & Friday 10:00am – 12:00pm. Sunday 10:00am – 1:00pm.";

    els.nextTitle.textContent = metadata?.next || "Updates when supplied by the station";
    els.nextNote.textContent = "If no next track is supplied by the stream, this stays as a placeholder rather than showing copied old info.";

    maybeStoreRecentTrack(artist, title);
    renderRecentTracks();
    updateMediaSession(title, artist);
  }

  function getPresenterLiveInfo(date, metadata) {
    const forceLive = new URLSearchParams(window.location.search).get("forceLive");
    if (forceLive === "1") return { isLive: true, endsAt: "manual override" };
    if (forceLive === "0") return { isLive: false, endsAt: "" };

    const time = getZonedTime(date, COAST_CONFIG.timeZone);
    const matching = COAST_CONFIG.liveSchedule.find((slot) => {
      if (!slot.days.includes(time.day)) return false;
      const start = minutesFromHHMM(slot.start);
      const end = minutesFromHHMM(slot.end);
      return time.minutes >= start && time.minutes < end;
    });

    if (matching) {
      return { isLive: true, endsAt: toDisplayTime(matching.end), slot: matching };
    }

    // If the stream metadata itself says Jim/live show, treat it as live as a backup.
    if (looksLikePresenterShow(metadata?.rawTitle || `${metadata?.artist || ""} ${metadata?.title || ""}`)) {
      return { isLive: true, endsAt: "when the live show ends" };
    }

    return { isLive: false, endsAt: "" };
  }

  function getZonedTime(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      day: dayMap[parts.weekday],
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  function minutesFromHHMM(value) {
    const [hours, minutes] = String(value).split(":").map(Number);
    return hours * 60 + minutes;
  }

  function toDisplayTime(value) {
    const [hours, minutes] = String(value).split(":").map(Number);
    const suffix = hours >= 12 ? "pm" : "am";
    const twelve = hours % 12 || 12;
    return `${twelve}:${String(minutes).padStart(2, "0")}${suffix}`;
  }

  function looksLikePresenterShow(text) {
    const value = cleanText(text).toLowerCase();
    if (!value) return false;
    return ["jim parr", "jim is live", "live with jim", "live show", "on air with jim"].some((needle) => value.includes(needle));
  }

  function splitTrack(raw) {
    const value = cleanText(raw);
    if (!value) return { artist: "Artist loading…", title: "Song loading…" };

    const ignored = ["coast internet radio", "non stop country", "current song", "artist loading", "song loading"];
    if (ignored.some((item) => value.toLowerCase() === item)) {
      return { artist: "Coast Internet Radio", title: "Music playing 24/7" };
    }

    const separators = [" - ", " – ", " — ", " | "];
    for (const sep of separators) {
      if (value.includes(sep)) {
        const [artist, ...rest] = value.split(sep);
        const title = rest.join(sep);
        if (artist && title) return { artist: cleanText(artist), title: cleanText(title) };
      }
    }

    return { artist: "Coast Internet Radio", title: value };
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function maybeStoreRecentTrack(artist, title) {
    if (!artist || !title || title.includes("loading") || artist.includes("loading")) return;
    const key = `${artist} — ${title}`.toLowerCase();
    if (key === state.lastTrackKey) return;
    state.lastTrackKey = key;

    const label = `${artist} — ${title}`;
    state.recentTracks = [label, ...state.recentTracks.filter((item) => item !== label)].slice(0, 6);
    localStorage.setItem("coastRecentTracks", JSON.stringify(state.recentTracks));
  }

  function loadRecentTracks() {
    try {
      const stored = JSON.parse(localStorage.getItem("coastRecentTracks") || "[]");
      return Array.isArray(stored) ? stored.slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  function renderRecentTracks() {
    if (!state.recentTracks.length) {
      els.recentList.innerHTML = `<li>Recent tracks will appear after the first live metadata update.</li>`;
      return;
    }
    els.recentList.innerHTML = state.recentTracks.map((track) => `<li>${escapeHtml(track)}</li>`).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function updateMediaSession(title, artist) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: COAST_CONFIG.stationName,
      artwork: [{ src: "assets/images/jim-portrait-500.webp", sizes: "500x500", type: "image/webp" }]
    });
  }

  function wireRequestForm() {
    els.requestForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(els.requestForm);
      if (String(data.get("website") || "").trim()) return;
      const song = cleanText(data.get("song"));
      const artist = cleanText(data.get("artist"));
      const name = cleanText(data.get("name"));
      const message = cleanText(data.get("message"));
      const subject = encodeURIComponent(`Song request: ${song} - ${artist}`);
      const body = encodeURIComponent([
        `Song title: ${song}`,
        `Artist: ${artist}`,
        name ? `Name: ${name}` : "",
        message ? `Message: ${message}` : ""
      ].filter(Boolean).join("\n"));
      window.location.href = `mailto:${COAST_CONFIG.requestEmail}?subject=${subject}&body=${body}`;
    });
  }

  function wireAccessibility() {
    const stored = JSON.parse(localStorage.getItem("coastAccessibility") || "{}");
    applyAccessibility(stored);

    els.accessibilityButton.addEventListener("click", () => {
      els.accessibilityPanel.hidden = false;
      els.accessibilityButton.setAttribute("aria-expanded", "true");
    });
    els.accessibilityClose.addEventListener("click", closeAccessibility);
    els.accessibilityPanel.addEventListener("click", (event) => {
      if (event.target === els.accessibilityPanel) closeAccessibility();
    });

    document.querySelectorAll("[data-setting]").forEach((button) => {
      button.addEventListener("click", () => {
        const current = JSON.parse(localStorage.getItem("coastAccessibility") || "{}");
        current[button.dataset.setting] = button.dataset.value;
        localStorage.setItem("coastAccessibility", JSON.stringify(current));
        applyAccessibility(current);
      });
    });

    els.resetAccessibility.addEventListener("click", () => {
      localStorage.removeItem("coastAccessibility");
      applyAccessibility({});
    });
  }

  function closeAccessibility() {
    els.accessibilityPanel.hidden = true;
    els.accessibilityButton.setAttribute("aria-expanded", "false");
  }

  function applyAccessibility(settings) {
    document.body.dataset.fontSize = settings.fontSize || "default";
    document.body.dataset.contrast = settings.contrast || "standard";
    document.body.dataset.motion = settings.motion || "on";
    document.querySelectorAll("[data-setting]").forEach((button) => {
      const active = (settings[button.dataset.setting] || defaultsFor(button.dataset.setting)) === button.dataset.value;
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function defaultsFor(setting) {
    return { fontSize: "default", contrast: "standard", motion: "on" }[setting];
  }
})();
