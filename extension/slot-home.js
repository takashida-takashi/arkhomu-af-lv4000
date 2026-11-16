(() => {
  "use strict";

  if (window.top !== window) return;

  const names = globalThis.hakoAfFeatureNames;
  const cabinetSelector = ".fx-slot-machine";
  const chatSelector = "#home-chat,.fx-home__chat";
  const modalSelector = 'dialog[open],[role="dialog"],[aria-modal="true"],[data-base-modal-root]';
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

    function fitCabinet({ cabinet, resize, measured, viewport }) {
      const stage = cabinet.querySelector(".fx-slot-machine__stage");
      const zoom = stage?.parentElement;
      if (!zoom || zoom.classList.contains("fx-slot-machine__zoom--on") || !viewport.clientHeight) return;
      const aspect = Number(cabinet.style.getPropertyValue("--fx-slot-aspect"));
      if (!(aspect > 0)) return;

      const notices = [...zoom.children].filter(element =>
        element.matches('[data-ha4="slot-bonus-info"],.fx-slot-machine__error'));
      const elements = new Set([zoom, ...notices]);
      for (const element of measured) {
        if (!elements.has(element)) {
          resize.unobserve(element);
          measured.delete(element);
        }
      }
      for (const element of elements) {
        if (!measured.has(element)) {
          resize.observe(element);
          measured.add(element);
        }
      }

      const reservedHeight = notices.reduce((total, element) => {
        if (!element.offsetHeight) return total;
        const style = getComputedStyle(element);
        return total + element.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      }, 0);
      const width = `${Math.max(0, Math.floor(Math.min(zoom.clientWidth, (zoom.clientHeight - reservedHeight) * aspect)))}px`;
      if (viewport.style.getPropertyValue("--ha4-slot-stage-width") !== width) {
        viewport.style.setProperty("--ha4-slot-stage-width", width);
      }
    }

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
      const child = current.frame.contentDocument;
      const { dock, shell, resize, show, returnToCabinet } = current;
      const chat = home ? child?.querySelector(chatSelector) : null;
      if (current.chat !== chat) {
        if (current.chat) resize.unobserve(current.chat);
        if (chat) resize.observe(chat);
        current.chat = chat;
      }

      const desktop = desktopSize();
      const modal = home && child && [...child.querySelectorAll(modalSelector)].some(element =>
        element.getClientRects().length && child.defaultView.getComputedStyle(element).visibility === "visible");
      const split = !!(desktop && path && (!home || modal));
      shell.toggleAttribute("data-ha4-slot-split", split);
      shell.toggleAttribute("data-ha4-slot-narrow", split && current.collapsed);
      const rect = chat?.getBoundingClientRect();
      const overlapsChat = desktop && !split && rect?.width >= 240 && rect.height >= 240 && rect.right > 0 &&
        rect.left < window.innerWidth && rect.bottom > 140 && rect.top < window.innerHeight - 140;
      dock.toggleAttribute("data-ha4-slot-over-chat", !!overlapsChat);
      const showingChat = overlapsChat && current.collapsed;
      dock.toggleAttribute("data-ha4-slot-showing-chat", !!showingChat);
      dock.hidden = !desktop;
      dock.toggleAttribute("data-ha4-slot-collapsed", current.collapsed);
      const label = current.collapsed ? "スロットを表示" : overlapsChat ? "チャットを表示" : "台をたたむ";
      if (show.textContent !== label) show.textContent = label;
      show.setAttribute("aria-expanded", String(!current.collapsed));
      if (showingChat) {
        if (returnToCabinet.parentElement !== chat) chat.prepend(returnToCabinet);
      } else {
        returnToCabinet.remove();
      }
      if (overlapsChat) {
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        dock.style.setProperty("--ha4-slot-left", `${left}px`);
        dock.style.setProperty("--ha4-slot-top", `${top}px`);
        shell.style.setProperty("--ha4-slot-width", `${Math.min(window.innerWidth, rect.right) - left}px`);
        dock.style.setProperty("--ha4-slot-height", `${Math.min(window.innerHeight, rect.bottom) - top}px`);
      }
      fitCabinet(current);
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
      current.measured.clear();
      resize.observe(current.viewport);
      current.frameEvents?.abort();
      const child = frame.contentDocument;
      if (child?.documentElement) {
        current.frameEvents = new AbortController();
        const { signal } = current.frameEvents;
        child.addEventListener("scroll", () => schedule(current), { capture: true, passive: true, signal });
        child.defaultView?.addEventListener("popstate", () => schedule(current), { signal });
        frameObserver.observe(child.documentElement, { childList: true, subtree: true, attributes: true,
          attributeFilter: ["class", "hidden", "open", "style", "aria-modal", "data-base-modal-root"] });
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
      frame.dataset.ha4SlotHomeFrame = "";
      const dock = document.createElement("section");
      dock.dataset.ha4 = "slot-home-dock";
      dock.setAttribute("aria-label", names.slot);
      const toolbar = document.createElement("div");
      toolbar.dataset.ha4 = "slot-home-toolbar";
      const show = document.createElement("button");
      show.type = "button";
      show.dataset.ha4 = "extra-button";
      show.textContent = "台をたたむ";
      const returnToCabinet = document.createElement("button");
      returnToCabinet.type = "button";
      returnToCabinet.textContent = "スロットを表示";
      // The chat belongs to the Home iframe, outside this content script's stylesheet.
      Object.assign(returnToCabinet.style, {
        display: "block", flex: "none", alignSelf: "start", width: "fit-content",
        margin: "5px 6px", padding: "4px 9px", border: "1px solid #a67de0", borderRadius: "5px",
        backgroundColor: "#36234d", color: "#f7edff", font: "700 13px/1.4 system-ui, sans-serif", cursor: "pointer"
      });
      const exit = document.createElement("button");
      exit.type = "button";
      exit.dataset.ha4 = "extra-button";
      exit.textContent = "スロット画面に戻る";
      toolbar.append(show, exit);
      const viewport = document.createElement("div");
      viewport.dataset.ha4 = "slot-home-viewport";
      dock.append(toolbar, viewport);
      shell.append(frame, dock);

      const events = new AbortController();
      const current = {
        shell, frame, dock, viewport, cabinet, marker, root, inert: root.inert, events, returnFocus, show, returnToCabinet,
        collapsed: false,
        cabinetObserver: new MutationObserver(() => {
          if (view !== current) return;
          if (cabinet.parentElement !== viewport) close();
          else schedule(current);
        }),
        frameObserver: new MutationObserver(records => {
          if (records.some(record => record.attributeName !== "style" || record.target.matches(modalSelector))) {
            schedule(current);
          }
        }),
        resize: new ResizeObserver(() => schedule(current)),
        measured: new Set(),
        layoutFrame: 0
      };
      view = current;
      const { signal } = events;
      exit.addEventListener("click", close, { signal });
      show.addEventListener("click", () => {
        current.collapsed = !current.collapsed;
        layout(current);
        if (returnToCabinet.isConnected) returnToCabinet.focus();
      }, { signal });
      returnToCabinet.addEventListener("click", () => {
        current.collapsed = false;
        layout(current);
        show.focus();
      }, { signal });
      window.addEventListener("resize", () => schedule(current), { passive: true, signal });
      frame.addEventListener("load", () => watchFrame(current), { signal });
      frame.src = "/";
      document.body.append(shell);
      move(viewport, cabinet);
      current.cabinetObserver.observe(viewport, { childList: true, subtree: true });
      current.cabinetObserver.observe(cabinet, { attributeFilter: ["style"] });
      current.resize.observe(viewport);
      document.documentElement.dataset.ha4SlotHomeActive = "";
      root.inert = true;
      returnFocus.hidden = true;
      exit.focus();
      schedule(current);
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
      button.textContent = names.slot;
      button.title = "Homeでスロットを並行表示";
      button.addEventListener("click", event => { if (event.isTrusted) open(cabinet, button); });
      anchor.append(button);
      entry = { cabinet, button, anchor };
    };
  }

  globalThis.hakoAfSlotHome = { start };
})();
