function createArkHomuSettingsStorage(role, manager, initial) {
  "use strict";
  const OwnPromise = (async () => {})().constructor;
  const prefix = "arkhomu-af-settings:data:";
  const enabledKey = "arkhomu-af-settings:enabled";
  const savedKey = "arkhomu-af-settings:saved-at";
  const tabStateKey = "hakoAf4000:manager-settings-state";
  const requestType = "hako-af:settings-storage-request";
  const stateType = "hako-af:settings-storage-state";
  const maxEntries = 1000, maxValue = 1_048_576, maxTotal = 4_194_304;
  const exact = new Set([
    "hakoAf4000:settings", "hakoAf4000:autoUpdate", "hakoAf4000:showDetail",
    "hakoAf4000:skin-unowned-first", "hakoAf4000:gacha-use-sets", "hakoAf4000:explore-filter",
    "hakoAf4000:guild-dungeon-filter-state", "hakoAf4000:dungeon-reward-filter",
    "hakoAf4000:home-alerts-open", "hakoAf4000:expedition-food-preferences",
    "hakoAf4000:material-prices", "ha4-training-routes-v1", "ha4-training-routes-v2", "ha4-training-mating-bulk"
  ]);
  const prefixes = ["hakoAf4000:userscript:", "hakoAf4000:artifact-sort:", "hakoAf4000:skill-presets:",
    "hakoAf4000:monster-boxes:", "hakoAf4000:expedition-draft:", "hakoAf4000:materials:", "hakoAf4000:price-watch:"];
  const allowed = key => typeof key === "string" && key.length <= 250 &&
    (exact.has(key) || prefixes.some(value => key.startsWith(value)));
  const validValue = value => typeof value === "string" && value.length <= maxValue;
  let site;
  try { site = window.localStorage; } catch { /* Other extension features can still start. */ }
  let state = { available: role === "manager", enabled: false, busy: false, savedAt: null, count: 0, error: "" };
  const publicState = () => ({ ...state });
  function capture() {
    const entries = [];
    let size = 0;
    for (let index = 0; index < site.length; index++) {
      const key = site.key(index);
      if (!allowed(key)) continue;
      const value = site.getItem(key);
      if (!validValue(value) || (size += key.length + value.length) > maxTotal || entries.length >= maxEntries)
        throw new Error("保存する拡張データが大きすぎます。");
      entries.push([key, value]);
    }
    return entries;
  }
  const emit = (type, value) => document.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(value) }));

  if (role === "manager") {
    let queue = OwnPromise.resolve();
    const known = new Map();
    function markEnabled(value) {
      try { site?.setItem(tabStateKey, value ? "on" : "off"); } catch { /* Storage events are only a same-browser convenience. */ }
    }
    const check = signal => { if (signal?.aborted) throw new DOMException("Settings operation cancelled", "AbortError"); };
    const report = id => emit(stateType, { id, state: publicState() });
    async function batches(entries, action, signal) {
      for (let index = 0; index < entries.length; index += 16) {
        check(signal);
        await OwnPromise.all(entries.slice(index, index + 16).map(action));
      }
      check(signal);
    }
    async function saved(signal) {
      check(signal);
      const at = Date.now();
      await manager.setValue(savedKey, at);
      check(signal);
      state.savedAt = at;
      state.count = known.size;
    }
    async function handle(request, signal) {
      if (request.action === "enable") {
        if (request.enabled) {
          const entries = capture();
          await batches(entries, async ([key, value]) => {
            await manager.setValue(prefix + key, value);
            known.set(key, value.length);
          }, signal);
          await saved(signal);
          await manager.setValue(enabledKey, true);
          check(signal);
          state.enabled = true;
          markEnabled(true);
        } else {
          await manager.setValue(enabledKey, false);
          state.enabled = false;
          markEnabled(false);
          const keys = (await manager.listValues()).filter(key => key.startsWith(prefix));
          await batches(keys, key => manager.deleteValue(key), signal);
          await manager.deleteValue(savedKey);
          known.clear();
          state.savedAt = null;
          state.count = 0;
        }
      } else if (request.action === "write" && state.enabled) {
        const { key, value } = request;
        if (await manager.getValue(enabledKey, false) !== true) {
          state.enabled = false;known.clear();state.count = 0;state.savedAt = null;
          return;
        }
        if (value === null) {
          await manager.deleteValue(prefix + key);
          known.delete(key);
        } else {
          const size = [...known.values()].reduce((total, length) => total + length, 0) - (known.get(key) ?? 0) + value.length;
          if (size > maxTotal || !known.has(key) && known.size >= maxEntries) throw new Error("保存する拡張データが大きすぎます。");
          await manager.setValue(prefix + key, value);
          known.set(key, value.length);
        }
        if (await manager.getValue(enabledKey, false) !== true) {
          await manager.deleteValue(prefix + key);
          state.enabled = false;known.clear();state.count = 0;state.savedAt = null;
          return;
        }
        await saved(signal);
      }
    }
    document.addEventListener(requestType, event => {
      let request;
      try { request = JSON.parse(event.detail); } catch { return; }
      if (!request || typeof request.id !== "string" || request.id.length > 100) return;
      if (request.action === "read") { report(request.id); return; }
      if (request.action !== "enable" && request.action !== "write") return;
      if (request.action === "enable" && typeof request.enabled !== "boolean") return;
      if (request.action === "write" && (!allowed(request.key) || request.value !== null && !validValue(request.value))) return;
      queue = queue.catch(() => {}).then(async () => {
        if (!state.available) throw new Error("保存領域を読み込めませんでした。ページを再読み込みしてください。");
        state.busy = true;
        state.error = "";
        report(request.id);
        const controller = new AbortController();
        try {
          await waitForArkHomuUpdate(() => handle(request, controller.signal), 25_000, () => controller.abort());
        } finally { controller.abort(); }
      }).catch(error => {
        state.error = error?.name === "TimeoutError" ? "管理アドオンへの保存がタイムアウトしました。" :
          error?.message || "管理アドオンへの保存に失敗しました。";
      }).finally(() => {
        state.busy = false;
        report(request.id);
      });
      // The browser event callback deliberately returns no privileged Promise.
    });
    window.addEventListener("storage", event => {
      if (event.key !== tabStateKey || !["on", "off"].includes(event.newValue)) return;
      state.enabled = event.newValue === "on";
      if (!state.enabled) { known.clear();state.count = 0;state.savedAt = null; }
      report();
    });
    return {
      state: publicState,
      async initialize() {
        try {
          state.enabled = await manager.getValue(enabledKey, false) === true;
          if (state.enabled) {
            const keys = (await manager.listValues()).filter(key => typeof key === "string" && key.startsWith(prefix) && allowed(key.slice(prefix.length)));
            if (keys.length > maxEntries) throw new Error("保存済みの拡張データが多すぎます。");
            let size = 0;
            await batches(keys, async key => {
              const value = await manager.getValue(key, null);
              const localKey = key.slice(prefix.length);
              if (!validValue(value) || (size += value.length + localKey.length) > maxTotal)
                throw new Error("保存済みの拡張データを読み込めませんでした。");
              known.set(localKey, value.length);
              // Existing site values may be newer than a previous document's backup.
              if (site.getItem(localKey) === null) site.setItem(localKey, value);
            });
            const at = await manager.getValue(savedKey, null);
            state.savedAt = Number.isSafeInteger(at) && at > 0 ? at : null;
            state.count = known.size;
          }
        } catch (error) {
          state.available = false;
          state.error = error?.message || "管理アドオンの保存領域を読み込めませんでした。";
        }
        if (state.available) markEnabled(state.enabled);
        return publicState();
      }
    };
  }

  try {
    const supplied = JSON.parse(initial);
    if (supplied && typeof supplied.available === "boolean") state = { ...state, ...supplied, busy: false };
  } catch { /* Older installers have no settings bridge. */ }
  const subscribers = new Set(), pending = new Map();
  const token = crypto.randomUUID();
  let sequence = 0, enabling = false;
  const notify = () => { for (const callback of subscribers) callback(publicState()); };
  function send(action, data = {}, wait = false) {
    const id = token + ":" + ++sequence;
    let result;
    if (wait) result = new OwnPromise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id);reject(new Error("保存先の応答を確認できませんでした。")); }, 30_000);
      pending.set(id, { resolve, reject, timer });
    });
    emit(requestType, { id, action, ...data });
    return result;
  }
  document.addEventListener(stateType, event => {
    let message;
    try { message = JSON.parse(event.detail); } catch { return; }
    const next = message?.state;
    if (!next || typeof next.available !== "boolean" || typeof next.enabled !== "boolean") return;
    state = { ...state, ...next };
    notify();
    const request = !state.busy && pending.get(message.id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(message.id);
      state.error ? request.reject(new Error(state.error)) : request.resolve(publicState());
    }
  });
  function changed(key, value) {
    if (state.available && (state.enabled || enabling) && allowed(key)) {
      if (value !== null && !validValue(value)) {
        state.error = "管理アドオンに保存する拡張データが大きすぎます。";
        notify();
        return;
      }
      state.busy = true;
      notify();
      send("write", { key, value });
    }
  }
  const facade = {
    get length() { return site.length; }, key: index => site.key(index), getItem: key => site.getItem(key),
    setItem(key, value) {
      key = String(key);value = String(value);
      const track = state.available && (state.enabled || enabling) && allowed(key);
      const previous = track ? site.getItem(key) : null;
      site.setItem(key, value);
      if (track && previous !== value) changed(key, value);
    },
    removeItem(key) {
      key = String(key);
      const previous = site.getItem(key);
      site.removeItem(key);
      if (previous !== null) changed(key, null);
    },
    clear() {
      const keys = [];
      for (let index = 0; index < site.length; index++) {
        const key = site.key(index);
        if (allowed(key)) keys.push(key);
      }
      site.clear();
      for (const key of keys) changed(key, null);
    }
  };
  return {
    storage: facade, state: publicState,
    subscribe(callback) { subscribers.add(callback);callback(publicState());return () => subscribers.delete(callback); },
    async setEnabled(value) {
      if (!state.available) throw new Error("この機能を使うには管理アドオンのスクリプト本体を上書き更新してください。");
      enabling = value === true;
      state.busy = true;
      notify();
      try { return await send("enable", { enabled: value === true }, true); }
      catch (error) { state.busy = false;state.error = error.message;notify();throw error; }
      finally { enabling = false; }
    }
  };
}
