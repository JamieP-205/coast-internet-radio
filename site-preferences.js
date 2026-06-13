(function () {
  "use strict";
  try {
    var raw = localStorage.getItem("coast-a11y") || "{}";
    var p = JSON.parse(raw);
    var html = document.documentElement;
    if (p.text) html.setAttribute("data-text", p.text);
    if (p.contrast) html.setAttribute("data-contrast", p.contrast);
    if (p.font) html.setAttribute("data-font", p.font);
    if (p.motion) html.setAttribute("data-motion", p.motion);
    if (p.theme) html.setAttribute("data-theme", p.theme);
  } catch (_) {}
})();
