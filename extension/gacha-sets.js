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
    const panels = new WeakMap();
    const roots = new WeakMap();
    const notify = () => document.dispatchEvent(new Event("hako-af:grid-rendered"));
    let retained;
    let staging;

    function setup(panel, store, power, source) {
      const refs = dependencies(panel.effect);
      const candidates = refs.find(ref => Array.isArray(ref._value) && (!source || ref._value === source) &&
        /\.getSortedItems\(["']artifact-gacha["']\)/.test(String(ref.fn)) && typeof ref.dep?.trigger === "function");
      if (!candidates) return;
      const classic = panel.type?.__name === "ArtifactGachaPanel";
      const cartItems = classic ? refs.find(ref => Array.isArray(ref._value) &&
        /Array\.from\([$\w]+\.value\)\.map\([$\w]+=>[$\w]+(?:\.value\.get|\.getArtifactById)\([$\w]+\)\)\.filter\(/.test(String(ref.fn))) : null;
      const state = { classic, store, candidates, cartItems, power, message: "" };
      if (!readThrough(candidates, original => {
        const plan = currentPlan();
        if (!plan?.enabled || !Array.isArray(original)) {
          state.projection = null;
          return original;
        }
        if (state.projection?.original !== original || state.projection.plan !== plan) {
          const report = plan.error
            ? { items: [], total: original.length, matched: 0, unknown: 0, metrics: [] }
            : project(original, plan, state.power);
          state.projection = { original, plan, report };
        }
        return state.projection.report.items;
      })) return;
      panels.set(panel, state);
      if (currentPlan()?.enabled) candidates.dep.trigger();
      return state;
    }

    function controls(state) {
      const root = state.root;
      const option = root?.querySelector(state.classic ? "#agacha-auto-set" : ".fx-agacha__auto select");
      const auto = state.classic ? option?.parentElement?.parentElement?.parentElement : option?.closest(".fx-agacha__auto");
      const target = Number(option?.value);
      const [, cart, limit] = root?.querySelector(".fx-agacha__dock-status .fx-number")?.textContent
        .match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/) ?? [];
      const cartMode = state.classic || root?.querySelector('[aria-labelledby="fx-agacha-tap-label"] [aria-pressed="true"]')
        ?.textContent.trim() === "カートに出し入れ";
      return { root, auto, target, cart: state.classic ? state.cartItems?.value.length : Number(cart?.replaceAll(",", "")),
        limit: state.classic ? 5000 : Number(limit?.replaceAll(",", "")),
        ready: !!(root?.isConnected && option && !option.disabled && state.store?.isArtifactsLoaded && cartMode &&
          (state.classic ? state.cartItems && state.presets?.isReady && state.grid?.vnode.el?.isConnected && state.powerReady
            : typeof state.grid?.props.dim === "function")) };
    }

    function excludedItems(state) {
      return state.classic
        ? new Set([...(state.cartItems?.value ?? []).map(item => item.id),
          ...(state.presets?.presets ?? []).flatMap(preset => preset.artifactIds ?? [])])
        : new Set();
    }

    function fits(state, item, excluded) {
      return item?.id != null && !item._artifact?.is_equipped && !item._artifact?.is_favorite &&
        !excluded.has(item.id) && (state.classic || !state.grid.props.dim(item)) &&
        !state.store?.isArtifactFavoriteUpdating?.(item.id);
    }

    function eligible(state, multiple) {
      const excluded = excludedItems(state);
      return state.candidates.value.filter(item => fits(state, item, excluded) &&
        (!multiple || !(Number(item.m_items?.rank) >= 11)));
    }

    function inCart(state, item) {
      return state.classic ? state.cartItems.value.some(row => row.id === item.id) : state.grid.props.dim(item);
    }

    function toggleCart(state, item) {
      if (!state.classic) return state.grid.vnode.props?.onSelect?.(item);
      // The classic grid receives the game's own cart-click handler in its scoped slot.
      const slot = state.grid.vnode.children?.default?.({ item });
      const pending = Array.isArray(slot) ? [...slot] : [slot];
      while (pending.length) {
        const vnode = pending.pop();
        if (vnode?.props?.item === item && typeof vnode.props.onClick === "function") {
          vnode.props.onClick();
          return;
        }
        if (Array.isArray(vnode?.children)) pending.push(...vnode.children);
      }
    }

    function keyFor(target) {
      const plan = currentPlan();
      return JSON.stringify(plan?.filterActive ? [target, plan.root, plan.useForecast] : [target]);
    }

    async function useSets(state, pulls) {
      if (state.busy || staging) return;
      const initial = controls(state);
      const fail = text => {
        state.message = text;
        state.messageKey = keyFor(initial.target);
        notify();
      };
      if (!(initial.target > 0)) return fail("「合計パワー以上」の条件を選んでください。");
      if (!initial.ready || !Number.isSafeInteger(initial.cart) || !(initial.limit >= setSize)) {
        return fail("投入候補の読み込みを待ち、カートに出し入れできる状態でお試しください。");
      }
      if (initial.cart % setSize) return fail("途中の組を完成させるか、カートを空にしてください。");
      const cartLimit = pulls === 1 ? initial.cart + setSize : pulls * setSize;
      const limit = Math.floor((Math.min(cartLimit, initial.limit) - initial.cart) / setSize);
      const requested = initial.cart / setSize + limit;
      if (limit <= 0) return fail("指定の連数までセット済みです。");
      const key = keyFor(initial.target);
      if (currentPlan()?.error) return fail("拡張フィルタの条件を確認してください。");
      const valid = () => !state.cancelRequested && initial.root.isConnected && state.root === initial.root &&
        state.root?.querySelector('[data-ha4="gacha-use-sets"]')?.checked &&
        !currentPlan()?.error && keyFor(controls(state).target) === key;
      state.busy = true;
      state.cancelRequested = false;
      state.messageKey = key;
      try {
        if (retained?.key !== key || Date.now() >= retained.until) {
          state.message = "手持ちから組み合わせを計算中…";
          notify();
          await pause();
          const deadline = performance.now() + 2000;
          const input = eligible(state, true).map(item => ({ id: item.id, power: state.power(item) }))
            .filter(item => Number.isFinite(item.power) && item.power >= 0);
          const result = await calculate(input, initial.target, deadline, valid);
          if (!valid()) return;
          retained = { ...result, key, until: Date.now() + 30 * 60_000 };
        }
        if (staging || !valid() || !controls(state).ready || controls(state).cart !== initial.cart) return;
        const input = new Map(eligible(state, true).map(item => [item.id, item]));
        const plan = retained;
        const groups = plan.groups.map(group => group.map(id => input.get(id))).filter(group => group.every(Boolean));
        const maximum = plan.groups.length === plan.upper
          ? `最大 ${format.format(plan.upper)}連` : `${format.format(plan.groups.length)}連を計画（理論上限 ${format.format(plan.upper)}連）`;
        const progress = added => `${maximum} · ${format.format(initial.cart / setSize + added)} / ${format.format(requested)}連をセット中…`;
        state.message = progress(0);
        notify();
        staging = initial.root;
        let added = 0;
        let interrupted = false;
        let slice = performance.now();
        let notified = slice;
        let excluded = excludedItems(state);
        for (const group of groups) {
          if (added >= limit) break;
          if (!valid()) { interrupted = true;break; }
          if (performance.now() - slice >= 8) {
            state.message = progress(added);
            if (performance.now() - notified >= 100) { notify();notified = performance.now(); }
            await pause();
            slice = performance.now();
            if (!valid() || !controls(state).ready) { interrupted = true;break; }
            excluded = excludedItems(state);
          }
          if (!group.every(item => fits(state, item, excluded)) ||
              group.reduce((total, item) => total + state.power(item), 0) < initial.target) continue;
          const selected = [];
          try {
            for (const item of group) {
              try { toggleCart(state, item); } finally {
                if (inCart(state, item)) selected.push(item);
              }
              if (selected.at(-1) !== item) break;
            }
          } catch {
            interrupted = true;
          }
          if (selected.length !== setSize) {
            for (const item of selected) toggleCart(state, item);
            interrupted = true;
            break;
          }
          added++;
          if (interrupted) break;
        }
        state.message = `${maximum} · ${added ? `${format.format(added)}連をセット、計画に残り ${format.format(groups.length - added)}連` : "追加できる組はありません"}`;
        if (pulls > 1) state.message += ` · カート合計 ${format.format(initial.cart / setSize + added)} / ${format.format(requested)}連`;
        if (state.cancelRequested) state.message += " · 中止しました";
        else if (interrupted) state.message += " · カートへのセットが途中で止まりました";
        else if (added < limit) state.message += " · 条件を満たす追加候補が足りず、指定数に届きませんでした";
      } finally {
        if (staging === initial.root) staging = null;
        if (state.message.endsWith("中…")) state.message = state.cancelRequested ? "拡張セットを中止しました。" : "条件が変わったためセットを中止しました。";
        state.busy = false;
        state.cancelRequested = false;
        notify();
      }
    }

    document.addEventListener("hako-af:gacha-reset-plan", event => {
      const state = roots.get(event.target);
      if (!state || state.busy) return;
      retained = null;
      state.message = "次のセット時に組み合わせを計算します。";
      notify();
    });

    document.addEventListener("hako-af:gacha-cancel-sets", event => {
      const state = roots.get(event.target);
      if (!state?.busy) return;
      state.cancelRequested = true;
      notify();
    });

    document.addEventListener("click", event => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      if (staging?.contains(event.target)) {
        if (event.target.closest('[data-ha4="gacha-cancel-sets"]')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const button = event.target.closest("button");
      const state = button && roots.get(button.closest("[data-ha4-gacha-root]"));
      if (!state?.root.querySelector('[data-ha4="gacha-use-sets"]')?.checked ||
          !controls(state).auto?.contains(button)) return;
      const label = button.textContent.trim();
      const match = /^(10|100|500|1000)連(?:セット|まで)$/.exec(label);
      const pulls = match ? Number(match[1]) : /^(?:1セット|セット)$/.test(label) ? 1 : 0;
      if (!pulls) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void useSets(state, pulls).catch(() => {
        state.message = "拡張セットを完了できませんでした。カートの内容を確認してください。";
        notify();
      });
    }, true);

    function publish(state) {
      const ui = controls(state);
      if (!ui.auto) return;
      if (!ui.root.hasAttribute("data-ha4-gacha-root")) ui.root.setAttribute("data-ha4-gacha-root", "");
      roots.set(ui.root, state);
      roots.set(ui.auto, state);
      const items = state.candidates.value;
      const report = state.projection?.report ?? { total: items.length, matched: 0, unknown: 0, metrics: [] };
      if (!state.busy && state.store?.isArtifactsLoaded && (state.classic ? state.presets?.isReady && state.cartItems
        : typeof state.grid?.props.dim === "function")) {
        let total = 0;
        let multiple = 0;
        const excluded = excludedItems(state);
        for (const item of items) {
          if (!fits(state, item, excluded)) continue;
          total++;
          if (!(Number(item.m_items?.rank) >= 11)) multiple++;
        }
        state.capacity = { total, multiple, cart: Number.isFinite(ui.cart) ? ui.cart : 0 };
      }
      state.grid?.vnode.el?.dispatchEvent(new CustomEvent("hako-af:grid", { bubbles: true,
        detail: JSON.stringify({ scope: "gacha", report }) }));
      ui.auto.dispatchEvent(new CustomEvent("hako-af:gacha-controls", { bubbles: true, detail: JSON.stringify({
        capacity: state.capacity, busy: state.busy || false, canRecalculate: retained?.key === keyFor(ui.target),
        message: state.busy || state.messageKey === keyFor(ui.target) ? state.message : "",
        target: ui.target > 0 ? ui.target : null, ready: ui.ready
      }) }));
    }

    return {
      readClassic(panel, el, store, presets, power, powerReady) {
        if (!panel.props.active || !el.querySelector("#agacha-auto-set")) return;
        const state = panels.get(panel) ?? setup(panel, store, power);
        if (!state) return;
        state.root = el;
        state.presets = presets;
        if (state.powerReady !== powerReady) {
          state.powerReady = powerReady;
          state.projection = null;
          if (currentPlan()?.enabled) state.candidates.dep.trigger();
        }
        if (!state.grid?.vnode.el?.isConnected) publish(state);
      },
      read(grid, el, store, classic) {
        let panel = grid.parent;
        while (panel && panel.type?.__name !== (classic ? "ArtifactGachaPanel" : "FlexArtifactGacha")) panel = panel.parent;
        if (!panel) return;
        const state = panels.get(panel) ?? (!classic && typeof grid.props?.power === "function"
          ? setup(panel, store, grid.props.power, grid.vnode.props?.items) : null);
        if (!state) return;
        state.root = classic ? state.root : el.closest(".fx-agacha");
        state.grid = grid;
        publish(state);
      },
      invalidate(instance) { panels.get(instance)?.candidates.dep.trigger(); }
    };
  }

  globalThis.hakoAfGachaSets = { start };
})();
