(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const names = globalThis.hakoAfFeatureNames;
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
  const exploreTimingKey = "hakoAf4000:explore-timing";
  const previousExploreResults = new WeakMap();
  const exploreElapsed = new WeakMap();
  let exploreTiming = { pending: {}, finished: {} };
  try {
    const saved = JSON.parse(sessionStorage.getItem(exploreTimingKey));
    if (saved?.pending && saved?.finished) exploreTiming = saved;
  } catch { /* Continue with in-tab timing. */ }
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
  const slotPlaybackReaders = new WeakMap();
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
  const nativeMarketPrices = globalThis.hakoAfMarketSnapshots;
  delete globalThis.hakoAfMarketSnapshots;
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

  const gameUpdateCacheKey = "hakoAf4000:game-update-build";
  const patchDatePattern = /^\d{4}-\d{2}-\d{2}(?:-\d{1,3})?$/;

  async function readGameUpdate(build) {
    try {
      const cached = JSON.parse(localStorage.getItem(gameUpdateCacheKey));
      if (cached?.build === build && patchDatePattern.test(cached.date) && Number.isSafeInteger(cached.count) &&
          cached.count > 0) return cached;
    } catch { /* The public update history is still available without a cache. */ }

    const script = document.querySelector('script[type="module"][src*="/_nuxt/"]');
    if (!script) return;
    const entry = new URL(script.src);
    if (entry.origin !== location.origin || !/^\/_nuxt\/[\w.-]+\.js$/.test(entry.pathname)) return;
    const response = await fetch(entry, { cache: "force-cache", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const source = await response.text();
    // The official entry contains the recent notes and total used by its update history screen.
    const totals = [...source.matchAll(/\}\]\}\],\s*[\w$]+\s*=\s*([1-9]\d{0,6}),\s*[\w$]+\s*=\s*\["important","content","bugfix","balance","ui","other"\]/g)];
    if (totals.length !== 1) return;
    const [total] = totals;
    const notes = source.slice(Math.max(0, total.index - 64_000), total.index);
    const start = [...notes.matchAll(/\[\{date:"(\d{4}-\d{2}-\d{2}(?:-\d{1,3})?)",items:\[\{cat:"(?:important|content|bugfix|balance|ui|other)",text:/g)].at(-1);
    if (!start) return;
    const result = { build, date: start[1], count: Number(total[1]) };
    try { localStorage.setItem(gameUpdateCacheKey, JSON.stringify(result)); } catch { /* Caching is optional. */ }
    return result;
  }

  document.addEventListener("hako-af:read-game-build", () => {
    const config = appProperties()?.$config ?? window.__NUXT__?.config;
    const build = config?.public?.buildId;
    const valid = typeof build === "string" && build !== "dev" && /^[\w.-]{1,128}$/.test(build);
    publish(document, "hako-af:game-build", valid ? build : null);
    if (valid) void readGameUpdate(build).then(update => {
      if (update) publish(document, "hako-af:game-build", update);
    }).catch(() => {});
  });

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
    if (!options.exploreAnalysis && Object.keys(exploreTiming.pending).length) {
      exploreTiming.pending = {};
      saveExploreTiming();
    }
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

  function exploreParty(value) {
    const index = amountOf(value);
    return Number.isSafeInteger(index) ? index : null;
  }

  function saveExploreTiming() {
    try { sessionStorage.setItem(exploreTimingKey, JSON.stringify(exploreTiming)); } catch { /* Keep the active tab's timing. */ }
  }

  function exploreRunKey(result, at) {
    return typeof result?.resultRunId === "string" && result.resultRunId || (at > 0 ? `saved:${at}` : null);
  }

  function partyOfExploreButton(button, root) {
    const label = button.closest(".fx-explore")?.getAttribute("aria-labelledby");
    const party = exploreParty(label?.match(/^fx-explore-title-(\d+)$/)?.[1]);
    if (party != null) return party;
    // Classic home renders both responsive layouts with Vue keys named card-<partyIndex>.
    const nodes = [root._vnode];
    while (nodes.length) {
      const vnode = nodes.pop();
      if (!vnode || vnode.el?.nodeType === 1 && !vnode.el.contains(button)) continue;
      const classic = typeof vnode.key === "string" && /^card-(\d+)$/.exec(vnode.key);
      if (classic && vnode.el?.contains(button)) return Number(classic[1]);
      if (vnode.component?.type?.__name === "FlexExploreCard" && vnode.el?.contains(button)) {
        return exploreParty(vnode.component.props.card?.partyIndex);
      }
      if (vnode.component) nodes.push(vnode.component.subTree);
      else if (vnode.suspense) nodes.push(vnode.suspense.activeBranch);
      else if (Array.isArray(vnode.children)) nodes.push(...vnode.children);
    }
    return null;
  }

  document.addEventListener("click", event => {
    if (!options.exploreAnalysis || !event.isTrusted || event.defaultPrevented) return;
    const route = location.pathname.replace(/^\/f(?=\/|$)/, "").replace(/\/$/, "");
    if (route && route !== "/home" && route !== "/explore-result") return;
    const button = event.target instanceof Element && event.target.closest("button");
    const root = document.getElementById("__nuxt");
    if (!button || !root?.contains(button) || button.disabled || button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("aria-busy") === "true") return;
    const caption = (button.getAttribute("aria-label") || button.textContent).trim();
    const repeat = route === "/explore-result";
    const boss = !repeat && caption === "ボス戦へ";
    if (!boss && !(repeat ? /^再び探索(?:（[^）]*）)?$/ : /^探索開始(?:\s*×\s*[\d,]+)?$/).test(caption)) return;
    const at = Date.now();
    const tick = performance.timeOrigin + performance.now();
    const stores = appProperties()?.$pinia?._s;
    const saved = stores?.get("exploreResult")?.current;
    const owner = stores?.get("userProfile")?.profile?.id;
    const party = repeat ? exploreParty(saved?.partyIndex ?? new URLSearchParams(location.search).get("party"))
      : partyOfExploreButton(button, root);
    if (owner == null || party == null) return;
    if (boss && exploreParty(stores?.get("guildDungeon")?.session?.partyIndex) !== party) return;
    const start = { at, tick, owner: String(owner), kind: boss ? "boss" : "step",
      previousKey: exploreRunKey(saved?.result, saved?.savedAt) };
    if (saved?.result) previousExploreResults.set(start, saved.result);
    exploreTiming.pending[party] = start;
    saveExploreTiming();
  }, true);

  function measureExploreTime(anchor, result, party, owner, at, kind) {
    if (exploreElapsed.has(result)) return exploreElapsed.get(result);
    if (party == null || owner == null) return;
    const account = String(owner);
    const key = exploreRunKey(result, at);
    const finished = exploreTiming.finished[party];
    if (key && finished?.key === key && finished.owner === account) return finished.milliseconds;
    const start = exploreTiming.pending[party];
    if (!start || start.owner !== account || start.kind !== kind || previousExploreResults.get(start) === result ||
        (key && start.previousKey === key) || (at && at < start.at) || !anchor.getClientRects().length) return;
    const milliseconds = Math.round(performance.timeOrigin + performance.now() - start.tick);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    delete exploreTiming.pending[party];
    if (key) exploreTiming.finished[party] = { owner: account, key, milliseconds };
    saveExploreTiming();
    exploreElapsed.set(result, milliseconds);
    return milliseconds;
  }

  function readExploreAnalysis(anchor, props, drops, stores, config, hasDrops) {
    if (!options.exploreAnalysis || new URLSearchParams(location.search).get("return") === "guild") return;
    const saved = stores?.get("exploreResult")?.current;
    const current = props?.result ? props : saved;
    const result = current?.result;
    if (!result?.summary || result.tower || result.debugNoSave) return;
    const guild = !!(result.guildSessionId || result.dungeon?.is_guild);
    if (current.kind !== "step" && !(guild && current.kind === "boss")) return;
    const mode = guild ? "guild" : "normal";
    const owner = stores?.get("userProfile")?.profile?.id ?? saved?.ownerUserId;
    const at = saved?.result === result && amountOf(saved.savedAt);
    const party = exploreParty(current.partyIndex ?? (saved?.result === result ? saved.partyIndex : null) ??
      new URLSearchParams(location.search).get("party"));
    const elapsedMs = current.ownerUserId == null || String(current.ownerUserId) === String(owner)
      ? measureExploreTime(anchor, result, party, owner, at, current.kind) : undefined;
    if (guild && (result.guildPractice || current.kind === "boss")) {
      if (elapsedMs != null) publish(anchor, "hako-af:explore-analysis", {
        mode, hasDrops, elapsedMs, timingOnlyNote: result.guildPractice ? "試走（ストック消費なし）" : "ギルダンのボス戦（ストック消費なし）"
      });
      return;
    }
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
      if (guild || elapsedMs != null) publish(anchor, "hako-af:explore-analysis", {
        mode, identity, hasDrops, elapsedMs, current: battleResults,
        missingGuildRewards: result.guildRewardScope === "total" && !Array.isArray(items)
      });
      return;
    }
    publish(anchor, "hako-af:explore-analysis", {
      mode, identity, hasDrops, elapsedMs, current: { stocks: used, af: af ?? countExploreArtifacts(items), exp, gold, ...battleResults },
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

  function readSlotPlayback(instance, el) {
    const reader = slotPlaybackReaders.get(instance);
    if (reader) return reader();
    // The cabinet watches the current replay snapshot through a Vue ref.
    // Read that ref only. The server can send later frames in the same response.
    for (const { fn, deps } of instance.scope?.effects ?? []) {
      if (typeof fn !== "function" || !deps?.dep || deps.nextDep || deps.dep.computed ||
          !/^\(\s*\)\s*=>\s*[\w$]+\.value$/.test(Function.prototype.toString.call(fn))) continue;
      const snapshot = fn();
      if (!Number.isSafeInteger(snapshot?.cursor) || !Number.isSafeInteger(snapshot.stock) ||
          !Object.hasOwn(snapshot, "nextDuelOdds") || !Object.hasOwn(snapshot, "bonus")) continue;
      slotPlaybackReaders.set(instance, fn);
      instance.proxy?.$watch(
        () => [fn(), instance.props.machine?.kind, instance.props.ctl?.isPreview],
        () => readSlotBonus(instance, el), { flush: "post" }
      );
      return snapshot;
    }
  }

  function readSlotBonus(instance, el) {
    const stage = instance.refs?.stageEl ?? el.querySelector(".fx-slot-machine__stage");
    if (!stage?.parentElement) return;
    const existing = stage.parentElement.querySelector(':scope > [data-ha4="slot-bonus-info"]');
    const playback = options.slotBonus && instance.props?.machine?.kind === "empire" &&
      !instance.props.ctl?.isPreview && readSlotPlayback(instance, el);
    if (playback?.bonus !== "bonus") {
      existing?.remove();
      return;
    }

    const values = [`継続ストック ${playback.stock} 個`];
    if (Number.isSafeInteger(playback.upper) && playback.upper > 0) {
      values.push(`確定継続 残り ${playback.upper} 回`);
    }
    const odds = playback.nextDuelOdds;
    if (Number.isSafeInteger(odds) && odds >= 0 && odds <= 3 &&
        stage.querySelector('[aria-live="polite"]')?.textContent.startsWith("出撃する機体を選んでください")) {
      values.push(`決戦の演出レベル ${odds}`);
    }
    const summary = values.join("　／　");
    if (existing) {
      if (existing.textContent !== summary) existing.textContent = summary;
      return;
    }
    const info = document.createElement("div");
    info.dataset.ha4 = "slot-bonus-info";
    info.title = names.slot;
    info.textContent = summary;
    stage.before(info);
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
  globalThis.hakoAfExtrasMain = { readDrops, readExploreAnalysis, dropType, readInventoryItem, readSkillEditor, readSkillToggle, gachaStage, readGachaCard,
    prepareQuote, indexChatReplies, observeAlertPage, homeObserverNames, openWatchedItem, readSlotBonus, hiddenTitlesEnabled: () => options.hiddenTitles === true,
    enhanceEstimateEnabled: () => options.enhanceEstimate === true, readEnhanceEstimate, watchMarketPrices,
    marketWatchEnabled: () => options.marketWatch === true, readMarketItemPrices, readMarketWatchItem, readMarketWatchSkill };
})();
