const { requireAdmin } = require("./_auth");

const OLD_PAGE_URL = "https://www.coastinternetradio.co.uk/Basic%20(No%20CD)1.html";
const DIRECT_STREAM = "http://65.108.98.93:7293/live";
const METADATA_WORKER = "https://coast-metadata.jamieparr05.workers.dev";

const CANDIDATE_URLS = [
  OLD_PAGE_URL,
  METADATA_WORKER,
  "http://65.108.98.93:7293/status-json.xsl",
  "http://65.108.98.93:7293/status.xsl",
  "http://65.108.98.93:7293/7.html",
  "http://65.108.98.93:7293/",
  "http://65.108.98.93:7293/stats"
];

const HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Content-Type": "application/json; charset=utf-8"
};

exports.handler = async function handler(event) {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: "Method not allowed." })
    };
  }

  const testedAt = new Date().toISOString();
  const results = [];

  for (const url of CANDIDATE_URLS) {
    results.push(await inspectUrl(url));
  }

  const oldPage = results.find(r => r.url === OLD_PAGE_URL);
  const statusJson = results.find(r => r.url.includes("status-json.xsl"));
  const metadataWorker = results.find(r => r.url === METADATA_WORKER);

  const conclusion = decideConclusion({ oldPage, statusJson, metadataWorker, results });

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      ok: true,
      testedAt,
      purpose: "Find where the old website is getting now-playing text from, without changing the public website.",
      conclusion,
      nextSteps: nextSteps(conclusion),
      results
    }, null, 2)
  };
};

async function inspectUrl(url) {
  const started = Date.now();
  try {
    const response = await fetch(url + (url.includes("?") ? "&" : "?") + "cacheBust=" + Date.now(), {
      headers: {
        "Accept": "text/html,application/json,text/plain,*/*",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": "CoastInternetRadioSourceFinder/1.0"
      },
      redirect: "follow"
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await safeText(response);
    const sample = cleanText(text).slice(0, 1200);
    const urls = extractUrls(text, url);
    const lines = extractUsefulLines(text);
    const parsedTracks = parseOldPageStyle(lines);
    const jsonGuess = parseMaybeJson(text);

    return {
      url,
      reachable: response.ok,
      status: response.status,
      contentType,
      responseTimeMs: Date.now() - started,
      length: text.length,
      pageTitle: extractTitle(text),
      likelyContainsTrackText: hasTrackLikeText(text),
      parsedTracks,
      discoveredUrls: urls.slice(0, 80),
      interestingUrls: urls.filter(isInterestingUrl).slice(0, 80),
      usefulTextLines: lines.slice(0, 80),
      jsonGuess,
      sample
    };
  } catch (error) {
    return {
      url,
      reachable: false,
      error: String(error && error.message ? error.message : error),
      responseTimeMs: Date.now() - started
    };
  }
}

async function safeText(response) {
  const buffer = await response.arrayBuffer();
  let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (text.includes("\uFFFD")) {
    try {
      text = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch (_) {}
  }
  return text;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(decodeEntities(match[1])) : "";
}

function extractUrls(text, baseUrl) {
  const found = new Set();
  const raw = String(text || "");
  const patterns = [
    /(?:href|src|data-src|action)\s*=\s*["']([^"']+)["']/gi,
    /url\(([^)]+)\)/gi,
    /https?:\/\/[^\s"'<>]+/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw))) {
      let value = cleanText(match[1] || match[0]).replace(/^['"]|['"]$/g, "");
      if (!value || value.startsWith("#") || value.startsWith("javascript:")) continue;
      try {
        value = new URL(value, baseUrl).href;
      } catch (_) {}
      found.add(value);
    }
  }
  return Array.from(found);
}

function isInterestingUrl(url) {
  return /now|playing|played|current|song|track|title|metadata|status|json|xml|txt|php|asp|asx|m3u|pls|7293|icecast|shoutcast|stream/i.test(url);
}

function extractUsefulLines(html) {
  return decodeEntities(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter(line => line.length > 1)
    .slice(0, 200);
}

function parseOldPageStyle(lines) {
  const nowIndex = lines.findIndex(line => /Playing now on Coast Internet Radio/i.test(line));
  const comingIndex = lines.findIndex(line => /Coming Up Next/i.test(line));
  const previousIndex = lines.findIndex(line => /Previously Played/i.test(line));

  const currentLine = firstTrackLine(lines, nowIndex + 1, comingIndex > -1 ? comingIndex : lines.length);
  const comingLine = firstTrackLine(lines, comingIndex + 1, previousIndex > -1 ? previousIndex : lines.length);
  const previous = collectPrevious(lines, previousIndex + 1);

  return {
    foundOldPageHeadings: nowIndex > -1 || comingIndex > -1 || previousIndex > -1,
    current: currentLine,
    comingUp: comingLine,
    previous
  };
}

function firstTrackLine(lines, start, end) {
  if (start < 0) return "";
  for (let i = start; i < end && i < lines.length; i++) {
    const line = normaliseTrackDisplay(lines[i]);
    if (!line) continue;
    if (/Playing now on Coast Internet Radio|Coming Up Next|Previously Played/i.test(line)) continue;
    if (/Coast Internet Radio|What you've just missed|Listen Here|Welcome|Donate/i.test(line) && !line.includes("-")) continue;
    return line;
  }
  return "";
}

function collectPrevious(lines, start) {
  const previous = [];
  if (start < 0) return previous;
  for (let i = start; i < lines.length && previous.length < 8; i++) {
    const line = normaliseTrackDisplay(lines[i]);
    if (!line) continue;
    if (/Check Us Out|Social Network|Listen Here|Important News|Donate|To send us|Generated\s+by/i.test(line)) break;
    if (/Playing now on Coast Internet Radio|Coming Up Next|Previously Played/i.test(line)) continue;
    previous.push(line);
  }
  return previous;
}

function normaliseTrackDisplay(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s*-\s*/g, " - ")
    .trim();
}

function hasTrackLikeText(text) {
  const clean = cleanText(decodeEntities(text));
  return /Playing now|Coming Up Next|Previously Played|Artist|Title|StreamTitle|now playing/i.test(clean);
}

function parseMaybeJson(text) {
  try {
    const data = JSON.parse(text);
    return summariseJson(data);
  } catch (_) {
    return null;
  }
}

function summariseJson(data) {
  const json = JSON.stringify(data).slice(0, 3000);
  const possibleKeys = [];
  JSON.stringify(data, (key, value) => {
    if (/artist|title|song|track|stream|server|source|listen|mount|listeners/i.test(key)) {
      possibleKeys.push({ key, value: typeof value === "string" ? value.slice(0, 200) : value });
    }
    return value;
  });
  return { possibleKeys: possibleKeys.slice(0, 80), sample: json };
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function decideConclusion({ oldPage, statusJson, metadataWorker, results }) {
  const oldHasTracks = oldPage && oldPage.parsedTracks && (
    oldPage.parsedTracks.current ||
    oldPage.parsedTracks.comingUp ||
    oldPage.parsedTracks.previous.length
  );

  const statusHasLikelyKeys = statusJson && statusJson.jsonGuess && statusJson.jsonGuess.possibleKeys && statusJson.jsonGuess.possibleKeys.length;
  const workerHasTracks = metadataWorker && metadataWorker.jsonGuess && metadataWorker.jsonGuess.possibleKeys && metadataWorker.jsonGuess.possibleKeys.length;

  if (statusHasLikelyKeys) {
    return "possible_direct_icecast_status_source_found";
  }
  if (oldHasTracks && oldPage.interestingUrls && oldPage.interestingUrls.length) {
    return "old_page_has_tracks_and_candidate_links_found";
  }
  if (oldHasTracks) {
    return "old_page_has_tracks_but_no_obvious_hidden_source";
  }
  if (workerHasTracks) {
    return "metadata_worker_returns_track_fields_but_still_uses_old_page";
  }
  if (results.some(r => r.reachable)) {
    return "sources_reachable_but_no_independent_track_source_found_yet";
  }
  return "no_sources_reachable";
}

function nextSteps(conclusion) {
  const map = {
    possible_direct_icecast_status_source_found: "Inspect status-json.xsl result. If it includes title/artist for the live mount, build the new now-playing system from that and remove the old website dependency.",
    old_page_has_tracks_and_candidate_links_found: "Check interestingUrls. If one looks like a metadata feed, test that URL directly. If it works without the old page, use it as the new source.",
    old_page_has_tracks_but_no_obvious_hidden_source: "The old page may be generated server-side. We can still scrape it while live, but it is not independent. Next options: find provider status endpoint, directory API, or audio recognition.",
    metadata_worker_returns_track_fields_but_still_uses_old_page: "The current worker can parse the old page, but does not prove an independent source exists.",
    sources_reachable_but_no_independent_track_source_found_yet: "No clean independent metadata endpoint was found in this quick test. Next step is a timed comparison test or audio recognition proof-of-concept.",
    no_sources_reachable: "The tested URLs could not be reached from Netlify. Use Cloudflare Worker tests or manual browser checks next."
  };
  return map[conclusion] || "Review results manually.";
}
