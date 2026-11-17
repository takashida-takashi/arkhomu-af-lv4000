(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const { readEffects, readSnapshot } = globalThis.hakoAfEffects;
  const extras = globalThis.hakoAfExtrasMain;
  const hiddenTitles = globalThis.hakoAfHiddenTitles;
  const partyShare = globalThis.hakoAfPartyShareMain;
  const trainingRoutes = globalThis.hakoAfTrainingRoutesMain;
  delete globalThis.hakoAfExtrasMain;
  delete globalThis.hakoAfHiddenTitles;
  delete globalThis.hakoAfPartyShareMain;
  const { POWER, SUM, sumRates, dropMetrics, metricValue, viewRule, orderItems } = globalThis.hakoAfListRules;
  const { TARGET } = globalThis.hakoAf4000;
  delete globalThis.hakoAf4000;
  delete globalThis.hakoAfEffects;
  delete globalThis.hakoAfListRules;
  const methods = new WeakMap();
  const exploreViews = new WeakMap();
  const titleBindings = new WeakMap();
  const titleModals = new Set(["ProfileChatStyleSettingsModal", "FlexChatStyleDialog"]);
  let currentExplore;
  let explorePlan;
  const latestPlans = new Map();
  let inventorySection = -1;
  let gameConfig;
  let foodCategories;
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
    ArtifactDecomposePanel: "decompose",
    ArtifactGachaPanel: "gacha"
  };
  const tradeDialogs = new Set(["TradeOfferModal", "ProfileTradeOfferModal", "FlexTradeOfferDialog"]);
  const sortScopes = { "artifact-equip": "inventory", "artifact-enhance": "enhance", "artifact-decompose": "decompose",
    "artifact-gacha": "gacha", "trade-offer": "trade" };
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
      const masters = tx.objectStore("masters");
      const foodKey = "masters:category-groups:v1";
      const food = masters.openCursor(IDBKeyRange.bound(foodKey, foodKey + ";"), "prev");
      food.onsuccess = () => {
        foodCategories = food.result?.value?.find?.(group => group.id === "food")?.categories;
        if (foodCategories) document.dispatchEvent(new Event("hako-af:expedition-update"));
      };
      const cursor = masters.openCursor(
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

  function rawProjection(source, plan, powerOf, decomposeState, allowMissingRates = false) {
    const rule = viewRule(plan);
    const records = [];
    const metrics = new Set();
    let matched = 0;
    let unknown = 0;
    let protectedCount = 0;
    let keptCount = 0;
    const matchingIds = [];
    const sectionItems = rule.pages.map(() => []);
    const matches = sectionItems.length ? [] : undefined;
    for (const original of source) {
      const id = original?.id;
      const raw = snapshot(original?._artifact, decomposeState, id);
      const values = raw ? readEffects(raw) : new Map();
      const sum = raw && sumRates(values, allowMissingRates);
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
      if (matches) matches.length = 0;
      const status = rule.check(record, matches);
      if (status.kept) keptCount++;
      if (status.unknown) unknown++;
      if (status.protected) protectedCount++;
      if (status.result === true && record.keepId) matchingIds.push(record.keepId);
      if (status.show && (rule.checked || rule.discard || status.result === true)) matched++;
      if (matches && status.result === true) record.pages = rule.matchedPages(rule.matchedSections(matches));
      if (status.show) records.push(record);
    }
    const items = orderItems(records, plan.sort).map(({ original, pages }) => {
      if (pages) for (const index of pages) sectionItems[index].push(original);
      return original;
    });
    return { items, sectionItems, total: source.length, matched, unknown, protectedCount, keptCount, matchingIds, metrics: [...metrics] };
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
        }
        const section = state.scope === "inventory" ? state.result.sectionItems[inventorySection] : null;
        const projected = section ?? state.result.items;
        if (state.projected !== projected) {
          state.projected = projected;
          document.dispatchEvent(new Event("hako-af:grid-rendered"));
        }
        if (props.items !== state.projected) props.items = state.projected;
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
    const data = readSnapshot(artifact);
    if (!data) return null;
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

  const expeditionPlanner = globalThis.hakoAfExpeditionMain?.start(dependencies);
  const expeditionNative = globalThis.hakoAfExpeditionNative?.start(readThrough,
    owner => expeditionPlanner?.presetState(owner), (owner, vnode) => expeditionPlanner?.observePresets(owner, vnode));
  delete globalThis.hakoAfExpeditionMain;
  delete globalThis.hakoAfExpeditionNative;

  function readThrough(ref, project) {
    const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ref), "value");
    if (!native?.get) return false;
    Object.defineProperty(ref, "value", { configurable: true, get() {
      return project(native.get.call(this));
    } });
    return true;
  }

  const gachaSets = globalThis.hakoAfGachaSets?.start({
    dependencies, readThrough, currentPlan: () => planFor("gacha"),
    project: (items, plan, power) => rawProjection(items, plan, power, null, true)
  });

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
          minimumStars: condition.stars, absent: condition.absent
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
    const expedition = stores?.get("expedition");
    const expeditionOwners = new Set();
    trainingRoutes?.rememberOwned();
    const matingPage = /^\/(?:f\/)?mating(?:\/|$)/.test(location.pathname);
    let legacyMatingParents;
    const translate = key => app?.config?.globalProperties?.$t?.(key) ?? key;
    let chatReplies;
    const getChatReplies = () => chatReplies ??= extras.indexChatReplies(stores?.get("chat"));
    const tradeCategory = stores?.get("userItems")?.currentCategoryKey === "artifact";
    const flexTradeAnchor = tradeCategory ? document.getElementById("fx-trade-artifact-controls")?.parentElement : null;
    if (flexTradeAnchor) flexTradeAnchor.dispatchEvent(new CustomEvent("hako-af:list-ui", {
      bubbles: true, detail: '["controls","trade"]'
    }));
    let foundSummary = false;
    let summaryShown = false;
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
    const pending = [[root._vnode, null, null, null, null, null, null, null, null]];
    const seen = new WeakSet();

    // Read the props of rendered cards. The same objects are used by the game when a detail opens.
    while (pending.length) {
      const [vnode, parentScope, parentAuctionList, parentGacha, parentMonster, parentWarehouse, parentTitleModal,
        parentExpedition, parentBentoItems] = pending.pop();
      if (!vnode || typeof vnode !== "object" || seen.has(vnode)) continue;
      seen.add(vnode);
      const instance = vnode.component;
      const props = instance?.props ?? vnode.props;
      const name = instance?.type?.__name ?? vnode.type?.__name;
      // The classic mating page labels exactly its two selected parents as unavailable (already set).
      if (matingPage && name === "MonsterList" && instance?.parent?.type?.__name === "mating" &&
          props?.unavailableText === "セット済" && Array.isArray(props.unavailableIds)) {
        legacyMatingParents = props.unavailableIds;
      }
      const titleModal = profileTitles && (titleModals.has(name) ? instance : parentTitleModal);
      if (titleModal && instance) readProfileTitles(titleModal, instance);
      const el = vnode.el ?? instance?.subTree?.el;
      const expeditionView = name === "ExpeditionModal" || name === "FlexExpeditionPage" ? instance : parentExpedition;
      if (expeditionView) {
        expeditionOwners.add(expeditionView);
        if (instance) expeditionNative?.observe(expeditionView, instance, vnode, stores);
        if (typeof vnode.props?.onApply === "function") expeditionPlanner?.observePresets(expeditionView, vnode);
        if (el?.nodeType === 1 && el.matches(".expedition-modal-body, .fx-expd"))
          expeditionNative?.read(el, expeditionView, "editing");
      }
      if (name === "ExpeditionBentoPanel" || name === "FlexExpeditionBento") {
        configFromCache();
        expeditionPlanner?.read(name, instance, el, stores, gameConfig, foodCategories, translate);
      }
      let bentoItems = parentBentoItems;
      if (name === "VirtualItemGrid" && el?.closest?.("[data-bento-pointer-remove]") && Array.isArray(props?.items)) {
        bentoItems = new Map(props.items.filter(Boolean).map(item => [item.id, item]));
      } else if (bentoItems && vnode.anchor && el?.nodeType === Node.TEXT_NODE) {
        // The classic grid keys each food slot fragment by the native inventory ID.
        const item = bentoItems.get(vnode.key);
        const card = item && el.nextElementSibling;
        if (card?.querySelector(':scope > button[aria-label="アイテムの詳細を見る"]') &&
            (card.compareDocumentPosition(vnode.anchor) & Node.DOCUMENT_POSITION_FOLLOWING)) {
          expeditionPlanner?.foodCard(card, item, translate);
        }
      } else if (name === "FlexItemCell" && el?.matches?.("button[data-fx-drag-id]") &&
          el.parentElement?.matches(".fx-bento__item")) {
        expeditionPlanner?.foodCard(el.parentElement, props?.item, translate);
      }
      if (expeditionView && expedition?.expedition && (vnode.type === "h2" || vnode.type === "span") &&
          /^遠征(?:中|から帰還しました[！!]?)$/.test(el?.textContent?.trim() ?? "")) {
        expeditionPlanner?.elapsed(el, expedition);
        const hero = el?.closest(".expedition-hero, .fx-expd__hero");
        if (hero) expeditionNative?.read(hero, expeditionView, "status");
      }
      if (expeditionView && expedition?.isLoaded && !expedition.isActive && vnode.type === "h2" && el?.nodeType === 1) {
        const title = el.textContent.trim();
        if (el.id === "fx-expd-member-title" || /^遠征メンバー\s*\(/.test(title))
          expeditionNative?.read(el, expeditionView, "ready");
      }
      if (matingPage && el?.nodeType === 1 && typeof vnode.key === "string" && /^auto-[sp]:/.test(vnode.key)) {
        trainingRoutes?.rememberLegacyAuto(el, vnode.key.slice(5));
      }
      if (trainingRoutes?.accepts(name)) trainingRoutes.read(name, instance, props, el, translate, dependencies, readThrough);
      if (name === "FlexMonsterDetail" || name === "MonsterDetailPanel") {
        const target = partyShare?.bindMember(name, props, vnode, stores?.get("userMonsters")?.monsters, translate);
        trainingRoutes?.readMonster(target, app, stores?.get("userProfile"));
      }
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
        if (name === "FlexPartySlots" || name === "PartyFormationPanel") partyShare?.bind(name, props, el);
        if (name === "HallOfFameClassicPostDetail" || name === "FlexHallPostDetail" || props?.detail && el.matches(".fx-hall-detail")) {
          partyShare?.bindHall(props, el);
        }
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
          summaryShown = true;
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
        if (name === "FlexSlotMachine") extras?.readSlotBonus(instance, el);
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
        if (name === "ArtifactGachaPanel" && props.active) {
          configFromCache();
          gachaSets?.readClassic(instance, el, stores?.get("userItems"), presets,
            item => item._artifact && cachedPower(item._artifact), !!powerConfig);
        }
        if (name === "VirtualItemGrid" && scope === "gacha") {
          gachaSets?.read(instance, el, stores?.get("userItems"), true);
        }
        if (name === "FlexArtifactGrid" && props.labelledby === "fx-agacha-title") {
          gachaSets?.read(instance, el, stores?.get("userItems"));
        }
        const flexScope = name === "FlexArtifactGrid" && (scope === "trade" ? scope : flexLabels[instance?.props?.labelledby]);
        const gridScope = name === "VirtualItemGrid"
          ? scope ?? (el.closest("[data-artifact-equip-inventory]") ? "inventory" : null) : flexScope;
        if (gridScope === "trade" && name === "FlexArtifactGrid") el.dispatchEvent(new CustomEvent("hako-af:list-ui", {
          bubbles: true, detail: '["grid","trade"]'
        }));
        if (scope && scope !== "gacha" && name === "GridPaginationControls") {
          adjustClassicPager(instance, scope);
          pagers.push(instance);
        }
        if (gridScope && gridScope !== "gacha") {
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
              keptCount: result.keptCount, matchingIds: result.matchingIds, metrics: result.metrics,
              sectionCounts: result.sectionItems.map(items => items.length)
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
      const context = [scope, auctionList, gacha, monster, warehouse, titleModal, expeditionView, bentoItems];
      if (instance?.subTree) pending.push([instance.subTree, ...context]);
      else if (vnode.suspense?.activeBranch) pending.push([vnode.suspense.activeBranch, ...context]);
      else if (Array.isArray(vnode.children)) {
        for (let i = vnode.children.length - 1; i >= 0; i--) pending.push([vnode.children[i], ...context]);
      }
    }
    extras?.skipExploreLogs(root, stores, summaryShown);
    for (const owner of expeditionOwners) expeditionNative?.sync(owner);
    if (matingPage) trainingRoutes?.legacyMating(legacyMatingParents);
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
      const revision = grid?.projected;
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
    let scope, plan, reset, section;
    try { ({ scope, plan, reset, section } = JSON.parse(event.detail)); } catch { return; }
    if (!Object.values(sortScopes).includes(scope)) return;
    if (plan) latestPlans.set(scope, plan);
    const changedSection = scope === "inventory" && Number.isSafeInteger(section) && section !== inventorySection;
    if (changedSection) inventorySection = section;
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
      if (scope === "gacha") gachaSets?.invalidate(instance);
      if (state?.scope === scope) {
        if (!state.pager) state.reset ||= !!reset;
        else if (changedSection && instance.vnode.props?.page > 1) instance.emit("change", 1);
        instance.proxy?.$forceUpdate();
      }
      if (instance?.subTree) pending.push(instance.subTree);
      else if (vnode.suspense?.activeBranch) pending.push(vnode.suspense.activeBranch);
      else if (Array.isArray(vnode.children)) pending.push(...vnode.children);
    }
  });
})();
