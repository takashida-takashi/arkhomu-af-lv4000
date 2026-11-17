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
  const difficulty = ["通常", "過酷", "凶悪", "災厄", "修羅", "修羅Ⅱ", "修羅Ⅲ", "神域", "黙示録",
    "裏Ⅰ", "裏Ⅱ", "裏Ⅲ", "裏Ⅳ", "裏Ⅴ"].map((label, index) => [String(index + 1), label]);
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

  function start(isEnabled) {
    const state = { root: { join: "and", children: [] }, showUnknown: false, sortKey: "", sortDirection: "asc" };
    const panels = new Map();
    const snapshots = new WeakMap();
    let badgeId = 0;

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
          const popup = createPopup(state, scan, globalThis.hakoAfPresetStorage, false, options);
          const toolbar = document.createElement("div");
          toolbar.dataset.ha4 = "guild-filter-toolbar";
          const status = document.createElement("small");
          status.setAttribute("role", "status");
          const pendingToggle = document.createElement("button");
          pendingToggle.type = "button";
          pendingToggle.dataset.ha4 = "guild-pending-toggle";
          pendingToggle.addEventListener("click", () => {
            state.showUnknown = !state.showUnknown;
            scan();
          });
          toolbar.append(popup.element, pendingToggle, status);
          panel = { popup, toolbar, status, pendingToggle };
          panels.set(list, panel);
        }
        if (panel.toolbar.parentElement !== list) {
          const nativeSort = list.querySelector(":scope > .fx-dungeon__guild-bar,:scope > div:has(> select[aria-label='並び順'])");
          if (nativeSort) nativeSort.after(panel.toolbar);
          else list.prepend(panel.toolbar);
        }
        const rows = [...list.querySelectorAll(rowSelector)].map(readRow);
        const counts = new Map();
        const headers = new Map();
        let matched = 0;
        let pending = 0;
        for (const row of rows) {
          const { el, data } = row;
          for (const [key, value] of Object.entries(data)) {
            if (value != null) counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          const hits = showMatchNotes ? [] : undefined;
          const result = row.result = active ? evaluateGroup(data, group, false, hits, evaluate) : true;
          if (result === true) matched++;
          if (result === null) pending++;
          const unknownShown = result === null && state.showUnknown;
          const visible = result === true || unknownShown;
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
        const order = state.sortKey && (state.sortDirection === "asc" ? 1 : -1);
        const prioritizeMatches = active && state.showUnknown && pending > 0;
        if (order || prioritizeMatches) {
          rows.sort((a, b) => {
            if (prioritizeMatches && (a.result === null) !== (b.result === null)) return a.result === null ? 1 : -1;
            if (!order) return 0;
            const left = a.data[state.sortKey];
            const right = b.data[state.sortKey];
            if (left == null) return right == null ? 0 : 1;
            if (right == null) return -1;
            return order * (left - right);
          });
        }
        rows.forEach(({ el }, index) => {
          const value = order || prioritizeMatches ? String(index) : "";
          if (el.style.getPropertyValue("--ha4-guild-order") !== value) el.style.setProperty("--ha4-guild-order", value);
        });
        const summary = error ?? (`一覧 ${rows.length}件` +
          (active ? `・判定済み ${rows.length - pending}件（一致 ${matched}件）・未確認 ${pending}件` : ""));
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
