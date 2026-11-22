(() => {
  "use strict";
  const stats = { hp: "体力", atk: "物攻", mtk: "魔攻", def: "物防", mdf: "魔防", spd: "速度", lck: "運" };
  function parse(text) {
    const raw = String(text ?? "").trim();
    if (raw.length > 150000) throw Error("コピー内容が大きすぎます。");
    if (raw.startsWith("{") || raw.startsWith("【はこホム拡張ステータス")) {
      const value = JSON.parse(raw.slice(raw.indexOf("{")));
      if (value.format !== "hako-stat-v1" || typeof value.species !== "string" || !/^[a-z0-9_-]+$/i.test(value.species) ||
          !Number.isFinite(value.generation) || value.generation < 0 || value.generation > 1e9 ||
          !Array.isArray(value.skills) || value.skills.length > 160 || value.skills.some(ref => !/^[sp]\.[a-z0-9_-]+$/i.test(ref))) throw Error("拡張コピーの形式を確認してください。");
      for (const [key, n] of Object.entries(value.bonus ?? {})) if (!Object.hasOwn(stats, key) && !["cri", "cdmg"].includes(key) || !Number.isFinite(n) || n < 0 || n > 1e12) throw Error("ボーナスパラメータを確認してください。");
      return value;
    }
    const head = raw.match(/【([^\n]+)】\s*Lv\s*([\d,]+)/), gen = raw.match(/世代\s*([\d,.]+)/), rank = raw.match(/Rank\s*(\d+)/i);
    if (!head || !gen) throw Error("「性能をコピー」または「拡張コピー」の内容を貼り付けてください。");
    const values = {};
    for (const [id, label] of Object.entries(stats)) {
      const m = raw.match(new RegExp(label + "\\s*([\\d,]+)"));
      if (m) values[id] = Number(m[1].replaceAll(",", ""));
    }
    return { format: "native", name: head[1], level: Number(head[2].replaceAll(",", "")),
      generation: Number(gen[1].replaceAll(",", "")), rank: rank ? Number(rank[1]) : null, observed: values };
  }

  function minimum(evaluate, target, start, limit, quantum) {
    if (!(Number.isFinite(target) && Number.isFinite(start) && start >= 0 && limit >= start && quantum > 0)) return null;
    const current = evaluate(start);
    if (current >= target) return { input: start, value: current };
    const initial = Math.ceil(start / quantum), max = Math.floor(limit / quantum);
    const value = index => evaluate(index * quantum);
    if (value(initial) >= target) return { input: initial * quantum, value: value(initial) };
    let low = initial, high = Math.min(max, initial + 1), step = 1;
    while (high < max && value(high) < target) { low = high;step *= 2;high = Math.min(max, initial + step); }
    if (!(value(high) >= target)) return null;
    while (low + 1 < high) { const mid = Math.floor((low + high) / 2);if (value(mid) >= target) high = mid;else low = mid; }
    return { input: high * quantum, value: value(high) };
  }

  function solve({ evaluate, stat, deficit, generation, af, mixedGeneration, source = "bonus", maxGeneration = 1e9 }) {
    if (!Object.hasOwn(stats, stat) || !Number.isFinite(deficit) || deficit < 0) throw Error("補いたいボーナスパラメータを確認してください。");
    if (!["bonus", "af", "generation"].includes(source) || source === "generation" && generation + deficit > maxGeneration) throw Error("比較する増加分を確認してください。");
    const base = evaluate({}), goal = evaluate(source === "af" ? { afTotal: af + deficit } : source === "generation" ? { generation: generation + deficit } : { bonusDelta: deficit });
    if (![base, goal].every(x => Number.isFinite(x?.[stat]))) throw Error("ステータスを計算できませんでした。");
    const target = goal[stat];
    const onlyAf = minimum(value => evaluate({ afTotal: value })[stat], target, af, 1e6, .01);
    const onlyGeneration = minimum(value => evaluate({ generation: value })[stat], target, generation, maxGeneration, .1);
    const mixedBase = Math.max(generation, Math.min(maxGeneration, mixedGeneration));
    const mixedAf = minimum(value => evaluate({ generation: mixedBase, afTotal: value })[stat], target, af, 1e6, .01);
    const onlyBonus = minimum(value => evaluate({ bonusDelta: value })[stat], target, 0, 1e12, 1);
    return { stat, deficit, source, base, goal, target,
      bonus: onlyBonus && { extra: onlyBonus.input, values: evaluate({ bonusDelta: onlyBonus.input }) },
      af: onlyAf && { total: onlyAf.input, extra: Math.max(0, onlyAf.input - af), values: evaluate({ afTotal: onlyAf.input }) },
      generation: onlyGeneration && { total: onlyGeneration.input, extra: Math.max(0, onlyGeneration.input - generation), values: evaluate({ generation: onlyGeneration.input }) },
      mixed: mixedAf && { generation: mixedBase, total: mixedAf.input, extra: Math.max(0, mixedAf.input - af), values: evaluate({ generation: mixedBase, afTotal: mixedAf.input }) } };
  }
  function solveMany({ evaluate, rules, generation, af, maxGeneration = 1e9 }) {
    if (!Array.isArray(rules) || !rules.length || rules.length > 7 || new Set(rules.map(r => r.stat)).size !== rules.length) throw Error("能力は1項目につき1行、最大7項目で指定してください。");
    const base = evaluate({});
    const goals = rules.map(rule => {
      const { stat, source, amount, via } = rule;
      if (!Object.hasOwn(stats, stat) || !["bonus", "af", "generation"].includes(source) || !["bonus", "af", "generation"].includes(via) || !Number.isFinite(amount) || amount < 0 || source === "generation" && generation + amount > maxGeneration) throw Error("比較条件を確認してください。");
      const goal = evaluate(source === "af" ? { af: { [stat]: af[stat] + amount } } : source === "generation" ? { generation: generation + amount } : { bonus: { [stat]: amount } });
      return { ...rule, target: goal[stat] };
    });
    const changes = { generation, af: {}, bonus: {} };
    for (let pass = 0; pass < 3; pass++) {
      for (const rule of goals) {
        const { stat, target, via } = rule;
        const key = via === "generation" ? "generation" : via === "af" ? "af" : "bonus";
        const start = key === "generation" ? changes.generation : key === "af" ? changes.af[stat] ?? af[stat] : changes.bonus[stat] ?? 0;
        const test = value => evaluate(key === "generation" ? { ...changes, generation: value } : { ...changes, [key]: { ...changes[key], [stat]: value } })[stat];
        const found = minimum(test, target, start, key === "generation" ? maxGeneration : key === "af" ? 1e6 : 1e12, key === "generation" ? .1 : key === "af" ? .01 : 1);
        if (!found) throw Error(`${stats[stat]}は試算上限内では条件を満たせません。`);
        if (key === "generation") changes.generation = found.input;else changes[key][stat] = found.input;
      }
      // A generation increase can reduce the AF or bonus needed by another row. Re-minimize those after it settles.
      for (const rule of goals.filter(r => r.via !== "generation")) {
        const { stat, via, target } = rule, key = via === "af" ? "af" : "bonus", start = key === "af" ? af[stat] : 0;
        const found = minimum(value => evaluate({ ...changes, [key]: { ...changes[key], [stat]: value } })[stat], target, start, key === "af" ? 1e6 : 1e12, key === "af" ? .01 : 1);
        if (found) changes[key][stat] = found.input;
      }
      const values = evaluate(changes);
      if (goals.every(r => values[r.stat] >= r.target)) return { base, values, changes, goals };
    }
    throw Error("条件を同時に満たす組み合わせを確認できませんでした。条件を分けてお試しください。");
  }
  function exchange({ evaluate, source, stat, from, to, generation, af = {}, bonus = {}, maxGeneration = 1e9 }) {
    const limits = { generation: maxGeneration, af: 1e6, bonus: 1e12 }, quantum = { generation: .1, af: .01, bonus: 1 };
    if (!Object.hasOwn(limits, source) || !Object.hasOwn(stats, stat) ||
        ![from, to].every(n => Number.isFinite(n) && n >= 0 && n <= limits[source])) throw Error("変更前・変更後の値を確認してください。");
    const change = (kind, key, value, base = {}) => kind === "generation" ? { ...base, generation: value } :
      { ...base, [kind]: { ...base[kind], [key]: kind === "bonus" ? value - (bonus[key] ?? 0) : value } };
    const before = change(source, stat, from), base = evaluate(before), goal = evaluate(change(source, stat, to));
    const rows = (source === "generation" ? Object.keys(stats) : [stat]).map(key => {
      if (![base[key], goal[key]].every(Number.isFinite)) throw Error("ステータスを計算できませんでした。");
      const equivalents = {};
      for (const kind of Object.keys(limits).filter(kind => kind !== source)) {
        const initial = kind === "generation" ? before.generation ?? generation : kind === "af" ? before.af?.[key] ?? af[key] ?? 0 : (bonus[key] ?? 0) + (before.bonus?.[key] ?? 0);
        const test = value => evaluate(change(kind, key, value, before))[key];
        const lower = goal[key] >= base[key] ? initial : 0;
        const found = goal[key] === base[key] ? { input: initial } : goal[key] < base[key] && test(0) > goal[key] ? null :
          minimum(test, goal[key], lower, limits[kind], quantum[kind]);
        equivalents[kind] = found && { from: initial, to: found.input, delta: found.input - initial };
      }
      return { stat: key, before: base[key], after: goal[key], delta: goal[key] - base[key], equivalents };
    });
    return { source, stat, from, to, rows };
  }
  globalThis.hakoAfStatCompensation = Object.freeze({ stats, parse, minimum, solve, solveMany, exchange });
})();
