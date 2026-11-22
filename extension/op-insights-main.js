(() => {
  "use strict";
  const data = globalThis.hakoAfOPModelData;
  const optionFor = globalThis.hakoAfEffects?.optionFor;
  const getTarget = globalThis.hakoAf4000?.getTarget ?? (() => 4500);
  if (!data) return;
  const panels = new WeakMap(), fmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
  const isMultiplier = key => key === "all_param" || /^add_(hp|atk|mtk|def|mdf|spd)$/.test(key);
  const decimal = row => row.star >= 1 && row.star <= 5 && row.position != null && !row.outside && !row.count
    ? row.star + Math.min(9, Math.max(0, Math.floor(row.position / 10 + 1e-8))) / 10 : null;
  function settings() { try { return JSON.parse(localStorage.getItem("hakoAf4000:settings")) ?? {}; } catch { return {}; } }
  function evaluate(af, fallbackRank, onlyKey) {
    const rank = Number(af?.rank ?? fallbackRank ?? af?.rarities?.__artifact_rank), level = Number(af?.level);
    if (!Number.isFinite(rank) || rank < 1 || rank >= 12 || !(level >= 1)) return [];
    const growth = ((level + data.offset) / (data.reference + data.offset)) ** data.exponent;
    const shin = af.prefix?.startsWith("真・") === true;
    return (Array.isArray(af.traits) ? af.traits : []).filter(trait => !onlyKey || trait.key === onlyKey).flatMap(trait => {
      const key = trait.key, raw = Number(trait.value), star = Number(af.rarities?.[key]) || 0;
      if (typeof key !== "string" || !Number.isFinite(raw)) return [];
      const count = key === "add_multi_hit", multiplier = isMultiplier(key);
      const scale = count ? 1 : growth * (shin ? 1.25 : 1), base = multiplier ? 1 : 0;
      const n = (raw - base) / scale, row = data.graded[`${rank}|${key}`], fixed = data.fixed[`${rank}|${key}`];
      const item = { key, raw, star, count, multiplier, n: 0 };
      if (count) return [{ ...item, note: "回数はレベル換算しません", range: null }];
      if (multiplier) {
        const m = data.multipliers?.[rank]?.[key === "all_param" ? "all" : "stat"];
        if (!m) return [{ ...item, note: "このレア度の倍率OPは標本不足です" }];
        const scale = shin ? 1.25 : 1, value = 1 + (raw - 1) / scale;
        const ownStar = Math.max(1, Math.min(5, 1 + Math.floor((value - m[0]) / m[1] + 1e-8)));
        const low = m[0] + (ownStar - 1) * m[1], position = (value - low) / m[1] * 100;
        return [{ ...item, star: ownStar, inferredStar: true, position: Math.max(0, Math.min(100, position)),
          outside: position < -5 || position > 105, range: [1 + (low - 1) * scale, 1 + (low + m[1] - 1) * scale],
          n: m[ownStar + 1], note: "倍率OP単独の推定（個別倍率は共通標本）。Lv換算なし・全パラと重なる場合は本体の星と異なります" }];
      }
      if (star >= 1 && star <= 5 && row) {
        const low = row[0] + (star - 1) * row[1], high = low + row[1], position = (n - low) / row[1] * 100;
        return [{ ...item, position: Math.max(0, Math.min(100, position)), outside: position < -5 || position > 105,
          range: [low * scale + base, high * scale + base], n: row[star + 1],
          note: row[9] === 1 ? "少数標本・レア度間の傾向を併用した参考値" : row[star + 1] < 30 ? "この星の標本が少ないため参考値" : "星の推定レンジ内の位置" }];
      }
      if (!star && fixed) {
        const q = fixed.slice(1);let i = 0;while (i < q.length && q[i] < n) i++;
        return [{ ...item, percentile: Math.min(100, i / (q.length - 1) * 100), n: fixed[0],
          range: [q[0] * scale + base, q.at(-1) * scale + base], note: "星なし効果・同レア度の実測分位" }];
      }
      return [{ ...item, note: "このレア度・OPは標本不足です" }];
    });
  }
  function display(key, value, multiplier) {
    if (multiplier) return "×" + fmt.format(value);
    if (key === "add_multi_hit") return fmt.format(value) + "回";
    if (["add_lck", "gacha_power"].includes(key)) return fmt.format(value);
    const scale = key.startsWith("add_race_param_") ? 225 : key === "add_hit" || key === "add_dodge" ? 50 : 100;
    return fmt.format(value * scale) + "%";
  }
  function predict(af, { rank, level, variant, rating, ops }) {
    const tick = Math.round(rating * 10), star = Math.floor(tick / 10), fraction = tick % 10 / 10;
    if (!Number.isInteger(rank) || rank < 1 || rank >= 12 || !Number.isInteger(level) || level < 1 || level > 1e6 ||
        !Number.isFinite(rating) || rating < 1 || rating > 5.9 || Math.abs(rating * 10 - tick) > 1e-6 || !["plain", "shin", "goku"].includes(variant)) throw Error("レア度・Lv・推定評価を確認してください。");
    const shin = variant === "shin" ? 1.25 : 1, growth = ((level + data.offset) / (data.reference + data.offset)) ** data.exponent;
    const current = evaluate(af, rank);
    if (ops != null && (!Array.isArray(ops) || ops.length > 128 || new Set(ops).size !== ops.length || ops.some(key => typeof key !== "string" || !/^[a-z0-9_-]+$/.test(key)))) throw Error("試算するOPを確認してください。");
    return (ops ?? current.map(row => row.key)).map(key => current.find(row => row.key === key) ?? {
      key, raw: null, star: data.fixed[`${rank}|${key}`] ? 0 : 1, count: key === "add_multi_hit", multiplier: isMultiplier(key)
    }).map(row => {
      if (row.count) return { ...row, range: row.raw == null ? null : [row.raw, row.raw], note: "固定回数は星指定の対象外" };
      const model = row.multiplier ? data.multipliers?.[rank]?.[row.key === "all_param" ? "all" : "stat"] : data.graded[`${rank}|${row.key}`];
      if (!model) return { ...row, range: null, note: row.star ? "この条件の推定データなし" : "星指定の対象外" };
      const values = [fraction, fraction + .1].map(position => model[0] + (star - 1 + position) * model[1]);
      return { ...row, range: values.map(value => row.multiplier ? 1 + (value - 1) * shin : value * growth * shin), note: "推定★" + rating.toFixed(1) + "の帯" };
    });
  }
  function rangeAt(row, level, target) {
    if (!row.range) return null;
    const scale = row.count || row.multiplier ? 1 : ((target + data.offset) / (level + data.offset)) ** data.exponent;
    return row.range.map(value => value * scale);
  }
  const rangeText = (row, range) => [...new Set(range.map(value => display(row.key, value, row.multiplier)))].join("〜");
  const el = (tag, text) => { const node = document.createElement(tag);if (text != null) node.textContent = text;return node; };
  function nameOf(row) {
    return row.multiplier ? row.key === "all_param" ? "全パラメータ倍率" : ({hp:"体力",atk:"物攻",mtk:"魔攻",def:"物防",mdf:"魔防",spd:"速度"}[row.key.slice(4)] ?? row.key) + "倍率" : optionFor?.("trait:" + row.key)?.label ?? row.key;
  }
  const opKeys = [...new Set([...Object.keys(data.graded), ...Object.keys(data.fixed)].map(key => key.split("|")[1])
    .concat(["all_param", ...["hp", "atk", "mtk", "def", "mdf", "spd"].map(key => "add_" + key)]))]
    .sort((a, b) => nameOf({ key: a, multiplier: isMultiplier(a) }).localeCompare(nameOf({ key: b, multiplier: isMultiplier(b) }), "ja"));
  const gradedKeys = new Set(Object.keys(data.graded).map(key => key.split("|")[1]));
  let sortList;
  const sortOptions = () => sortList ??= opKeys.filter(key => gradedKeys.has(key) || isMultiplier(key))
    .map(key => [key, nameOf({ key, multiplier: isMultiplier(key) })]);
  function rating(af, key) {
    const row = evaluate(af, undefined, key)[0];
    return row ? decimal(row) : null;
  }
  function simulator(af, rank) {
    const panel = el("details"), summary = el("summary", "OPの想定値を試算（すべて★5.9など）");panel.dataset.ha4 = "op-simulator";panel.append(summary);
    const fields = el("div");fields.className = "ha4-stat-fields";const controls = {};
    function field(key, name, input) { const label = el("label", name);input.setAttribute("aria-label", name);controls[key] = input;label.append(input);fields.append(label); }
    const ranks = el("select"), names = ["コモン", "アンコモン", "レア", "エリート", "エピック", "ヒロイック", "レジェンダリー", "ミシック", "セレスティアル", "ディヴァイン", "トランセンデント"];
    ranks.append(...names.map((name, i) => new Option(name, i + 1)));ranks.value = rank;field("rank", "試算するレア度", ranks);
    const level = el("input");level.type = "number";level.min = "1";level.max = "1000000";level.step = "1";level.value = getTarget();field("level", "試算Lv", level);
    const variant = el("select");variant.append(...[["plain", "通常"], ["shin", "真"], ["goku", "極"]].map(([key, name]) => new Option(name, key)));
    variant.value = af.prefix?.startsWith("真・") ? "shin" : af.prefix?.startsWith("極・") ? "goku" : "plain";field("variant", "接頭語の補正", variant);
    const rating = el("input");rating.type = "number";rating.min = "1";rating.max = "5.9";rating.step = ".1";rating.value = "5.9";field("rating", "そろえる推定評価（★）", rating);
    const editor = el("div"), list = el("div"), add = el("button", "OPを追加"), output = el("div");
    add.type = "button";add.dataset.ha4 = "extra-button";output.setAttribute("role", "status");editor.append(el("h4", "試算するOP"), list, add);
    const selected = () => [...list.querySelectorAll("select")].map(select => select.value);
    function addOp(key) {
      const row = el("div"), select = el("select"), remove = el("button", "削除");row.className = "ha4-op-row";select.dataset.opKey = "";
      const choices = opKeys.includes(key) ? opKeys : [...opKeys, key];
      select.append(...choices.map(value => new Option(nameOf({ key: value, multiplier: isMultiplier(value) }), value)));select.value = key;
      remove.type = "button";remove.dataset.ha4 = "extra-button";remove.setAttribute("aria-label", "このOPを削除");
      remove.addEventListener("click", () => { row.remove();update(); });row.append(select, remove);list.append(row);
    }
    for (const key of new Set((af.traits ?? []).map(trait => trait.key))) addOp(key);
    add.addEventListener("click", () => { const key = opKeys.find(key => !selected().includes(key));if (key) { addOp(key);update(); } });
    function update() {
      output.replaceChildren();
      const ops = selected();add.disabled = opKeys.every(key => ops.includes(key));
      [...list.querySelectorAll("select")].forEach((select, index) => {
        select.setAttribute("aria-label", "試算するOP " + (index + 1));
        for (const option of select.options) option.disabled = option.value !== select.value && ops.includes(option.value);
      });
      if (!ops.length) { output.textContent = "試算するOPを追加してください。";return; }
      try {
        const rows = predict(af, { rank: Number(ranks.value), level: Number(level.value), variant: variant.value, rating: Number(rating.value), ops });
        const table = el("table"), head = el("tr"), thead = el("thead"), body = el("tbody");
        for (const name of ["OP", "現在値", `Lv${fmt.format(Number(level.value))}での想定値`]) head.append(el("th", name));thead.append(head);
        for (const row of rows) { const tr = el("tr");tr.append(el("th", nameOf(row)), el("td", row.raw == null ? "—" : display(row.key, row.raw, row.multiplier)),
          el("td", row.range ? rangeText(row, row.range) : row.note));body.append(tr); }
        table.append(thead, body);const scroll = el("div");scroll.className = "ha4-stat-scroll";scroll.append(table);output.append(scroll);
      } catch (error) { output.textContent = error.message; }
    }
    for (const event of ["input", "change"]) panel.addEventListener(event, update);
    panel.append(fields, editor, output, el("p", "★5.9は星内の上位90〜100%の帯です。OPの組み合わせは自由に試算できます。"));update();return panel;
  }
  function restore(node, state, text = state.native) {
    if (node.textContent === state.painted) node.textContent = text;
    for (const [key, value] of Object.entries(state.attributes)) if (node.getAttribute(key) === state.applied[key]) {
      if (value == null) node.removeAttribute(key);else node.setAttribute(key, value);
    }
  }
  function nativeStars(root, tree, rows, enabled, states) {
    const targets = new Map(), queue = [[tree, null]];
    while (queue.length) {
      const [node, inherited] = queue.pop();if (!node || typeof node !== "object") continue;
      const key = typeof node.key === "string" && node.key.match(/^at-\d+-(.+)$/)?.[1] || inherited;
      if (key && node.el?.nodeType === 1 && root.contains(node.el) && typeof node.children === "string" && /^[★☆]+$/.test(node.children)) targets.set(node.el, { key, text: node.children });
      if (node.component) queue.push([node.component.subTree, key]);
      else if (node.suspense) queue.push([node.suspense.activeBranch, key]);
      else if (Array.isArray(node.children)) for (const child of node.children) queue.push([child, key]);
    }
    for (const [node, state] of states) if (!enabled || !targets.has(node)) { restore(node, state, targets.get(node)?.text);states.delete(node); }
    if (!enabled) return;
    for (const [node, target] of targets) {
      const row = rows.find(row => row.key === target.key && !row.inferredStar && row.star === target.text.length), rating = row && decimal(row);
      if (rating == null) { const old = states.get(node);if (old) { restore(node, old, target.text);states.delete(node); }continue; }
      let state = states.get(node);
      if (!state) state = { attributes: { title: node.getAttribute("title"), "aria-label": node.getAttribute("aria-label") }, applied: {} };
      state.native = target.text;state.painted = "★" + rating.toFixed(1);
      state.applied = { title: `推定${state.painted}（本体${target.text}）`, "aria-label": `推定${state.painted}` };
      if (node.textContent !== state.painted) node.textContent = state.painted;
      for (const [key, value] of Object.entries(state.applied)) if (node.getAttribute(key) !== value) node.setAttribute(key, value);
      states.set(node, state);
    }
  }
  function render(root, item, tree) {
    if (!root?.isConnected) return;
    if (!item?._artifact) { const old = panels.get(root);if (old) { nativeStars(root, tree, [], false, old.native);old.panel.remove();panels.delete(root); }return; }
    const af = item._artifact, rank = af.rank ?? item.artifact_rank ?? af.rarities?.__artifact_rank;
    const options = settings(), showDecimal = options.opDecimalStars === true, target = getTarget(), forecast = target > af.level;
    const signature = JSON.stringify([rank, af.level, af.prefix, af.traits, af.rarities, showDecimal, target]);
    let entry = panels.get(root);
    if (!entry?.panel.isConnected) {
      const panel = el("details"), summary = el("summary", "拡張OP評価（実測から推定）"), body = el("div");
      panel.dataset.ha4 = "op-insights";panel.append(summary, body);root.append(panel);
      entry = { panel, body, native: new Map() };panels.set(root, entry);
    }
    const rows = evaluate(af, rank);
    nativeStars(root, tree, rows, options.opNativeStars === true, entry.native);
    if (entry.signature === signature) return;
    entry.signature = signature;const { body } = entry;body.replaceChildren();
    if (Number(rank) >= 12) { body.append(el("p", "エターナル以上は今回の実測分析の対象外です。"));return; }
    if (!rows.length) { body.append(el("p", "このAFはレア度・OPの比較データを取得できません。"));return; }
    const table = el("table"), head = el("tr"), thead = el("thead"), tbody = el("tbody");
    for (const title of ["OP", "現在値", "同じ星の中での位置", "このLvでの参考レンジ", ...(forecast ? [`Lv${fmt.format(target)}での参考レンジ`] : [])]) head.append(el("th", title));thead.append(head);
    for (const row of rows) {
      const tr = el("tr"), name = nameOf(row);
      tr.append(el("th", name + (row.star ? (row.inferredStar ? " 推定" : " ") + "★".repeat(Math.min(5, row.star)) : "")), el("td", display(row.key, row.raw, row.multiplier)));
      const strength = el("td");
      let label = row.count ? "固定回数" : row.position == null ? row.percentile == null ? row.note : `実測分位 ${Math.round(row.percentile)}/100` :
        row.outside ? "参考レンジ外" : `レンジ内 ${Math.round(row.position)}/100`;
      strength.append(el("span", label));
      const rating = showDecimal ? decimal(row) : null;
      if (rating != null) strength.prepend(el("strong", `推定★${rating.toFixed(1)} · `));
      if (row.position != null && !row.outside) { const meter = el("meter");meter.min = 0;meter.max = 100;meter.value = row.position;meter.setAttribute("aria-label", name + "の星内評価");strength.append(meter); }
      if (!row.multiplier && row.note !== "星の推定レンジ内の位置") strength.append(el("small", row.note));
      tr.append(strength, el("td", row.range ? rangeText(row, row.range) : "—"));
      if (forecast) { const range = rangeAt(row, af.level, target);tr.append(el("td", range ? rangeText(row, range) : "—")); }tbody.append(tr);
    }
    table.append(thead, tbody);const scroll = el("div");scroll.className = "ha4-stat-scroll";scroll.append(table);body.append(scroll, simulator(af, Number(rank)));
  }
  globalThis.hakoAfOPInsights = Object.freeze({ evaluate, render, decimal, predict, rangeAt, sortOptions, rating });
})();
