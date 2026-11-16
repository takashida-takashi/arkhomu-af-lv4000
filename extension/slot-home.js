(() => {
  "use strict";

  const cabinetSelector = ".fx-slot-machine";
  const chatSelector = "#home-chat,.fx-home__chat";
  const modalSelector = 'dialog[open],[role="dialog"][aria-modal="true"]';
  const homePaths = new Set(["/", "/f", "/f/"]);
  const onSlotPage = path => /^\/slot\/?$/.test(path);
  const desktopSize = () => matchMedia("(min-width: 900px) and (min-height: 580px)").matches;

  function move(parent, element, before = null) {
    if (typeof parent.moveBefore === "function") parent.moveBefore(element, before);
    else parent.insertBefore(element, before);
  }

  function start(enabled) {
    let entry;
    let view;

    function close() {
      if (!view) return;
      const { shell, cabinet, marker, root, inert, cabinetObserver, frameObserver, resize,
        events, frameEvents, layoutFrame, returnFocus } = view;
      view = null;
      cancelAnimationFrame(layoutFrame);
      cabinetObserver.disconnect();
      frameObserver.disconnect();
      resize.disconnect();
      frameEvents?.abort();
      events.abort();
      if (marker.isConnected && cabinet.isConnected) move(marker.parentNode, cabinet, marker);
      marker.remove();
      root.inert = inert;
      delete document.documentElement.dataset.ha4SlotHomeActive;
      shell.remove();
      if (returnFocus.isConnected) {
        returnFocus.hidden = false;
        returnFocus.focus();
      }
    }

    function layout(current) {
      let home;
      let path;
      try {
        const location = current.frame.contentWindow.location;
        if (location.origin === window.location.origin) {
          home = homePaths.has(location.pathname);
          path = location.pathname;
        }
      } catch {
        home = false;
      }
      if (path && onSlotPage(path)) {
        close();
        return;
      }
      if (current.path !== path) {
        current.floating = false;
        current.path = path;
      }
      const child = current.frame.contentDocument;
      const { dock, resize, show } = current;
      const chat = home ? child?.querySelector(chatSelector) : null;
      if (current.chat !== chat) {
        if (current.chat) resize.unobserve(current.chat);
        if (chat) resize.observe(chat);
        current.chat = chat;
      }

      const rect = chat?.getBoundingClientRect();
      const overlapsChat = desktopSize() && rect?.width >= 240 && rect.height >= 240 && rect.right > 0 &&
        rect.left < window.innerWidth && rect.bottom > 140 && rect.top < window.innerHeight - 140;
      dock.toggleAttribute("data-ha4-slot-over-chat", !!overlapsChat);
      const floating = !overlapsChat && desktopSize() && current.floating;
      dock.toggleAttribute("data-ha4-slot-collapsed", !overlapsChat && !floating);
      show.hidden = !!overlapsChat || !desktopSize();
      const label = floating ? "台をたたむ" : "台を表示";
      if (show.textContent !== label) show.textContent = label;
      show.setAttribute("aria-expanded", String(!!floating));
      if (overlapsChat) {
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        dock.style.setProperty("--ha4-slot-left", `${left}px`);
        dock.style.setProperty("--ha4-slot-top", `${top}px`);
        dock.style.setProperty("--ha4-slot-width", `${Math.min(window.innerWidth, rect.right) - left}px`);
        dock.style.setProperty("--ha4-slot-height", `${Math.min(window.innerHeight, rect.bottom) - top}px`);
      }
      const modal = child && Array.from(child.querySelectorAll(modalSelector))
        .some(item => item.getClientRects().length && child.defaultView.getComputedStyle(item).visibility === "visible");
      dock.classList.toggle("ha4-slot-home-obscured", !!modal);
    }

    function schedule(current) {
      if (current !== view || current.layoutFrame) return;
      current.layoutFrame = requestAnimationFrame(() => {
        current.layoutFrame = 0;
        if (current === view) layout(current);
      });
    }

    function watchFrame(current) {
      const { frame, frameObserver, resize } = current;
      frameObserver.disconnect();
      resize.disconnect();
      current.chat = null;
      current.frameEvents?.abort();
      const child = frame.contentDocument;
      if (child?.documentElement) {
        current.frameEvents = new AbortController();
        const { signal } = current.frameEvents;
        child.addEventListener("scroll", () => schedule(current), { capture: true, passive: true, signal });
        child.defaultView?.addEventListener("popstate", () => schedule(current), { signal });
        frameObserver.observe(child.documentElement, { childList: true, subtree: true, attributes: true,
          attributeFilter: ["class", "hidden", "aria-modal", "open"] });
        resize.observe(child.documentElement);
      }
      schedule(current);
    }

    function open(cabinet, returnFocus) {
      const root = document.getElementById("__nuxt");
      if (view || !enabled() || !desktopSize() || !root?.contains(cabinet)) return;
      const marker = document.createComment("");
      cabinet.before(marker);

      const shell = document.createElement("div");
      shell.dataset.ha4 = "slot-home";
      const frame = document.createElement("iframe");
      frame.title = "はこホムの操作画面";
      const dock = document.createElement("section");
      dock.dataset.ha4 = "slot-home-dock";
      dock.setAttribute("data-ha4-slot-collapsed", "");
      dock.setAttribute("aria-label", "スロット");
      const toolbar = document.createElement("div");
      const show = document.createElement("button");
      show.type = "button";
      show.dataset.ha4 = "extra-button";
      show.textContent = "台を表示";
      const exit = document.createElement("button");
      exit.type = "button";
      exit.dataset.ha4 = "extra-button";
      exit.textContent = "スロット画面に戻る";
      toolbar.append(show, exit);
      dock.append(toolbar);
      shell.append(frame, dock);

      const events = new AbortController();
      const current = {
        shell, frame, dock, cabinet, marker, root, inert: root.inert, events, returnFocus, show, floating: false,
        cabinetObserver: new MutationObserver(() => { if (view === current && !cabinet.isConnected) close(); }),
        frameObserver: new MutationObserver(() => schedule(current)),
        resize: new ResizeObserver(() => schedule(current)),
        layoutFrame: 0
      };
      view = current;
      const { signal } = events;
      exit.addEventListener("click", close, { signal });
      show.addEventListener("click", () => {
        current.floating = !current.floating;
        layout(current);
      }, { signal });
      window.addEventListener("resize", () => schedule(current), { passive: true, signal });
      frame.addEventListener("load", () => watchFrame(current), { signal });
      frame.src = "/";
      document.body.append(shell);
      move(dock, cabinet);
      current.cabinetObserver.observe(dock, { childList: true });
      document.documentElement.dataset.ha4SlotHomeActive = "";
      root.inert = true;
      returnFocus.hidden = true;
      exit.focus();
    }

    return function refresh() {
      const cabinet = enabled() && desktopSize() && onSlotPage(location.pathname) && !new URLSearchParams(location.search).has("preview") &&
        document.querySelector(`#__nuxt ${cabinetSelector}`);
      if (view) {
        if (!enabled() || !view.marker.isConnected || !view.cabinet.isConnected) close();
        else return;
      }
      if (entry && (!cabinet || entry.cabinet !== cabinet || !entry.button.isConnected)) {
        entry.button.remove();
        entry = null;
      }
      if (entry) entry.button.hidden = false;
      if (!cabinet) return;
      const heading = [...document.querySelectorAll("#__nuxt h1")].find(element =>
        [...element.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim() === "スロット"));
      const anchor = heading ?? cabinet.querySelector(".fx-slot-machine__tools");
      if (!anchor || entry?.anchor === anchor) return;
      entry?.button.remove();
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.ha4 = "extra-button";
      button.dataset.ha4SlotHomeLaunch = "";
      button.textContent = "Homeで並行する";
      button.addEventListener("click", event => { if (event.isTrusted) open(cabinet, button); });
      anchor.append(button);
      entry = { cabinet, button, anchor };
    };
  }

  globalThis.hakoAfSlotHome = { start };
})();
