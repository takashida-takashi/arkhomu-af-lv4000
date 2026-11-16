(() => {
  "use strict";

  const topLevel = window.top === window;
  const embedded = !topLevel && window.parent === window.top &&
    window.frameElement?.hasAttribute("data-ha4-slot-home-frame") === true;
  globalThis.hakoAfFrameContext = { active: topLevel || embedded, embedded };
})();
