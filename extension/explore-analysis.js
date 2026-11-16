(() => {
  "use strict";

  const dayMs = 86400000;
  const jstOffset = 9 * 3600000;
  const dayInJst = time => Math.floor((time + jstOffset) / dayMs);
  const metrics = ["stocks", "af", "exp", "gold"];
  const integer = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
  const average = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const secondsFormat = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const empty = () => ({ stocks: 0, af: 0, exp: 0, gold: 0, count: 0, wins: 0, losses: 0, battleSamples: 0 });
  const hasBattles = data => Number.isSafeInteger(data?.wins) && Number.isSafeInteger(data?.losses);

  function formatElapsed(ms) {
    if (!Number.isSafeInteger(ms) || ms < 0) return "—";
    const tenths = Math.round(ms / 100);
    const minutes = Math.floor(tenths / 600);
    const seconds = secondsFormat.format(tenths % 600 / 10) + " 秒";
    return minutes ? `${minutes} 分 ${seconds}` : seconds;
  }

  function add(target, run) {
    for (const metric of metrics) target[metric] += run[metric];
    target.count += run.count ?? 1;
    target.wins = (target.wins ?? 0) + (run.wins ?? 0);
    target.losses = (target.losses ?? 0) + (run.losses ?? 0);
    target.battleSamples = (target.battleSamples ?? 0) + (run.battleSamples ?? Number(hasBattles(run)));
    return target;
  }

  let opening;
  function openHistory() {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("hako-af-explore-analysis", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("totals");
        db.createObjectStore("seen").createIndex("day", ["owner", "day"]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      opening = null;
      throw error;
    });
    return opening;
  }

  async function updateHistory({ owner, id, at }, sample) {
    const db = await openHistory();
    const today = dayInJst(Date.now());
    const cutoff = today - 29;
    const day = dayInJst(at);
    const totalKey = [owner, "all"];
    const runKey = [owner, id];
    const dayKey = [owner, day];
    const recentRange = IDBKeyRange.bound([owner, cutoff], [owner, today]);
    const expiredRange = IDBKeyRange.bound([owner, 0], [owner, cutoff], false, true);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(["totals", "seen"], "readwrite");
      const totals = tx.objectStore("totals");
      const seen = tx.objectStore("seen");
      const allData = totals.get(totalKey);
      const dayData = totals.get(dayKey);
      const seenData = seen.getKey(runKey);
      let waiting = 3;
      let all, recent;
      function loaded() {
        if (--waiting) return;
        all = allData.result ?? empty();
        if (sample && !seenData.result && at > (all.resetAt ?? 0) && day >= cutoff && day <= today) {
          // The shared transaction makes recording the same run in two tabs idempotent.
          seen.add({ owner, day }, runKey);
          totals.put(add(dayData.result ?? empty(), sample), dayKey);
          add(all, sample);
        }
        if (all.prunedDay !== today) {
          totals.delete(expiredRange);
          const expired = seen.index("day").openKeyCursor(expiredRange);
          expired.onsuccess = () => {
            const cursor = expired.result;
            if (!cursor) return;
            seen.delete(cursor.primaryKey);
            cursor.continue();
          };
          all.prunedDay = today;
        }
        if (all.count || all.resetAt) totals.put(all, totalKey);
        const days = totals.getAll(recentRange);
        days.onsuccess = () => { recent = days.result.reduce(add, empty()); };
      }
      allData.onsuccess = dayData.onsuccess = seenData.onsuccess = loaded;
      tx.oncomplete = () => resolve({ recent, all });
      tx.onabort = () => reject(tx.error);
    });
  }

  async function resetHistory({ owner, at = 0 }) {
    const db = await openHistory();
    const now = Date.now();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("totals", "readwrite");
      const totals = tx.objectStore("totals");
      totals.delete(IDBKeyRange.bound([owner, 0], [owner, Number.MAX_SAFE_INTEGER]));
      // Keep the cutoff and recent run IDs so an already open or replayed result stays out of the new totals.
      totals.put({ ...empty(), resetAt: Math.max(now, at) }, [owner, "all"]);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  }

  function start(node, enabled) {
    let anchor, seenThisScan, panel, signature, revision = 0;
    const desktop = matchMedia("(hover: hover) and (pointer: fine)");
    const resetting = new WeakSet();
    const changes = typeof BroadcastChannel === "function" ? new BroadcastChannel("hako-af-explore-analysis") : null;
    changes?.addEventListener("message", event => {
      if (typeof event.data === "string" && panel?.data?.identity?.owner === event.data) renderHistory(panel);
    });

    function createPanel(target, mode) {
      const root = node("details", "explore-analysis");
      const guild = mode === "guild";
      const title = guild ? "ギルダンの獲得量" : "探索の獲得量";
      root.setAttribute("aria-label", title);
      const table = node("table", "explore-analysis-table");
      table.setAttribute("aria-label", title);
      const head = table.createTHead().insertRow();
      for (const heading of guild ? ["項目", "今回"] : ["項目", "今回", "直近30日", "累計"]) {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = heading;
        head.append(cell);
      }
      const body = table.createTBody();
      const columns = guild ? 1 : 3;
      const rows = ["探索時間", "ストック", "AF / 1ストック", "経験値 / 1ストック", "ゴールド / 1ストック", "勝率"].map(label => {
        const row = body.insertRow();
        const heading = document.createElement("th");
        heading.scope = "row";
        heading.textContent = label;
        row.append(heading);
        return Array.from({ length: columns }, () => row.insertCell());
      });
      const [elapsedCells, ...cells] = rows;
      elapsedCells[0].title = "探索のボタンを押してから探索サマリが表示されるまで";
      for (const cell of elapsedCells.slice(1)) cell.textContent = "—";
      const winCells = cells.pop();
      const note = node("p", "explore-analysis-note");
      note.setAttribute("role", "status");
      const footer = node("div", "explore-analysis-footer");
      footer.append(note);
      const active = { root, elapsed: elapsedCells[0], cells, winCells, note, mode };
      if (!guild) {
        active.reset = resetButton(footer, "統計をリセット", () => active.data.identity, note);
        active.reset.disabled = true;
      }
      root.append(node("summary", "explore-analysis-title", title), table, footer);
      target.after(root);
      return active;
    }

    function updateDisclosure(active, hasDrops) {
      const compact = !!hasDrops && desktop.matches;
      if (active.compact === compact) return;
      active.compact = compact;
      active.root.open = !compact;
    }
    desktop.addEventListener("change", () => {
      if (panel) updateDisclosure(panel, panel.data?.hasDrops);
    });

    function render(panel, column, data) {
      const stocks = data?.stocks;
      panel.cells[0][column].textContent = stocks > 0 ? integer.format(stocks) : "—";
      for (const [index, unit] of [[1, " 個"], [2, " EXP"], [3, " G"]]) {
        panel.cells[index][column].textContent = stocks > 0 ? average.format(data[metrics[index]] / stocks) + unit : "—";
      }
      const cell = panel.winCells[column];
      const battles = hasBattles(data) ? data.wins + data.losses : 0;
      if (battles > 0) {
        cell.replaceChildren(`${average.format(100 * data.wins / battles)}%`,
          node("small", "explore-analysis-record", `${integer.format(data.wins)}勝${integer.format(data.losses)}敗`));
      } else {
        cell.textContent = "—";
      }
    }

    function renderHistory(active, notice) {
      const request = ++revision;
      const { identity, current } = active.data;
      const note = (...parts) => { active.note.textContent = [active.method, ...parts].filter(Boolean).join(" · "); };
      render(active, 1);
      render(active, 2);
      active.reset.disabled = !identity || resetting.has(active.reset);
      if (!identity) {
        note("今回の結果を端末の履歴に紐づけられませんでした");
        return;
      }
      updateHistory(identity, current?.stocks > 0 ? current : null).then(({ recent, all }) => {
        if (request !== revision) return;
        render(active, 1, recent);
        render(active, 2, all);
        const count = `集計した結果 ${integer.format(recent.count)}件（直近30日） / ${integer.format(all.count)}件（累計）`;
        const coverage = (all.battleSamples ?? 0) < all.count ? "勝率は戦績を記録できた結果から集計" : "";
        note(notice, count, coverage);
      }).catch(() => {
        if (request === revision) note("このブラウザで探索履歴を保存できませんでした");
      });
    }

    async function resetStats(identity, button, status) {
      if (!identity) {
        status.textContent = "ゲームのアカウント情報を読み込んでから再度お試しください";
        return;
      }
      if (resetting.has(button) || !window.confirm("このブラウザの通常探索の統計（直近30日・累計）をリセットしますか？\n画面には今回の結果が残ります。")) return;
      resetting.add(button);
      button.disabled = true;
      try {
        await resetHistory(identity);
        changes?.postMessage(identity.owner);
        status.textContent = "統計をリセットしました";
        if (panel?.data.identity?.owner === identity.owner) renderHistory(panel, "統計をリセットしました");
      } catch {
        status.textContent = "探索統計をリセットできませんでした";
      } finally {
        resetting.delete(button);
        button.disabled = false;
      }
    }

    function resetButton(container, label, getIdentity, status) {
      const button = node("button", "extra-button", label);
      button.type = "button";
      button.addEventListener("click", () => resetStats(getIdentity(button), button, status));
      container.append(button);
      return button;
    }

    function appendSettingsReset(section) {
      const controls = node("div", "explore-analysis-footer");
      const status = node("p", "explore-analysis-note");
      status.setAttribute("role", "status");
      resetButton(controls, "通常探索の統計をリセット", button => {
        let owner;
        const read = event => { owner = JSON.parse(event.detail); };
        button.addEventListener("hako-af:explore-owner", read, { once: true });
        button.dispatchEvent(new Event("hako-af:read-explore-owner", { bubbles: true }));
        button.removeEventListener("hako-af:explore-owner", read);
        return typeof owner === "string" && owner ? { owner } : null;
      }, status);
      controls.append(status);
      section.append(controls);
    }

    document.addEventListener("hako-af:explore-analysis", event => {
      if (!enabled("exploreAnalysis") || !(event.target instanceof Element)) return;
      let data;
      try { data = JSON.parse(event.detail); } catch { return; }
      if (!["normal", "guild"].includes(data?.mode)) return;
      seenThisScan = true;
      if (anchor !== event.target || panel?.mode !== data.mode || !panel.root.isConnected) {
        panel?.root.remove();
        anchor = event.target;
        panel = createPanel(anchor, data.mode);
        signature = null;
      }
      if (signature === event.detail) return;
      signature = event.detail;
      revision++;
      panel.data = data;
      updateDisclosure(panel, data.hasDrops);
      panel.elapsed.textContent = formatElapsed(data.elapsedMs);
      render(panel, 0, data.current);
      if (data.mode === "guild") {
        const unavailable = data.missingGuildRewards ? "挑戦全体の報酬が表示されています。今回分の内訳を取得できませんでした。"
          : "今回の戦闘回数や報酬の内訳を確認できなかったため、ストックあたりの獲得量を表示できません。";
        panel.note.textContent = data.timingOnlyNote ||
          (data.current?.stocks > 0 ? `${data.guildBattlesPerStock}戦を1ストックとして換算` : unavailable);
        return;
      }
      panel.method = data.estimated ? "戦闘回数からストックを換算" : "";
      renderHistory(panel);
    });

    function finishScan() {
      if (!seenThisScan && panel) {
        panel.root.remove();
        panel = anchor = signature = null;
        revision++;
      }
      seenThisScan = false;
    }
    return { finishScan, appendSettingsReset };
  }

  globalThis.hakoAfExploreAnalysis = { start };
})();
