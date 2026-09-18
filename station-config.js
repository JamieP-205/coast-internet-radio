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
  const languages = [
    ["en", "English (original)"],
    ["ga", "Gaeilge"],
    ["fr", "Français"],
    ["es", "Español"],
    ["de", "Deutsch"],
    ["it", "Italiano"],
    ["pl", "Polski"],
    ["pt", "Português"],
    ["ro", "Română"],
    ["nl", "Nederlands"],
    ["uk", "Українська"],
    ["lt", "Lietuvių"],
    ["lv", "Latviešu"],
    ["cs", "Čeština"],
    ["sk", "Slovenčina"],
    ["hu", "Magyar"],
    ["el", "Ελληνικά"],
    ["tr", "Türkçe"],
    ["ar", "العربية"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["zh-CN", "简体中文"],
    ["sv", "Svenska"],
    ["da", "Dansk"],
    ["no", "Norsk"]
  ];

  function originalPageUrl() {
    const translatedHost = /(?:^|\.)translate\.goog$|^translate\.google\./i.test(window.location.hostname);
    const configured = window.COAST_RADIO_CONFIG?.siteUrl;

    if (translatedHost && configured && /^https?:/i.test(configured)) {
      return configured;
    }

    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (canonical && /^https?:/i.test(canonical)) return canonical;
    if (configured && /^https?:/i.test(configured)) return configured;
    return window.location.href;
  }

  function currentTargetLanguage() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("_x_tr_tl") || params.get("tl") || "en";
    } catch (_) {
      return "en";
    }
  }

  function translateTo(language) {
    const originalUrl = originalPageUrl();

    if (!language || language === "en") {
      window.location.assign(originalUrl);
      return;
    }

    const translatedUrl =
      "https://translate.google.com/translate?sl=en&tl=" +
      encodeURIComponent(language) +
      "&u=" +
      encodeURIComponent(originalUrl);

    window.location.assign(translatedUrl);
  }

  function suppressOldLanguageBanner() {
    const banner = document.getElementById("lang-banner");
    if (!banner) return;

    const keepHidden = () => {
      banner.hidden = true;
      if (banner.childElementCount) banner.replaceChildren();
    };

    keepHidden();
    new MutationObserver(keepHidden).observe(banner, {
      attributes: true,
      attributeFilter: ["hidden", "class"],
      childList: true
    });
  }

  function installLanguagePicker() {
    const oldTranslateLink = document.getElementById("a11y-translate");
    if (!oldTranslateLink || document.getElementById("site-language")) return;

    const group = document.createElement("div");
    group.className = "a11y-group a11y-language-group";

    const heading = document.createElement("strong");
    heading.textContent = "Language";

    const field = document.createElement("div");
    field.className = "form-row";

    const label = document.createElement("label");
    label.className = "sr-only";
    label.htmlFor = "site-language";
    label.textContent = "Choose website language";

    const select = document.createElement("select");
    select.id = "site-language";
    select.name = "site-language";
    select.setAttribute("aria-label", "Choose website language");

    languages.forEach(([code, name]) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name;
      select.appendChild(option);
    });

    const selectedLanguage = currentTargetLanguage();
    if (languages.some(([code]) => code === selectedLanguage)) {
      select.value = selectedLanguage;
    }

    const help = document.createElement("p");
    help.className = "form-help";
    help.textContent = "Choose a language and the translated version will open here, not in a new tab.";

    select.addEventListener("change", () => translateTo(select.value));

    field.append(label, select, help);
    group.append(heading, field);
    oldTranslateLink.replaceWith(group);
  }

  suppressOldLanguageBanner();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installLanguagePicker, { once: true });
  } else {
    installLanguagePicker();
  }
})();
