export default {
  async fetch(request) {
    const CONFIRMED_STREAM_URL = "http://65.108.98.93:7293/live";
    const url = new URL(request.url);

    if (url.pathname === "/stream") {
      const upstream = await fetch(CONFIRMED_STREAM_URL, {
        headers: { "User-Agent": "Mozilla/5.0 CoastInternetRadioWebsite" }
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "audio/mpeg",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Coast Internet Radio stream proxy is running. Use /stream", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
};
