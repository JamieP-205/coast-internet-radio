/*
 * Coast Internet Radio - managed content loader
 * Reads safe public website settings from the private admin panel.
 */
(() => {
  "use strict";

  const PUBLIC_CONTENT_URL = "/.netlify/functions/public-content";
  const LIVE_STATUS_URL = "/.netlify/functions/public-live-status";
  const REFRESH_MS = 2 * 60 * 1000;
  const LIVE_REFRESH_MS = 60 * 1000;
  let latestContent = null;
  let applying = false;
  let liveStatusStarted = false;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const liveUI = window.CoastLiveUI || {};

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function setHref(id, href) {
    const el = document.getElementById(id);
    if (el && href) el.href = href;
  }

  function updateContactLinks(content) {
    if (!content || !content.contact) return;
    const c = content.contact;

    if (c.facebookUrl) {
      setHref("facebook-link", c.facebookUrl);
      setHref("footer-facebook", c.facebookUrl);
    }
    if (c.xUrl) setHref("footer-x", c.xUrl);
    if (c.paypalUrl) setHref("paypal-link", c.paypalUrl);
    window.CoastListenOptions?.setLinks?.(content.listenLinks);
    if (c.email) {
      setHref("footer-email", `mailto:${c.email}`);
      setHref("request-mailto", `mailto:${c.email}?subject=${encodeURIComponent("Song request for Coast Internet Radio")}`);
    }
    if (c.requestPhoneDisplay) {
      ["request-phone-link", "request-sms"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = c.requestPhoneDisplay;
        if (c.requestPhoneHref) el.href = c.requestPhoneHref;
      });
    }
  }

  function updateSimpleText(content) {
    if (!content || !content.homepage) return;
    const h = content.homepage;
    const playSubtitle = document.querySelector(".play-subtitle");
    if (playSubtitle && h.playSubtitle) playSubtitle.textContent = cleanText(h.playSubtitle);

    const supportPanelText = document.querySelector(".support-panel p:not(.section-title):not(.support-script)");
    if (supportPanelText && h.supportMessage) supportPanelText.textContent = cleanText(h.supportMessage);
  }

  function updateAnnouncement(content) {
    // The banner is pre-rendered in index.html so the page does not shift
    // when public-content arrives. We update its text/link or hide it.
    const banner = document.getElementById("managed-announcement-banner");
    if (!banner) return;
    const a = content && content.announcement;

    if (!a || !a.enabled || !cleanText(a.text)) {
      banner.hidden = true;
      banner.replaceChildren();
      return;
    }

    banner.replaceChildren();
    const p = document.createElement("p");
    p.textContent = cleanText(a.text);
    banner.appendChild(p);

    if (a.linkUrl && a.linkLabel) {
      const link = document.createElement("a");
      link.href = a.linkUrl;
      link.textContent = cleanText(a.linkLabel);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      banner.appendChild(link);
    }

    banner.hidden = false;
  }

  function hideManagedNews() {
    const wrap = document.getElementById("news-items");
    const card = document.getElementById("news-card");
    if (wrap) wrap.replaceChildren();
    if (card) {
      card.hidden = true;
      card.classList.remove("is-empty");
    }
  }

  function renderManagedNews(content) {
    const news = content && content.news;
    const wrap = document.getElementById("news-items");
    const card = document.getElementById("news-card");

    if (!wrap || !card) return;
    if (!news || !news.active || !cleanText(news.title)) {
      hideManagedNews();
      return;
    }

    applying = true;
    try {
      wrap.replaceChildren();
      card.classList.remove("is-empty");
      const article = document.createElement("article");
      article.className = "news-item";

      const h = document.createElement("h3");
      h.textContent = cleanText(news.title);
      article.appendChild(h);

      if (news.date) {
        const d = document.createElement("p");
        d.className = "news-date";
        d.textContent = cleanText(news.date);
        article.appendChild(d);
      }

      if (news.body) {
        const p = document.createElement("p");
        p.className = "news-body";
        p.textContent = cleanText(news.body);
        article.appendChild(p);
      }

      if (news.link && news.linkLabel) {
        const a = document.createElement("a");
        a.href = news.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "news-link";
        a.textContent = cleanText(news.linkLabel);
        article.appendChild(a);
      }

      wrap.appendChild(article);
      card.hidden = false;
    } finally {
      applying = false;
    }
  }

  function updateDisplayVisibility(content = latestContent) {
    liveUI.setDisplayContent?.(content);
  }

  function updateProgrammeStatus(statusData) {
    liveUI.updateProgrammeStatus?.(statusData);
  }

  function updateListenerCount(value, content = latestContent) {
    liveUI.updateListenerCount?.(value, content);
  }

  async function refreshLiveStatus() {
    try {
      const response = await fetch(`${LIVE_STATUS_URL}?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) return;
      const data = await response.json();
      updateProgrammeStatus(data);
      updateDisplayVisibility();
      updateListenerCount(data?.live?.listeners);
    } catch {
      updateDisplayVisibility();
    }
  }

  function startLiveStatus() {
    if (liveStatusStarted) return;
    liveStatusStarted = true;
    refreshLiveStatus();
    setInterval(refreshLiveStatus, LIVE_REFRESH_MS);
  }

  function applyContent(content) {
    if (!content) return;
    latestContent = content;
    updateContactLinks(content);
    updateSimpleText(content);
    updateAnnouncement(content);
    renderManagedNews(content);
    updateDisplayVisibility(content);
    startLiveStatus();
  }

  async function loadManagedContent() {
    try {
      const response = await fetch(`${PUBLIC_CONTENT_URL}?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) return;
      const content = await response.json();
      applyContent(content);
    } catch {
      // Leave the normal static website content in place.
    }
  }

  // If the older static news loader refreshes after this script, put the managed
  // news back without disturbing the rest of the page.
  const newsWrap = document.getElementById("news-items");
  if (newsWrap && "MutationObserver" in window) {
    const observer = new MutationObserver(() => {
      if (applying || !latestContent?.news?.active) return;
      setTimeout(() => renderManagedNews(latestContent), 30);
    });
    observer.observe(newsWrap, { childList: true, subtree: true });
  }

  loadManagedContent();
  window.addEventListener("focus", loadManagedContent);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadManagedContent();
  });
  setInterval(loadManagedContent, REFRESH_MS);
})();
