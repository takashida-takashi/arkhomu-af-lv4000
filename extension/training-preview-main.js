(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;
  const readMasters = globalThis.hakoAfTrainingSources?.readMasters;
  const { readSnapshot, artifactPower } = globalThis.hakoAfEffects;
  const { POWER, SUM, dropMetrics, metricValue, viewRule } = globalThis.hakoAfListRules;
  const { getTarget } = globalThis.hakoAf4000;
  const stats = ["hp", "atk", "mtk", "def", "mdf", "spd", "lck", "cri", "cdmg"];
  const core = stats.slice(0, 6);
  const day = 86400000;
  const seasons = "hakoAf4000:official-season-end";
  const skillLevelsPrefix = "hakoAf4000:planner-levels:";
  const openings = ["battle_start_fast", "battle_start", "battle_start2"];
  const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const number = (value, fallback = 0) => value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
  const entries = value => Object.entries(value ?? {});
  const add = (values, key, amount) => { values[key] = (values[key] ?? 0) + amount; };
  const has = (criteria, values) => array(criteria).some(value => values.includes(value));
  const empty = () => ({ rate: {}, flat: {}, final: {}, apt: {}, setApt: {}, hpRate: 0 });
  const props = () => document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
  const JST = 9 * 3600000;

  function settings(input, config, official) {
    const limits = config.monster ?? {};
    const level = config.stats?.internal ?? {};
    const pvp = config.pvp?.official ?? {};
    const curve = number(limits.levelCapCurveExponent, .5);
    const base = number(limits.levelCapBase, 50);
    const perGen = number(limits.levelCapGrowth, 50);
    const top = number(limits.levelCapMax, 1000);
    const generation = input.generation == null ? perGen > 0 ? Math.ceil(Math.max(0, (top - base) / perGen) ** (1 / curve)) : 0 :
      Math.max(0, number(input.generation));
    return {
      generation,
      level: official ? number(pvp.unifiedLevel, 100) : Math.min(top, Math.max(1, Math.floor(base + perGen * generation ** curve))),
      potential: official ? 0 : number(limits.internalAccBase, 100) + number(limits.internalAccGrowth, 100) * generation ** curve,
      hp: number(config.stats?.hpMultiplier, 3),
      base: number(level.base, 100),
      growth: number(level.growthPerLevel, 5),
      maxRank: number(limits.rankPromotion?.maxRank, 6),
      rank6: number(limits.rankPromotion?.rank6BaseMultiplier, 1),
      pvp
    };
  }

  function startingStats(monster, input, context, rank, official) {
    const baseRank = monster.rank;
    const scale = r => number(context.pvp.rankScale?.[r], 1);
    const scaled = core.map(key => Math.max(0, number(monster[`base_${key}`])) * scale(baseRank));
    const sum = scaled.reduce((total, value) => total + value, 0);
    const [low, high] = context.pvp.rankBand ?? [360, 560];
    const band = sum > 0 ? Math.min(high, Math.max(low, sum)) / sum : 1;
    const rankBonus = rank > baseRank ? scale(baseRank) / scale(rank) * (rank >= 6 ? context.rank6 : 1) : 1;
    const growth = context.base + context.growth * (context.level - 1) + context.potential;
    const base = Object.fromEntries(core.map((key, i) => {
      const hp = key === "hp";
      // The official party view rounds the normalized species base before applying Lv100 growth.
      const raw = official ? Math.round(scaled[i] * band * (hp ? number(context.pvp.hpMultiplier, context.hp) / context.hp : 1)) :
        number(monster[`base_${key}`]) * rankBonus;
      return [key, Math.floor(Math.floor(growth * raw / 100) * (hp ? context.hp : 1)) +
        (official ? 0 : Math.floor(number(input.bonus?.[key])))];
    }));
    for (const [key, fallback] of [["lck", 100], ["cri", 5], ["cdmg", 150]]) {
      base[key] = number(monster[`base_${key}`], fallback) + (official ? 0 : number(input.bonus?.[key]));
    }
    return base;
  }

  const matchKeys = new Set(["type", "race", "exclude_race", "exact_race", "not_exact_race", "category",
    "exclude_category", "monster_id", "has_passive", "exclude_passive", "exclude_summoned", "only_summoned", "require_ally_race"]);
  function matches(member, match, team, ignoreRace = false) {
    if (!match) return true;
    if (Object.keys(match).some(key => !matchKeys.has(key)) || match.only_summoned) return false;
    const { races, categories, passiveIds } = member;
    if (has(match.exclude_race, races) || has(match.exclude_category, categories) || has(match.exclude_passive, passiveIds)) return false;
    const exact = criteria => criteria.length === races.length && criteria.every(race => races.includes(race));
    if (match.exact_race?.length && !exact(match.exact_race) || match.not_exact_race?.length && exact(match.not_exact_race)) return false;
    if (match.require_ally_race) {
      const { race, count, include_self: includeSelf } = match.require_ally_race;
      if (team.filter(other => (includeSelf || other !== member) && has(race, other.races)).length < count) return false;
    }
    const checks = [[ignoreRace ? null : match.race, races], [match.category, categories],
      [match.monster_id, [member.master.id]], [match.has_passive, passiveIds]].filter(([criteria]) => array(criteria).length);
    return !checks.length || (match.type === "or" ? checks.some(([key, values]) => has(key, values)) :
      checks.every(([key, values]) => has(key, values)));
  }

  function countMembers(team, source, filter, excludeSelf = false) {
    return team.filter(member => (!(excludeSelf || filter.exclude_self || filter.include_self === false) || member !== source) &&
      (!filter.race || has(filter.race, member.races)) && (!filter.category || has(filter.category, member.categories)) &&
      (!filter.monster_id || has(filter.monster_id, [member.master.id])) && !has(filter.exclude_ally_passive, member.passiveIds)).length;
  }

  function assignStats(bucket, destination, targets, amount) {
    for (const target of array(targets).flatMap(key => key === "all" ? core.slice(1) : [key])) {
      const key = target === "max_hp" ? "hp" : target === "cri_dmg" ? "cdmg" : target;
      if (stats.includes(key)) add(bucket[destination], key, amount);
    }
  }

  function applyOwn(member, effect, bucket, team, stage) {
    if (!matches(member, effect.source_match, team) || !matches(member, effect.match, team)) return;
    if (effect.source_condition) return;
    const value = number(effect.value);
    const perAlly = effect.per_ally_race || effect.per_ally_category;
    const count = perAlly ? Math.min(number(effect.max_ally_count, Infinity),
      countMembers(team, member, { race: effect.per_ally_race, category: effect.per_ally_category,
        exclude_ally_passive: effect.exclude_ally_passive }, true)) : 0;
    if (perAlly && stage !== 2) return;
    if (effect.type === "param" && !effect.conditions) {
      const identity = array(effect.holder_identity_multipliers).reduce((factor, matchesIdentity) =>
        has(matchesIdentity.race, member.races) || has(matchesIdentity.category, member.categories) ||
        has(matchesIdentity.monster_id, [member.master.id]) ? Math.max(factor, number(matchesIdentity.value, 1)) : factor, 1);
      let total = value * identity + number(effect.per_level) * Math.min(1000, member.level);
      if (perAlly) total = effect.effect === "add_fix_param" || effect.value_per_ally == null ? total * count :
        total + number(effect.value_per_ally) * count;
      if (effect.max_value != null) total = Math.min(total, number(effect.max_value));
      if (effect.effect === "add_fix_param") assignStats(bucket, "final", effect.target_stat, total);
      else if (effect.effect === "add_param") {
        const flat = effect.add_type === "add" || effect.add_type === "reduce";
        assignStats(bucket, flat ? "flat" : "rate", effect.target_stat, effect.add_type === "reduce" ? -total : total);
      }
    } else if (effect.type === "add_appropriate" && typeof effect.effect === "string") {
      if (effect.value_per_active_skill != null) {
        const tags = array(effect.active_skill_tags);
        const total = member.actives.filter(skill => !tags.length || has(tags, array(skill.tags))).length;
        add(bucket.apt, effect.effect, value + total * number(effect.value_per_active_skill));
      } else add(bucket.apt, effect.effect, value + count * number(effect.value_per_ally));
    } else if (effect.type === "add_all_appropriate") {
      for (const key of member.aptKeys) add(bucket.apt, key, value);
    } else if (effect.type === "set_appropriate") {
      for (const key of array(effect.effects)) bucket.setApt[key] = value;
    }
  }

  const loadouts = {
    normal: [af => af.is_equipped_normal ?? af.is_equipped, "artifact_equip_slot_order"],
    boss: [af => af.is_equipped_boss, "artifact_boss_equip_slot_order"],
    pvp: [af => af.is_equipped_rating, "artifact_rating_equip_slot_order"]
  };
  const afLimit = 5;
  const afPageSize = 48;
  const searchKey = value => value.normalize("NFKC").trim().toLocaleLowerCase("ja");
  const inventoryLoads = new WeakMap();
  let inventoryCache, browseCache, artifactRequest = 0;

  function artifactName(item, translate) {
    const af = item?._artifact;
    const nameKey = item.name_key ?? item.m_items?.name_key;
    const masterName = nameKey && translate?.(nameKey);
    const base = item.display_name || item.name || (masterName !== nameKey && masterName) || item.m_items?.name || item.source_item_id || "アーティファクト";
    return af.nickname || item.custom_name || af.custom_name || `${af.prefix ?? ""}${af.is_back_dungeon ? "【裏】" : ""}${base}`;
  }

  function readArtifact(item, translate, power, metric) {
    const af = item._artifact;
    const image = item.m_items?.image_file_name ?? item.source_item_id;
    return { id: String(item.id), name: artifactName(item, translate), level: number(af.level),
      image: typeof image === "string" && image ? `/images/items/${encodeURIComponent(image)}.png` : "/images/items/dummy.png",
      rank: af.rank ?? item.artifact_rank, favorite: !!af.is_favorite, power,
      ...(metric ? { metric } : {}), params: af.params ?? {}, passive: item.m_items?.artifact_passive ?? item.artifact_passive,
      traits: array(af.traits).filter(trait => /^(?:add_appropriate_|add_race_param_|add_crit$|add_crit_dmg$|add_lck$)/.test(trait?.key ?? ""))
        .map(({ key, value }) => ({ key, value })) };
  }

  function loadInventory(store, start) {
    if (!store || store.isArtifactsLoaded) return;
    let loading = inventoryLoads.get(store);
    if (!loading && start && typeof store.fetchArtifacts === "function") {
      // The standard equipment screen uses this same loader. Only the picker open/retry action can start it.
      loading = Promise.resolve().then(() => store.fetchArtifacts()).catch(() => {}).finally(() => inventoryLoads.delete(store));
      inventoryLoads.set(store, loading);
    }
    return loading;
  }

  function inventory(all) {
    if (inventoryCache && inventoryCache.all === all) return inventoryCache;
    const rows = array(all).filter(item => item?._artifact && item.id != null);
    const ranks = [...new Set(rows.map(row => String(row._artifact.rank ?? row.artifact_rank ?? "")).filter(Boolean))];
    return inventoryCache = { all, rows, ranks };
  }

  function equippedArtifacts(store, mode, translate, powerConfig) {
    const [equipped, key] = loadouts[mode];
    const rows = array(store?.allArtifacts).filter(item => item?._artifact && item.id != null && equipped(item._artifact));
    let order;
    try { order = JSON.parse(localStorage.getItem(key)); } catch { /* Use the store order. */ }
    if (Array.isArray(order)) {
      const positions = new Map(order.map((id, index) => [String(id), index]));
      rows.sort((a, b) => (positions.get(String(a.id)) ?? afLimit) - (positions.get(String(b.id)) ?? afLimit));
    }
    return rows.slice(0, afLimit).map(item => readArtifact(item, translate, artifactPower(item._artifact, powerConfig)));
  }

  async function browseArtifacts(source, request, translate, powerConfig, current) {
    const { query, favorite, rank, sortKey, sortDirection, useForecast, root, showUnknown } = request;
    const signature = JSON.stringify([query, favorite, rank, sortKey, sortDirection, useForecast, root, showUnknown]);
    if (browseCache?.source === source && browseCache?.signature === signature && browseCache?.powerConfig === powerConfig) return browseCache;
    const rule = viewRule({ root, useForecast, showUnknown });
    const terms = typeof query === "string" && query ? searchKey(query).split(/\s+/).filter(Boolean) : [];
    const compareMetric = sortKey === POWER || sortKey === SUM || /^(?:stat_|trait:)/.test(sortKey);
    const counts = new Map();
    const records = [];
    let matched = 0, unknown = 0, total = 0, processed = 0;
    for (const item of source.rows) {
      if (++processed % 2500 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (current !== artifactRequest) return null;
      }
      const af = item._artifact;
      if (favorite && !af.is_favorite || rank && String(af.rank ?? item.artifact_rank) !== rank) continue;
      const name = terms.length || sortKey === "name" ? artifactName(item, translate) : "";
      const normalizedName = terms.length ? searchKey(name) : "";
      if (terms.length && !terms.every(term => normalizedName.includes(term))) continue;
      total++;
      const snapshot = readSnapshot(af);
      const power = artifactPower(af, powerConfig);
      const metrics = dropMetrics(snapshot, power);
      for (const key of metrics.metrics.keys()) counts.set(key, (counts.get(key) ?? 0) + 1);
      const status = rule.check(metrics);
      if (status.unknown) unknown++;
      if (status.result === true) matched++;
      if (!status.show) continue;
      const metric = compareMetric ? metrics.metrics.get(sortKey) : null;
      const value = metric ? metricValue(metrics, metric, useForecast) : sortKey === "name" ? name :
        sortKey === "level" ? number(af.level) : sortKey === "recent" ? item.created_at : null;
      records.push({ item, value, power, unit: metric?.unit ?? "",
        predicted: value != null && !!metric && !!useForecast && metrics.level < getTarget() });
    }
    const direction = sortDirection === "asc" ? 1 : -1;
    records.sort((a, b) => {
      if (a.value == null || b.value == null) return Number(a.value == null) - Number(b.value == null);
      return direction * (typeof a.value === "string" ? a.value.localeCompare(b.value, "ja") : a.value - b.value);
    });
    return browseCache = { source, signature, powerConfig, records, counts: [...counts], total, matched, unknown,
      active: rule.active, error: rule.error };
  }

  function artifactBonuses(member, afs, bucket) {
    for (const af of afs) {
      for (const key of [...core, "lck"]) add(bucket.rate, key, number(af?.params?.[key]) / 100);
      for (const trait of array(af?.traits)) {
        if (typeof trait?.key !== "string") continue;
        const value = number(trait.value);
        if (trait.key.startsWith("add_appropriate_")) add(bucket.apt, trait.key.slice(16), value);
        if (trait.key.startsWith("add_race_param_") && member.races.includes(trait.key.slice(15))) {
          assignStats(bucket, "rate", ["atk", "mtk", "def", "mdf"], value);
        }
        if (trait.key === "add_crit") add(bucket.flat, "cri", value * 100);
        if (trait.key === "add_crit_dmg") add(bucket.flat, "cdmg", value * 100);
        if (trait.key === "add_lck") add(bucket.flat, "lck", value);
      }
    }
  }

  function timedEffect(bucket, effect, value, seen) {
    if (effect.effect === "add_appropriate") {
      for (const key of array(effect.element)) add(bucket.apt, key, value);
    } else if (effect.effect === "add_fix_param" || effect.effect === "add_param") {
      assignStats(bucket, effect.effect === "add_fix_param" ? "final" : "rate", effect.target_stat, value);
    } else if (effect.effect === "add_max_hp_rate" || effect.effect === "add_max_hp_by_ally_count") {
      bucket.hpRate += value;
    } else {
      const buff = String(effect.effect === "buff" ? effect.buff_id : effect.effect).replace(/^buff_/, "");
      const prayer = /^prayer_of_(fire|ice|thunder|wind|earth|holy|dark)(?:ness)?$/.exec(buff);
      const mastery = /^appropriate_up_(fire|ice|thunder|wind|earth|holy|dark)$/.exec(buff);
      if (!(prayer || mastery) || seen.has(buff)) return;
      seen.add(buff);
      add(bucket.apt, (prayer ?? mastery)[1], prayer ? .2 : .3);
      if (prayer) assignStats(bucket, "rate", ["atk", "mtk"], .2);
    }
  }

  function startEffect(target, source, effect, bucket, team, skills, seen, index) {
    if (!matches(source, effect.source_match, team) || !matches(target, effect.target_match, team) ||
        effect.target_race && !has(effect.target_race, target.races) ||
        effect.target_monster_id && !has(effect.target_monster_id, [target.master.id]) ||
        effect.require_ally_monster_ids?.some(id => !team.some(ally => ally !== source && ally.master.id === id))) return;
    if (effect.require_ally_race && !matches(source, { require_ally_race: effect.require_ally_race }, team)) return;
    const skill = skills.get(effect.skill_id);
    const aim = effect.target ?? skill?.target ?? "self";
    if (aim === "self" && source !== target || !["self", "all_ally"].includes(aim) ||
        (effect.exclude_self || skill?.target_exclude_self) && source === target) return;
    if (skill && (skill.need_power || skill.need_divine || skill.need_combo || skill.need_drone || skill.need_tension || skill.caster_race)) return;
    if (effect.once_per_side && seen.has(index)) return;
    if (effect.once_per_side) seen.add(index);
    const effects = skill ? array(skill.apply_effects) : array(effect.apply);
    for (const action of effects) {
      if (number(action.apply_rate, 1) < 1 || action.conditions || action.source_condition || action.target_condition) continue;
      const filter = action.per_ally_count ?? action.count_match;
      const value = number(action.value) * (filter ? countMembers(team, source, filter) : 1);
      timedEffect(bucket, action, value, seen);
    }
  }

  function stageValues(member, team, stage, skills) {
    const own = empty(), af = empty(), allies = empty(), equipment = empty();
    for (const ally of team) {
      ally.races = array(ally.master.race).slice();
      const originals = ally.races.slice();
      for (const passive of [...ally.own, ...(stage >= 1 ? ally.af : [])]) for (const effect of array(passive.effects)) {
        if (effect.type === "grant_race" && matches({ ...ally, races: originals }, effect.source_match, team)) {
          for (const race of array(effect.race)) if (!ally.races.includes(race)) ally.races.push(race);
        }
      }
    }
    const buffs = new Set();
    for (const source of team) {
      if (source !== member && stage !== 2) continue;
      const passives = [...source.own, ...(stage >= 1 ? source.af : [])];
      for (const passive of passives) {
        const bucket = source !== member ? allies : source.af.includes(passive) ? af : own;
        for (const [i, effect] of array(passive.effects).entries()) {
          if (source === member) applyOwn(member, effect, bucket, team, stage);
          if (openings.includes(effect.type)) {
            startEffect(member, source, effect, bucket, team, skills, buffs, `${passive.id}:${i}`);
          } else if (["all_ally_add_stat", "all_ally_add_max_hp", "all_ally_add_appropriate", "all_battler_add_stat"].includes(effect.type)) {
            if ((effect.exclude_self || effect.exclude_source) && source === member ||
                effect.self_and_follower_master && source !== member ||
                !matches(source, effect.source_match, team) || !matches(member, effect.target_match ?? effect.match, team)) continue;
            const filter = effect.count_scaling;
            if (filter && stage !== 2) continue;
            const count = filter ? countMembers(team, source, filter) : 0;
            const value = number(effect.value) + number(filter?.value_per) * count + number(filter?.value_per_sq) * count ** 2;
            if (effect.type === "all_ally_add_max_hp") bucket.hpRate += value;
            else if (effect.type === "all_ally_add_appropriate" && effect.effect) add(bucket.apt, effect.effect, value);
            else assignStats(bucket, effect.final ? "final" : "rate", effect.target_stat, value);
          }
        }
      }
    }
    if (stage >= 1) artifactBonuses(member, member.arts, equipment);

    const buckets = [own, af, allies, equipment];
    const combine = (group, key) => buckets.reduce((sum, bucket) => sum + (bucket[group][key] ?? 0), 0);
    const fixedApt = Object.assign({}, ...buckets.map(bucket => bucket.setApt));
    const apt = Object.fromEntries(member.aptKeys.map(key =>
      [key, Math.max(0, fixedApt[key] ??
        (number(member.master.appropriates?.[key], 1) + combine("apt", key)))]));
    const checks = [];
    for (const passive of [...member.own, ...(stage >= 1 ? member.af : [])]) {
      for (const effect of array(passive.effects)) {
        if (effect.type !== "appropriate_protection" || !effect.appropriate || effect.threshold == null) continue;
        const value = apt[effect.appropriate] ?? 1;
        const reached = value - number(effect.threshold) > 1e-9;
        checks.push({ id: passive.id, key: effect.appropriate, value, threshold: number(effect.threshold), reached });
        if (!reached) continue;
        const bucket = member.af.includes(passive) ? af : own;
        assignStats(bucket, "rate", effect.target_stats, number(effect.stat_value));
        for (const key of array(effect.appropriates)) add(bucket.apt, key, number(effect.appropriate_value));
      }
    }
    const values = Object.fromEntries(stats.map(key => {
      const equipmentRate = equipment.rate[key] ?? 0;
      const equipmentFlat = equipment.flat[key] ?? 0;
      const levelBase = key === "lck" ? Math.floor(member.base.lck * (1 + equipmentRate)) + equipmentFlat :
        member.base[key] + (key === "cdmg" ? equipmentFlat : 0);
      const rate = combine("rate", key) - (key === "hp" || key === "lck" ? equipmentRate : 0);
      const flat = combine("flat", key) - (["lck", "cri", "cdmg"].includes(key) ? equipmentFlat : 0);
      let value = (levelBase * (1 + rate) + flat) * (1 + combine("final", key));
      if (key === "cri") value = Math.floor(value) + equipmentFlat;
      if (key === "hp") value = Math.floor(value) * (1 + equipmentRate) * (1 + own.hpRate + af.hpRate + allies.hpRate);
      return [key, Math.max(core.includes(key) ? 1 : 0, Math.floor(value + 1e-9))];
    }));
    for (const key of member.aptKeys) {
      if (Object.hasOwn(fixedApt, key)) continue;
      apt[key] = Math.max(0, number(member.master.appropriates?.[key], 1) + combine("apt", key));
    }
    return { values, apt, checks, final: Object.fromEntries(stats.map(key => [key, combine("final", key)])) };
  }

  function seasonEnd(manual, now) {
    if (manual) return Date.parse(manual + "+09:00");
    try {
      const time = Number(localStorage.getItem(seasons));
      return time > now ? time : NaN;
    } catch { return NaN; }
  }

  function calculate(request, data, end) {
    const official = request.mode === "official";
    const cutoff = official && Number.isFinite(end) ? Math.floor((end + JST) / day) * day - JST - 7 * day : Infinity;
    const available = skill => {
      const date = skill?.added_at;
      return !date || !(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date + "T00:00:00+09:00" : date) >= cutoff);
    };
    const byId = rows => new Map(array(rows).filter(item => item?.id).map(item => [item.id, item]));
    const masters = byId(data.monsters), passives = byId(data.passives), skills = byId(data.skills);
    const config = data["game-config"];
    if (!config?.stats || !config?.monster || official && !config.pvp?.official) return { missing: "ゲームの能力値データを読み込めませんでした。" };
    const raw = [request.member, ...array(request.allies).slice(0, 5)].filter(Boolean);
    const blocked = [];
    const missingLevels = new Set();
    const team = raw.flatMap(input => {
      const master = masters.get(input.species);
      if (!master || master.summon_only) return [];
      const context = settings(input, config, official);
      const rank = Math.max(master.rank, Math.min(context.maxRank, Math.floor(number(input.rank, master.rank))));
      const refs = array(input.skills).filter(id => typeof id === "string" && /^[sp]\./.test(id));
      const rank6 = master.rank6_unique_skill;
      if (rank < 6 || input.rank6Enabled === false) {
        for (const id of [`s.${rank6}`, `p.${rank6}`]) {
          const index = refs.indexOf(id);
          if (index >= 0) refs.splice(index, 1);
        }
      } else if (rank6 && (passives.has(rank6) || skills.has(rank6))) refs.push(`${passives.has(rank6) ? "p" : "s"}.${rank6}`);
      const refsById = [...new Set(refs)].map(ref => [ref, (ref.startsWith("p.") ? passives : skills).get(ref.slice(2))]);
      for (const [ref, item] of refsById) if (item && !available(item)) blocked.push({ ref, member: input.name ?? "" });
      const permitted = refsById.filter(([, item]) => item && available(item)).map(([ref, item]) => {
        const level = number(input.skillLevels?.[ref], 1);
        if (level <= 1) return [ref, item];
        const variant = storedLevels(ref)?.[level];
        if (!variant) { missingLevels.add(ref); return [ref, item]; }
        return [ref, { ...item, ...variant, id: item.id }];
      });
      const own = permitted.filter(([ref]) => ref.startsWith("p.")).map(([, item]) => item)
        .filter(item => item.inheritability !== false || item.id === rank6 ||
          array(master.passives).some(entry => (entry.passive_id ?? entry) === item.id &&
            (official || number(entry.level_unlocked, 1) <= context.level)));
      const arts = official ? [] : array(request.arts).slice(0, 40);
      const ids = [...new Set(arts.map(art => art?.passive).filter(Boolean))];
      const af = ids.filter(id => !own.some(passive => passive.id === id)).map(id => passives.get(id)).filter(Boolean);
      const precedence = new Set([...own, ...af].flatMap(passive => array(passive.disable)));
      const races = array(master.race).slice();
      const member = { master, races, name: input.name, rank, level: context.level, generation: context.generation,
        potential: Math.floor(context.base + context.growth * (Math.min(context.level, 1000) - 1) + context.potential), arts,
        categories: array(master.category).map(category => category?.id ?? category), af, passiveIds: own.map(passive => passive.id).concat(ids),
        own: own.filter(passive => !precedence.has(passive.id) || ids.includes(passive.id)),
        actives: permitted.filter(([ref]) => ref.startsWith("s.")).map(([, item]) => item),
        base: startingStats(master, input, context, rank, official) };
      return [member];
    });
    const member = team[0];
    if (!member || member.master.id !== request.member?.species) return { missing: "育成対象の図鑑データを読み込めませんでした。" };
    const aptKeys = new Set(["fire", "ice", "thunder", "wind", "earth", "holy", "dark", "physical", "magic",
      ...team.flatMap(ally => Object.keys(ally.master.appropriates ?? {}))]);
    for (const ally of team) for (const passive of [...ally.own, ...ally.af]) for (const effect of array(passive.effects)) {
      if (effect.appropriate) aptKeys.add(effect.appropriate);
      if (["add_appropriate", "all_ally_add_appropriate"].includes(effect.type) && typeof effect.effect === "string") aptKeys.add(effect.effect);
    }
    for (const artifact of member.arts) for (const trait of array(artifact?.traits)) {
      if (trait?.key?.startsWith?.("add_appropriate_")) aptKeys.add(trait.key.slice(16));
    }
    for (const ally of team) ally.aptKeys = [...aptKeys];
    const normal = config.pvp?.official ?? {};
    const highRank = number(normal.highRankThreshold, 6);
    const natural = team.filter(ally => ally.master.rank >= highRank).length;
    const promoted = team.filter(ally => ally.master.rank < highRank && ally.rank >= highRank).length;
    const naturalLimit = number(normal.maxNaturalHighRank, 1), promotedLimit = number(normal.maxPromotedHighRank, 6);
    const names = team.map(ally => ally.name || ally.master.id);
    return { member: { level: member.level, rank: member.rank, generation: member.generation, potential: member.potential, base: member.base,
      apt: Object.fromEntries(member.aptKeys.map(key => [key, number(member.master.appropriates?.[key], 1)])) },
      stages: [0, 1, 2].map(stage => stageValues(member, stage === 2 ? team : [member], stage, skills)),
      blocked, names, missingLevels: [...missingLevels], missingAllies: raw.length !== team.length || request.missingRouteCount > 0,
      official: official ? { end: Number.isFinite(end) ? end : null, cutoff: Number.isFinite(cutoff) ? cutoff : null,
        natural, promoted, naturalLimit, promotedLimit, valid: natural <= naturalLimit && promoted <= promotedLimit } : null };
  }

  function storedLevels(ref) {
    try { return JSON.parse(localStorage.getItem(skillLevelsPrefix + ref)); } catch { return null; }
  }

  document.addEventListener("hako-af:read-planner-levels", event => {
    let ids;
    try { ids = JSON.parse(event.detail); } catch { return; }
    if (!Array.isArray(ids)) return;
    const catalogue = storedLevels("notice")?.targets;
    const targets = storedLevels("targets");
    const available = Object.fromEntries(ids.slice(0, 80).flatMap(ref => {
      if (typeof ref !== "string" || !/^[sp]\.[a-z0-9_-]+$/i.test(ref)) return [];
      const levels = storedLevels(ref);
      const milestones = catalogue?.[ref] ?? targets?.[ref];
      if (!levels && !milestones) return [];
      const options = [...new Set([1, 5, 10, ...array(milestones)])].filter(level => level > 0 && level <= 50);
      return [[ref, { options, loaded: options.every(level => level === 1 || !!levels?.[level]) }]];
    }));
    document.dispatchEvent(new CustomEvent("hako-af:planner-level-options", {
      detail: JSON.stringify({ targetsLoaded: !!(catalogue ?? targets), available })
    }));
  });

  document.addEventListener("hako-af:calculate-training-preview", async event => {
    if (typeof event.detail !== "string" || event.detail.length > 100000) return;
    let request;
    try { request = JSON.parse(event.detail); } catch { return; }
    if (!request.member?.species) return;
    const reply = result => document.dispatchEvent(new CustomEvent("hako-af:training-preview", {
      detail: JSON.stringify({ id: request.id, ...result })
    }));
    const build = props()?.$config?.public?.buildId ?? props()?.$nuxt?.$config?.public?.buildId;
    const data = await readMasters?.(build, "game-config");
    if (!data) { reply({ missing: "図鑑とゲームデータを読み込めませんでした。" }); return; }
    try { reply(calculate(request, data, seasonEnd(request.seasonEnd, Date.now()))); }
    catch { reply({ missing: "入力した内容で計算できませんでした。" }); }
  });

  document.addEventListener("hako-af:read-planner-artifacts", async event => {
    if (typeof event.detail !== "string" || event.detail.length > 50000) return;
    let request;
    try { request = JSON.parse(event.detail); } catch { return; }
    if (!request || !(Object.hasOwn(loadouts, request.mode) || Array.isArray(request.root?.children))) return;
    const loadout = Object.hasOwn(loadouts, request.mode);
    const current = loadout ? null : ++artifactRequest;
    const properties = props();
    const store = properties?.$pinia?._s?.get("userItems");
    const build = properties?.$config?.public?.buildId ?? properties?.$nuxt?.$config?.public?.buildId;
    const translate = properties?.$t?.bind(properties);
    const reply = payload => document.dispatchEvent(new CustomEvent("hako-af:planner-artifacts", {
      detail: JSON.stringify({ id: request.id, ...payload })
    }));
    try {
      const loading = loadout && store?.isEquippedArtifactsLoaded ? undefined : loadInventory(store, !loadout && request.load === true);
      const [data] = await Promise.all([readMasters?.(build, "game-config"), loading]);
      const power = data?.["game-config"]?.artifact?.power;
      if (loadout) {
        reply({ equippedLoaded: !!(store?.isEquippedArtifactsLoaded || store?.isArtifactsLoaded),
          items: equippedArtifacts(store, request.mode, translate, power) });
        return;
      }
      if (current !== artifactRequest) return;
      if (!store?.isArtifactsLoaded) {
        reply({ loadFailed: true, error: "所持AFの全件を読み込めませんでした。" });
        return;
      }
      const source = inventory(store.allArtifacts);
      const result = await browseArtifacts(source, request, translate, power, current);
      if (!result || current !== artifactRequest) return;
      const { records, counts, active, error, total, matched, unknown } = result;
      const pages = Math.max(1, Math.ceil(records.length / afPageSize));
      const page = Math.min(pages, Math.max(1, Math.floor(number(request.page, 1))));
      const start = (page - 1) * afPageSize;
      const items = records.slice(start, start + afPageSize).map(({ item, value, power, unit, predicted }) =>
        readArtifact(item, translate, power, { key: request.sortKey, value: value ?? null, unit, predicted }));
      reply({ items, counts, active, error, matched, unknown, total, page, pages, ranks: source.ranks, hits: records.length,
        owned: source.rows.length });
    } catch { reply({ loadFailed: !loadout, error: "所持AFを読み取れませんでした。" }); }
  });
})();
