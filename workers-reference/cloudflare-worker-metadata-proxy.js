/*
 * Coast Internet Radio metadata proxy - V4 Basic Page Source
 *
 * Purpose:
 * Reads the same lightweight "What's Playing" page used by the old website:
 * https://www.coastinternetradio.co.uk/Basic%20(No%20CD)1.html
 *
 * Deploy this code to the existing coast-metadata Cloudflare Worker.
 * Do NOT change the stream Worker.
 */

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

const SOURCE_URL = "https://www.coastinternetradio.co.uk/Basic%20(No%20CD)1.html";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Cache-Control, Pragma",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0"
};

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const wantsDebug = url.pathname.toLowerCase().includes("debug");

  try {
    const result = await getMetadata();

    if (wantsDebug) {
      return textResponse(formatDebug(result));
    }

    return jsonResponse({
      online: true,
      listeners: 0,
      artist: result.artist || "Coast Internet Radio",
      title: result.title || "Coast Internet Radio - Live",
      comingUp: result.comingUp || "",
      previous: result.previous || [],
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    const fallback = {
      online: true,
      listeners: 0,
      artist: "Coast Internet Radio",
      title: "Live country, Irish country & classic hits",
      comingUp: "",
      previous: [],
      updatedAt: new Date().toISOString(),
      error: String(error && error.message ? error.message : error)
    };

    if (wantsDebug) {
      return textResponse("DEBUG: Coast metadata worker V4 Basic Page Source\n\nERROR:\n" + fallback.error);
    }

    return jsonResponse(fallback);
  }
}

async function getMetadata() {
  const fetchUrl = SOURCE_URL + "?t=" + Date.now();

  const upstream = await fetch(fetchUrl, {
    cf: { cacheTtl: 0, cacheEverything: false },
    headers: {
      "Accept": "text/html,text/plain,*/*",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "User-Agent": "CoastInternetRadioMetadataProxy/4.0"
    }
  });

  if (!upstream.ok) {
    throw new Error("Metadata source returned HTTP " + upstream.status);
  }

  const buffer = await upstream.arrayBuffer();
  const html = decodeBuffer(buffer);
  const lines = extractUsefulLines(html);
  const parsed = parseLines(lines);

  return {
    ...parsed,
    sourceUrl: SOURCE_URL,
    rawLines: lines
  };
}

function decodeBuffer(buffer) {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (text.includes("�")) {
    try {
      text = new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch (_) {}
  }

  return text;
}

function extractUsefulLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|span)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter(line => !/^Generated\s+by/i.test(line));
}

function parseLines(lines) {
  const nowIndex = lines.findIndex(line => /Playing now on Coast Internet Radio/i.test(line));
  const comingIndex = lines.findIndex(line => /Coming Up Next/i.test(line));
  const previousIndex = lines.findIndex(line => /Previously Played/i.test(line));

  const currentLine = firstTrackLine(lines, nowIndex + 1, comingIndex > -1 ? comingIndex : lines.length);
  const comingLine = firstTrackLine(lines, comingIndex + 1, previousIndex > -1 ? previousIndex : lines.length);
  const previous = collectPrevious(lines, previousIndex + 1);

  const current = parseTrack(currentLine);
  let comingUp = normaliseTrackDisplay(comingLine || "");

  if (sameTrack(comingUp, current.full)) {
    comingUp = "";
  }

  return {
    artist: current.artist || "Coast Internet Radio",
    title: current.full || currentLine || "Coast Internet Radio - Live",
    comingUp,
    previous
  };
}

function firstTrackLine(lines, start, end) {
  if (start < 0) return "";

  for (let i = start; i < end && i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/Playing now on Coast Internet Radio|Coming Up Next|Previously Played/i.test(line)) continue;
    if (/Coast Internet Radio|What you've just missed|Listen Here|Welcome|Donate/i.test(line) && !line.includes("-")) continue;
    return normaliseTrackDisplay(line);
  }

  return "";
}

function collectPrevious(lines, start) {
  const previous = [];
  if (start < 0) return previous;

  for (let i = start; i < lines.length && previous.length < 5; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/Check Us Out|Social Network|Listen Here|Important News|Donate|To send us|Generated\s+by/i.test(line)) break;
    if (/Playing now on Coast Internet Radio|Coming Up Next|Previously Played/i.test(line)) continue;
    previous.push(normaliseTrackDisplay(line));
  }

  return previous;
}

function parseTrack(line) {
  const clean = normaliseTrackDisplay(line);
  if (!clean) return { artist: "", title: "", full: "" };

  const match = clean.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) {
    return {
      artist: "Coast Internet Radio",
      title: clean,
      full: clean
    };
  }

  const artist = match[1].trim();
  const titleOnly = match[2].trim();

  return {
    artist,
    title: titleOnly,
    full: artist + " - " + titleOnly
  };
}

function normaliseTrackDisplay(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s*-\s*/g, " - ")
    .trim();
}

function sameTrack(a, b) {
  const clean = value => String(value || "")
    .toLowerCase()
    .replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  return clean(a) && clean(a) === clean(b);
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function textResponse(text) {
  return new Response(text, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

function formatDebug(result) {
  return [
    "DEBUG: Coast metadata worker V4 Basic Page Source",
    "",
    "Source URL:",
    result.sourceUrl,
    "",
    "Parsed result:",
    JSON.stringify({
      artist: result.artist,
      title: result.title,
      comingUp: result.comingUp,
      previous: result.previous
    }, null, 2),
    "",
    "Source lines:",
    ...(result.rawLines || [])
  ].join("\n");
}
