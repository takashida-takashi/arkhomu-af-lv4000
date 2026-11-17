(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const listNames = new Set(["MonsterList", "FlexMonsterList"]);
  const keyFor = owner => "hakoAf4000:monster-boxes:" + owner;
  const monsterId = monster => monster?.user_monster_id ?? monster?.id;
  const baseRank = monster => Number(monster.m_monsters?.rank ?? monster.rank);

  function element(tag, kind, text) {
    const el = document.createElement(tag);
    el.dataset.ha4 = kind;
    if (text) el.textContent = text;
    return el;
  }

  function button(kind, text, action) {
    const el = element("button", kind, text);
    el.type = "button";
    el.addEventListener("click", event => {
      event.stopPropagation();
      action();
    });
    return el;
  }

  function readAccount(owner) {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(keyFor(owner))); } catch { /* Start with empty boxes. */ }
    const boxes = new Map(Array.isArray(saved?.boxes) ? saved.boxes.filter(entry =>
      Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") : []);
    const members = new Map();
    for (const [id, ids] of Object.entries(saved?.members ?? {})) {
      const valid = Array.isArray(ids) ? ids.filter(box => boxes.has(box)) : [];
      if (valid.length) members.set(id, new Set(valid));
    }
    return { owner, boxes, members };
  }

  function start({ dependencies, readThrough }) {
    const bindings = new WeakMap();
    const roots = new WeakMap();
    const lists = new Set();
    let enabled = true;
    let account;
    let ownRows;
    let ownedIds;
    let dialog;
    const uiSelector = '[data-ha4="monster-box-toolbar"],[data-ha4="monster-box-mark"],[data-ha4="monster-rank-field"]';

    function save() {
      try {
        localStorage.setItem(keyFor(account.owner), JSON.stringify({ boxes: [...account.boxes],
          members: Object.fromEntries([...account.members].map(([id, boxes]) => [id, [...boxes]])) }));
      } catch { /* Retain the changes in this tab. */ }
    }

    function changeList(state, resetPage = true) {
      state.cache = null;
      state.sorted.dep.trigger();
      if (resetPage && state.pager?.el?.isConnected && state.pager.props.page > 1) state.pager.props.onChange(1);
      if (resetPage) state.el.querySelector(".list-scrollbar,.fx-mlist__body,.virtual-item-grid")?.scrollTo(0, 0);
      state.instance.proxy?.$forceUpdate();
    }

    function refreshBoxes() {
      for (const state of lists) {
        if (state.owner !== account.owner) continue;
        const box = state.box;
        if (box && !account.boxes.has(box)) state.box = "";
        if (box) changeList(state, box !== state.box);
        renderToolbar(state);
      }
      document.dispatchEvent(new Event("hako-af:grid-rendered"));
    }

    function saveBoxes() {
      save();
      refreshBoxes();
    }

    function openDialog(title) {
      if (dialog?.open) dialog.close();
      const panel = dialog = element("dialog", "monster-box-dialog");
      panel.setAttribute("aria-label", title);
      const header = element("header", "monster-box-dialog-header");
      header.append(element("h2", "monster-box-title", title),
        button("monster-box-button", "閉じる", () => panel.close()));
      const body = element("div", "monster-box-dialog-body");
      panel.append(header, body);
      panel.addEventListener("close", () => panel.remove(), { once: true });
      document.body.append(panel);
      panel.showModal();
      return body;
    }

    function manageBoxes() {
      const body = openDialog("ボックス管理");
      const status = element("p", "monster-box-status");
      status.setAttribute("role", "status");
      const create = element("form", "monster-box-edit");
      const input = element("input", "monster-box-name");
      input.required = true;
      input.maxLength = 32;
      input.placeholder = "新しいボックス名";
      input.setAttribute("aria-label", input.placeholder);
      const add = element("button", "monster-box-button", "追加");
      create.append(input, add);
      const entries = element("div", "monster-box-entries");
      body.append(create, entries, status);
      const validName = (name, id) => {
        if (!name) return "ボックス名を入力してください。";
        if (name === "すべて" || [...account.boxes].some(([key, value]) => key !== id && value === name)) {
          return "別のボックス名を入力してください。";
        }
        return "";
      };
      const render = () => {
        entries.replaceChildren(...[...account.boxes].map(([id, name]) => {
          const row = element("form", "monster-box-edit");
          const field = element("input", "monster-box-name");
          field.value = name;
          field.required = true;
          field.maxLength = 32;
          field.setAttribute("aria-label", name + "のボックス名");
          row.append(field, element("button", "monster-box-button", "名前を保存"),
            button("monster-box-button", "削除", () => {
              account.boxes.delete(id);
              for (const [monster, boxes] of account.members) {
                if (boxes.delete(id) && !boxes.size) account.members.delete(monster);
              }
              saveBoxes();
              render();
              status.textContent = `「${name}」を削除しました。`;
            }));
          row.addEventListener("submit", event => {
            event.preventDefault();
            const next = field.value.trim();
            status.textContent = validName(next, id);
            if (status.textContent) return;
            account.boxes.set(id, next);
            saveBoxes();
            render();
            status.textContent = `「${next}」に変更しました。`;
          });
          return row;
        }));
      };
      create.addEventListener("submit", event => {
        event.preventDefault();
        const name = input.value.trim();
        status.textContent = validName(name);
        if (status.textContent) return;
        account.boxes.set(crypto.randomUUID(), name);
        saveBoxes();
        input.value = "";
        render();
        status.textContent = `「${name}」を追加しました。`;
      });
      render();
      input.focus();
    }

    function assignBoxes(id) {
      const body = openDialog("入れるボックスを選択");
      for (const [box, name] of account.boxes) {
        const row = element("label", "monster-box-choice");
        const input = element("input", "monster-box-check");
        input.type = "checkbox";
        input.checked = account.members.get(id)?.has(box) ?? false;
        input.addEventListener("change", () => {
          const marked = account.members.get(id) ?? new Set();
          if (input.checked) marked.add(box);
          else marked.delete(box);
          if (marked.size) account.members.set(id, marked);
          else account.members.delete(id);
          saveBoxes();
        });
        row.append(input, name);
        body.append(row);
      }
    }

    function renderToolbar(state) {
      const signature = JSON.stringify([...account.boxes]);
      if (state.signature !== signature) {
        state.signature = signature;
        const tabs = [["", "すべて"], ...account.boxes];
        state.tabs.replaceChildren(...tabs.map(([id, name]) => {
          const tab = button("monster-box-tab", name, () => {
            if (state.box === id) return;
            state.box = id;
            changeList(state);
            renderToolbar(state);
          });
          tab.dataset.box = id;
          return tab;
        }));
      }
      for (const tab of state.tabs.children) {
        const pressed = String(tab.dataset.box === state.box);
        if (tab.getAttribute("aria-pressed") !== pressed) tab.setAttribute("aria-pressed", pressed);
      }
      state.rankChip.hidden = !state.rank;
      const caption = state.rank ? `元Rank ${state.rank} ×` : "";
      if (state.rankChip.textContent !== caption) state.rankChip.textContent = caption;
    }

    function setRank(state, rank) {
      if (state.rank === rank) return;
      state.rank = rank;
      if (state.rankInput) state.rankInput.value = String(rank);
      changeList(state);
      renderToolbar(state);
    }

    function readList(instance, el, stores, classicSoul = false) {
      const owner = stores?.get("userProfile")?.profile?.id;
      const all = stores?.get("userMonsters")?.monsters;
      const rows = classicSoul ? all : instance.props?.monsters;
      if (!owner || !Array.isArray(rows) || !Array.isArray(all) || !el.isConnected) return;
      if (account?.owner !== owner || all !== ownRows) {
        if (account?.owner !== owner) {
          if (dialog?.open) dialog.close();
          account = readAccount(owner);
        }
        ownRows = all;
        ownedIds = new Set(all.map(monsterId));
      }
      let state = bindings.get(instance);
      if (rows !== all && !state && (!rows.length || !rows.every(monster => ownedIds.has(monsterId(monster))))) return;
      if (!state) {
        const sorted = instance.exposed?.sortedMonsters ?? dependencies(instance.effect).find(ref => {
          const source = String(ref.fn);
          // Classic SoulCraftModal uses a shared candidate list for the grid and page selection.
          if (classicSoul) return /^\(\)=>\w+\(\w+\(\w+\(\w+\.monsters\)\),\w+\.value\)$/.test(source.replace(/\s/g, ""));
          return source.includes(".monsters") && source.includes(".prioritizePartyMembers");
        });
        if (!sorted?.dep?.trigger) return;
        const toolbar = element("div", "monster-box-toolbar");
        const tabs = element("div", "monster-box-tabs");
        tabs.setAttribute("role", "group");
        tabs.setAttribute("aria-label", "ホムンクルスのボックス");
        const rankChip = button("monster-box-button", "", () => setRank(state, 0));
        rankChip.setAttribute("aria-label", "元ランクの絞り込みを解除");
        toolbar.append(tabs, rankChip, button("monster-box-button", "ボックス管理", manageBoxes));
        state = { owner, instance, sorted, toolbar, tabs, rankChip, classicSoul, box: "", rank: 0 };
        if (!readThrough(sorted, source => {
          if (!enabled || state.owner !== account?.owner || !Array.isArray(source) || !state.rank && !state.box) return source;
          if (state.cache?.source === source) return state.cache.items;
          const items = source.filter(monster => (!state.rank || baseRank(monster) === state.rank) &&
            (!state.box || account.members.get(monsterId(monster))?.has(state.box)));
          state.cache = { source, items };
          return items;
        })) return;
        bindings.set(instance, state);
      }
      if (state.owner !== owner) {
        state.owner = owner;
        state.box = "";
        state.rank = 0;
        state.cache = null;
      }
      state.el = el;
      lists.add(state);
      roots.set(el, state);
      if (!el.hasAttribute("data-ha4-monster-list")) el.setAttribute("data-ha4-monster-list", "");
      const controls = classicSoul ? el.firstElementChild : el.querySelector(":scope > .fx-mlist__controls");
      if (state.toolbar.parentElement !== el) {
        if (controls) controls.after(state.toolbar);
        else el.prepend(state.toolbar);
      }
      renderToolbar(state);
    }

    function bindingFor(instance) {
      for (let parent = instance; parent; parent = parent.parent) {
        const state = bindings.get(parent);
        if (state) return state;
      }
    }

    function readRankField(anchor, state, footer) {
      if (!anchor?.parentElement || !state) return;
      if (state.rankField?.parentElement !== anchor.parentElement) {
        const field = element("label", "monster-rank-field", "元ランク");
        const select = element("select", "monster-box-rank-select");
        select.setAttribute("aria-label", "元ランク");
        select.append(new Option("指定なし", "0"), ...Array.from({ length: 6 }, (_, i) =>
          new Option("Rank " + (i + 1), String(i + 1))));
        select.addEventListener("change", () => setRank(state, Number(select.value)));
        field.append(select);
        state.rankField = field;
        state.rankInput = select;
        if (footer) anchor.before(field);
        else anchor.after(field);
      }
      state.rankInput.value = String(state.rank);
    }

    function readCard(el, key) {
      const root = el.closest("[data-ha4-monster-list]");
      if (!root || !roots.has(root) || typeof key !== "string" || !ownedIds?.has(key)) return;
      let mark = el.querySelector(':scope > [data-ha4="monster-box-mark"]');
      if (!account.boxes.size) {
        mark?.remove();
        return;
      }
      if (!mark) {
        mark = button("monster-box-mark", "", () => assignBoxes(mark.dataset.monster));
        for (const name of ["pointerdown", "pointerup", "dblclick", "keydown"]) {
          mark.addEventListener(name, event => event.stopPropagation());
        }
        el.append(mark);
      }
      mark.dataset.monster = key;
      const boxes = [...(account.members.get(key) ?? [])].map(box => account.boxes.get(box)).filter(Boolean);
      const title = boxes.length ? "ボックスを変更　" + boxes.join("、") : "ボックスに入れる";
      if (mark.title === title) return;
      mark.title = title;
      mark.setAttribute("aria-label", title);
      mark.textContent = boxes.length ? "▣" : "＋";
      mark.toggleAttribute("data-marked", boxes.length > 0);
    }

    document.addEventListener("hako-af:extra-settings", event => {
      let settings;
      try { settings = JSON.parse(event.detail); } catch { return; }
      const next = settings.monsterBoxes !== false;
      if (enabled === next) return;
      enabled = next;
      if (!enabled) {
        if (dialog?.open) dialog.close();
        for (const el of document.querySelectorAll(uiSelector)) el.remove();
      }
      for (const state of lists) changeList(state, false);
    });

    window.addEventListener("storage", event => {
      if (!account || event.key !== keyFor(account.owner)) return;
      account = readAccount(account.owner);
      refreshBoxes();
    });

    return {
      prune() {
        for (const state of lists) if (!state.el.isConnected || state.instance.isUnmounted) lists.delete(state);
      },
      read(name, instance, vnode, el, stores) {
        if (!enabled || el?.nodeType !== 1) return;
        if (listNames.has(name) && instance) {
          readList(instance, el, stores);
        } else if (vnode.props?.ref_key === "soulifyGridRef" && vnode.ctx?.type?.__name === "SoulCraftModal") {
          readList(vnode.ctx, el, stores, true);
        } else if (name === "FlexMonsterFilter") {
          readRankField(el.querySelector(".fx-mfilter__footer"), bindingFor(instance), true);
        } else if (vnode.type === "input" && el.placeholder === "例: 火炎斬り") {
          const state = bindingFor(vnode.ctx);
          if (!state?.classicSoul || !vnode.ctx.props.hideFavorites) {
            readRankField(el.closest("label"), state, false);
          }
        } else if (vnode.key && el.matches("li.fx-mlist__item,div.touch-nolp.aspect-square")) {
          readCard(el, vnode.key);
        } else if (vnode.props?.page != null && typeof vnode.props.onChange === "function" &&
            (name === "FlexPager" || Object.hasOwn(vnode.props, "page-count"))) {
          const state = bindingFor(vnode.ctx ?? instance?.parent);
          if (state) state.pager = vnode;
        }
      }
    };
  }

  globalThis.hakoAfMonsterBoxes = { start };
})();
