const { requireAdmin } = require("./_auth");

const STREAM_TARGETS = [
  {
    label: "Direct stream server",
    url: "http://65.108.98.93:7293/live"
  },
  {
    label: "Website stream helper",
    url: "https://coast-stream.jamieparr05.workers.dev/stream"
  }
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body, null, 2)
  };
}

function headerValue(headers, name) {
  try { return headers.get(name) || headers.get(name.toLowerCase()) || ""; }
  catch { return ""; }
}

function normaliseTitle(value) {
  return String(value || "")
    .replace(/^StreamTitle=/i, "")
    .replace(/^['\"]|['\"];?$/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function splitArtistTitle(streamTitle) {
  const title = normaliseTitle(streamTitle);
  if (!title) return { artist: "", track: "", raw: "" };

  const separators = [" - ", " – ", " — ", " | ", " / "];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const [artist, ...rest] = title.split(sep);
      const track = rest.join(sep).trim();
      if (artist.trim() && track) return { artist: artist.trim(), track, raw: title };
    }
  }

  return { artist: "", track: title, raw: title };
}

function concatBuffers(chunks, totalLength) {
  const out = Buffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    const buf = Buffer.from(chunk);
    buf.copy(out, offset);
    offset += buf.length;
  }
  return out;
}

async function readEnough(response, byteGoal, timeoutAt) {
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;

  while (total < byteGoal && Date.now() < timeoutAt) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) {
      chunks.push(value);
      total += value.length;
    }
  }

  try { await reader.cancel(); } catch {}
  return concatBuffers(chunks, total);
}

async function testTarget(target) {
  const controller = new AbortController();
  const timeoutMs = 12000;
  const timeoutAt = Date.now() + timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.url, {
      method: "GET",
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "Coast Internet Radio metadata check"
      },
      signal: controller.signal
    });

    const headers = {
      status: response.status,
      contentType: headerValue(response.headers, "content-type"),
      icyMetaInt: headerValue(response.headers, "icy-metaint"),
      icyName: headerValue(response.headers, "icy-name"),
      icyGenre: headerValue(response.headers, "icy-genre"),
      icyUrl: headerValue(response.headers, "icy-url"),
      server: headerValue(response.headers, "server")
    };

    if (!response.ok) {
      clearTimeout(timer);
      return {
        label: target.label,
        url: target.url,
        reachable: false,
        metadataSupported: false,
        headers,
        error: `Stream responded with HTTP ${response.status}`
      };
    }

    const metaint = Number.parseInt(headers.icyMetaInt, 10);
    if (!Number.isFinite(metaint) || metaint <= 0) {
      // Read a tiny sample so the connection is properly tested, then stop.
      await readEnough(response, 2048, timeoutAt);
      clearTimeout(timer);
      return {
        label: target.label,
        url: target.url,
        reachable: true,
        metadataSupported: false,
        headers,
        streamTitle: "",
        parsed: { artist: "", track: "", raw: "" },
        note: "The stream responded, but did not provide an icy-metaint header after requesting ICY metadata."
      };
    }

    // First read enough bytes to reach the metadata length byte.
    let buffer = await readEnough(response, metaint + 1, timeoutAt);
    if (buffer.length < metaint + 1) {
      clearTimeout(timer);
      return {
        label: target.label,
        url: target.url,
        reachable: true,
        metadataSupported: true,
        headers,
        streamTitle: "",
        parsed: { artist: "", track: "", raw: "" },
        error: "The stream exposed ICY metadata, but the test timed out before the metadata block was fully received."
      };
    }

    const metadataLength = buffer[metaint] * 16;
    const required = metaint + 1 + metadataLength;
    if (metadataLength > 0 && buffer.length < required) {
      const additional = await readEnough(response, required - buffer.length, timeoutAt);
      buffer = Buffer.concat([buffer, additional]);
    }

    const metadataRaw = metadataLength > 0
      ? buffer.slice(metaint + 1, metaint + 1 + metadataLength).toString("utf8").replace(/\u0000+$/g, "").trim()
      : "";

    const match = metadataRaw.match(/StreamTitle='([^']*)'/i) || metadataRaw.match(/StreamTitle=\"([^\"]*)\"/i);
    const streamTitle = normaliseTitle(match ? match[1] : metadataRaw);

    clearTimeout(timer);
    return {
      label: target.label,
      url: target.url,
      reachable: true,
      metadataSupported: true,
      headers,
      metadataLength,
      metadataRaw,
      streamTitle,
      parsed: splitArtistTitle(streamTitle),
      usableForNowPlaying: !!streamTitle
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      label: target.label,
      url: target.url,
      reachable: false,
      metadataSupported: false,
      error: `${error && error.name ? error.name : "Error"}: ${error && error.message ? error.message : String(error)}`
    };
  }
}

exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (auth.error) return auth.error;
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const results = [];
  for (const target of STREAM_TARGETS) {
    results.push(await testTarget(target));
  }

  const usable = results.find((item) => item.usableForNowPlaying && item.streamTitle);
  const reachable = results.find((item) => item.reachable);

  let conclusion = "stream_unreachable";
  let plainEnglish = "The stream could not be reached from the website server during this test.";
  let nextStep = "Check whether the live stream is online, then run the test again.";

  if (usable) {
    conclusion = "metadata_found";
    plainEnglish = "Good news: the stream is sending song title metadata. A separate now-playing system can be built without relying on the old website page.";
    nextStep = "Build a scheduled metadata reader that saves current and recently played songs for the homepage.";
  } else if (reachable) {
    conclusion = "stream_reachable_no_song_metadata_found";
    plainEnglish = "The stream is reachable, but this test did not find usable song title metadata in the stream.";
    nextStep = "If the old page still shows song titles, the old page is probably getting data from another source. Without access to that source, the fallback options are keeping the old page as a temporary source or using audio recognition.";
  }

  return json(200, {
    ok: true,
    testedAt: new Date().toISOString(),
    conclusion,
    plainEnglish,
    nextStep,
    results
  });
};
