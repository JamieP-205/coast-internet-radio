(function () {
  "use strict";

  const DATA_URL = "/station-helper-knowledge.json?v=20260514-listener-audio-final";
  const MAX_SUGGESTIONS = 4;
  const STORAGE_KEY = "coast-station-helper-seen";

  const fallbackKnowledge = {
    intro: "I can help with listening live, audio problems, show times, requests, support and where else to listen.",
    quickActions: ["listen_live", "stream_help", "schedule", "song_request"],
    fallback: {
      title: "I can help with common station questions.",
      answer: "Try asking about no sound, the play button, phone playback, show times, requests, support or where else to listen.",
      related: ["listen_live", "stream_help", "schedule", "song_request"]
    },
    synonyms: {},
    intents: [
      {
        id: "listen_live",
        title: "How do I listen live?",
        category: "Listening",
        priority: 100,
        keywords: ["listen", "live", "play", "stream", "radio"],
        patterns: ["listen live", "play radio", "start stream"],
        answer: "Tap the Listen Live button near the top of the page. If playback does not start, refresh the page and press play again.",
        actions: [{ label: "Go to player", type: "scroll", target: "#listen" }],
        related: ["stream_help", "schedule", "song_request"]
      },
      {
        id: "stream_help",
        title: "The stream is not playing. What should I try?",
        category: "Player help",
        priority: 90,
        keywords: ["not", "working", "sound", "stopped", "broken"],
        patterns: ["stream not working", "no sound", "radio not playing"],
        answer: "Check your device volume, then tap the Listen Live button again. If it still does not work, refresh the page and press play once more.",
        actions: [{ label: "Go to player", type: "scroll", target: "#listen" }],
        related: ["listen_live"]
      },
      {
        id: "schedule",
        title: "When is Jim Parr live?",
        category: "Shows",
        priority: 90,
        keywords: ["jim", "schedule", "show", "time", "live"],
        patterns: ["when is jim live", "show times", "schedule"],
        answer: "Jim’s usual live shows are Monday, Tuesday, Thursday and Friday from 10am to 12pm, plus Sunday from 10am to 1pm.",
        actions: [{ label: "View schedule", type: "scroll", target: "#schedule" }],
        related: ["song_request", "listen_live"]
      },
      {
        id: "song_request",
        title: "How do I request a song?",
        category: "Requests",
        priority: 90,
        keywords: ["request", "song", "text", "message"],
        patterns: ["request a song", "song request", "send a message"],
        answer: "Use the Request a Song button on the website. You can also text song requests or messages using the number shown in the request area.",
        actions: [{ label: "Open request form", type: "click", target: "#request-link" }],
        related: ["schedule", "listen_live"]
      }
    ]
  };

  let knowledge = null;
  let loadingPromise = null;
  let ui = null;
  let lastFocus = null;

  function normalise(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function words(value) {
    const clean = normalise(value);
    return clean ? clean.split(" ").filter(Boolean) : [];
  }

  function levenshtein(a, b) {
    a = normalise(a);
    b = normalise(b);
    if (!a) return b.length;
    if (!b) return a.length;
    if (a === b) return 0;

    const previous = new Array(b.length + 1);
    const current = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j += 1) previous[j] = j;

    for (let i = 1; i <= a.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      }
      for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length];
  }

  function typoClose(queryWord, candidateWord) {
    if (!queryWord || !candidateWord) return false;
    if (queryWord.length < 4 || candidateWord.length < 4) return false;
    if (Math.abs(queryWord.length - candidateWord.length) > 2) return false;
    const distance = levenshtein(queryWord, candidateWord);
    return distance <= (Math.min(queryWord.length, candidateWord.length) >= 7 ? 2 : 1);
  }

  function getSynonymWords(queryWords, data) {
    const out = new Set(queryWords);
    const synonyms = data.synonyms || {};
    for (const word of queryWords) {
      for (const [root, values] of Object.entries(synonyms)) {
        const list = Array.isArray(values) ? values.map(normalise) : [];
        if (word === root || list.includes(word) || list.some((item) => typoClose(word, item))) {
          out.add(root);
          list.forEach((item) => out.add(item));
        }
      }
    }
    return Array.from(out);
  }

  function scoreIntent(rawQuery, intent, data) {
    const query = normalise(rawQuery);
    if (!query) return 0;

    const queryWords = words(query);
    const expandedWords = getSynonymWords(queryWords, data);
    const title = normalise(intent.title);
    const patterns = Array.isArray(intent.patterns) ? intent.patterns.map(normalise) : [];
    const keywords = Array.isArray(intent.keywords) ? intent.keywords.map(normalise) : [];
    const category = normalise(intent.category);

    let score = 0;

    if (title === query) score += 240;
    else if (title.startsWith(query)) score += 170;
    else if (title.includes(query)) score += 120;

    for (const pattern of patterns) {
      if (!pattern) continue;
      if (pattern === query) score += 210;
      else if (pattern.startsWith(query)) score += 150;
      else if (pattern.includes(query)) score += 105;
      else if (query.length >= 5 && levenshtein(query, pattern) <= 3) score += 60;
    }

    for (const key of keywords) {
      if (!key) continue;
      if (query === key || query.includes(key)) score += 58;
      if (expandedWords.includes(key)) score += 45;
      for (const word of queryWords) {
        if (word === key) score += 50;
        else if (typoClose(word, key)) score += 28;
      }
    }

    for (const word of queryWords) {
      if (category && typoClose(word, category)) score += 18;
      if (title.split(" ").some((part) => typoClose(word, part))) score += 18;
      for (const pattern of patterns) {
        if (pattern.split(" ").some((part) => typoClose(word, part))) score += 10;
      }
    }

    const allIntentWords = new Set([...words(intent.title), ...keywords, ...patterns.flatMap(words)]);
    const matches = expandedWords.filter((word) => allIntentWords.has(word));
    if (matches.length) score += Math.min(80, matches.length * 20);

    score += Math.min(20, Number(intent.priority || 0) / 8);
    return score;
  }

  function currentData() {
    return knowledge || fallbackKnowledge;
  }

  function findIntent(id) {
    const data = currentData();
    return (data.intents || []).find((intent) => intent.id === id) || null;
  }

  function quickIntents(data, limit) {
    const ids = Array.isArray(data.quickActions) ? data.quickActions : [];
    const picked = ids.map((id) => (data.intents || []).find((intent) => intent.id === id)).filter(Boolean);
    const rest = (data.intents || [])
      .filter((intent) => !ids.includes(intent.id))
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    return picked.concat(rest).slice(0, limit || MAX_SUGGESTIONS);
  }

  function search(query, limit) {
    const data = currentData();
    const clean = normalise(query);
    if (!clean) return quickIntents(data, limit || MAX_SUGGESTIONS);

    const scored = (data.intents || [])
      .map((intent) => ({ intent, score: scoreIntent(clean, intent, data) }))
      .filter((item) => item.score > 18)
      .sort((a, b) => b.score - a.score || String(a.intent.title).localeCompare(String(b.intent.title)));

    return scored.slice(0, limit || MAX_SUGGESTIONS).map((item) => item.intent);
  }

  async function loadKnowledge() {
    if (knowledge) return knowledge;
    if (loadingPromise) return loadingPromise;

    loadingPromise = fetch(DATA_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("helper data unavailable");
        return response.json();
      })
      .then((data) => {
        if (!data || !Array.isArray(data.intents)) throw new Error("helper data invalid");
        knowledge = data;
        return knowledge;
      })
      .catch(() => {
        knowledge = fallbackKnowledge;
        return knowledge;
      });

    return loadingPromise;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function makeButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function buildUI() {
    const root = el("section", "station-helper", "");
    root.setAttribute("aria-label", "Station help");

    const toggle = makeButton("", "station-helper-toggle", openHelper);
    toggle.setAttribute("aria-label", "Open station help");
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-expanded", "false");

    const mark = el("span", "station-helper-mark", "?");
    mark.setAttribute("aria-hidden", "true");
    const label = el("span", "station-helper-toggle-text", "Help");
    toggle.append(mark, label);

    const panel = el("div", "station-helper-panel", "");
    panel.id = "station-helper-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "station-helper-title");
    panel.hidden = true;

    const header = el("div", "station-helper-header", "");
    const titleWrap = el("div", "station-helper-title-wrap", "");
    const title = el("h2", "", "Station Helper");
    title.id = "station-helper-title";
    const subtitle = el("p", "", "Quick help for listening, requests and show times.");
    titleWrap.append(title, subtitle);

    const close = makeButton("Close", "station-helper-close", closeHelper);
    close.setAttribute("aria-label", "Close station help");
    header.append(titleWrap, close);

    const body = el("div", "station-helper-body", "");
    const messages = el("div", "station-helper-messages", "");
    messages.setAttribute("aria-live", "polite");
    messages.setAttribute("aria-label", "Station helper conversation");

    const suggestions = el("div", "station-helper-suggestions", "");
    suggestions.setAttribute("aria-label", "Suggested questions");

    const form = el("form", "station-helper-search", "");
    form.setAttribute("role", "search");
    const inputLabel = el("label", "sr-only", "Ask a station question");
    inputLabel.setAttribute("for", "station-helper-input");
    const input = document.createElement("input");
    input.id = "station-helper-input";
    input.type = "search";
    input.autocomplete = "off";
    input.spellcheck = true;
    input.maxLength = 160;
    input.placeholder = "Type a question…";
    input.setAttribute("aria-label", "Ask a station question");
    const submit = makeButton("Send", "station-helper-ask", () => {});
    submit.type = "submit";
    form.append(inputLabel, input, submit);

    const foot = el("div", "station-helper-compose", "");
    foot.append(suggestions, form);

    body.append(messages, foot);
    panel.append(header, body);
    root.append(toggle, panel);
    document.body.appendChild(root);

    let debounce = null;

    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderSuggestions(input.value), 70);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeHelper();
      if (event.key === "ArrowUp") {
        const last = suggestions.querySelector("button:last-of-type");
        if (last) {
          event.preventDefault();
          last.focus();
        }
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      ask(input.value);
    });

    panel.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && ui && !ui.panel.hidden) closeHelper();
    });

    ui = { root, toggle, panel, close, input, suggestions, messages };
  }

  async function openHelper() {
    if (!ui) return;
    lastFocus = document.activeElement;
    ui.panel.hidden = false;
    ui.toggle.setAttribute("aria-expanded", "true");
    ui.root.classList.add("is-open");
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch (_) {}

    await loadKnowledge();
    if (!ui.messages.childElementCount) renderWelcome();
    renderSuggestions("");
    window.setTimeout(() => ui.input.focus({ preventScroll: true }), 50);
  }

  function closeHelper() {
    if (!ui) return;
    ui.panel.hidden = true;
    ui.toggle.setAttribute("aria-expanded", "false");
    ui.root.classList.remove("is-open");
    if (lastFocus && typeof lastFocus.focus === "function") {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) { lastFocus.focus(); }
    }
  }

  function renderWelcome() {
    const data = currentData();
    const row = el("div", "station-helper-row station-helper-row-bot", "");
    const avatar = el("span", "station-helper-avatar", "?");
    avatar.setAttribute("aria-hidden", "true");
    const bubble = el("article", "station-helper-bubble station-helper-bubble-bot", "");
    bubble.append(el("strong", "", "Hi, how can I help?"));
    bubble.append(el("p", "", data.intro || fallbackKnowledge.intro));
    row.append(avatar, bubble);
    ui.messages.appendChild(row);
    trimHistory(1);
    scrollMessages();
  }

  function ask(value) {
    const clean = String(value || "").trim().slice(0, 160);
    if (!clean) {
      ui.input.focus();
      return;
    }

    renderUserMessage(clean);
    const results = search(clean, 1);
    const data = currentData();
    if (results.length && scoreIntent(clean, results[0], data) > 35) {
      renderAnswer(results[0]);
      try { document.dispatchEvent(new CustomEvent("coast:helper-intent", { detail: { intent_id: results[0].id || "unknown" } })); } catch (_) {}
    } else {
      renderFallback(clean);
      try { document.dispatchEvent(new CustomEvent("coast:helper-no-result", { detail: { query_length: clean.length } })); } catch (_) {}
    }
    ui.input.value = "";
    renderSuggestions("");
  }

  function chooseSuggestion(intent) {
    if (!intent) return;
    renderUserMessage(intent.title);
    renderAnswer(intent);
    try { document.dispatchEvent(new CustomEvent("coast:helper-intent", { detail: { intent_id: intent.id || "unknown" } })); } catch (_) {}
    ui.input.value = "";
    renderSuggestions("");
  }

  function renderUserMessage(value) {
    const row = el("div", "station-helper-row station-helper-row-user", "");
    const bubble = el("p", "station-helper-bubble station-helper-bubble-user", value);
    row.appendChild(bubble);
    ui.messages.appendChild(row);
    trimHistory(6);
    scrollMessages();
  }

  function renderSuggestions(query) {
    if (!ui) return;
    ui.suggestions.textContent = "";
    const results = search(query, MAX_SUGGESTIONS);
    if (!results.length) return;

    const heading = el("p", "station-helper-suggestions-title", query ? "Tap a match" : "Popular help");
    const list = el("div", "station-helper-chip-list", "");

    for (const intent of results) {
      const chip = makeButton(intent.title, "station-helper-chip", () => chooseSuggestion(intent));
      chip.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          ui.input.focus();
        }
      });
      list.appendChild(chip);
    }

    ui.suggestions.append(heading, list);
  }

  function renderFallback(originalQuery) {
    const data = currentData();
    const fallback = data.fallback || fallbackKnowledge.fallback;
    const card = makeBotBubble(fallback.title || "I can help with common station questions.", fallback.answer || fallbackKnowledge.fallback.answer, "Help");
    const related = relatedIntents(fallback.related || [], originalQuery);
    if (related.length) card.querySelector(".station-helper-bubble").appendChild(relatedButtons(related));
    ui.messages.appendChild(card);
    trimHistory(6);
    scrollMessages();
  }

  function renderAnswer(intent) {
    if (!intent || !ui) return;
    const row = makeBotBubble(intent.title || "Answer", intent.answer || "", intent.category || "Help");
    const bubble = row.querySelector(".station-helper-bubble");

    const actions = safeActions(intent.actions || []);
    if (actions.length) {
      const actionWrap = el("div", "station-helper-actions", "");
      for (const action of actions) actionWrap.appendChild(actionButton(action));
      bubble.appendChild(actionWrap);
    }

    const related = relatedIntents(intent.related || []);
    if (related.length) bubble.appendChild(relatedButtons(related));

    ui.messages.appendChild(row);
    trimHistory(6);
    scrollMessages();
  }

  function makeBotBubble(title, answer, category) {
    const row = el("div", "station-helper-row station-helper-row-bot", "");
    const avatar = el("span", "station-helper-avatar", "?");
    avatar.setAttribute("aria-hidden", "true");
    const bubble = el("article", "station-helper-bubble station-helper-bubble-bot", "");
    if (category) bubble.append(el("span", "station-helper-meta", category));
    bubble.append(el("strong", "", title));
    if (answer) bubble.append(el("p", "", answer));
    row.append(avatar, bubble);
    return row;
  }

  function safeActions(actions) {
    return actions.filter((action) => {
      if (!action || typeof action !== "object") return false;
      if (!["scroll", "click", "link"].includes(action.type)) return false;
      if (!action.label || String(action.label).length > 60) return false;
      if ((action.type === "scroll" || action.type === "click") && !String(action.target || "").startsWith("#") && !String(action.target || "").startsWith(".")) return false;
      if (action.type === "link") {
        try {
          const url = new URL(String(action.url || ""), window.location.origin);
          return url.origin === window.location.origin || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "sms:";
        } catch (_) { return false; }
      }
      return true;
    }).slice(0, 3);
  }

  function actionButton(action) {
    return makeButton(action.label, "station-helper-action", () => {
      if (action.type === "scroll") {
        const target = document.querySelector(action.target);
        if (target) {
          closeHelper();
          target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
        }
      }
      if (action.type === "click") {
        const target = document.querySelector(action.target);
        if (target instanceof HTMLElement) {
          closeHelper();
          window.setTimeout(() => target.click(), 120);
        }
      }
      if (action.type === "link") {
        const url = new URL(action.url, window.location.origin);
        if (url.origin === window.location.origin) window.location.href = url.href;
        else window.open(url.href, "_blank", "noopener,noreferrer");
      }
    });
  }

  function relatedIntents(ids, query) {
    const data = currentData();
    const results = [];
    const seen = new Set();

    for (const id of ids) {
      const intent = findIntent(id);
      if (intent && !seen.has(intent.id)) {
        results.push(intent);
        seen.add(intent.id);
      }
    }

    if (results.length < 2 && query) {
      for (const intent of search(query, 3)) {
        if (!seen.has(intent.id)) {
          results.push(intent);
          seen.add(intent.id);
        }
      }
    }

    if (results.length < 2) {
      for (const intent of quickIntents(data, 3)) {
        if (!seen.has(intent.id)) {
          results.push(intent);
          seen.add(intent.id);
        }
      }
    }

    return results.slice(0, 2);
  }

  function relatedButtons(intents) {
    const wrap = el("div", "station-helper-related", "");
    wrap.append(el("p", "", "Related"));
    for (const intent of intents) wrap.appendChild(makeButton(intent.title, "station-helper-related-button", () => chooseSuggestion(intent)));
    return wrap;
  }

  function trimHistory(maxRows) {
    if (!ui) return;
    const rows = Array.from(ui.messages.querySelectorAll('.station-helper-row'));
    const keep = Number(maxRows || 6);
    while (rows.length > keep) {
      const first = rows.shift();
      if (first && first.parentNode === ui.messages) first.remove();
    }
  }

  function scrollMessages() {
    if (!ui) return;
    window.requestAnimationFrame(() => {
      const rows = ui.messages.querySelectorAll('.station-helper-row');
      const latest = rows[rows.length - 1];
      if (latest) {
        const targetTop = Math.max(0, latest.offsetTop - 8);
        ui.messages.scrollTop = targetTop;
      }
    });
  }

  function reducedMotion() {
    return document.documentElement.getAttribute("data-motion") === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function init() {
    buildUI();
    const seen = (() => {
      try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch (_) { return true; }
    })();
    if (!seen && ui && window.matchMedia("(min-width: 820px)").matches) {
      ui.root.classList.add("has-gentle-prompt");
      window.setTimeout(() => ui.root && ui.root.classList.remove("has-gentle-prompt"), 8000);
    }
    window.CoastStationHelper = {
      open: openHelper,
      close: closeHelper,
      search: (query) => search(query, MAX_SUGGESTIONS).map((intent) => ({ id: intent.id, title: intent.title }))
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
