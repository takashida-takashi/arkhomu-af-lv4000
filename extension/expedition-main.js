(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const stats = ["hp", "atk", "def", "mtk", "mdf", "spd", "lck"];
  const gateTimes = [0, 120, 180, 240, 360, 480];
  const countryFactors = [1, .95, .9, .85];
  const foodCategories = ["cooking", "water", "meat", "fish", "egg", "alcohol", "fruit", "vegetable", "seasoning", "other_food"];
  const maxTrips = 48;
  const constrainedSearchLimit = 700_000;
  const addValues = (a, b) => a.map((value, i) => value + b[i]);
  const emptyValues = () => stats.map(() => 0);
  const roundedGain = (value, trips) => Math.floor(value * trips + 1e-9);
  const score = (values, weights) => values.reduce((sum, value, i) => sum + value * weights[i], 0);
  const meetsMinimums = (values, minimums) => values.every((value, i) => value >= minimums[i]);
  const numberOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const ratio = (value, fallback) => Math.max(0, Math.min(1, numberOr(value, fallback)));
  const readMasters = globalThis.hakoAfTrainingSources?.readMasters;

  function firstTripMinutes(sum, high, rules, reduction, countryFactor) {
    const unit = rules.roundUnitMinutes > 0 ? numberOr(rules.roundUnitMinutes, 30) : 30;
    const surplusRank = Math.max(0, Math.ceil(high + (sum - high) * ratio(rules.additionalBentoRankRate, .5)) -
      numberOr(rules.freeRank, 6));
    const raw = numberOr(rules.baseMinutes, 30) +
      Math.floor(surplusRank * numberOr(rules.minutesPerRank, 15) / unit) * unit;
    const threshold = Math.max(0, numberOr(rules.longTripThresholdMinutes, 120));
    const shortened = raw > threshold
      ? threshold + Math.floor((raw - threshold) * ratio(rules.longTripExcessRate, .7) / unit) * unit
      : raw;
    const facility = Math.max(1, Math.round(shortened * Math.max(0, 1 -
      numberOr(rules.timeReductionPerLevel, .1) * reduction)));
    return Math.max(1, Math.ceil(facility * Math.min(1, countryFactor)));
  }

  function totalMinutes(first, trips) {
    return first + (trips - 1) * Math.max(1, Math.round(first * 1.5));
  }

  function repeatBudget(status) {
    if (status?.open !== true) return 0;
    const level = Math.min(gateTimes.length - 1, Math.floor(status.gateLevel));
    return (gateTimes[level] ?? 0) * (status.passActive === true ? 2 : 1);
  }

  function candidateCopies(foods, slots, trips, required, minimums, fractional) {
    const candidates = [];
    const sameRank = new Map();
    const thresholds = required.map(i => Math.ceil(minimums[i] / trips));
    for (const food of foods) {
      let copies = Math.min(slots, Math.floor(food.amount / trips));
      if (copies <= 0) continue;
      const progress = required.map((i, index) => Math.min(thresholds[index], food.values[i]));
      if (!fractional && required.length) {
        // A lower-rank bento with an equal or better score and enough of each required stat
        // can replace one of these copies whenever a slot for it is available.
        let alternatives = 0;
        for (const candidate of candidates) {
          if (candidate.food.rank <= food.rank && progress.every((value, i) => candidate.progress[i] >= value))
            alternatives += candidate.copies;
          if (alternatives >= slots) break;
        }
        copies = Math.min(copies, slots - alternatives);
      } else if (!fractional) {
        const kept = sameRank.get(food.rank) ?? 0;
        copies = Math.min(copies, slots - kept);
        sameRank.set(food.rank, kept + copies);
      }
      if (copies > 0) candidates.push({ food, copies, progress });
    }
    return candidates.flatMap(({ food, copies }) => Array(copies).fill(food));
  }

  function remainingGains(copies, slots, required) {
    // Upper bounds by available copies and slots, ignoring ranks and other stats.
    const bounds = Array(copies.length + 1);
    const counts = Array.from({ length: slots + 1 }, (_, i) => i);
    bounds[copies.length] = [0, ...required].map(() => counts.map(() => 0));
    for (let i = copies.length - 1; i >= 0; i--) {
      const gains = [copies[i].value, ...required.map(stat => copies[i].values[stat])];
      bounds[i] = gains.map((gain, index) => {
        const later = bounds[i + 1][index];
        return counts.map(n => n === 0 ? 0 : Math.max(later[n], later[n - 1] + gain));
      });
    }
    return bounds;
  }

  function* maximize(foods, slots, minutes, gate, duration, { weights, minimums }) {
    if (!foods.length || slots < 1) return null;
    const required = stats.flatMap((_, i) => minimums[i] ? [i] : []);
    const active = stats.flatMap((_, i) => weights[i] || minimums[i] ? [i] : []);
    const fractional = foods.some(food => active.some(i => !Number.isInteger(food.values[i])));
    const trackValues = fractional || required.length > 0;
    const rankStride = Math.max(...foods.map(food => food.rank)) + 1;
    const byValue = [...foods].sort((a, b) => b.value - a.value || a.rank - b.rank);
    const timeCache = new Map();
    const budget = Math.min(minutes, gate);
    const earliest = duration(0, 0);
    const tripLimit = Math.max(1, Math.min(maxTrips,
      1 + Math.floor((budget - earliest) / (totalMinutes(earliest, 2) - earliest))));
    let best = null;
    let work = 0;
    let considered = 0;
    let limited = false;

    for (let attempt = 1; attempt <= tripLimit; attempt++) {
      const trips = required.length ? tripLimit + 1 - attempt : attempt;
      const cap = trips === 1 ? minutes : budget;
      const copies = candidateCopies(byValue, slots, trips, required, minimums, fractional);
      const bounds = required.length ? remainingGains(copies, slots, required) : null;
      if (bounds && required.some((stat, i) => roundedGain(bounds[0][i + 1][slots], trips) < minimums[stat]))
        continue;
      const states = Array.from({ length: slots + 1 }, () => new Map());
      states[0].set(0, { sum: 0, high: 0, value: 0, food: null, previous: null,
        values: trackValues ? emptyValues() : null });
      search:
      for (const [position, food] of copies.entries()) {
        const later = bounds?.[position + 1];
        for (let count = Math.min(slots, position + 1); count > 0; count--) {
          const remaining = slots - count;
          for (const previous of states[count - 1].values()) {
            if (++work === 1024) {
              work = 0;
              yield;
            }
            if ((required.length || fractional) && ++considered > constrainedSearchLimit) {
              limited = true;
              break search;
            }
            const value = previous.value + food.value;
            if (later && best && !fractional && (value + later[0][remaining]) * trips + 1e-9 < best.gain) continue;
            const sum = previous.sum + food.rank;
            const high = Math.max(previous.high, food.rank);
            const rankKey = sum * rankStride + high;
            if (!trackValues && states[count].get(rankKey)?.value >= value) continue;
            if (!timeCache.has(rankKey)) timeCache.set(rankKey, duration(sum, high));
            const first = timeCache.get(rankKey);
            if (totalMinutes(first, trips) > cap) continue;
            const values = trackValues ? addValues(previous.values, food.values) : null;
            if (later && required.some((stat, i) => roundedGain(values[stat] + later[i + 1][remaining], trips) < minimums[stat]))
              continue;
            const progress = required.map(i => Math.min(minimums[i], roundedGain(values[i], trips)));
            // Equal progress and rounding remainders make states interchangeable for future additions.
            const remainders = fractional ? active.map(i => values[i] * trips % 1) : [];
            const key = trackValues ? [rankKey, ...progress, ...remainders].join(",") : rankKey;
            const gain = fractional ? score(values.map(bonus => roundedGain(bonus, trips)), weights) : value * trips;
            if (trackValues && states[count].get(key)?.gain >= gain) continue;
            const enough = progress.every((amount, i) => amount >= minimums[required[i]]);
            states[count].set(key, { sum, high, value, gain, values, enough, food, previous, first });
          }
        }
      }
      for (let count = 1; count <= Math.min(slots, copies.length); count++) {
        for (const state of states[count].values()) {
          const { gain } = state;
          const elapsed = totalMinutes(state.first, trips);
          if (!state.enough || gain <= 0 && !required.length || best && (gain < best.gain || gain === best.gain &&
              (elapsed > best.elapsed || elapsed === best.elapsed && count * trips >= best.count * best.trips))) continue;
          best = { state, gain, count, trips, elapsed };
        }
      }
      if (limited) break;
    }
    if (!best) return limited ? { limited } : null;
    const chosen = [];
    for (let state = best.state; state.food; state = state.previous) chosen.push(state.food);
    chosen.reverse();
    const gains = chosen.reduce((values, food) => addValues(values, food.values), emptyValues())
      .map(value => roundedGain(value, best.trips));
    return { foods: chosen, gain: score(gains, weights), gains, minutes: best.elapsed, trips: best.trips,
      first: best.state.first, limited };
  }

  async function runSearch(search, current) {
    let slice = performance.now();
    for (let step = search.next(); ; step = search.next()) {
      if (step.done) return step.value;
      if (performance.now() - slice < 8) continue;
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!current()) return null;
      slice = performance.now();
    }
  }

  function objective(input) {
    if (!input || !Number.isSafeInteger(input.minutes) || input.minutes < 1) return null;
    if (input.stat === "custom") {
      const { weights, minimums } = input;
      if (Array.isArray(weights) && weights.length === stats.length &&
          weights.every(n => Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER) &&
          weights.some(n => n > 0) && Array.isArray(minimums) && minimums.length === stats.length &&
          minimums.every(n => Number.isSafeInteger(n) && n >= 0)) return { weights, minimums };
      return null;
    }
    if (input.stat === "total" || stats.includes(input.stat)) {
      return { weights: stats.map(stat => Number(input.stat === "total" || input.stat === stat)), minimums: emptyValues() };
    }
    return null;
  }

  function findComputed(effect, dependencies, matches) {
    const pending = dependencies(effect);
    const seen = new Set();
    while (pending.length) {
      const ref = pending.pop();
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (matches(ref)) return ref;
      pending.push(...dependencies(ref));
    }
  }

  function nativeTime(instance, dependencies) {
    const matches = ref => {
      const source = String(ref.fn);
      return source.includes("additionalBentoRankRate") && source.includes("longTripThresholdMinutes");
    };
    for (let parent = instance.parent; parent; parent = parent.parent) {
      const time = findComputed(parent.effect, dependencies, matches);
      if (time) return time;
      if (parent.type?.__name === "ExpeditionModal" || parent.type?.__name === "FlexExpeditionPage") break;
    }
  }

  function nativeFoodList(instance, dependencies) {
    const list = findComputed(instance.effect, dependencies, ref => String(ref.fn).includes(".getItemsByFilter("));
    return list?.value;
  }

  function itemRank(item) {
    return Math.max(0, Math.floor(Number(item?.m_items?.rank) || 0));
  }

  function usableFood(item) {
    return Boolean(item?.id && item.m_items && item.m_items.used !== false);
  }

  function stockAmount(item) {
    return Math.max(0, numberOr(Math.floor(Number(item.amount)), 0));
  }

  function sortFoodCatalog(items, order) {
    if (order === "recent") {
      const acquired = item => Date.parse(item.acquired_at || item.updated_at || item.created_at) || 0;
      return [...items].sort((a, b) => acquired(b) - acquired(a));
    }
    if (order === "amount") {
      return [...items].sort((a, b) => (b.amount || 0) - (a.amount || 0) || itemRank(b) - itemRank(a) ||
        (a.m_items?.name_key || "").localeCompare(b.m_items?.name_key || ""));
    }
    return [...items].sort((a, b) => itemRank(b) - itemRank(a));
  }

  function itemValue(master, stat, config) {
    const raw = master?.[`base_${stat}`];
    const configured = Number(config.expedition?.bentoParamRate);
    const rate = config.expedition?.bentoParamRate != null && Number.isFinite(configured) && configured >= 0
      ? configured : stat === "lck" ? 1 : Number(config.stats?.internal?.expeditionRate ?? 1);
    return typeof raw === "number" && Number.isFinite(raw * rate) ? raw * rate : 0;
  }

  function start(dependencies) {
    const views = new WeakMap();
    const foodLists = new WeakMap();
    const presets = new WeakMap();
    let repeatStatus;
    let countryFactor;
    let loadedConfig;
    let loadedCategories;
    document.addEventListener("hako-af:expedition-native-data", event => {
      const data = event.detail;
      if (data?.type === "repeat") repeatStatus = data.value;
      if (data?.type === "nation") countryFactor = data.value;
      if (data?.type === "config") loadedConfig = data.value;
      if (data?.type === "categories") loadedCategories = data.value;
      document.dispatchEvent(new Event("hako-af:expedition-update"));
    });
    document.dispatchEvent(new Event("hako-af:read-expedition-native-data"));

    function foodSource(view, followNative = true) {
      const { instance, owner, stores } = view;
      const categories = loadedCategories ?? view.categories;
      const items = stores?.get("userItems");
      if (items?.isLoaded !== true || items.isLoading) return null;
      const list = foodLists.get(owner ?? expeditionOwner(instance));
      if (followNative) {
        const native = (list && !list.isUnmounted && nativeFoodList(list, dependencies)) ||
          (instance && nativeFoodList(instance, dependencies));
        if (Array.isArray(native)) return native;
      }
      const source = items.getItemsByFilter?.({ tags: [], categories: categories ?? foodCategories, ids: [] });
      return followNative && Array.isArray(source) ? sortFoodCatalog(source, "rank") : source;
    }

    async function catalogFoods(view, owned) {
      const properties = view.instance.appContext?.config?.globalProperties;
      const buildId = properties?.$config?.public?.buildId ?? properties?.$nuxt?.$config?.public?.buildId ??
        globalThis.__NUXT__?.config?.public?.buildId;
      const data = await readMasters?.(buildId, "items");
      if (!data?.items?.length) return null;
      const categories = new Set(loadedCategories ?? view.categories ?? foodCategories);
      const foods = new Map();
      const unowned = [];
      for (const item of owned) {
        if (usableFood(item) && item.item_id) foods.set(item.item_id, item);
      }
      const now = Date.now();
      for (const master of data.items) {
        if (!master?.id || foods.has(master.id) || master.used === false ||
            Number(master.open_at) > now || !Array.isArray(master.categories) ||
            !master.categories.some(category => categories.has(category))) continue;
        unowned.push({ id: master.id, item_id: master.id, m_items: master, amount: 0 });
      }
      return [...foods.values(), ...sortFoodCatalog(unowned, "rank")];
    }

    function timing(view, rules) {
      const { instance } = view;
      const time = view.time ??= nativeTime(instance, dependencies);
      if (!time) return null;
      const first = time.value;
      const levels = dependencies(time).map(ref => ref.value)
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 3);
      if (levels.length !== 1) return null;
      const reduction = levels[0];
      const ranks = Object.values(instance.props.inserted).map(itemRank);
      const sum = ranks.reduce((total, rank) => total + rank, 0);
      const high = Math.max(0, ...ranks);
      const matches = factor => firstTripMinutes(sum, high, rules, reduction, factor) === first;
      const factors = countryFactors.filter(matches);
      const factor = Number.isFinite(countryFactor) && matches(countryFactor) ? countryFactor
        : factors.length === 1 ? factors[0] : null;
      return factor === null ? null : { reduction, factor };
    }

    function model(view, { weights, minimums }, { maxRank, excluded, includeMissing }, source) {
      const config = loadedConfig ?? view.config;
      if (!config) return null;
      const rules = config.expedition ?? {};
      const times = timing(view, rules);
      if (!times) return null;
      const { reduction, factor } = times;
      const foods = [];
      for (const item of source) {
        if (!usableFood(item) || excluded.has(item.item_id)) continue;
        const rank = itemRank(item);
        if (maxRank && rank > maxRank) continue;
        const amount = includeMissing ? view.instance.props.slots.length * maxTrips : stockAmount(item);
        const values = stats.map(key => itemValue(item.m_items, key, config));
        const value = score(values, weights);
        if (amount < 1 ||
            !(value > 0 || values.some((amount, i) => amount > 0 && minimums[i] > 0))) continue;
        foods.push({ item, label: foodLabel(item, view.translate), amount, value, values, rank });
      }
      return { foods, duration: (rankSum, highestRank) => firstTripMinutes(rankSum, highestRank, rules, reduction, factor),
        state: [rules, reduction, factor, foods.map(food => [food.item.id, food.label, food.amount, food.rank, food.values])] };
    }

    function send(anchor, info) {
      anchor.dispatchEvent(new CustomEvent("hako-af:expedition-result", { bubbles: true, detail: JSON.stringify(info) }));
    }

    function serialize(plan) {
      return { ...plan, foods: plan.foods.map(({ item, label, value }) => ({
        id: item.id, itemId: item.item_id, label, value
      })) };
    }

    function planInventory(plan, source, includeMissing) {
      const inventoryKey = item => includeMissing ? item.item_id : item.id;
      const counts = new Map();
      for (const { item } of plan.foods) {
        const key = inventoryKey(item);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const byKey = new Map();
      for (const item of source) {
        if (!usableFood(item)) continue;
        const key = inventoryKey(item);
        if (!counts.has(key)) continue;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(item);
      }
      const selected = [];
      const supply = [];
      for (const [key, count] of counts) {
        const rows = byKey.get(key) ?? [];
        const needed = count * plan.trips;
        const owned = rows.reduce((sum, item) => sum + stockAmount(item), 0);
        let unfilled = count;
        for (const item of rows) {
          const copies = Math.min(unfilled, Math.floor(stockAmount(item) / plan.trips));
          for (let i = 0; i < copies; i++) selected.push(item);
          unfilled -= copies;
          if (!unfilled) break;
        }
        supply.push({ id: key, owned, needed, short: Math.max(0, needed - owned), unfilled });
      }
      return { selected, supply, canApply: selected.length === plan.foods.length };
    }

    function foodLabel(item, translate) {
      const key = item.m_items?.name_key;
      const translated = key && translate(key);
      return translated && translated !== key ? translated : item.m_items?.name ?? item.item_id ?? String(item.id);
    }

    document.addEventListener("hako-af:expedition-food-list", async event => {
      const anchor = event.target;
      const view = views.get(anchor);
      if (!view) return;
      let options;
      try { options = JSON.parse(event.detail); } catch { return; }
      if (!options) return;
      const { order, includeMissing } = options;
      const request = Symbol();
      view.foodRequest = request;
      const followNative = order === "native";
      const source = foodSource(view, followNative);
      const foods = includeMissing && Array.isArray(source) ? await catalogFoods(view, source) : source;
      if (!anchor.isConnected || views.get(anchor) !== view || view.foodRequest !== request) return;
      const ordered = !followNative && Array.isArray(foods) ? sortFoodCatalog(foods, order) : foods ?? source;
      const catalog = new Map();
      for (const item of ordered ?? []) {
        if (!item?.item_id || !item.m_items || item.m_items.used === false) continue;
        catalog.set(item.item_id, { id: item.item_id, label: foodLabel(item, view.translate) });
      }
      anchor.dispatchEvent(new CustomEvent("hako-af:expedition-food-catalog", {
        bubbles: true, detail: JSON.stringify({ ready: Array.isArray(source), items: [...catalog.values()] })
      }));
    });

    document.addEventListener("hako-af:expedition-cancel", event => {
      const view = views.get(event.target);
      if (view) view.request = null;
    });

    document.addEventListener("hako-af:expedition-plan", async event => {
      const anchor = event.target;
      const view = views.get(anchor);
      if (!view || !anchor.isConnected) return;
      let input;
      try { input = JSON.parse(event.detail); } catch { return; }
      if (!Number.isSafeInteger(input?.requestId)) return;
      const request = Symbol();
      view.request = request;
      const current = () => anchor.isConnected && views.get(anchor) === view && view.request === request;
      const reply = result => { if (current()) send(anchor, { requestId: input.requestId, ...result }); };
      const criteria = objective(input);
      if (!criteria) return reply({ error: "制限時間・重み・最低値の入力を確認してください。" });
      try {
        const slots = view.instance.props.slots.length;
        const maxRank = Number.isInteger(input.maxRank) && input.maxRank > 0 ? input.maxRank : 0;
        const excluded = new Set(Array.isArray(input.excluded) ? input.excluded : []);
        const includeMissing = input.includeMissing === true;
        const owned = foodSource(view);
        const loadError = "遠征の所要時間または所持弁当を確認できませんでした。読み込み後にもう一度お試しください。";
        if (!Array.isArray(owned)) return reply({ error: loadError });
        const source = includeMissing ? await catalogFoods(view, owned) : owned;
        if (!current()) return;
        if (!source) return reply({ error: "食料の図鑑データを確認できませんでした。図鑑の食料タブを開いてから、もう一度お試しください。" });
        const data = model(view, criteria, { maxRank, excluded, includeMissing }, source);
        if (!data) return reply({ error: loadError });
        const gate = input.repeat ? repeatBudget(repeatStatus) : 0;
        const { weights, minimums } = criteria;
        const key = JSON.stringify([criteria, slots, input.minutes, gate, includeMissing, data.state]);
        let plan = view.cached?.key === key ? view.cached.plan : null;
        if (!plan && minimums.some(Boolean)) {
          const best = await runSearch(maximize(data.foods, slots, input.minutes, gate, data.duration,
            { weights, minimums: emptyValues() }), current);
          if (!current()) return;
          if (best?.foods && !best.limited && meetsMinimums(best.gains, minimums)) plan = best;
        }
        plan ??= await runSearch(maximize(data.foods, slots, input.minutes, gate, data.duration, criteria), current);
        if (!current()) return;
        if (!plan?.foods) return reply({ error: plan?.limited
          ? "探索上限までに配分が見つかりませんでした。最低値の数や制限時間を調整してお試しください。"
          : "指定時間内に条件を満たす弁当の配分はありません。" });
        view.cached = { key, plan };
        const currentStock = foodSource(view);
        if (!Array.isArray(currentStock)) return reply({ error: loadError });
        const { selected, supply, canApply } = planInventory(plan, currentStock, includeMissing);
        const result = { ...serialize(plan), slots, canApply, ...(includeMissing ? { supply } : {}) };
        const signature = JSON.stringify([criteria, input.minutes, gate, result]);
        if (!input.apply) return reply({ ...result, signature });
        if (!canApply || input.apply !== signature) return reply({ ...result, signature, changed: true });
        const { onInsert, onRemove } = view.instance.vnode.props ?? {};
        if (typeof onInsert !== "function" || typeof onRemove !== "function") {
          return reply({ error: "弁当欄に反映できませんでした。" });
        }
        const bentoSlots = view.instance.props.slots;
        for (const slot of bentoSlots) onRemove(slot.key);
        selected.forEach((item, i) => onInsert({ slotKey: bentoSlots[i].key, item }));
        reply({ ...result, signature, applied: true });
      } catch {
        reply({ error: "配分を計算またはセットできませんでした。弁当欄をご確認ください。" });
      }
    });

    return {
      foodCard(card, item, translate) {
        if (!card?.isConnected || !item?.item_id || !item.m_items || item.m_items.used === false) return;
        card.dispatchEvent(new CustomEvent("hako-af:expedition-food-card", {
          bubbles: true, detail: JSON.stringify({ id: item.item_id, label: foodLabel(item, translate) })
        }));
      },
      observePresets(owner, vnode) {
        const props = vnode.props;
        if (typeof props?.onApply !== "function") return;
        const members = props.mode === "expedition" && props["current-members"];
        const bento = props["current-item-ids"];
        if (!Array.isArray(members) && !Array.isArray(bento)) return;
        const native = presets.get(owner) ?? {};
        if (Array.isArray(members)) {
          native.members = members;
          native.applyMembers = props.onApply;
        }
        if (Array.isArray(bento)) {
          native.applyFoods = props.onApply;
          native.foods = bento;
        }
        presets.set(owner, native);
      },
      presetState: owner => presets.get(owner),
      read(name, instance, el, stores, config, categories, translate) {
        if (!instance?.props.slots?.length || !el?.isConnected) return;
        if (name === "FlexExpeditionBento" && instance.props.part === "list") {
          const owner = expeditionOwner(instance);
          if (owner) foodLists.set(owner, instance);
          return;
        }
        const anchor = name === "FlexExpeditionBento" ? el.querySelector(".fx-bento__panel")
          : el.firstElementChild?.firstElementChild;
        if (!anchor || !anchor.getClientRects().length) return;
        const previous = views.get(anchor);
        const view = previous?.instance === instance ? previous : {};
        Object.assign(view, { instance, stores, config, categories, translate, items: stores?.get('userItems') });
        views.set(anchor, view);
        anchor.dispatchEvent(new CustomEvent("hako-af:expedition-panel", {
          bubbles: true, detail: JSON.stringify({ gate: repeatBudget(repeatStatus), repeatReady: repeatStatus != null,
            foodReady: view.items?.isLoaded === true && !view.items.isLoading })
        }));
      },
      elapsed(el, store) {
        const expedition = store?.expedition;
        if (!expedition || !el?.isConnected || !el.getClientRects().length) return;
        const start = Date.parse(expedition.started_at);
        const end = Date.parse(expedition.completes_at);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return;
        const minutes = Math.max(0, Math.floor((Math.min(Date.now(), end) - start) / 60000));
        el.dispatchEvent(new CustomEvent("hako-af:expedition-elapsed", { bubbles: true, detail: minutes }));
      }
    };
  }

  function expeditionOwner(instance) {
    for (let parent = instance.parent; parent; parent = parent.parent) {
      if (parent.type?.__name === "FlexExpeditionPage" || parent.type?.__name === "ExpeditionModal") return parent;
    }
    return instance.parent;
  }

  globalThis.hakoAfExpeditionMain = { start };
})();
