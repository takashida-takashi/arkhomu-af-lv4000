(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const kinds = ["skills", "passives", "monsters", "items", "monster-categories", "races", "game-config", "skill-categories", "skill-tags"];
  const versionOrder = new Intl.Collator("en", { numeric: true });
  const identity = globalThis.hakoAfSkillIdentity;
  let pending;
  let cached;
  let readAt = 0;

  function readMasters(buildId, requiredKind) {
    const requested = cached?.[requiredKind];
    if (cached?.buildId === buildId && Date.now() - readAt < 60_000 &&
        (!requiredKind || (Array.isArray(requested) ? requested.length : requested))) return Promise.resolve(cached);
    return pending ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("master-cache");
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("masters")) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction("masters", "readonly");
        const store = tx.objectStore("masters");
        const result = { buildId };
        for (const kind of kinds) {
          const keys = store.getAllKeys(IDBKeyRange.bound(`masters:${kind}:`, `masters:${kind};`));
          keys.onsuccess = () => {
            const current = buildId ? keys.result.filter(key => key.endsWith(`:build:${buildId}`)) : [];
            const candidates = current.length ? current : keys.result.filter(key => !buildId || !key.includes(":build:"));
            const key = candidates.sort(versionOrder.compare).at(-1);
            if (!key) return;
            const get = store.get(key);
            get.onsuccess = () => {
              if (Array.isArray(get.result) || ["races", "skill-categories", "skill-tags"].includes(kind) && get.result?.labels ||
                  kind === "game-config" && get.result?.stats) result[kind] = get.result;
            };
          };
        }
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }).then(result => {
      cached = result;
      readAt = Date.now();
      return result;
    }).catch(() => null).finally(() => { pending = null; });
  }

  function isPublic(master) {
    const openAt = Number(master?.open_at);
    return master?.id && !(Number.isFinite(openAt) && openAt > Date.now());
  }

  function label(master, translate) {
    const name = master?.name_key && translate(master.name_key);
    return (name && name !== master.name_key ? name : master?.name ?? name) || master?.id;
  }

  function rank6UniqueName(data, member, translate) {
    const monsters = (data?.monsters ?? []).filter(isPublic);
    const name = member.name?.normalize("NFKC");
    const byName = monsters.filter(monster => {
      const species = label(monster, translate)?.normalize("NFKC");
      return species && (name === species || name?.endsWith(`(${species})`));
    });
    const byPortrait = member.portrait ? monsters.filter(monster =>
      monster.image_file_name?.replace(/\.png$/i, "") === member.portrait) : [];
    const monster = byName.length === 1 ? byName[0] : byPortrait.length === 1 ? byPortrait[0] : null;
    const id = monster?.rank6_unique_skill;
    if (!id) return;
    const skill = data.skills?.find(skill => skill.id === id) ?? data.passives?.find(skill => skill.id === id);
    return identity.typed(label(skill, translate) ?? id, data.skills?.includes(skill) ? "skill" : "passive");
  }

  function sourceIndex(data, needs, profile, translate, normalize, inheritanceNeeds = needs, selectedIds = {}) {
    if (!data) return new Map();
    const matching = new Set(needs.map(normalize));
    const byId = new Map();
    const matches = new Map();
    const selected = new Map(Object.entries(selectedIds).map(([name, id]) => [normalize(name), id]));
    for (const [kind, key] of [["skill", "skills"], ["passive", "passives"]]) {
      for (const master of data[key] ?? []) {
        if (!isPublic(master)) continue;
        const id = `${kind}:${master.id}`;
        byId.set(id, master);
        const name = normalize(label(master, translate));
        for (const wanted of matching) {
          const target = identity.parse(wanted);
          if (target.name !== name || target.kind && target.kind !== kind) continue;
          const requested = selected.get(wanted);
          if (/^[sp]\./.test(requested ?? "") && requested !== `${kind === "skill" ? "s" : "p"}.${master.id}`) continue;
          if (!matches.has(wanted)) matches.set(wanted, []);
          matches.get(wanted).push(id);
        }
      }
    }
    const wanted = new Set([...matches.values()].flat());
    const sources = new Map();
    const add = (kind, id, text, path, details = {}) => {
      const key = `${kind}:${id}`;
      if (!wanted.has(key)) return;
      if (!sources.has(key)) sources.set(key, []);
      const entries = sources.get(key);
      if (!entries.some(entry => entry.text === text && entry.monsterId === details.monsterId)) entries.push({
        text, ...(path ? { path } : {}), skillKind: kind, skillId: id, ...details,
        ...(details.kind === "monster" ? { inheritable: details.inheritable !== false && byId.get(key)?.inheritability !== false } : {})
      });
    };
    for (const monster of data.monsters ?? []) {
      if (!isPublic(monster) || monster.summon_only) continue;
      const discovery = profile?.monsterDiscoveries?.[monster.id];
      const known = profile?.encyclopediaUnlocked === true || ["owned", "encountered"].includes(discovery);
      const name = known ? label(monster, translate) : "図鑑で未発見のホムンクルス";
      const path = known ? `/encyclopedia?monster=${encodeURIComponent(monster.id)}` : "";
      const rank = known && Number.isInteger(Number(monster.rank)) && Number(monster.rank) > 0 ? Number(monster.rank) : null;
      const rankLabel = rank == null ? "元ランク未確認" : `元ランク${rank}`;
      const source = { kind: "monster", ...(known ? { monsterId: monster.id } : {}), rank };
      for (const [kind, entries] of [["skill", monster.skills], ["passive", monster.passives]]) {
        for (const entry of Array.isArray(entries) ? entries : []) {
          const id = typeof entry === "string" ? entry : entry?.[`${kind}_id`] ?? entry?.id;
          const level = Math.max(1, Math.floor(Number(entry?.level_unlocked) || 1));
          add(kind, id, `${name} Lv${level}（${rankLabel}）`, path, { ...source, level,
            inheritable: id !== monster.rank6_unique_skill && !(kind === "skill" && id === monster.attack_skill) });
        }
      }
      if (monster.attack_skill) {
        add("skill", monster.attack_skill, `${name} Lv1（通常攻撃・${rankLabel}）`, path, { ...source, level: 1, inheritable: false });
      }
      if (typeof monster.rank6_unique_skill === "string") {
        const id = monster.rank6_unique_skill.trim();
        const kind = byId.has(`skill:${id}`) ? "skill" : byId.has(`passive:${id}`) ? "passive" : null;
        if (kind) add(kind, id, `${name} Rank6で習得（${rankLabel}）`, path, { ...source, inheritable: false });
      }
    }
    for (const item of data.items ?? []) {
      if (!isPublic(item)) continue;
      for (const kind of ["skill", "passive"]) {
        const value = item.effects?.[kind];
        for (const id of Array.isArray(value) ? value : [value]) {
          if (id) add(kind, id, `アイテム ${label(item, translate)}`);
        }
      }
    }
    const index = new Map([...matches].map(([name, ids]) => {
      const entries = [];
      for (const id of ids) {
        const master = byId.get(id);
        entries.push(...(sources.get(id) ?? []));
        const recipe = master.source;
        const recipes = Array.isArray(recipe) ? recipe.some(Array.isArray) ? recipe.filter(Array.isArray) : [recipe] : [];
        for (const row of recipes) {
          const materials = [...new Set(row)].map(skill => byId.get(`skill:${skill}`) ?? byId.get(`passive:${skill}`));
          if (materials.length && materials.every(Boolean)) {
            entries.push({ text: `合成レシピ ${materials.map(skill => label(skill, translate)).join(" ＋ ")}`,
              skillKind: id.split(":")[0], skillId: master.id });
          }
        }
      }
      const ordered = [...new Map(entries.map(entry => [JSON.stringify([entry.monsterId, entry.skillKind, entry.skillId, entry.text]), entry])).values()];
      ordered.sort((a, b) => {
        const monsterA = a.kind === "monster", monsterB = b.kind === "monster";
        if (monsterA !== monsterB) return monsterA ? -1 : 1;
        if (!monsterA) return 0;
        return (a.level ?? Infinity) - (b.level ?? Infinity) || (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
          a.text.localeCompare(b.text, "ja", { numeric: true });
      });
      return [name, ordered];
    }));
    // Only outstanding ordinary skills can be collected together through inheritance.
    // Match species IDs, since level text and displayed names need not identify a species.
    const inheritance = new Map(inheritanceNeeds.map(name => [normalize(name), name]));
    const byMonster = new Map();
    for (const [name, entries] of index) {
      if (!inheritance.has(name)) continue;
      for (const entry of entries) {
        if (!entry.monsterId || !entry.inheritable) continue;
        if (!byMonster.has(entry.monsterId)) byMonster.set(entry.monsterId, new Map());
        const skills = byMonster.get(entry.monsterId);
        if (!skills.has(name) || entry.level < skills.get(name).level)
          skills.set(name, { name: inheritance.get(name), level: entry.level, skillKind: entry.skillKind });
      }
    }
    for (const [name, entries] of index) {
      if (!inheritance.has(name)) continue;
      for (const entry of entries) {
        if (!entry.monsterId || !entry.inheritable) continue;
        const overlaps = [...(byMonster.get(entry.monsterId) ?? [])].filter(([other]) => other !== name).map(([, skill]) => skill);
        if (overlaps.length) entry.overlaps = overlaps;
      }
    }
    return index;
  }

  function matingAdvice(data, route, recipientSkills, donorSkills, donor, translate, normalize, selectedKeys) {
    const masters = new Map([["skill", data?.skills ?? []], ["passive", data?.passives ?? []]].flatMap(([kind, rows]) =>
      rows.map(master => [`${kind}:${master.id}`, master])));
    const keyOf = skill => `${skill.skillKind}:${skill.id}`;
    const known = new Set(recipientSkills.map(keyOf));
    const donorKnown = new Set(donorSkills.map(keyOf));
    const selectionKey = value => typeof value === "string" && /^(s|p|skill|passive)[:.](.+)$/.test(value)
      ? value.replace(/^(s|p|skill|passive)[:.]/, (_, kind) => (kind === "s" || kind === "skill" ? "skill:" : "passive:")) : null;
    const chosen = Array.isArray(selectedKeys) && selectedKeys.every(value => selectionKey(value))
      ? new Set(selectedKeys.map(selectionKey)) : null;
    const raw = donor?.t_user_monsters ?? donor;
    const meta = raw?.m_monsters ?? donor?.m_monsters;
    const id = meta?.id ?? raw?.monster_id ?? donor?.monster_id;
    const species = data?.monsters?.find(monster => monster.id === id) ?? data?.monsters?.find(monster =>
      meta?.name_key && monster.name_key === meta.name_key);
    const eligible = key => {
      const master = masters.get(key);
      return master && master.inheritability !== false && master.used !== false && !master.enemy_only &&
        isPublic(master) && !(key.startsWith("passive:") && master.display === "none") &&
        key !== `skill:${species?.attack_skill}` && key.split(":")[1] !== species?.rank6_unique_skill;
    };
    const needs = (route.ordinaryNames ?? []).flatMap(name => {
      const selected = route.previewSkillIds?.[name], target = identity.parse(name);
      const keys = /^[sp]\./.test(selected ?? "") ? [selectionKey(selected)] : [...masters].filter(([, master]) =>
        normalize(label(master, translate)) === target.name).map(([key]) => key)
        .filter(key => !target.kind || key.startsWith(target.kind + ":"));
      const inheritable = keys.filter(eligible);
      return keys.some(key => known.has(key)) || !inheritable.length ? [] : [{ name, keys: inheritable }];
    });
    const current = needs.flatMap(need => need.keys.filter(key => donorKnown.has(key) && (!chosen || chosen.has(key)))
      .map(key => ({ name: need.name, skillKind: key.split(":")[0] })));
    const level = Number(raw?.level ?? donor?.level);
    const limit = Number(raw?.max_level ?? raw?.maxLevel ?? donor?.max_level ?? donor?.maxLevel);
    const future = [];
    for (const [kind, rows] of [["skill", raw?.skills ?? donor?.skills ?? species?.skills],
      ["passive", raw?.passives ?? donor?.passives ?? species?.passives]]) {
      const forgotten = new Set((raw?.forgotten_skills ?? []).filter(value => typeof value === "string")
        .flatMap(value => /^[sp]:/.test(value) ? value.startsWith(kind === "skill" ? "s:" : "p:") ? [value.slice(2)] : [] : [value]));
      for (const entry of Array.isArray(rows) ? rows : []) {
        const id = typeof entry === "string" ? entry : entry?.[`${kind}_id`] ?? entry?.id;
        const key = `${kind}:${id}`, required = Number(entry?.level_unlocked ?? 1);
        if (!Number.isFinite(level) || !Number.isFinite(required) || required <= level ||
            Number.isFinite(limit) && limit > 0 && required > limit || forgotten.has(id) || donorKnown.has(key) || !eligible(key)) continue;
        const need = needs.find(need => need.keys.includes(key));
        if (need) future.push({ name: need.name, skillKind: kind, level: required });
      }
    }
    const earliest = new Map();
    for (const entry of future.sort((a, b) => a.level - b.level)) {
      const key = `${entry.skillKind}:${entry.name}`;
      if (!earliest.has(key)) earliest.set(key, entry);
    }
    return { current, future: [...earliest.values()], remaining: needs.length };
  }

  const plannerKinds = [["s", "skill", "skills"], ["p", "passive", "passives"]];
  const getEffectReaders = globalThis.hakoAfPartyShareMain?.getEffectReaders;
  const isPlannerPublic = master => isPublic(master) && typeof master.id === "string" && master.used !== false &&
    !(typeof master.open_at === "string" && Date.parse(master.open_at) > Date.now()) && master.enemy_only !== true;
  const encyclopediaHidden = master => ["none", "difficulty"].includes(master.display);
  const defaultRaces = {
    animal: "動物", doll: "人形", "demi-human": "亜人", ghost: "霊", machine: "機械", fairy: "妖精", insect: "虫",
    devil: "悪魔", dragon: "ドラゴン", undead: "アンデッド", aquatic: "水棲", plant: "植物", slime: "スライム",
    angel: "天使", mythical: "幻獣", mysterious: "神秘", magical_beast: "魔獣", god: "神"
  };
  let plannerCatalog;
  let plannerTaxonomy;
  let pendingTaxonomy;

  async function effectFormatter() {
    const factory = await getEffectReaders?.();
    const app = document.getElementById("__nuxt")?.__vue_app__;
    const nuxt = app?.config?.globalProperties?.$nuxt;
    const run = nuxt?.runWithContext?.bind(nuxt) ?? app?.runWithContext?.bind(app);
    if (!factory || !run) throw new Error("Native skill effect context unavailable");
    const tool = run(() => factory());
    if (typeof tool?.formatActiveSkillEffects !== "function" || typeof tool?.formatPassiveSkillEffects !== "function") {
      throw new Error("Native skill effect formatter unavailable");
    }
    return (skill, passive) => run(() => passive ? tool.formatPassiveSkillEffects(skill) : tool.formatActiveSkillEffects(skill));
  }

  async function readPlannerTaxonomy(data) {
    if (plannerTaxonomy && plannerTaxonomy.buildId === data.buildId) return plannerTaxonomy;
    return pendingTaxonomy ??= Promise.all(["categories", "tags"].map(async kind => {
      const cached = data[`skill-${kind}`];
      if (cached?.labels) return cached;
      // These small public dictionaries are needed even before visiting the encyclopedia.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`/api/skills/${kind}`, {
          cache: "force-cache", credentials: "omit", redirect: "error", signal: controller.signal
        });
        const value = response.ok ? await response.json() : null;
        return value?.labels && !Array.isArray(value.labels) ? value : null;
      } catch { return null; }
      finally { clearTimeout(timer); }
    })).then(([categories, tags]) => {
      const result = { buildId: data.buildId, categories, tags };
      if (categories && tags) plannerTaxonomy = result;
      return result;
    }).finally(() => { pendingTaxonomy = null; });
  }

  function translated(translate, ...keys) {
    for (const key of new Set(keys.filter(Boolean))) {
      const text = translate(key);
      if (typeof text === "string" && text.trim() && text !== key) return text.trim();
    }
    return "";
  }

  function plannerName(skill, passive, translate) {
    const base = skill.id.toUpperCase();
    const text = translated(translate, skill.name_key, passive && `PASSIVE_${base}_NAME`, `${base}_NAME`);
    if (text && (!/^\d+$/.test(text) || text !== skill.id || translated(translate, skill.description_key))) return text;
    const name = skill.name?.trim?.();
    return name && !/^\d+$/.test(name) && !/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(name) && name !== skill.id ? name : "";
  }

  function tags(entries) {
    return [...new Set((Array.isArray(entries) ? entries : []).map(entry => typeof entry === "string" ? entry : entry?.id)
      .filter(id => typeof id === "string" && id))];
  }

  function skillTags(skill, passive) {
    const ids = tags(skill.tags);
    const visit = value => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object" || Number(value.value) < 0) return;
      for (const [name, child] of Object.entries(value)) {
        if (name === "tags" || name === "target_tags") ids.push(...tags(child));
        else if (child && typeof child === "object") visit(child);
      }
    };
    if (passive) visit(skill.effects);
    return [...new Set(ids)];
  }

  function plannerData(data, translate, taxonomy, formatEffects) {
    const source = new Map();
    const playable = new Set();
    const summoned = new Set();
    const rank6 = new Set();
    const normalAttacks = new Set(["s.attack"]);
    const itemSkills = new Set();
    for (const [prefix, , collection] of plannerKinds) {
      for (const skill of data[collection].filter(isPlannerPublic)) source.set(`${prefix}.${skill.id}`, skill);
    }
    for (const item of (data.items ?? []).filter(isPlannerPublic)) {
      for (const [prefix, type] of plannerKinds) {
        const effect = item.effects?.[type];
        for (const id of Array.isArray(effect) ? effect : [effect]) if (id) itemSkills.add(`${prefix}.${id}`);
      }
    }
    const monsters = [];
    for (const master of data.monsters.filter(isPlannerPublic)) {
      const innate = new Map();
      const learners = master.summon_only ? summoned : playable;
      for (const [prefix, type, collection] of plannerKinds) {
        for (const entry of Array.isArray(master[collection]) ? master[collection] : []) {
          const id = `${prefix}.${typeof entry === "string" ? entry : entry?.[`${type}_id`] ?? entry?.id}`;
          if (!source.has(id)) continue;
          const level = Math.max(1, Math.floor(Number(entry?.level_unlocked) || 1));
          innate.set(id, Math.min(innate.get(id) ?? level, level));
          learners.add(id);
        }
      }
      if (master.summon_only) continue;
      if (master.attack_skill) normalAttacks.add(`s.${master.attack_skill}`);
      const uniqueKey = master.rank6_unique_skill?.trim?.();
      const uniqueId = uniqueKey && [`s.${uniqueKey}`, `p.${uniqueKey}`].find(id => source.has(id));
      if (uniqueId) {
        rank6.add(uniqueId);
        innate.set(uniqueId, 0);
      }
      const image = master.image_file_name?.replace(/\.png$/i, "");
      if (master.encyclopedia_group === "other" && master.type === "raid_boss") continue;
      monsters.push({ id: master.id, name: label(master, translate), rank: Number(master.rank) || null,
        rank6PassiveId: uniqueId?.startsWith("p.") ? uniqueId : "",
        otherRank: master.encyclopedia_group === "other", races: tags(master.race), categories: tags(master.category),
        added: typeof master.added_at === "string" ? master.added_at.slice(0, 10) : "",
        image: /^[\p{L}\p{N}_-]+$/u.test(image ?? "") ? image : "", innate });
    }
    const skills = new Map();
    for (const [id, skill] of source) {
      const passive = id.startsWith("p.");
      const name = plannerName(skill, passive, translate);
      if (!name || /^(?:【|\[)(?:塔|敵専用|敵|難易度)(?:】|\])/.test(name.normalize("NFKC"))) continue;
      const attack = normalAttacks.has(id) || skill.skill_type === "attack";
      const unique = rank6.has(id) ? "rank6" : skill.inheritability === false ? "innate" : "";
      const obtainable = itemSkills.has(id) || skill.egg_exclusive === true || !!skill.source?.length;
      const learns = playable.has(id);
      const regularCandidate = !unique && !attack && !encyclopediaHidden(skill) &&
        (learns || obtainable || !summoned.has(id) && skill.skill_type !== "next_skill" && !skill.categories?.includes("artifact"));
      if (!regularCandidate && !(unique && (learns || rank6.has(id)))) continue;
      const base = skill.id.toUpperCase();
      const description = translated(translate, skill.description_key,
        passive && `PASSIVE_${base}_DESCRIPTION`, `${base}_DESCRIPTION`) || skill.description?.trim?.() || "";
      let effects = [];
      try { effects = formatEffects?.(skill, passive) ?? []; } catch { /* Keep name and translated description searchable. */ }
      skills.set(id, { id, name, passive, unique, description, canDisable: passive && skill.drawback !== true,
        categories: tags(skill.categories), tags: skillTags(skill, passive),
        added: typeof skill.added_at === "string" ? skill.added_at.slice(0, 10) : "",
        updated: typeof skill.update_at === "string" ? skill.update_at.slice(0, 10) : "",
        searchEffects: Array.isArray(effects) ? effects.filter(line => typeof line === "string").join("\n") : "" });
    }
    for (const monster of monsters) {
      monster.innate = [...monster.innate].filter(([id]) => skills.has(id))
        .sort(([, a], [, b]) => (a || Infinity) - (b || Infinity));
      if (!skills.has(monster.rank6PassiveId)) delete monster.rank6PassiveId;
    }
    const raceLabels = { ...defaultRaces, ...data.races?.labels };
    const categoryKeys = new Map((data["monster-categories"] ?? []).map(entry => [entry.id, entry.name_key]));
    const usedCategories = new Set(monsters.flatMap(monster => monster.categories));
    const categoryLabels = Object.fromEntries([...usedCategories].map(id => {
      const label = translated(translate, categoryKeys.get(id), `MONSTER_CATEGORY_NAME_${id}`) || id;
      return [id, label.endsWith("系") ? label : `${label}系`];
    }));
    return { monsters, raceLabels, categoryLabels, source, skills,
      skillCategoryLabels: taxonomy.categories?.labels ?? {}, skillCategoryOrder: tags(taxonomy.categories?.major),
      skillTagLabels: taxonomy.tags?.labels ?? {}, hasSkillTaxonomy: !!(taxonomy.categories && taxonomy.tags) };
  }

  document.addEventListener("hako-af:read-training-planner", async () => {
    const properties = document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
    const buildId = properties?.$config?.public?.buildId ?? properties?.$nuxt?.$config?.public?.buildId ??
      globalThis.__NUXT__?.config?.public?.buildId;
    const data = await readMasters(buildId);
    const reply = detail => document.dispatchEvent(new CustomEvent("hako-af:training-planner-data", { detail }));
    if (!data?.monsters?.length || !data.skills?.length || !data.passives?.length || typeof properties?.$t !== "function") {
      reply("");
      return;
    }
    if (plannerCatalog?.data !== data || !plannerCatalog.hasSkillTaxonomy) {
      const taxonomy = await readPlannerTaxonomy(data);
      let formatEffects;
      try { formatEffects = await effectFormatter(); } catch { /* Search still works with the translated descriptions. */ }
      plannerCatalog = { data, ...plannerData(data, key => properties.$t(key), taxonomy, formatEffects) };
    }
    const { monsters, raceLabels, categoryLabels, skills, skillCategoryLabels, skillCategoryOrder, skillTagLabels, hasSkillTaxonomy } = plannerCatalog;
    const discoveries = properties.$pinia?._s?.get("userProfile")?.monsterDiscoveries;
    reply(JSON.stringify({ raceLabels, categoryLabels, skillCategoryLabels, skillCategoryOrder, skillTagLabels, hasSkillTaxonomy,
      skills: [...skills.values()],
      hasRegistration: !!discoveries, monsters: monsters.map(monster => {
        const discovery = discoveries?.[monster.id];
        return { ...monster, registration: discovery === "owned" || discovery === "encountered" ? discovery : "unknown" };
      }) }));
  });

  document.addEventListener("hako-af:read-training-description", async event => {
    let id = event.detail, level = 1;
    if (typeof id !== "string") return;
    if (id.startsWith("{")) {
      try { ({ id, level = 1 } = JSON.parse(id)); } catch { return; }
    }
    if (typeof id !== "string" || !Number.isSafeInteger(level) || level < 1 || level > 50) return;
    const skill = plannerCatalog?.skills.get(id);
    let master = plannerCatalog?.source.get(id);
    if (!skill || !master) return;
    let effects = [];
    let loaded = false;
    let message = "効果の詳細を取得できませんでした。スキル名をもう一度選ぶと再取得します。";
    try {
      if (level > 1) {
        let definition;
        try { definition = JSON.parse(localStorage.getItem(`hakoAf4000:planner-levels:${id}`))?.[level]; } catch { /* Keep the unknown level explicit. */ }
        if (!definition) {
          message = `Lv${level}の効果データは未取得です。本体のスキルLv詳細で確認してください。`;
          throw new Error("Skill level definition unavailable");
        }
        master = { ...master, ...definition, id: master.id };
      }
      const format = await effectFormatter();
      const formatted = format(master, skill.passive);
      if (!Array.isArray(formatted)) throw new Error("Invalid native skill effects");
      effects = formatted.filter(line => typeof line === "string" && line.trim());
      loaded = true;
    } catch { /* Show the available description and a retry message instead of inventing effects. */ }
    document.dispatchEvent(new CustomEvent("hako-af:training-description", {
      detail: JSON.stringify({ id, level, effects, loaded, message: loaded ? "" : message })
    }));
  });

  globalThis.hakoAfTrainingSources = { readMasters, sourceIndex, rank6UniqueName, matingAdvice };
})();
