(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const featureName = globalThis.hakoAfFeatureNames.monsterBoxes;
  const listNames = new Set(["MonsterList", "FlexMonsterList"]);
  const keyFor = owner => "hakoAf4000:monster-boxes:" + owner;
  const monsterId = monster => String(monster?.user_monster_id ?? monster?.id ?? "");
  const baseRank = monster => Number(monster.m_monsters?.rank ?? monster.rank);
  const bounds = [
    ["lt", "未満", (value, limit) => value < limit], ["lte", "以下", (value, limit) => value <= limit],
    ["gte", "以上", (value, limit) => value >= limit], ["gt", "より大きい", (value, limit) => value > limit],
    ["eq", "一致", (value, limit) => value === limit]
  ];
  const number = new Intl.NumberFormat("ja-JP");
  const countLabel = count => `${number.format(count)}体`;
  const conditionFields = [
    ["世代", "lt", "any", monster => monster.t_user_monsters?.generation_value ?? monster.generation_value],
    ["レベル", "gte", "1", monster => monster.t_user_monsters?.level ?? monster.level],
    ["元ランク", "lte", "1", baseRank]
  ];

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
    const skipInheritance = new Set(Array.isArray(saved?.skipInheritance) ? saved.skipInheritance.filter(id => boxes.has(id)) : []);
    return { owner, boxes, members, skipInheritance };
  }

  function start({ dependencies, readThrough }) {
    const bindings = new WeakMap();
    const roots = new WeakMap();
    const lists = new Set();
    let enabled = true;
    let account;
    let ownRows;
    let ownedIds;
    let ownLength;
    let counts, refreshDialog;
    let dialog;
    const uiSelector = '[data-ha4="monster-box-toolbar"],[data-ha4="monster-box-mark"],[data-ha4="monster-rank-field"]';

    function save(snapshot = account) {
      try {
        localStorage.setItem(keyFor(snapshot.owner), JSON.stringify({ boxes: [...snapshot.boxes],
          members: Object.fromEntries([...snapshot.members].map(([id, boxes]) => [id, [...boxes]])),
          skipInheritance: [...snapshot.skipInheritance] }));
        return true;
      } catch { return false; }
    }

    function boxCounts() {
      if (counts) return counts;
      counts = new Map();
      for (const [id, boxes] of account.members) {
        if (!ownedIds.has(id)) continue;
        for (const box of boxes) counts.set(box, (counts.get(box) ?? 0) + 1);
      }
      return counts;
    }

    function changeList(state, resetPage = true) {
      state.cache = null;
      state.sorted.dep.trigger();
      if (resetPage && state.pager?.el?.isConnected && state.pager.props.page > 1) state.pager.props.onChange(1);
      if (resetPage) state.el.querySelector(".list-scrollbar,.fx-mlist__body,.virtual-item-grid")?.scrollTo(0, 0);
      state.instance.proxy?.$forceUpdate();
    }

    function refreshBoxes() {
      counts = null;
      for (const state of lists) {
        if (state.owner !== account.owner) continue;
        const box = state.box;
        if (box && !account.boxes.has(box)) state.box = "";
        if (box) changeList(state, box !== state.box);
        renderToolbar(state);
      }
      refreshDialog?.();
      document.dispatchEvent(new Event("hako-af:grid-rendered"));
    }

    function saveBoxes() {
      const saved = save();
      refreshBoxes();
      return saved;
    }

    function openDialog(title) {
      if (dialog?.open) dialog.close();
      refreshDialog = null;
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

    function manageBoxes(activeBox) {
      const body = openDialog(featureName);
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
      const bulk = button("monster-box-button", "条件で一括追加", () => bulkAssign(activeBox));
      body.append(create, bulk, entries, status);
      const countRows = new Map();
      const inheritanceRows = new Map();
      refreshDialog = () => {
        if (!body.isConnected) return;
        const totals = boxCounts();
        for (const [id, count] of countRows) {
          const text = countLabel(totals.get(id) ?? 0);
          if (count.textContent !== text) count.textContent = text;
        }
        for (const [id, input] of inheritanceRows) input.checked = !account.skipInheritance.has(id);
      };
      const validName = (name, id) => {
        if (!name) return "ボックス名を入力してください。";
        if (name === "すべて" || [...account.boxes].some(([key, value]) => key !== id && value === name)) {
          return "別のボックス名を入力してください。";
        }
        return "";
      };
      const render = () => {
        countRows.clear();
        inheritanceRows.clear();
        bulk.hidden = !account.boxes.size;
        entries.replaceChildren(...[...account.boxes].map(([id, name]) => {
          const row = element("form", "monster-box-edit");
          const field = element("input", "monster-box-name");
          field.value = name;
          field.required = true;
          field.maxLength = 32;
          field.setAttribute("aria-label", name + "のボックス名");
          const count = element("span", "monster-box-count");
          countRows.set(id, count);
          const inherit = element("label", "monster-box-inherit");
          const checkbox = element("input", "monster-box-check");
          checkbox.type = "checkbox";
          checkbox.setAttribute("aria-label", `${name}の合成後の子を入れる`);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) account.skipInheritance.delete(id);
            else account.skipInheritance.add(id);
            if (save()) {
              status.textContent = "";
              return;
            }
            if (checkbox.checked) account.skipInheritance.add(id);
            else account.skipInheritance.delete(id);
            checkbox.checked = !checkbox.checked;
            status.textContent = "引き継ぎ設定を保存できませんでした。";
          });
          inherit.append(checkbox, "合成後の子を入れる");
          inheritanceRows.set(id, checkbox);
          row.append(field, count, element("button", "monster-box-button", "名前を保存"),
            button("monster-box-button", "削除", () => {
              account.boxes.delete(id);
              account.skipInheritance.delete(id);
              for (const [monster, boxes] of account.members) {
                if (boxes.delete(id) && !boxes.size) account.members.delete(monster);
              }
              saveBoxes();
              render();
              status.textContent = `「${name}」を削除しました。`;
            }), inherit);
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
        refreshDialog();
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

    function bulkAssign(activeBox) {
      const body = openDialog(featureName + "に条件で一括追加");
      const form = element("form", "monster-box-bulk");
      const label = element("label", "monster-box-choice", "追加先のボックス");
      const target = element("select", "monster-box-rank-select");
      target.required = true;
      label.append(target);
      const fields = conditionFields.map(([name, mode, step, measure]) => {
        const row = element("div", "monster-box-rule");
        const limit = element("input", "monster-box-number");
        limit.type = "number";
        limit.min = "0";
        limit.step = step;
        limit.placeholder = "指定なし";
        limit.setAttribute("aria-label", name);
        const compare = element("select", "monster-box-rank-select");
        compare.setAttribute("aria-label", name + "の比較");
        compare.append(...bounds.map(([id, title]) => new Option(title, id)));
        compare.value = mode;
        row.append(element("span", "monster-box-rule-name", name), limit, compare);
        form.append(row);
        return { limit, compare, measure };
      });
      const preview = element("p", "monster-box-status");
      preview.setAttribute("aria-live", "polite");
      const status = element("p", "monster-box-status");
      status.setAttribute("role", "status");
      const actions = element("div", "monster-box-bulk-actions");
      const submit = element("button", "monster-box-button", "該当するホムを追加");
      submit.type = "submit";
      actions.append(button("monster-box-button", "ボックス管理へ", () => manageBoxes(target.value)), submit);
      form.prepend(label, element("p", "monster-box-bulk-note", "入力した条件をすべて満たす所持ホムンクルスが対象です。"));
      form.append(preview, actions, status);
      body.append(form);

      function matching() {
        const rules = fields.filter(({ limit }) => limit.value !== "").map(({ limit, compare, measure }) => {
          const test = bounds.find(([id]) => id === compare.value)[2];
          const threshold = limit.valueAsNumber;
          return monster => {
            const value = measure(monster);
            return value != null && Number.isFinite(Number(value)) && test(Number(value), threshold);
          };
        });
        if (!rules.length || fields.some(({ limit }) => !limit.validity.valid)) return null;
        return new Set(ownRows.filter(monster => monsterId(monster) != null && rules.every(test => test(monster))).map(monsterId));
      }

      function refresh() {
        if (!body.isConnected) return;
        const before = target.value || activeBox;
        const totals = boxCounts();
        const options = [...account.boxes].map(([id, name]) => [id, `${name}（${countLabel(totals.get(id) ?? 0)}）`]);
        if (JSON.stringify(options) !== target.dataset.options) {
          target.dataset.options = JSON.stringify(options);
          target.replaceChildren(...options.map(([id, name]) => new Option(name, id)));
          if (account.boxes.has(before)) target.value = before;
        }
        const matches = matching();
        const additional = matches && [...matches].filter(id => !account.members.get(id)?.has(target.value)).length;
        submit.disabled = !target.value || !additional;
        const text = matches ? `該当 ${countLabel(matches.size)}・追加 ${countLabel(additional)}・登録済み ${countLabel(matches.size - additional)}` :
          "条件を入力すると該当数を表示します。";
        if (preview.textContent !== text) preview.textContent = text;
      }

      for (const event of ["input", "change"]) form.addEventListener(event, () => {
        status.textContent = "";
        refresh();
      });
      form.addEventListener("submit", event => {
        event.preventDefault();
        const box = target.value;
        const matches = matching();
        if (!matches || !account.boxes.has(box)) return;
        let added = 0;
        for (const id of matches) {
          const boxes = account.members.get(id) ?? new Set();
          if (boxes.has(box)) continue;
          boxes.add(box);
          account.members.set(id, boxes);
          added++;
        }
        if (!added) return;
        const saved = saveBoxes();
        status.textContent = saved ? `「${account.boxes.get(box)}」に${countLabel(added)}を追加しました。` :
          "このタブには反映しました。ブラウザへの保存はできませんでした。";
      });
      refreshDialog = refresh;
      refresh();
    }

    function assignBoxes(id) {
      const body = openDialog(featureName + "に入れる");
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
        const id = tab.dataset.box;
        if (id) {
          const label = `${account.boxes.get(id)} ${countLabel(boxCounts().get(id) ?? 0)}`;
          if (tab.textContent !== label) tab.textContent = label;
        }
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
      if (account?.owner !== owner || all !== ownRows || all.length !== ownLength) {
        if (account?.owner !== owner) {
          if (dialog?.open) dialog.close();
          account = readAccount(owner);
        }
        ownRows = all;
        ownLength = all.length;
        ownedIds = new Set(all.map(monsterId));
        counts = null;
        refreshDialog?.();
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
        tabs.setAttribute("aria-label", featureName + "の一覧");
        const rankChip = button("monster-box-button", "", () => setRank(state, 0));
        rankChip.setAttribute("aria-label", "元ランクの絞り込みを解除");
        toolbar.append(tabs, rankChip, button("monster-box-button", featureName, () => manageBoxes(state.box)));
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
        select.append(new Option("指定なし", "0"), ...Array.from({ length: 7 }, (_, i) =>
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
      const title = boxes.length ? featureName + "を変更　" + boxes.join("、") : featureName + "に入れる";
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

    document.addEventListener("hako-af:mating-completed", event => {
      if (!enabled || typeof event.detail !== "string") return;
      let result;
      try { result = JSON.parse(event.detail); } catch { return; }
      const { owner, parents, child } = result ?? {};
      if (typeof owner !== "string" || !owner || !Array.isArray(parents) || !parents.length ||
          !parents.every(id => typeof id === "string" && id) || typeof child !== "string" || !child || parents.includes(child)) return;
      const snapshot = readAccount(owner);
      const childBoxes = snapshot.members.get(child) ?? new Set();
      let changed = false;
      for (const parent of parents) {
        const parentBoxes = snapshot.members.get(parent);
        if (!parentBoxes) continue;
        for (const box of parentBoxes) {
          if (!snapshot.skipInheritance.has(box)) childBoxes.add(box);
        }
        snapshot.members.delete(parent);
        changed = true;
      }
      if (!changed) return;
      if (childBoxes.size) snapshot.members.set(child, childBoxes);
      if (save(snapshot) && account?.owner === owner) {
        account = snapshot;
        refreshBoxes();
      }
    });
    document.dispatchEvent(new Event("hako-af:watch-mating-results"));

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
