(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const setSize = 5;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  const format = new Intl.NumberFormat("ja-JP");
  const sum = items => items.reduce((total, item) => total + item.power, 0);

  function balanced(items, count, target, alternate) {
    const groups = Array.from({ length: count }, (_, index) => ({ items: [items[index]], power: items[index].power }));
    for (let row = 1; row < setSize; row++) {
      groups.sort((a, b) => a.power - b.power);
      for (let index = 0; index < count; index++) {
        const offset = alternate && row % 2 === 0 ? count - index - 1 : index;
        const item = items[row * count + offset];
        groups[index].items.push(item);
        groups[index].power += item.power;
      }
    }
    return groups.filter(group => group.power >= target).map(group => group.items);
  }

  function* exactSets(items, target) {
    const failed = new Set();
    const groups = [];
    const setCount = items.length / setSize;
    let work = 0;
    function* partition(mask, count, power) {
      if (!mask) return true;
      if (power < count * target || failed.has(mask)) return false;
      const first = 31 - Math.clz32(mask & -mask);
      const rest = [];
      for (let index = first + 1; index < items.length; index++) {
        if (mask & (1 << index)) rest.push(index);
      }
      for (let a = 0; a < rest.length - 3; a++) {
        for (let b = a + 1; b < rest.length - 2; b++) {
          for (let c = b + 1; c < rest.length - 1; c++) {
            for (let d = c + 1; d < rest.length; d++) {
              if (++work % 512 === 0) yield;
              const indexes = [first, rest[a], rest[b], rest[c], rest[d]];
              const group = indexes.map(index => items[index]);
              const groupPower = sum(group);
              if (groupPower < target) continue;
              const remaining = indexes.reduce((value, index) => value ^ (1 << index), mask);
              groups.push(group);
              if (yield* partition(remaining, count - 1, power - groupPower)) return true;
              groups.pop();
            }
          }
        }
      }
      failed.add(mask);
      return false;
    }
    return (yield* partition((1 << items.length) - 1, setCount, sum(items))) ? groups : null;
  }

  async function calculate(candidates, target, deadline, valid) {
    const items = candidates.sort((a, b) => b.power - a.power);
    let running = 0;
    let upper = 0;
    for (let index = 0; index < items.length; index++) {
      running += items[index].power;
      if ((index + 1) % setSize !== 0) continue;
      const groups = (index + 1) / setSize;
      if (running < groups * target) break;
      upper = groups;
    }

    let best = [];
    let low = 1;
    let high = upper;
    let next = upper;
    while (low <= high && next && performance.now() < deadline && valid()) {
      const first = balanced(items, next, target, false);
      if (first.length > best.length) best = first;
      if (best.length === upper) break;
      const second = balanced(items, next, target, true);
      if (second.length > best.length) best = second;
      if (best.length === next) low = next + 1;
      else high = next - 1;
      low = Math.max(low, best.length + 1);
      next = Math.floor((low + high) / 2);
      await pause();
    }

    // If k groups are possible, using the strongest 5k items is also possible.
    // Search every such partition for small candidate sets until the shared deadline.
    if (upper * setSize <= 25) {
      while (upper > best.length && valid() && performance.now() < deadline) {
        const search = exactSets(items.slice(0, upper * setSize), target);
        let progress = search.next();
        let slice = performance.now();
        while (!progress.done && valid() && performance.now() < deadline) {
          if (performance.now() - slice >= 8) {
            await pause();
            slice = performance.now();
          }
          progress = search.next();
        }
        if (!progress.done) break;
        if (progress.value) best = progress.value;
        else upper--;
      }
    }
    return { groups: best.map(group => group.map(item => item.id)), upper };
  }

  function start({ dependencies, readThrough, currentPlan, project }) {
    const grids = new WeakMap();
    const roots = new WeakMap();
    const notify = () => document.dispatchEvent(new Event("hako-af:grid-rendered"));
    let retained;
    let staging;

    function setup(grid, store) {
      let parent = grid.parent;
      while (parent && parent.type?.__name !== "FlexArtifactGacha") parent = parent.parent;
      const source = grid.vnode.props?.items;
      const candidates = dependencies(parent?.effect).find(ref => ref._value === source &&
        /\.getSortedItems\(["']artifact-gacha["']\)/.test(String(ref.fn)) && typeof ref.dep?.trigger === "function");
      if (!candidates || !Array.isArray(source) || typeof grid.props?.power !== "function") return;
      const state = { grid, store, candidates, message: "" };
      if (!readThrough(candidates, original => {
        const plan = currentPlan();
        if (!plan?.enabled || !Array.isArray(original)) {
          state.projection = null;
          return original;
        }
        if (state.projection?.original !== original || state.projection.plan !== plan) {
          const report = plan.error
            ? { items: [], total: original.length, matched: 0, unknown: 0, metrics: [] }
            : project(original, plan, grid.props.power);
          state.projection = { original, plan, report };
        }
        return state.projection.report.items;
      })) return;
      grids.set(grid, state);
      if (currentPlan()?.enabled) candidates.dep.trigger();
      return state;
    }

    function controls(state) {
      const root = state.el.closest(".fx-agacha");
      const auto = root?.querySelector(".fx-agacha__auto");
      const option = auto?.querySelector("select");
      const target = Number(option?.value);
      const [, cart, limit] = root?.querySelector(".fx-agacha__dock-status .fx-number")?.textContent
        .match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/) ?? [];
      const cartMode = root?.querySelector('[aria-labelledby="fx-agacha-tap-label"] [aria-pressed="true"]')
        ?.textContent.trim() === "カートに出し入れ";
      return { root, auto, target, cart: Number(cart?.replaceAll(",", "")), limit: Number(limit?.replaceAll(",", "")),
        ready: !!(root && option && !option.disabled && state.store?.isArtifactsLoaded && cartMode) };
    }

    function fits(state, item) {
      return item?.id != null && !item._artifact?.is_equipped && !item._artifact?.is_favorite &&
        !state.grid.props.dim(item) && !state.store?.isArtifactFavoriteUpdating?.(item.id);
    }

    function eligible(state, multiple) {
      return state.candidates.value.filter(item => fits(state, item) &&
        (!multiple || !(Number(item.m_items?.rank) >= 11)));
    }

    function keyFor(target) {
      const plan = currentPlan();
      return JSON.stringify(plan?.filterActive ? [target, plan.root, plan.useForecast] : [target]);
    }

    async function useSets(state, recalculate) {
      if (state.busy || staging || !state.el.isConnected || typeof state.grid.props.dim !== "function") return;
      const initial = controls(state);
      if (!initial.ready || initial.cart !== 0 || !(initial.target > 0) || !(initial.limit >= setSize)) return;
      const key = keyFor(initial.target);
      if (currentPlan()?.error) return;
      const valid = () => state.el.isConnected && !currentPlan()?.error && keyFor(controls(state).target) === key;
      state.busy = true;
      state.messageKey = key;
      try {
        if (recalculate || retained?.key !== key || Date.now() >= retained.until) {
          state.message = "手持ちから組み合わせを計算中…";
          notify();
          await pause();
          const deadline = performance.now() + 2000;
          const input = eligible(state, true).map(item => ({ id: item.id, power: Number(state.grid.props.power(item)) }))
            .filter(item => Number.isFinite(item.power) && item.power >= 0);
          const result = await calculate(input, initial.target, deadline, valid);
          if (!valid()) return;
          retained = { ...result, key, until: Date.now() + 30 * 60_000 };
        }
        if (staging || !valid() || !controls(state).ready || controls(state).cart !== 0) return;
        const input = new Map(eligible(state, true).map(item => [item.id, item]));
        const select = state.grid.vnode.props?.onSelect;
        if (typeof select !== "function") return;
        const plan = retained;
        const groups = plan.groups.map(group => group.map(id => input.get(id))).filter(group => group.every(Boolean));
        const maximum = plan.groups.length === plan.upper
          ? `最大 ${format.format(plan.upper)}連` : `${format.format(plan.groups.length)}連を計画（理論上限 ${format.format(plan.upper)}連）`;
        state.message = `${maximum} · カートにセット中…`;
        notify();
        staging = initial.root;
        let added = 0;
        let interrupted = false;
        let slice = performance.now();
        const stepDeadline = slice + 2000;
        for (const group of groups) {
          if (added >= Math.floor(initial.limit / setSize) || performance.now() >= stepDeadline || !valid()) break;
          if (performance.now() - slice >= 8) {
            await pause();
            slice = performance.now();
            if (!valid() || !controls(state).ready) break;
          }
          if (!group.every(item => fits(state, item)) ||
              group.reduce((total, item) => total + Number(state.grid.props.power(item)), 0) < initial.target) continue;
          const selected = [];
          try {
            for (const item of group) {
              try { select(item); } finally {
                if (state.grid.props.dim(item)) selected.push(item);
              }
              if (selected.at(-1) !== item) break;
            }
          } catch {
            interrupted = true;
          }
          if (selected.length !== setSize) {
            for (const item of selected) select(item);
            interrupted = true;
            break;
          }
          added++;
          if (interrupted) break;
        }
        state.message = `${maximum} · ${added ? `${format.format(added)}連をセット、計画に残り ${format.format(groups.length - added)}連` : "追加できる組はありません"}`;
        if (interrupted) state.message += " · カートへのセットが途中で止まりました";
      } finally {
        if (staging === initial.root) staging = null;
        if (state.message.endsWith("中…")) state.message = "";
        state.busy = false;
        notify();
      }
    }

    document.addEventListener("click", event => {
      if (!staging?.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    document.addEventListener("hako-af:gacha-set", event => {
      const state = roots.get(event.target);
      if (state) void useSets(state, event.detail === "recalculate").catch(() => {
        state.message = "拡張セットを完了できませんでした。カートの内容を確認してください。";
        notify();
      });
    });

    return {
      read(grid, el, store) {
        const state = grids.get(grid) ?? setup(grid, store);
        if (!state) return;
        state.el = el;
        roots.set(el, state);
        const ui = controls(state);
        if (!ui.auto) return;
        const items = state.candidates.value;
        const report = state.projection?.report ?? { total: items.length, matched: 0, unknown: 0, metrics: [] };
        const ready = !state.busy && ui.ready && ui.cart === 0 && ui.target > 0 && !currentPlan()?.error;
        if (!state.busy && store?.isArtifactsLoaded && typeof grid.props.dim === "function") {
          let total = 0;
          let multiple = 0;
          for (const item of items) {
            if (!fits(state, item)) continue;
            total++;
            if (!(Number(item.m_items?.rank) >= 11)) multiple++;
          }
          state.capacity = { total, multiple, cart: Number.isFinite(ui.cart) ? ui.cart : 0 };
        }
        el.dispatchEvent(new CustomEvent("hako-af:grid", { bubbles: true, detail: JSON.stringify({
          scope: "gacha", report, gacha: {
            capacity: state.capacity, ready, busy: state.busy || false, canRecalculate: retained?.key === keyFor(ui.target),
            message: state.busy || state.messageKey === keyFor(ui.target) ? state.message : "",
            target: ui.target > 0 ? ui.target : null, cart: ui.cart, cartMode: ui.ready
          }
        }) }));
      },
      invalidate(grid) { grids.get(grid)?.candidates.dep.trigger(); }
    };
  }

  globalThis.hakoAfGachaSets = { start };
})();
