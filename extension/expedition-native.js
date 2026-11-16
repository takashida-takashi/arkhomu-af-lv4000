(() => {
  "use strict";

  function start(readThrough, getPreset, observePreset) {
    const forms = new WeakMap();
    const boundStores = new WeakSet();
    const anchors = new WeakMap();
    let rendering;

    function prepareSlot(state, slot) {
      if (state.wrapped.has(slot)) return slot;
      const wrapped = new Proxy(slot, {
        apply(original, context, args) {
          if (!state.editing || !state.store.expedition) return Reflect.apply(original, context, args);
          const previous = rendering;
          rendering = state;
          try { return Reflect.apply(original, context, args); }
          finally { rendering = previous; }
        }
      });
      state.wrapped.add(wrapped);
      return wrapped;
    }

    function bindOwnerRender(state) {
      const render = state.owner.render;
      state.owner.render = function (...args) {
        const tree = Reflect.apply(render, this, args);
        const host = state.host;
        const pending = [tree];
        while (pending.length) {
          const node = pending.pop();
          if (typeof node?.props?.onApply === "function") observePreset(state.owner, node);
          if (node?.type === host.type && node.props?.size === host.vnode.props?.size &&
              typeof node.children?.default === "function") {
            node.children.default = prepareSlot(state, node.children.default);
          }
          if (Array.isArray(node?.children)) pending.push(...node.children);
          else if (Array.isArray(node)) pending.push(...node);
        }
        return tree;
      };
    }

    function observe(owner, host, vnode, stores) {
      if (host?.parent !== owner || typeof host.slots?.default !== "function") return;
      const name = host.type?.__name;
      if (name !== "FlexShell" && (name !== "BaseModal" || vnode.props?.size !== "2xl")) return;
      const store = stores?.get("expedition");
      if (!store) return;
      if (!boundStores.has(store)) {
        const ref = store.__v_raw?.isActive;
        if (!ref || typeof store.start !== "function" ||
            !readThrough(ref, active => rendering?.store === store ? false : active)) return;
        const nativeStart = store.start;
        store.start = function (...args) {
          if (store.expedition) throw new Error("遠征中は出発できません。");
          return Reflect.apply(nativeStart, this, args);
        };
        boundStores.add(store);
      }
      let state = forms.get(owner);
      if (!state) {
        state = { owner, store, stores, wrapped: new WeakSet() };
        forms.set(owner, state);
        bindOwnerRender(state);
      }
      state.host = host;
      // Use the game's existing selection stages without changing the expedition store outside this slot.
      host.slots.default = prepareSlot(state, host.slots.default);
    }

    function draftKey(state) {
      const profile = state.stores.get("userProfile")?.profile;
      const account = [profile?.id, state.store.expedition?.user_id].find(id => typeof id === "string" && id);
      return account && `hakoAf4000:expedition-draft:${account}`;
    }

    function load(state) {
      try {
        const key = draftKey(state);
        return key ? JSON.parse(localStorage.getItem(key)) : null;
      } catch { return null; }
    }

    function selection(state) {
      const preset = getPreset(state.owner);
      if (!Array.isArray(preset?.members) || !Array.isArray(preset?.foods)) return null;
      return { members: preset.members.map(member => member?.user_monster_id ?? null), foods: [...preset.foods] };
    }

    function populated(draft) {
      return draft?.members?.some?.(Boolean) || draft?.foods?.some?.(Boolean);
    }

    function save(state) {
      const draft = selection(state);
      const key = draftKey(state);
      if (!draft || !key) return;
      const value = JSON.stringify(draft);
      if (state.lastSaved === value) return;
      try {
        localStorage.setItem(key, value);
        state.lastSaved = value;
      } catch { /* The native selection is still available in this tab. */ }
    }

    function restore(state) {
      const draft = load(state);
      if (!populated(draft)) return true;
      const preset = getPreset(state.owner);
      const items = state.stores.get("userItems");
      const monsters = state.stores.get("userMonsters");
      if (!items?.isLoaded || items.isLoading || !monsters?.isLoaded || monsters.isLoading ||
          !preset?.applyMembers || !preset.applyFoods) return false;
      const members = Array.isArray(draft.members) ? draft.members.flatMap((id, i) => typeof id === "string" && id
        ? [{ user_monster_id: id, slot_index: i + 1 }] : []) : [];
      const foods = Array.isArray(draft.foods) ? draft.foods.filter(id => typeof id === "string" && id) : [];
      if (members.length) preset.applyMembers({ mode: "expedition", members });
      if (foods.length) preset.applyFoods({ itemIds: foods });
      return true;
    }

    function sync(owner) {
      const state = forms.get(owner);
      if (!state?.editing) return;
      if (!state.store.expedition) {
        state.editing = false;
        return;
      }
      if (!state.initialized) {
        const current = selection(state);
        if (!current || !draftKey(state)) return;
        if (!populated(current) && populated(load(state))) {
          state.initialized = restore(state);
          return;
        }
        state.initialized = true;
      }
      save(state);
    }

    function read(anchor, owner, phase) {
      const state = forms.get(owner);
      if (!state || !anchor?.isConnected || !anchor.getClientRects().length) return;
      if (phase === "editing" && (!state.editing || !state.store.expedition)) {
        if (!anchor.hasAttribute("data-ha4-expedition-preparing")) return;
        for (const button of anchor.querySelectorAll("[data-ha4-expedition-depart-lock]")) {
          button.removeAttribute("aria-disabled");
          button.removeAttribute("data-ha4-expedition-depart-lock");
        }
        phase = "normal";
      }
      if (phase === "ready" && state.store.expedition) return;
      if (phase === "editing") {
        for (const button of anchor.querySelectorAll("button")) {
          if (button.textContent.trim() !== "遠征に出発する") continue;
          button.setAttribute("aria-disabled", "true");
          button.setAttribute("data-ha4-expedition-depart-lock", "");
        }
      }
      anchors.set(anchor, state);
      anchor.dispatchEvent(new CustomEvent("hako-af:expedition-preparation", {
        bubbles: true, detail: JSON.stringify({ phase, saved: phase === "ready" && !!populated(load(state)) })
      }));
    }

    document.addEventListener("click", event => {
      const button = event.target?.closest?.("button");
      const root = button?.closest("[data-ha4-expedition-preparing]");
      if (!root || !anchors.get(root)?.store.expedition || button.textContent.trim() !== "遠征に出発する") return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    document.addEventListener("hako-af:expedition-preparation-toggle", event => {
      const state = anchors.get(event.target);
      if (!state?.store.expedition) return;
      if (state.editing && state.initialized) save(state);
      state.editing = !state.editing;
      state.host.proxy?.$forceUpdate();
    });

    document.addEventListener("hako-af:expedition-preparation-restore", event => {
      const state = anchors.get(event.target);
      if (!state || state.store.expedition) return;
      const message = restore(state) ? "保存したメンバーと弁当を読み込みました。" : "所持データを読み込んでいます。";
      event.target.dispatchEvent(new CustomEvent("hako-af:expedition-preparation-notice", { bubbles: true, detail: message }));
    });

    return { observe, read, sync };
  }

  globalThis.hakoAfExpeditionNative = { start };
})();
