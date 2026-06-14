const { json, requireAdmin, siteBlobStore } = require("./_auth");

const STORE_NAME = "coast-play-history";

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
  return { weekday: parts.weekday || "", date: `${parts.year}-${parts.month}-${parts.day}`, time: `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`, hour, minute };
}

function looksLikeRepeatShow(item = {}) {
  const haystack = [item.current, item.artist, item.title, item.showContext].filter(Boolean).join(" ").toLowerCase();
  return /\brepeat\s+show\b/.test(haystack) || /\b(mon|tue|wed|thu|thur|fri|sat|sun)\b.*\brepeat\b/.test(haystack);
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
  return { timezone: "Europe/London", localDate: local.date, localTime: local.time, localWeekday: local.weekday, label, isJimLiveWindow, isRepeatShowWindow };
}


function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function trackKey(item) {
  const artist = String(item.artist || "").trim().toLowerCase();
  const title = String(item.title || item.current || "").trim().toLowerCase();
  return `${artist}|||${title}`;
}

function labelTrack(item) {
  const artist = String(item.artist || "").trim();
  const title = String(item.title || item.current || "").trim();
  if (artist && title) return `${artist} - ${title}`;
  return title || String(item.current || "Unknown track").trim();
}

function summarise(snapshots, plays) {
  const songCounts = new Map();
  const artistCounts = new Map();
  const listenerDays = new Map();
  const listenerHours = new Map();
  let peakListeners = null;
  let jimLivePlays = 0;
  let repeatWindowPlays = 0;
  let listenerSamples = 0;
  let listenerTotal = 0;

  function addListenerBucket(map, key, label, value) {
    if (!key || !Number.isFinite(value)) return;
    const bucket = map.get(key) || { key, label, samples: 0, total: 0, peak: null };
    bucket.samples += 1;
    bucket.total += value;
    bucket.peak = bucket.peak === null ? value : Math.max(bucket.peak, value);
    map.set(key, bucket);
  }

  for (const item of snapshots) {
    const n = Number(item.listeners);
    if (Number.isFinite(n)) {
      listenerSamples += 1;
      listenerTotal += n;
      peakListeners = peakListeners === null ? n : Math.max(peakListeners, n);
      const dayKey = item.localDate || item.date || String(item.at || "").slice(0, 10);
      const dayLabel = [item.localWeekday, dayKey].filter(Boolean).join(" ");
      addListenerBucket(listenerDays, dayKey, dayLabel, n);
      const hour = String(item.localTime || "").slice(0, 2);
      if (/^\d{2}$/.test(hour)) {
        addListenerBucket(listenerHours, `${dayKey} ${hour}:00`, `${dayLabel} ${hour}:00`, n);
      }
    }
  }

  for (const item of plays) {
    if (item.isJimLiveWindow) jimLivePlays += 1;
    if (item.isRepeatShowWindow) repeatWindowPlays += 1;
    const key = trackKey(item);
    if (key.replace(/\|/g, "")) {
      const current = songCounts.get(key) || { song: labelTrack(item), artist: item.artist || "", title: item.title || item.current || "", count: 0 };
      current.count += 1;
      songCounts.set(key, current);
    }
    if (item.artist) artistCounts.set(item.artist, (artistCounts.get(item.artist) || 0) + 1);
  }

  const finishBucket = (item) => ({
    ...item,
    average: item.samples ? Math.round((item.total / item.samples) * 10) / 10 : null
  });
  const byPeakThenAverage = (a, b) => (b.peak ?? -1) - (a.peak ?? -1) || (b.average ?? -1) - (a.average ?? -1) || a.label.localeCompare(b.label);

  const topSongs = Array.from(songCounts.values()).sort((a, b) => b.count - a.count || a.song.localeCompare(b.song)).slice(0, 30);
  const topArtists = Array.from(artistCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([artist, count]) => ({ artist, count }));
  const listenerByDay = Array.from(listenerDays.values()).map(finishBucket).sort(byPeakThenAverage).slice(0, 14);
  const listenerByHour = Array.from(listenerHours.values()).map(finishBucket).sort(byPeakThenAverage).slice(0, 20);

  return {
    totalSnapshots: snapshots.length,
    detectedPlays: plays.length,
    uniqueSongs: songCounts.size,
    uniqueArtists: artistCounts.size,
    jimLivePlays,
    repeatWindowPlays,
    peakListeners,
    averageListeners: listenerSamples ? Math.round((listenerTotal / listenerSamples) * 10) / 10 : null,
    busiestDay: listenerByDay[0] || null,
    busiestHour: listenerByHour[0] || null,
    listenerByDay,
    listenerByHour,
    topSongs,
    topArtists
  };
}

function normaliseOldSnapshots(entries) {
  return entries.map((item) => {
    const ctx = item.programmeContext || programmeContext(new Date(item.at || Date.now()));
    if (!ctx.isJimLiveWindow && looksLikeRepeatShow(item)) {
      ctx.label = "Repeat show";
      ctx.isRepeatShowWindow = true;
    }
    return ({
    ...item,
    date: item.date || String(item.at || "").slice(0, 10),
    duration: item.duration || "",
    durationSeconds: Number.isFinite(Number(item.durationSeconds)) ? Number(item.durationSeconds) : null,
    comingUpTrack: item.comingUpTrack || null,
    previousTracks: Array.isArray(item.previousTracks) ? item.previousTracks : [],
    programmeContext: ctx,
    showContext: item.showContext || ctx.label,
    localDate: item.localDate || ctx.localDate,
    localTime: item.localTime || ctx.localTime,
    localWeekday: item.localWeekday || ctx.localWeekday,
    isJimLiveWindow: !!(item.isJimLiveWindow ?? ctx.isJimLiveWindow),
    isRepeatShowWindow: !!(item.isRepeatShowWindow ?? ctx.isRepeatShowWindow)
  });
  });
}

function derivePlaysFromSnapshots(snapshots) {
  const sorted = [...snapshots].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  const plays = [];
  let lastCurrent = "";
  for (const item of sorted) {
    const current = String(item.current || "").trim();
    if (!current || current === lastCurrent) continue;
    const ctx = item.programmeContext || programmeContext(new Date(item.at || Date.now()));
    plays.push({
      startedAt: item.at,
      date: item.date || String(item.at || "").slice(0, 10),
      current,
      artist: item.artist || "",
      title: item.title || current,
      duration: item.duration || "",
      durationSeconds: item.durationSeconds || null,
      comingUpAtStart: item.comingUp || "",
      comingUpTrackAtStart: item.comingUpTrack || null,
      previousAtStart: item.previous || [],
      previousTracksAtStart: item.previousTracks || [],
      listenersAtStart: item.listeners,
      listenerPeakAtStart: item.listenerPeak,
      programmeContext: ctx,
      showContext: item.showContext || ctx.label,
      localDate: item.localDate || ctx.localDate,
      localTime: item.localTime || ctx.localTime,
      localWeekday: item.localWeekday || ctx.localWeekday,
      isJimLiveWindow: !!(item.isJimLiveWindow ?? ctx.isJimLiveWindow),
      isRepeatShowWindow: !!(item.isRepeatShowWindow ?? ctx.isRepeatShowWindow),
      source: item.source || "derived-from-snapshots"
    });
    lastCurrent = current;
  }
  return plays;
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed." });

  try {
    const params = event.queryStringParameters || {};
    const days = Math.min(Math.max(Number(params.days || 7), 1), 42);
    const snapshotLimit = Math.min(Math.max(Number(params.snapshotLimit || 200), 0), 800);
    const playLimit = Math.min(Math.max(Number(params.playLimit || 300), 0), 1000);
    const query = String(params.search || "").trim().toLowerCase();
    const store = siteBlobStore(STORE_NAME);
    const warnings = [];
    const state = await store.get("state", { type: "json", consistency: "strong" }).catch((error) => {
      warnings.push(`Could not read latest state: ${String(error.message || error).slice(0, 120)}`);
      return null;
    });

    const dayResults = [];
    let allSnapshots = [];
    let allPlays = [];

    for (let i = 0; i > -days; i--) {
      const date = dateKey(i);
      let snapshotData = null;
      let oldSnapshotData = null;
      let playData = null;
      try {
        snapshotData = await store.get(`day-snapshots-${date}`, { type: "json", consistency: "strong" }).catch(() => null);
        oldSnapshotData = await store.get(`day-${date}`, { type: "json", consistency: "strong" }).catch(() => null);
        playData = await store.get(`day-plays-${date}`, { type: "json", consistency: "strong" }).catch(() => null);
      } catch (error) {
        warnings.push(`Could not read ${date}: ${String(error.message || error).slice(0, 120)}`);
      }

      const snapshots = normaliseOldSnapshots([
        ...(Array.isArray(snapshotData?.entries) ? snapshotData.entries : []),
        ...(Array.isArray(oldSnapshotData?.entries) ? oldSnapshotData.entries : [])
      ]);
      let plays = Array.isArray(playData?.plays) ? playData.plays : [];
      if (!plays.length && snapshots.length) plays = derivePlaysFromSnapshots(snapshots);

      snapshots.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
      plays.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

      dayResults.push({ date, snapshotCount: snapshots.length, playCount: plays.length });
      allSnapshots = allSnapshots.concat(snapshots);
      allPlays = allPlays.concat(plays);
    }

    allSnapshots.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    allPlays.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

    const summary = summarise(allSnapshots, allPlays);

    function matches(item) {
      if (!query) return true;
      const haystack = [item.current, item.artist, item.title, item.comingUp, item.comingUpAtStart, item.duration, item.showContext].join(" ").toLowerCase();
      return haystack.includes(query);
    }

    const filteredSnapshots = allSnapshots.filter(matches);
    const filteredPlays = allPlays.filter(matches);

    return json(200, {
      ok: true,
      latest: state?.latest || allSnapshots[0] || null,
      lastPlay: state?.lastPlay || allPlays[0] || null,
      days: dayResults,
      snapshots: filteredSnapshots.slice(0, snapshotLimit),
      plays: filteredPlays.slice(0, playLimit),
      counts: {
        matchedSnapshots: filteredSnapshots.length,
        matchedPlays: filteredPlays.length,
        returnedSnapshots: Math.min(filteredSnapshots.length, snapshotLimit),
        returnedPlays: Math.min(filteredPlays.length, playLimit)
      },
      summary,
      warnings,
      exportedAt: new Date().toISOString(),
      note: "The private history view returns a limited set of rows so the admin page stays fast as the saved playlist grows. The summary is calculated from the full selected date range."
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "History could not be loaded. Try signing in again or using a shorter date range.",
      detail: String(error && (error.message || error) || "unknown error").slice(0, 240)
    });
  }
};
