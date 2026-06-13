export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const streamStatusUrl = "http://65.108.98.93:7293/status-json.xsl";

    try {
      const upstream = await fetch(streamStatusUrl, {
        headers: { "User-Agent": "CoastInternetRadioWebsite/1.0" }
      });

      if (!upstream.ok) {
        return json({ status: "error", online: false, message: `Stream status returned ${upstream.status}` }, 502);
      }

      const payload = await upstream.json();
      const source = Array.isArray(payload?.icestats?.source)
        ? payload.icestats.source[0]
        : payload?.icestats?.source;

      const rawTitle = clean(source?.title || source?.yp_currently_playing || source?.server_name || "");
      const split = splitTrack(rawTitle);

      return json({
        status: "ok",
        online: Boolean(source),
        listeners: Number(source?.listeners || 0),
        now: {
          rawTitle,
          artist: split.artist,
          title: split.title
        },
        fetchedAt: new Date().toISOString()
      });
    } catch (error) {
      return json({ status: "error", online: false, message: error.message }, 502);
    }
  }
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitTrack(raw) {
  const value = clean(raw);
  if (!value) return { artist: "", title: "" };
  for (const sep of [" - ", " – ", " — ", " | "]) {
    if (value.includes(sep)) {
      const [artist, ...rest] = value.split(sep);
      return { artist: clean(artist), title: clean(rest.join(sep)) };
    }
  }
  return { artist: "Coast Internet Radio", title: value };
}
