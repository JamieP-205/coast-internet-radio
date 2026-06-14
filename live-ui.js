/*
 * Coast Internet Radio
 * Shared live display helpers for now-playing, programme status and listener count.
 */
(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  let displayContent = null;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\(\s*\)/g, "")
      .trim();
  }

  function extractTrackTime(value) {
    const raw = cleanText(value);
    const match = raw.match(/\((\d{1,2}:\d{2})\)\s*$/);
    if (!match) return { text: "", withoutTime: raw };
    return {
      text: match[1],
      withoutTime: cleanText(raw.slice(0, match.index))
    };
  }

  function splitTrackDisplay(value) {
    const time = extractTrackTime(value);
    const raw = time.withoutTime;
    const parts = raw.split(/\s+-\s+/);
    if (parts.length >= 2) {
      const artist = cleanText(parts.shift());
      const title = cleanText(parts.join(" - "));
      return { artist, title, display: raw, timeShown: time.text };
    }
    return { artist: "", title: raw, display: raw, timeShown: time.text };
  }

  function isRepeatProgrammeTrack(data, track) {
    const haystack = [
      data?.current,
      data?.title,
      data?.artist,
      data?.metadata?.current,
      data?.metadata?.title,
      track?.artist,
      track?.title,
      track?.display
    ].map(cleanText).join(" ").toLowerCase();
    return /\brepeat\s+show\b/.test(haystack) || /\b(mon|tue|wed|thu|thur|fri|sat|sun)\b.*\brepeat\b/.test(haystack);
  }

  function applyRepeatProgrammeDisplay(track) {
    const panel = $("#programme-status");
    const title = $("#programme-status-title");
    const note = $("#programme-status-note");
    const nowPlayingPanel = $("#now-playing-panel");
    const subtitle = $(".now-playing-subtitle");
    const comingLabel = $("#coming-up-row .mini-label");
    const previousLabel = $("#previous-panel .mini-label");
    if (!panel || !title || !note) return;
    panel.hidden = false;
    panel.dataset.state = "repeat";
    title.textContent = "Repeat show on air";
    note.textContent = "A recorded Jim Parr show is currently playing. Normal song details will return after the repeat show.";
    nowPlayingPanel?.classList.remove("is-live-show", "is-automation-show");
    nowPlayingPanel?.classList.add("is-repeat-show");
    document.body?.classList.remove("is-jim-live-show");
    document.body?.classList.add("is-repeat-show");
    if (subtitle) subtitle.textContent = "Repeat show currently on air. The normal playlist information will return afterwards.";
    if (comingLabel) comingLabel.textContent = "Coming up later";
    if (previousLabel) previousLabel.textContent = "Recently played";
    window.coastRadioUpdateMediaSession?.("Repeat show on air", "Coast Internet Radio");
  }

  function normaliseTrackDisplay(data) {
    const rawArtist = cleanText(data?.artist || data?.currentTrack?.artist || data?.metadata?.artist);
    const rawTitle = cleanText(data?.currentTrack?.title || data?.metadata?.title || data?.title || data?.current);
    const fullCurrent = cleanText(data?.current || data?.metadata?.current || rawTitle);
    const splitFromCurrent = splitTrackDisplay(fullCurrent || rawTitle);
    const splitFromTitle = splitTrackDisplay(rawTitle);

    let artist = rawArtist || splitFromCurrent.artist || splitFromTitle.artist;
    let title = splitFromTitle.title || splitFromCurrent.title || fullCurrent;

    if (artist && title) {
      const prefix = artist.toLowerCase() + " - ";
      if (title.toLowerCase().startsWith(prefix)) {
        title = cleanText(title.slice(prefix.length));
      }
    }

    if (!artist && title && !splitFromCurrent.artist) {
      artist = "Coast Internet Radio";
    }

    return {
      artist: artist || "Coast Internet Radio",
      title: title || fullCurrent || "Live radio",
      timeShown: splitFromTitle.timeShown || splitFromCurrent.timeShown || cleanText(data?.duration || data?.metadata?.duration)
    };
  }

  function setRadioPillState(state, label) {
    const pill = $("#radio-pill");
    if (!pill) return;
    pill.dataset.state = state;
    const lbl = pill.querySelector(".label");
    if (lbl) lbl.textContent = label;
  }

  function renderMetadata(data) {
    const artistEl = $("#artist-name");
    const songEl = $("#song-title");
    const comingEl = $("#coming-up");
    const comingRow = $("#coming-up-row");
    const previousList = $("#previous-list");
    const playerNoteEl = $("#player-note");
    const audio = $("#audio");

    if (data?.online === false) {
      setRadioPillState("offline", "Radio offline - back soon");
      if (artistEl) artistEl.textContent = "Coast Internet Radio";
      if (songEl) songEl.textContent = "Stream temporarily offline";
      if (comingRow) comingRow.hidden = true;
      if (previousList) {
        previousList.replaceChildren();
        const li = document.createElement("li");
        li.textContent = "Back online shortly.";
        previousList.appendChild(li);
      }
      if (playerNoteEl && !playerNoteEl.classList.contains("warn") && audio?.paused) {
        playerNoteEl.textContent = "The 24/7 stream is down right now. We'll be back as soon as possible.";
        playerNoteEl.classList.add("warn");
      }
      return { artist: "Coast Internet Radio", title: "Stream temporarily offline" };
    }

    setRadioPillState("online", "Radio is live");
    if (playerNoteEl && playerNoteEl.classList.contains("warn") && audio?.paused) {
      playerNoteEl.textContent = "Press the gold play button to start listening.";
      playerNoteEl.classList.remove("warn");
    }

    const track = normaliseTrackDisplay(data || {});
    const repeatProgramme = isRepeatProgrammeTrack(data || {}, track);
    if (repeatProgramme) {
      if (artistEl) artistEl.textContent = "Coast Internet Radio";
      if (songEl) songEl.textContent = "Repeat show on air";
      applyRepeatProgrammeDisplay(track);
    } else {
      if (artistEl) artistEl.textContent = track.artist;
      if (songEl) songEl.textContent = track.title;
      if (document.body?.classList.contains("is-repeat-show")) {
        document.body.classList.remove("is-repeat-show");
        const nowPlayingPanel = $("#now-playing-panel");
        nowPlayingPanel?.classList.remove("is-repeat-show");
      }
      window.coastRadioUpdateMediaSession?.(track.title, track.artist);
    }

    if (comingRow) {
      const text = cleanText(data?.comingUp);
      if (text) {
        if (comingEl) comingEl.textContent = text;
        comingRow.hidden = false;
      } else {
        comingRow.hidden = true;
      }
    }

    if (previousList) {
      previousList.replaceChildren();
      if (Array.isArray(data?.previous) && data.previous.length) {
        data.previous.slice(0, 5).forEach((item) => {
          const li = document.createElement("li");
          li.textContent = cleanText(item);
          previousList.appendChild(li);
        });
      } else {
        const li = document.createElement("li");
        li.textContent = "Tracks will appear here once the live data is connected.";
        li.className = "placeholder";
        previousList.appendChild(li);
      }
    }

    return track;
  }

  function displaySetting(name, fallback, content = displayContent) {
    const stats = content && content.stats ? content.stats : {};
    return stats[name] === undefined ? fallback : !!stats[name];
  }

  function listenersEnabled(content = displayContent) {
    return displaySetting("showListeners", false, content) && displaySetting("showNowPlaying", true, content);
  }

  function updateListenerVisibility(content = displayContent) {
    const panel = $("#listener-panel");
    if (!panel) return;
    panel.hidden = !listenersEnabled(content);
  }

  function updateDisplayVisibility(content = displayContent) {
    if (content) displayContent = content;

    const nowPlayingPanel = $("#now-playing-panel");
    const currentTrackPanel = $("#current-track-panel");
    const previousPanel = $("#previous-panel");
    const showNowPlaying = displaySetting("showNowPlaying", true, displayContent);
    const showComingUp = displaySetting("showComingUp", true, displayContent);
    const showPrevious = displaySetting("showPrevious", true, displayContent);

    if (nowPlayingPanel) nowPlayingPanel.hidden = !showNowPlaying;
    if (currentTrackPanel) currentTrackPanel.hidden = !showNowPlaying;
    if (previousPanel) previousPanel.hidden = !showNowPlaying || !showPrevious;
    document.body?.classList.toggle("hide-now-playing", !showNowPlaying);
    document.body?.classList.toggle("hide-coming-up", !showNowPlaying || !showComingUp);
    document.body?.classList.toggle("hide-previous-played", !showNowPlaying || !showPrevious);
    updateListenerVisibility(displayContent);
  }

  function formatListenerCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "Unavailable";
    return n === 1 ? "1 listening" : `${n} listening`;
  }

  function updateListenerCount(value, content = displayContent) {
    if (content) displayContent = content;
    updateListenerVisibility(displayContent);
    if (!listenersEnabled(displayContent)) return;
    const count = $("#listener-count");
    if (count) count.textContent = formatListenerCount(value);
  }

  function updateProgrammeStatus(statusData) {
    const panel = $("#programme-status");
    const title = $("#programme-status-title");
    const note = $("#programme-status-note");
    const nowPlayingPanel = $("#now-playing-panel");
    const subtitle = $(".now-playing-subtitle");
    const comingLabel = $("#coming-up-row .mini-label");
    const previousLabel = $("#previous-panel .mini-label");
    if (!panel || !title || !note) return;

    const ctx = statusData?.snapshot?.programmeContext || statusData?.snapshot || statusData?.programmeContext || null;
    const label = cleanText(ctx?.label || statusData?.snapshot?.showContext || "");
    if (!label) {
      panel.hidden = true;
      nowPlayingPanel?.classList.remove("is-live-show", "is-repeat-show", "is-automation-show");
      document.body?.classList.remove("is-jim-live-show", "is-repeat-show");
      return;
    }

    panel.hidden = false;
    nowPlayingPanel?.classList.remove("is-live-show", "is-repeat-show", "is-automation-show");
    document.body?.classList.remove("is-jim-live-show", "is-repeat-show");

    if (ctx?.isJimLiveWindow) {
      title.textContent = "Jim Parr is live now";
      note.textContent = "Live presenter show on Coast Internet Radio. Requests are welcome using the request links below.";
      panel.dataset.state = "live";
      nowPlayingPanel?.classList.add("is-live-show");
      document.body?.classList.add("is-jim-live-show");
      if (subtitle) subtitle.textContent = "Jim is live right now. The normal playlist information will return after the live show.";
      if (comingLabel) comingLabel.textContent = "Coming up later";
      if (previousLabel) previousLabel.textContent = "Recently played";
      return;
    }

    if (ctx?.isRepeatShowWindow) {
      title.textContent = "Repeat show on air";
      note.textContent = "A recorded Jim Parr show is currently playing. Normal song details will return after the repeat show.";
      panel.dataset.state = "repeat";
      nowPlayingPanel?.classList.add("is-repeat-show");
      document.body?.classList.add("is-repeat-show");
      if (subtitle) subtitle.textContent = "Repeat show currently on air. The normal playlist information will return afterwards.";
      if (comingLabel) comingLabel.textContent = "Coming up later";
      if (previousLabel) previousLabel.textContent = "Recently played";
      return;
    } else {
      title.textContent = "24-hour music playlist";
      note.textContent = "Automated music continues around the clock.";
      panel.dataset.state = "automation";
      nowPlayingPanel?.classList.add("is-automation-show");
    }

    if (subtitle) subtitle.textContent = "Current song, next track and recent plays.";
    if (comingLabel) comingLabel.textContent = "Coming up next";
    if (previousLabel) previousLabel.textContent = "Previously played";
  }

  function setDisplayContent(content) {
    displayContent = content || null;
    updateDisplayVisibility(displayContent);
  }

  window.CoastLiveUI = {
    cleanText,
    normaliseTrackDisplay,
    setRadioPillState,
    renderMetadata,
    setDisplayContent,
    updateDisplayVisibility,
    updateListenerCount,
    updateProgrammeStatus,
    listenersEnabled
  };
})();

/*
 * Theme-aware image swap.
 * <img data-light-src="..."> gets swapped to the light variant when
 * <html data-theme="light"> is active, and reverts on dark.
 * Self-contained; runs on DOMContentLoaded and on theme attribute changes.
 */
(() => {
  "use strict";
  if (typeof document === "undefined") return;

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.querySelectorAll("img[data-light-src]").forEach((img) => {
      const light = img.dataset.lightSrc;
      const dark = img.dataset.darkSrc || (img._darkSrcCache);
      if (!img._darkSrcCache && !isLight) img._darkSrcCache = img.getAttribute("src");
      if (isLight && light && img.getAttribute("src") !== light) {
        if (!img.dataset.darkSrc) img.dataset.darkSrc = img.getAttribute("src");
        img.setAttribute("src", light);
      } else if (!isLight) {
        const original = img.dataset.darkSrc || img._darkSrcCache;
        if (original && img.getAttribute("src") !== original) img.setAttribute("src", original);
      }
    });
  }

  function init() {
    try {
      const html = document.documentElement;
      applyTheme(html.getAttribute("data-theme") || "dark");
      const observer = new MutationObserver(() => {
        applyTheme(html.getAttribute("data-theme") || "dark");
      });
      observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    } catch (_) { /* never break the page */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
