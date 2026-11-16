(() => {
  "use strict";

  if (performance.getEntriesByType("navigation")[0]?.type !== "reload") return;
  try {
    if (localStorage.getItem("hakoAf4000:autoUpdate") !== "false") {
      void chrome.runtime.sendMessage({ type: "hako-af:check-local-update" }).catch(() => {});
    }
  } catch { /* Keep loading the game if storage or the extension context is unavailable. */ }
})();
