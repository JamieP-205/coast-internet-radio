const { json, siteBlobStore } = require("./_auth");

const ICECAST_STATUS_URL = "http://65.108.98.93:7293/status-json.xsl";
const STATIONPLAYLIST_URL = "https://www.coastinternetradio.co.uk/Basic%20(No%20CD)1.html";
const STORE_NAME = "coast-play-history";
const SNAPSHOT_INTERVAL_MS = 60 * 1000;
const MAX_DAILY_SNAPSHOTS = 3000;
const MAX_DAILY_PLAYS = 2000;


async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function toLines(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n|\r/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^Generated\s+by/i.test(line));
}

function extractTimeShown(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\((\d{1,2}):(\d{2})\)\s*$/);
  if (!match) return { text: "", seconds: null, withoutTime: raw };
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return {
    text: `${match[1]}:${match[2]}`,
    seconds: Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : null,
    withoutTime: raw.slice(0, match.index).trim()
  };
}

function splitTrack(value) {
  const time = extractTimeShown(value);
  const raw = time.withoutTime.replace(/\s+/g, " ").trim();
  const parts = raw.split(/\s+-\s+/);
  let artist = "";
  let title = raw;
  if (parts.length >= 2) {
    artist = parts.shift().trim();
    title = parts.join(" - ").trim();
  }
  return {
    artist,
    title,
    display: raw,
    raw,
    timeShown: time.text,
    timeShownSeconds: time.seconds
  };
}

function parseStationPlaylist(html) {
  const lines = toLines(html);
  const playIndex = lines.findIndex((line) => /playing now/i.test(line));
  const nextIndex = lines.findIndex((line) => /coming up next/i.test(line));
  const previousIndex = lines.findIndex((line) => /previously played/i.test(line));

  const currentLine = playIndex >= 0 ? (lines[playIndex + 1] || "") : "";
  const comingUpLine = nextIndex >= 0 ? (lines[nextIndex + 1] || "") : "";
  const previousLines = previousIndex >= 0
    ? lines.slice(previousIndex + 1).filter((line) => !/stationplaylist/i.test(line)).slice(0, 10)
    : [];

  const currentTrack = splitTrack(currentLine);
  const comingUpTrack = splitTrack(comingUpLine);
  const previousTracks = previousLines.map(splitTrack).filter((track) => track.display);

  return {
    current: currentTrack.display,
    artist: currentTrack.artist,
    title: currentTrack.title,
    duration: currentTrack.timeShown,
    durationSeconds: currentTrack.timeShownSeconds,
    comingUp: comingUpTrack.display,
    previous: previousTracks.map((track) => track.display),
    currentTrack,
    comingUpTrack,
    previousTracks,
    source: currentTrack.display ? "stationplaylist-page" : "unavailable"
  };
}

async function fetchIcecast() {
  const response = await fetchWithTimeout(ICECAST_STATUS_URL, { headers: { "Accept": "application/json" } }, 9000);
  if (!response.ok) throw new Error(`Icecast status ${response.status}`);
  const data = await response.json();
  const sources = Array.isArray(data?.icestats?.source) ? data.icestats.source : [data?.icestats?.source].filter(Boolean);
  const live = sources.find((item) => String(item?.listenurl || "").includes("/live")) || sources[0] || {};
  const listeners = Number(live.listeners);
  const listenerPeak = Number(live.listener_peak);
  return {
    online: true,
    listeners: Number.isFinite(listeners) ? listeners : null,
    listenerPeak: Number.isFinite(listenerPeak) ? listenerPeak : null,
    serverName: live.server_name || "Coast Internet Radio",
    description: live.server_description || "",
    streamType: live.server_type || "",
    updatedAt: new Date().toISOString()
  };
}

async function fetchStationPlaylist() {
  const response = await fetchWithTimeout(STATIONPLAYLIST_URL, { headers: { "Accept": "text/html", "Cache-Control": "no-cache", "Pragma": "no-cache" } }, 9000);
  if (!response.ok) throw new Error(`StationPlaylist page ${response.status}`);
  const html = await response.text();
  return parseStationPlaylist(html);
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function looksLikeRepeatShow(metadata = {}) {
  const haystack = [
    metadata.current,
    metadata.artist,
    metadata.title,
    metadata.currentTrack?.artist,
    metadata.currentTrack?.title
  ].filter(Boolean).join(" ").toLowerCase();
  return /\brepeat\s+show\b/.test(haystack) || /\b(mon|tue|wed|thu|thur|fri|sat|sun)\b.*\brepeat\b/.test(haystack);
}


function londonParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = Number(parts.hour === "24" ? 0 : parts.hour);
  const minute = Number(parts.minute);
  return {
    weekday: parts.weekday || "",
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute
  };
}

function programmeContext(date = new Date()) {
  const local = londonParts(date);
  const minutes = local.hour * 60 + local.minute;
  const liveDays = new Set(["Monday", "Tuesday", "Thursday", "Friday"]);
  const isWeekdayLive = liveDays.has(local.weekday) && minutes >= 10 * 60 && minutes < 12 * 60;
  const isSundayLive = local.weekday === "Sunday" && minutes >= 10 * 60 && minutes < 13 * 60;
  const isJimLiveWindow = isWeekdayLive || isSundayLive;
  const isRepeatShowWindow = !isJimLiveWindow && minutes >= 19 * 60 && minutes < 20 * 60;

  let label = "24-hour music playlist";
  if (isJimLiveWindow) label = "Jim Parr live show";
  else if (isRepeatShowWindow) label = "7pm repeat show";

  return {
    timezone: "Europe/London",
    localDate: local.date,
    localTime: local.time,
    localWeekday: local.weekday,
    label,
    isJimLiveWindow,
    isRepeatShowWindow,
    note: isJimLiveWindow
      ? "Jim is scheduled live now."
      : isRepeatShowWindow
        ? "A scheduled repeat show is playing."
        : "The station is broadcasting automatically."
  };
}

function makeSnapshot(live, metadata) {
  const now = new Date();
  const context = programmeContext(now);
  if (!context.isJimLiveWindow && looksLikeRepeatShow(metadata)) {
    context.label = "Repeat show";
    context.isRepeatShowWindow = true;
    context.note = "A recorded repeat show is playing.";
  }
  return {
    at: now.toISOString(),
    date: dateKey(now),
    listeners: live.listeners,
    listenerPeak: live.listenerPeak,
    current: metadata.current || "",
    artist: metadata.artist || metadata.currentTrack?.artist || "",
    title: metadata.title || metadata.currentTrack?.title || "",
    duration: metadata.duration || metadata.currentTrack?.timeShown || "",
    durationSeconds: Number.isFinite(Number(metadata.durationSeconds)) ? Number(metadata.durationSeconds) : null,
    comingUp: metadata.comingUp || "",
    comingUpTrack: metadata.comingUpTrack || splitTrack(metadata.comingUp || ""),
    previous: Array.isArray(metadata.previous) ? metadata.previous.slice(0, 10) : [],
    previousTracks: Array.isArray(metadata.previousTracks) ? metadata.previousTracks.slice(0, 10) : [],
    programmeContext: context,
    showContext: context.label,
    localDate: context.localDate,
    localTime: context.localTime,
    localWeekday: context.localWeekday,
    isJimLiveWindow: context.isJimLiveWindow,
    isRepeatShowWindow: context.isRepeatShowWindow,
    source: metadata.source || "unknown"
  };
}

function changedEnough(last, next) {
  if (!last) return true;
  if (last.current !== next.current) return true;
  if (last.comingUp !== next.comingUp) return true;
  if (Number(last.listeners) !== Number(next.listeners)) return true;
  return false;
}

function makePlayEvent(snapshot) {
  return {
    startedAt: snapshot.at,
    date: snapshot.date,
    current: snapshot.current,
    artist: snapshot.artist,
    title: snapshot.title,
    duration: snapshot.duration,
    durationSeconds: snapshot.durationSeconds,
    comingUpAtStart: snapshot.comingUp,
    comingUpTrackAtStart: snapshot.comingUpTrack,
    previousAtStart: snapshot.previous,
    previousTracksAtStart: snapshot.previousTracks,
    listenersAtStart: snapshot.listeners,
    listenerPeakAtStart: snapshot.listenerPeak,
    programmeContext: snapshot.programmeContext || null,
    showContext: snapshot.showContext || snapshot.programmeContext?.label || "",
    localDate: snapshot.localDate || "",
    localTime: snapshot.localTime || "",
    localWeekday: snapshot.localWeekday || "",
    isJimLiveWindow: !!snapshot.isJimLiveWindow,
    isRepeatShowWindow: !!snapshot.isRepeatShowWindow,
    source: snapshot.source
  };
}

async function appendJsonArray(store, key, wrapperKey, value, maxItems) {
  const existing = await store.get(key, { type: "json", consistency: "strong" }).catch(() => null);
  const items = Array.isArray(existing?.[wrapperKey]) ? existing[wrapperKey] : [];
  items.push(value);
  const trimmed = items.slice(-maxItems);
  await store.setJSON(key, {
    date: key.replace(/^day-(plays-|snapshots-)?/, ""),
    [wrapperKey]: trimmed,
    updatedAt: value.at || value.startedAt || new Date().toISOString()
  });
  return trimmed.length;
}

async function logSnapshot(snapshot) {
  const store = siteBlobStore(STORE_NAME);
  const state = await store.get("state", { type: "json", consistency: "strong" }).catch(() => null);
  const now = Date.now();
  const lastLoggedAt = state?.lastLoggedAt ? Date.parse(state.lastLoggedAt) : 0;
  const currentChanged = !!snapshot.current && state?.latest?.current !== snapshot.current;
  const shouldLogSnapshot = changedEnough(state?.latest, snapshot) || !lastLoggedAt || (now - lastLoggedAt) >= SNAPSHOT_INTERVAL_MS;
  if (!shouldLogSnapshot && !currentChanged) return { logged: false, playLogged: false, reason: "recent duplicate" };

  const snapshotKey = `day-snapshots-${dateKey(new Date(snapshot.at))}`;
  const snapshotCount = await appendJsonArray(store, snapshotKey, "entries", snapshot, MAX_DAILY_SNAPSHOTS);

  let playLogged = false;
  let playCount = null;
  if (currentChanged) {
    const playKey = `day-plays-${dateKey(new Date(snapshot.at))}`;
    playCount = await appendJsonArray(store, playKey, "plays", makePlayEvent(snapshot), MAX_DAILY_PLAYS);
    playLogged = true;
  }

  await store.setJSON("state", {
    latest: snapshot,
    lastLoggedAt: snapshot.at,
    updatedAt: snapshot.at,
    lastPlay: currentChanged ? makePlayEvent(snapshot) : state?.lastPlay || null
  });
  return { logged: true, playLogged, snapshotKey, snapshotCount, playCount };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  let live;
  let metadata;
  const errors = [];

  try { live = await fetchIcecast(); } catch (error) {
    live = { online: false, listeners: null, listenerPeak: null, updatedAt: new Date().toISOString() };
    errors.push(`listener count unavailable: ${String(error.message || error)}`);
  }

  try { metadata = await fetchStationPlaylist(); } catch (error) {
    metadata = { current: "", artist: "", title: "", duration: "", durationSeconds: null, comingUp: "", previous: [], currentTrack: splitTrack(""), comingUpTrack: splitTrack(""), previousTracks: [], source: "unavailable" };
    errors.push(`song page unavailable: ${String(error.message || error)}`);
  }

  const snapshot = makeSnapshot(live, metadata);
  let history = { logged: false };
  try { history = await logSnapshot(snapshot); } catch (error) {
    errors.push(`history save unavailable: ${String(error.message || error)}`);
  }

  return json(200, {
    ok: true,
    live,
    metadata,
    snapshot,
    history,
    errors,
    updatedAt: snapshot.at
  }, { "Cache-Control": "no-store, max-age=0" });
};
