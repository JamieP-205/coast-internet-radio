window.COAST_RADIO_CONFIG = {
  streamUrl: "https://coast-stream.jamieparr05.workers.dev/stream",
  metadataProxyUrl: "https://coast-metadata.jamieparr05.workers.dev",
  siteUrl: "https://coastinternetradio.com",
  tuneInUrl: "https://coast-stream.jamieparr05.workers.dev/stream",
  radioGardenUrl: "https://radio.garden/listen/coast-internet-radio/qHxj8c7q",
  ieRadioUrl: "https://ieradio.org/coast-internet-c-i-r/",
  backupPlayerUrl: "https://www.liveradio.uk/stations/coast-internet-radio",
  facebookUrl: "https://www.facebook.com/share/1aN1Jtus5Y/",
  xUrl: "https://x.com/coast_radio",
  email: "coastradio@hotmail.com",
  requestPhoneDisplay: "07935 889228",
  requestPhoneHref: "sms:+447935889228",
  paypalUrl: "/paypal-redirect.html",
  newsUrl: "news.json"
};

(function () {
  const originalFetch = window.fetch.bind(window);
  const hiddenHelperIntents = new Set(["privacy", "terms"]);
  const retiredPagePattern = /\/(?:privacy|terms)\.html(?:$|[?#])/i;

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const response = await originalFetch(input, init);

    if (!url || !url.includes("/station-helper-knowledge.json")) return response;

    try {
      const data = await response.clone().json();

      if (Array.isArray(data.quickActions)) {
        data.quickActions = data.quickActions.filter((id) => !hiddenHelperIntents.has(id));
      }

      if (data.fallback && Array.isArray(data.fallback.related)) {
        data.fallback.related = data.fallback.related.filter((id) => !hiddenHelperIntents.has(id));
      }

      if (Array.isArray(data.intents)) {
        data.intents = data.intents
          .filter((intent) => !hiddenHelperIntents.has(intent.id))
          .map((intent) => ({
            ...intent,
            related: Array.isArray(intent.related)
              ? intent.related.filter((id) => !hiddenHelperIntents.has(id))
              : intent.related,
            actions: Array.isArray(intent.actions)
              ? intent.actions.filter((action) => !retiredPagePattern.test(action.url || ""))
              : intent.actions
          }));
      }

      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.delete("content-length");

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };
})();
