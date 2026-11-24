(() => {
  "use strict";
  const catalogs = new Map(), bindings = new WeakMap();
  const collator = new Intl.Collator("ja", { numeric: true });
  const normalize = text => text.normalize("NFKC").trim().toLowerCase().replace(/[ァ-ヶ]/g, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60));
  let active, serial = 0;
  function matches(values, query) {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return [...new Set(values.filter(value => typeof value === "string" && value.trim()))]
      .map(name => ({ name, key: normalize(name) })).filter(row => terms.every(term => row.key.includes(term)))
      .sort((a, b) => Number(!a.key.startsWith(terms[0])) - Number(!b.key.startsWith(terms[0])) || collator.compare(a.name, b.name))
      .slice(0, 20).map(row => row.name);
  }
  function request(kind) {
    if (!kind) return;
    let catalog = catalogs.get(kind);
    if (!catalog) catalogs.set(kind, catalog = { names: [] });
    if (catalog.loaded || catalog.pending || Date.now() - (catalog.at ?? 0) < 2000) return;
    catalog.at = Date.now();catalog.pending = true;
    setTimeout(() => { if (catalogs.get(kind) !== catalog) return;catalog.pending = false;active?.refresh(); }, 4000);
    document.dispatchEvent(new CustomEvent("hako-af:read-name-catalog", { detail: kind }));
  }
  document.addEventListener("hako-af:name-catalog", event => {
    try {
      const data = JSON.parse(event.detail);
      if (!["monsters", "items", "passives"].includes(data.kind) || !Array.isArray(data.names)) return;
      catalogs.set(data.kind, { names: data.names.filter(name => typeof name === "string" && name.length <= 160).slice(0, 20000),
        loaded: data.loaded === true, pending: false, at: Date.now() });
      if (active?.kind === data.kind) active.refresh();
    } catch { /* Keep free-text entry available. */ }
  });
  document.addEventListener("pointerdown", event => { if (active && !active.root.contains(event.target)) active.close(); });
  function attach(input, options = {}) {
    if (bindings.has(input)) return bindings.get(input);
    const root = document.createElement("span"), list = document.createElement("div");
    root.dataset.ha4 = "name-field";list.dataset.ha4 = "name-suggestions";list.hidden = true;
    list.id = "ha4-name-options-" + ++serial;list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", (input.getAttribute("aria-label") || "名前") + "の候補");
    input.replaceWith(root);root.append(input, list);
    input.setAttribute("role", "combobox");input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);input.setAttribute("aria-expanded", "false");input.autocomplete = "off";
    input.removeAttribute("list");
    let results = [], selected = -1, composing = false, lastQuery = "";
    const close = () => { list.hidden = true;input.setAttribute("aria-expanded", "false");input.removeAttribute("aria-activedescendant");if (active === binding) active = null; };
    const select = index => {
      selected = index;
      [...list.querySelectorAll('[role="option"]')].forEach((option, n) => option.setAttribute("aria-selected", String(n === selected)));
      const option = list.children[selected];
      if (option?.getAttribute("role") === "option") { input.setAttribute("aria-activedescendant", option.id);option.scrollIntoView({ block: "nearest" }); }
    };
    const choose = name => {
      input.value = name;
      input.dispatchEvent(new Event("input", { bubbles: true }));input.dispatchEvent(new Event("change", { bubbles: true }));
      input.focus({ preventScroll: true });close();
    };
    const refresh = () => {
      if (!input.isConnected || composing || !root.contains(document.activeElement) || !input.value.trim()) { close();return; }
      if (active && active !== binding) active.close();active = binding;
      const catalog = catalogs.get(options.kind);
      const previous = lastQuery === input.value ? results[selected] : undefined;lastQuery = input.value;
      results = matches([...(options.values?.() ?? []), ...(catalog?.names ?? [])], input.value);selected = -1;
      input.removeAttribute("aria-activedescendant");list.replaceChildren();
      for (const [index, name] of results.entries()) {
        const button = document.createElement("button");
        button.type = "button";button.tabIndex = -1;button.textContent = name;button.id = list.id + "-" + index;
        button.setAttribute("role", "option");button.setAttribute("aria-selected", "false");
        button.addEventListener("mousedown", event => event.preventDefault());
        button.addEventListener("click", () => choose(name));list.append(button);
      }
      if (!results.length) {
        const note = document.createElement("small");
        note.textContent = catalog?.pending ? "候補を読み込み中…" : options.kind && !catalog?.loaded ? "図鑑データ未取得。名前はそのまま入力できます。" : "一致する候補はありません。";
        list.append(note);
      }
      if (previous && results.includes(previous)) select(results.indexOf(previous));
      const rect = input.getBoundingClientRect(), container = input.closest('.ha4-body,[data-ha4="settings"]')?.getBoundingClientRect();
      const below = Math.min(innerHeight - 12, container?.bottom ?? innerHeight) - rect.bottom;
      const above = rect.top - Math.max(12, container?.top ?? 0), flip = below < 160 && above > below;
      list.dataset.above = String(flip);list.style.maxHeight = Math.max(80, Math.min(240, (flip ? above : below) - 8)) + "px";
      list.hidden = false;input.setAttribute("aria-expanded", "true");
    };
    const binding = { root, kind: options.kind, refresh, close };bindings.set(input, binding);
    input.addEventListener("focus", () => { request(options.kind);refresh(); });
    input.addEventListener("input", event => { if (!event.isComposing) { request(options.kind);refresh(); } });
    input.addEventListener("compositionstart", () => { composing = true;close(); });
    input.addEventListener("compositionend", () => { composing = false;request(options.kind);refresh(); });
    root.addEventListener("focusout", () => requestAnimationFrame(() => { if (!root.contains(document.activeElement)) close(); }));
    input.addEventListener("keydown", event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === "Tab") { close();return; }
      if (list.hidden) return;
      if (event.key === "Escape") { event.preventDefault();event.stopPropagation();close(); }
      if (["ArrowDown", "ArrowUp"].includes(event.key) && results.length) {
        event.preventDefault();select(selected < 0 ? event.key === "ArrowDown" ? 0 : results.length - 1 :
          (selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
      }
      if (event.key === "Enter" && selected >= 0) { event.preventDefault();event.stopPropagation();choose(results[selected]); }
    });
    return binding;
  }
  globalThis.hakoAfNameSuggestions = { attach, matches };
})();
