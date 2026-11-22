(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const names = globalThis.hakoAfFeatureNames;
  const createPopup = globalThis.hakoAfFilterPopup;
  const conditionRows = globalThis.hakoAfConditionRows;
  const { activeGroup, evaluateGroup, validationError } = globalThis.hakoAfListRules;
  const listSelector = "[data-ha4-guild-filter-list]";
  const rowSelector = "[data-ha4-guild-filter-row]";
  const pendingBadgeSelector = '[data-ha4="guild-unknown"]';
  const emptyGroupAttribute = "data-ha4-guild-empty";
  const storageKey = "hakoAf4000:guild-dungeon-filter-state";
  const difficulty = ["通常", "過酷", "凶悪", "災厄", "修羅", "修羅Ⅱ", "修羅Ⅲ", "神域", "黙示録",
    "裏Ⅰ", "裏Ⅱ", "裏Ⅲ", "裏Ⅳ", "裏Ⅴ", "裏Ⅵ"].map((label, index) => [String(index + 1), label]);
  const text = (label, group) => ({ label, group, kind: "text", sortable: false });
  const number = (label, group, unit) => ({ label, group, unit, kind: "number" });
  const choice = (label, group, choices, sortable = false) => ({ label, group, kind: "choice", choices, sortable });
  const fields = new Map([
    ["mobDifficulty", { ...choice("道中の難易度", "trial", difficulty, true), ordered: true }],
    ["mobEnemies", text("道中のホムンクルス", "trial")],
    ["mobStars", number("道中の強さ", "trial", "★")],
    ["bossDifficulty", { ...choice("ボス難易度", "trial", difficulty, true), ordered: true }],
    ["bossEnemies", text("ボスのホムンクルス", "trial")],
    ["bossStars", number("ボスの強さ", "trial", "★")],
    ["entryFee", number("本日の入場料", "fee", "G")],
    ["normalFee", number("通常入場料", "fee", "G")],
    ["specialFee", number("景品の日の入場料", "fee", "G")],
    ["specialToday", choice("景品の日", "fee", [["1", "景品あり"], ["0", "景品なし"]])],
    ["name", text("ダンジョン名", "other")],
    ["guild", text("ギルド名", "other")],
    ["todayClosed", choice("本日の受付", "other", [["0", "受付中"], ["1", "受付終了"]])],
    ["todayEntrants", number("今日の入場者数", "other", "人")],
    ["todayClearers", number("今日のクリア人数", "other", "人")],
    ["todayClearRate", number("今日のクリア率", "other", "%")]
  ]);
  for (const [side, label] of [["mob", "道中"], ["boss", "ボス"]]) {
    for (const [suffix, title, unit] of [["Count", "のホム数", "体"], ["MaxLevel", "の最高Lv", "Lv"],
      ["PassiveCount", "の付与パッシブ枠数", "個"], ["ChosenCount", "の指定パッシブ数", "個"], ["RandomCount", "のランダムパッシブ数", "個"],
      ["ArtifactCount", "の装備AF数", "個"], ["DropRate", "のドロップ倍率", "倍"], ["StealRate", "の盗み倍率", "倍"], ["TrialDrop", "の試練によるドロップ・AF変換率補正", "%"]]) fields.set(side + suffix, number(label + title, "trial", unit));
    fields.set(side + "Passives", text(label + "の指定パッシブ", "trial"));
    fields.set(side + "Artifacts", text(label + "の装備AF", "trial"));
    fields.set(side + "TrialPassive", choice(label + "の報酬元専用パッシブ", "trial", [["1", "あり"], ["0", "なし"]]));
  }
  for (const [key, title, unit] of [["effectCount", "ダンジョン効果数", "個"], ["upperChance", "真・極化の最低確率", "%"],
    ["upperMinRank", "真・極化保証の対象最低ランク", "Rank"], ["rank6MobDrop", "道中R6数によるドロップ補正", "%"], ["rank6MobFull", "道中R6の補正解除必要数", "体"],
    ["visits", "累計入場回数", "回"], ["clears", "累計攻略回数", "回"], ["clearRate", "累計クリア率", "%"],
    ["winsRemaining", "今日あと道中勝利可能回数", "回"], ["bossRemaining", "今日あとボス挑戦可能回数", "回"],
    ["reviewAverage", "レビュー平均評価", "★"], ["reviewCount", "レビュー件数", "件"], ["slot", "ギルド内のダンジョン番号", "番"]]) fields.set(key, number(title, "other", unit));
  fields.set("dungeonEffects", text("ダンジョン効果", "other"));fields.set("description", text("ダンジョン説明", "other"));
  fields.set("sourceDungeon", text("報酬元ダンジョン", "other"));
  fields.set("nation", text("国", "other"));fields.set("version", text("ダンジョンの公開バージョン", "other"));
  fields.set("todayShared", choice("今日の入場・攻略人数の集計範囲", "other", [["1", "ギルド合計"], ["0", "ダンジョン単独"]]));
  const normalize = text => text.normalize("NFKC").trim().toLowerCase().replace(/[ァ-ヶ]/g, kana =>
    String.fromCharCode(kana.charCodeAt(0) - 0x60));
  const isActive = condition => fields.get(condition.key)?.kind === "number"
    ? !!(condition.min || condition.max) : !!condition.value?.trim();
  const options = {
    title: "ギルドダンジョンの" + names.filter,
    groups: { trial: "難易度・編成", fee: "入場料・景品", other: "ダンジョン情報" },
    unknownLabel: "未確認のダンジョンも表示",
    presetPrefix: "guild-dungeon-filter-preset:",
    shareFormat: "hako-guild-dungeon-filter",
    isActive
  };

  function evaluate(row, condition) {
    const value = row[condition.key];
    if (value == null) return null;
    const { kind } = fields.get(condition.key);
    if (kind === "number") return (!condition.min || value >= Number(condition.min)) &&
      (!condition.max || value <= Number(condition.max));
    if (kind === "choice") {
      if (condition.comparison === "min") return value >= Number(condition.value);
      if (condition.comparison === "max") return value <= Number(condition.value);
      return String(value) === condition.value;
    }
    const query = normalize(condition.value);
    const names = typeof value === "string" ? [value] : value.names;
    const found = names.some(name => normalize(name).includes(query));
    if (!found && value.complete === false) return null;
    return condition.absent ? !found : found;
  }

  function unresolvedKeys(row, group, keys = new Set()) {
    for (const condition of group.children) {
      if (condition.children) {
        if (evaluateGroup(row, condition, false, undefined, evaluate) === null) unresolvedKeys(row, condition, keys);
      } else if (evaluate(row, condition) === null) keys.add(condition.key);
    }
    return keys;
  }

  function pendingLabel(row, group) {
    const keys = unresolvedKeys(row, group);
    const mob = keys.delete("mobEnemies");
    const boss = keys.delete("bossEnemies");
    const labels = [];
    if (mob || boss) {
      const subject = mob && boss ? "道中・ボスのホムンクルス" : mob ? "道中の出現ホムンクルス" : "ボスのホムンクルス";
      const click = (mob && !row.mobEnemies) || (boss && !row.bossEnemies);
      labels.push(subject + "未確認" + (click ? "（クリックで取得）" : ""));
    }
    for (const key of keys) {
      const reason = key === "todayClearRate" && row.todayEntrants === 0 ? "（入場者0人）" : "";
      labels.push(fields.get(key).label + "未確認" + reason);
    }
    return labels.join("・");
  }

  function groupHeader(row) {
    const grid = row.parentElement;
    if (grid?.matches(".fx-dungeon__grid")) {
      const heading = grid.previousElementSibling;
      return heading?.matches(".fx-dungeon__nation") ? heading : null;
    }
    const section = grid?.parentElement;
    return section?.matches("section[aria-label]") && section.querySelector(":scope > h4") ? section : null;
  }

  function updateMatchNote(row, label) {
    let note = row.querySelector('[data-ha4="guild-match-note"]');
    if (!label) { note?.remove(); return; }
    if (!note) {
      note = document.createElement("small");
      note.dataset.ha4 = "guild-match-note";
      row.append(note);
    }
    if (note.textContent !== label) note.textContent = label;
  }

  function nationLayout(list, panel, rows, combined) {
    const next = new Map();
    if (combined) for (const { el } of rows) {
      const grid = el.parentElement, header = groupHeader(el);
      if (!header) continue;
      const flex = header === grid.previousElementSibling;
      const flow = flex ? grid.parentElement : header.parentElement;
      if (!flow || flow !== list && !list.contains(flow)) continue;
      next.set(grid, "data-ha4-guild-flat-grid");
      if (flex) {
        next.set(header, "data-ha4-guild-flat-heading");
        next.set(flow, "data-ha4-guild-flat-flow");
      } else {
        next.set(header, "data-ha4-guild-flat-group");
        next.set(header.querySelector(":scope > h4"), "data-ha4-guild-flat-heading");
        next.set(flow, "data-ha4-guild-flat-flow");
      }
    }
    for (const [node, attribute] of panel.layout ?? []) if (next.get(node) !== attribute) node.removeAttribute(attribute);
    for (const [node, attribute] of next) if (!node.hasAttribute(attribute)) node.setAttribute(attribute, "");
    panel.layout = next;
    panel.flow = [...next].find(([, attribute]) => attribute === "data-ha4-guild-flat-flow")?.[0];
    list.toggleAttribute("data-ha4-guild-ungrouped", combined);
  }

  function listSort(list, state) {
    if (state.sortKey) return { key: state.sortKey, direction: state.sortDirection };
    const fee = state.combineNations && [...list.querySelectorAll("select")].some(select => !select.closest("[data-ha4]") &&
      (select.value === "fee_low" || select.selectedOptions?.[0]?.textContent.replace(/\s/g, "") === "入場料の安い順"));
    return { key: fee ? "entryFee" : "", direction: "asc" };
  }

  function start(isEnabled) {
    const state = { root: { join: "and", children: [] }, showUnknown: false, sortKey: "", sortDirection: "asc", combineNations: false, hideFinished: false };
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const restored = createPopup.parseSharedPreset(stored, fields, options.shareFormat);
        const display = JSON.parse(stored);
        restored.combineNations = display.combineNations === true;
        restored.hideFinished = display.hideFinished === true;
        for (const key of Object.keys(state)) state[key] = restored[key];
      }
    } catch { /* Keep filtering available when saved data or storage cannot be read. */ }
    const panels = new Map();
    const snapshots = new WeakMap();
    let badgeId = 0;
    let lastSaved, saveFailed = false;

    function changed() {
      try {
        const value = JSON.stringify({ format: options.shareFormat, version: 2, root: state.root,
          showUnknown: state.showUnknown, sortKey: state.sortKey, sortDirection: state.sortDirection,
          combineNations: state.combineNations, hideFinished: state.hideFinished });
        if (value !== lastSaved) localStorage.setItem(storageKey, value);
        lastSaved = value;
        saveFailed = false;
      } catch { saveFailed = true; }
      scan();
    }

    function updatePendingBadge(row, label) {
      const button = row.querySelector(":scope > button");
      let badge = row.querySelector(pendingBadgeSelector);
      if (!label || !button) {
        if (!badge) return;
        const describedBy = button?.getAttribute("aria-describedby")?.split(/\s+/)
          .filter(id => id && id !== badge.id);
        if (describedBy?.length) button.setAttribute("aria-describedby", describedBy.join(" "));
        else button?.removeAttribute("aria-describedby");
        badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("small");
        badge.dataset.ha4 = "guild-unknown";
        badge.id = "ha4-guild-pending-" + ++badgeId;
        badge.setAttribute("aria-hidden", "true");
        const body = button.querySelector(":scope > .min-w-0.flex-col") ?? button;
        body.append(badge);
        const describedBy = button.getAttribute("aria-describedby");
        button.setAttribute("aria-describedby", describedBy ? describedBy + " " + badge.id : badge.id);
      }
      if (badge.textContent !== label) badge.textContent = label;
    }

    function readRow(el) {
      const source = el.getAttribute("data-ha4-guild-filter-row");
      let row = snapshots.get(el);
      if (row?.source !== source) {
        row = { el, source, data: JSON.parse(source) };
        snapshots.set(el, row);
      }
      return row;
    }

    function clear(list, panel) {
      panel.popup.remove();
      panel.toolbar.remove();
      panel.finishedHeading?.remove();
      nationLayout(list, panel, [], false);
      for (const row of list.querySelectorAll(rowSelector)) {
        row.removeAttribute("data-ha4-guild-hidden");
        row.style.removeProperty("--ha4-guild-order");
        updatePendingBadge(row, "");
        updateMatchNote(row, "");
        row.querySelector('[data-ha4="guild-clear-rate"]')?.remove();
      }
      for (const group of list.querySelectorAll(`[${emptyGroupAttribute}]`)) group.removeAttribute(emptyGroupAttribute);
      panels.delete(list);
    }

    function scan() {
      for (const [list, panel] of panels) {
        if (!isEnabled() || !list.isConnected || !list.matches(listSelector)) clear(list, panel);
      }
      if (!isEnabled()) return;
      const group = activeGroup(state.root, undefined, isActive);
      const error = validationError(group);
      const active = !error && group.children.length > 0;
      const conditions = active ? conditionRows(group) : [];
      const showRate = state.sortKey === "todayClearRate" ||
        conditions.some(condition => condition.key === "todayClearRate");
      const searchesLineup = conditions.some(condition => condition.key === "mobEnemies" || condition.key === "bossEnemies");
      const showMatchNotes = searchesLineup && conditions.length > 1;
      for (const list of document.querySelectorAll(listSelector)) {
        let panel = panels.get(list);
        if (!panel) {
          const popup = createPopup(state, changed, globalThis.hakoAfPresetStorage, false, options);
          const toolbar = document.createElement("div");
          toolbar.dataset.ha4 = "guild-filter-toolbar";
          const status = document.createElement("small");
          status.setAttribute("role", "status");
          const pendingToggle = document.createElement("button");
          pendingToggle.type = "button";
          pendingToggle.dataset.ha4 = "guild-pending-toggle";
          pendingToggle.addEventListener("click", () => {
            state.showUnknown = !state.showUnknown;
            changed();
          });
          const combine = document.createElement("input");
          combine.type = "checkbox";
          combine.setAttribute("aria-label", "国の区別なく並べる");
          combine.addEventListener("change", () => {
            state.combineNations = combine.checked;
            changed();
          });
          const combineLabel = document.createElement("label");
          combineLabel.dataset.ha4 = "guild-combine-nations";
          combineLabel.title = "読み込み済みの全ギルドダンジョンを、本体または拡張ソートの順に並べます。";
          combineLabel.append(combine, "国の区別なく並べる");
          const finishedToggle = document.createElement("button");
          finishedToggle.type = "button";
          finishedToggle.dataset.ha4 = "guild-finished-toggle";
          finishedToggle.title = "今日の挑戦が終わったダンジョンの表示を切り替えます。選択は保存されます。";
          finishedToggle.addEventListener("click", () => {
            state.hideFinished = !state.hideFinished;
            changed();
          });
          toolbar.append(popup.element, combineLabel, finishedToggle, pendingToggle, status);
          panel = { popup, toolbar, status, pendingToggle, combine, finishedToggle };
          panels.set(list, panel);
        }
        if (panel.toolbar.parentElement !== list) {
          const nativeSort = list.querySelector(":scope > .fx-dungeon__guild-bar,:scope > div:has(> select[aria-label='並び順'])");
          if (nativeSort) nativeSort.after(panel.toolbar);
          else list.prepend(panel.toolbar);
        }
        const rows = [...list.querySelectorAll(rowSelector)].map(readRow);
        panel.combine.checked = state.combineNations;
        nationLayout(list, panel, rows, state.combineNations);
        const counts = new Map();
        const headers = new Map();
        let matched = 0;
        let pending = 0;
        let finished = 0, visibleFinished = 0;
        for (const row of rows) {
          const { el, data } = row;
          row.finished = data.todayClosed === "1";
          if (row.finished) finished++;
          for (const [key, value] of Object.entries(data)) {
            if (value != null) counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          const hits = showMatchNotes ? [] : undefined;
          const result = row.result = active ? evaluateGroup(data, group, false, hits, evaluate) : true;
          if (result === true) matched++;
          if (result === null) pending++;
          const unknownShown = result === null && state.showUnknown;
          const visible = (result === true || unknownShown) && !(state.hideFinished && row.finished);
          if (visible && row.finished) visibleFinished++;
          el.toggleAttribute("data-ha4-guild-hidden", !visible);
          const heading = groupHeader(el);
          if (heading) headers.set(heading, headers.get(heading) || visible);
          updatePendingBadge(el, unknownShown ? pendingLabel(data, group) : "");
          const matchedLabels = result === true && hits?.length ? [...new Set(hits.map(hit => fields.get(hit.key).label))] : [];
          updateMatchNote(el, matchedLabels.length ? `一致条件　${matchedLabels.join("・")}` : "");
          let rate = el.querySelector('[data-ha4="guild-clear-rate"]');
          if (showRate && data.todayClearRate != null && visible) {
            if (!rate) {
              rate = document.createElement("small");
              rate.dataset.ha4 = "guild-clear-rate";
              el.append(rate);
            }
            const percent = data.todayClearRate.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
            const label = `本日 ${percent}%（${data.todayClearers} / ${data.todayEntrants}人）`;
            if (rate.textContent !== label) rate.textContent = label;
          } else rate?.remove();
        }
        for (const [heading, visible] of headers) heading.toggleAttribute(emptyGroupAttribute, !visible);
        const sorting = listSort(list, state);
        const order = sorting.key && (sorting.direction === "asc" ? 1 : -1);
        const prioritizeMatches = !state.combineNations && active && state.showUnknown && pending > 0;
        if (order || prioritizeMatches || state.combineNations) {
          rows.sort((a, b) => {
            if (state.combineNations && a.finished !== b.finished) return a.finished ? 1 : -1;
            if (prioritizeMatches && (a.result === null) !== (b.result === null)) return a.result === null ? 1 : -1;
            if (!order) return state.combineNations ? (a.data.nativeOrder ?? 0) - (b.data.nativeOrder ?? 0) : 0;
            const left = a.data[sorting.key];
            const right = b.data[sorting.key];
            if (left == null) return right == null ? 0 : 1;
            if (right == null) return -1;
            return order * (left - right) || (state.combineNations ? (a.data.nativeOrder ?? 0) - (b.data.nativeOrder ?? 0) : 0);
          });
        }
        rows.forEach(({ el }, index) => {
          const value = order || prioritizeMatches || state.combineNations ? String(index * 2 + 1) : "";
          if (el.style.getPropertyValue("--ha4-guild-order") !== value) el.style.setProperty("--ha4-guild-order", value);
        });
        if (state.combineNations && panel.flow && visibleFinished) {
          if (!panel.finishedHeading) {
            panel.finishedHeading = document.createElement("div");
            panel.finishedHeading.dataset.ha4 = "guild-finished-heading";
            panel.finishedHeading.setAttribute("role", "heading");
            panel.finishedHeading.setAttribute("aria-level", "4");
          }
          const heading = panel.finishedHeading;
          if (heading.parentElement !== panel.flow) panel.flow.append(heading);
          const label = `今日の挑戦が終わったダンジョン ${visibleFinished}件`;
          if (heading.textContent !== label) heading.textContent = label;
          const value = String(rows.findIndex(row => row.finished) * 2);
          if (heading.style.getPropertyValue("--ha4-guild-order") !== value) heading.style.setProperty("--ha4-guild-order", value);
        } else panel.finishedHeading?.remove();
        const finishedPressed = String(state.hideFinished);
        if (panel.finishedToggle.getAttribute("aria-pressed") !== finishedPressed) panel.finishedToggle.setAttribute("aria-pressed", finishedPressed);
        const finishedText = state.hideFinished ? `終了分を表示（${finished}件）` : `終了分を非表示（${finished}件）`;
        if (panel.finishedToggle.textContent !== finishedText) panel.finishedToggle.textContent = finishedText;
        const summary = (error ?? (`一覧 ${rows.length}件` +
          (active ? `・判定済み ${rows.length - pending}件（一致 ${matched}件）・未確認 ${pending}件` : ""))) +
          (state.hideFinished && finished ? `・終了 ${finished}件を非表示` : "") +
          (saveFailed ? "・条件を保存できませんでした" : "");
        if (panel.status.textContent !== summary) panel.status.textContent = summary;
        panel.pendingToggle.hidden = pending === 0;
        const pressed = String(state.showUnknown);
        if (panel.pendingToggle.getAttribute("aria-pressed") !== pressed) {
          panel.pendingToggle.setAttribute("aria-pressed", pressed);
        }
        const pendingText = state.showUnknown ? "未確認を隠す" : `未確認 ${pending}件も表示`;
        if (panel.pendingToggle.textContent !== pendingText) panel.pendingToggle.textContent = pendingText;
        panel.popup.refresh([...fields], counts, {
          active, matched, unknown: pending, matchingIds: [], resultLabel: "一致",
          message: summary,
          selectionNotice: pending && searchesLineup
            ? "「未確認のダンジョンも表示」をオンにすると候補を表示できます。編成は一覧の行をクリックすると確認できます。" :
            searchesLineup ? "出現ホムンクルスは種族名で検索します。" : ""
        });
      }
    }
    return { scan };
  }

  globalThis.hakoAfGuildDungeonFilter = { start };
})();
