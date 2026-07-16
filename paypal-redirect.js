(() => {
  "use strict";

  const root = document.documentElement;
  const highContrast = root.dataset.contrast === "high";
  const dark = root.dataset.theme === "dark" || highContrast;
  const logo = document.getElementById("handoff-logo");
  const themeColor = document.getElementById("theme-color");

  if (logo && !dark && logo.dataset.lightSrc) {
    logo.src = logo.dataset.lightSrc;
  }

  if (themeColor) {
    themeColor.content = highContrast ? "#000000" : dark ? "#0b0f15" : "#f6f1e6";
  }

  document.getElementById("paypal-form")?.submit();
})();
