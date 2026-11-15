(() => {
  "use strict";

  const target = globalThis.hakoAf4000.TARGET;
  const trials = 4096;
  // The v9 calculator models a great success as 10% of successful attempts.
  const greatShare = .1;
  const format = new Intl.NumberFormat("ja-JP");
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  const clampProbability = value => Math.max(0, Math.min(1, value));

  async function calculate(start, rules, stars, valid) {
    if (!Array.isArray(rules.successGain) || !Array.isArray(rules.greatGain)) return;
    const regular = rules.successGain.map(value => Math.floor(Number(value)));
    const great = rules.greatGain.map(value => Math.floor(Number(value)));
    if ([regular, great].some(range => range.length !== 2 || !range.every(Number.isFinite) || range[0] < 1 || range[1] < range[0])) return;
    const items = new Float64Array(target);
    const fees = new Float64Array(target);
    const failureLog = new Float64Array(target);
    const suffix = new Float64Array(target + 1);
    const nextAverage = (level, [min, max]) =>
      (suffix[Math.min(target, level + min)] - suffix[Math.min(target, level + max + 1)]) / (max - min + 1);
    for (let level = target - 1; level >= start; level--) {
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
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
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

    function mount(anchor) {
      const root = node("details", "enhance-estimate");
      const body = node("div", "estimate-body");
      const price = document.createElement("input");
      price.type = "text";
      price.inputMode = "numeric";
      price.placeholder = "例 1,000";
      const label = document.createElement("label");
      label.append("素材単価（G）", price);
      const market = node("a", "estimate-market", "フリマで相場を見る");
      market.target = "_blank";
      market.rel = "noopener";
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
      body.append(label, market, source, status, table);
      root.append(node("summary", "estimate-heading", `Lv${target}までの強化費用の目安`), body);
      anchor.after(root);
      const panel = { root, price, market, source, status, table, rows, ticket: 0 };
      root.addEventListener("toggle", () => {
        if (root.open) refresh(panel);
        else { panel.ticket++; panel.calculating = false; }
      });
      price.addEventListener("input", () => {
        const text = price.value.normalize("NFKC").replace(/,/g, "").trim();
        if (text && /^\d+$/.test(text) && Number.isSafeInteger(Number(text))) manual.set(panel.data.source, Number(text));
        else manual.delete(panel.data.source);
        render(panel, panel.result, text !== "" && !manual.has(panel.data.source));
      });
      panels.set(anchor, panel);
      return panel;
    }

    function render(panel, result, invalid = false) {
      const { data, market, source, rows, table } = panel;
      const entered = manual.get(data.source);
      const price = invalid ? null : entered ?? data.market?.price;
      market.href = `/market?${new URLSearchParams({ item: data.source })}`;
      const observed = data.market?.price != null
        ? `フリマ売上平均 ${format.format(data.market.price)} G（${time.format(data.market.at)} JSTに取得）`
        : "最近の売上平均なし";
      source.textContent = `${data.name} · ${invalid ? "単価は0以上の整数で入力" : entered != null ? "手入力の単価を使用" : observed}`;
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
      const key = JSON.stringify([data.level, data.stars, data.rules]);
      const entry = results.get(key);
      if (panel.key !== key) {
        panel.key = key;
        panel.ticket++;
        panel.calculating = false;
      }
      panel.result = entry;
      render(panel, entry);
      const discountNote = `強化費用の研究軽減 ${Math.round(data.rules.discount * 100)}%を反映`;
      if (entry) panel.status.textContent = discountNote;
      if (entry || panel.calculating) return;
      panel.calculating = true;
      panel.status.textContent = "計算中…";
      const ticket = ++panel.ticket;
      const valid = () => ticket === panel.ticket && panel.root.isConnected && panel.root.open;
      const result = await calculate(data.level, data.rules, data.stars, valid);
      if (!valid()) return;
      panel.calculating = false;
      panel.result = result;
      if (result) {
        if (results.size >= 24) results.delete(results.keys().next().value);
        results.set(key, result);
      }
      panel.status.textContent = result ? discountNote : "この強化条件では見積もりを計算できません。";
      render(panel, result);
    }

    let current = new Set();
    document.addEventListener("hako-af:enhance-estimate", event => {
      if (!enabled("enhanceEstimate")) return;
      let data;
      try { data = JSON.parse(event.detail); } catch { return; }
      if (!Number.isInteger(data.level) || data.level < 1 || data.level >= target || !(event.target instanceof Element)) return;
      const anchor = event.target;
      current.add(anchor);
      const panel = panels.get(anchor) ?? mount(anchor);
      if (panel.signature === event.detail) return;
      const oldSource = panel.data?.source;
      panel.signature = event.detail;
      panel.data = data;
      if (oldSource !== data.source || panel.price !== document.activeElement && !manual.has(data.source)) {
        const entered = manual.get(data.source);
        panel.price.value = entered == null ? "" : format.format(entered);
        panel.price.placeholder = data.market?.price == null ? "例 1,000" : format.format(data.market.price);
      }
      refresh(panel);
    });
    window.addEventListener("storage", event => { if (event.key === "hakoAf4000:material-prices") requestScan(); });
    return () => {
      for (const [anchor, panel] of panels) {
        if (current.has(anchor) && anchor.isConnected) continue;
        panel.ticket++;
        panel.root.remove();
        panels.delete(anchor);
      }
      current = new Set();
    };
  }

  globalThis.hakoAfEnhanceEstimate = { start };
})();
