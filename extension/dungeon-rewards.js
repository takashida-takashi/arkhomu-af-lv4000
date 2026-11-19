(() => {
  "use strict";
  const title = globalThis.hakoAfFeatureNames.dungeonRewards;
  const listSelector = "[data-ha4-dungeon-reward-list]";
  const rowSelector = "[data-ha4-dungeon-reward-id]";
  const storageKey = "hakoAf4000:dungeon-reward-filter";
  const isPositive = floor => floor.claimed === false && floor.net > 0;
  const sign = value => value == null ? "未確認" : `${value > 0 ? "+" : ""}${value.toLocaleString("ja-JP")}`;

  function start(node, enabled) {
    const panels = new Map();
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Use the default view. */ }
    const state = { only: saved?.only === true, future: saved?.future !== false, allRewards: saved?.allRewards === true };
    const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep the in-tab view. */ } };
    function updateAll() { save(); for (const [list, panel] of panels) update(list, panel); }

    function makePanel(list) {
      const root = node("section", "dungeon-rewards");
      root.setAttribute("aria-label", title);
      const controls = node("div", "dungeon-reward-controls");
      const only = document.createElement("input");
      only.type = "checkbox";
      only.checked = state.only;
      const onlyLabel = node("label", "dungeon-reward-toggle");
      onlyLabel.append(only, "初回未取得・スタミナ黒字のダンジョンだけ");
      only.addEventListener("change", () => { state.only = only.checked; updateAll(); });
      const future = document.createElement("input");
      future.type = "checkbox";
      future.checked = state.future;
      const futureLabel = node("label", "dungeon-reward-toggle");
      futureLabel.append(future, "未解放のフロア・難易度も対象");
      future.addEventListener("change", () => { state.future = future.checked; updateAll(); });
      controls.append(node("strong", "dungeon-reward-title", title), onlyLabel, futureLabel);
      const status = node("p", "dungeon-reward-status");
      status.setAttribute("role", "status");
      const detail = node("details", "dungeon-reward-detail");
      const summary = node("summary", "dungeon-reward-summary");
      const body = node("div", "dungeon-reward-body");
      detail.append(summary, body);
      root.append(controls, status, detail);
      // Keep the native grid's children and Vue-owned controls intact.
      list.before(root);
      const panel = { root, only, future, status, detail, summary, body, signature: "" };
      panels.set(list, panel);
      return panel;
    }

    function renderDetails(panel, dungeon, ready) {
      panel.body.replaceChildren();
      if (!dungeon) {
        panel.summary.textContent = "ダンジョンを選ぶと、フロア・難易度別の初回報酬を確認できます";
        return;
      }
      const positive = dungeon.modes.flatMap(mode => mode.floors).filter(isPositive);
      const unlocked = positive.filter(floor => floor.unlocked).length;
      panel.summary.textContent = `${dungeon.name}：未取得の黒字 ${positive.length}件（解放済み ${unlocked}件・未解放 ${positive.length - unlocked}件）`;
      if (!ready) panel.summary.textContent = `${dungeon.name}：初回報酬・スタミナ収支（取得履歴を確認中）`;
      const goodModes = dungeon.modes.filter(mode => mode.floors.some(isPositive));
      if (goodModes.length) {
        const ranges = [];
        for (const mode of goodModes) {
          const previous = ranges.at(-1);
          if (previous && previous.last + 1 === mode.difficulty && (previous.last <= 9) === (mode.difficulty <= 9)) {
            previous.last = mode.difficulty;
            previous.end = mode.label;
          } else ranges.push({ first: mode.difficulty, last: mode.difficulty, start: mode.label, end: mode.label });
        }
        panel.body.append(node("p", "dungeon-reward-range", "未取得の黒字がある難易度：" + ranges.map(range =>
          range.first === range.last ? range.start : `${range.start}〜${range.end}`).join("、")));
      }
      const note = node("p", "dungeon-reward-note", "ポーション1個＝10ストック。道中0勝から必要な分だけ探索し、全勝・ボス一発クリアした場合の各フロア単体の収支です。自然回復・前提ダンジョンや前段階の解放に使う分は含みません。");
      panel.body.append(note);
      const all = document.createElement("input");
      all.type = "checkbox";
      all.checked = state.allRewards;
      const allLabel = node("label", "dungeon-reward-toggle");
      allLabel.append(all, "全難易度・取得済みも表示");
      all.addEventListener("change", () => { state.allRewards = all.checked; updateAll(); });
      panel.body.append(allLabel);
      const viewport = node("div", "dungeon-reward-table-scroll");
      viewport.tabIndex = 0;
      viewport.setAttribute("aria-label", `${dungeon.name}のフロア・難易度別初回報酬`);
      const table = node("table", "dungeon-reward-table");
      const caption = node("caption", "dungeon-reward-caption", "初回報酬のポーション個数・差し引きストック");
      const floors = [...new Set(dungeon.modes.flatMap(mode => mode.floors.map(floor => floor.floor)))].sort((a, b) => a - b);
      const head = document.createElement("thead");
      const headers = document.createElement("tr");
      for (const label of ["難易度", ...floors.map(floor => `${floor}階`)]) {
        const cell = node("th", "dungeon-reward-heading", label);
        cell.scope = "col";
        headers.append(cell);
      }
      head.append(headers);
      const rows = document.createElement("tbody");
      const shownModes = dungeon.modes.filter(mode => state.allRewards || !ready || mode.floors.some(isPositive));
      for (const mode of shownModes) {
        const row = document.createElement("tr");
        const heading = node("th", "dungeon-reward-heading", mode.label);
        heading.scope = "row";
        row.append(heading);
        for (const floor of floors) {
          const cell = node("td", "dungeon-reward-cell");
          const entry = mode.floors.find(item => item.floor === floor);
          if (!entry) { cell.textContent = "—"; row.append(cell); continue; }
          cell.dataset.positive = String(isPositive(entry));
          cell.dataset.claimed = String(entry.claimed);
          const reward = node("span", "dungeon-reward-pot", `ポーション ${entry.potions}個`);
          const balance = node("strong", "dungeon-reward-net", `${sign(entry.net)}ストック`);
          const wins = node("small", "dungeon-reward-wins", `ボスまで ${entry.wins == null ? "未確認" : entry.wins + "勝"}`);
          const state = node("small", "dungeon-reward-claim", entry.claimed === null ? "取得状況未確認" : entry.claimed
            ? "取得済み" : entry.unlocked ? "未取得・解放済み" : "未取得・未解放");
          if (entry.claimed) balance.textContent += "（初回取得時）";
          cell.append(reward, balance, wins, state);
          row.append(cell);
        }
        rows.append(row);
      }
      table.append(caption, head, rows);
      viewport.append(table);
      if (shownModes.length) panel.body.append(viewport);
      else panel.body.append(node("p", "dungeon-reward-status", "未取得で黒字になる初回報酬はありません。「全難易度・取得済みも表示」で全体を確認できます。"));
    }

    function update(list, panel) {
      let report;
      try { report = JSON.parse(list.getAttribute("data-ha4-dungeon-reward-list")); } catch { return; }
      if (!Array.isArray(report?.dungeons)) return;
      panel.only.checked = state.only;
      panel.future.checked = state.future;
      const selectedRow = [...list.querySelectorAll(rowSelector)].find(row => row.matches("button.scale-110") ||
        row.querySelector(':scope > button[aria-pressed="true"]'));
      const selected = selectedRow?.getAttribute("data-ha4-dungeon-reward-id");
      const rows = new Map(report.dungeons.map(dungeon => [dungeon.id, dungeon]));
      let matched = 0, futureOnly = 0;
      const active = state.only && report.ready;
      for (const row of list.querySelectorAll(rowSelector)) {
        const dungeon = rows.get(row.getAttribute("data-ha4-dungeon-reward-id"));
        const positive = dungeon?.modes.flatMap(mode => mode.floors).filter(isPositive) ?? [];
        const match = positive.some(floor => state.future || floor.unlocked);
        if (match) { matched++; if (!positive.some(floor => floor.unlocked)) futureOnly++; }
        const hidden = active && !match;
        if (row.hasAttribute("data-ha4-dungeon-reward-hidden") !== hidden) row.toggleAttribute("data-ha4-dungeon-reward-hidden", hidden);
      }
      list.toggleAttribute("data-ha4-dungeon-reward-filtered", active);
      const status = !report.ready ? "クリア履歴を読み込み中です。取得済みの判定ができるまで、絞り込みを待っています。" :
        `未取得の黒字があるダンジョン ${matched}件${state.future ? `（未解放のみ ${futureOnly}件を含む）` : "（解放済みのみ）"}` +
        (active && !matched ? "。条件に一致するダンジョンはありません。" : "");
      if (panel.status.textContent !== status) panel.status.textContent = status;
      const dungeon = rows.get(selected);
      const signature = JSON.stringify([report.owner, report.ready, dungeon, state.allRewards]);
      if (panel.signature !== signature) {
        panel.signature = signature;
        renderDetails(panel, dungeon, report.ready);
      }
    }

    function scan() {
      for (const [list, panel] of panels) {
        if (!list.isConnected || !list.querySelector(rowSelector) || !enabled()) {
          for (const row of list.querySelectorAll(rowSelector)) row.removeAttribute("data-ha4-dungeon-reward-hidden");
          list.removeAttribute("data-ha4-dungeon-reward-filtered");
          panel.root.remove();
          panels.delete(list);
        }
      }
      if (!enabled()) return;
      for (const list of document.querySelectorAll(listSelector)) {
        if (!list.querySelector(rowSelector)) continue;
        update(list, panels.get(list) ?? makePanel(list));
      }
    }
    return { scan };
  }
  globalThis.hakoAfDungeonRewards = { start };
})();
