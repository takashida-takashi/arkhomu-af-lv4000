// ==UserScript==
// @name         はこホム AF Lv4000予測
// @namespace    arkhomu-af-lv4000
// @version      2.0.19
// @description  AFの現在値とLv4000予測値を並べて表示し、読み込まれた一覧を絞り込みます。
// @match        https://arkhomu.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @sandbox      raw
// @inject-into  page
// ==/UserScript==

(() => {
  "use strict";
  if (location.origin !== "https://arkhomu.com" || window.top !== window.self) return;
  // Each preset has a separate key, so saving from one tab cannot replace other names.
  const presetPrefix = "hakoAf4000:userscript:";
  const modules = {
    hakoAfUserscriptVersion: "2.0.19",
    hakoAfUpdateManaged: document.currentScript?.dataset.hakoAfUpdateManaged === "true",
    hakoAfPresetStorage: {
      get() {
        const storage = window.localStorage;
        const values = Object.create(null);
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key?.startsWith(presetPrefix)) continue;
          try {
            values[key.slice(presetPrefix.length)] = JSON.parse(storage.getItem(key));
          } catch {
            // Ignore an unreadable preset without hiding the remaining ones.
          }
        }
        return values;
      },
      set(values) {
        for (const [key, value] of Object.entries(values)) {
          window.localStorage.setItem(presetPrefix + key, JSON.stringify(value));
        }
      }
    }
  };


// market-snapshot.js
(() => {
  "use strict";

  const key = Symbol.for("hako-af.market-prices");
  if (globalThis[key]) {
    modules.hakoAfMarketSnapshots = globalThis[key];
    return;
  }
  const prices = new Map();
  const wrapped = new WeakSet();
  modules.hakoAfMarketSnapshots = globalThis[key] = prices;

  function observe(native) {
    if (typeof native !== "function" || wrapped.has(native)) return native;
    const proxy = new Proxy(native, {
      apply(target, thisArg, args) {
        const response = Reflect.apply(target, thisArg, args);
        if (args[0] === "/api/market/stats") {
          // Observe the data already returned to the marketplace. Return its original promise to the caller.
          Promise.resolve(response).then(payload => {
            if (!Array.isArray(payload?.stats)) return;
            const at = Date.now();
            const requested = args[1]?.query?.item_ids;
            if (typeof requested === "string") {
              for (const id of requested.split(",")) prices.delete(id);
            } else prices.clear();
            for (const entry of payload.stats) {
              const price = Number(entry?.cheapest_price);
              if (typeof entry?.item_id === "string" && Number.isSafeInteger(price) && price > 0) prices.set(entry.item_id, { price, at });
            }
            document.dispatchEvent(new Event("hako-af:market-snapshot"));
          }).catch(() => {});
        }
        return response;
      }
    });
    wrapped.add(proxy);
    return proxy;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "$fetch");
  if (descriptor && (!descriptor.configurable || !Object.hasOwn(descriptor, "value"))) return;
  let nativeFetch = observe(descriptor?.value);
  Object.defineProperty(globalThis, "$fetch", {
    configurable: true, enumerable: descriptor?.enumerable ?? true,
    get: () => nativeFetch,
    set: next => { nativeFetch = observe(next); }
  });
})();

function mount() {
  if (document.querySelector('style[data-ha4="userscript-style"]')) return;
  const style = document.createElement("style");
  style.dataset.ha4 = "userscript-style";
  style.textContent = "[data-ha4=\"detail-value\"] > span, [data-ha4=\"inline\"] {\n  color: #5eead4;\n  background: #102c32;\n  border-radius: .3em;\n  display: inline-block;\n  margin-inline-start: .35em;\n  padding: .04em .25em;\n  font-size: .9em;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n[data-ha4=\"detail-value\"] {\n  display: flex;\n  justify-content: flex-end;\n  contain: inline-size;\n  margin-block-start: 2px;\n  line-height: 1.35;\n}\n\n[data-ha4=\"detail-value\"] > span { flex: none; margin-inline-start: 0; }\n\n.fx-item__rows > div:has(> dd > [data-ha4=\"detail-value\"]),\n.item-detail-section .grid > div:has(> span > [data-ha4=\"detail-value\"]) { align-items: start; }\n\n[data-ha4=\"detail-legend\"], [data-ha4=\"detail-sum\"], [data-ha4=\"market-value\"], [data-ha4=\"overlay\"] {\n  box-sizing: border-box;\n  display: block;\n  width: fit-content;\n  max-width: 100%;\n  background: #102c32;\n  color: #a7f3e4;\n  font: 600 12px/1.4 system-ui, sans-serif;\n  font-variant-numeric: tabular-nums;\n  border-radius: 4px;\n  padding: 2px 6px;\n}\n\n[data-ha4=\"detail-legend\"], [data-ha4=\"detail-sum\"] {\n  margin: 4px auto 0;\n  text-align: center;\n  grid-column: 1 / -1;\n}\n\n[data-ha4=\"market-value\"] { margin-top: 3px; }\n\n.fx-item-detail, .item-detail-panel { --ha4-detail-tools-height: 1.75rem; }\n[data-ha4=\"detail-tools\"] {\n  display: flex;\n  justify-content: flex-end;\n  flex: none;\n  height: var(--ha4-detail-tools-height);\n}\n\n[data-ha4=\"detail-switch\"] {\n  padding-inline: .6em;\n  border: 1px solid #616477;\n  border-radius: 5px;\n  background: #242331;\n  color: #e4e0ed;\n  font: 600 12px/1 system-ui, sans-serif;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n[data-ha4=\"detail-switch\"][aria-checked=\"true\"] {\n  border-color: #42777b;\n  background: #102c32;\n  color: #a7f3e4;\n}\n\n[data-ha4=\"detail-switch\"]:focus-visible { outline: 2px solid #adf7e9; outline-offset: 2px; }\n\n/* Keep the game's floating copy and favorite buttons aligned with the item, below the added row. */\n.item-detail-panel:has(> [data-ha4=\"detail-tools\"]) > .absolute.top-2 {\n  top: calc(.5rem + var(--ha4-detail-tools-height) + .625rem);\n}\n\n[data-ha4=\"copy-forecast\"] {\n  border: 1px solid #42777b;\n  border-radius: 5px;\n  background: #102c32;\n  color: #a7f3e4;\n  padding: 3px 7px;\n  font: 600 11px/1.5 system-ui, sans-serif;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n[data-ha4=\"native-forecast\"] {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font-size: 12px;\n  white-space: nowrap;\n}\n\n[data-ha4=\"native-forecast\"] input { appearance: auto; accent-color: #aa69e9; }\n[data-ha4=\"sort-value\"] {\n  display: block;\n  color: #a7f3e4;\n  font-size: 11px;\n  overflow-wrap: anywhere;\n}\n.item-cell > [data-ha4=\"sort-value\"] {\n  position: absolute;\n  inset-inline: 2px;\n  top: 38%;\n  z-index: 9;\n  border-radius: 3px;\n  background: #171224e8;\n  text-align: center;\n  pointer-events: none;\n}\n[data-ha4=\"explore-card\"] {\n  min-width: 0;\n  box-sizing: border-box;\n  font-size: 11px;\n  font-weight: 700;\n  font-variant-numeric: tabular-nums;\n  line-height: 15px;\n  --ha4-match-border:#ff747d;\n  --ha4-match-text:#ffd9dc;\n  --ha4-match-bg:#24121b;\n}\n[data-ha4=\"explore-card\"][data-color=\"blue\"] { --ha4-match-border:#80dbff; --ha4-match-text:#ddf6ff; --ha4-match-bg:#12202b; }\n[data-ha4=\"explore-card\"][data-color=\"purple\"] { --ha4-match-border:#dcb2ff; --ha4-match-text:#f1ddff; --ha4-match-bg:#221830; }\n[data-ha4=\"explore-card\"][data-color=\"white\"] { --ha4-match-border:#fff; --ha4-match-text:#fff; --ha4-match-bg:#222029; }\n[data-ha4=\"explore-card\"][data-color=\"gold\"] { --ha4-match-border:#f6d169; --ha4-match-text:#ffe7ab; --ha4-match-bg:#241b10; }\n[data-ha4=\"explore-sort-value\"], [data-ha4=\"explore-match-value\"] {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  column-gap: 4px;\n  white-space: nowrap;\n}\n[data-ha4=\"explore-sort-value\"], [data-ha4=\"explore-matches\"] {\n  position: relative;\n  z-index: 12;\n  padding: 2px 4px;\n}\n[data-ha4=\"explore-sort-value\"] {\n  background: #121b25;\n  color: #b5f9ef;\n}\n[data-ha4=\"explore-value-label\"], [data-ha4=\"explore-value-number\"] {\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n[data-ha4=\"explore-value-number\"] {\n  margin-inline-start: auto;\n  color: #fff;\n  font-size: 12px;\n  font-weight: 750;\n}\n[data-ha4=\"explore-matches\"] {\n  display: block;\n  box-sizing: border-box;\n  width: 100%;\n  border: 0;\n  border-top: 1px solid var(--ha4-match-border);\n  background: var(--ha4-match-bg);\n  color: var(--ha4-match-text);\n  font: inherit;\n  font-variant-numeric: inherit;\n  text-align: start;\n  cursor: pointer;\n}\n[data-ha4=\"explore-matches\"]:is(:hover, :focus-visible) { box-shadow: inset 0 0 0 1px var(--ha4-match-border); }\n[data-ha4=\"explore-match-more\"] { display: block; text-align: center; overflow-wrap: anywhere; }\n[data-ha4=\"explore-card\"][data-matches]::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  border: 2px solid var(--ha4-match-border);\n  border-radius: 4px;\n  pointer-events: none;\n  z-index: 30;\n}\n.item-cell.item-cell:has(> [data-ha4=\"explore-card\"]) {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  grid-template-rows: auto auto;\n  aspect-ratio: auto;\n  align-self: start;\n  content-visibility: visible !important;\n}\n.item-cell:has(> [data-ha4=\"explore-card\"]) > :not([data-ha4=\"explore-card\"]) { grid-area: 1 / 1 / 2 / 2; }\n.item-cell:has(> [data-ha4=\"explore-card\"])::before {\n  content: \"\";\n  grid-area: 1 / 1;\n  aspect-ratio: 1;\n}\n.item-cell > [data-ha4=\"explore-card\"] { grid-area: 2 / 1; }\nli:has(> [data-ha4=\"explore-card\"][data-matches]) { position: relative; }\n[data-ha4-sort-layout=\"list\"] { display: flex; flex-direction: column; }\n[data-ha4-sort-layout] > * { order: var(--ha4-order, 0); }\n[data-ha4-auction-list][data-ha4-sort-layout=\"list\"] > [role=\"button\"] { flex: none; }\n[data-ha4-grid-empty]::after {\n  content: attr(data-ha4-grid-empty);\n  display: block;\n  padding: 20px;\n  text-align: center;\n}\n\n.item-detail-panel div:has(> button[title*=\"性能をテキストでコピー\"] + [data-ha4=\"copy-forecast\"]) {\n  flex-wrap: wrap;\n  max-width: calc(100% - 2rem);\n}\n\n[data-ha4=\"overlay\"] {\n  position: absolute;\n  top: 100%;\n  inset-inline-start: 0;\n  max-width: none;\n  padding: 0 3px;\n  font-size: clamp(8px, 1.1vw, 11px);\n  white-space: nowrap;\n}\n\n.fx-item-detail dd:has(> [data-ha4=\"detail-value\"]),\n.item-detail-section span:has(> [data-ha4=\"detail-value\"]) { text-align: end; }\n\n[data-ha4=\"filter\"], [data-ha4=\"filter-popup\"] {\n  --ha4-panel: #1f1b2b;\n  --ha4-heading: #2c2343;\n  --ha4-field: #151320;\n  --ha4-border: #413850;\n  --ha4-text: #efe9fa;\n  --ha4-muted: #c0b5d1;\n  --ha4-accent: #d4a8ff;\n  color: var(--ha4-text);\n  font: 13px/1.45 system-ui, sans-serif;\n  color-scheme: dark;\n}\n\n[data-ha4=\"filter\"] {\n  padding: 4px 10px;\n  border: 1px solid #8155a3;\n  border-radius: 5px;\n  background: #2c2343;\n  color: var(--ha4-accent);\n  font-weight: 700;\n  cursor: pointer;\n  max-width: 100%;\n}\n\n[data-ha4=\"filter\"][hidden],\n.fx-alist-controls--folded > [data-ha4=\"filter\"],\n[data-ha4=\"filter-popup\"] [hidden],\n[data-ha4-bulk-blocked] { display: none !important; }\n\n[data-ha4=\"filter-popup\"] {\n  position: fixed;\n  inset: 0;\n  margin: auto;\n  box-sizing: border-box;\n  width: min(680px, calc(100vw - 24px));\n  max-width: none;\n  max-height: calc(100dvh - 24px);\n  padding: 0;\n  overflow: hidden;\n  border: 1px solid var(--ha4-border);\n  border-radius: 12px;\n  background: var(--ha4-panel);\n  box-shadow: 0 12px 45px #0009;\n}\n\n[data-ha4=\"filter-popup\"][open] { display: flex; flex-direction: column; }\n[data-ha4=\"filter-popup\"]::backdrop { background: #080610a8; }\n\n[data-ha4=\"filter-popup\"] .ha4-header,\n[data-ha4=\"filter-popup\"] .ha4-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px 12px;\n  padding: 10px 16px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-header {\n  flex: none;\n  background: var(--ha4-heading);\n  border-bottom: 1px solid var(--ha4-border);\n}\n\n[data-ha4=\"filter-popup\"] h2 {\n  margin: 0;\n  color: var(--ha4-accent);\n  font: 700 17px/1.4 system-ui, sans-serif;\n}\n\n[data-ha4=\"filter-popup\"] h3 {\n  margin: 0 0 5px;\n  color: var(--ha4-accent);\n  font: 700 13px/1.4 system-ui, sans-serif;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-body {\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  padding: 12px 16px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-join,\n[data-ha4=\"filter-popup\"] .ha4-condition,\n[data-ha4=\"filter-popup\"] .ha4-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 5px 8px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-join { margin-bottom: 7px; }\n[data-ha4=\"filter-popup\"] .ha4-threshold { white-space: nowrap; }\n[data-ha4=\"filter-popup\"] .ha4-threshold select { min-width: 3em; }\n[data-ha4=\"filter-popup\"] .ha4-join > span { font-weight: 700; }\n[data-ha4=\"filter-popup\"] .ha4-checkbox {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  cursor: pointer;\n  overflow-wrap: anywhere;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-checkbox input {\n  appearance: auto;\n  flex: none;\n  accent-color: #aa69e9;\n  margin: 0;\n  width: 14px;\n  height: 14px;\n  align-self: center;\n}\n\n[data-ha4=\"filter-popup\"] input:not([type=\"checkbox\"]),\n[data-ha4=\"filter-popup\"] button,\n[data-ha4=\"filter-popup\"] select {\n  box-sizing: border-box;\n  background: var(--ha4-field);\n  border: 1px solid var(--ha4-border);\n  border-radius: 4px;\n  color: var(--ha4-text);\n  font: inherit;\n  min-height: 28px;\n  padding: 3px 7px;\n}\n\n[data-ha4=\"filter-popup\"] button { cursor: pointer; }\n[data-ha4=\"filter-popup\"] button:disabled { opacity: .45; cursor: default; }\n[data-ha4=\"filter-popup\"] button[aria-pressed=\"true\"] {\n  background: #412957;\n  color: var(--ha4-accent);\n  border-color: #a56cd1;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-primary {\n  background: #7741ae;\n  border-color: #a773d5;\n  font-weight: 700;\n  padding-inline: 12px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-close-icon,\n[data-ha4=\"filter-popup\"] .ha4-remove {\n  background: transparent;\n  min-width: 26px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-search {\n  display: block;\n  width: 100%;\n  min-height: 34px;\n  margin: 10px 0 4px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-presets {\n  margin-block-end: 10px;\n  padding-block-end: 9px;\n  border-bottom: 1px solid var(--ha4-border);\n}\n[data-ha4=\"filter-popup\"] .ha4-preset-row { display: flex; gap: 6px; margin-block: 4px; }\n[data-ha4=\"filter-popup\"] .ha4-preset-row > :is(input, select) { flex: 1 1 16ch; min-inline-size: 0; max-inline-size: 25rem; }\n[data-ha4=\"filter-popup\"] .ha4-preset-row > button { flex: none; white-space: nowrap; }\n[data-ha4=\"filter-popup\"] .ha4-preset-status { color: var(--ha4-muted); overflow-wrap: anywhere; }\n\n[data-ha4=\"filter-popup\"] .ha4-category { border-top: 1px solid var(--ha4-border); }\n[data-ha4=\"filter-popup\"] .ha4-category > summary {\n  padding: 8px 2px;\n  color: var(--ha4-muted);\n  font-weight: 650;\n  cursor: pointer;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-category-count {\n  color: var(--ha4-accent);\n  font-size: 11px;\n  margin-inline-start: 9px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-option-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 6px 12px;\n  padding: 0 5px 9px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-option-count,\n[data-ha4=\"filter-popup\"] .ha4-unit { color: var(--ha4-muted); }\n[data-ha4=\"filter-popup\"] .ha4-option-count { white-space: nowrap; font-size: 11px; }\n\n[data-ha4=\"filter-popup\"] .ha4-selected {\n  margin: 10px 0;\n  padding: 7px 9px;\n  background: #2a223b;\n  border: 1px solid var(--ha4-border);\n  border-radius: 5px;\n}\n\n[data-ha4=\"filter-popup\"] .ha4-condition + .ha4-condition { margin-top: 6px; }\n[data-ha4=\"filter-popup\"] .ha4-group {\n  margin: 6px 0 0 5px;\n  padding: 5px 0 2px 8px;\n  border-inline-start: 2px solid #8055a4;\n}\n[data-ha4=\"filter-popup\"] .ha4-view {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-top: 6px;\n}\n[data-ha4=\"filter-popup\"] .ha4-keep-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 5px 8px;\n  margin-top: 6px;\n}\n[data-ha4=\"filter-popup\"] .ha4-condition-name { flex: 1 0 min(100%, 12ch); }\n[data-ha4=\"filter-popup\"] .ha4-condition input[type=\"number\"] {\n  flex: none;\n  inline-size: calc(9ch + 2rem);\n  font-variant-numeric: tabular-nums;\n}\n[data-ha4=\"filter-popup\"] .ha4-footer { flex: none; flex-wrap: wrap; border-top: 1px solid var(--ha4-border); }\n[data-ha4=\"filter-popup\"] .ha4-status { color: var(--ha4-muted); }\n[data-ha4=\"filter-popup\"] .ha4-notice { flex-basis: 100%; color: #ebcf8d; }\n[data-ha4=\"filter-popup\"] .ha4-actions { margin-inline-start: auto; }\n\n[data-ha4=\"filter-popup\"] :focus-visible, [data-ha4=\"filter\"]:focus-visible {\n  outline: 2px solid var(--ha4-accent);\n  outline-offset: 2px;\n}\n\n@media (max-width: 460px) {\n  [data-ha4=\"filter-popup\"] .ha4-option-grid { grid-template-columns: 1fr; }\n  [data-ha4=\"filter-popup\"] .ha4-condition-name { flex-basis: 100%; }\n}\n\n[data-ha4-filtered=\"page\"] { display: none !important; }\n\n[data-ha4=\"keep\"] {\n  position: absolute;\n  inset-inline-end: 2px;\n  bottom: 2px;\n  z-index: 25;\n  display: flex;\n  align-items: center;\n  gap: 3px;\n  background: #21192eee;\n  color: #efe9fa;\n  border: 1px solid #8155a3;\n  border-radius: 4px;\n  padding: 1px 4px;\n  font: 600 11px/1.4 system-ui, sans-serif;\n  cursor: pointer;\n}\n\n.fx-agrid__cell:has(> [data-ha4=\"keep\"]) { position: relative; }\n[data-ha4=\"keep\"] input { appearance: auto; accent-color: #aa69e9; margin: 0; }\n\n[data-ha4=\"settings-launch\"], [data-ha4=\"extra-button\"],\n[data-ha4=\"explore-controls\"] select, [data-ha4=\"settings\"] :is(input:not([type=\"checkbox\"]),select),\n[data-ha4=\"watch-item\"] input, [data-ha4=\"skill-presets\"] :is(input,select) {\n  background: #272039;\n  color: #f7edff;\n  border: 1px solid #786097;\n  border-radius: 6px;\n  font: 600 13px/1.35 system-ui, sans-serif;\n  padding: 5px 9px;\n  min-height: 30px;\n}\n[data-ha4=\"settings-launch\"], [data-ha4=\"extra-button\"] { cursor: pointer; white-space: nowrap; }\n[data-ha4=\"extra-button\"][aria-pressed=\"true\"] { background: #563480; border-color: #c0a0ea; }\n[data-ha4=\"settings-launch\"][data-ha4-placement] {\n  flex: none;\n  color: inherit;\n  background: transparent;\n  border: 0;\n  font: inherit;\n  font-size: .875rem;\n  font-weight: 700;\n}\n[data-ha4=\"settings-launch\"][data-ha4-placement]:is(:hover,:focus-visible) {\n  color: var(--text, #f7edff);\n  background: #ffffff12;\n}\n[data-ha4=\"settings-launch\"][data-ha4-placement=\"menu\"] {\n  display: block;\n  width: 100%;\n  padding: .625rem 1rem;\n  text-align: start;\n}\n[data-ha4=\"settings-launch\"][data-ha4-placement=\"topbar\"] {\n  font-size: .75rem;\n  padding-inline: .3rem;\n}\n:is([data-ha4=\"settings\"], [data-ha4=\"explore-match-dialog\"]) {\n  inset: 0;\n  box-sizing: border-box;\n  width: min(630px, calc(100vw - 24px));\n  max-height: calc(100dvh - 24px);\n  margin: auto;\n  padding: 0 0 10px;\n  overflow: auto;\n  background: #1e192a;\n  color: #f7edff;\n  border: 1px solid #6a517f;\n  border-radius: 12px;\n  font: 14px/1.45 system-ui, sans-serif;\n  color-scheme: dark;\n}\n:is([data-ha4=\"settings\"], [data-ha4=\"explore-match-dialog\"])::backdrop { background: #090610aa; }\n[data-ha4=\"explore-match-list\"] { margin: 6px 0 0; padding-inline-start: 1.3em; }\n[data-ha4=\"explore-match-entry\"] + [data-ha4=\"explore-match-entry\"] { margin-top: .35em; }\n[data-ha4=\"extra-header\"] {\n  position: sticky;\n  top: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  z-index: 1;\n  padding: 10px 15px;\n  background: #30233d;\n}\n[data-ha4=\"extra-section\"] { padding: 10px 15px; }\n[data-ha4=\"extra-section\"] + [data-ha4=\"extra-section\"] { border-top: 1px solid #4b3d5d; }\n[data-ha4=\"extra-heading\"] { margin: 0 0 5px; font-weight: 700; color: #ebc9ff; }\n[data-ha4=\"extra-field\"] { display: flex; align-items: center; justify-content: space-between; gap: 6px 12px; flex-wrap: wrap; padding: 3px 0; }\n[data-ha4=\"extra-field\"] input[type=\"checkbox\"] { appearance: auto; accent-color: #aa69e9; width: 17px; height: 17px; }\n[data-ha4=\"extra-field\"] :is(select,input) { max-width: 100%; }\n[data-ha4=\"extra-ranks\"] {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 60px 60px;\n  align-items: center;\n  gap: 4px 8px;\n}\n[data-ha4=\"extra-ranks\"] > label { min-width: 0; font-size: 0; }\n[data-ha4=\"extra-ranks\"] input { width: 100%; box-sizing: border-box; }\n[data-ha4=\"extra-caption\"] { font-size: 12px; }\n[data-ha4=\"extra-note\"] { color: #c5b9d6; font-size: 12px; }\n\n[data-ha4=\"home-alerts\"] {\n  padding: 9px 12px;\n  border: 1px solid #70508a;\n  border-radius: 8px;\n  background: #21192e;\n  color: #f7edff;\n  margin: 6px 0;\n}\n[data-ha4=\"explore-status\"] {\n  display: flex;\n  align-items: center;\n  gap: .55rem;\n  min-width: 0;\n  margin-block: 2px 7px;\n}\n[data-ha4=\"explore-status\"][hidden] { display: none; }\n[data-ha4=\"explore-status-count\"] {\n  flex: none;\n  padding: .13rem .5rem;\n  border: 1px solid #615969;\n  border-radius: .35rem;\n  background: #2a2631;\n  color: #e3dce9;\n  font-variant-numeric: tabular-nums;\n}\n[data-ha4=\"explore-status\"][data-result=\"hit\"] [data-ha4=\"explore-status-count\"] {\n  border-color: #52ae92;\n  background: #174838;\n  color: #d0ffea;\n}\n[data-ha4=\"explore-status\"][data-result=\"error\"] [data-ha4=\"explore-status-count\"] {\n  border-color: #ad7d39;\n  background: #493219;\n  color: #ffe1ab;\n}\n[data-ha4=\"explore-status-basis\"] {\n  flex: none;\n  color: #cfc2dc;\n  font-size: .8em;\n  white-space: nowrap;\n}\n[data-ha4=\"explore-status-detail\"] {\n  min-width: 0;\n  overflow: hidden;\n  color: #cfc2dc;\n  font-size: .85em;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n@media (hover: hover) and (pointer: fine) {\n  [data-ha4-explore-flow] { display: flex; flex-direction: column; }\n  [data-ha4-explore-flow] > [data-ha4-explore-resources] { order: 1; }\n  [data-ha4-explore-flow] > [data-ha4-explore-drops] ~ :not([data-ha4-explore-resources]) { order: 2; }\n}\n[data-ha4=\"explore-total\"] {\n  display: inline-block;\n  margin: 4px 0 4px 8px;\n  padding: 2px 8px;\n  border: 1px solid #8e6cb4;\n  border-radius: 6px;\n  background: #30213f;\n  color: #f6e7ff;\n  font: 700 .875rem/1.5 system-ui, sans-serif;\n  font-variant-numeric: tabular-nums;\n}\n[data-ha4=\"explore-controls\"] { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }\n[data-ha4=\"explore-sort-legend\"] { color: #b6d5cf; font-size: 11px; }\n[data-ha4=\"explore-match-legend\"] { color: #ffd9dc; font-size: 11px; }\n[data-ha4=\"explore-match-legend\"][data-color=\"blue\"] { color: #ddf6ff; }\n[data-ha4=\"explore-match-legend\"][data-color=\"purple\"] { color: #f1ddff; }\n[data-ha4=\"explore-match-legend\"][data-color=\"white\"] { color: #fff; }\n[data-ha4=\"explore-match-legend\"][data-color=\"gold\"] { color: #ffe7ab; }\n[data-ha4=\"extra-actions\"] { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-block: 5px; }\n[data-ha4=\"extra-alert-list\"] { padding: 0; list-style: none; margin: 5px 0 0; }\n[data-ha4=\"home-alerts\"] {\n  box-sizing: border-box;\n  flex: none;\n  align-self: stretch;\n  min-inline-size: 0;\n  max-inline-size: 100%;\n  padding-block: 6px;\n}\n[data-ha4=\"home-alerts\"] > summary { margin: 0; }\n[data-ha4=\"extra-alert-list\"] {\n  max-block-size: min(7.5rem, 16dvh);\n  overflow: auto;\n  overscroll-behavior: contain;\n  overflow-wrap: anywhere;\n  scrollbar-gutter: stable;\n}\n[data-ha4=\"extra-alert\"] { padding-block: 2px; }\n[data-ha4=\"home-alerts\"] > summary { cursor: pointer; }\n[data-ha4-hidden-alert] { display: none !important; }\n[data-ha4=\"daily-balance\"] {\n  width: fit-content;\n  max-width: 100%;\n  margin: 2px 8px;\n  padding: 2px 7px;\n  border-radius: 5px;\n  background: #20372f;\n  color: #c1f5dc;\n  font: 650 12px/1.4 system-ui, sans-serif;\n}\n[data-ha4-chat-quote] { cursor: pointer; text-decoration: underline dotted; text-underline-offset: .22em; }\n[data-ha4-chat-focus] { outline: 2px solid #d9a7f5; outline-offset: -2px; border-radius: 6px; }\n[data-ha4=\"chat-note\"] { display: block; padding: 3px; color: #ebca8d; font: 12px/1.35 system-ui, sans-serif; }\n[data-ha4=\"chat-hidden-quote\"] {\n  display: block;\n  margin-block: 3px;\n  color: #debcfa;\n  font: 650 .8rem/1.4 system-ui, sans-serif;\n}\n[data-ha4=\"chat-reply-preview\"] {\n  margin-block: 4px;\n  padding: 6px 8px;\n  border-inline-start: 2px solid #b280dc;\n  border-radius: 4px;\n  background: #282135;\n  color: #f5effa;\n  font: .85rem/1.45 system-ui, sans-serif;\n}\n[data-ha4=\"chat-reply-author\"] { color: #e4c0ff; font-size: .78rem; overflow-wrap: anywhere; }\n[data-ha4=\"chat-reply-text\"] { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }\n\n[data-ha4=\"watch-item\"] {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 5px 10px;\n  padding-block: 3px;\n}\n[data-ha4=\"watch-goal\"] { display: inline-flex; align-items: center; gap: 5px; }\n[data-ha4=\"watch-goal\"] > input { width: 12ch; box-sizing: border-box; }\n[data-ha4=\"skill-presets\"] { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-block: 4px 8px; }\n[data-ha4=\"skill-presets\"] input { min-width: 0; width: 14ch; }\n[data-ha4=\"skill-presets\"] :is(select, input) { max-width: 100%; }\n[data-ha4=\"skill-preset-status\"] { flex-basis: 100%; color: #dbcae9; font-size: .8rem; }\n[data-ha4-skill-change] { outline: 2px solid #ffd27a; }\n[data-ha4=\"skill-change\"] { color: #ffd27a; font-size: .75rem; }\n[data-ha4=\"extra-alert\"][data-ha4-goal] {\n  margin-block: 3px;\n  padding: 2px 6px;\n  border-inline-start: 3px solid #85e5b3;\n  background: #22382e;\n}\n[data-ha4=\"extra-alert\"][data-ha4-goal] > a { color: #d1fae4; font-weight: 700; }\n\n.rv-card [data-ha4=\"gacha-stats\"] {\n  position: relative;\n  align-self: stretch;\n  flex: none;\n  padding: 2px 1px 3px;\n  border-top: 1px solid #c5b3ec44;\n  background: #100c1bd9;\n  color: #e8e0fa;\n  white-space: pre-line;\n  overflow-wrap: anywhere;\n  text-align: center;\n  font-size: clamp(9px, 2.3vw, 11px);\n  font-weight: 700;\n  line-height: 1.12;\n  font-variant-numeric: tabular-nums;\n  pointer-events: none;\n}\n.rv-card--tile [data-ha4=\"gacha-stats\"] { font-size: 9px; }\n[data-ha4=\"enhance-estimate\"] {\n  margin-block: 8px;\n  padding: 8px 10px;\n  min-width: 0;\n  border: 1px solid #665080;\n  border-radius: 8px;\n  background: #1e192a;\n  color: #f7edff;\n}\n[data-ha4=\"estimate-heading\"] { cursor: pointer; font-weight: 700; color: #e4c7ff; }\n[data-ha4=\"estimate-body\"] { margin-top: 8px; font-size: 12px; }\n[data-ha4=\"estimate-body\"] label { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0 8px 4px 0; }\n[data-ha4=\"estimate-body\"] input {\n  box-sizing: border-box;\n  width: 11ch;\n  padding: 5px 7px;\n  border: 1px solid #6d577f;\n  border-radius: 5px;\n  background: #15121e;\n  color: inherit;\n}\n[data-ha4=\"estimate-market\"] { color: #c6a2ff; text-decoration: underline; }\n[data-ha4=\"estimate-source\"], [data-ha4=\"estimate-status\"] { margin: 4px 0 6px; color: #d0c3de; overflow-wrap: anywhere; }\n[data-ha4=\"estimate-table\"] { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }\n[data-ha4=\"estimate-table\"] [scope=\"row\"] { text-align: start; }\n[data-ha4=\"estimate-table\"] :is([scope=\"col\"], td) { text-align: end; }\n[data-ha4=\"estimate-table\"] :is(th, td) { padding: 4px 3px; border-bottom: 1px solid #493b5c; overflow-wrap: anywhere; }\n[data-ha4=\"estimate-table\"] tbody tr:last-child { color: #e4c7ff; font-weight: 700; }\n@media (hover: none) and (pointer: coarse) {\n  [data-ha4=\"estimate-body\"] input { font-size: 16px; max-width: 100%; }\n}\n[data-ha4=\"explore-analysis\"] {\n  box-sizing: border-box;\n  width: min(100%, 46rem);\n  margin: .65rem 0;\n  padding: .65rem .75rem;\n  background: #211a30;\n  color: #f2eafb;\n  border: 1px solid #665080;\n  border-radius: 8px;\n  font-size: 12px;\n}\n[data-ha4=\"explore-analysis-table\"] { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }\n[data-ha4=\"explore-analysis\"]:not([open]) { width: fit-content; padding: .25rem .55rem; }\n[data-ha4=\"explore-analysis-title\"] { cursor: pointer; text-align: start; font-weight: 700; color: #e4c7ff; }\n[data-ha4=\"explore-analysis\"][open] > [data-ha4=\"explore-analysis-title\"] { margin-bottom: .3rem; }\n[data-ha4=\"explore-analysis-table\"] :is(th, td) { padding: .3rem .32rem; border-bottom: 1px solid #463754; }\n[data-ha4=\"explore-analysis-table\"] :is(th, td):first-child { text-align: start; }\n[data-ha4=\"explore-analysis-table\"] :is(th, td):not(:first-child) { text-align: end; }\n[data-ha4=\"explore-analysis-table\"] td { overflow-wrap: anywhere; }\n[data-ha4=\"explore-analysis-record\"] { display: block; color: #d3c2e3; }\n[data-ha4=\"explore-analysis-footer\"] { display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; margin-top: .35rem; }\n[data-ha4=\"explore-analysis-footer\"] button { margin-inline-start: auto; }\n[data-ha4=\"explore-analysis-note\"] { margin: 0; color: #d3c2e3; }\n[data-ha4=\"explore-analysis-note\"]:empty { display: none; }\n@media (max-width: 480px) {\n  [data-ha4=\"explore-analysis\"] { padding: .5rem; }\n  [data-ha4=\"explore-analysis-table\"] :is(th, td) { padding-inline: .2rem; }\n}\n[data-ha4=\"market-watch-button\"] {\n  align-self: flex-start;\n  width: fit-content;\n  max-width: 100%;\n  margin: .25rem .4rem .25rem 0;\n  padding: .3rem .6rem;\n  border-radius: 5px;\n  border: 1px solid #7657a1;\n  background: #2b2041;\n  color: #efdcff;\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n[data-ha4=\"market-watch-dialog\"] {\n  inset: 0;\n  width: min(630px, calc(100vw - 24px));\n  max-height: calc(100dvh - 24px);\n  box-sizing: border-box;\n  margin: auto;\n  padding: 0 0 12px;\n  overflow: auto;\n  background: #1e192a;\n  color: #f7edff;\n  border: 1px solid #6a517f;\n  border-radius: 12px;\n  font: 14px/1.45 system-ui, sans-serif;\n  color-scheme: dark;\n}\n[data-ha4=\"market-watch-dialog\"]::backdrop { background: #090610aa; }\n[data-ha4=\"market-watch-note\"] { margin: .6rem .8rem; font-size: 12px; color: #d3c2e3; overflow-wrap: anywhere; }\n[data-ha4=\"market-watch-list\"] { margin-inline: .8rem; }\n[data-ha4=\"market-watch-row\"] { border-top: 1px solid #4b3b5f; }\n[data-ha4=\"market-watch-summary\"] { padding: .55rem 0; cursor: pointer; }\n[data-ha4=\"market-watch-name\"] { margin-right: 1em; font-weight: 700; overflow-wrap: anywhere; }\n[data-ha4=\"market-watch-price\"], [data-ha4=\"market-watch-delta\"] { display: inline-block; margin-right: .75em; font-variant-numeric: tabular-nums; }\n[data-ha4=\"market-watch-delta\"][data-direction=\"up\"] { color: #ffc3a9; }\n[data-ha4=\"market-watch-delta\"][data-direction=\"down\"] { color: #a6edcd; }\n[data-ha4=\"market-watch-detail\"] { padding: 0 0 .65rem .65rem; }\n[data-ha4=\"market-watch-detail\"] [data-ha4=\"market-watch-note\"] { margin-left: 0; }\n[data-ha4=\"market-watch-detail\"] [data-ha4=\"extra-button\"] { display: inline-block; margin: .25rem .5rem .2rem 0; }\n[data-ha4=\"market-watch-points\"] { max-height: 12rem; overflow-y: auto; margin: .4rem 0; padding-left: 1.3rem; }\n\n@media (hover: none) and (pointer: coarse) {\n  [data-ha4=\"filter-popup\"] :is(input[type=\"number\"], input[type=\"search\"], input[type=\"text\"], select) {\n    font-size: 16px;\n    min-height: 36px;\n  }\n\n  [data-ha4=\"filter-popup\"] .ha4-body { padding-inline: 12px; }\n  [data-ha4=\"filter-popup\"] .ha4-preset-row > button { min-height: 36px; }\n}\n\n[data-ha4=\"filter-popup\"] .ha4-condition input[type=\"number\"] {\n  inline-size: calc(11ch + 2rem);\n  min-width: 0;\n}\n";
  (document.head ?? document.documentElement).append(style);

// forecast.js
(() => {
  "use strict";

  // artifact-v9 の実測ベースの経験式。ゲームの公式式ではない。
  const TARGET = 4000;
  const OFFSET = 199.1941276291921;
  const EXPONENT = 0.6999700116560543;
  const integerFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
  const normalize = value => String(value ?? "").normalize("NFKC").replace(/−/g, "-").trim();

  function levelFrom(value) {
    const m = normalize(value).match(/(?:^|\s)Lv\s*\.?\s*(\d[\d,]*)$/i);
    const level = m ? Number(m[1].replaceAll(",", "")) : NaN;
    return Number.isSafeInteger(level) && level >= 1 ? level : null;
  }

  function valueFrom(value) {
    const m = normalize(value).match(/^([+-]?)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%|回)?$/);
    if (!m) return null;
    const n = Number(m[1] + m[2].replaceAll(",", ""));
    return Number.isFinite(n) ? { n, unit: m[3] || "" } : null;
  }

  function ratio(level) {
    const curve = lv => Math.pow((lv + OFFSET) / (1 + OFFSET), EXPONENT);
    return Number.isSafeInteger(level) && level >= 1
      ? (level < TARGET ? curve(TARGET) / curve(level) : 1)
      : null;
  }

  function projected(value, multiplier) {
    if (!value || multiplier === null) return null;
    const raw = value.n * multiplier;
    return value.unit === "%" ? Number(raw.toFixed(2)) : Math.round(raw);
  }

  function text(n, unit, signed) {
    return (signed && n >= 0 ? "+" : "") +
      (unit === "%" ? n.toFixed(2) : integerFormat.format(n)) + unit;
  }

  modules.hakoAf4000 = Object.freeze({ TARGET, normalize, levelFrom, valueFrom, ratio, projected, text });
})();

// artifact-effects.js
(() => {
  "use strict";

  const parameters = Object.freeze({
    hp: "体力", atk: "物攻", def: "物防", mtk: "魔攻", mdf: "魔防", spd: "速度", lck: "運"
  });
  const traits = {
    all_param: "全パラメータ", add_lck: "運", add_multi_hit: "追加ヒット数", gacha_power: "ガチャパワー",
    add_summon_power: "召喚力", add_crit: "会心率", add_crit_dmg: "会心威力", add_hit: "命中",
    add_dodge: "回避", add_crit_resit: "会心耐性", add_life_steal: "吸血", add_exp: "獲得EXP",
    add_gold: "獲得Gold", add_drop: "ドロップ率", add_spot_item_rate: "スポット獲得+1率",
    add_spot_rate: "スポット出現率", add_egg_spot_rate: "卵スポット出現率",
    add_soul_fragment_rate: "魂の欠片ドロップ率", add_map_spot_rate: "地図スポット出現率",
    add_artifact_rate: "アーティファクト変換率", add_resist_heal: "被回復量"
  };
  const elements = {
    physical: "物理", magic: "魔法", fire: "炎", ice: "氷", thunder: "雷", wind: "風",
    earth: "地", holy: "光", dark: "闇", breath: "ブレス", poison: "毒", burn: "火傷",
    blood: "出血", frozen: "凍結", sleep: "睡眠", paralysis: "麻痺", stun: "スタン",
    slow: "スロウ", charm: "魅了", curse: "呪い", fear: "恐怖", pain: "痛み",
    blind: "暗闇", silence: "沈黙", acid: "劣化", deterioration: "劣化"
  };
  const damageTypes = { song: "歌唱", shot: "射撃", slash: "斬撃", spear: "刺突", punch: "格闘", breath: "ブレス" };
  const races = {
    animal: "動物", doll: "人形", "demi-human": "亜人", ghost: "霊", machine: "機械", fairy: "妖精",
    insect: "虫", devil: "悪魔", dragon: "ドラゴン", undead: "アンデッド", aquatic: "水棲",
    plant: "植物", slime: "スライム", angel: "天使", mythical: "幻獣", mysterious: "神秘",
    magical_beast: "魔獣", god: "神"
  };
  const prefixes = [
    ["add_appropriate_", elements, "適正"], ["add_resist_", elements, "耐性"],
    ["add_tag_damage_", damageTypes, "ダメージ"], ["add_race_param_", races, "強化"]
  ];
  const hiddenTraits = new Set(["all_param", "add_hp", "add_atk", "add_def", "add_mtk", "add_mdf", "add_spd"]);
  const flatTraits = new Set(["add_lck", "gacha_power"]);
  const groups = Object.freeze({
    basic: "基本", parameter: "パラメータ", reward: "報酬", explore: "探索", combat: "戦闘・能力",
    damage_type: "ダメージ種別", race: "種族強化", appropriate: "属性適正",
    resist: "属性耐性", other: "その他の特性"
  });
  const traitGroups = new Map([
    ["reward", ["add_drop", "add_gold", "add_exp"]],
    ["explore", ["add_spot_rate", "add_spot_item_rate", "add_egg_spot_rate", "add_map_spot_rate",
      "add_soul_fragment_rate", "add_artifact_rate", "gacha_power"]],
    ["combat", ["add_lck", "add_crit", "add_crit_dmg", "add_hit", "add_dodge", "add_crit_resit",
      "add_life_steal", "add_multi_hit", "add_summon_power"]]
  ].flatMap(([group, keys]) => keys.map(key => [key, group])));

  function traitLabel(key) {
    if (Object.hasOwn(traits, key)) return traits[key];
    for (const [prefix, names, suffix] of prefixes) {
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length);
        return (Object.hasOwn(names, name) ? names[name] : name) + suffix;
      }
    }
    return key;
  }

  function traitValue(key, raw) {
    if (key === "add_multi_hit") return { n: Math.round(raw), unit: "回" };
    if (flatTraits.has(key)) return { n: Math.round(raw), unit: "" };
    // Convert the stored fraction to the percentage used by the game's detail and standard filters.
    if (key.startsWith("add_race_param_")) raw *= 2.25;
    if (key === "add_hit" || key === "add_dodge") raw *= 0.5;
    return { n: Number((raw * 100).toFixed(2)), unit: "%" };
  }

  function readEffects(snapshot) {
    const metrics = new Map();
    for (const [key, n, stars] of snapshot.parameters) {
      if (n !== 0 && Object.hasOwn(parameters, key)) {
        metrics.set("stat_" + key, { n: Number(n.toFixed(2)), unit: "%", stars });
      }
    }
    const totals = new Map();
    for (const [key, raw, stars] of snapshot.effects) {
      if (hiddenTraits.has(key)) continue;
      totals.set(key, { raw: (totals.get(key)?.raw ?? 0) + raw, stars });
    }
    for (const [key, { raw, stars }] of totals) metrics.set("trait:" + key, { ...traitValue(key, raw), stars });
    return metrics;
  }

  function optionFor(key) {
    if (key.startsWith("stat_")) return { label: parameters[key.slice(5)] ?? key, group: "parameter", unit: "%" };
    const trait = key.slice(6);
    const prefixGroup = [["add_tag_damage_", "damage_type"], ["add_race_param_", "race"],
      ["add_appropriate_", "appropriate"], ["add_resist_", "resist"]].find(([prefix]) => trait.startsWith(prefix));
    const group = traitGroups.get(trait) ?? prefixGroup?.[1] ?? "other";
    return { label: traitLabel(trait), group, unit: traitValue(trait, 0).unit };
  }

  modules.hakoAfEffects = Object.freeze({ parameters, readEffects, optionFor, groups });
})();

// list-rules.js
(() => {
  "use strict";

  const { TARGET, ratio, projected } = modules.hakoAf4000;
  const { readEffects } = modules.hakoAfEffects;
  const POWER = "power";
  const SUM = "rate_sum";
  const DROP = "trait:add_drop";
  const CONVERSION = "trait:add_artifact_rate";

  function sumRates(metrics, allowMissing = false) {
    const a = metrics.get(CONVERSION);
    const b = metrics.get(DROP);
    if (!allowMissing && (!a || !b)) return null;
    return { parts: [a, b].filter(Boolean), n: Number(((a?.n ?? 0) + (b?.n ?? 0)).toFixed(2)), unit: "%" };
  }

  function dropMetrics(snapshot, power = snapshot?.power) {
    const metrics = snapshot ? readEffects(snapshot) : new Map();
    if (snapshot) metrics.set(SUM, sumRates(metrics, true));
    if (Number.isFinite(power)) metrics.set(POWER, { n: power, unit: "" });
    return { metrics, level: snapshot?.level, complete: !!snapshot };
  }

  function metricValue(item, metric, forecast) {
    if (!metric) return null;
    if (!forecast || item.level >= TARGET) return metric.n;
    const multiplier = ratio(item.level);
    if (multiplier === null) return null;
    if (metric.parts) {
      const sum = metric.parts.reduce((n, part) => n + projected(part, multiplier), 0);
      return Number(sum.toFixed(2));
    }
    return projected(metric, multiplier);
  }

  function activeGroup(group) {
    const children = [];
    for (const child of group.children) {
      if (child.children) {
        const nested = activeGroup(child);
        if (nested.children.length) children.push(nested);
      } else if (activeCondition(child)) {
        children.push(child);
      }
    }
    return { join: group.join, minimum: minimumMatches(group), children };
  }

  function activeCondition(condition) {
    return condition.key !== POWER || !!(condition.min || condition.max);
  }

  function minimumMatches(group) {
    return Number.isSafeInteger(group.minimum) && group.minimum > 0 ? group.minimum : 2;
  }

  function evaluate(item, condition, forecast) {
    const metric = item.metrics.get(condition.key);
    if (!metric) return item.complete && condition.key !== POWER ? false : null;
    if (condition.stars) {
      if (metric.stars == null) return null;
      if (metric.stars < Number(condition.stars)) return false;
    }
    if (!condition.min && !condition.max) return true;
    const n = metricValue(item, metric, forecast);
    if (n === null) return null;
    return (!condition.min || n >= Number(condition.min)) && (!condition.max || n <= Number(condition.max));
  }

  function evaluateGroup(item, group, forecast, matches) {
    const { children } = group;
    const minimum = group.join === "count" ? group.minimum : group.join === "or" ? 1 : children.length;
    let unknown = 0;
    let matched = 0;
    let remaining = children.length;
    for (const child of children) {
      const nested = matches && child.children ? [] : undefined;
      const result = child.children ? evaluateGroup(item, child, forecast, nested) : evaluate(item, child, forecast);
      remaining--;
      if (result === true) {
        matched++;
        if (!matches && matched >= minimum) return true;
        matches?.push(...(nested ?? [child]));
      }
      if (result === null) unknown++;
      if (matched + unknown + remaining < minimum) return false;
    }
    return matched >= minimum ? true : matched + unknown >= minimum ? null : false;
  }

  function viewRule({ root, view, useForecast, showUnknown, kept }) {
    const group = activeGroup(root);
    const error = function validationError(node) {
      if (node.children) {
        if (node.children.length && node.join === "count" && node.minimum > node.children.length) {
          return `一致数 ${node.minimum} を満たすには、このグループに条件があと ${node.minimum - node.children.length} 件必要です。`;
        }
        return node.children.map(validationError).find(Boolean);
      }
      if (node.min && node.max && Number(node.min) > Number(node.max)) return "下限は上限以下にしてください。";
    }(group);
    const active = !error && group.children.length > 0;
    const unchecked = view === "unchecked";
    const discard = view === "discard" || unchecked;
    const checked = view === "kept";
    const keptIds = kept instanceof Set ? kept : new Set(kept);
    return {
      active, error, discard, checked,
      check(item, matches) {
        const kept = keptIds.has(item.keepId);
        const result = active ? evaluateGroup(item, group, useForecast, matches) : null;
        const candidate = active && (result === false || (unchecked && result === true)) && !kept;
        const unknown = active && (result === null || (discard && candidate && item.decomposable == null));
        let show = true;
        if (checked) show = kept;
        else if (discard) show = candidate && item.decomposable === true;
        else if (active) show = result === true || (result === null && showUnknown);
        return { show, kept, result, unknown, protected: discard && candidate && item.decomposable === false };
      }
    };
  }

  function orderItems(items, sort) {
    if (!sort?.key) return items;
    const ranked = items.map(item => ({ item, value: metricValue(item, item.metrics.get(sort.key), sort.forecast) }));
    const direction = sort.direction === "asc" ? 1 : -1;
    ranked.sort((a, b) => {
      if (a.value == null) return b.value == null ? 0 : 1;
      if (b.value == null) return -1;
      return direction * (a.value - b.value);
    });
    return ranked.map(row => row.item);
  }

  modules.hakoAfListRules = Object.freeze({ POWER, SUM, DROP, CONVERSION, sumRates, dropMetrics, metricValue,
    activeGroup, minimumMatches, viewRule, orderItems });
})();

// filter-popup.js
(() => {
  "use strict";

  const { normalize } = modules.hakoAf4000;
  const { groups } = modules.hakoAfEffects;
  const { activeGroup, minimumMatches } = modules.hakoAfListRules;
  const PRESET_PREFIX = "af-filter-preset:";
  let openPopup;
  let titleId = 0;

  function conditionRows(group) {
    return group.children.flatMap(child => child.children ? conditionRows(child) : [child]);
  }

  function element(tag, className, label) {
    const el = document.createElement(tag);
    if (className) el.className = "ha4-" + className;
    if (label) el.textContent = label;
    return el;
  }

  function button(label, className) {
    const el = element("button", className, label);
    el.type = "button";
    return el;
  }

  function toggle(label, value, onChange) {
    const field = element("input");
    field.type = "checkbox";
    field.checked = value;
    field.setAttribute("aria-label", label);
    field.addEventListener("change", () => onChange(field.checked));
    const wrapper = element("label", "checkbox");
    wrapper.append(field, label);
    return { wrapper, field };
  }

  function createPopup(state, onChange, storage = chrome.storage.local) {
    const trigger = button("予測で絞り込み");
    trigger.dataset.ha4 = "filter";
    trigger.setAttribute("aria-haspopup", "dialog");
    const dialog = element("dialog");
    dialog.dataset.ha4 = "filter-popup";
    const title = element("h2", null, "予測で絞り込み");
    title.id = "ha4-filter-title-" + ++titleId;
    dialog.setAttribute("aria-labelledby", title.id);
    const closeIcon = button("×", "close-icon");
    closeIcon.setAttribute("aria-label", "閉じる");
    const header = element("header", "header");
    header.append(title, closeIcon);

    const mode = toggle("Lv4000未満を予測値で比較", state.useForecast, checked => {
      state.useForecast = checked;
      onChange();
    });
    const sortKey = element("select");
    sortKey.setAttribute("aria-label", "拡張の並び順");
    const sortDirection = element("select");
    sortDirection.setAttribute("aria-label", "並べる方向");
    sortDirection.append(new Option("高い順", "desc"), new Option("低い順", "asc"));
    sortDirection.value = state.sortDirection;
    sortKey.addEventListener("change", () => {
      state.sortKey = sortKey.value;
      sortDirection.disabled = !state.sortKey;
      onChange();
    });
    sortDirection.addEventListener("change", () => {
      state.sortDirection = sortDirection.value;
      onChange();
    });
    const sortControls = element("label", "view");
    sortControls.append("並び順", sortKey, sortDirection);
    const presetPicker = element("select");
    presetPicker.setAttribute("aria-label", "保存済みのプリセット");
    const presetName = element("input");
    presetName.type = "text";
    presetName.maxLength = 48;
    presetName.placeholder = "プリセット名";
    presetName.setAttribute("aria-label", presetName.placeholder);
    const loadPreset = button("読み込み");
    const savePreset = button("保存");
    const presetStatus = element("small", "preset-status");
    presetStatus.setAttribute("aria-live", "polite");
    const presetControls = element("section", "presets");
    const presetLoadRow = element("div", "preset-row");
    const presetSaveRow = element("div", "preset-row");
    presetLoadRow.append(presetPicker, loadPreset);
    presetSaveRow.append(presetName, savePreset);
    presetControls.append(element("h3", null, "プリセット"), presetLoadRow, presetSaveRow, presetStatus);
    const unknown = toggle("判定できないAFも表示", state.showUnknown, checked => {
      state.showUnknown = checked;
      onChange();
    });
    const search = element("input", "search");
    search.type = "search";
    search.placeholder = "パラメータ・特性を検索";
    search.setAttribute("aria-label", search.placeholder);
    const active = element("section", "selected");
    const selectedRows = element("div", "selected-rows");
    active.append(selectedRows);
    const categories = element("div", "categories");
    const noResults = element("p", "empty", "一致する項目がありません。");
    noResults.hidden = true;
    const body = element("div", "body");
    const view = element("select");
    view.setAttribute("aria-label", "分解タブに表示するAF");
    view.append(new Option("一致したAF（残す候補）", "match"), new Option("条件に一致しないAF（分解候補）", "discard"),
      new Option("残すチェックを付けたAF", "kept"),
      new Option("残すチェックがないAF（分解候補）", "unchecked"));
    view.value = state.view ?? "match";
    view.addEventListener("change", () => {
      state.view = view.value;
      onChange();
    });
    const viewControl = element("label", "view");
    viewControl.hidden = state.view == null;
    viewControl.append("表示するAF", view);
    const keepShown = button("一覧の一致をすべて残す");
    const clearKept = button("残すチェックを解除");
    const keepActions = element("div", "keep-actions");
    keepActions.hidden = state.view == null;
    keepActions.append(keepShown, clearKept);
    body.append(presetControls, mode.wrapper, sortControls, viewControl, keepActions, active, search, categories, noResults);
    const status = element("small", "status");
    status.setAttribute("role", "status");
    const notice = element("small", "notice");
    notice.hidden = true;
    const reset = button("リセット");
    const close = button("閉じる", "primary");
    const actions = element("div", "actions");
    actions.append(reset, close);
    const footer = element("footer", "footer");
    footer.append(status, unknown.wrapper, notice, actions);
    dialog.append(header, body, footer);

    let options = new Map();
    let signature;
    let counts = new Map();
    let matchingIds = [];
    const rendered = new Map();
    const thresholds = new Map();
    const expanded = new Map();
    let targetGroup = state.root;
    let presets = new Map();
    let busyWithPresets = false;
    let presetNeedsRender = false;

    function updatePresetButtons() {
      const name = presetName.value.trim();
      loadPreset.disabled = busyWithPresets || !presets.has(presetPicker.value);
      savePreset.disabled = busyWithPresets || !name;
      savePreset.textContent = presets.has(name) ? "上書き保存" : "保存";
    }

    async function refreshPresets() {
      if (busyWithPresets) return;
      const selected = presetPicker.value;
      busyWithPresets = true;
      updatePresetButtons();
      try {
        const stored = await storage.get();
        presets = new Map(Object.entries(stored)
          .filter(([key, value]) => key.startsWith(PRESET_PREFIX) && Array.isArray(value?.root?.children))
          .map(([key, value]) => [key.slice(PRESET_PREFIX.length), value]));
        renderPresetOptions(selected);
      } catch {
        presetStatus.textContent = "保存済みのプリセットを取得できませんでした。";
      } finally {
        busyWithPresets = false;
        updatePresetButtons();
      }
    }

    function renderPresetOptions(selected) {
      presetPicker.replaceChildren(new Option("プリセットを選択", ""));
      for (const name of [...presets.keys()].sort((a, b) => a.localeCompare(b, "ja"))) {
        presetPicker.append(new Option(name, name));
      }
      presetPicker.value = presets.has(selected) ? selected : "";
    }

    presetPicker.addEventListener("change", updatePresetButtons);
    presetName.addEventListener("input", updatePresetButtons);
    loadPreset.addEventListener("click", () => {
      const name = presetPicker.value;
      const preset = presets.get(name);
      if (!preset || busyWithPresets) return;
      state.root = structuredClone(preset.root);
      targetGroup = state.root;
      mode.field.checked = state.useForecast = preset.useForecast !== false;
      unknown.field.checked = state.showUnknown = preset.showUnknown === true;
      state.sortKey = preset.sortKey || "";
      sortDirection.value = state.sortDirection = preset.sortDirection === "asc" ? "asc" : "desc";
      presetName.value = name;
      presetStatus.textContent = `「${name}」を読み込みました。`;
      updatePresetButtons();
      presetNeedsRender = true;
      onChange();
    });
    savePreset.addEventListener("click", async () => {
      const name = presetName.value.trim();
      if (!name || busyWithPresets) return;
      const { root, useForecast, showUnknown, sortKey, sortDirection } = state;
      const preset = { root: structuredClone(root), useForecast, showUnknown, sortKey, sortDirection };
      busyWithPresets = true;
      updatePresetButtons();
      try {
        await storage.set({ [PRESET_PREFIX + name]: preset });
        presets.set(name, preset);
        renderPresetOptions(name);
        presetStatus.textContent = `「${name}」を保存しました。`;
      } catch {
        presetStatus.textContent = "プリセットを保存できませんでした。";
      } finally {
        busyWithPresets = false;
        updatePresetButtons();
      }
    });
    presetName.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing || savePreset.disabled) return;
      event.preventDefault();
      savePreset.click();
    });
    updatePresetButtons();

    keepShown.addEventListener("click", () => {
      for (const id of matchingIds) state.kept.add(id);
      onChange();
    });
    clearKept.addEventListener("click", () => {
      state.kept.clear();
      onChange();
    });

    function updateControls() {
      reset.disabled = state.root.children.length === 0 && state.root.join === "and" &&
        (state.view == null || state.view === "match") && !state.sortKey;
      const conditions = conditionRows(state.root);
      for (const [group, { count, total }] of thresholds) {
        const available = activeGroup(group).children.length;
        const selected = minimumMatches(group);
        const signature = `${available}/${selected}`;
        if (count.dataset.options === signature) continue;
        count.dataset.options = signature;
        total.textContent = `${available}件中 `;
        count.replaceChildren(...Array.from({ length: Math.max(1, available) }, (_, index) =>
          new Option(String(index + 1), String(index + 1))));
        if (selected > count.options.length) count.add(new Option(String(selected), String(selected)));
        count.value = String(selected);
      }
      for (const [group, view] of rendered) {
        view.badge.textContent = String(new Set(conditions.filter(({ key }) => options.get(key)?.group === group)
          .map(({ key }) => key)).size);
        for (const [key, item] of view.items) {
          const inGroup = targetGroup.children.some(child => child.key === key);
          item.toggle.field.checked = inGroup;
          item.toggle.field.indeterminate = !inGroup && conditions.some(condition => condition.key === key);
          item.count.textContent = counts.has(key) ? ` (${counts.get(key).toLocaleString("ja-JP")})` : "";
        }
      }
    }

    function renderCondition(condition, group) {
      const { label, unit } = options.get(condition.key);
      const row = element("div", "condition");
      row.dataset.ha4Condition = condition.key;
      row.append(element("strong", "condition-name", label));
      for (const [field, caption] of [["min", "下限"], ["max", "上限"]]) {
        const input = element("input");
        input.type = "number";
        input.step = "any";
        input.value = condition[field];
        input.placeholder = caption;
        input.setAttribute("aria-label", label + "の" + caption);
        input.addEventListener("input", () => {
          condition[field] = input.value;
          onChange();
        });
        row.append(input);
      }
      row.append(element("span", "unit", unit));
      if (condition.key !== "power" && condition.key !== "rate_sum") {
        const stars = element("select");
        stars.setAttribute("aria-label", label + "の★の数");
        stars.append(new Option("★指定なし", ""), ...[1, 2, 3, 4, 5].map(n =>
          new Option(`★${n}${n < 5 ? "以上" : ""}`, String(n))));
        stars.value = condition.stars;
        stars.addEventListener("change", () => {
          condition.stars = stars.value;
          onChange();
        });
        row.append(stars);
      }
      const remove = button("×", "remove");
      remove.setAttribute("aria-label", label + "の条件を外す");
      remove.addEventListener("click", () => setCondition(condition.key, false, group));
      row.append(remove);
      return row;
    }

    function renderGroup(group, parent, number) {
      const box = element("section", parent ? "group" : "root-group");
      const header = element("div", "join");
      header.setAttribute("role", "group");
      header.setAttribute("aria-label", parent ? "グループ " + number + " のつなぎ方" : "条件のつなぎ方");
      const caption = parent ? "グループ " + number : "条件のつなぎ方";
      header.append(element("strong", null, caption));
      const threshold = element("label", "threshold");
      const count = element("select");
      count.setAttribute("aria-label", caption + "の最低一致数");
      const total = element("span");
      thresholds.set(group, { count, total });
      count.addEventListener("change", () => {
        group.minimum = Number(count.value);
        onChange();
      });
      threshold.hidden = group.join !== "count";
      threshold.append(total, count, " 件以上");
      for (const [value, label] of [["and", "すべて一致（AND）"], ["or", "どれか1つ（OR）"], ["count", "指定数以上"]]) {
        const operator = button(label);
        operator.setAttribute("aria-pressed", String(group.join === value));
        operator.addEventListener("click", () => {
          group.join = value;
          for (const peer of header.querySelectorAll("button[data-ha4-operator]")) {
            peer.setAttribute("aria-pressed", String(peer.dataset.ha4Operator === value));
          }
          threshold.hidden = value !== "count";
          updateControls();
          onChange();
        });
        operator.dataset.ha4Operator = value;
        header.append(operator);
      }
      header.append(threshold);
      if (state.root.children.some(child => child.children)) {
        const target = button(group === targetGroup ? "追加先" : "ここに追加");
        target.setAttribute("aria-label", caption + "を項目の追加先にする");
        target.setAttribute("aria-pressed", String(group === targetGroup));
        target.addEventListener("click", () => {
          targetGroup = group;
          updateSelected();
        });
        header.append(target);
      }
      const add = button("＋ グループ");
      add.setAttribute("aria-label", caption + "にグループを追加");
      add.addEventListener("click", () => {
        const child = { join: "and", children: [] };
        group.children.push(child);
        targetGroup = child;
        updateSelected();
      });
      header.append(add);
      if (parent) {
        const remove = button("×", "remove");
        remove.setAttribute("aria-label", caption + "を削除");
        remove.addEventListener("click", () => {
          parent.children = parent.children.filter(child => child !== group);
          targetGroup = parent;
          updateSelected();
          onChange();
        });
        header.append(remove);
      }
      box.append(header);
      let index = 0;
      for (const child of group.children) {
        if (child.children) {
          index++;
          box.append(renderGroup(child, group, number ? number + "." + index : String(index)));
        } else {
          box.append(renderCondition(child, group));
        }
      }
      return box;
    }

    function updateSelected() {
      thresholds.clear();
      selectedRows.replaceChildren(renderGroup(state.root, null, ""));
      updateControls();
    }

    function setCondition(key, checked, group = targetGroup) {
      if (checked) group.children.push({ key, min: "", max: "", stars: "" });
      else group.children = group.children.filter(condition => condition.key !== key);
      updateSelected();
      onChange();
    }

    function applySearch() {
      const query = normalize(search.value).toLowerCase();
      let results = 0;
      for (const [group, view] of rendered) {
        let matches = 0;
        for (const [key, item] of view.items) {
          const label = normalize(options.get(key).label).toLowerCase();
          const searchText = label + " " + normalize(groups[group]).toLowerCase() +
            (key === "rate_sum" ? " af合計 変換率合計" : "");
          const visible = !query || searchText.includes(query) ||
            (query.includes("af") && label.includes(query.replaceAll("af", "アーティファクト")));
          item.toggle.wrapper.hidden = !visible;
          if (visible) matches++;
        }
        results += matches;
        view.section.hidden = !matches;
        view.section.open = query ? matches > 0 : expanded.get(group);
      }
      noResults.hidden = results !== 0;
    }

    function renderOptions() {
      rendered.clear();
      const sections = [];
      for (const [group, groupLabel] of Object.entries(groups)) {
        const entries = [...options].filter(([, option]) => option.group === group);
        if (!entries.length) continue;
        const section = element("details", "category");
        if (!expanded.has(group)) expanded.set(group, group === "basic" || group === "parameter" || group === "reward");
        section.open = expanded.get(group);
        const summary = element("summary", null, groupLabel);
        const badge = element("span", "category-count");
        summary.append(badge);
        summary.addEventListener("click", () => {
          if (!search.value.trim()) expanded.set(group, !section.open);
        });
        const grid = element("div", "option-grid");
        const items = new Map();
        for (const [key, { label }] of entries) {
          const choice = toggle(label, false, checked => setCondition(key, checked));
          choice.field.dataset.ha4Option = key;
          const count = element("span", "option-count");
          count.setAttribute("aria-hidden", "true");
          choice.wrapper.append(count);
          grid.append(choice.wrapper);
          items.set(key, { toggle: choice, count });
        }
        section.append(summary, grid);
        sections.push(section);
        rendered.set(group, { section, badge, items });
      }
      categories.replaceChildren(...sections);
      applySearch();
      updateSelected();
    }

    function refresh(entries, newCounts, result) {
      const { active: hasConditions, matched, unknown: unknownCount, message, resultLabel, decomposeNotice } = result;
      matchingIds = result.matchingIds;
      keepShown.disabled = state.view !== "match" || !matchingIds.some(id => !state.kept.has(id));
      clearKept.disabled = !state.kept?.size;
      const caption = hasConditions ? `予測で絞り込み｜${resultLabel} ${matched}件` : "予測で絞り込み";
      if (trigger.textContent !== caption) trigger.textContent = caption;
      if (status.textContent !== message) status.textContent = message;
      notice.hidden = !decomposeNotice;
      notice.textContent = decomposeNotice
        ? "残すチェックはこのタブ内の目印です。分解候補を表示して、ゲームの一括解体モードで対象を選んでください。"
        : "";
      unknown.wrapper.hidden = unknownCount === 0;
      counts = newCounts;
      const nextSignature = JSON.stringify(entries);
      if (signature !== nextSignature) {
        options = new Map(entries);
        signature = nextSignature;
        sortKey.replaceChildren(new Option("ゲームの並び順を使う", ""));
        for (const [group, groupLabel] of Object.entries(groups)) {
          const list = entries.filter(([, option]) => option.group === group);
          if (!list.length) continue;
          const groupNode = element("optgroup");
          groupNode.label = groupLabel;
          for (const [key, { label }] of list) groupNode.append(new Option(label, key));
          sortKey.append(groupNode);
        }
        if (dialog.open) renderOptions();
      } else if (dialog.open) {
        if (presetNeedsRender) updateSelected();
        else updateControls();
      }
      presetNeedsRender = false;
      sortKey.value = state.sortKey;
      sortDirection.disabled = !state.sortKey;
    }

    search.addEventListener("input", applySearch);
    reset.addEventListener("click", () => {
      state.root.children = [];
      state.root.join = "and";
      delete state.root.minimum;
      state.sortKey = sortKey.value = "";
      state.sortDirection = sortDirection.value = "desc";
      if (state.view != null) state.view = view.value = "match";
      targetGroup = state.root;
      updateSelected();
      onChange();
    });
    for (const control of [closeIcon, close]) control.addEventListener("click", () => dialog.close());
    trigger.addEventListener("click", () => {
      if (openPopup && openPopup !== dialog) openPopup.close();
      if (dialog.open) return;
      search.value = "";
      if (!dialog.isConnected) document.body.append(dialog);
      renderOptions();
      dialog.showModal();
      refreshPresets();
      openPopup = dialog;
      search.focus({ preventScroll: true });
    });
    dialog.addEventListener("close", () => {
      if (openPopup === dialog) openPopup = undefined;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    });
    for (const control of [trigger, dialog]) {
      for (const event of ["pointerdown", "click", "dblclick", "keydown"]) {
        control.addEventListener(event, e => e.stopPropagation());
      }
    }
    return {
      element: trigger,
      refresh,
      close() { if (dialog.open) dialog.close(); },
      remove() {
        if (dialog.open) dialog.close();
        trigger.remove();
        dialog.remove();
      }
    };
  }

  modules.hakoAfFilterPopup = createPopup;
  modules.hakoAfConditionRows = conditionRows;
})();

// hidden-titles.js
(() => {
  "use strict";

  // Public title definitions and the documented unlock conditions.
  modules.hakoAfHiddenTitles = [
    ["hidden_fickle","浮気者","#f472b6","homunculus","100 種類のホムンクルスを戦闘に出すと解放"],
    ["hidden_devoted","一途な人","#fb7185","homunculus","同じ種類のホムンクルスを 30 日連続で戦闘に出すと解放"],
    ["hidden_big_spender","散財王","#f59e0b","money","累計 10,000,000,000 G 消費で解放（オークションの入札・買い注文で預けた分は、落札・約定したときに数える）"],
    ["kaomoji_uwu_chat","・w・","#BCE8D5","life","チャットで「・w・」と1回発言すると解放"],
    ["emoji_black_cat","🐈‍⬛","#BDB2D0","homunculus","ハロウィンスキンを N 種類入手で解放"],
    ["emoji_egg","🥚","#BDB2D0","homunculus","卵を累計 N 個孵化で解放"],
    ["emoji_pudding","🍮","#BDB2D0","explore","遠征にプリンを 10 回持っていくと解放"],
    ["emoji_clover","🍀","#BDB2D0","explore","探索で強運のクローバーを累計 N 個獲得で解放"],
    ["kaomoji_twt","TwT","#A8E0F2","battle","天昇の塔で 20 回連続敗北で解放"],
    ["emoji_paw","🐾","#BDB2D0","battle","動物種族だけで編成して 100 回勝利で解放"],
    ["emoji_chick","🐣","#BDB2D0","battle","Rank1 だけで編成して 1 回勝利で解放"],
    ["emoji_rabbit","🐰","#BDB2D0","battle","うさぎカテゴリだけで編成して 100 回勝利で解放"],
    ["emoji_jellyfish","🪼","#BDB2D0","battle","水棲種族だけで編成して 100 回勝利で解放"],
    ["emoji_butterfly","🦋","#BDB2D0","battle","虫種族だけで編成して 100 回勝利で解放"],
    ["emoji_honey","🍯","#BDB2D0","battle","ハニーコーム・ゴーレムを編成して 100 回勝利で解放"],
    ["emoji_bubbles","🫧","#BDB2D0","battle","スライム種族だけで編成して 1 回勝利で解放"],
    ["emoji_blossom","🌸","#BDB2D0","battle","植物種族だけで編成して 100 回勝利で解放"],
    ["hidden_mating_addict","合成中毒","#a855f7","homunculus","1日でホムンクルスを 1,000 回合成で解放"],
    ["hidden_broke","金欠","#9ca3af","money","過去最高所持ゴールド 10億 到達後に、所持ゴールドが 1万 以下になると解放"],
    ["hidden_spendthrift_day","宵越しの金は持たぬ","#fbbf24","money","1日で 1,000,000,000 G 消費で解放"],
    ["emoji_cat","🐈","#BDB2D0","homunculus","猫カテゴリのホムンクルスを 7 種類仲間にすると解放"],
    ["emoji_ribbon","🎀","#BDB2D0","homunculus","異なるホムンクルス 30 体のスキンを変更すると解放"],
    ["emoji_sparkles","✨","#BDB2D0","life","称号を累計 10 回変更で解放"],
    ["kaomoji_uwu","UwU","#F6B8D2","life","編成を変えず戦闘もせずに 24 時間過ごすと解放"],
    ["kaomoji_qwq","QwQ","#AFCBFF","battle","コロシアムのランク戦で 10 回連続敗北で解放"],
    ["kaomoji_omega","´・ω・`","#C9C4D3","battle","戦闘で 50 回連続敗北で解放"],
    ["emoji_dango","🍡","#BDB2D0","battle","きびだんごを編成して 1,000 回勝利で解放"],
    ["hidden_hard_worker","働き者","#facc15","explore","1日で探索 1,000 回で解放"],
    ["hidden_no_sleep","寝てない？","#818cf8","life","1日の行動（探索・合成・ガチャ・遠征の受取・対戦）3,000 回で解放"],
    ["hidden_one_more_pull","あと一回だけ","#a855f7","money","1日でアーティファクトガチャ 1,000 回で解放"],
    ["hidden_slot_net_loss_100m","ギャンブル下手","#facc15","money","スロットの収支の累計が −100,000,000 G に届くと解放"],
    ["hidden_ark_dweller","方舟から出てこない人","#bae6fd","life","1日の行動（探索・合成・ガチャ・遠征の受取・対戦）10,000 回で解放"],
    ["hidden_go_to_bed","今日はもう寝よう","#3b82f6","life","深夜（2時〜5時）に行動 100 回で解放"],
    ["hidden_overworked","働きすぎ","#fb923c","explore","1日で遠征報酬を 10 回受け取ると解放"],
    ["kaomoji_owo","OwO","#D6B8FF","homunculus","Rank6 のホムンクルスを初めて入手すると解放"],
    ["kaomoji_midnight","=w=","#C4B8E8","life","深夜 0 時〜5 時（日本時間）にログインすると解放"],
    ["kaomoji_noon","^w^","#FFE6A8","life","昼 11 時〜13 時（日本時間）にログインすると解放"],
    ["emoji_fox","🦊","#BDB2D0","homunculus","狐カテゴリのホムンクルスを 7 種類仲間にすると解放"],
    ["emoji_candy","🍬","#BDB2D0","life","アイテム錬金や生産で食べ物を累計 100 個作ると解放"],
    ["kaomoji_ouo","OuO","#FFE09B","battle","コロシアムのランク戦で 5 回連続勝利で解放"],
    ["kaomoji_uwu_sweat","UwU;","#FFC4A8","battle","味方の残り HP が合計 10% 以下で戦闘に勝利すると解放"],
    ["kaomoji_transcendent",">w<","#FFD0E5","explore","1 回の探索でトランセンデントを 2 個獲得で解放"],
    ["emoji_sleep","💤","#BDB2D0","battle","1 回の戦闘で味方が合計 10 回眠ると解放"],
    ["emoji_crown","👑","#BDB2D0","battle","Rank6 だけで編成して 100 回勝利で解放"],
    ["emoji_heart","💗","#BDB2D0","battle","同じ種類のホムンクルスを編成して 1,000 回勝利で解放"],
    ["hidden_race_bet_miss_10","はずれ券の山","#a8a29e","race_world_guild","単勝を N 回買って、1 回も当たらないと解放"],
    ["hidden_race_bet_miss_50","はずれ券の山脈","#d6d3d1","race_world_guild","単勝を N 回買って、1 回も当たらないと解放"],
    ["hidden_race_own_bet_hit","自分を信じる者","#f9a8d4","race_world_guild","自分のホムンクルスの単勝を当てると解放"],
    ["hidden_race_last_place_20","しんがりの美学","#94a3b8","race_world_guild","地方予選で最下位 N 回で解放"],
    ["hidden_world_base_houses_5","建築道楽","#d6a77a","race_world_guild","自分の家を 5 軒建てると解放"],
    ["hidden_guild_dungeon_loot_defeat_1000","ダンジョンの養分","#a3a3a3","race_world_guild","ギルドダンジョンで負けて品を盗まれた回数 N 回で解放"],
    ["hidden_former_king","元国王","#9c9284","race_world_guild","国王の任期を終えると解放"],
    ["hidden_slot_net_loss_2_5b","ギャンブルやめて😭","#facc15","money","スロットの収支の累計が −2,500,000,000 G に届くと解放"],
    ["hidden_slot_net_loss_10b","終わった人","#ef4444","money","スロットの収支の累計が −10,000,000,000 G に届くと解放"]
  ].map(([id, label, color, theme, conditionText]) => ({
    id, label, color, theme, conditionText,
    category: "hidden", condition: { type: "achievement" }, hidden: true, unlocked: false
  }));
})();

// extras.js
(() => {
  "use strict";

  const { activeGroup } = modules.hakoAfListRules;

  const features = {
    detail: "AF詳細の予測・コピー",
    inventory: "装備・強化・分解の拡張フィルター",
    enhanceEstimate: "強化画面にLv4000までの費用の目安を表示",
    market: "フリマ・オークション・個人間取引の拡張フィルター",
    marketWatch: "フリマの最安値の推移を記録",
    explore: "探索結果の全件一覧・絞り込み",
    exploreAnalysis: "探索結果にストックあたりの獲得量を表示",
    hiddenTitles: "称号設定に未取得の隠し称号を表示",
    gacha: "AFガチャ・スーパーガチャの結果に性能を表示",
    skillPresets: "ホムンクルスのスキルプリセット",
    chat: "チャットの返信元へ移動",
    daily: "今日のゴールド・ポーション増減",
    home: "ホームの拡張通知"
  };
  const afRanks = ["コモン", "アンコモン", "レア", "エリート", "エピック", "ヒロイック", "レジェンダリー",
    "ミシック", "セレスティアル", "ディヴァイン", "トランセンデント", "エターナル"];
  // Each row includes the default order and page for a new installation.
  const types = [
    ...afRanks.slice(0, 9).map((name, index) => [`af${index + 1}`, `AF・${name}`, 5, 3, "artifact"]).concat([
      ["af10", `AF・${afRanks[9]}`, 2, 1, "divine"],
      ["af11", `AF・${afRanks[10]}`, 1, 1, "transcendent"],
      ["af12", `AF・${afRanks[11]}`, 1, 1, "transcendent"]
    ]).reverse(),
    ["soul", "魂", 3, 2], ["egg", "タマゴ", 4, 2], ["normal", "通常アイテム", 6, 4, "other"],
    ["special", "特殊アイテム", 6, 5, "other"], ["afOther", "AF・レアリティ不明", 5, 5, "artifact"],
    ["other", "その他のアイテム", 6, 5]
  ];
  const alerts = {
    npc: "NPCショップ",
    npcLimited: "NPCショップの限定品",
    npcNormal: "NPCショップの通常品",
    npcMedal: "NPCショップの勲章交換",
    npcMark: "NPCショップの踏破交換",
    guildBoss: "ギルドボス",
    guildShop: "ギルドショップ",
    expedition: "遠征",
    hatchery: "孵化",
    ark: "アークショップの限定商品",
    production: "生産",
    colosseum: "コロシアム",
    "slot:low": "スロット（低レート）",
    "slot:mid": "スロット（中レート）",
    "slot:high": "スロット（高レート）",
    "slot:vip": "スロット（超高レート）",
    nation: "国のイベント",
    materials: "通常アイテムの所持数",
    other: "その他のホーム通知"
  };
  const configKey = "hakoAf4000:settings";
  const autoUpdateKey = "hakoAf4000:autoUpdate";
  const matchColors = [["red", "赤（既定）"], ["blue", "水色"], ["purple", "紫"], ["white", "白"], ["gold", "金"]];
  const alertsOffByDefault = new Set(["npc", "npcLimited", "npcMedal", "ark", "production", "colosseum",
    "slot:low", "slot:mid", "slot:high", "nation"]);

  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep the in-tab settings. */ }
  }
  function bounded(number, fallback) {
    const n = Math.floor(Number(number));
    return Number.isFinite(n) && n >= 1 && n <= 99 ? n : fallback;
  }
  function loadSettings() {
    const stored = get(configKey) ?? {};
    return {
      features: Object.fromEntries(Object.keys(features).map(id => [id, stored.features?.[id] !== false])),
      paging: ["standard", "all", "priority"].includes(stored.paging) ? stored.paging : "priority",
      candidates: ["mark", "first", "only"].includes(stored.candidates) ? stored.candidates : "first",
      matchColor: matchColors.some(([color]) => color === stored.matchColor) ? stored.matchColor : "red",
      thresholdName: typeof stored.thresholdName === "string" ? stored.thresholdName : "",
      groups: Object.fromEntries(types.map(([id, , order, page, legacy]) => [id, {
        order: bounded((stored.groups?.[id] ?? stored.groups?.[legacy])?.order, order),
        page: bounded((stored.groups?.[id] ?? stored.groups?.[legacy])?.page, page)
      }])),
      alerts: Object.fromEntries(Object.keys(alerts).map(id => [id,
        stored.alerts?.[id] ?? (id.startsWith("slot:") ? stored.alerts?.slot : undefined) ?? !alertsOffByDefault.has(id)]))
    };
  }
  const settings = loadSettings();
  const balanceDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const balanceTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  const numbers = new Intl.NumberFormat("ja-JP");
  const delta = new Intl.NumberFormat("ja-JP", { signDisplay: "exceptZero" });
  const homeText = {
    npc: /NPCショップ|勲章交換|踏破交換/, guildBoss: /ギルド.{0,8}(?:ボス|守護)/,
    guildShop: /ギルドショップ/, expedition: /遠征/, hatchery: /孵化/,
    ark: /アークショップ/, production: /生産|アイテム錬金|上限到達/,
    colosseum: /コロシアム/, nation: /国のお知らせ|ビンゴ|買取|買い取り|国王|国の/
  };
  const homeRoot = "[data-home-tutorial-root],.fx-home,[data-ha4-home-root]";
  const settingsControl = ".fx-topbar__settings,[data-ha4-settings-anchor]";
  const menuControl = 'button[title="メニュー"]';

  function start({ node, requestScan, viewRule, toMetrics, listOptions, effectOption, makePanel, appendExploreReset }) {
    const enabled = key => settings.features[key] !== false;
    let currentDrops = null;
    let previousDrops;
    let currentBalance = null;
    let explore;
    let settingsDialog;
    let nativeAlertState = new Set();
    let homeTimers = [];
    let homeChecked = new Set();
    let watchOwner;
    let watchItems = [];
    let watchCounts = new Map();
    let inventoryItem, itemWatch;
    const skillRoots = new Map();
    const skillRows = new Map();
    const skillPanels = new Map();
    const selectedSkillPresets = new Map();
    let skillMarks = new Map();
    const settingButton = makeButton("拡張設定", "settings-launch");
    settingButton.setAttribute("aria-haspopup", "dialog");
    settingButton.addEventListener("click", event => {
      event.stopPropagation();
      openSettings();
    });
    let dailyChip, homePanel, chatPreview, chatPreviewQuote;

    function makeButton(label, kind = "extra-button") {
      const button = node("button", kind, label);
      button.type = "button";
      return button;
    }
    function tellMain() {
      const detail = JSON.stringify(settings.features);
      document.dispatchEvent(new CustomEvent("hako-af:extra-settings", { detail }));
      if (!enabled("chat")) {
        closeChatPreview();
        for (const quote of document.querySelectorAll("[data-ha4-chat-quote]")) {
          if (quote.dataset.ha4 === "chat-hidden-quote") {
            quote.remove();
            continue;
          }
          quote.removeAttribute("data-ha4-chat-quote");
          quote.removeAttribute("role");
          quote.removeAttribute("tabindex");
        }
      }
    }
    function changeSettings() {
      save(configKey, settings);
      tellMain();
      requestScan();
    }
    function readItems() {
      const request = /^\/(?:f\/)?items\/?$/.test(location.pathname) || enabled("home") && settings.alerts.materials
        ? { owner: watchOwner, ids: watchItems.map(item => item.id) }
        : null;
      document.dispatchEvent(new CustomEvent("hako-af:read-items", { detail: JSON.stringify(request) }));
    }
    function saveWatches() {
      if (watchOwner) save("hakoAf4000:materials:" + watchOwner, watchItems);
      requestScan();
    }
    function receiveItems(data) {
      const newOwner = data?.owner;
      const changedOwner = watchOwner !== newOwner;
      if (changedOwner) {
        watchOwner = newOwner;
        const saved = newOwner && get("hakoAf4000:materials:" + newOwner);
        watchItems = Array.isArray(saved) ? saved.filter(item => typeof item?.id === "string" && typeof item.name === "string") : [];
        watchCounts = new Map();
      }
      const next = new Map(data.counts);
      const now = Date.now();
      let changed = false;
      for (const item of watchItems) {
        const amount = next.get(item.id);
        if (amount == null || watchCounts.has(item.id) && item.amount === amount) continue;
        Object.assign(item, { amount, checkedAt: now });
        changed = true;
      }
      if (changed) saveWatches();
      watchCounts = next;
      requestScan();
    }

    function updateItemWatch() {
      const entry = inventoryItem?.anchor.isConnected && watchOwner ? inventoryItem : null;
      if (!entry) {
        itemWatch?.element.remove();
        itemWatch = null;
        return;
      }
      const { anchor, id, name } = entry;
      const find = () => watchItems.find(item => item.id === id);
      const saved = find();
      const signature = JSON.stringify([watchOwner, id, saved?.goal ?? null, !!saved]);
      if (itemWatch?.signature === signature && itemWatch.element.parentElement === anchor) return;
      itemWatch?.element.remove();
      const element = node("div", "watch-item");
      const toggle = makeButton(saved ? "ホーム通知を解除" : "ホーム通知に追加");
      const goal = document.createElement("input");
      goal.type = "text";
      goal.inputMode = "numeric";
      goal.maxLength = 21;
      goal.placeholder = "任意";
      goal.value = saved?.goal ?? "";
      goal.setAttribute("aria-label", name + "の目標数");
      const readGoal = () => {
        const digits = goal.value.normalize("NFKC").replace(/[\s,]/g, "");
        const number = Number(digits);
        return !digits ? null : /^\d+$/.test(digits) && Number.isSafeInteger(number) && number > 0 ? number : undefined;
      };
      const checkGoal = () => {
        const value = readGoal();
        goal.setCustomValidity(value === undefined ? "目標数は正の整数で入力してください。" : "");
        return goal.reportValidity();
      };
      goal.addEventListener("change", () => {
        if (!checkGoal()) return;
        const item = find();
        if (item) {
          item.goal = readGoal();
          saveWatches();
        }
      });
      toggle.addEventListener("click", () => {
        if (find()) watchItems = watchItems.filter(item => item.id !== id);
        else if (checkGoal()) watchItems.push({ id, name, goal: readGoal() });
        else return;
        saveWatches();
        updateItemWatch();
        itemWatch?.element.querySelector("button")?.focus();
      });
      element.append(toggle);
      const label = node("label", "watch-goal", "目標数");
      label.append(goal);
      element.append(label);
      anchor.prepend(element);
      itemWatch = { element, signature };
    }

    function updateSkillPresets() {
      for (const [root, panel] of skillPanels) {
        if (skillRoots.get(root) === panel.key && root.isConnected) continue;
        panel.bar.remove();
        skillPanels.delete(root);
      }
      const nextMarks = new Map();
      for (const [root, key] of skillRoots) {
        const rows = [...(skillRows.get(key)?.values() ?? [])];
        if (!rows.length) continue;
        const presets = get(key) ?? [];
        let panel = skillPanels.get(root);
        if (!panel) {
          const bar = node("div", "skill-presets");
          const picker = document.createElement("select");
          picker.setAttribute("aria-label", "スキルプリセット");
          const name = document.createElement("input");
          name.placeholder = "プリセット名";
          name.setAttribute("aria-label", "プリセット名");
          name.maxLength = 50;
          const add = makeButton("現在の控えを保存");
          const remove = makeButton("プリセットを削除");
          const status = node("span", "skill-preset-status");
          status.setAttribute("role", "status");
          bar.append(picker, name, add, remove, status);
          root.prepend(bar);
          panel = { key, bar, picker, status, remove };
          skillPanels.set(root, panel);
          picker.addEventListener("change", () => {
            selectedSkillPresets.set(key, picker.value);
            requestScan();
          });
          add.addEventListener("click", () => {
            const label = name.value.trim() || picker.value;
            if (!label) {
              name.focus();
              return;
            }
            const current = get(key) ?? [];
            const entries = [...(skillRows.get(key)?.values() ?? [])].map(({ id, name, reserved }) => ({ id, name, reserved }));
            save(key, [...current.filter(item => item.label !== label), { label, entries }]);
            selectedSkillPresets.set(key, label);
            name.value = "";
            requestScan();
          });
          remove.addEventListener("click", () => {
            if (!picker.value) return;
            save(key, (get(key) ?? []).filter(item => item.label !== picker.value));
            selectedSkillPresets.delete(key);
            requestScan();
          });
        }
        const chosen = presets.find(item => item.label === selectedSkillPresets.get(key));
        const labels = JSON.stringify(presets.map(item => item.label));
        if (panel.labels !== labels) {
          panel.labels = labels;
          panel.picker.replaceChildren(new Option("スキルプリセット", ""), ...presets.map(item => new Option(item.label, item.label)));
        }
        panel.picker.value = chosen?.label ?? "";
        panel.remove.disabled = !chosen;
        const differences = [];
        let missing = 0;
        for (const desired of chosen?.entries ?? []) {
          const row = skillRows.get(key).get(desired.id);
          if (!row) {
            missing++;
            continue;
          }
          if (row.reserved === desired.reserved) continue;
          differences.push(desired);
          row.anchor.dataset.ha4SkillChange = "";
          const label = desired.reserved ? "控えにする" : "使用に戻す";
          const mark = skillMarks.get(row.anchor) ?? node("span", "skill-change");
          if (mark.textContent !== label) mark.textContent = label;
          if (row.anchor.nextElementSibling !== mark) row.anchor.after(mark);
          nextMarks.set(row.anchor, mark);
        }
        differences.sort((a, b) => Number(b.reserved) - Number(a.reserved));
        const message = !chosen ? "表示中の控えと使用中の状態を保存できます。" : !differences.length ?
          "表示中のスキルに変更はありません。" : differences.map(item => (item.reserved ? "控えへ " : "使用に戻す ") + item.name).join(" ／ ");
        const full = missing ? message + `　未表示・未確認 ${missing}件` : message;
        if (panel.status.textContent !== full) panel.status.textContent = full;
      }
      for (const [anchor, mark] of skillMarks) {
        if (nextMarks.has(anchor)) continue;
        delete anchor.dataset.ha4SkillChange;
        mark.remove();
      }
      skillMarks = nextMarks;
    }
    function labeled(parent, name, control) {
      const label = node("label", "extra-field");
      label.append(name, control);
      control.setAttribute("aria-label", name);
      parent.append(label);
    }
    function subsection(dialog, title) {
      const section = node("section", "extra-section");
      section.append(node("h3", "extra-heading", title));
      dialog.append(section);
      return section;
    }
    function select(parent, label, values, selected, onChange) {
      const field = document.createElement("select");
      field.replaceChildren(...values.map(([value, name]) => new Option(name, value)));
      field.value = selected;
      labeled(parent, label, field);
      field.addEventListener("change", () => { onChange(field.value); changeSettings(); });
    }
    function field(parent, label, type, value, onChange) {
      const input = document.createElement("input");
      input.type = type;
      if (type === "checkbox") input.checked = value;
      else input.value = value;
      if (type === "number") {
        input.min = 1;
        input.max = 99;
      }
      if (type === "text") input.maxLength = 80;
      labeled(parent, label, input);
      input.addEventListener("change", () => {
        onChange(type === "checkbox" ? input.checked : input.value);
        changeSettings();
      });
    }

    function openSettings() {
      if (settingsDialog?.open) return;
      settingsDialog?.remove();
      const dialog = settingsDialog = node("dialog", "settings");
      const title = node("h2", "extra-heading", "拡張設定");
      title.id = "ha4-settings-title";
      dialog.setAttribute("aria-labelledby", title.id);
      const close = makeButton("閉じる");
      close.autofocus = true;
      close.addEventListener("click", () => dialog.close());
      const header = node("header", "extra-header");
      header.append(title, close);
      dialog.append(header);

      const desktop = modules.hakoAfDesktopUpdates;
      const version = desktop?.version ?? modules.hakoAfUserscriptVersion;
      if (version) {
        const updates = subsection(dialog, "更新");
        updates.append(node("p", "extra-note", "使用中のバージョン v" + version));
        if (desktop || modules.hakoAfUpdateManaged) {
          const autoUpdate = document.createElement("input");
          autoUpdate.type = "checkbox";
          autoUpdate.checked = get(autoUpdateKey) !== false;
          labeled(updates, "自動更新", autoUpdate);
          autoUpdate.addEventListener("change", () => {
            save(autoUpdateKey, autoUpdate.checked);
            document.dispatchEvent(new Event("hako-af:auto-update-changed"));
          });
          updates.append(node("p", "extra-note", desktop
            ? "24時間に1回確認し、新しいZIPを取得します。展開したファイルを現在の拡張機能フォルダーに上書きし、拡張機能とはこホムのタブを再読み込みしてください。"
            : "はこホムを表示している間に24時間に1回確認し、次にページが読み込まれるときに反映します。"));
        }
        if (desktop) {
          const status = node("p", "extra-note");
          status.setAttribute("role", "status");
          const saveZip = makeButton("更新ZIPを保存");
          saveZip.addEventListener("click", desktop.saveArchive);
          const showArchive = () => {
            const available = desktop.archiveVersion();
            status.textContent = available ? "v" + available + "のZIPを取得済み" : "";
            saveZip.hidden = !available;
          };
          updates.append(status, saveZip);
          showArchive();
          document.addEventListener("hako-af:desktop-update-archive", showArchive);
          dialog.addEventListener("close", () => document.removeEventListener("hako-af:desktop-update-archive", showArchive), { once: true });
        }
      }
      const functions = subsection(dialog, "機能のオン／オフ");
      for (const [id, name] of Object.entries(features)) {
        field(functions, name, "checkbox", settings.features[id], value => { settings.features[id] = value; });
      }
      const drops = subsection(dialog, "探索結果");
      appendExploreReset?.(drops);
      select(drops, "ページ表示", [["standard", "標準の件数"], ["all", "全件表示"], ["priority", "優先度別ページ"]],
        settings.paging, value => { settings.paging = value; });
      select(drops, "しきい値に合ったAF", [["first", "目印を付けて先頭へ"], ["mark", "目印を付ける"], ["only", "該当AFだけ表示"]],
        settings.candidates, value => { settings.candidates = value; });
      select(drops, "一致したAFの強調色", matchColors, settings.matchColor, value => { settings.matchColor = value; });
      field(drops, "条件名（通知用）", "text", settings.thresholdName, value => { settings.thresholdName = value.trim(); });
      drops.append(node("p", "extra-note", "数字が小さい種類から先に表示します。同じ表示順ではゲーム側の並び順が使われます。リソース・レシピは標準の獲得欄に表示されます。"));
      const table = node("div", "extra-ranks");
      for (const caption of ["アイテムの種類", "表示順", "ページ"]) table.append(node("strong", "extra-caption", caption));
      for (const [id, name] of types) {
        table.append(node("span", "extra-category", name));
        field(table, name + "の表示順", "number", settings.groups[id].order, value => {
          settings.groups[id].order = bounded(value, settings.groups[id].order);
        });
        field(table, name + "のページ", "number", settings.groups[id].page, value => {
          settings.groups[id].page = bounded(value, settings.groups[id].page);
        });
      }
      drops.append(table);
      const home = subsection(dialog, "ホームの通知");
      home.append(node("p", "extra-note", "ショップやギルドの当日分は、状態を読み込むまで「未実行（未確認）」と表示します。"));
      for (const [id, name] of Object.entries(alerts)) {
        field(home, name, "checkbox", settings.alerts[id], value => { settings.alerts[id] = value; });
      }
      dialog.addEventListener("close", () => {
        dialog.remove();
        if (settingsDialog === dialog) settingsDialog = undefined;
        requestScan();
      });
      document.body.append(dialog);
      dialog.showModal();
      requestScan();
    }

    function labelThreshold(state) {
      if (settings.thresholdName) return settings.thresholdName;
      const format = group => {
        const parts = group.children.map(row => {
          if (row.children) return `（${format(row)}）`;
          const { label, unit } = effectOption(row.key);
          return label + (row.min ? ` ${row.min}${unit}以上` : "") +
            (row.max ? ` ${row.max}${unit}以下` : "") + (row.stars ? ` ★${row.stars}以上` : "");
        });
        return group.join === "count" ? `${parts.length}件中${group.minimum}件以上（${parts.join(" ／ ")}）` :
          parts.join(group.join === "or" ? " または " : " かつ ");
      };
      return format(activeGroup(state.root));
    }

    function clearExplore() {
      if (!explore) return;
      explore.panel.remove();
      explore.controls.remove();
      explore.status.remove();
      explore = null;
      applyExplore(null);
    }

    let sentExplore;
    function applyExplore(plan) {
      const detail = JSON.stringify(plan);
      if (sentExplore === detail) return;
      sentExplore = detail;
      document.dispatchEvent(new CustomEvent("hako-af:apply-explore", { detail }));
    }

    function prepareExplore(anchor) {
      if (explore?.anchor === anchor) return explore;
      clearExplore();
      sentExplore = undefined;
      const panel = makePanel("explore");
      const controls = node("div", "explore-controls");
      const status = node("div", "explore-status");
      status.setAttribute("role", "status");
      status.setAttribute("aria-atomic", "true");
      status.hidden = true;
      const statusCount = node("strong", "explore-status-count");
      const statusBasis = node("span", "explore-status-basis");
      const statusDetail = node("span", "explore-status-detail");
      status.append(statusCount, statusBasis, statusDetail);
      const legend = node("span", "explore-sort-legend");
      legend.hidden = true;
      const matchLegend = node("span", "explore-match-legend", "✓ 一致した条件");
      matchLegend.hidden = true;
      const mode = document.createElement("select");
      mode.setAttribute("aria-label", "探索結果のページ表示");
      mode.replaceChildren(new Option("標準の件数", "standard"), new Option("全件表示", "all"), new Option("優先度別ページ", "priority"));
      mode.addEventListener("change", () => {
        settings.paging = mode.value;
        changeSettings();
      });
      controls.append(panel.element, mode, legend, matchLegend);
      anchor.append(controls);
      const summary = anchor.closest(".fx-summary") ?? anchor.parentElement?.parentElement;
      const banner = summary?.querySelector(".fx-summary__banner") ?? [...(summary?.querySelectorAll("span") ?? [])]
        .find(el => el.textContent.trim() === "アーティファクトアイテムを獲得しました！")?.parentElement;
      if (banner) banner.after(status);
      else anchor.after(status);
      explore = { anchor, panel, controls, status, statusCount, statusBasis, statusDetail, mode, legend, matchLegend };
      return explore;
    }

    function updateExplore() {
      if (!enabled("explore") || !currentDrops || !currentDrops.anchor.isConnected) {
        clearExplore();
        return;
      }
      const { anchor, rows: data } = currentDrops;
      const ui = prepareExplore(anchor);
      const { state } = ui.panel;
      if (ui.mode.value !== settings.paging) ui.mode.value = settings.paging;
      const plan = { enabled: true, root: state.root, useForecast: state.useForecast, showUnknown: state.showUnknown,
        sort: state.sortKey ? { key: state.sortKey, direction: state.sortDirection, forecast: state.useForecast } : null,
        paging: settings.paging, groups: settings.groups, candidates: settings.candidates };
      applyExplore(plan);
      const config = JSON.stringify([plan, settings.thresholdName]);
      if (config === ui.signature && data === ui.data) return;
      ui.signature = config;
      ui.data = data;
      const view = viewRule(state);
      const legendText = plan.sort ? "並び順 " + effectOption(plan.sort.key).label +
        (!view.active && plan.sort.forecast ? "（→ Lv4000予測）" : "") : "";
      if (ui.legend.textContent !== legendText) ui.legend.textContent = legendText;
      ui.legend.hidden = !legendText;
      const matchText = "✓ 一致した条件" + (state.useForecast ? "　→ Lv4000予測" : "");
      if (ui.matchLegend.textContent !== matchText) ui.matchLegend.textContent = matchText;
      ui.matchLegend.hidden = !view.active;
      ui.matchLegend.dataset.color = settings.matchColor;
      const list = data.map(item => ({ ...item, ...toMetrics(item.raw) }));
      let matches = 0;
      let unknown = 0;
      const counts = new Map();
      for (const item of list) {
        const outcome = view.check(item);
        if (outcome.result === true) matches += item.amount;
        if (outcome.unknown) unknown += item.amount;
        for (const metric of item.metrics.keys()) counts.set(metric, (counts.get(metric) ?? 0) + item.amount);
      }
      const condition = view.active && !view.error ? labelThreshold(state) : "";
      const unverified = unknown ? "（判定不可 " + numbers.format(unknown) + "個）" : "";
      let message = "";
      if (view.error) message = view.error;
      else if (view.active) {
        const short = condition.length > 95 ? condition.slice(0, 94) + "…" : condition;
        message = "「" + short + "」の条件を満たしたAFが" + numbers.format(matches) + "個ドロップしました。" + unverified;
      }
      const countLabel = view.error ? "条件を確認" : matches > 0 ? "一致あり " + numbers.format(matches) + "個" : "一致なし 0個";
      const basisLabel = view.error ? "" : state.useForecast ? "Lv4000予測" : "現在値";
      const detailLabel = view.error || (condition ? "「" + condition + "」" + unverified : "");
      ui.status.dataset.result = view.error ? "error" : matches > 0 ? "hit" : "miss";
      if (ui.statusCount.textContent !== countLabel) ui.statusCount.textContent = countLabel;
      if (ui.statusBasis.textContent !== basisLabel) ui.statusBasis.textContent = basisLabel;
      ui.statusBasis.hidden = !basisLabel;
      if (ui.statusDetail.textContent !== detailLabel) ui.statusDetail.textContent = detailLabel;
      if (ui.statusDetail.title !== detailLabel) ui.statusDetail.title = detailLabel;
      ui.status.hidden = !message;
      ui.panel.refresh(listOptions(list, state), counts, {
        active: view.active, matched: matches, unknown, message, resultLabel: "候補", matchingIds: []
      });
    }

    function recordBalance(value) {
      if (!value && currentBalance) requestScan();
      currentBalance = value;
      if (!value || !enabled("daily")) return;
      const date = balanceDate.format(value.now);
      const key = "hakoAf4000:daily:" + value.id;
      const previous = get(key);
      const day = previous?.date === date ? previous : { date };
      let changed = previous?.date !== date;
      for (const type of ["gold", "potion"]) {
        if (value[type] == null) continue;
        if (!day[type] || value.now < day[type].baselineAt) {
          day[type] = { baseline: value[type], baselineAt: value.now };
          changed = true;
        }
      }
      if (changed) save(key, day);
      currentBalance = { ...value, day };
      requestScan();
    }

    function dailyText() {
      if (!currentBalance?.day) return "";
      const { day } = currentBalance;
      return ["gold", "potion"].flatMap((type, index) => {
        const data = day[type];
        if (!data || currentBalance[type] == null) return [];
        const amount = BigInt(currentBalance[type]) - BigInt(data.baseline);
        return [`${index ? "ポーション" : "G"} ${delta.format(amount)}`];
      }).join(" ／ ");
    }

    function classify(label, hint) {
      if (Object.hasOwn(alerts, hint)) return hint;
      return ["guildBoss", "guildShop", "npc", "expedition", "hatchery", "ark", "production",
        "colosseum", "nation"].find(id => homeText[id].test(label)) ?? "other";
    }
    function withinFilter(id) {
      return settings.alerts[id] && (!id.startsWith("npc") || settings.alerts.npc);
    }
    function updateHome() {
      const home = location.pathname === "/" || location.pathname === "/f/home" || location.pathname === "/home";
      const top = document.querySelector(".fx-topbar,.layout-header") ?? (home ? document.querySelector("#__nuxt header") : null);
      const anchor = home ? document.querySelector(homeRoot) ?? document.querySelector("#__nuxt main") : null;
      const label = enabled("daily") && dailyText();
      if (label && (top || home && anchor)) {
        dailyChip ??= node("div", "daily-balance");
        const caption = "今日の増減（JST） " + label;
        if (dailyChip.textContent !== caption) dailyChip.textContent = caption;
        const times = Object.entries(currentBalance.day).filter(([, v]) => v?.baselineAt != null)
          .map(([type, v]) => (type === "gold" ? "ゴールド" : "ポーション") + " " + balanceTime.format(v.baselineAt));
        dailyChip.title = "基準は今日最初に確認した残高（" + times.join("／") + "）";
        if (top) {
          if (top.nextElementSibling !== dailyChip) top.after(dailyChip);
        } else if (dailyChip.parentElement !== anchor) anchor.prepend(dailyChip);
      } else dailyChip?.remove();
      const nextHidden = new Set();
      if (!home || !anchor || !enabled("home")) {
        for (const row of nativeAlertState) row.removeAttribute("data-ha4-hidden-alert");
        nativeAlertState = nextHidden;
        homePanel?.remove();
        return;
      }
      const rows = [];
      const nativeCategories = new Set();
      const hasHatcheryTimer = homeTimers.some(task => task.id === "hatchery");
      for (const row of document.querySelectorAll("#fx-todo .fx-todo__list > li,[aria-label='国のお知らせ'] li")) {
        const message = row.textContent.trim().replace(/\s+/g, " ").replace(/[×›▽]\s*$/g, "").trim();
        const link = row.querySelector("a[href]");
        if (/ギルドダンジョン/.test(message) || /^\/(?:f\/)?guild-dungeons(?:\/|$)/.test(link?.pathname ?? "")) continue;
        const isNation = row.closest("[aria-label='国のお知らせ']") && !homeText.guildBoss.test(message);
        const id = classify(message, isNation ? "nation" : null);
        if (!withinFilter(id)) {
          row.setAttribute("data-ha4-hidden-alert", "");
          nextHidden.add(row);
        } else if (message && id !== "guildBoss" && !(id === "hatchery" && hasHatcheryTimer) &&
            !(id === "npc" && homeChecked.has("npcLimited") && homeChecked.has("npcNormal") && /商品が入れ替わりました/.test(message))) {
          nativeCategories.add(id);
          rows.push({ id, message, to: link?.pathname && link.origin === location.origin ? link.pathname + link.search : null });
        }
      }
      for (const row of nativeAlertState) if (!nextHidden.has(row)) row.removeAttribute("data-ha4-hidden-alert");
      nativeAlertState = nextHidden;
      for (const task of homeTimers) {
        if ((task.pending && nativeCategories.has(task.id)) || !withinFilter(task.id)) continue;
        rows.push(task);
      }
      if (settings.alerts.materials) {
        for (const item of watchItems) {
          const live = watchCounts.has(item.id);
          const amount = watchCounts.get(item.id) ?? item.amount;
          const valid = Number.isSafeInteger(amount) && amount >= 0;
          const goal = item.goal;
          const reached = valid && goal > 0 && amount >= goal;
          const reading = valid ? numbers.format(amount) + (goal ? " / " + numbers.format(goal) : "") : "所持数未確認";
          const when = item.checkedAt ? `（前回確認 ${balanceDate.format(item.checkedAt).slice(5)} ${balanceTime.format(item.checkedAt)}）` : "";
          const status = reached ? live ? "　目標達成" : "　前回確認時に目標達成" : "";
          rows.push({ id: "materials", to: "/items?ha4_item=" + encodeURIComponent(item.id), reached: reached && live, message:
            `${item.name}　${reading}${status}${live ? "" : when}` });
        }
      }
      if (!rows.length) {
        homePanel?.remove();
        return;
      }
      if (!homePanel) {
        homePanel = node("details", "home-alerts");
        homePanel.open = true;
        homePanel.append(node("summary", "extra-heading", "拡張通知"), node("ul", "extra-alert-list"));
      }
      if (homePanel.parentElement !== anchor) anchor.prepend(homePanel);
      const messages = new Map(rows.map(({ id, message, end, to, reached }) => {
        const label = id.startsWith("slot:") ? "スロット" : alerts[id];
        const prefix = id === "materials" || id === "hatchery" || message.startsWith(label) ? "" : label + "  ";
        const time = end ? `（${balanceDate.format(end).slice(5)} ${balanceTime.format(end)} JST）` : "";
        return [prefix + message + time, { to, reached }];
      }));
      const signature = JSON.stringify([...messages]);
      if (homePanel.dataset.content !== signature) {
        homePanel.dataset.content = signature;
        homePanel.lastElementChild.replaceChildren(...[...messages].map(([message, { to, reached }]) => {
          const item = node("li", "extra-alert");
          if (reached) item.dataset.ha4Goal = "";
          if (typeof to === "string" && /^\/(?!\/)/.test(to)) {
            const link = node("a", "extra-link", message);
            link.href = to;
            item.append(link);
          } else item.textContent = message;
          return item;
        }));
      }
    }

    function placeSettings() {
      const menu = document.querySelector(`#__nuxt header ${menuControl}`);
      const classic = Array.from(document.querySelectorAll("#__nuxt header nav button, #__nuxt header button[title='メニュー'] ~ div button"))
        .find(button => button.textContent.trim() === "設定");
      const anchor = document.querySelector(settingsControl) ?? classic;
      if (!anchor) {
        settingButton.remove();
        return;
      }
      settingButton.dataset.ha4Placement = anchor.matches(".fx-topbar__settings") ? "topbar" :
        menu && menu.parentElement.contains(anchor) ? "menu" : "header";
      if (anchor.nextElementSibling !== settingButton) anchor.after(settingButton);
    }

    function receive(event, callback) {
      try { callback(JSON.parse(event.detail)); } catch { /* Ignore data that could not be decoded. */ }
    }
    document.addEventListener("hako-af:drops", event => {
      if (previousDrops?.anchor === event.target && previousDrops.payload === event.detail) {
        currentDrops = previousDrops;
        return;
      }
      receive(event, rows => {
        if (Array.isArray(rows)) currentDrops = previousDrops = { anchor: event.target, rows, payload: event.detail };
      });
    });
    document.addEventListener("hako-af:balance", event => receive(event, recordBalance));
    document.addEventListener("hako-af:watched-items", event => receive(event, receiveItems));
    document.addEventListener("hako-af:inventory-item", event => receive(event, item => {
      if (event.target instanceof Element && item?.id && item.name) inventoryItem = { ...item, anchor: event.target };
    }));
    const skillKey = identity => "hakoAf4000:skill-presets:" + JSON.stringify(identity);
    document.addEventListener("hako-af:skill-preset-editor", event => receive(event, identity => {
      if (event.target instanceof Element) skillRoots.set(event.target, skillKey(identity));
    }));
    document.addEventListener("hako-af:skill-preset-entry", event => receive(event, entry => {
      if (!(event.target instanceof Element)) return;
      const key = skillKey(entry.identity);
      if (!skillRows.has(key)) skillRows.set(key, new Map());
      const rows = skillRows.get(key);
      if (!rows.has(entry.id)) rows.set(entry.id, { ...entry, anchor: event.target });
    }));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) requestScan(); });
    document.addEventListener("hako-af:home-alerts", event => receive(event, data => {
      if (Array.isArray(data?.alerts) && Array.isArray(data.checked)) {
        homeTimers = data.alerts;
        homeChecked = new Set(data.checked);
        requestScan();
      }
    }));
    function closeChatPreview() {
      chatPreview?.remove();
      chatPreviewQuote?.removeAttribute("aria-expanded");
      chatPreview = chatPreviewQuote = null;
    }
    document.addEventListener("hako-af:chat-reply-preview", event => receive(event, reply => {
      const quote = event.target;
      if (!enabled("chat") || !(quote instanceof Element)) return;
      const keepClosed = chatPreviewQuote === quote && chatPreview?.isConnected;
      closeChatPreview();
      if (keepClosed || typeof reply?.text !== "string") return;
      quote.nextElementSibling?.matches('[data-ha4="chat-note"]') && quote.nextElementSibling.remove();
      const caption = reply.quoted ? "返信元（保存された引用）" : "非表示の返信元";
      chatPreview = node("section", "chat-reply-preview");
      chatPreview.setAttribute("aria-label", caption);
      chatPreview.setAttribute("aria-live", "polite");
      chatPreview.append(node("strong", "chat-reply-author", `${caption}　${reply.name}`),
        node("p", "chat-reply-text", reply.text));
      quote.after(chatPreview);
      chatPreviewQuote = quote;
      quote.setAttribute("aria-expanded", "true");
    }));
    document.addEventListener("hako-af:chat-missing", event => receive(event, message => {
      closeChatPreview();
      const quote = event.target;
      const note = node("span", "chat-note", message);
      note.setAttribute("role", "status");
      quote.nextElementSibling?.matches('[data-ha4="chat-note"]') && quote.nextElementSibling.remove();
      quote.after(note);
      setTimeout(() => note.remove(), 4200);
    }));
    window.addEventListener("resize", requestScan, { passive: true });
    tellMain();
    return {
      enabled,
      matchColor: () => settings.matchColor,
      beforeRead() {
        currentDrops = inventoryItem = null;
        skillRoots.clear();
        skillRows.clear();
        readItems();
      },
      refresh() {
        if (chatPreview && (!chatPreviewQuote.isConnected || chatPreviewQuote.nextElementSibling !== chatPreview)) {
          closeChatPreview();
        }
        placeSettings();
        updateItemWatch();
        updateSkillPresets();
        updateExplore();
        updateHome();
      }
    };
  }

  modules.hakoAfExtras = { start, get, save };
})();

// extras-main.js
(() => {
  "use strict";

  const settingsEvent = "hako-af:extra-settings";
  const chatRow = "[data-chat-message-id]";
  const chatLog = ".fx-chat-room__log,[role='log'],.overflow-y-auto";
  let options = {};
  let profileStore;
  let disposeProfile;
  let lastBalance = "";
  let midnightTimer;
  const dropCache = new WeakMap();
  const exploreCounts = new WeakMap();
  let homeSignature;
  let nextHomeUpdate;
  let reportOwner;
  const verifiedAlerts = new Map();
  const observedReports = new WeakMap();
  const homeSubscriptions = new Map();
  let raidResultStore;
  let disposeRaidResult;
  let raidQuotaOwner;
  let raidQuotaLabelNode;
  let lastRaidQuota;
  const jstOffset = 9 * 3600000;
  const dayMs = 86400000;
  const minuteMs = 60000;
  const slotDayStart = 210 * minuteMs;
  const slotSecondPart = 960 * minuteMs;
  const guildBossDailyLimit = 2;
  const guildBossReport = "guildBoss:attendance";
  const raidQuotaLabel = "本日の残り参加回数";
  const raidQuotaPattern = /本日の残り参加回数\s*([0-9]+)\s*[/／]\s*2(?![0-9])/;
  const slotRates = [["low", "低レート", 1000, 10000], ["mid", "中レート", 10000, 10000],
    ["high", "高レート", 50000, 10000], ["vip", "超高レート", 500000, 5000]];
  const reportLinks = {
    npcLimited: "/f/shop", npcNormal: "/f/shop", npcMedal: "/f/shop?tab=medal", npcMark: "/f/shop",
    guildBoss: null, guildShop: "/guild?tab=shop"
  };
  let inventoryStore;
  let unsubscribeInventory;
  let watchRequest;
  let inventorySignature;
  let inventoryFrame = 0;
  const warehouseLinks = new WeakMap();
  const marketPriceKey = "hakoAf4000:material-prices";
  const marketPriceLifetime = 86400000;
  const marketWatchers = new WeakSet();
  const nativeMarketPrices = modules.hakoAfMarketSnapshots;
  delete modules.hakoAfMarketSnapshots;
  let priceStorage;
  let savedMarketPrices = new Map();
  let trackedMarketItems = [];
  const skillQueries = new WeakMap();
  const displayedSkillPrices = new WeakMap();

  document.addEventListener("hako-af:market-watch-keys", event => {
    try {
      const keys = JSON.parse(event.detail);
      if (Array.isArray(keys)) trackedMarketItems = keys.filter(key => typeof key === "string" && key.startsWith("item:"));
    } catch { /* Ignore unreadable tracking keys. */ }
  });

  function marketPrice(value) {
    const price = Number(value);
    return Number.isSafeInteger(price) && price > 0 ? price : undefined;
  }

  function readMarketItemPrices(prices) {
    for (const key of trackedMarketItems) {
      const value = nativeMarketPrices?.get(key.slice(5));
      if (value) prices.set(key, value);
    }
  }

  function readMarketWatchItem(el, item, instance, cache, prices) {
    const id = item?.m_items?.id ?? item?.item_id ?? item?.id;
    if (!id || !item.m_items || item._artifact || item.soul_monster_id || item.m_items.type === "homunculus_egg") return;
    const key = `item:${id}`;
    const cached = cache?.get(id);
    const bulk = nativeMarketPrices?.get(id);
    if (bulk) prices.set(key, bulk);
    else if (cached?.data && Date.now() - cached.fetchedAt < 120000) {
      const amount = marketPrice(cached.data.cheapest_price);
      if (amount !== undefined) prices.set(key, { price: amount, at: cached.fetchedAt });
    }
    const nameKey = item.m_items.name_key;
    publish(el, "hako-af:market-watch-target", { key, name: nameKey && instance?.proxy?.$t?.(nameKey) || nameKey || id });
  }

  function readMarketWatchSkill(root, store, refs, prices) {
    const previousRefresh = root.querySelector("[data-ha4-market-price-refresh]");
    if (store?.tab === "buy" && store.buyView === "category" && store.selectedBuySkillKey) {
      const select = [...root.querySelectorAll("select")].find(node => node.querySelector('option[value="price_asc"]'));
      const header = select?.parentElement;
      if (!header?.getClientRects().length) {
        previousRefresh?.removeAttribute("data-ha4-market-price-refresh");
        return;
      }
      const name = header.firstElementChild?.textContent.trim();
      const key = `skill:${store.selectedBuySkillKey}`;
      if (name) publish(header, "hako-af:market-watch-target", { key, name });
      const reload = [...header.querySelectorAll("button")].find(button => button.textContent.trim() === "更新");
      if (previousRefresh !== reload) previousRefresh?.removeAttribute("data-ha4-market-price-refresh");
      if (reload && reload.dataset.ha4MarketPriceRefresh !== key) reload.dataset.ha4MarketPriceRefresh = key;
      const count = header.textContent.match(/([\d,]+)\s*\/\s*([\d,]+)\s*件/);
      const rows = refs.map(ref => ref._value).find(value => Array.isArray(value) && value.some(row => row?.skill_data?.skill_id && row.price != null));
      const query = `${key}|${select.value}|${store.buySearch ?? ""}`;
      const previous = skillQueries.get(root);
      const waitingForRows = !!previous && previous.rows === rows && (previous.query !== query || previous.waitingForRows);
      const at = previous?.rows === rows ? previous?.at ?? Date.now() : Date.now();
      skillQueries.set(root, { query, rows, waitingForRows, at });
      if (waitingForRows || !count || count[1] !== count[2] && select.value !== "price_asc") return;
      if (!rows) return;
      let cheapest = Infinity;
      for (const row of rows) {
        const skill = row.skill_data;
        if (!skill || `${skill.effect === "passive" ? "passive" : "skill"}:${skill.skill_id}` !== store.selectedBuySkillKey) continue;
        cheapest = Math.min(cheapest, marketPrice(row.price) ?? Infinity);
      }
      if (Number.isFinite(cheapest)) prices.set(key, { price: cheapest, at });
      return;
    }
    previousRefresh?.removeAttribute("data-ha4-market-price-refresh");
    if (store?.tab !== "sell" || !store.selected?.skillId) return;
    const label = [...root.querySelectorAll("span")].find(node => node.textContent.trim() === "市場最安値" && node.getClientRects().length);
    const row = label?.parentElement;
    const panel = row?.parentElement?.parentElement;
    const name = panel?.querySelector("h3")?.textContent.trim();
    if (!name) return;
    const key = `skill:${store.selected.effect}:${store.selected.skillId}`;
    const price = row.textContent.match(/([\d,]+)\s*G/);
    const amount = price && marketPrice(price[1].replaceAll(",", ""));
    if (amount) {
      const previous = displayedSkillPrices.get(root);
      const at = previous?.key === key && previous.price === amount ? previous.at : Date.now();
      displayedSkillPrices.set(root, { key, price: amount, at });
      prices.set(key, { price: amount, at });
    } else displayedSkillPrices.delete(root);
    publish(row, "hako-af:market-watch-target", { key, name });
  }

  function readMarketPrices() {
    try {
      const data = localStorage.getItem(marketPriceKey);
      if (priceStorage !== data) {
        savedMarketPrices = new Map(JSON.parse(data) ?? []);
        priceStorage = data;
      }
      return savedMarketPrices;
    } catch { return new Map(); }
  }

  function watchMarketPrices(store) {
    if (!store?.cache || marketWatchers.has(store)) return;
    marketWatchers.add(store);
    const capture = () => {
      if (!options.enhanceEstimate) return;
      const prices = new Map(readMarketPrices());
      const now = Date.now();
      let changed = false;
      for (const [key, entry] of store.cache) {
        if (typeof key !== "string" || key.includes("|") || !Number.isFinite(entry?.fetchedAt) ||
            now - entry.fetchedAt >= marketPriceLifetime || (prices.get(key)?.at ?? 0) >= entry.fetchedAt) continue;
        const data = entry.data;
        const price = data?.sold_avg == null ? null : Number(data.sold_avg);
        prices.set(key, { price: Number.isFinite(price) && price > 0 ? price : null, at: entry.fetchedAt });
        changed = true;
      }
      if (!changed) return;
      const recent = [...prices].filter(([, value]) => now - value.at < marketPriceLifetime)
        .sort((a, b) => b[1].at - a[1].at).slice(0, 100);
      try { localStorage.setItem(marketPriceKey, JSON.stringify(recent)); } catch { /* Storage is unavailable. */ }
    };
    store.$subscribe?.(capture, { detached: true });
    capture();
  }

  function readEnhanceEstimate(anchor, { item, translate }, config, profile) {
    const source = item.source_item_id || item.m_items?.id;
    if (!source) return;
    const rank = Number(item.m_items?.rank);
    const settings = config?.artifact?.enhance;
    const basePrice = Number(config?.shop?.basePrice?.rankPrices?.[rank]);
    const upgrades = new Set(profile?.profile?.building_upgrades ?? []);
    const countUpgrades = (prefix, count) => Array.from({ length: count }, (_, index) => upgrades.has(prefix + (index + 1)))
      .filter(Boolean).length;
    const stars = Object.entries(item._artifact.rarities ?? {}).reduce((sum, [key, value]) =>
      key === "__artifact_rank" || key === "__back_dungeon" ? sum : sum + Math.max(0, Math.floor(Number(value) || 0)), 0);
    const price = readMarketPrices().get(source);
    publish(anchor, "hako-af:enhance-estimate", {
      level: Number(item._artifact.level), source, name: translate(item.m_items?.name_key || source), stars,
      market: price && Date.now() - price.at < marketPriceLifetime ? price : null,
      rules: settings && Number.isFinite(basePrice) ? {
        basePrice, baseCap: Number(config.artifact.param?.max_level) || 1000,
        itemsPerStep: Number(settings.items_per_100level) || 1, gamma: Number(settings.items_curve_gamma) || 1,
        advancedCost: settings.advanced_cost_multiplier ?? 1.5, advancedSuccess: settings.advanced_success_rate_multiplier ?? .75,
        successGain: settings.success_gain ?? [1, 50], greatGain: settings.great_gain ?? [50, 100],
        failRate: settings.fail_rate ?? .3, failStep: settings.fail_rate_per_step ?? 0, failMax: settings.fail_rate_max ?? .75,
        failReduction: (settings.fail_reduction_per_level ?? .05) * countUpgrades("artifact_enhance_rate_lv", 6),
        goldMultiplier: settings.gold_mult ?? .1, starCoefficient: settings.rarity_gold_coef ?? 0,
        discount: (settings.gold_discount_per_level ?? .1) * countUpgrades("artifact_enhance_gold_lv", 3)
      } : null
    });
  }

  function appProperties() {
    return document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
  }

  function publish(target, name, value) {
    target.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: JSON.stringify(value) }));
  }

  function dateJst(now) {
    return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  }

  function sampleBalance(store) {
    if (!options.daily || !store?.isLoaded || !store.profile?.id) return;
    const quantity = value => {
      if (value == null) return null;
      const number = String(value);
      return /^\d+$/.test(number) ? number : null;
    };
    const gold = quantity(store.gold);
    const potion = store.profile.resources == null ? null : quantity(store.staminaPotions);
    if (gold == null && potion == null) return;
    const now = Date.now();
    const signature = JSON.stringify([store.profile.id, dateJst(now), gold, potion]);
    if (signature === lastBalance) return;
    lastBalance = signature;
    publish(document, "hako-af:balance", { id: String(store.profile.id), gold, potion, now });
  }

  function updateBalance() {
    if (!options.daily || document.hidden) return;
    const store = appProperties()?.$pinia?._s?.get("userProfile");
    if (!store) {
      lastBalance = "";
      publish(document, "hako-af:balance", null);
      return;
    }
    if (store !== profileStore) {
      disposeProfile?.();
      profileStore = store;
      disposeProfile = store.$subscribe?.(() => {
        if (!document.hidden && (!store.isLoaded || !store.profile?.id)) {
          lastBalance = "";
          publish(document, "hako-af:balance", null);
        } else if (!document.hidden) sampleBalance(store);
      }, { detached: true });
    }
    sampleBalance(store);
  }

  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    if (!options.daily) return;
    const now = Date.now();
    const delay = nextMidnight(now) - now;
    midnightTimer = setTimeout(() => {
      updateBalance();
      scheduleMidnight();
    }, delay + 30);
  }

  document.addEventListener(settingsEvent, event => {
    try { options = JSON.parse(event.detail); } catch { return; }
    if (!options.daily) {
      disposeProfile?.();
      disposeProfile = profileStore = undefined;
      lastBalance = "";
    }
    updateBalance();
    scheduleMidnight();
    homeSignature = undefined;
    if (!options.home) clearTimeout(nextHomeUpdate);
  });
  document.addEventListener("visibilitychange", updateBalance);
  document.addEventListener("hako-af:read-balance", updateBalance);
  window.addEventListener("pageshow", updateBalance);

  const rankLabels = ["", "コモン", "アンコモン", "レア", "エリート", "エピック", "ヒロイック",
    "レジェンダリー", "ミシック", "セレスティアル", "ディヴァイン", "トランセンデント", "エターナル"];

  function textName(key, fallback, props) {
    if (typeof key !== "string" || !key) return fallback;
    if (!/^[\w.-]+$/.test(key)) return key;
    if (typeof props?.$t === "function" && (typeof props?.$te !== "function" || props.$te(key))) {
      const translated = props.$t(key);
      if (typeof translated === "string" && translated !== key) return translated;
    }
    return fallback;
  }

  function readWatchedItems() {
    const props = appProperties();
    const stores = props?.$pinia?._s;
    const profile = stores?.get("userProfile");
    const owner = profile?.isLoaded ? profile.profile?.id : null;
    const ids = watchRequest?.owner === String(owner) ? watchRequest.ids : [];
    const store = owner && ids.length ? stores?.get("userItems") : null;
    if (store !== inventoryStore) {
      unsubscribeInventory?.();
      inventoryStore = store;
      unsubscribeInventory = store?.$subscribe?.(() => {
        if (!document.hidden && !inventoryFrame) {
          inventoryFrame = requestAnimationFrame(() => { inventoryFrame = 0; readWatchedItems(); });
        }
      }, { detached: true });
    }
    if (!watchRequest) return;
    const counts = [];
    for (const id of ids) {
      if (!store?.hasOwnedItemCount?.(id)) continue;
      const n = store.getOwnedItemCount?.(id);
      if (Number.isSafeInteger(n) && n >= 0) counts.push([id, n]);
    }
    const data = { owner: owner == null ? null : String(owner), counts };
    const signature = JSON.stringify(data);
    if (signature === inventorySignature) return;
    inventorySignature = signature;
    publish(document, "hako-af:watched-items", data);
  }

  document.addEventListener("hako-af:read-items", event => {
    try { watchRequest = JSON.parse(event.detail); } catch { return; }
    if (!watchRequest) inventorySignature = undefined;
    readWatchedItems();
  });

  function readInventoryItem(name, item, el) {
    if (!["ItemDetailPanel", "FlexItemDetail"].includes(name) || !/^\/(?:f\/)?items\/?$/.test(location.pathname)) return;
    const master = item?.m_items;
    if (!item?.item_id || !master || master.type || item._artifact || item.soul_monster_id || item._recipe) return;
    const id = String(item.item_id);
    const label = textName(master.name_key, item.display_name, appProperties());
    if (label) publish(el, "hako-af:inventory-item", { id, name: label });
  }

  function openWatchedItem(warehouse, grid, props, el) {
    if (!/^\/(?:f\/)?items\/?$/.test(location.pathname)) return;
    const id = new URLSearchParams(location.search).get("ha4_item");
    if (!id || warehouseLinks.get(warehouse)?.opened === id) return;
    const store = appProperties()?.$pinia?._s?.get("userItems");
    if (warehouseLinks.get(warehouse)?.prepared !== id) {
      warehouseLinks.set(warehouse, { prepared: id });
      if (store?.currentCategoryKey && store.currentCategoryKey !== "normal") store.setCategoryKey?.("normal", "items-inventory");
      if (store?.searchQuery) store.setSearchQuery?.("");
    }
    if (!grid || !el?.getClientRects().length || store?.currentCategoryKey && store.currentCategoryKey !== "normal" ||
        store?.searchQuery || store?.isLoading) return;
    const item = props?.items?.find(entry => String(entry.item_id) === id && entry.m_items && !entry.m_items.type &&
      !entry._artifact && !entry._recipe && !entry.soul_monster_id);
    if (!item || typeof grid.slots?.default !== "function") return;
    const slot = grid.slots.default({ item });
    const pending = Array.isArray(slot) ? [...slot] : [slot];
    // Ask the warehouse's own item handler to select the loaded item, even if it is outside the displayed page.
    while (pending.length) {
      const child = pending.pop();
      if (child?.props?.item === item && typeof child.props.onClick === "function") {
        warehouseLinks.set(warehouse, { opened: id });
        child.props.onClick();
        break;
      }
      if (Array.isArray(child?.children)) pending.push(...child.children);
    }
  }

  function skillIdentity(monster, layout) {
    const profile = appProperties()?.$pinia?._s?.get("userProfile");
    const owner = profile?.isLoaded ? profile.profile?.id : null;
    const id = monster.user_monster_id ?? monster.t_user_monsters?.id;
    if (owner && id) return [String(owner), String(id), layout];
  }

  function readSkillEditor(monster, props, el) {
    if (!options.skillPresets || !props?.reserveEnabled || props.pending || !Array.isArray(props.groups)) return;
    const identity = skillIdentity(monster, "editor");
    if (!identity) return;
    publish(el, "hako-af:skill-preset-editor", identity);
    for (const group of props.groups) {
      for (const [items, reserved] of [[group.inUse, false], [group.reserved, true]]) {
        for (const item of items ?? []) {
          if (!props.api?.canReserve?.(group.type, item.id)) continue;
          const id = group.type + ":" + item.id;
          const row = el.querySelector(`[data-fx-drag-id="${CSS.escape(id)}"]`);
          const control = row?.querySelector(".skill-reserve-toggle");
          if (control) publish(control, "hako-af:skill-preset-entry", { identity, id, reserved, name: props.api.name(group.type, item) });
        }
      }
    }
  }

  function readSkillToggle(monster, props, el) {
    if (!options.skillPresets || props?.disabled || !props?.name) return;
    const identity = skillIdentity(monster, "classic");
    if (!identity) return;
    const root = el.closest(".detail-pc-fonts, .fx-mdetail") ?? el.closest("[data-base-modal-root], [role='dialog']");
    if (!root) return;
    const header = el.closest(".skill-header") ?? el.parentElement?.closest(".w-full")?.querySelector(".skill-header");
    const image = header?.querySelector(".skill-header-icon");
    const imageSource = image?.getAttribute("src") ?? image?.querySelector("[src]")?.getAttribute("src");
    const id = (imageSource ? imageSource.split("?")[0] : "") + "|" + props.name;
    publish(root, "hako-af:skill-preset-editor", identity);
    publish(el, "hako-af:skill-preset-entry", { identity, id, reserved: props.reserved === true, name: props.name });
  }
  function dropType(item, master) {
    if (item._artifact) {
      const rank = Number(item._artifact.rank ?? item.artifact_rank ?? item.display_rank);
      return Number.isInteger(rank) && rankLabels[rank] ? "af" + rank : "afOther";
    }
    if (item.soul_monster_id) return "soul";
    if (master?.type === "homunculus_egg" || item.type === "homunculus_egg") return "egg";
    if (master?.type || item.type) return "special";
    return master || item.item_id ? "normal" : "other";
  }

  function readDrops(artifactSnapshot, powerOf, powerVersion, requestPower, summaryProps) {
    if (!options.explore) return;
    const current = summaryProps?.result ? summaryProps : appProperties()?.$pinia?._s?.get("exploreResult")?.current;
    const result = current?.result;
    if (!result || !["step", "boss"].includes(current.kind)) return;
    const scope = current.kind === "boss" && !Array.isArray(result.summary?.items) ? result.rewards : result.summary;
    const items = scope?.items;
    if (!Array.isArray(items)) return;
    const cached = dropCache.get(items);
    if (cached?.powerVersion === powerVersion && cached?.size === items.length) {
      if (cached.rows.length) requestPower();
      return cached;
    }
    const rows = [];
    const seen = new Set();
    let total = 0;
    const extraItems = current.kind === "boss" ? [
      result.summary?.firstClearItems ?? result.rewards?.firstClearItems,
      result.summary?.clearItems
    ] : [];
    for (const entries of [items, ...extraItems]) {
      if (!Array.isArray(entries)) continue;
      for (const item of entries) {
        if (!item?._artifact || item.id && seen.has(item.id)) continue;
        if (item.id) seen.add(item.id);
        const raw = artifactSnapshot(item._artifact);
        if (raw) raw.power = powerOf(item._artifact);
        const amount = Math.max(1, Math.floor(Number(item.amount) || 1));
        if (entries === items) total += amount;
        rows.push({ raw, amount });
      }
    }
    if (rows.length) requestPower();
    const summary = { powerVersion, size: items.length, rows, total };
    dropCache.set(items, summary);
    return summary;
  }

  function amountOf(value) {
    const amount = Number(value);
    return value != null && value !== "" && Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  function countExploreArtifacts(items) {
    if (exploreCounts.has(items)) return exploreCounts.get(items);
    let count = 0;
    const seen = new Set();
    for (const item of items) {
      if (!item?._artifact || item.id && seen.has(item.id)) continue;
      if (item.id) seen.add(item.id);
      count += Math.max(1, Math.floor(Number(item.amount) || 1));
    }
    exploreCounts.set(items, count);
    return count;
  }

  document.addEventListener("hako-af:read-explore-owner", event => {
    const owner = appProperties()?.$pinia?._s?.get("userProfile")?.profile?.id;
    publish(event.target, "hako-af:explore-owner", owner == null ? null : String(owner));
  });

  function readExploreAnalysis(anchor, props, drops, stores, config, hasDrops) {
    if (!options.exploreAnalysis || new URLSearchParams(location.search).get("return") === "guild") return;
    const saved = stores?.get("exploreResult")?.current;
    const current = props?.result ? props : saved;
    const result = current?.result;
    if (current?.kind !== "step" || !result?.summary || result.tower || result.debugNoSave || result.guildPractice) return;
    const guild = !!(result.guildSessionId || result.dungeon?.is_guild);
    const mode = guild ? "guild" : "normal";
    const owner = stores?.get("userProfile")?.profile?.id ?? saved?.ownerUserId;
    const at = saved?.result === result && amountOf(saved.savedAt);
    const id = typeof result.resultRunId === "string" && result.resultRunId ||
      (at && Number.isInteger(saved.partyIndex) ? `saved:${saved.partyIndex}:${at}` : null);
    const identity = !guild && at && id && owner && (saved.ownerUserId == null || String(saved.ownerUserId) === String(owner))
      ? { owner: String(owner), id, at } : null;
    const { totalExp, totalGold, battleWin, battleLose } = result.summary;
    const wins = amountOf(battleWin);
    const losses = amountOf(battleLose);
    const hasBattleCounts = Number.isSafeInteger(wins) && Number.isSafeInteger(losses);
    const battleResults = hasBattleCounts ? { wins, losses } : {};
    const battles = (wins ?? 0) + (losses ?? 0);
    const guildStore = guild ? stores?.get("guildDungeon") : null;
    const latestGuildResult = guildStore?.result;
    const guildResult = result.guildSessionId && latestGuildResult?.session?.id === result.guildSessionId ? latestGuildResult : null;
    const activeSession = guildStore?.session;
    const guildSession = guildResult?.session ??
      (result.guildSessionId && activeSession?.id === result.guildSessionId ? activeSession : null);
    const battlesPerStock = amountOf(guildSession?.battlesPerStock) || 5;
    // The game's consumedSeconds for guild runs is the net change in stock, which can undercount the cost of the battles.
    const guildStockEstimate = guild && hasBattleCounts ? Math.ceil(battles / battlesPerStock) : 0;
    const secondsPerStock = amountOf(config?.explore?.exploreTimePerAttempt) || 60;
    const consumed = amountOf(result.consumedSeconds);
    const measured = !guild && consumed > 0 ? consumed / secondsPerStock : 0;
    const normalStockEstimate = !guild && consumed == null && !result.dungeon?.is_random ? battles : 0;
    const used = guildStockEstimate || measured || normalStockEstimate;
    let items = result.summary.items;
    let exp = amountOf(totalExp), gold = amountOf(totalGold);
    let af = drops?.total;
    if (guild && result.guildRewardScope === "total") {
      // A completed challenge displays rewards from its earlier batches too. Use the matching final batch if available.
      const batch = guildResult && guildResult.session.status !== "active" &&
        battles > 0 && guildResult.summary?.battles === battles && guildResult.summary.wins === battleWin &&
        guildResult.summary.defeats === battleLose ? guildResult.reward : null;
      items = batch?.items;
      exp = amountOf(batch?.exp);
      gold = amountOf(batch?.gold);
      af = undefined;
    }
    if (!Array.isArray(items) || exp == null || gold == null || !(used > 0)) {
      if (guild) publish(anchor, "hako-af:explore-analysis", {
        mode, identity, hasDrops, current: battleResults, missingGuildRewards: result.guildRewardScope === "total" && !Array.isArray(items)
      });
      return;
    }
    publish(anchor, "hako-af:explore-analysis", {
      mode, identity, hasDrops, current: { stocks: used, af: af ?? countExploreArtifacts(items), exp, gold, ...battleResults },
      estimated: normalStockEstimate > 0,
      guildBattlesPerStock: guildStockEstimate > 0 ? battlesPerStock : undefined
    });
  }

  function gachaStage(name, props, parent) {
    if (!options.gacha) return null;
    if (name !== "RevealGachaStage" && name !== "RevealTicketStage") return parent;
    if (!props?.modelValue || !Array.isArray(props.resultItems)) return null;
    return { items: props.resultItems, ticket: name === "RevealTicketStage" };
  }

  function readGachaCard(stage, vnode, props, el, artifactSnapshot, powerOf, requestPower) {
    if (!el.matches(".rv-card--revealed")) return;
    const key = typeof vnode.key === "string" ? vnode.key : "";
    const indexKey = (stage.ticket ? /^t-(\d+)$/ : /^(?:best-)?r-(\d+)$/).exec(key);
    const index = indexKey ? Number(indexKey[1]) : !key && props?.size === "hero" ? 0 : undefined;
    const artifact = stage.items[index]?._artifact;
    const raw = artifactSnapshot(artifact);
    if (!raw) return;
    requestPower();
    raw.power = powerOf(artifact);
    publish(el, "hako-af:gacha-item", raw);
  }

  function accountReports(stores) {
    const profile = stores?.get("userProfile");
    const owner = profile?.isLoaded ? profile.profile?.id : null;
    if (owner !== reportOwner) {
      verifiedAlerts.clear();
      reportOwner = owner;
      loadReports();
    }
    return owner;
  }

  function reportKey() {
    return "hakoAf4000:home-checks:" + reportOwner;
  }

  function loadReports() {
    if (!reportOwner) return;
    try {
      const saved = JSON.parse(localStorage.getItem(reportKey()));
      const now = Date.now();
      for (const [key, value] of Array.isArray(saved) ? saved : []) {
        if (value?.until > now && value.id !== "guildDungeon" && key !== "guildBoss:daily") verifiedAlerts.set(key, value);
      }
    } catch { /* The in-tab state remains available. */ }
  }

  function persistReports() {
    if (!reportOwner) return;
    try {
      localStorage.setItem(reportKey(), JSON.stringify([...verifiedAlerts]));
    } catch { /* The in-tab state remains available. */ }
  }

  function nextMidnight(now) {
    return now + dayMs - (now + jstOffset) % dayMs;
  }

  function nextSlotPart(time) {
    const elapsed = ((time + jstOffset - slotDayStart) % dayMs + dayMs) % dayMs;
    return time + (elapsed < slotSecondPart ? slotSecondPart : dayMs) - elapsed;
  }

  function observeSlotHall(instance, hall) {
    if (!options.home || !hall?.usedSpinsByFloor || hall.backroom || hall.id === "preview" ||
        !Array.isArray(hall.stakes) || !Number.isSafeInteger(hall.dailySpinLimit) || hall.dailySpinLimit <= 0) return;
    const now = Date.now();
    const readAt = Date.parse(hall.serverTime);
    const until = nextSlotPart(readAt);
    if (!Number.isFinite(until) || until <= now || !accountReports(appProperties()?.$pinia?._s)) return;
    for (const [rate, name, stake, cap] of slotRates) {
      if (!hall.stakes.includes(stake) && (rate === "vip" || !Object.hasOwn(hall.usedSpinsByFloor, rate))) continue;
      const spins = hall.usedSpinsByFloor[rate] ?? 0;
      if (!Number.isSafeInteger(spins) || spins < 0) continue;
      const hallCap = rate === "vip" && hall.vipDailySpins > 0 ? hall.vipDailySpins : cap;
      const limit = Math.min(cap, hall.dailySpinLimit, hallCap);
      const remaining = Math.max(0, limit - spins);
      const message = `${name}　${remaining ? `残り ${remaining.toLocaleString("ja-JP")} / ${limit.toLocaleString("ja-JP")} 回転` :
        `上限到達（${limit.toLocaleString("ja-JP")}回転）`}`;
      rememberAlert(instance, "slot", rate, message, until, "/slot", `${readAt}/${spins}/${limit}`);
    }
  }

  function rememberAlert(source, id, suffix, message, until, to, evidence = message, rotation = 0) {
    const key = id + ":" + suffix;
    let observed = observedReports.get(source);
    if (!observed) observedReports.set(source, observed = new Map());
    const old = observed.get(key);
    if (old?.owner === reportOwner && old.evidence === evidence &&
        !(old.rotation && rotation > old.rotation + 5000)) return;
    observed.set(key, { owner: reportOwner, evidence, rotation });
    verifiedAlerts.set(key, { id, message, until, to });
    persistReports();
    readHome();
  }

  function raidAttendance(now, guildId) {
    const previous = verifiedAlerts.get(guildBossReport);
    const sameGuild = previous?.guildId == null || guildId == null || previous.guildId === guildId;
    return previous?.until === nextMidnight(now) && sameGuild ? previous : null;
  }

  function saveRaidAttendance(now, guildId, remaining, runs, fromPanel) {
    const message = remaining ? `残り ${remaining} / ${guildBossDailyLimit} 回` + (fromPanel ? "" : "（このブラウザで確認）") : "";
    verifiedAlerts.set(guildBossReport, { id: "guildBoss", message, until: nextMidnight(now), to: reportLinks.guildBoss,
      guildId, remaining, runs, fromPanel });
    persistReports();
  }

  function readRaidOutcome(stores, now) {
    const raid = raidResultStore?.current;
    if (!raid?.outcome || raid.debugPractice || raid.outcome.refunded || typeof raid.runId !== "string" || !raid.runId ||
        String(raid.ownerUserId) !== String(reportOwner) || raid.raidDate !== dateJst(now)) return;
    const guildId = stores.get("guild")?.guild?.id?.toString();
    const raidGuildId = raid.guildId?.toString();
    if (guildId != null && raidGuildId != null && guildId !== raidGuildId) return;
    const previous = raidAttendance(now, raidGuildId ?? guildId);
    const runs = previous?.runs ?? [];
    if (previous?.remaining === 0 || runs.includes(raid.runId)) return;
    const nextRuns = [...runs, raid.runId].slice(-guildBossDailyLimit);
    // A loaded result may predate the panel's reading. The two counts can overlap.
    const remaining = Math.min(previous?.remaining ?? guildBossDailyLimit, guildBossDailyLimit - nextRuns.length);
    const keepPanel = previous?.remaining === remaining && previous.fromPanel;
    saveRaidAttendance(now, raidGuildId ?? guildId ?? previous?.guildId, remaining, nextRuns, keepPanel);
  }

  function updateRaidQuota() {
    if (!raidQuotaLabelNode?.isConnected) return;
    let row = raidQuotaLabelNode.parentElement;
    for (let depth = 0; row && depth < 4; depth++, row = row.parentElement) {
      const match = raidQuotaPattern.exec(row.textContent);
      if (!match) continue;
      const remaining = Number(match[1]);
      if (remaining > guildBossDailyLimit || !row.getClientRects().length ||
          row.closest('[hidden],[aria-hidden="true"]')) return;
      let panel = row;
      for (let depth = 0; panel && panel !== document.body && depth < 5; depth++, panel = panel.parentElement) {
        const text = panel.textContent;
        if (text.length > 2000) return;
        if (text.includes("本日のギルド進行")) break;
      }
      if (!panel || panel === document.body || !panel.textContent.includes("本日のギルド進行")) return;
      const stores = appProperties()?.$pinia?._s;
      if (!options.home || accountReports(stores) !== raidQuotaOwner) return;
      const guildId = stores.get("guild")?.guild?.id?.toString();
      if (lastRaidQuota?.node === raidQuotaLabelNode && lastRaidQuota.remaining === remaining && lastRaidQuota.guildId === guildId) return;
      lastRaidQuota = { node: raidQuotaLabelNode, remaining, guildId };
      const now = Date.now();
      const previous = raidAttendance(now, guildId);
      const runs = previous?.runs?.slice(0, guildBossDailyLimit - remaining) ?? [];
      saveRaidAttendance(now, guildId ?? previous?.guildId, remaining, runs, true);
      readHome();
      return;
    }
  }

  function findRaidQuotaLabel(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      return !root.parentElement?.matches("script,style") && root.data.includes(raidQuotaLabel) ? root : null;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || !root.textContent.includes(raidQuotaLabel)) return null;
    return document.evaluate(`.//text()[not(parent::script or parent::style) and contains(., '${raidQuotaLabel}')]`, root, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

  const raidQuotaObserver = new MutationObserver(records => {
    let check = false;
    const holder = raidQuotaLabelNode?.parentElement?.parentElement;
    for (const record of records) {
      if (holder && (holder.contains(record.target) || record.type === "attributes" && record.target.contains(holder))) check = true;
      const changed = record.type === "characterData" ? [record.target] : record.addedNodes;
      for (const node of changed) {
        const label = findRaidQuotaLabel(node);
        if (label) {
          raidQuotaLabelNode = label;
          check = true;
          break;
        }
      }
    }
    if (check) updateRaidQuota();
  });

  function observeRaidQuota(owner) {
    if (owner === raidQuotaOwner || owner && !document.body) return;
    raidQuotaOwner = owner;
    raidQuotaObserver.disconnect();
    raidQuotaLabelNode = null;
    lastRaidQuota = null;
    if (!owner) return;
    raidQuotaLabelNode = findRaidQuotaLabel(document.body);
    raidQuotaObserver.observe(document.body, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
    updateRaidQuota();
  }

  function observeAlertPage(name, instance, el) {
    if (name === "SlotHallClassic" || name === "FlexSlotHall") {
      observeSlotHall(instance, instance.props.hall);
      return;
    }
    const stores = appProperties()?.$pinia?._s;
    if (!options.home || !accountReports(stores)) return;
    const now = Date.now();
    const expires = nextMidnight(now);
    const remember = (id, suffix, message, until, to, evidence, rotation) =>
      rememberAlert(instance, id, suffix, message, until, to, evidence, rotation);
    const recordShop = (type, items, empty, delay) => {
      if (!["special", "normal"].includes(type) || !items.length && !empty) return;
      const id = type === "special" ? "npcLimited" : "npcNormal";
      const count = type === "special"
        ? items.filter(item => !item?.purchased_at && item?.purchased !== true).length
        : items.filter(item => Number(item?.remaining) > 0).length;
      const rotation = delay > 0 ? now + delay : 0;
      const until = rotation ? Math.min(expires, rotation) : expires;
      const message = count ? `${type === "special" ? "未購入" : "購入枠が残る品"} ${count}種（確認時点）` : "";
      const stock = type === "special" ? valueOf(instance.props.shop.stock) ?? items : items;
      remember(id, "stock", message, until, reportLinks[id],
        JSON.stringify(stock?.map(item => [item.id, item.remaining, !!item.purchased_at])), rotation);
    };
    const valueOf = field => field?.value ?? field;
    const refreshDelay = value => {
      const match = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
      return match ? (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + 1) * 1000 : 0;
    };
    if (name === "FlexShopBuy") {
      const shop = instance?.props?.shop;
      if (!shop || valueOf(shop.displayLoading) || valueOf(shop.errorMessage) || valueOf(shop.countdown) === "更新待ち") return;
      const type = valueOf(shop.shopType);
      const items = valueOf(shop.displayStock) ?? valueOf(type === "normal" ? shop.normalStock : shop.stock);
      if (Array.isArray(items)) recordShop(type, items, el.textContent.includes("陳列はありません"), refreshDelay(valueOf(shop.countdown)));
      if (valueOf(shop.npcShopClosed)) {
        const [limited, normal] = [valueOf(shop.stock), valueOf(shop.normalStock)];
        // The traveling shop uses one shared response for both sections.
        if (Array.isArray(limited) && Array.isArray(normal)) {
          const delay = refreshDelay(valueOf(shop.countdown));
          if (delay && type !== "special") recordShop("special", limited, true, delay);
          if (delay && type !== "normal") recordShop("normal", normal, true, delay);
        }
      }
    }
    if (name === "ShopNpcModal") {
      const selected = [...el.querySelectorAll("button.shadow-inner")].find(button => /^(限定|通常)ショップ$/.test(button.textContent.trim()));
      if (!selected || el.querySelector(".animate-spin")) return;
      const type = selected.textContent.includes("通常") ? "normal" : "special";
      const cards = [...el.querySelectorAll(".shop-cell-nolp")].map(cell => cell.closest('[role="button"][tabindex="0"]')).filter(Boolean);
      const items = cards.map(card => ({
        remaining: Number(card.textContent.match(/のこり\s*([\d,]+)/)?.[1].replaceAll(",", ""))
      }));
      const countdown = el.textContent.match(/次回更新まで\s*(\d+:\d{2}:\d{2})/);
      const empty = el.textContent.includes("陳列はありません");
      if ((items.length || empty) && !el.textContent.includes("更新待ち")) {
        const id = type === "special" ? "npcLimited" : "npcNormal";
        const count = type === "special" ? items.length : items.filter(item => item.remaining > 0).length;
        const delay = refreshDelay(countdown?.[1]);
        const rotation = delay ? now + delay : 0;
        remember(id, "stock", count ? `${type === "special" ? "未購入" : "購入枠が残る品"} ${count}種（確認時点）` : "",
          rotation ? Math.min(expires, rotation) : expires, reportLinks[id],
          JSON.stringify(cards.map((card, index) => [card.querySelector("img")?.getAttribute("src"), items[index].remaining])), rotation);
      }
    }
    if (name === "FlexShopMedalExchange" || name === "FlexShopMarkExchange") {
      const medal = name === "FlexShopMedalExchange";
      const quotas = [...el.querySelectorAll("span")].filter(node => !node.childElementCount)
        .map(node => node.textContent.match(/(?:今週|今日)あと\s*([\d,]+)\s*\/\s*([\d,]+)/)).filter(Boolean);
      if (quotas.length) {
        const count = quotas.filter(([, remaining]) => Number(remaining.replaceAll(",", "")) > 0).length;
        const label = medal ? "勲章" : "踏破";
        const until = medal ? expires + ((7 - new Date(now + jstOffset).getUTCDay()) % 7) * dayMs : expires;
        remember(medal ? "npcMedal" : "npcMark", label, count ? `交換枠が残る品 ${count}種（確認時点）` : "",
          until, reportLinks[medal ? "npcMedal" : "npcMark"], quotas.map(quota => quota[0]).join("|"));
      }
    }
    if (name === "FlexArkShopPage") {
      const products = [...el.querySelectorAll(".fx-ark-product--obon,.fx-ark-halloween__option")];
      const labels = products.filter(row => [...row.querySelectorAll("button")].some(button =>
        button.textContent.includes("購入する"))).map(row => row.getAttribute("aria-label") ||
        row.querySelector("h2,h3")?.textContent.trim()).filter(Boolean);
      remember("ark", "limited", labels.length ? `限定商品 ${labels.join("、")}（確認時点）` : "", expires, "/f/ark-shop");
    }
    if (name === "GuildShopView" || name === "GuildMemberShopView") {
      const cards = [...el.querySelectorAll('[role="button"][tabindex="0"]')].filter(card =>
        card.matches(".rounded-lg.flex.flex-col.items-center"));
      if (cards.length || el.textContent.includes("陳列はありません")) {
        const count = cards.filter(card => !card.textContent.includes("本日上限")).length;
        const label = name === "GuildMemberShopView" ? "個人向け" : "ギルド資金";
        remember("guildShop", label, count ? `${label}　購入枠が残る品 ${count}種（確認時点）` : "",
          expires, reportLinks.guildShop, JSON.stringify([cards.length, count]));
      }
    }
    if (name === "FlexWorldBaseHomeScreen") {
      const sites = [...el.querySelectorAll(".fx-wbase-home__outpost")];
      if (!sites.length && !el.textContent.includes("採取地はまだありません")) return;
      const full = sites.filter(site => site.querySelector(".fx-wbase__storage-rest--full"))
        .map(site => site.querySelector(".fx-wbase-home__outpost-name")?.textContent.trim()).filter(Boolean);
      remember("production", "storage", full.length ? `倉庫が満杯　${full.join("、")}（確認時点）` : "",
        now + 20 * 60 * 1000, "/base");
    }
  }

  const homeObserverNames = new Set(["FlexShopBuy", "ShopNpcModal", "FlexShopMedalExchange", "FlexShopMarkExchange", "FlexArkShopPage",
    "GuildShopView", "GuildMemberShopView", "FlexWorldBaseHomeScreen",
    "SlotHallClassic", "FlexSlotHall"]);

  function readHome() {
    clearTimeout(nextHomeUpdate);
    const stores = options.home ? appProperties()?.$pinia?._s : undefined;
    const raid = stores?.get("guildRaidResult");
    if (raid !== raidResultStore) {
      disposeRaidResult?.();
      raidResultStore = raid;
      // Record the result before the game's return action clears the store.
      disposeRaidResult = raid?.$subscribe?.(readHome, { detached: true, flush: "sync" });
    }
    const now = Date.now();
    const owner = options.home ? accountReports(stores) : null;
    if (owner) readRaidOutcome(stores, now);
    observeRaidQuota(owner);
    const onHome = options.home && ["/", "/f/home", "/home"].includes(location.pathname);
    if (!onHome) {
      for (const { dispose } of homeSubscriptions.values()) dispose?.();
      homeSubscriptions.clear();
      return;
    }
    if (document.hidden) return;
    for (const key of ["expedition", "hatchery", "userProfile", "guild"]) {
      const store = stores?.get(key);
      const existing = homeSubscriptions.get(key);
      if (!store || store === existing?.store) continue;
      existing?.dispose?.();
      homeSubscriptions.set(key, { store, dispose: store.$subscribe?.(readHome, { detached: true }) });
    }
    const alerts = [];
    let next = nextMidnight(now);
    const add = (id, message, end = null, to, pending = false) => {
      alerts.push({ id, message, end, to, pending });
      if (end > now) next = Math.min(next, end);
    };
    const expedition = stores?.get("expedition");
    if (expedition?.isActive && expedition.isLoaded && expedition.completesAtMs > 0) {
      const time = expedition.completesAtMs;
      add("expedition", time > now ? "完了予定" : "完了・受取可能", time);
    }
    const hatchery = stores?.get("hatchery");
    if (hatchery?.isLoaded && Array.isArray(hatchery.jobs)) {
      let earliestTime = Infinity;
      for (const job of hatchery.jobs) {
        const time = Date.parse(job?.completes_at);
        if (Number.isFinite(time)) earliestTime = Math.min(earliestTime, time);
      }
      if (Number.isFinite(earliestTime)) {
        add("hatchery", earliestTime > now ? "最短の孵化予定" : "孵化完了・受取可能", earliestTime);
      }
    }
    const profile = stores?.get("userProfile");
    if (profile?.isLoaded && profile.profile?.resources) {
      const official = Number(profile.battleTickets) || 0;
      const rating = Number(profile.battleTickets2) || 0;
      if (official > 0 || rating > 0) add("colosseum", `未使用チケット 公式戦 ${official}枚・魔王戦 ${rating}枚`, null, "/colosseum");
    }
    let expired = false;
    const checked = new Set();
    const guild = stores?.get("guild");
    const noGuild = (guild?.isLoaded || guild?.isSummaryLoaded) && guild.isInGuild === false;
    const guildId = guild?.guild?.id?.toString();
    for (const [key, row] of verifiedAlerts) {
      if (row.until <= now) {
        verifiedAlerts.delete(key);
        expired = true;
      }
      else {
        if (noGuild && (row.id === "guildBoss" || row.id === "guildShop")) continue;
        if (row.id === "guildBoss" && row.guildId != null && guildId != null && row.guildId !== guildId) continue;
        const id = row.id === "slot" ? key : row.id;
        checked.add(id);
        if (row.message) add(id, row.message, null, row.to);
        next = Math.min(next, row.until);
      }
    }
    if (expired) persistReports();
    if (owner) {
      for (const [rate, name] of slotRates) {
        const id = "slot:" + rate;
        if (!checked.has(id)) add(id, `${name}　現在の部は未確認${rate === "vip" ? "（国営ホール）" : ""}`, null, "/slot");
      }
      for (const [id, to] of Object.entries(reportLinks)) {
        if (checked.has(id) || id.startsWith("guild") && noGuild) continue;
        const caption = id === "npcMedal" ? "今週分" : "今日分";
        const message = id === "guildBoss" ? "今日分 未実行（参加回数未確認）" : caption + " 未実行（未確認）";
        add(id, message, null, to, true);
      }
    }
    const signature = JSON.stringify({ alerts, checked: [...checked] });
    if (signature !== homeSignature) {
      homeSignature = signature;
      publish(document, "hako-af:home-alerts", { alerts, checked: [...checked] });
    }
    nextHomeUpdate = setTimeout(readHome, Math.max(0, next - now));
  }
  document.addEventListener("hako-af:read-home", readHome);
  window.addEventListener("storage", event => {
    if (!reportOwner || event.key !== null && event.key !== reportKey()) return;
    verifiedAlerts.clear();
    loadReports();
    readHome();
  });
  document.addEventListener("visibilitychange", readHome);
  window.addEventListener("pageshow", readHome);
  document.addEventListener(settingsEvent, readHome);

  function indexChatReplies(chat) {
    const replies = new Set();
    for (const room of Object.values(chat?.messagesByRoom ?? {})) {
      if (!Array.isArray(room)) continue;
      for (const message of room) {
        if (message?.meta?.reply?.id != null) replies.add(String(message.id));
      }
    }
    return replies;
  }

  function prepareQuote(vnode, getChatReplies) {
    if (!options.chat || !vnode.props?.["data-chat-message-id"] || !vnode.el?.isConnected) return;
    const row = vnode.el;
    let quote = row.querySelector(".fx-chat-msg__quote, .opacity-70.mb-0\\.5");
    const toggle = row.querySelector('[data-ha4="chat-hidden-quote"]');
    if (!quote?.textContent.trim().startsWith("↩")) {
      if (!getChatReplies().has(row.dataset.chatMessageId)) {
        toggle?.remove();
        return;
      }
      if (toggle) return;
      const body = row.querySelector(":scope > .fx-chat-msg__body, :scope > .min-w-0.flex-grow") ?? row;
      quote = document.createElement("button");
      quote.type = "button";
      quote.dataset.ha4 = "chat-hidden-quote";
      quote.dataset.ha4ChatQuote = "";
      quote.textContent = "↩ 非表示の返信元を見る";
      body.append(quote);
      return;
    }
    toggle?.remove();
    if (!quote.hasAttribute("data-ha4-chat-quote")) quote.setAttribute("data-ha4-chat-quote", "");
    if (quote.getAttribute("role") !== "button") {
      quote.setAttribute("role", "button");
      quote.tabIndex = 0;
    }
  }

  function findReply(target) {
    const origin = target.closest(chatRow);
    const list = origin?.parentElement;
    if (!list) return;
    const chat = appProperties()?.$pinia?._s?.get("chat");
    const id = origin.dataset.chatMessageId;
    const room = Object.values(chat?.messagesByRoom ?? {}).find(messages =>
      Array.isArray(messages) && messages.some(message => String(message.id) === id));
    const reply = room?.find(message => String(message.id) === id)?.meta?.reply;
    const parentId = reply?.id == null ? null : String(reply.id);
    const scroll = origin.closest(chatLog) ?? list;
    const rows = Array.from(list.querySelectorAll(chatRow));
    const destination = rows.find(row => row.dataset.chatMessageId === parentId && row.getClientRects().length &&
      getComputedStyle(row).visibility === "visible");
    if (!destination || destination === origin) {
      const parent = parentId == null || parentId === id ? null : room?.find(message => String(message.id) === parentId);
      const hasText = message => typeof message?.text === "string" && message.text.trim();
      const message = hasText(parent) ? parent : parentId !== id && hasText(reply) ? reply : null;
      if (message) {
        publish(target, "hako-af:chat-reply-preview", {
          name: message.user_name || reply?.user_name || "プレイヤー", text: message.text, quoted: message === reply
        });
        return;
      }
      publish(target, "hako-af:chat-missing", "返信元は表示範囲にありません。上にスクロールして前の発言を表示してください。");
      return;
    }
    publish(target, "hako-af:chat-reply-preview", null);
    const bounds = scroll.getBoundingClientRect();
    const scale = bounds.height / scroll.offsetHeight || 1;
    const previous = destination.dataset.ha4ChatFocus;
    scroll.scrollTop += (destination.getBoundingClientRect().top - bounds.top) / scale -
      Math.max(0, (scroll.clientHeight - destination.offsetHeight) / 2);
    destination.dataset.ha4ChatFocus = "";
    if (previous === undefined) setTimeout(() => delete destination.dataset.ha4ChatFocus, 2300);
  }

  function handleQuote(event) {
    if (!options.chat || !event.isTrusted || (event.type === "keydown" && !["Enter", " "].includes(event.key))) return;
    const target = event.target instanceof Element && event.target.closest("[data-ha4-chat-quote]");
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    findReply(target);
  }
  document.addEventListener("click", handleQuote, true);
  document.addEventListener("keydown", handleQuote, true);
  modules.hakoAfExtrasMain = { readDrops, readExploreAnalysis, dropType, readInventoryItem, readSkillEditor, readSkillToggle, gachaStage, readGachaCard,
    prepareQuote, indexChatReplies, observeAlertPage, homeObserverNames, openWatchedItem, hiddenTitlesEnabled: () => options.hiddenTitles === true,
    enhanceEstimateEnabled: () => options.enhanceEstimate === true, readEnhanceEstimate, watchMarketPrices,
    marketWatchEnabled: () => options.marketWatch === true, readMarketItemPrices, readMarketWatchItem, readMarketWatchSkill };
})();

// enhance-estimate.js
(() => {
  "use strict";

  const target = modules.hakoAf4000.TARGET;
  const trials = 4096;
  // The v9 calculator models a great success as 10% of successful attempts.
  const greatShare = .1;
  const format = new Intl.NumberFormat("ja-JP");
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const clampProbability = value => Math.max(0, Math.min(1, value));

  async function calculate(start, rules, stars, valid) {
    if (!Array.isArray(rules.successGain) || !Array.isArray(rules.greatGain)) return;
    const regular = rules.successGain.map(value => Math.floor(Number(value)));
    const great = rules.greatGain.map(value => Math.floor(Number(value)));
    if ([regular, great].some(range => range.length !== 2 || !range.every(Number.isFinite) || range[0] < 1 || range[1] < range[0])) return;
    const items = new Float64Array(target);
    const fees = new Float64Array(target);
    const failureLog = new Float64Array(target);
    const suffix = new Float64Array(target + 1);
    const nextAverage = (level, [min, max]) =>
      (suffix[Math.min(target, level + min)] - suffix[Math.min(target, level + max + 1)]) / (max - min + 1);
    for (let level = target - 1; level >= start; level--) {
      const step = Math.ceil(level / 100);
      const advanced = level >= rules.baseCap;
      const multiplier = advanced ? rules.advancedCost : 1;
      items[level] = Math.ceil(Math.max(1, Math.ceil(step ** rules.gamma * rules.itemsPerStep)) * multiplier);
      const baseFee = Math.floor(rules.goldMultiplier * level * rules.basePrice * (1 + stars * rules.starCoefficient));
      fees[level] = Math.floor(baseFee * multiplier * Math.max(0, 1 - rules.discount));
      const failure = Math.min(rules.failMax, rules.failRate + (step - 1) * rules.failStep);
      const success = (1 - clampProbability(failure - rules.failReduction)) * (advanced ? rules.advancedSuccess : 1);
      if (!(success > 0 && success <= 1 && Number.isFinite(items[level]) && Number.isFinite(fees[level]))) return;
      failureLog[level] = Math.log1p(-success);
      const expected = items[level] / success + (1 - greatShare) * nextAverage(level, regular) + greatShare * nextAverage(level, great);
      suffix[level] = suffix[level + 1] + expected;
    }
    const expected = Math.round(suffix[start] - suffix[start + 1]);
    const samples = new Float64Array(trials);
    let seed;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
    const affordableAttempts = (budget, spent, cost, attempts) =>
      Math.max(0, Math.min(attempts, Math.floor((budget - spent) / cost)));
    let goldExpected = 0, goldP90 = 0, p90;
    // Reuse the same seeded paths to estimate gold spent with either material budget.
    for (const measureGold of [false, true]) {
      seed = 123456789;
      let sliceStarted = 0;
      for (let trial = 0; trial < trials; trial++) {
        if (trial === 0 || (trial % 16 === 0 && performance.now() - sliceStarted >= 5)) {
          await yieldToBrowser();
          if (!valid()) return;
          sliceStarted = performance.now();
        }
        let spent = 0;
        for (let level = start; level < target;) {
          const attempts = 1 + Math.floor(Math.log1p(-random()) / failureLog[level]);
          const count = items[level];
          if (measureGold) {
            goldExpected += fees[level] * affordableAttempts(expected, spent, count, attempts);
            goldP90 += fees[level] * affordableAttempts(p90, spent, count, attempts);
          }
          spent += count * attempts;
          const [low, high] = random() < greatShare ? great : regular;
          level += low + Math.floor(random() * (high - low + 1));
        }
        if (!measureGold) samples[trial] = spent;
      }
      if (!measureGold) p90 = samples.sort()[Math.ceil(trials * .9) - 1];
    }
    return { expected, p90, goldExpected: Math.round(goldExpected / trials), goldP90: Math.round(goldP90 / trials) };
  }

  function start(node, enabled, requestScan) {
    const panels = new Map();
    const manual = new Map();
    const results = new Map();

    function mount(anchor) {
      const root = node("details", "enhance-estimate");
      const body = node("div", "estimate-body");
      const price = document.createElement("input");
      price.type = "text";
      price.inputMode = "numeric";
      price.placeholder = "例 1,000";
      const label = document.createElement("label");
      label.append("素材単価（G）", price);
      const market = node("a", "estimate-market", "フリマで相場を見る");
      market.target = "_blank";
      market.rel = "noopener";
      const source = node("p", "estimate-source");
      const status = node("p", "estimate-status");
      status.setAttribute("role", "status");
      const table = node("table", "estimate-table");
      const head = document.createElement("thead").insertRow();
      for (const text of ["", "期待値の素材数", "約90%到達"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = text;
        head.append(th);
      }
      const tbody = table.createTBody();
      const rows = ["必要素材数", "素材代", "強化費用", "合計"].map(text => {
        const row = tbody.insertRow();
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = text;
        row.append(th);
        return [row.insertCell(), row.insertCell()];
      });
      body.append(label, market, source, status, table);
      root.append(node("summary", "estimate-heading", `Lv${target}までの強化費用の目安`), body);
      anchor.after(root);
      const panel = { root, price, market, source, status, table, rows, ticket: 0 };
      root.addEventListener("toggle", () => {
        if (root.open) refresh(panel);
        else { panel.ticket++; panel.calculating = false; }
      });
      price.addEventListener("input", () => {
        const text = price.value.normalize("NFKC").replace(/,/g, "").trim();
        if (text && /^\d+$/.test(text) && Number.isSafeInteger(Number(text))) manual.set(panel.data.source, Number(text));
        else manual.delete(panel.data.source);
        render(panel, panel.result, text !== "" && !manual.has(panel.data.source));
      });
      panels.set(anchor, panel);
      return panel;
    }

    function render(panel, result, invalid = false) {
      const { data, market, source, rows, table } = panel;
      const entered = manual.get(data.source);
      const price = invalid ? null : entered ?? data.market?.price;
      market.href = `/market?${new URLSearchParams({ item: data.source })}`;
      const observed = data.market?.price != null
        ? `フリマ売上平均 ${format.format(data.market.price)} G（${time.format(data.market.at)} JSTに取得）`
        : "最近の売上平均なし";
      source.textContent = `${data.name} · ${invalid ? "単価は0以上の整数で入力" : entered != null ? "手入力の単価を使用" : observed}`;
      table.hidden = !result;
      if (!result) return;
      const { expected, p90, goldExpected, goldP90 } = result;
      const gold = number => `${format.format(number)} G`;
      for (const [column, count, fee] of [[0, expected, goldExpected], [1, p90, goldP90]]) {
        const material = price == null ? null : count * price;
        rows[0][column].textContent = `${format.format(count)} 個`;
        rows[1][column].textContent = material == null ? "—" : gold(material);
        rows[2][column].textContent = gold(fee);
        rows[3][column].textContent = material == null ? "—" : gold(material + fee);
      }
    }

    async function refresh(panel) {
      if (!panel.root.open) return;
      const { data } = panel;
      if (!data.rules) {
        panel.key = undefined;
        panel.ticket++;
        panel.result = undefined;
        panel.calculating = false;
        panel.status.textContent = "ゲームの強化設定の読み込みを待っています。";
        render(panel);
        return;
      }
      const key = JSON.stringify([data.level, data.stars, data.rules]);
      const entry = results.get(key);
      if (panel.key !== key) {
        panel.key = key;
        panel.ticket++;
        panel.calculating = false;
      }
      panel.result = entry;
      render(panel, entry);
      const discountNote = `強化費用の研究軽減 ${Math.round(data.rules.discount * 100)}%を反映`;
      if (entry) panel.status.textContent = discountNote;
      if (entry || panel.calculating) return;
      panel.calculating = true;
      panel.status.textContent = "計算中…";
      const ticket = ++panel.ticket;
      const valid = () => ticket === panel.ticket && panel.root.isConnected && panel.root.open;
      const result = await calculate(data.level, data.rules, data.stars, valid);
      if (!valid()) return;
      panel.calculating = false;
      panel.result = result;
      if (result) {
        if (results.size >= 24) results.delete(results.keys().next().value);
        results.set(key, result);
      }
      panel.status.textContent = result ? discountNote : "この強化条件では見積もりを計算できません。";
      render(panel, result);
    }

    let current = new Set();
    document.addEventListener("hako-af:enhance-estimate", event => {
      if (!enabled("enhanceEstimate")) return;
      let data;
      try { data = JSON.parse(event.detail); } catch { return; }
      if (!Number.isInteger(data.level) || data.level < 1 || data.level >= target || !(event.target instanceof Element)) return;
      const anchor = event.target;
      current.add(anchor);
      const panel = panels.get(anchor) ?? mount(anchor);
      if (panel.signature === event.detail) return;
      const oldSource = panel.data?.source;
      panel.signature = event.detail;
      panel.data = data;
      if (oldSource !== data.source || panel.price !== document.activeElement && !manual.has(data.source)) {
        const entered = manual.get(data.source);
        panel.price.value = entered == null ? "" : format.format(entered);
        panel.price.placeholder = data.market?.price == null ? "例 1,000" : format.format(data.market.price);
      }
      refresh(panel);
    });
    window.addEventListener("storage", event => { if (event.key === "hakoAf4000:material-prices") requestScan(); });
    return () => {
      for (const [anchor, panel] of panels) {
        if (current.has(anchor) && anchor.isConnected) continue;
        panel.ticket++;
        panel.root.remove();
        panels.delete(anchor);
      }
      current = new Set();
    };
  }

  modules.hakoAfEnhanceEstimate = { start };
})();

// explore-analysis.js
(() => {
  "use strict";

  const dayMs = 86400000;
  const jstOffset = 9 * 3600000;
  const dayInJst = time => Math.floor((time + jstOffset) / dayMs);
  const metrics = ["stocks", "af", "exp", "gold"];
  const integer = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
  const average = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const empty = () => ({ stocks: 0, af: 0, exp: 0, gold: 0, count: 0, wins: 0, losses: 0, battleSamples: 0 });
  const hasBattles = data => Number.isSafeInteger(data?.wins) && Number.isSafeInteger(data?.losses);

  function add(target, run) {
    for (const metric of metrics) target[metric] += run[metric];
    target.count += run.count ?? 1;
    target.wins = (target.wins ?? 0) + (run.wins ?? 0);
    target.losses = (target.losses ?? 0) + (run.losses ?? 0);
    target.battleSamples = (target.battleSamples ?? 0) + (run.battleSamples ?? Number(hasBattles(run)));
    return target;
  }

  let opening;
  function openHistory() {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("hako-af-explore-analysis", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("totals");
        db.createObjectStore("seen").createIndex("day", ["owner", "day"]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      opening = null;
      throw error;
    });
    return opening;
  }

  async function updateHistory({ owner, id, at }, sample) {
    const db = await openHistory();
    const today = dayInJst(Date.now());
    const cutoff = today - 29;
    const day = dayInJst(at);
    const totalKey = [owner, "all"];
    const runKey = [owner, id];
    const dayKey = [owner, day];
    const recentRange = IDBKeyRange.bound([owner, cutoff], [owner, today]);
    const expiredRange = IDBKeyRange.bound([owner, 0], [owner, cutoff], false, true);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(["totals", "seen"], "readwrite");
      const totals = tx.objectStore("totals");
      const seen = tx.objectStore("seen");
      const allData = totals.get(totalKey);
      const dayData = totals.get(dayKey);
      const seenData = seen.getKey(runKey);
      let waiting = 3;
      let all, recent;
      function loaded() {
        if (--waiting) return;
        all = allData.result ?? empty();
        if (sample && !seenData.result && at > (all.resetAt ?? 0) && day >= cutoff && day <= today) {
          // The shared transaction makes recording the same run in two tabs idempotent.
          seen.add({ owner, day }, runKey);
          totals.put(add(dayData.result ?? empty(), sample), dayKey);
          add(all, sample);
        }
        if (all.prunedDay !== today) {
          totals.delete(expiredRange);
          const expired = seen.index("day").openKeyCursor(expiredRange);
          expired.onsuccess = () => {
            const cursor = expired.result;
            if (!cursor) return;
            seen.delete(cursor.primaryKey);
            cursor.continue();
          };
          all.prunedDay = today;
        }
        if (all.count || all.resetAt) totals.put(all, totalKey);
        const days = totals.getAll(recentRange);
        days.onsuccess = () => { recent = days.result.reduce(add, empty()); };
      }
      allData.onsuccess = dayData.onsuccess = seenData.onsuccess = loaded;
      tx.oncomplete = () => resolve({ recent, all });
      tx.onabort = () => reject(tx.error);
    });
  }

  async function resetHistory({ owner, at = 0 }) {
    const db = await openHistory();
    const now = Date.now();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("totals", "readwrite");
      const totals = tx.objectStore("totals");
      totals.delete(IDBKeyRange.bound([owner, 0], [owner, Number.MAX_SAFE_INTEGER]));
      // Keep the cutoff and recent run IDs so an already open or replayed result stays out of the new totals.
      totals.put({ ...empty(), resetAt: Math.max(now, at) }, [owner, "all"]);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  }

  function start(node, enabled) {
    let anchor, seenThisScan, panel, signature, revision = 0;
    const desktop = matchMedia("(hover: hover) and (pointer: fine)");
    const resetting = new WeakSet();
    const changes = typeof BroadcastChannel === "function" ? new BroadcastChannel("hako-af-explore-analysis") : null;
    changes?.addEventListener("message", event => {
      if (typeof event.data === "string" && panel?.data?.identity?.owner === event.data) renderHistory(panel);
    });

    function createPanel(target, mode) {
      const root = node("details", "explore-analysis");
      const guild = mode === "guild";
      const title = guild ? "ギルダンの獲得量" : "探索の獲得量";
      root.setAttribute("aria-label", title);
      const table = node("table", "explore-analysis-table");
      table.setAttribute("aria-label", title);
      const head = table.createTHead().insertRow();
      for (const heading of guild ? ["項目", "今回"] : ["項目", "今回", "直近30日", "累計"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = heading;
        head.append(cell);
      }
      const body = table.createTBody();
      const columns = guild ? 1 : 3;
      const cells = ["ストック", "AF / 1ストック", "経験値 / 1ストック", "ゴールド / 1ストック", "勝率"].map(label => {
        const row = body.insertRow();
        const heading = document.createElement("th");
        heading.scope = "row";
        heading.textContent = label;
        row.append(heading);
        return Array.from({ length: columns }, () => row.insertCell());
      });
      const winCells = cells.pop();
      const note = node("p", "explore-analysis-note");
      note.setAttribute("role", "status");
      const footer = node("div", "explore-analysis-footer");
      footer.append(note);
      const active = { root, cells, winCells, note, mode };
      if (!guild) {
        active.reset = resetButton(footer, "統計をリセット", () => active.data.identity, note);
        active.reset.disabled = true;
      }
      root.append(node("summary", "explore-analysis-title", title), table, footer);
      target.after(root);
      return active;
    }

    function updateDisclosure(active, hasDrops) {
      const compact = !!hasDrops && desktop.matches;
      if (active.compact === compact) return;
      active.compact = compact;
      active.root.open = !compact;
    }
    desktop.addEventListener("change", () => {
      if (panel) updateDisclosure(panel, panel.data?.hasDrops);
    });

    function render(panel, column, data) {
      const stocks = data?.stocks;
      panel.cells[0][column].textContent = stocks > 0 ? integer.format(stocks) : "—";
      for (const [index, unit] of [[1, " 個"], [2, " EXP"], [3, " G"]]) {
        panel.cells[index][column].textContent = stocks > 0 ? average.format(data[metrics[index]] / stocks) + unit : "—";
      }
      const cell = panel.winCells[column];
      const battles = hasBattles(data) ? data.wins + data.losses : 0;
      if (battles > 0) {
        cell.replaceChildren(`${average.format(100 * data.wins / battles)}%`,
          node("small", "explore-analysis-record", `${integer.format(data.wins)}勝${integer.format(data.losses)}敗`));
      } else {
        cell.textContent = "—";
      }
    }

    function renderHistory(active, notice) {
      const request = ++revision;
      const { identity, current } = active.data;
      const note = (...parts) => { active.note.textContent = [active.method, ...parts].filter(Boolean).join(" · "); };
      render(active, 1);
      render(active, 2);
      active.reset.disabled = !identity || resetting.has(active.reset);
      if (!identity) {
        note("今回の結果を端末の履歴に紐づけられませんでした");
        return;
      }
      updateHistory(identity, current).then(({ recent, all }) => {
        if (request !== revision) return;
        render(active, 1, recent);
        render(active, 2, all);
        const count = `集計した結果 ${integer.format(recent.count)}件（直近30日） / ${integer.format(all.count)}件（累計）`;
        const coverage = (all.battleSamples ?? 0) < all.count ? "勝率は戦績を記録できた結果から集計" : "";
        note(notice, count, coverage);
      }).catch(() => {
        if (request === revision) note("このブラウザで探索履歴を保存できませんでした");
      });
    }

    async function resetStats(identity, button, status) {
      if (!identity) {
        status.textContent = "ゲームのアカウント情報を読み込んでから再度お試しください";
        return;
      }
      if (resetting.has(button) || !window.confirm("このブラウザの通常探索の統計（直近30日・累計）をリセットしますか？\n画面には今回の結果が残ります。")) return;
      resetting.add(button);
      button.disabled = true;
      try {
        await resetHistory(identity);
        changes?.postMessage(identity.owner);
        status.textContent = "統計をリセットしました";
        if (panel?.data.identity?.owner === identity.owner) renderHistory(panel, "統計をリセットしました");
      } catch {
        status.textContent = "探索統計をリセットできませんでした";
      } finally {
        resetting.delete(button);
        button.disabled = false;
      }
    }

    function resetButton(container, label, getIdentity, status) {
      const button = node("button", "extra-button", label);
      button.type = "button";
      button.addEventListener("click", () => resetStats(getIdentity(button), button, status));
      container.append(button);
      return button;
    }

    function appendSettingsReset(section) {
      const controls = node("div", "explore-analysis-footer");
      const status = node("p", "explore-analysis-note");
      status.setAttribute("role", "status");
      resetButton(controls, "通常探索の統計をリセット", button => {
        let owner;
        const read = event => { owner = JSON.parse(event.detail); };
        button.addEventListener("hako-af:explore-owner", read, { once: true });
        button.dispatchEvent(new Event("hako-af:read-explore-owner", { bubbles: true }));
        button.removeEventListener("hako-af:explore-owner", read);
        return typeof owner === "string" && owner ? { owner } : null;
      }, status);
      controls.append(status);
      section.append(controls);
    }

    document.addEventListener("hako-af:explore-analysis", event => {
      if (!enabled("exploreAnalysis") || !(event.target instanceof Element)) return;
      let data;
      try { data = JSON.parse(event.detail); } catch { return; }
      if (!["normal", "guild"].includes(data?.mode)) return;
      seenThisScan = true;
      if (anchor !== event.target || panel?.mode !== data.mode || !panel.root.isConnected) {
        panel?.root.remove();
        anchor = event.target;
        panel = createPanel(anchor, data.mode);
        signature = null;
      }
      if (signature === event.detail) return;
      signature = event.detail;
      revision++;
      panel.data = data;
      updateDisclosure(panel, data.hasDrops);
      render(panel, 0, data.current);
      if (data.mode === "guild") {
        const unavailable = data.missingGuildRewards ? "挑戦全体の報酬が表示されています。今回分の内訳を取得できませんでした。"
          : "今回の戦闘回数や報酬の内訳を確認できなかったため、ストックあたりの獲得量を表示できません。";
        panel.note.textContent = data.current?.stocks > 0 ? `${data.guildBattlesPerStock}戦を1ストックとして換算` : unavailable;
        return;
      }
      panel.method = data.estimated ? "戦闘回数からストックを換算" : "";
      renderHistory(panel);
    });

    function finishScan() {
      if (!seenThisScan && panel) {
        panel.root.remove();
        panel = anchor = signature = null;
        revision++;
      }
      seenThisScan = false;
    }
    return { finishScan, appendSettingsReset };
  }

  modules.hakoAfExploreAnalysis = { start };
})();

// market-watch.js
(() => {
  "use strict";

  const prefix = "hakoAf4000:price-watch:";
  const format = new Intl.NumberFormat("ja-JP");
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
  const priceText = price => `${format.format(price)} G`;

  function start(node, enabled, requestScan) {
    const targets = new Map();
    const active = new Set();
    const prices = new Map();
    const records = new Map();
    let loaded = false;
    let market, launcher, dialog, status;

    function load() {
      records.clear();
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (!key?.startsWith(prefix)) continue;
          const record = JSON.parse(localStorage.getItem(key));
          if (typeof record?.name === "string" && Array.isArray(record.points)) records.set(key.slice(prefix.length), record);
        }
      } catch { /* Existing records remain available when one entry cannot be read. */ }
      loaded = true;
    }

    function save(key, record) {
      if (record) records.set(key, record);
      else records.delete(key);
      try {
        if (record) localStorage.setItem(prefix + key, JSON.stringify(record));
        else localStorage.removeItem(prefix + key);
      } catch {
        status = "ブラウザに保存できませんでした。このタブでのみ表示されます。";
      }
    }

    function writePrice(key, point) {
      const record = records.get(key);
      const { price, at } = point ?? {};
      if (!record || !Number.isSafeInteger(price) || price <= 0 || !Number.isFinite(at) || at < (record.checked ?? 0)) return false;
      const last = record.points.at(-1);
      if (last?.price === price && at === record.checked) return false;
      const points = last?.price === price ? record.points : [...record.points.slice(-89), { at, price }];
      save(key, { ...record, points, checked: at });
      return true;
    }

    function refreshButtons() {
      for (const { button, key, name } of targets.values()) {
        const text = records.has(key) ? "最安値の推移を見る" : "最安値を追跡";
        if (button.textContent !== text) button.textContent = text;
        button.setAttribute("aria-label", `${name}の${text}`);
      }
    }

    function open(focus) {
      if (!dialog?.open) {
        dialog = node("dialog", "market-watch-dialog");
        dialog.setAttribute("aria-label", "最安値の推移");
        document.body.append(dialog);
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        dialog.showModal();
      }
      render(focus);
    }

    function render(focus) {
      if (!dialog?.open) return;
      const expanded = new Set([...dialog.querySelectorAll("details[open]")].map(el => el.dataset.watchKey));
      if (focus) expanded.add(focus);
      const header = node("header", "extra-header");
      const close = node("button", "extra-button", "閉じる");
      close.type = "button";
      close.addEventListener("click", () => dialog.close());
      header.append(node("h2", "extra-heading", "最安値の推移"), close);
      const intro = node("p", "market-watch-note", status || "通常アイテムはフリマの表示時、永久スキルは個別の最安値が確認できたときに記録します。");
      const list = node("div", "market-watch-list");
      dialog.replaceChildren(header, intro, list);
      if (!records.size) {
        list.append(node("p", "market-watch-note", "商品を選び、「最安値を追跡」を押すと記録が始まります。"));
        return;
      }
      const sorted = [...records].sort(([a, left], [b, right]) =>
        Number(b === focus) - Number(a === focus) || (right.checked ?? 0) - (left.checked ?? 0));
      for (const [key, record] of sorted) {
        const row = node("details", "market-watch-row");
        row.dataset.watchKey = key;
        row.open = expanded.has(key);
        const latest = record.points.at(-1);
        const previous = record.points.at(-2);
        const heading = node("summary", "market-watch-summary");
        heading.append(node("span", "market-watch-name", record.name), node("strong", "market-watch-price", latest ? priceText(latest.price) : "未観測"));
        if (latest && previous) {
          const delta = latest.price - previous.price;
          const trend = node("span", "market-watch-delta", `${delta > 0 ? "↑ +" : "↓ −"}${priceText(Math.abs(delta))}`);
          trend.dataset.direction = delta > 0 ? "up" : "down";
          heading.append(trend);
        }
        row.append(heading);
        const body = node("div", "market-watch-detail");
        const fill = () => {
          if (!row.open || body.childElementCount) return;
          if (record.checked) body.append(node("p", "market-watch-note", `最終確認 ${date.format(record.checked)} JST`));
          if (record.points.length) {
            const history = node("ul", "market-watch-points");
            for (const point of record.points.slice().reverse()) {
              history.append(node("li", "market-watch-point", `${date.format(point.at)} JST　${priceText(point.price)}`));
            }
            body.append(history);
          }
          if (key.startsWith("skill:")) {
            const check = node("button", "extra-button", "価格を確認");
            check.type = "button";
            check.addEventListener("click", event => {
              if (!event.isTrusted) return;
              const refresh = market?.querySelector(`[data-ha4-market-price-refresh="${CSS.escape(key)}"]`);
              const entry = market?.querySelector(`[data-ha4-market-skill-row="${CSS.escape(key.slice(6))}"]`);
              const button = [refresh, entry].find(control => control?.getClientRects().length && !control.disabled);
              if (button) {
                dialog.close();
                button.click();
              } else {
                status = `永久スキルの「買う」で「${record.name}」を検索して選択してください。出品が複数ページある場合は「価格が安い順」で確認できます。`;
                render(key);
              }
            });
            body.append(check);
          } else {
            const go = node("a", "extra-button", "商品を開く");
            go.href = `/market?${new URLSearchParams({ item: key.slice(5) })}`;
            body.append(go);
          }
          const remove = node("button", "extra-button", "追跡を解除して履歴を削除");
          remove.type = "button";
          remove.addEventListener("click", () => {
            save(key, null);
            refreshButtons();
            render();
            requestScan();
          });
          body.append(remove);
        };
        row.append(body);
        row.addEventListener("toggle", fill);
        fill();
        list.append(row);
      }
    }

    document.addEventListener("hako-af:market-watch-target", event => {
      if (!enabled("marketWatch") || !(event.target instanceof Element)) return;
      let target;
      try { target = JSON.parse(event.detail); } catch { return; }
      const { key, name } = target;
      if (typeof key !== "string" || typeof name !== "string") return;
      const anchor = event.target;
      active.add(anchor);
      if (targets.get(anchor)?.key === key) return;
      targets.get(anchor)?.button.remove();
      const button = node("button", "market-watch-button");
      button.type = "button";
      button.addEventListener("click", () => {
        if (!records.has(key)) {
          if (records.size >= 100) {
            status = "追跡できる商品は100件までです。不要な追跡を解除してください。";
          } else {
            status = "";
            save(key, { name, points: [] });
            writePrice(key, prices.get(key));
          }
          requestScan();
          refreshButtons();
        }
        open(key);
      });
      anchor.append(button);
      targets.set(anchor, { button, key, name });
      refreshButtons();
    });

    document.addEventListener("hako-af:market-watch-prices", event => {
      if (!enabled("marketWatch") || !(event.target instanceof Element)) return;
      let samples;
      try { samples = JSON.parse(event.detail); } catch { return; }
      if (!Array.isArray(samples)) return;
      market = event.target;
      if (launcher?.parentElement !== market) {
        launcher?.remove();
        launcher = node("button", "market-watch-button", "最安値の推移");
        launcher.type = "button";
        launcher.addEventListener("click", () => open());
        market.prepend(launcher);
      }
      prices.clear();
      let changed = false;
      for (const [key, point] of samples) {
        prices.set(key, point);
        if (writePrice(key, point)) changed = true;
      }
      if (changed) render();
    });

    window.addEventListener("storage", event => {
      if (event.key === null || event.key.startsWith(prefix)) {
        loaded = false;
        requestScan();
      }
    });

    return {
      beforeRead() {
        market = null;
        active.clear();
        if (!enabled("marketWatch") || !/^\/(?:f\/)?market\/?$/.test(location.pathname)) return;
        if (!loaded) {
          load();
          refreshButtons();
          render();
        }
        document.dispatchEvent(new CustomEvent("hako-af:market-watch-keys", { detail: JSON.stringify([...records.keys()]) }));
      },
      afterRead() {
        for (const [anchor, { button }] of targets) {
          if (active.has(anchor)) continue;
          button.remove();
          targets.delete(anchor);
        }
        if (!market) {
          launcher?.remove();
          dialog?.close();
        }
      }
    };
  }

  modules.hakoAfMarketWatch = { start };
})();

// content.js
(() => {
  "use strict";

  const { TARGET, normalize, levelFrom, valueFrom, ratio, projected, text } = modules.hakoAf4000;
  const { parameters, readEffects, optionFor, groups } = modules.hakoAfEffects;
  const { POWER, SUM, DROP, CONVERSION, sumRates, dropMetrics, metricValue, viewRule, orderItems } = modules.hakoAfListRules;
  const conditionRows = modules.hakoAfConditionRows;
  const OWN = "[data-ha4]";
  const DETAIL = ".fx-item-detail,.item-detail-panel";
  const CLASSIC_GRID = ".virtual-item-grid";
  const CLASSIC_EQUIP = "[data-artifact-equip-inventory],[data-artifact-equip-slot]";
  const FLEX_GRID = ".fx-agrid";
  const FLEX_FILTER = ".fx-alist-controls";
  const FLEX_LISTS = ".fx-artifact__list,.fx-aenh,.fx-adec";
  const SCOPES = new Set(["inventory", "enhance", "decompose"]);
  const TRADE_ROOTS = '#fx-trade-artifact-controls,.fx-trade,[data-ha4-trade-controls],.fx-agrid,.virtual-item-grid';
  const titleSearch = 'input[aria-label="称号を探す"]';
  const MARKET_SORT = "#market-artifact-sort";
  const MARKET_ROWS = ".overflow-y-auto.custom-scrollbar";
  const AUCTION_ENTRY = '[aria-label="オークションの説明を表示"]';
  const AUCTION_SORT = "[data-ha4-auction-sort]";
  const AUCTION_LIST = "[data-ha4-auction-list]";
  const AUCTION_CARD = 'div[role="button"][tabindex="0"].min-h-11.border-b';
  const AUCTION_CLOCK = `${AUCTION_LIST} > ${AUCTION_CARD} > .min-w-0 > .flex-wrap > span:first-child`;
  const isMarketList = type => type === "market" || type === "auction";
  const SUM_LABEL = "AF変換率＋ドロップ率合計";
  const NATIVE_SUM = "ha4_rate_sum";
  const ROOTS = [
    DETAIL, CLASSIC_GRID, CLASSIC_EQUIP, FLEX_LISTS, ".fx-artifact__slot-grid",
    ".fx-agrid", FLEX_FILTER, MARKET_SORT, AUCTION_ENTRY, AUCTION_SORT, AUCTION_LIST,
    '.artifact-name', '.min-h-\\[36px\\]', '[data-ha4-list-scope]', TRADE_ROOTS
  ].join(",");
  const LIST_ATTRIBUTE_ROOTS = [FLEX_LISTS, CLASSIC_GRID, CLASSIC_EQUIP, "[data-base-modal-root]", ".fx-alist-controls",
    "[data-ha4-list-scope]", "[data-ha4-list-scope] button[aria-expanded]"].join(",");
  const extrasApi = modules.hakoAfExtras;
  const GACHA_CARD = ".rv-card";
  const extrasRoots = '[data-chat-message-id],.fx-summary-page,.fx-summary,.fx-result,.fx-settings,.fx-topbar,#fx-todo,[aria-label="国のお知らせ"],[data-ha4-settings-anchor],[data-ha4-home-root],[data-ha4-market-watch-root],[data-home-tutorial-root],.fx-home,.fx-shop-buy,.shop-cell-nolp,.fx-shop-marks,.fx-race-exchange,.fx-ark-product,.fx-wbase-home__outpost,.fx-skedit,.skill-reserve-toggle,.fx-aenh__panel,#__nuxt header,' + GACHA_CARD;
  const normalRoute = () => location.pathname.replace(/^\/f\//, "/");
  const isOwnProfile = () => /^\/profile\/?$/.test(normalRoute());
  let finishEstimateScan;
  let exploreAnalysis;
  let marketWatch;
  const modes = new Map();
  const ownedStats = new Map();
  const classicStats = new WeakMap();
  const panels = new Map();
  const activePanels = new Set();
  const decorated = new Set();
  const filtered = new Set();
  const protectedBulkButtons = new Set();
  const sentPlans = new Map();
  const sortedCards = new Set();
  const sortedContainers = new Set();
  const rememberedOrder = new WeakMap();
  const nativeChoices = new Map();
  const keepControls = new WeakMap();
  const currentCards = new Map();
  const detailSnapshots = new WeakMap();
  const forecastCopyButtons = new WeakMap();
  const detailControls = new WeakMap();
  const DETAIL_SETTING = "hakoAf4000:showDetail";
  let showDetailForecast = true;
  try { showDetailForecast = localStorage.getItem(DETAIL_SETTING) !== "off"; } catch { /* Use the tab's setting. */ }
  let listSnapshots = new WeakMap();
  const gachaSnapshots = new Map();
  const exploreCards = new Map();
  const exploreFooters = new WeakMap();
  let standardTraits = [];
  let classicUI = [];
  let gridReports = new WeakMap();
  let pendingDetail = null;
  let frame = 0;
  let extras;

  const plain = el => el ? el.textContent.trim() : "";
  function nativeText(el) {
    if (!el) return "";
    return Array.from(el.childNodes)
      .filter(node => node.nodeType !== 1 || !node.matches(OWN))
      .map(node => node.textContent).join("").trim();
  }

  function node(tag, kind, label) {
    const el = document.createElement(tag);
    el.dataset.ha4 = kind;
    if (label) el.textContent = label;
    return el;
  }

  function adorn(el, kind, label, title) {
    const parent = el;
    let mark = Array.from(parent.children).find(child => child.dataset.ha4 === kind);
    if (!mark) {
      if (!label) return;
      mark = node("span", kind);
      parent.append(mark);
    }
    if (!label) {
      mark.remove();
      return;
    }
    if (kind === "detail-value") {
      let badge = mark.firstElementChild;
      if (!badge) {
        badge = document.createElement("span");
        mark.append(badge);
      }
      if (badge.textContent !== label) badge.textContent = label;
    } else if (mark.textContent !== label) {
      mark.textContent = label;
    }
    if (title && mark.title !== title) mark.title = title;
    decorated.add(mark);
  }

  const labelFor = raw => normalize(raw.replace(/[★☆]/g, ""))
    .replace(/^アーティファクト変換率$/, "AF変換率");
  function effectOption(key) {
    if (key === POWER) return { label: "パワー", group: "basic", unit: "" };
    if (key === SUM) return { label: SUM_LABEL, group: "basic", unit: "%" };
    return optionFor(key);
  }

  const exploreLabel = key => key === SUM ? "AF合計" : key === POWER ? "PW" : effectOption(key).label;

  function exploreValueLine(kind, label, value) {
    const line = node("span", kind);
    const formatted = value.value == null ? "—" : text(value.value, value.unit, false);
    line.append(node("span", "explore-value-label", label),
      node("span", "explore-value-number", value.predicted ? `→${formatted}` : formatted));
    return line;
  }

  function matchDescription(match) {
    const { label } = effectOption(match.key);
    const conditions = [match.min && `${match.min}${match.unit}以上`, match.max && `${match.max}${match.unit}以下`,
      match.minimumStars && `★${match.minimumStars}以上`].filter(Boolean);
    const reading = text(match.value, match.unit, false) + (match.stars > 0 ? `・★${match.stars}` : "");
    return `${label} ${match.predicted ? "Lv4000予測 " : ""}${reading}（${conditions.join("・") || "特性あり"}）`;
  }

  function showExploreMatches(tile, descriptions) {
    const dialog = node("dialog", "explore-match-dialog");
    dialog.setAttribute("aria-label", "一致した条件");
    const header = node("header", "extra-header");
    const close = node("button", "extra-button", "閉じる");
    close.type = "button";
    close.autofocus = true;
    close.addEventListener("click", () => dialog.close());
    header.append(node("h2", "extra-heading", "一致した条件"), close);
    const body = node("div", "extra-section");
    const name = tile.querySelector(".artifact-name,.fx-item-cell__name")?.textContent.trim();
    if (name) body.append(node("p", "extra-note", name));
    const list = node("ul", "explore-match-list");
    for (const description of descriptions) list.append(node("li", "explore-match-entry", description));
    body.append(list);
    dialog.append(header, body);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  function renderExploreCards() {
    for (const [tile, { sort, matches, payload }] of exploreCards) {
      const previous = exploreFooters.get(tile);
      const footer = previous?.footer ?? node("div", "explore-card");
      if (previous?.payload !== payload) {
        footer.replaceChildren();
        if (sort) {
          const { label } = effectOption(sort.key);
          const line = exploreValueLine("explore-sort-value", exploreLabel(sort.key), sort);
          const reading = sort.value == null ? "値を確認できません" : text(sort.value, sort.unit, false);
          line.title = `${label} ${sort.predicted ? "Lv4000予測 " : ""}${reading}`;
          line.setAttribute("aria-label", line.title);
          footer.append(line);
        }
        if (matches.length) {
          const descriptions = matches.map(matchDescription);
          const button = node("button", "explore-matches");
          button.type = "button";
          button.title = "一致条件\n" + descriptions.join("\n");
          button.setAttribute("aria-label", "一致条件 " + descriptions.join("、"));
          button.setAttribute("aria-haspopup", "dialog");
          const otherMetrics = sort ? matches.filter(match => match.key !== sort.key) : matches;
          const visible = (otherMetrics.length ? otherMetrics : matches).slice(0, 2);
          const remaining = matches.length - visible.length;
          button.append(node("span", "explore-match-more", remaining ? `✓ ほか${remaining}件` : "✓ 一致"));
          for (const match of visible) button.append(exploreValueLine("explore-match-value", exploreLabel(match.key), match));
          button.addEventListener("click", event => {
            event.stopPropagation();
            showExploreMatches(tile, descriptions);
          });
          footer.append(button);
        }
        footer.toggleAttribute("data-matches", matches.length > 0);
        exploreFooters.set(tile, { footer, payload });
      }
      footer.dataset.color = extras.matchColor();
      if (footer.parentElement !== tile) tile.append(footer);
      decorated.add(footer);
    }
  }
  const levelForName = (name, alternate) => alternate ? levelFrom(alternate) : levelFrom(name);
  const readPower = el => {
    const value = valueFrom(nativeText(el).replace(/^(?:PW|パワー)\s*/i, ""));
    return value && value.unit === "" ? value : null;
  };

  function compare(value, multiplier) {
    if (!value) return null;
    if (value.parts) {
      return Number(value.parts.reduce((sum, part) => sum + projected(part, multiplier), 0).toFixed(2));
    }
    return projected(value, multiplier);
  }

  function detailData(root) {
    const flex = root.matches(".fx-item-detail");
    const hero = root.querySelector(flex ? ":scope > .fx-item__hero--artifact" : ":scope > .artifact-detail-shell");
    if (!hero) return null;
    const head = hero.querySelector(".artifact-name");
    const alternate = flex ? plain(hero.querySelector(".fx-item__base-name"))
      : (head?.nextElementSibling?.matches("span.leading-tight.text-text-muted") ? plain(head.nextElementSibling) : "");
    const name = plain(head);
    const level = levelForName(name, alternate);
    if (level === null) return null;
    const p = root.querySelector(flex ? ":scope > .fx-item__power .fx-item__power-value" :
      ":scope > .artifact-power-box .artifact-power-value");
    const power = readPower(p);
    const metrics = new Map();
    const entries = [];
    let passive = "";
    if (power) metrics.set(POWER, power);

    for (const section of root.querySelectorAll(flex ? ":scope > .fx-item__section" : ":scope > .item-detail-section")) {
      const heading = section.firstElementChild;
      const title = plain(heading);
      if (title === "装備パッシブ") {
        const nameEl = flex ? section.querySelector(".fx-item__passive-name") : heading.nextElementSibling;
        passive = plain(nameEl).replace(/^パッシブ\s*/, "").trim();
      }
      if (!heading?.matches("h3,h4") || !(title === "特性" || title.startsWith("ステータス"))) continue;
      const rows = heading.nextElementSibling;
      if (!rows) continue;
      for (const row of rows.children) {
        if (row.children.length !== 2) continue;
        const [labelEl, valueEl] = row.children;
        const displayLabel = plain(labelEl).replace(/[★☆]/g, "").trim();
        const label = labelFor(displayLabel);
        const value = valueFrom(nativeText(valueEl));
        if (!label || !value) continue;
        const isTrait = title === "特性";
        const knownTraitKeys = [DROP, CONVERSION, ...standardTraits.map(([key]) => "trait:" + key)];
        const key = isTrait
          ? knownTraitKeys.find(key => labelFor(effectOption(key).label) === label)
          : Object.keys(parameters).map(key => "stat_" + key).find(key => effectOption(key).label === label);
        const stars = (plain(labelEl).match(/★/g) ?? []).length;
        if (key && !metrics.has(key)) metrics.set(key, { ...value, stars });
        entries.push({ el: valueEl, value, displayLabel, stars, isTrait });
      }
    }
    const sum = sumRates(metrics);
    if (sum) metrics.set(SUM, sum);
    return { hero, name, baseName: alternate || name, level, p, power, entries, sum, metrics, passive };
  }

  const COPY_LABEL = "Lv4000予測をコピー";

  function forecastCopyText(detail) {
    const multiplier = ratio(detail.level);
    const name = detail.baseName.replace(/\s+Lv\s*\.?\s*[\d,]+$/i, "");
    const power = detail.power ? "パワー" + text(projected(detail.power, multiplier), "", false) : "";
    const sum = detail.sum ? "[計" + text(compare(detail.sum, multiplier), "%", false) + "]" : "";
    const lines = [`${sum}【${name} Lv4000】${power}`];
    for (const [isTrait, heading] of [[false, "ステータス"], [true, "特性"]]) {
      const entries = detail.entries.filter(entry => entry.isTrait === isTrait);
      if (!entries.length) continue;
      const values = entries.map(({ displayLabel, value, stars }) =>
        displayLabel + text(projected(value, multiplier), value.unit, true) + "★".repeat(stars));
      lines.push(heading + ": " + values.join(" / "));
    }
    if (detail.passive) lines.push("付与パッシブ: " + detail.passive);
    return lines.join("\n");
  }

  function renderForecastCopy(root, detail) {
    const original = root.querySelector(".fx-item__hero--artifact .fx-item__copy") ??
      root.querySelector(':scope > button[title*="性能をテキストでコピー"], :scope > div > button[title*="性能をテキストでコピー"]');
    let button = forecastCopyButtons.get(root);
    if (!button) {
      button = node("button", "copy-forecast", COPY_LABEL);
      button.type = "button";
      button.addEventListener("click", async event => {
        event.stopPropagation();
        const current = detailData(root);
        if (!current || current.level >= TARGET) return;
        try {
          await navigator.clipboard.writeText(forecastCopyText(current));
          button.textContent = "✓ 予測をコピーしました";
        } catch {
          button.textContent = "コピーできませんでした";
        }
        setTimeout(() => { button.textContent = COPY_LABEL; }, 1500);
      });
      for (const event of ["pointerdown", "dblclick"]) button.addEventListener(event, e => e.stopPropagation());
      forecastCopyButtons.set(root, button);
    }
    if (original) {
      if (original.nextElementSibling !== button) original.after(button);
    } else if (button.parentElement !== detail.hero) {
      detail.hero.append(button);
    }
    decorated.add(button);
  }

  function renderDetailSwitch(root) {
    let tools = detailControls.get(root);
    if (!tools) {
      tools = node("div", "detail-tools");
      const button = node("button", "detail-switch");
      button.type = "button";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-label", "AF詳細の予測表示");
      button.addEventListener("click", event => {
        event.stopPropagation();
        showDetailForecast = !showDetailForecast;
        try { localStorage.setItem(DETAIL_SETTING, showDetailForecast ? "on" : "off"); } catch { /* Keep the tab's setting. */ }
        requestScan();
      });
      for (const event of ["pointerdown", "dblclick"]) button.addEventListener(event, e => e.stopPropagation());
      tools.append(button);
      detailControls.set(root, tools);
    }
    const button = tools.firstElementChild;
    const label = showDetailForecast ? "予測 ON" : "予測 OFF";
    if (button.textContent !== label) {
      button.textContent = label;
      button.setAttribute("aria-checked", String(showDetailForecast));
      button.title = showDetailForecast ? "AF詳細の予測表示を隠す" : "AF詳細の予測表示を戻す";
    }
    if (tools.parentElement !== root || root.firstElementChild !== tools) root.prepend(tools);
    decorated.add(tools);
  }

  function renderDetails() {
    const updates = [];
    for (const root of document.querySelectorAll(DETAIL)) {
      const detail = detailData(root);
      if (!detail) {
        detailSnapshots.delete(root);
        continue;
      }
      const { hero, name, level, p, power, entries, sum, metrics } = detail;
      const token = JSON.stringify([name, level, [...metrics].map(([k, v]) => [k, v.n])]);
      if (token !== detailSnapshots.get(root)) updates.push({ root, token, name, level, power, metrics });
      detailSnapshots.set(root, token);
      renderDetailSwitch(root);
      if (!showDetailForecast) continue;
      const low = level < TARGET;
      const multiplier = ratio(level);
      const heading = low ? `現在 Lv${level.toLocaleString("ja-JP")} → Lv4000予測` : "";
      adorn(hero, "detail-legend", heading, "artifact-v9 の経験式による予測値");
      if (low && (power || entries.length)) renderForecastCopy(root, detail);
      if (p && power) adorn(p, "detail-value", low ? "→ " + text(projected(power, multiplier), "", false) : "");
      for (const { el, value } of entries) {
        adorn(el, "detail-value", low ? "→ " + text(projected(value, multiplier), value.unit, true) : "");
      }
      if (sum) {
        const current = text(sum.n, "%", false);
        const estimate = low ? " → " + text(compare(sum, multiplier), "%", false) : "";
        adorn(hero, "detail-sum", `${SUM_LABEL}：${current}${estimate}`);
      }
    }
    if (!pendingDetail) return;
    if (performance.now() > pendingDetail.until) {
      pendingDetail = null;
      return;
    }
    const matches = updates.filter(detail =>
      detail.root.getClientRects().length && detail.name === pendingDetail.name &&
      detail.power?.n === pendingDetail.power &&
      pendingDetail.before.get(detail.root) !== detail.token);
    if (matches.length === 1) {
      const { card, id, fingerprint } = pendingDetail;
      const entry = { fingerprint, level: matches[0].level, metrics: matches[0].metrics };
      if (id) ownedStats.set(id, entry);
      else classicStats.set(card, entry);
      pendingDetail = null;
    }
  }

  function listRecord(card, nameEl, powerEl, placement, id = null) {
    const name = plain(nameEl);
    let level = levelFrom(name);
    const snapshot = listSnapshots.get(card);
    const power = readPower(powerEl) ?? (Number.isFinite(snapshot?.power) ? { n: snapshot.power, unit: "" } : null);
    const metrics = new Map();
    if (power) metrics.set(POWER, power);
    const fingerprint = JSON.stringify([name, power?.n ?? null]);
    if (snapshot) {
      level = snapshot.level;
      for (const [key, value] of readEffects(snapshot)) metrics.set(key, value);
      const sum = sumRates(metrics);
      if (sum) metrics.set(SUM, sum);
    }
    const cached = snapshot ? null : id ? ownedStats.get(id) : classicStats.get(card);
    if (cached && cached.fingerprint === fingerprint) {
      level = cached.level;
      for (const [key, value] of cached.metrics) metrics.set(key, value);
    }
    return {
      card, name, nameEl, powerEl, placement, id, level, power, metrics, fingerprint,
      complete: !!snapshot, decomposable: snapshot?.decomposable ?? null, keepId: snapshot?.id
    };
  }

  function renderGachaStats() {
    for (const [card, raw] of gachaSnapshots) {
      const face = card.querySelector(".rv-card__face");
      if (!face) continue;
      const { metrics } = dropMetrics(raw);
      const power = metrics.get(POWER);
      const total = metrics.get(SUM)?.n ?? 0;
      const powerLabel = power ? text(power.n, power.unit, false) : "—";
      const sumLabel = text(total, "%", false);
      adorn(face, "gacha-stats", `PW ${powerLabel}\n合計 ${sumLabel}`,
        `パワー ${powerLabel} / ${SUM_LABEL} ${sumLabel}`);
    }
  }

  function ownedFlex() {
    for (const grid of document.querySelectorAll(FLEX_GRID)) {
      const inventory = grid.closest(FLEX_LISTS);
      const items = [];
      for (const card of grid.querySelectorAll(".fx-agrid__cell")) {
        const button = card.querySelector(".fx-item-cell--artifact");
        const p = card.querySelector(".fx-agrid__power");
        if (!button || !p) continue;
        const id = inventory?.matches(".fx-artifact__list") ? button.getAttribute("data-fx-drag-id") : null;
        items.push(listRecord(card, button.querySelector(".fx-item-cell__name"), p, "inline", id));
      }
      for (const item of items) renderListValue(item);
      if (inventory && isDisplayed(inventory)) {
        const type = inventory.matches(".fx-aenh") ? "enhance" :
          inventory.matches(".fx-adec") ? "decompose" : "inventory";
        const virtual = !!grid.querySelector(".fx-agrid__rows--virtual");
        const control = inventory.querySelector(FLEX_FILTER) || inventory.querySelector(".fx-artifact__list-controls");
        const active = filterGroup(type, control || grid, control ? "inside" : "before", items, virtual,
          control || grid, control?.querySelector("select"), grid);
        if (type === "decompose" && active) protectBulkSelection(inventory);
        for (const item of items) currentCards.set(item.card, item);
      }
    }
    for (const card of document.querySelectorAll(".fx-artifact__slot")) {
      const p = card.querySelector(".fx-artifact__power");
      if (p) renderListValue(listRecord(card, card.querySelector(".fx-item-cell--artifact .fx-item-cell__name"), p, "inline"));
    }
  }

  function classicPower(card) {
    return Array.from(card.querySelectorAll("span")).find(el => plain(el) === "PW" &&
      el.nextElementSibling && valueFrom(nativeText(el.nextElementSibling)))?.parentElement;
  }

  function isDisplayed(el) {
    return el.isConnected && el.getClientRects().length > 0;
  }

  function protectBulkSelection(container) {
    for (const button of container.querySelectorAll("button")) {
      const label = nativeText(button);
      if (!label.startsWith("絞り込み結果を追加") && label !== "選択分解") continue;
      button.dataset.ha4BulkBlocked = "";
      protectedBulkButtons.add(button);
    }
  }

  function placeClassicFilter(type, controls, anchor, items, virtual, grid) {
    const sortRow = controls && Array.from(controls.children).find(child =>
      child.classList.contains("min-h-[36px]") && Array.from(child.querySelectorAll("label"))
        .some(label => nativeText(label).startsWith("並び順")));
    const active = filterGroup(type, controls || anchor, controls ? "inside" : "before", items,
      virtual, sortRow || controls || anchor, sortRow?.querySelector("select"), grid);
    if (controls) panels.get(controls).element.hidden = !sortRow &&
      !!Array.from(controls.querySelectorAll("button")).find(button =>
        nativeText(button).includes("並び替え・絞り込み"));
    return active;
  }

  function ownedClassic() {
    const usedControls = new Set();
    const visibleUI = classicUI.filter(({ el }) => isDisplayed(el));
    for (const grid of document.querySelectorAll(CLASSIC_GRID)) {
      if (!isDisplayed(grid)) continue;
      const items = [];
      // The classic equipment grid wraps each ItemCell and its original PW badge in a .select-none cell.
      const cells = grid.querySelectorAll(":scope > div > [data-index] > .select-none");
      for (const card of cells) {
        const p = classicPower(card);
        const name = card.querySelector(":scope > .artifact-item-cell .artifact-name");
        if (p && name) items.push(listRecord(card, name, p, "overlay"));
      }
      const mobileSection = grid.parentElement?.parentElement;
      const classicMobileEquip = mobileSection?.matches(".border-t") &&
        !!mobileSection.parentElement?.querySelector('[title="アーティファクトについて"]');
      const inventory = !!grid.closest("[data-artifact-equip-inventory]") || classicMobileEquip;
      const scope = visibleUI.find(entry => entry.kind === "grid" && entry.el === grid)?.scope;
      const type = scope ?? (inventory ? "inventory" : null);
      for (const item of items) renderListValue(item);
      if (type) {
        const anchor = grid.parentElement;
        const sibling = anchor.previousElementSibling;
        const search = sibling?.querySelector('input[placeholder^="名前で検索"],input[placeholder="名前検索"]');
        const scopePanel = visibleUI.find(entry => entry.kind === "panel" && entry.scope === type && entry.el.contains(grid))?.el;
        const controls = visibleUI.find(entry => entry.kind === "controls" && entry.scope === type &&
          (!scopePanel || scopePanel.contains(entry.el)))?.el ?? search?.closest(".flex.flex-col.gap-2");
        const filterAnchor = grid.matches(":only-child") && anchor.matches(".relative.select-none,.list-scrollbar") ? anchor : grid;
        const active = placeClassicFilter(type, controls, filterAnchor, items, grid.matches(".virtual-item-grid--enabled"), grid);
        if (controls) usedControls.add(controls);
        if (type === "decompose" && active && scopePanel) protectBulkSelection(scopePanel);
        for (const item of items) currentCards.set(item.card, item);
      }
    }
    for (const { el, kind, scope } of visibleUI) {
      if (kind !== "controls" || usedControls.has(el)) continue;
      const active = placeClassicFilter(scope, el, el, [], false);
      const scopePanel = visibleUI.find(entry => entry.kind === "panel" && entry.scope === scope && entry.el.contains(el))?.el;
      if (scope === "decompose" && active && scopePanel) protectBulkSelection(scopePanel);
    }
    for (const card of document.querySelectorAll("[data-artifact-equip-slot],.artifact-card")) {
      const p = card.querySelector(".artifact-card-power");
      const name = card.querySelector(".artifact-name");
      if (p && name) renderListValue(listRecord(card, name, p, "overlay"));
    }
  }

  function market() {
    if (location.pathname !== "/market") return;
    const sort = document.querySelector(MARKET_SORT);
    const toolbar = sort?.closest(".border-b");
    const listPane = toolbar?.parentElement;
    if (!listPane) return;
    const list = Array.from(listPane.querySelectorAll(`:scope > ${MARKET_ROWS}`))
      .find(el => el.querySelector(".artifact-name"));
    const items = [];
    const showEffect = /^(?:stat_|trait:)/.test(sort.value);
    for (const card of list?.children ?? []) {
      const name = card.querySelector(".artifact-name");
      if (!name) continue;
      const p = Array.from(card.querySelectorAll("span")).find(el => el.children.length <= 1 &&
        /^パワー\s*[+-]?[\d,.]+$/.test(normalize(nativeText(el))));
      const item = listRecord(card, name, p, "market");
      const effect = showEffect ? p?.previousElementSibling : null;
      const stat = effect?.matches(".mr-1.font-bold.text-amber-200") ?
        nativeText(effect).match(/^(.+?)\s+([+-][\d,.]+(?:[%％回])?)$/) : null;
      const metric = stat ? valueFrom(stat[2]) : null;
      const label = stat ? labelFor(stat[1]) : "";
      if (metric && label && !item.complete) item.metrics.set(sort.value, metric);
      renderListValue(item, metric && label ? { label, metric } : null);
      items.push(item);
    }
    const sortControls = sort.closest("label")?.parentElement;
    const innerToolbar = sortControls && toolbar.contains(sortControls) ? sortControls : toolbar;
    filterGroup("market", toolbar, "inside", items, false, innerToolbar, sort, list);
  }

  function auction() {
    if (location.pathname !== "/market") return;
    for (const sort of document.querySelectorAll(AUCTION_SORT)) {
      const toolbar = sort.closest(".border-b");
      const list = toolbar?.nextElementSibling;
      if (!list?.matches(AUCTION_LIST) || !isDisplayed(toolbar)) continue;
      const items = [];
      for (const card of list.children) {
        if (!card.matches(AUCTION_CARD)) continue;
        const name = card.querySelector(":scope > .min-w-0 > p.truncate");
        if (name) items.push(listRecord(card, name, null, "auction"));
      }
      filterGroup("auction", toolbar, "inside", items, false, toolbar, sort, list);
    }
  }

  function trade() {
    const panelAnchor = classicUI.find(({ el, kind, scope }) => scope === "trade" && kind === "controls" && isDisplayed(el))?.el;
    if (!panelAnchor) {
      if (sentPlans.has("trade")) setGridPlan("trade", { enabled: false });
      return;
    }
    const grid = classicUI.find(({ el, kind, scope }) => scope === "trade" && kind === "grid" && isDisplayed(el))?.el;
    const items = [];
    for (const card of grid?.querySelectorAll(".fx-agrid__cell,.item-cell.artifact-item-cell") ?? []) {
      if (!listSnapshots.has(card)) continue;
      const name = card.querySelector(".artifact-name,.fx-item-cell__name");
      const power = card.querySelector(".fx-agrid__power") ?? classicPower(card);
      if (name) items.push(listRecord(card, name, power, "trade"));
    }
    filterGroup("trade", panelAnchor, "inside", items, !!grid, panelAnchor, undefined, grid);
  }

  function renderListValue(item, effect = null) {
    const { card, level, power, powerEl, placement } = item;
    const low = level !== null && level < TARGET;
    const multiplier = ratio(level);
    const estimate = low && power ? "→ " + text(projected(power, multiplier), "", false) : "";
    if (placement === "market") {
      const desktop = item.nameEl.parentElement.matches(".flex-grow.min-w-0.text-xs");
      const holder = desktop ? item.nameEl.parentElement : card;
      const parts = [];
      if (estimate) parts.push(`PW ${estimate}`);
      if (low && effect) {
        const { label, metric } = effect;
        parts.push(`${label} → ${text(projected(metric, multiplier), metric.unit, true)}`);
      }
      adorn(holder, "market-value", parts.length ? "Lv4000予測｜" + parts.join(" / ") : "");
    } else if (powerEl) {
      adorn(powerEl, placement, estimate, "右の数値はLv4000予測");
    }
  }

  function makePanel(type) {
    const state = modes.get(type) ?? {
      useForecast: true, showUnknown: false, root: { join: "and", children: [] },
      view: type === "decompose" ? "match" : null, sortKey: "", sortDirection: "desc"
    };
    if (type === "explore" && !modes.has(type)) {
      const saved = extrasApi?.get("hakoAf4000:explore-filter");
      if (Array.isArray(saved?.root?.children)) Object.assign(state, saved);
    }
    if (type === "decompose") state.kept ??= new Set();
    modes.set(type, state);
    const onChange = type === "explore" ? () => {
      const { root, useForecast, showUnknown, sortKey, sortDirection } = state;
      extrasApi?.save("hakoAf4000:explore-filter", { root, useForecast, showUnknown, sortKey, sortDirection });
      requestScan();
    } : requestScan;
    return { ...modules.hakoAfFilterPopup(state, onChange, modules.hakoAfPresetStorage), state };
  }

  function nativeMetric(key) {
    if (key === NATIVE_SUM) return { key: SUM, direction: "desc" };
    if (key === "power" || key === "power_desc" || key === "power_asc") {
      return { key: POWER, direction: key.endsWith("_asc") ? "asc" : "desc" };
    }
    if (/^(stat_|trait:)/.test(key)) return { key, direction: "desc" };
    return null;
  }

  function configureNativeSort(select, type, state) {
    if (!select) return;
    select.dataset.ha4NativeSort = type;
    let sumOption = select.querySelector(`option[value="${NATIVE_SUM}"]`);
    if (!sumOption || select.firstElementChild !== sumOption) {
      const selected = select.selectedOptions[0];
      if (!sumOption) {
        sumOption = new Option(SUM_LABEL + "の高い順", NATIVE_SUM);
        sumOption.dataset.ha4 = "native-option";
      }
      select.prepend(sumOption);
      select.selectedIndex = selected?.index ?? -1;
    }
    const native = nativeChoices.get(type);
    if (native?.key === NATIVE_SUM) select.value = NATIVE_SUM;
    else if (select.value !== NATIVE_SUM) {
      const key = select.value;
      if (native?.key !== key) nativeChoices.set(type, { key, metric: nativeMetric(key) });
    }
    const parent = select.closest("label")?.parentElement;
    if (!parent) return;
    let label = parent.querySelector(`[data-ha4="native-forecast"][data-scope="${type}"]`);
    if (!label) {
      label = node("label", "native-forecast");
      label.dataset.scope = type;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => {
        state.nativeForecast = input.checked;
        requestScan();
      });
      label.append(input, "予測値順");
      select.closest("label").after(label);
    }
    const input = label.firstElementChild;
    input.checked = state.nativeForecast === true;
    input.title = isMarketList(type) ? "Lv4000予測値順に並べます（このページのみ）" : "Lv4000予測値順に並べます";
  }

  function setGridPlan(type, plan) {
    if (isMarketList(type)) return;
    const signature = JSON.stringify(plan);
    const previous = sentPlans.get(type);
    if (previous?.signature === signature) return;
    const order = JSON.stringify([plan.root, plan.view, plan.useForecast, plan.showUnknown, plan.sort]);
    sentPlans.set(type, { signature, order });
    document.dispatchEvent(new CustomEvent("hako-af:apply-list", {
      detail: JSON.stringify({ scope: type, plan, reset: previous?.order !== order })
    }));
  }

  function setCardOrder(items, list, sort) {
    if (!sort || !list || !items.length) return;
    const parents = new Set(items.map(item => item.card.parentElement));
    if (parents.size !== 1) return;
    const container = items[0].card.parentElement;
    sortedContainers.add(container);
    if (!container.dataset.ha4SortLayout) {
      const layout = getComputedStyle(container).display;
      container.dataset.ha4SortLayout = container.matches(`${MARKET_ROWS},${AUCTION_LIST}`) &&
        layout !== "flex" ? "list" : "existing";
    }
    let base = rememberedOrder.get(container);
    if (!base) {
      base = items.map(item => item.card);
      rememberedOrder.set(container, base);
    }
    const indexes = new Map(base.map((card, index) => [card, index]));
    const ordered = [...items].sort((a, b) =>
      (indexes.get(a.card) ?? Number.MAX_SAFE_INTEGER) - (indexes.get(b.card) ?? Number.MAX_SAFE_INTEGER));
    for (const [index, item] of orderItems(ordered, sort).entries()) {
      sortedCards.add(item.card);
      item.card.style.setProperty("--ha4-order", String(index));
    }
  }

  function displaySortMetric(item, sort) {
    if (!sort?.key) return;
    const value = item.metrics.get(sort.key);
    const result = metricValue(item, value, sort.forecast);
    const label = effectOption(sort.key).label;
    const valueText = result == null ? "—" : text(result, value.unit, false);
    const mode = sort.forecast && item.level < TARGET && result != null ? "Lv4000予測 " : "";
    if (item.placement === "auction" || item.placement === "trade" || sort.key !== POWER || result === null) {
      const holder = item.placement === "auction" ? item.nameEl.parentElement : item.card;
      adorn(holder, "sort-value", `${label} ${mode}${valueText}`);
    }
  }

  function listOptions(items, nativeSort, conditions, type, report, sortKey) {
    const keys = new Map();
    const add = (key, label, category) => {
      const option = effectOption(key);
      const group = category && Object.hasOwn(groups, category) ? category : option.group;
      keys.set(key, { ...option, label: label || option.label, group });
    };
    add(POWER);
    add(SUM);
    for (const key of Object.keys(parameters)) add("stat_" + key);
    if (SCOPES.has(type) || type === "auction" || type === "trade" || type === "explore") {
      for (const [key, label, category] of standardTraits) add("trait:" + key, label, category);
    }
    for (const option of nativeSort?.options ?? []) {
      if (/^(?:stat_|trait:)/.test(option.value)) {
        if (!keys.has(option.value)) add(option.value, option.textContent.trim());
        else keys.get(option.value).label = option.textContent.trim() || keys.get(option.value).label;
      }
    }
    for (const item of items) {
      for (const key of item.metrics.keys()) if (!keys.has(key)) add(key);
    }
    for (const key of report?.metrics ?? []) if (!keys.has(key)) add(key);
    for (const { key } of conditions) if (key && !keys.has(key)) add(key);
    if (sortKey && !keys.has(sortKey)) add(sortKey);
    return [...keys];
  }

  function renderKeepControl(item, kept) {
    let control = keepControls.get(item.card);
    if (!control) {
      const el = node("label", "keep");
      const input = document.createElement("input");
      input.type = "checkbox";
      el.append(input, "残す");
      control = { el, input, id: item.keepId };
      keepControls.set(item.card, control);
      for (const name of ["click", "dblclick", "pointerdown", "pointerup", "keydown"]) {
        el.addEventListener(name, event => event.stopPropagation());
      }
      input.addEventListener("change", () => {
        if (input.checked) kept.add(control.id);
        else kept.delete(control.id);
        requestScan();
      });
    }
    control.id = item.keepId;
    control.input.checked = kept.has(control.id);
    control.input.setAttribute("aria-label", item.name + "を残す");
    if (!control.el.isConnected) item.card.append(control.el);
    decorated.add(control.el);
  }

  function filterGroup(type, anchor, position, items, virtual, holder = anchor, nativeSort, grid) {
    let panel = panels.get(anchor);
    if (!panel) {
      panel = makePanel(type);
      panels.set(anchor, panel);
    }
    activePanels.add(anchor);
    const { element, state } = panel;
    if (position === "before" && anchor.previousElementSibling !== element) anchor.before(element);
    if (position === "inside" && element.parentElement !== holder) holder.append(element);
    configureNativeSort(nativeSort, type, state);
    const native = nativeChoices.get(type);
    const sort = state.sortKey
      ? { key: state.sortKey, direction: state.sortDirection, forecast: state.useForecast }
      : native?.metric && (native.key === NATIVE_SUM || state.nativeForecast)
        ? { ...native.metric, forecast: !!state.nativeForecast }
        : null;
    const plan = {
      root: state.root, view: state.view, useForecast: state.useForecast, showUnknown: state.showUnknown,
      kept: state.kept ? [...state.kept] : [], sort
    };
    const rule = viewRule(state);
    const { active, error, discard, checked } = rule;
    plan.enabled = active || discard || checked || !!sort;
    const gridData = gridReports.get(grid);
    setGridPlan(type, plan);
    const report = plan.enabled ? gridData?.report : null;
    let matched = 0;
    let unknown = 0;
    let protectedCount = 0;
    let keptCount = 0;
    const matchingIds = [];
    for (const item of items) {
      const status = rule.check(item);
      if (status.kept) keptCount++;
      if (state.kept && item.keepId && (active || checked || status.kept)) renderKeepControl(item, state.kept);
      if (state.kept && status.result === true && item.keepId) matchingIds.push(item.keepId);
      if (status.unknown) unknown++;
      if (status.protected) protectedCount++;
      if (status.show && (checked || discard || status.result === true)) matched++;
      if (!gridData && !virtual && !status.show) {
        item.card.dataset.ha4Filtered = "page";
        filtered.add(item.card);
      }
      displaySortMetric(item, sort);
    }
    if (!gridData && !virtual) setCardOrder(items, grid, sort);
    if (report) ({ matched, unknown, protectedCount, keptCount } = report);
    const total = report?.total ?? items.length;
    const scope = gridData ? "読み込み済みの一覧" : virtual ? "読み込み済みの表示範囲" : "このページ";
    const unknownStatus = unknown ? ` · 判定できないAF ${unknown}件（${state.showUnknown && !discard && !checked ? "表示中" : "非表示"}）` : "";
    const protectedStatus = protectedCount ? ` · 分解できないAF ${protectedCount}件` : "";
    const keptStatus = keptCount ? ` · 残すチェック ${keptCount}件` : "";
    const resultLabel = checked ? "チェック済み" : discard ? "分解候補" : "一致";
    const message = virtual && !gridData && plan.enabled ? "全件表示の絞り込み・予測値順を適用できません。ページ表示に切り替えてください。"
      : error ? error
      : discard && !active ? "分解候補を表示するには、残す条件を設定してください。"
      : `${scope} · ${active || checked ? `${resultLabel} ${matched} / ${total}件` : `読み込み ${total}件`}${unknownStatus}${protectedStatus}${keptStatus}`;
    const counts = new Map();
    for (const { metrics } of items) {
      for (const key of metrics.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    panel.refresh(listOptions(items, nativeSort, conditionRows(state.root), type, report, state.sortKey), counts, {
      active: active || checked, matched, unknown: discard || checked ? 0 : unknown, message, resultLabel,
      matchingIds: virtual && !gridData ? [] : report?.matchingIds ?? matchingIds,
      decomposeNotice: type === "decompose" && (active || discard || checked || state.kept.size > 0)
    });
    return active || discard || checked || !!state.kept?.size;
  }

  function scan() {
    frame = 0;
    const oldMarks = Array.from(decorated);
    const oldFiltered = Array.from(filtered);
    const oldBulkButtons = Array.from(protectedBulkButtons);
    const oldSortedCards = Array.from(sortedCards);
    const oldSortedContainers = Array.from(sortedContainers);
    activePanels.clear();
    decorated.clear();
    filtered.clear();
    protectedBulkButtons.clear();
    sortedCards.clear();
    sortedContainers.clear();
    currentCards.clear();
    listSnapshots = new WeakMap();
    gachaSnapshots.clear();
    exploreCards.clear();
    standardTraits = [];
    classicUI = [];
    gridReports = new WeakMap();
    extras?.beforeRead();
    marketWatch?.beforeRead();
    if (extras?.enabled("daily")) document.dispatchEvent(new Event("hako-af:read-balance"));
    if (extras?.enabled("home")) document.dispatchEvent(new Event("hako-af:read-home"));
    if (["/market", "/explore-result", "/guild", "/guild-raid-result", "/base", "/items", "/slot"].includes(normalRoute()) ||
        (isOwnProfile() && document.querySelector(titleSearch)) || document.querySelector(extrasRoots) ||
        document.querySelector(`${FLEX_LISTS},${CLASSIC_GRID},${MARKET_SORT},[data-base-modal-root],${TRADE_ROOTS}`)) {
      document.dispatchEvent(new Event("hako-af:read-list"));
    }
    finishEstimateScan?.();
    exploreAnalysis?.finishScan();
    marketWatch?.afterRead();
    if (extras?.enabled("gacha")) renderGachaStats();
    if (extras?.enabled("explore")) renderExploreCards();
    if (!extras || extras.enabled("detail")) renderDetails();
    if (!extras || extras.enabled("inventory")) {
      ownedFlex();
      ownedClassic();
    } else {
      for (const type of SCOPES) {
        if (sentPlans.has(type)) setGridPlan(type, { enabled: false });
      }
    }
    if (!extras || extras.enabled("market")) {
      market();
      auction();
      trade();
    } else if (sentPlans.has("trade")) {
      setGridPlan("trade", { enabled: false });
    }
    for (const select of document.querySelectorAll("select[data-ha4-native-sort]")) {
      const scope = select.dataset.ha4NativeSort;
      if (!extras || extras.enabled(isMarketList(scope) ? "market" : "inventory")) continue;
      const option = select.querySelector(`option[value="${NATIVE_SUM}"]`);
      const selected = select.value;
      option?.remove();
      if (selected === NATIVE_SUM) {
        const value = nativeChoices.get(scope)?.previous;
        if (value && Array.from(select.options).some(entry => entry.value === value)) select.value = value;
      }
      select.closest("label")?.parentElement?.querySelector(`[data-ha4="native-forecast"][data-scope="${scope}"]`)?.remove();
      delete select.dataset.ha4NativeSort;
      nativeChoices.delete(scope);
    }
    extras?.refresh();
    for (const el of oldMarks) if (!decorated.has(el)) el.remove();
    for (const el of oldFiltered) if (!filtered.has(el)) delete el.dataset.ha4Filtered;
    for (const el of oldBulkButtons) if (!protectedBulkButtons.has(el)) delete el.dataset.ha4BulkBlocked;
    for (const el of oldSortedCards) if (!sortedCards.has(el)) el.style.removeProperty("--ha4-order");
    for (const el of oldSortedContainers) {
      if (!sortedContainers.has(el)) {
        delete el.dataset.ha4SortLayout;
        rememberedOrder.delete(el);
      }
    }
    for (const [anchor, panel] of panels) {
      if (!anchor.isConnected || !activePanels.has(anchor)) {
        panel.remove();
        panels.delete(anchor);
      } else if (panel.element.hidden || !isDisplayed(panel.element)) {
        panel.close();
      }
    }
  }

  function requestScan() {
    if (!frame) frame = requestAnimationFrame(scan);
  }

  document.addEventListener("hako-af:list-item", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      const snapshot = JSON.parse(event.detail);
      if (Array.isArray(snapshot?.parameters) && Array.isArray(snapshot.effects)) listSnapshots.set(event.target, snapshot);
    } catch {
      // A page event without a readable artifact snapshot does not supply list data.
    }
  });
  document.addEventListener("hako-af:gacha-item", event => {
    if (!(event.target instanceof Element) || !event.target.matches(GACHA_CARD) || typeof event.detail !== "string") return;
    try {
      const raw = JSON.parse(event.detail);
      if (Array.isArray(raw?.parameters) && Array.isArray(raw.effects)) gachaSnapshots.set(event.target, raw);
    } catch { /* Ignore unreadable card data. */ }
  });
  document.addEventListener("hako-af:explore-total", event => {
    const total = Number(event.detail);
    if (extras?.enabled("explore") && event.target instanceof Element && typeof event.detail === "string" &&
        Number.isSafeInteger(total) && total >= 0) {
      adorn(event.target, "explore-total", `AFドロップ合計 ${total.toLocaleString("ja-JP")}個`);
    }
  });
  document.addEventListener("hako-af:explore-card", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      const data = JSON.parse(event.detail);
      const valid = value => typeof value?.key === "string" && (value.value === null || Number.isFinite(value.value));
      if (Array.isArray(data?.matches) && data.matches.every(match => valid(match) && match.value != null) &&
          (data.sort === null || valid(data.sort))) {
        exploreCards.set(event.target, { ...data, payload: event.detail });
      }
    } catch { /* Ignore unreadable item data. */ }
  });
  document.addEventListener("hako-af:grid", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      gridReports.set(event.target, JSON.parse(event.detail));
    } catch {
      // The regular list remains usable if the grid report is unavailable.
    }
  });
  document.addEventListener("hako-af:power-ready", requestScan);
  document.addEventListener("hako-af:market-snapshot", () => {
    if (extras?.enabled("marketWatch") && /^\/market\/?$/.test(normalRoute())) requestScan();
  });
  window.addEventListener("storage", event => {
    if (event.key !== DETAIL_SETTING && event.key !== null) return;
    showDetailForecast = event.newValue !== "off";
    requestScan();
  });
  document.addEventListener("hako-af:list-ui", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      const [kind, scope] = JSON.parse(event.detail);
      if (SCOPES.has(scope) || scope === "trade") classicUI.push({ kind, scope, el: event.target });
    } catch {
      // Ignore events that do not identify an artifact list.
    }
  });
  document.addEventListener("hako-af:list-options", event => {
    if (typeof event.detail !== "string") return;
    try {
      const options = JSON.parse(event.detail);
      if (Array.isArray(options)) standardTraits = options;
    } catch {
      // Use the rendered option labels if the snapshot cannot be read.
    }
  });

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.isTrusted ||
        event.target.closest(`${OWN},[title*="お気に入り"],[aria-label*="お気に入り"]`)) return;
    if (event.target.closest("button[aria-expanded]")) requestScan();
    let card = event.target.closest(".fx-agrid__cell,.select-none");
    while (card && !currentCards.has(card)) card = card.parentElement?.closest(".fx-agrid__cell,.select-none");
    const item = currentCards.get(card);
    if (!item || !item.name || !item.power) return;
    const repeats = Array.from(currentCards.values()).filter(other => other.fingerprint === item.fingerprint);
    if (repeats.length > 1) return;
    const before = new Map(Array.from(document.querySelectorAll(DETAIL), el => [el, detailSnapshots.get(el)]));
    pendingDetail = { ...item, power: item.power.n, before, until: performance.now() + 3000 };
    requestScan();
  }, true);
  function nativeSortChanged(event) {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.dataset.ha4NativeSort) return;
    const type = select.dataset.ha4NativeSort;
    if (select.value === NATIVE_SUM) event.stopImmediatePropagation();
    if (event.type === "change") {
      const prior = nativeChoices.get(type);
      const previous = select.value === NATIVE_SUM ? prior?.previous ?? prior?.key : null;
      nativeChoices.set(type, { key: select.value, metric: nativeMetric(select.value), previous });
      const state = modes.get(type);
      if (state) state.sortKey = "";
      requestScan();
    }
  }
  document.addEventListener("input", nativeSortChanged, true);
  document.addEventListener("change", nativeSortChanged, true);
  document.addEventListener("hako-af:grid-rendered", requestScan);
  document.addEventListener("change", event => {
    if (event.target instanceof Element && event.target.matches(MARKET_SORT)) requestScan();
  }, true);

  new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(OWN)) continue;
      if (record.type === "characterData" && target?.matches(AUCTION_CLOCK)) continue;
      const changed = [...record.addedNodes, ...record.removedNodes];
      const gameChanges = changed.filter(n => !(n.nodeType === 1 && n.matches(OWN)));
      if (record.type === "childList" && !gameChanges.length) continue;
      if (record.type === "attributes") {
        if (isOwnProfile() && (target?.matches(titleSearch) || target?.querySelector(titleSearch))) {
          requestScan();
          break;
        }
        if (record.attributeName === "aria-checked" && target?.matches(".skill-reserve-toggle")) {
          requestScan();
          break;
        }
        if (record.attributeName === "aria-hidden") {
          if (extras?.enabled("gacha") && target?.matches(".rv-card__hit") && target.closest(GACHA_CARD)) {
            requestScan();
            break;
          }
          continue;
        }
        if (target?.matches(LIST_ATTRIBUTE_ROOTS) &&
            (target.closest(ROOTS) || target.querySelector(ROOTS))) {
          requestScan();
          break;
        }
        continue;
      }
      const observed = `${ROOTS},${extrasRoots}`;
      if (target?.closest(observed) || (isOwnProfile() && (target?.querySelector(titleSearch) ||
          gameChanges.some(n => n.nodeType === 1 && (n.matches(titleSearch) || n.querySelector(titleSearch))))) ||
          (["/explore-result", "/guild", "/guild-raid-result", "/base", "/items", "/slot"].includes(normalRoute()) && target?.closest("#__nuxt")) ||
          gameChanges.some(n => n.nodeType === 1 &&
        (n.matches(observed) || n.querySelector(observed)))) {
        requestScan();
        break;
      }
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["style", "hidden", "aria-expanded", "aria-hidden", "aria-checked"]
  });
  exploreAnalysis = modules.hakoAfExploreAnalysis?.start(node, id => extras?.enabled(id));
  extras = extrasApi?.start({ node, requestScan, viewRule, toMetrics: dropMetrics, effectOption, makePanel,
    appendExploreReset: exploreAnalysis?.appendSettingsReset,
    listOptions: (items, state) => listOptions(items, null, conditionRows(state.root), "explore", null, state.sortKey) });
  finishEstimateScan = modules.hakoAfEnhanceEstimate?.start(node, id => extras?.enabled(id), requestScan);
  marketWatch = modules.hakoAfMarketWatch?.start(node, id => extras?.enabled(id), requestScan);
  requestScan();
})();

// read-af.js
(() => {
  "use strict";

  const { readEffects } = modules.hakoAfEffects;
  const extras = modules.hakoAfExtrasMain;
  const hiddenTitles = modules.hakoAfHiddenTitles;
  delete modules.hakoAfExtrasMain;
  delete modules.hakoAfHiddenTitles;
  const { POWER, SUM, sumRates, dropMetrics, metricValue, viewRule, orderItems } = modules.hakoAfListRules;
  const { TARGET } = modules.hakoAf4000;
  delete modules.hakoAf4000;
  delete modules.hakoAfEffects;
  delete modules.hakoAfListRules;
  const methods = new WeakMap();
  const exploreViews = new WeakMap();
  const titleBindings = new WeakMap();
  const titleModals = new Set(["ProfileChatStyleSettingsModal", "FlexChatStyleDialog"]);
  let currentExplore;
  let explorePlan;
  const latestPlans = new Map();
  let gameConfig;
  let powerConfig;
  let pendingPowerConfig;
  let nextPowerConfigRead = 0;
  let planRevision = 0;
  const powerListener = new Event("hako-af:power-ready");
  const skipPowerTraits = new Set(["all_param", "add_hp", "add_atk", "add_def", "add_mtk", "add_mdf", "add_spd"]);
  const components = new Set(["FlexItemCell", "ItemCell", "ItemDetailButton"]);
  const classicScopes = {
    ArtifactEquipPanel: "inventory",
    ArtifactEnhancePanel: "enhance",
    ArtifactDecomposePanel: "decompose"
  };
  const tradeDialogs = new Set(["TradeOfferModal", "ProfileTradeOfferModal", "FlexTradeOfferDialog"]);
  const sortScopes = { "artifact-equip": "inventory", "artifact-enhance": "enhance", "artifact-decompose": "decompose", "trade-offer": "trade" };
  const marketRow = ".overflow-y-auto.custom-scrollbar > div";
  const auctionRow = 'div[role="button"][tabindex="0"].min-h-11.border-b';
  const flexLabels = {
    "fx-artifact-list-title": "inventory", "fx-aenh-title": "enhance", "fx-adec-title": "decompose"
  };

  function configFromCache() {
    if (powerConfig || pendingPowerConfig || !globalThis.indexedDB || performance.now() < nextPowerConfigRead) return;
    nextPowerConfigRead = performance.now() + 15000;
    pendingPowerConfig = true;
    const request = indexedDB.open("master-cache");
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => { pendingPowerConfig = false; };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("masters")) {
        db.close();
        pendingPowerConfig = false;
        return;
      }
      const tx = db.transaction("masters", "readonly");
      const cursor = tx.objectStore("masters").openCursor(
        IDBKeyRange.bound("masters:game-config:", "masters:game-config;"), "prev"
      );
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (entry.value?.artifact?.power) {
          gameConfig = entry.value;
          powerConfig = entry.value.artifact.power;
          planRevision++;
          document.dispatchEvent(powerListener);
        } else entry.continue();
      };
      tx.oncomplete = tx.onabort = () => {
        pendingPowerConfig = false;
        db.close();
      };
    };
  }

  function cachedPower(artifact) {
    if (!powerConfig) return null;
    const { param_weights: params = {}, trait_weights: traits = {}, default_trait_weight: fallback, round } = powerConfig;
    let value = 0;
    for (const [key, amount] of Object.entries(artifact.params ?? {})) {
      const weight = Number(params[key]);
      if (Number.isFinite(weight)) value += (Number(amount) || 0) * weight;
    }
    for (const { key, value: amount } of artifact.traits ?? []) {
      if (!key || skipPowerTraits.has(key)) continue;
      const weight = Object.hasOwn(traits, key) ? Number(traits[key]) : Number(fallback) || 0;
      if (Number.isFinite(weight)) value += (Number(amount) || 0) * weight;
    }
    const scale = 10 ** Math.max(0, Math.floor(Number(round) || 0));
    return Math.round(value * scale) / scale;
  }

  function rawProjection(source, plan, powerOf, decomposeState) {
    const rule = viewRule(plan);
    const records = [];
    const metrics = new Set();
    let matched = 0;
    let unknown = 0;
    let protectedCount = 0;
    let keptCount = 0;
    const matchingIds = [];
    for (const original of source) {
      const id = original?.id;
      const raw = snapshot(original?._artifact, decomposeState, id);
      const values = raw ? readEffects(raw) : new Map();
      const sum = sumRates(values);
      if (sum) values.set(SUM, sum);
      if (raw && powerOf) {
        const power = powerOf(original);
        if (Number.isFinite(power)) values.set(POWER, { n: power, unit: "" });
      }
      for (const key of values.keys()) metrics.add(key);
      const record = {
        original, level: raw?.level, complete: !!raw, metrics: values,
        decomposable: raw?.decomposable, keepId: raw?.id
      };
      const status = rule.check(record);
      if (status.kept) keptCount++;
      if (status.unknown) unknown++;
      if (status.protected) protectedCount++;
      if (status.result === true && record.keepId) matchingIds.push(record.keepId);
      if (status.show && (rule.checked || rule.discard || status.result === true)) matched++;
      if (status.show) records.push(record);
    }
    const items = orderItems(records, plan.sort).map(row => row.original);
    return { items, total: source.length, matched, unknown, protectedCount, keptCount, matchingIds, metrics: [...metrics] };
  }

  function planFor(scope) {
    const plan = latestPlans.get(scope);
    return plan?.enabled ? plan : null;
  }

  function adjustClassicPager(instance, scope) {
    if (!instance?.props || typeof instance.render !== "function" || methods.has(instance)) return;
    const render = instance.render;
    const state = { scope, pager: true, grid: null };
    methods.set(instance, state);
    instance.render = function (...args) {
      const props = instance.props;
      const incoming = instance.vnode.props;
      if (Number.isFinite(incoming?.pageCount)) props.pageCount = incoming.pageCount;
      if (Number.isFinite(incoming?.page)) props.page = incoming.page;
      const grid = state.grid;
      const size = grid?.instance?.props?.pageSize;
      if (planFor(scope) && grid?.cache?.plan === planFor(scope) && size > 0) {
        props.pageCount = Math.max(1, Math.ceil(grid.projected.length / size));
        props.page = Math.min(props.page, props.pageCount);
      }
      return render.apply(this, args);
    };
  }

  function manageGrid(instance, scope, layout, decomposeState) {
    if (!instance?.props || !Object.hasOwn(instance.props, "items") || typeof instance.render !== "function") return null;
    let state = methods.get(instance);
    if (!state) {
      const originalRender = instance.render;
      state = { scope, layout, instance, cache: null, projected: null, source: null, reset: false };
      methods.set(instance, state);
      // Give Vue's own paginator and virtualizer a derived list. Keep the inventory and item objects intact.
      // The existing component still creates the cards and owns their click/drag handlers.
      instance.render = function (...args) {
        const props = instance.props;
        const incoming = instance.vnode.props?.items;
        const source = Array.isArray(incoming) ? incoming :
          (props.items === state.projected && state.source ? state.source : props.items);
        const plan = planFor(state.scope);
        if (state.reset) {
          state.reset = false;
          instance.exposed?.reset?.();
          instance.exposed?.scrollToTop?.();
          const el = instance.vnode.el;
          if (el?.nodeType === 1) {
            if (state.layout === "classic") el.scrollTop = 0;
            else {
              let container = el.parentElement;
              while (container && container !== document.body && !/^(auto|scroll)$/.test(getComputedStyle(container).overflowY)) {
                container = container.parentElement;
              }
              if (container && container !== document.body) container.scrollTop = 0;
              else if (el.querySelector(".fx-agrid__rows--virtual")) el.scrollIntoView({ block: "start" });
            }
          }
        }
        if (!plan || !Array.isArray(source)) {
          const changed = !!state.cache;
          if (state.projected && props.items === state.projected) props.items = source;
          instance.vnode.el?.removeAttribute("data-ha4-grid-empty");
          state.source = state.projected = state.result = state.cache = null;
          const rendered = originalRender.apply(this, args);
          if (changed) document.dispatchEvent(new Event("hako-af:grid-rendered"));
          return rendered;
        }
        const powerOf = state.layout === "flex" && typeof props.power === "function" ? props.power
          : powerConfig ? item => cachedPower(item._artifact) : null;
        const protection = state.scope === "decompose" ? state.decomposeState : null;
        const cache = state.cache;
        if (!cache || cache.source !== source || cache.plan !== plan || cache.revision !== planRevision ||
            cache.protection !== protection?.signature) {
          const result = rawProjection(source, plan, powerOf, protection);
          state.cache = { source, plan, revision: planRevision, protection: protection?.signature };
          state.result = result;
          state.source = source;
          state.projected = props.items = result.items;
          document.dispatchEvent(new Event("hako-af:grid-rendered"));
        } else if (props.items !== state.projected) props.items = state.projected;
        if (state.layout === "classic" && props.pageSize > 0 && Number.isFinite(instance.vnode.props?.page)) {
          const page = Math.min(Math.max(1, instance.vnode.props.page), Math.max(1, Math.ceil(state.projected.length / props.pageSize)));
          if (page !== props.page) props.page = page;
        }
        const rendered = originalRender.apply(this, args);
        if (state.layout === "classic" && state.projected.length === 0) {
          instance.vnode.el?.setAttribute("data-ha4-grid-empty", "一致するAFがありません");
        } else {
          instance.vnode.el?.removeAttribute("data-ha4-grid-empty");
        }
        return rendered;
      };
    }
    state.scope = scope;
    state.decomposeState = decomposeState;
    if (planFor(scope) && layout === "classic") configFromCache();
    return state;
  }

  function auctionUI(root) {
    // The desktop and phone layouts use the same browse section; the phone just folds these controls.
    const sort = Array.from(root.querySelectorAll("label > select"))
      .find(el => el.previousElementSibling?.textContent.trim() === "並び順" &&
        Array.from(el.options).some(option => option.value === "remaining"));
    const toolbar = sort?.closest(".border-b");
    const list = toolbar?.nextElementSibling;
    if (!list?.matches("section > div") || !root.contains(list)) return null;
    if (!sort.hasAttribute("data-ha4-auction-sort")) sort.setAttribute("data-ha4-auction-sort", "");
    if (!list.hasAttribute("data-ha4-auction-list")) list.setAttribute("data-ha4-auction-list", "");
    if (list.querySelector(auctionRow)) configFromCache();
    return list;
  }

  function listCard(el, component, marketList, auctionList) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return null;
    if (component === "FlexItemCell") {
      return el.closest(".fx-agrid__cell,.fx-artifact__slot");
    }
    if (component === "ItemCell") {
      if (auctionList) {
        const row = el.closest(auctionRow);
        if (row?.parentElement === auctionList) return row;
      }
      return el.closest(".virtual-item-grid [data-index] > .select-none");
    }
    const row = marketList && el.closest(marketRow);
    return row?.parentElement === marketList ? row : null;
  }

  function snapshot(artifact, decomposeState, itemId) {
    const { params, traits, rarities } = artifact ?? {};
    const level = Number(artifact?.level);
    if (!Number.isSafeInteger(level) || level < 1 || !params || !Array.isArray(traits)) return null;
    const stars = key => {
      const rank = rarities?.[key];
      return rank == null ? 0 : Math.min(5, Math.max(1, Math.floor(Number(rank) || 1)));
    };
    const parameters = Object.entries(params)
      .filter(([key, value]) => /^[a-z]+$/.test(key) && Number.isFinite(value))
      .map(([key, value]) => [key, value, stars(key)]);
    const effects = traits
      .filter(trait => /^[a-z][a-z0-9_-]{0,79}$/.test(trait?.key ?? "") && Number.isFinite(Number(trait.value)))
      .map(({ key, value }) => [key, Number(value), stars(key)]);
    const data = { level, parameters, effects };
    if (decomposeState) {
      if (typeof itemId === "string" || typeof itemId === "number") data.id = String(itemId);
      data.decomposable = artifact.is_favorite || artifact.is_equipped || decomposeState.protectedIds.has(itemId) ? false :
        decomposeState.ready && itemId != null ? true : null;
    }
    return data;
  }

  function dependencies(ref) {
    const refs = [];
    for (let link = ref?.deps; link; link = link.nextDep) {
      const computed = link.dep?.computed;
      if (computed) refs.push(computed);
    }
    return refs;
  }

  function readThrough(ref, project) {
    const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ref), "value");
    if (!native?.get) return false;
    Object.defineProperty(ref, "value", { configurable: true, get() {
      return project(native.get.call(this));
    } });
    return true;
  }

  function readProfileTitles(modal, instance) {
    const enabled = extras?.hiddenTitlesEnabled();
    const binding = titleBindings.get(modal);
    if (binding) {
      if (binding.enabled === enabled) return;
      binding.enabled = enabled;
      binding.rows.dep.trigger();
      return;
    }
    if (!enabled || !hiddenTitles?.length) return;

    // Both layouts build their search results from the same native title rows.
    // The source computed directly consumes the list of species mastery titles.
    const hasGuide = rows => Array.isArray(rows) && rows.some(row => row?.id === "species-master-guide");
    const pending = dependencies(instance.effect);
    const visited = new Set();
    while (pending.length) {
      const rows = pending.pop();
      if (visited.has(rows)) continue;
      visited.add(rows);
      const sources = dependencies(rows);
      if (hasGuide(rows._value) && sources.some(source => hasGuide(source._value) &&
          source._value.every(row => row.condition?.type === "species_master") &&
          !dependencies(source).some(upstream => hasGuide(upstream._value))) && typeof rows.dep?.trigger === "function") {
        const state = { rows, enabled };
        let previous, projected;
        if (!readThrough(rows, native => {
          if (!state.enabled || !Array.isArray(native)) return native;
          if (native !== previous) {
            previous = native;
            const ids = new Set(native.map(row => row.id));
            projected = native.concat(hiddenTitles.filter(title => !ids.has(title.id)));
          }
          return projected;
        })) return;
        titleBindings.set(modal, state);
        rows.dep.trigger();
        return;
      }
      pending.push(...sources);
    }
  }

  function exploreToolbar(root) {
    return root.querySelector(".fx-summary__toolbar") ?? [...root.querySelectorAll("h3")]
      .find(el => /^(?:獲得アイテム|ドロップ)\s*\(/.test(el.textContent.trim()))?.parentElement;
  }

  let resourceLayout;
  function arrangeExploreResources(root, totals, toolbar) {
    let flow = toolbar ? totals?.parentElement : null;
    while (flow && root.contains(flow) && !flow.contains(toolbar)) flow = flow.parentElement;
    let next;
    if (flow && root.contains(flow)) {
      let drops = toolbar.parentElement;
      while (drops && drops !== flow && drops.parentElement !== flow) drops = drops.parentElement;
      if (drops === flow) {
        drops = toolbar.nextElementSibling?.matches(".fx-item-grid,.grid") ? toolbar.nextElementSibling : toolbar;
      }
      const resources = [...flow.children].find(child =>
        /^(?:獲得リソース)(?:$|[・\s])/.test(child.firstElementChild?.textContent.trim() ?? ""));
      if (resources && drops && (resources.compareDocumentPosition(drops) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        next = { flow, resources, drops };
      }
    }
    if (resourceLayout?.flow === next?.flow && resourceLayout?.resources === next?.resources &&
        resourceLayout?.drops === next?.drops) return;
    if (resourceLayout) {
      delete resourceLayout.flow.dataset.ha4ExploreFlow;
      delete resourceLayout.resources.dataset.ha4ExploreResources;
      delete resourceLayout.drops.dataset.ha4ExploreDrops;
    }
    resourceLayout = next;
    if (next) {
      next.flow.dataset.ha4ExploreFlow = "";
      next.resources.dataset.ha4ExploreResources = "";
      next.drops.dataset.ha4ExploreDrops = "";
    }
  }

  function exploreView(instance, toolbar, name) {
    if (exploreViews.has(instance)) return exploreViews.get(instance);
    if (!toolbar || !instance?.effect) return;
    // Find the game's computed result list and pager through Vue's dependencies.
    // The game continues to render its own item cards and detail handlers.
    const direct = dependencies(instance.effect);
    const isPager = ref => typeof ref?.fn === "function" && /\.slice\(/.test(String(ref.fn)) && /\.push\(null\)/.test(String(ref.fn));
    let pageItems = direct.find(isPager);
    const flex = name === "FlexExploreSummary";
    const cardItems = flex ? direct.find(ref => dependencies(ref).some(isPager)) : null;
    pageItems ??= dependencies(cardItems).find(isPager);
    if (!pageItems || flex && !cardItems || typeof instance.render !== "function") return;
    const [size, sorted] = dependencies(pageItems);
    const total = direct.find(ref => ref !== pageItems && dependencies(ref).includes(sorted) &&
      /Math\.ceil/.test(String(ref.fn)));
    if (!sorted || !Number.isSafeInteger(size?._value) || !total) return;
    const descriptor = sorted && Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sorted), "value");
    if (!descriptor?.get) return;
    const view = { instance, toolbar, page: 1 };
    exploreViews.set(instance, view);
    const project = source => {
      const plan = currentExplore === view ? explorePlan : null;
      if (!plan?.enabled || !Array.isArray(source)) {
        view.cache = null;
        return null;
      }
      if (view.cache?.source === source && view.cache.plan === plan && view.cache.power === powerConfig) return view.cache;
      const rule = viewRule(plan);
      const records = source.map(original => {
        const artifact = original._artifact;
        const raw = snapshot(artifact);
        const item = dropMetrics(raw, raw ? cachedPower(artifact) : null);
        const conditions = artifact && rule.active ? [] : undefined;
        const status = artifact ? rule.check(item, conditions) : null;
        const matches = status?.result === true ? conditions.map(condition => ({
          ...measure(item, condition.key, plan.useForecast), min: condition.min, max: condition.max,
          minimumStars: condition.stars
        })) : [];
        return { ...item, original, status, matches,
          group: plan.groups[extras.dropType(original, original.m_items)] ?? plan.groups.other };
      }).filter(({ status, original }) => !rule.active || plan.candidates !== "only" ||
        !original._artifact || status?.result === true || status?.unknown && plan.showUnknown);
      const ordered = orderItems(records, plan.sort);
      const candidate = item => item.status?.result === true ? 0 : 1;
      ordered.sort((a, b) => (plan.candidates === "first" ? candidate(a) - candidate(b) : 0) || a.group.order - b.group.order);
      const groups = new Map();
      for (const item of ordered) {
        if (!groups.has(item.group.page)) groups.set(item.group.page, []);
        groups.get(item.group.page).push(item.original);
      }
      const pages = [...groups].sort((a, b) => a[0] - b[0]).map(([, items]) => items);
      const items = plan.paging === "priority" ? pages.flat() : ordered.map(record => record.original);
      const cards = new WeakMap();
      for (const record of ordered) {
        if (!record.original._artifact || !plan.sort && !record.matches.length) continue;
        const sort = plan.sort ? measure(record, plan.sort.key, plan.sort.forecast) : null;
        cards.set(record.original, { sort, matches: record.matches });
      }
      return view.cache = { source, plan, power: powerConfig, items, pages, cards };
    };
    const nativeSorted = descriptor.get.bind(sorted);
    const nativeSize = () => size.value;
    const totalPages = projection => projection.plan.paging === "all" ? 1 : projection.plan.paging === "priority" ?
      Math.max(1, projection.pages.length) : Math.max(1, Math.ceil(projection.items.length / nativeSize()));
    const visibleItems = () => {
      const projection = project(nativeSorted());
      if (!projection) return null;
      const page = view.page = Math.min(view.page, totalPages(projection));
      if (projection.plan.paging === "all") return projection.items;
      if (projection.plan.paging === "priority") return projection.pages[page - 1] ?? [];
      return projection.items.slice((page - 1) * nativeSize(), page * nativeSize());
    };
    readThrough(total, native => {
      const projection = project(nativeSorted());
      return projection ? totalPages(projection) : native;
    });
    readThrough(pageItems, native => visibleItems() ?? native);
    if (cardItems) readThrough(cardItems, native => visibleItems() ?? native);
    const originalRender = instance.render;
    instance.render = function (...args) {
      const oldSource = view.cache?.source;
      const source = nativeSorted();
      if (oldSource && oldSource !== source) view.page = 1;
      const tree = originalRender.apply(this, args);
      const projection = project(source);
      if (!projection) return tree;
      const count = totalPages(projection);
      const queue = [tree];
      while (queue.length) {
        const vnode = queue.pop();
        if (!vnode) continue;
        const children = vnode.children;
        const [back, label, forward] = Array.isArray(children) && children.length === 3 ? children : [];
        if (back?.type === "button" && label?.type === "span" && forward?.type === "button" &&
            back.children === "◀" && forward.children === "▶" && /^\s*\d+\s*\/\s*\d+\s*$/.test(label.children)) {
          for (const [button, step, disabled] of [[back, -1, view.page <= 1], [forward, 1, view.page >= count]]) {
            button.props = { ...button.props, disabled, onClick: () => {
              view.page = Math.max(1, Math.min(count, view.page + step));
              instance.proxy?.$forceUpdate();
            } };
            if (button.dynamicProps && !button.dynamicProps.includes("onClick")) button.dynamicProps = [...button.dynamicProps, "onClick"];
          }
          label.children = `${view.page} / ${count}`;
          break;
        }
        if (Array.isArray(children)) queue.push(...children);
      }
      return tree;
    };
    return view;
  }

  function measure(item, key, forecast) {
    const metric = item.metrics.get(key);
    const value = metricValue(item, metric, forecast);
    return { key, value, unit: metric?.unit ?? "", stars: metric?.stars,
      predicted: value != null && forecast && item.level < TARGET };
  }

  document.addEventListener("hako-af:apply-explore", event => {
    try { explorePlan = JSON.parse(event.detail); } catch { return; }
    if (currentExplore) {
      currentExplore.page = 1;
      const component = currentExplore.instance.proxy;
      component?.$forceUpdate();
      component?.$nextTick(() => document.dispatchEvent(new Event("hako-af:grid-rendered")));
    }
  });
  document.addEventListener("hako-af:power-ready", () => currentExplore?.instance.proxy?.$forceUpdate());

  document.addEventListener("hako-af:read-list", () => {
    const root = document.getElementById("__nuxt");
    const app = root?.__vue_app__;
    if (!root?._vnode) return;
    const stores = app?.config?.globalProperties?.$pinia?._s;
    let chatReplies;
    const getChatReplies = () => chatReplies ??= extras.indexChatReplies(stores?.get("chat"));
    const tradeCategory = stores?.get("userItems")?.currentCategoryKey === "artifact";
    const flexTradeAnchor = tradeCategory ? document.getElementById("fx-trade-artifact-controls")?.parentElement : null;
    if (flexTradeAnchor) flexTradeAnchor.dispatchEvent(new CustomEvent("hako-af:list-ui", {
      bubbles: true, detail: '["controls","trade"]'
    }));
    let foundSummary = false;
    let foundDropTotal = false;
    let foundAnalysis = false;
    let exploreGrid;
    const presets = stores?.get("artifactPresets");
    const decomposeState = {
      ready: presets?.isReady === true && Array.isArray(presets.presets),
      protectedIds: new Set(Array.isArray(presets?.presets)
        ? presets.presets.flatMap(preset => preset.artifactIds ?? []) : [])
    };
    decomposeState.signature = JSON.stringify([decomposeState.ready, [...decomposeState.protectedIds]]);
    const toolbar = document.querySelector("#market-artifact-sort")?.closest(".border-b");
    const marketList = toolbar?.parentElement?.querySelector(":scope > .overflow-y-auto.custom-scrollbar");
    const cards = new WeakSet();
    const classicGrids = new Map();
    const pagers = [];
    const profileTitles = /^\/(?:f\/)?profile\/?$/.test(location.pathname) &&
      document.querySelector('input[aria-label="称号を探す"]');
    const estimateEnabled = extras?.enhanceEstimateEnabled();
    const estimateAnchors = new Set();
    let enhanceDetail;
    const marketPage = /^\/(?:f\/)?market\/?$/.test(location.pathname);
    if (estimateEnabled && marketPage) extras.watchMarketPrices(stores?.get("marketInfo"));
    const watchMarket = marketPage && extras?.marketWatchEnabled();
    let marketWatchRoot;
    const watchPrices = new Map();
    const marketCache = watchMarket ? stores?.get("marketInfo")?.cache : null;
    const pending = [[root._vnode, null, null, null, null, null, null]];
    const seen = new WeakSet();

    // Read the props of rendered cards. The same objects are used by the game when a detail opens.
    while (pending.length) {
      const [vnode, parentScope, parentAuctionList, parentGacha, parentMonster, parentWarehouse, parentTitleModal] = pending.pop();
      if (!vnode || typeof vnode !== "object" || seen.has(vnode)) continue;
      seen.add(vnode);
      const instance = vnode.component;
      const props = instance?.props ?? vnode.props;
      const name = instance?.type?.__name ?? vnode.type?.__name;
      const titleModal = profileTitles && (titleModals.has(name) ? instance : parentTitleModal);
      if (titleModal && instance) readProfileTitles(titleModal, instance);
      const el = vnode.el ?? instance?.subTree?.el;
      const scope = tradeDialogs.has(name) ? (tradeCategory ? "trade" : null)
        : name === "FlexArtifactDecompose" ? "decompose" : name === "FlexArtifactEnhance" ? "enhance"
          : Object.hasOwn(classicScopes, name) ? classicScopes[name] : parentScope;
      if (estimateEnabled && scope === "enhance") {
        if ((name === "ItemDetailPanel" || name === "FlexArtifactDetailDialog" && props.modelValue) && props.item?._artifact) {
          enhanceDetail = { item: props.item, translate: key => instance.proxy?.$t?.(key) ?? key };
        }
        if ((vnode.type === "span" || vnode.type === "dt") && vnode.children === "必要素材" && el?.getClientRects().length) {
          estimateAnchors.add(el.parentElement.parentElement);
        }
      }
      const warehouse = ["items", "FlexItemsPage"].includes(name) ? instance : parentWarehouse;
      if (warehouse && warehouse === instance) extras?.openWatchedItem(warehouse);
      const auctionList = name === "MarketArtifactAuction" && el?.nodeType === 1 && el.isConnected
        ? auctionUI(el) : parentAuctionList;
      const gacha = extras?.gachaStage(name, props, parentGacha);
      const monster = name === "MonsterDetailPanel" || name === "FlexMonsterDetail"
        ? props?.monster : parentMonster;
      if (el?.nodeType === 1 && el.isConnected) {
        if (watchMarket) {
          if (name === "market") {
            marketWatchRoot = el;
            if (!el.hasAttribute("data-ha4-market-watch-root")) el.setAttribute("data-ha4-market-watch-root", "");
          }
          if (name === "ItemDetailPanel" && el.getClientRects().length) extras.readMarketWatchItem(el, props?.item, instance, marketCache, watchPrices);
          if (name === "MarketPermanentSkillExchange") {
            extras.readMarketWatchSkill(el, stores?.get("permanentSkillMarketUi"), dependencies(instance.effect), watchPrices);
          }
          if (vnode.type === "button" && typeof vnode.key === "string") {
            const skill = vnode.key.match(/^[^:]+:[^:]+:((?:skill|passive):.+)$/);
            if (skill && el.dataset.ha4MarketSkillRow !== skill[1]) el.dataset.ha4MarketSkillRow = skill[1];
          }
        }
        if (warehouse && (name === "VirtualItemGrid" || name === "FlexVirtualList")) extras?.openWatchedItem(warehouse, instance, props, el);
        if (name === "FlexMonsterSkillEditor" && monster) extras?.readSkillEditor(monster, props, el);
        if (name === "SkillReserveToggle" && monster && !el.closest(".fx-skedit")) extras?.readSkillToggle(monster, props, el);
        if (name === "ItemDetailPanel" || name === "FlexItemDetail") extras?.readInventoryItem(name, props?.item, el);
        if (gacha && name === "RevealCard") {
          extras.readGachaCard(gacha, vnode, props, el, snapshot, cachedPower, configFromCache);
        }
        if ((!foundSummary || !foundAnalysis) && ["FlexExploreSummary", "ExploreResultSummaryPage", "ResultSummaryPage"].includes(name)) {
          const drops = !foundSummary && extras?.readDrops(snapshot, cachedPower, powerConfig, configFromCache, props);
          const toolbar = exploreToolbar(el);
          const view = drops && exploreView(instance, toolbar, name);
          const summary = el.querySelector(".fx-summary__totals,.result-summary-totals");
          if (!foundAnalysis && summary) {
            const kind = props?.kind ?? stores?.get("exploreResult")?.current?.kind;
            const hasDrops = kind === "step" && !!toolbar;
            arrangeExploreResources(el, summary, hasDrops ? toolbar : null);
            extras?.readExploreAnalysis(summary, props, drops, stores, gameConfig, hasDrops);
            foundAnalysis = true;
          }
          if (drops && !foundDropTotal) {
            const totalAnchor = summary ?? view?.toolbar ??
              el.querySelector(".fx-summary,.fx-summary__banner") ?? el;
            totalAnchor.dispatchEvent(new CustomEvent("hako-af:explore-total", {
              bubbles: true, detail: String(drops.total)
            }));
            foundDropTotal = true;
          }
          if (view) {
            foundSummary = true;
            if (currentExplore !== view) {
              currentExplore = view;
              explorePlan = null;
            }
            exploreGrid = view.toolbar.parentElement?.querySelector(":scope > .fx-item-grid,:scope > .grid");
            view.toolbar.dispatchEvent(new CustomEvent("hako-af:drops", { bubbles: true, detail: JSON.stringify(drops.rows) }));
          }
        }
        if (exploreGrid && components.has(name) && currentExplore.cache?.plan === explorePlan) {
          const card = currentExplore.cache?.cards.get(props?.item);
          const tile = el.parentElement === exploreGrid ? el :
            el.parentElement?.parentElement === exploreGrid && el.parentElement.matches("li") ? el.parentElement : null;
          if (card && tile) tile.dispatchEvent(new CustomEvent("hako-af:explore-card", {
            bubbles: true, detail: JSON.stringify(card)
          }));
        }
        if (vnode.props?.["data-chat-message-id"]) extras?.prepareQuote(vnode, getChatReplies);
        if (extras?.homeObserverNames.has(name)) extras.observeAlertPage(name, instance, el);
        const sortKey = instance?.props?.sortScope ?? vnode.props?.sortScope;
        const sortScope = name === "ItemSortControls" && sortKey !== "trade-offer" && Object.hasOwn(sortScopes, sortKey)
          ? sortScopes[sortKey] : null;
        if (scope === "trade" && sortKey === "trade-offer" && name === "ItemSortControls") {
          el.setAttribute("data-ha4-trade-controls", "");
          el.dispatchEvent(new CustomEvent("hako-af:list-ui", { bubbles: true, detail: '["controls","trade"]' }));
        }
        const kind = sortScope ? "controls" : scope && name === "VirtualItemGrid" ? "grid" :
          Object.hasOwn(classicScopes, name) ? "panel" : "";
        if (kind) el.dispatchEvent(new CustomEvent("hako-af:list-ui", {
          bubbles: true, detail: JSON.stringify([kind, sortScope || scope])
        }));
        if (sortScope && el.dataset.ha4ListScope !== sortScope) el.dataset.ha4ListScope = sortScope;
        const flexScope = name === "FlexArtifactGrid" && (scope === "trade" ? scope : flexLabels[instance?.props?.labelledby]);
        const gridScope = name === "VirtualItemGrid"
          ? scope ?? (el.closest("[data-artifact-equip-inventory]") ? "inventory" : null) : flexScope;
        if (gridScope === "trade" && name === "FlexArtifactGrid") el.dispatchEvent(new CustomEvent("hako-af:list-ui", {
          bubbles: true, detail: '["grid","trade"]'
        }));
        if (scope && name === "GridPaginationControls") {
          adjustClassicPager(instance, scope);
          pagers.push(instance);
        }
        if (gridScope) {
          const layout = flexScope ? "flex" : "classic";
          const state = manageGrid(instance, gridScope, layout, decomposeState);
          const plan = planFor(gridScope);
          if (state) {
            if (layout === "classic" && el.getClientRects().length) classicGrids.set(gridScope, state);
            const props = instance.props;
            const incoming = instance.vnode.props?.items ?? props.items;
            const result = state.result;
            const current = plan && state.cache?.plan === plan && state.cache.source === incoming &&
              state.cache.revision === planRevision &&
              state.cache.protection === (gridScope === "decompose" ? decomposeState.signature : undefined);
            if (plan && !current && el.getClientRects().length) instance.proxy?.$forceUpdate();
            const report = current ? {
              total: result.total, matched: result.matched, unknown: result.unknown, protectedCount: result.protectedCount,
              keptCount: result.keptCount, matchingIds: result.matchingIds, metrics: result.metrics
            } : null;
            el.dispatchEvent(new CustomEvent("hako-af:grid", {
              bubbles: true, detail: JSON.stringify({ scope: gridScope, report })
            }));
          }
        }
      }
      if (name === "ShopNpcModal" && instance?.subTree && el?.nodeType !== 1) {
        const find = [instance.subTree];
        while (find.length) {
          const child = find.pop();
          if (!child || typeof child !== "object") continue;
          if (child.el?.nodeType === 1 && child.el.isConnected &&
              child.el.querySelector(".shop-cell-nolp,button.shadow-inner")) {
            extras?.observeAlertPage(name, instance, child.el);
            break;
          }
          if (child.component?.subTree) find.push(child.component.subTree);
          else if (Array.isArray(child.children)) find.push(...child.children);
        }
      }
      if (components.has(name)) {
        const card = scope === "trade" && name === "ItemCell" && el?.closest(".virtual-item-grid")
          ? el : listCard(el, name, marketList, auctionList);
        if (card && !cards.has(card)) {
          const item = instance?.props?.item ?? vnode.props?.item;
          const data = snapshot(item?._artifact, scope === "decompose" ? decomposeState : null, item?.id);
          if (data) {
            if (card.parentElement === auctionList || scope === "trade") data.power = cachedPower(item._artifact);
            cards.add(card);
            card.dispatchEvent(new CustomEvent("hako-af:list-item", { bubbles: true, detail: JSON.stringify(data) }));
          }
        }
      }
      const context = [scope, auctionList, gacha, monster, warehouse, titleModal];
      if (instance?.subTree) pending.push([instance.subTree, ...context]);
      else if (vnode.suspense?.activeBranch) pending.push([vnode.suspense.activeBranch, ...context]);
      else if (Array.isArray(vnode.children)) {
        for (let i = vnode.children.length - 1; i >= 0; i--) pending.push([vnode.children[i], ...context]);
      }
    }
    if (estimateAnchors.size && enhanceDetail) {
      configFromCache();
      for (const anchor of estimateAnchors) extras.readEnhanceEstimate(anchor, enhanceDetail, gameConfig, stores?.get("userProfile"));
    }
    if (marketWatchRoot) {
      // The bulk snapshot is authoritative when the same item also has a cached detail price.
      extras.readMarketItemPrices(watchPrices);
      marketWatchRoot.dispatchEvent(new CustomEvent("hako-af:market-watch-prices", {
        bubbles: true, detail: JSON.stringify([...watchPrices])
      }));
    }
    if (!foundAnalysis && resourceLayout) arrangeExploreResources(root, null, null);
    for (const pager of pagers) {
      const state = methods.get(pager);
      if (!state) continue;
      const grid = classicGrids.get(state.scope);
      const plan = planFor(state.scope);
      const revision = grid?.cache;
      if (state.grid !== grid || state.plan !== plan || state.revision !== revision) {
        state.grid = grid;
        state.plan = plan;
        state.revision = revision;
        pager.proxy?.$forceUpdate();
      }
    }

    const options = stores?.get("userItems")?.artifactTraitOptions;
    if (Array.isArray(options)) {
      const labels = options.filter(option => typeof option.key === "string" && typeof option.label === "string")
        .map(({ key, label, category }) => [key, label, category]);
      document.dispatchEvent(new CustomEvent("hako-af:list-options", { detail: JSON.stringify(labels) }));
    }
  });

  document.addEventListener("hako-af:apply-list", event => {
    if (typeof event.detail !== "string") return;
    let scope, plan, reset;
    try { ({ scope, plan, reset } = JSON.parse(event.detail)); } catch { return; }
    if (!Object.values(sortScopes).includes(scope)) return;
    latestPlans.set(scope, plan);
    const root = document.getElementById("__nuxt")?._vnode;
    if (!root) return;
    const pending = [root];
    const visited = new WeakSet();
    while (pending.length) {
      const vnode = pending.pop();
      if (!vnode || typeof vnode !== "object" || visited.has(vnode)) continue;
      visited.add(vnode);
      const instance = vnode.component;
      const state = methods.get(instance);
      if (state?.scope === scope) {
        if (!state.pager) state.reset ||= !!reset;
        instance.proxy?.$forceUpdate();
      }
      if (instance?.subTree) pending.push(instance.subTree);
      else if (vnode.suspense?.activeBranch) pending.push(vnode.suspense.activeBranch);
      else if (Array.isArray(vnode.children)) pending.push(...vnode.children);
    }
  });
})();

}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
})();
