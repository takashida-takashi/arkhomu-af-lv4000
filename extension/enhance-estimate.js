(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const { getTarget, MAX_ESTIMATE_TARGET } = globalThis.hakoAf4000;
  // The v9 calculator models a great success as 10% of successful attempts.
  const greatShare = .1;
  const format = new Intl.NumberFormat("ja-JP");
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const clampProbability = value => Math.max(0, Math.min(1, value));

  async function calculate(start, rules, stars, valid, target = getTarget()) {
    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(target) || target <= start || target > MAX_ESTIMATE_TARGET || !valid()) return;
    if (!Array.isArray(rules.successGain) || !Array.isArray(rules.greatGain)) return;
    const regular = rules.successGain.map(value => Math.floor(Number(value)));
    const great = rules.greatGain.map(value => Math.floor(Number(value)));
    if ([regular, great].some(range => range.length !== 2 || !range.every(Number.isFinite) || range[0] < 1 || range[1] < range[0])) return;
    // Keep distant targets responsive without changing ordinary-target sampling.
    const trials = Math.max(128, Math.min(4096, Math.floor(1_000_000 * Math.min(regular[0], great[0]) / (target - start))));
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
    const items = new Float64Array(target);
    const fees = new Float64Array(target);
    const failureLog = new Float64Array(target);
    const suffix = new Float64Array(target + 1);
    const nextAverage = (level, [min, max]) =>
      (suffix[Math.min(target, level + min)] - suffix[Math.min(target, level + max + 1)]) / (max - min + 1);
    for (let level = target - 1; level >= start; level--) {
      if ((target - 1 - level) % 8192 === 0) {
        await yieldToBrowser();
        if (!valid()) return;
      }
      const step = Math.ceil(level / 100);
      const advanced = level >= rules.baseCap;
      const multiplier = advanced ? rules.advancedCost : 1;
      items[level] = Math.ceil(Math.max(1, Math.ceil(step ** rules.gamma * rules.itemsPerStep)) * multiplier);
      const baseFee = Math.floor(rules.goldMultiplier * level * rules.basePrice * (1 + stars * rules.starCoefficient));
      fees[level] = Math.floor(baseFee * multiplier * Math.max(0, 1 - rules.discount));
      const failure = Math.min(rules.failMax, rules.failRate + (step - 1) * rules.failStep);
      const success = (1 - clampProbability(failure - rules.failReduction)) * (advanced ? rules.advancedSuccess : 1);
      if (!(success > 0 && success <= 1 && Number.isFinite(items[level]) && Number.isFinite(fees[level]))) return;
      failureLog[level] = Math.log1p(-success);
      const expected = items[level] / success + (1 - greatShare) * nextAverage(level, regular) + greatShare * nextAverage(level, great);
      suffix[level] = suffix[level + 1] + expected;
    }
    const expected = Math.round(suffix[start] - suffix[start + 1]);
    const samples = new Float64Array(trials);
    let seed;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const affordableAttempts = (budget, spent, cost, attempts) =>
      Math.max(0, Math.min(attempts, Math.floor((budget - spent) / cost)));
    let goldExpected = 0, goldP90 = 0, p90;
    // Reuse the same seeded paths to estimate gold spent with either material budget.
    for (const measureGold of [false, true]) {
      seed = 123456789;
      let sliceStarted = 0;
      for (let trial = 0; trial < trials; trial++) {
        if (trial === 0 || (trial % 16 === 0 && performance.now() - sliceStarted >= 5)) {
          await yieldToBrowser();
          if (!valid()) return;
          sliceStarted = performance.now();
        }
        let spent = 0;
        for (let level = start; level < target;) {
          const attempts = 1 + Math.floor(Math.log1p(-random()) / failureLog[level]);
          const count = items[level];
          if (measureGold) {
            goldExpected += fees[level] * affordableAttempts(expected, spent, count, attempts);
            goldP90 += fees[level] * affordableAttempts(p90, spent, count, attempts);
          }
          spent += count * attempts;
          const [low, high] = random() < greatShare ? great : regular;
          level += low + Math.floor(random() * (high - low + 1));
        }
        if (!measureGold) samples[trial] = spent;
      }
      if (!measureGold) p90 = samples.sort()[Math.ceil(trials * .9) - 1];
    }
    return { expected, p90, goldExpected: Math.round(goldExpected / trials), goldP90: Math.round(goldP90 / trials) };
  }

  function start(node, enabled, requestScan) {
    const panels = new Map();
    const manual = new Map();
    const results = new Map();
    let lookup;
    let expanded = false;

    function updatePriceInput(panel) {
      const value = manual.get(panel.data.source) ?? panel.data.market?.price;
      panel.price.value = value == null ? "" : format.format(value);
    }

    function closeLookup(message = "") {
      if (!lookup) return;
      const { frame, timer, panel } = lookup;
      lookup = null;
      clearTimeout(timer);
      frame.remove();
      panel.market.disabled = false;
      panel.marketStatus.textContent = message;
    }

    function readMarket(panel) {
      if (lookup?.panel === panel) return;
      closeLookup();
      const item = panel.data.source;
      const frame = document.createElement("iframe");
      frame.dataset.ha4 = "estimate-market-frame";
      frame.hidden = true;
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
      frame.src = `/market?${new URLSearchParams({ item })}`;
      const current = lookup = { panel, frame, item };
      panel.market.disabled = true;
      panel.marketStatus.textContent = "フリマの売上平均を取得中…";

      frame.addEventListener("hako-af:material-market-price", event => {
        if (lookup !== current || !panel.root.isConnected || !panel.root.open || panel.data.source !== item) return;
        let market;
        try { market = JSON.parse(event.detail); } catch { return; }
        if (!Number.isFinite(market?.at) || (market.price !== null && !(Number.isFinite(market.price) && market.price > 0))) return;
        panel.data = { ...panel.data, market };
        if (!manual.has(item) && !panel.invalidPrice) updatePriceInput(panel);
        const keepInput = manual.has(item) || panel.invalidPrice;
        const message = market.price === null ? "フリマに売上平均のデータがありません。" :
          `売上平均 ${format.format(market.price)} G を${keepInput ? "取得しました。手入力の単価が優先されます。" : "反映しました。"}`;
        closeLookup(message);
        render(panel, panel.result);
      });

      // Check the local game store while its normal page loads, including when animation frames are paused.
      const deadline = performance.now() + 15_000;
      function check() {
        if (lookup !== current) return;
        if (!panel.root.isConnected || !panel.root.open) {
          closeLookup();
          return;
        }
        frame.dispatchEvent(new Event("hako-af:read-material-market", { bubbles: true }));
        if (lookup !== current) return;
        if (performance.now() >= deadline) {
          closeLookup("売上平均を取得できませんでした。再試行できます。");
          return;
        }
        current.timer = setTimeout(check, 250);
      }
      document.body.append(frame);
      check();
    }

    function mount(anchor) {
      const root = node("details", "enhance-estimate");
      const body = node("div", "estimate-body");
      const price = document.createElement("input");
      price.type = "text";
      price.inputMode = "numeric";
      price.placeholder = "例 1,000";
      const label = document.createElement("label");
      label.append("素材単価（G）", price);
      const market = node("button", "estimate-market", "フリマの売上平均を取得・反映");
      market.type = "button";
      const marketStatus = node("p", "estimate-market-status");
      marketStatus.setAttribute("aria-live", "polite");
      const source = node("p", "estimate-source");
      const status = node("p", "estimate-status");
      status.setAttribute("role", "status");
      const table = node("table", "estimate-table");
      const head = document.createElement("thead").insertRow();
      for (const text of ["", "期待値の素材数", "約90%到達"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = text;
        head.append(th);
      }
      const tbody = table.createTBody();
      const rows = ["必要素材数", "素材代", "強化費用", "合計"].map(text => {
        const row = tbody.insertRow();
        const th = document.createElement("th");
        th.scope = "row";
        th.textContent = text;
        row.append(th);
        return [row.insertCell(), row.insertCell()];
      });
      body.append(label, market, marketStatus, source, status, table);
      root.append(node("summary", "estimate-heading", `${names.enhanceEstimate}（Lv${getTarget()}）`), body);
      root.open = expanded;
      anchor.after(root);
      const panel = { root, price, market, marketStatus, source, status, table, rows, ticket: 0 };
      market.addEventListener("click", event => {
        if (event.isTrusted && panel.data?.source && root.open) readMarket(panel);
      });
      root.addEventListener("toggle", () => {
        if (root.isConnected) expanded = root.open;
        if (root.open) refresh(panel);
        else {
          if (lookup?.panel === panel) closeLookup();
          panel.ticket++;
          panel.calculating = false;
        }
      });
      price.addEventListener("input", () => {
        const text = price.value.normalize("NFKC").replace(/,/g, "").trim();
        if (text && /^\d+$/.test(text) && Number.isSafeInteger(Number(text))) manual.set(panel.data.source, Number(text));
        else manual.delete(panel.data.source);
        panel.invalidPrice = text !== "" && !manual.has(panel.data.source);
        render(panel, panel.result);
      });
      panels.set(anchor, panel);
      return panel;
    }

    function render(panel, result) {
      const { data, source, rows, table, invalidPrice } = panel;
      const entered = manual.get(data.source);
      const price = invalidPrice ? null : entered ?? data.market?.price;
      const observed = data.market?.price != null
        ? `フリマ売上平均 ${format.format(data.market.price)} G（${time.format(data.market.at)} JSTに取得）`
        : "最近の売上平均なし";
      source.textContent = `${data.name} · ${invalidPrice ? "単価は0以上の整数で入力" : entered != null ? "手入力の単価を使用" : observed}`;
      table.hidden = !result;
      if (!result) return;
      const { expected, p90, goldExpected, goldP90 } = result;
      const gold = number => `${format.format(number)} G`;
      for (const [column, count, fee] of [[0, expected, goldExpected], [1, p90, goldP90]]) {
        const material = price == null ? null : count * price;
        rows[0][column].textContent = `${format.format(count)} 個`;
        rows[1][column].textContent = material == null ? "—" : gold(material);
        rows[2][column].textContent = gold(fee);
        rows[3][column].textContent = material == null ? "—" : gold(material + fee);
      }
    }

    async function refresh(panel) {
      if (!panel.root.open) return;
      const target = getTarget();
      const { data } = panel;
      if (!data.rules) {
        panel.key = undefined;
        panel.ticket++;
        panel.result = undefined;
        panel.calculating = false;
        panel.status.textContent = "ゲームの強化設定の読み込みを待っています。";
        render(panel);
        return;
      }
      const key = JSON.stringify([target, data.level, data.stars, data.rules]);
      const entry = results.get(key);
      if (panel.key !== key) {
        panel.key = key;
        panel.ticket++;
        panel.calculating = false;
      }
      panel.result = entry;
      render(panel, entry);
      const discountNote = `強化費用の研究軽減 ${Math.round(data.rules.discount * 100)}%を反映`;
      const notes = target > 4500 ? `${discountNote}。Lv4500を超える部分は、現在の強化設定を外挿した目安です。` : discountNote;
      if (entry) panel.status.textContent = notes;
      if (entry || panel.calculating) return;
      if (target > MAX_ESTIMATE_TARGET) {
        panel.status.textContent = `計算負荷を抑えるため、強化費用の見積もりはLv${format.format(MAX_ESTIMATE_TARGET)}までです。性能の予測は表示できます。`;
        return;
      }
      panel.calculating = true;
      panel.status.textContent = "計算中…";
      const ticket = ++panel.ticket;
      const valid = () => ticket === panel.ticket && panel.root.isConnected && panel.root.open;
      const result = await calculate(data.level, data.rules, data.stars, valid, target);
      if (!valid()) return;
      panel.calculating = false;
      panel.result = result;
      if (result) {
        if (results.size >= 24) results.delete(results.keys().next().value);
        results.set(key, result);
      }
      panel.status.textContent = result ? notes : "この強化条件では見積もりを計算できません。";
      render(panel, result);
    }

    let current = new Set();
    document.addEventListener("hako-af:enhance-estimate", event => {
      if (!enabled("enhanceEstimate")) return;
      let data;
      try { data = JSON.parse(event.detail); } catch { return; }
      if (!Number.isInteger(data.level) || data.level < 1 || data.level >= getTarget() || !(event.target instanceof Element)) return;
      const anchor = event.target;
      current.add(anchor);
      const panel = panels.get(anchor) ?? mount(anchor);
      const signature = event.detail + ":" + getTarget();
      panel.root.querySelector("summary").textContent = `${names.enhanceEstimate}（Lv${getTarget()}）`;
      const detached = !panel.root.isConnected;
      if (detached) {
        if (lookup?.panel === panel) closeLookup();
        panel.ticket++;
        panel.calculating = false;
      }
      if (panel.root.previousElementSibling !== anchor) anchor.after(panel.root);
      if (panel.signature === signature) {
        if (detached) refresh(panel);
        return;
      }
      const sourceChanged = panel.data?.source !== data.source;
      if (sourceChanged) {
        if (lookup?.panel === panel) closeLookup();
        panel.marketStatus.textContent = "";
        panel.invalidPrice = false;
      }
      panel.signature = signature;
      panel.data = data;
      if (sourceChanged || panel.price !== document.activeElement && !panel.invalidPrice && !manual.has(data.source)) {
        updatePriceInput(panel);
      }
      refresh(panel);
    });
    window.addEventListener("storage", event => { if (event.key === "hakoAf4000:material-prices") requestScan(); });
    window.addEventListener("pagehide", () => closeLookup());
    return () => {
      for (const [anchor, panel] of panels) {
        if (current.has(anchor) && anchor.isConnected) continue;
        if (lookup?.panel === panel) closeLookup();
        panel.ticket++;
        panel.root.remove();
        panels.delete(anchor);
      }
      current = new Set();
    };
  }

  globalThis.hakoAfEnhanceEstimate = { start };
})();
