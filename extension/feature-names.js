(() => {
  "use strict";

  globalThis.hakoAfFeatureNames = Object.freeze({
    settings: "拡張設定",
    updates: "拡張更新",
    forecast: "拡張予測",
    filter: "拡張フィルタ",
    sort: "拡張ソート",
    home: "拡張通知",
    slot: "拡張スロット",
    explore: "拡張探索結果",
    exploreAnalysis: "拡張探索統計",
    expedition: "拡張遠征",
    gacha: "拡張ガチャ結果",
    gachaSets: "拡張セット",
    skinSort: "拡張ソート（未入手を先に）",
    enhanceEstimate: "拡張強化見積もり",
    marketWatch: "拡張価格追跡",
    hiddenTitles: "拡張称号",
    monsterBoxes: "拡張ボックス",
    dungeonRewards: "拡張初回報酬",
    skillPresets: "拡張スキルプリセット",
    partyShare: "拡張編成共有",
    trainingRoutes: "拡張育成ルート",
    trainingPlanner: "拡張育成プランナー",
    statSimulator: "拡張ステータスシミュレーター",
    chat: "拡張チャット",
    daily: "拡張日次収支"
  });
  // Typed route names keep the existing editable string format and name-only routes readable.
  const normalize = value => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  const parse = value => {
    const text = normalize(value), match = /^(.*)【(アクティブ|パッシブ)】$/.exec(text);
    return match ? { name: match[1], kind: match[2] === "パッシブ" ? "passive" : "skill" } : { name: text, kind: null };
  };
  const typed = (value, kind) => `${parse(value).name}【${kind === "passive" || kind === "p" ? "パッシブ" : "アクティブ"}】`;
  const routeOrder = route => {
    const key = name => /^[sp]\./.test(route.previewSkillIds?.[name] ?? "")
      ? typed(name, route.previewSkillIds[name][0]) : normalize(name);
    const groups = [Array.isArray(route.ordinary) ? route.ordinary : route.ordinaryNames ?? [],
      Array.isArray(route.permanent) ? route.permanent : route.permanentNames ?? []]
      .map(list => list.map(name => ({ name, key: key(name) })));
    if (route.rank6Passive) groups.push([{ name: typed(route.rank6Passive.name, "passive"), key: typed(route.rank6Passive.name, "passive") }]);
    if (typeof route.orderUnique === "string" && parse(route.orderUnique).kind) groups.push([{ name: route.orderUnique, key: key(route.orderUnique) }]);
    const available = new Map(groups.flat().map(item => [item.key, item]));
    const ordered = [...new Map([...(route.skillOrder ?? []).filter(name => typeof name === "string").map(key), ...available.keys()]
      .filter(id => available.has(id)).map(id => [id, available.get(id)])).values()];
    // The imported processing order is independent of ordinary/permanent allocation.
    return ordered.map(item => item.name);
  };
  globalThis.hakoAfSkillIdentity = Object.freeze({ parse, typed, routeOrder,
    elementKind: root => {
      const header = root?.closest(".skill-header") ?? root?.parentElement?.closest(".w-full")?.querySelector(".skill-header") ?? root;
      const badge = [...(header?.querySelectorAll("span") ?? [])].map(el => el.textContent.trim())
        .find(text => ["パッシブ", "アクティブ", "スキル"].includes(text));
      return badge ? badge === "パッシブ" ? "passive" : "skill" : null;
    },
    kind: value => typeof value === "string" && /^(?:auto-)?(?:[sp]|skill|passive|active)[:.]/.test(value)
      ? /^(?:auto-)?(?:p|passive)[:.]/.test(value) ? "passive" : "skill" : null,
    matches: (set, value, kind) => !!set && (set.has(parse(value).name) || !!kind && set.has(typed(value, kind)))
  });
})();
