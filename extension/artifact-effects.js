(() => {
  "use strict";

  const parameters = Object.freeze({
    hp: "体力", atk: "物攻", def: "物防", mtk: "魔攻", mdf: "魔防", spd: "速度", lck: "運"
  });
  const traits = {
    all_param: "全パラメータ", add_lck: "運", add_multi_hit: "追加ヒット数", gacha_power: "ガチャパワー",
    add_summon_power: "召喚力", add_crit: "会心率", add_crit_dmg: "会心威力", add_hit: "命中",
    add_dodge: "回避", add_crit_resit: "会心耐性", add_life_steal: "吸血", add_exp: "獲得EXP",
    add_gold: "獲得Gold", add_drop: "ドロップ率", add_spot_item_rate: "スポット獲得+1率",
    add_spot_rate: "スポット出現率", add_egg_spot_rate: "卵スポット出現率",
    add_soul_fragment_rate: "魂の欠片ドロップ率", add_map_spot_rate: "地図スポット出現率",
    add_artifact_rate: "アーティファクト変換率", add_resist_heal: "被回復量"
  };
  const elements = {
    physical: "物理", magic: "魔法", fire: "炎", ice: "氷", thunder: "雷", wind: "風",
    earth: "地", holy: "光", dark: "闇", breath: "ブレス", poison: "毒", burn: "火傷",
    blood: "出血", frozen: "凍結", sleep: "睡眠", paralysis: "麻痺", stun: "スタン",
    slow: "スロウ", charm: "魅了", curse: "呪い", fear: "恐怖", pain: "痛み", heal: "回復",
    blind: "暗闇", silence: "沈黙", acid: "劣化", deterioration: "劣化"
  };
  const damageTypes = { song: "歌唱", shot: "射撃", slash: "斬撃", spear: "刺突", punch: "格闘", breath: "ブレス" };
  const races = {
    animal: "動物", doll: "人形", "demi-human": "亜人", ghost: "霊", machine: "機械", fairy: "妖精",
    insect: "虫", devil: "悪魔", dragon: "ドラゴン", undead: "アンデッド", aquatic: "水棲",
    plant: "植物", slime: "スライム", angel: "天使", mythical: "幻獣", mysterious: "神秘",
    magical_beast: "魔獣", god: "神"
  };
  const prefixes = [
    ["add_appropriate_", elements, "適正"], ["add_resist_", elements, "耐性"],
    ["add_tag_damage_", damageTypes, "ダメージ"], ["add_race_param_", races, "強化"]
  ];
  const hiddenTraits = new Set(["all_param", "add_hp", "add_atk", "add_def", "add_mtk", "add_mdf", "add_spd"]);
  const flatTraits = new Set(["add_lck", "gacha_power"]);
  const groups = Object.freeze({
    basic: "基本", parameter: "パラメータ", reward: "報酬", explore: "探索", combat: "戦闘・能力",
    damage_type: "ダメージ種別", race: "種族強化", appropriate: "属性適正",
    resist: "属性耐性", other: "その他の特性"
  });
  const traitGroups = new Map([
    ["reward", ["add_drop", "add_gold", "add_exp"]],
    ["explore", ["add_spot_rate", "add_spot_item_rate", "add_egg_spot_rate", "add_map_spot_rate",
      "add_soul_fragment_rate", "add_artifact_rate", "gacha_power"]],
    ["combat", ["add_lck", "add_crit", "add_crit_dmg", "add_hit", "add_dodge", "add_crit_resit",
      "add_life_steal", "add_multi_hit", "add_summon_power"]]
  ].flatMap(([group, keys]) => keys.map(key => [key, group])));

  function traitLabel(key) {
    if (Object.hasOwn(traits, key)) return traits[key];
    for (const [prefix, names, suffix] of prefixes) {
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length);
        return (Object.hasOwn(names, name) ? names[name] : name) + suffix;
      }
    }
    return key;
  }

  function traitValue(key, raw) {
    if (key === "add_multi_hit") return { n: Math.round(raw), unit: "回" };
    if (flatTraits.has(key)) return { n: Math.round(raw), unit: "" };
    // Convert the stored fraction to the percentage used by the game's detail and standard filters.
    if (key.startsWith("add_race_param_")) raw *= 2.25;
    if (key === "add_hit" || key === "add_dodge") raw *= 0.5;
    return { n: Number((raw * 100).toFixed(2)), unit: "%" };
  }

  function readSnapshot(artifact) {
    const { params, traits, rarities } = artifact ?? {};
    const level = Number(artifact?.level);
    if (!Number.isSafeInteger(level) || level < 1 || !params || !Array.isArray(traits)) return null;
    const stars = key => {
      const rank = rarities?.[key];
      return rank == null ? 0 : Math.min(5, Math.max(1, Math.floor(Number(rank) || 1)));
    };
    const parameters = Object.entries(params)
      .filter(([key, value]) => /^[a-z]+$/.test(key) && Number.isFinite(value))
      .map(([key, value]) => [key, value, stars(key)]);
    const effects = traits
      .filter(trait => /^[a-z][a-z0-9_-]{0,79}$/.test(trait?.key ?? "") && Number.isFinite(Number(trait.value)))
      .map(({ key, value }) => [key, Number(value), stars(key)]);
    return { level, parameters, effects };
  }

  function readEffects(snapshot) {
    const metrics = new Map();
    for (const [key, n, stars] of snapshot.parameters) {
      if (n !== 0 && Object.hasOwn(parameters, key)) {
        metrics.set("stat_" + key, { n: Number(n.toFixed(2)), unit: "%", stars });
      }
    }
    const totals = new Map();
    for (const [key, raw, stars] of snapshot.effects) {
      if (hiddenTraits.has(key)) continue;
      totals.set(key, { raw: (totals.get(key)?.raw ?? 0) + raw, stars });
    }
    for (const [key, { raw, stars }] of totals) metrics.set("trait:" + key, { ...traitValue(key, raw), stars });
    for (const [key, n] of Object.entries(snapshot.opRatings ?? {})) if (key.startsWith("op_star:") && Number.isFinite(n))
      metrics.set(key, { n, unit: "★", fixed: true });
    return metrics;
  }

  function artifactPower(artifact, config) {
    if (!config) return null;
    const { param_weights: params = {}, trait_weights: traits = {}, default_trait_weight: fallback, round } = config;
    let value = 0;
    for (const [key, amount] of Object.entries(artifact.params ?? {})) {
      const weight = Number(params[key]);
      if (Number.isFinite(weight)) value += (Number(amount) || 0) * weight;
    }
    for (const { key, value: amount } of artifact.traits ?? []) {
      if (!key || hiddenTraits.has(key)) continue;
      const weight = Object.hasOwn(traits, key) ? Number(traits[key]) : Number(fallback) || 0;
      if (Number.isFinite(weight)) value += (Number(amount) || 0) * weight;
    }
    const scale = 10 ** Math.max(0, Math.floor(Number(round) || 0));
    return Math.round(value * scale) / scale;
  }

  function optionFor(key) {
    if (key.startsWith("op_star:")) {
      const op = key.slice(8), multiplier = /^add_(hp|atk|mtk|def|mdf|spd)$/.test(op);
      return { label: (op === "all_param" ? "全パラメータ倍率" : multiplier ? parameters[op.slice(4)] + "倍率" : traitLabel(op)) + " 推定", group: "other", unit: "★" };
    }
    if (key.startsWith("stat_")) return { label: parameters[key.slice(5)] ?? key, group: "parameter", unit: "%" };
    const trait = key.slice(6);
    const prefixGroup = [["add_tag_damage_", "damage_type"], ["add_race_param_", "race"],
      ["add_appropriate_", "appropriate"], ["add_resist_", "resist"]].find(([prefix]) => trait.startsWith(prefix));
    const group = traitGroups.get(trait) ?? prefixGroup?.[1] ?? "other";
    return { label: traitLabel(trait), group, unit: traitValue(trait, 0).unit };
  }

  globalThis.hakoAfEffects = Object.freeze({ parameters, readEffects, readSnapshot, optionFor, groups, artifactPower });
})();
