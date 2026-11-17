(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const kinds = ["skills", "passives", "monsters", "items", "monster-categories", "races", "game-config"];
  const versionOrder = new Intl.Collator("en", { numeric: true });
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
              if (Array.isArray(get.result) || kind === "races" && get.result?.labels ||
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
    return label(skill, translate) ?? id;
  }

  function sourceIndex(data, needs, profile, translate, normalize) {
    if (!data) return new Map();
    const matching = new Set(needs.map(normalize));
    const byId = new Map();
    const matches = new Map();
    for (const [kind, key] of [["skill", "skills"], ["passive", "passives"]]) {
      for (const master of data[key] ?? []) {
        if (!isPublic(master)) continue;
        const id = `${kind}:${master.id}`;
        byId.set(id, master);
        const name = normalize(label(master, translate));
        if (!matching.has(name)) continue;
        if (!matches.has(name)) matches.set(name, []);
        matches.get(name).push(id);
      }
    }
    const wanted = new Set([...matches.values()].flat());
    const sources = new Map();
    const add = (kind, id, text, path) => {
      const key = `${kind}:${id}`;
      if (!wanted.has(key)) return;
      if (!sources.has(key)) sources.set(key, []);
      const entries = sources.get(key);
      if (!entries.some(entry => entry.text === text)) entries.push({ text, ...(path ? { path } : {}) });
    };
    for (const monster of data.monsters ?? []) {
      if (!isPublic(monster) || monster.summon_only) continue;
      const discovery = profile?.monsterDiscoveries?.[monster.id];
      const known = profile?.encyclopediaUnlocked === true || ["owned", "encountered"].includes(discovery);
      const name = known ? label(monster, translate) : "図鑑で未発見のホムンクルス";
      const path = known ? `/encyclopedia?monster=${encodeURIComponent(monster.id)}` : "";
      for (const [kind, entries] of [["skill", monster.skills], ["passive", monster.passives]]) {
        for (const entry of Array.isArray(entries) ? entries : []) {
          const id = typeof entry === "string" ? entry : entry?.[`${kind}_id`] ?? entry?.id;
          add(kind, id, `${name} Lv${Math.max(1, Math.floor(Number(entry?.level_unlocked) || 1))}`, path);
        }
      }
      if (monster.attack_skill) {
        add("skill", monster.attack_skill, `${name} Lv1（通常攻撃）`, path);
      }
      if (typeof monster.rank6_unique_skill === "string") {
        const id = monster.rank6_unique_skill.trim();
        const kind = byId.has(`skill:${id}`) ? "skill" : byId.has(`passive:${id}`) ? "passive" : null;
        if (kind) add(kind, id, `${name} Rank6`, path);
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
    return new Map([...matches].map(([name, ids]) => {
      const entries = [];
      for (const id of ids) {
        const master = byId.get(id);
        entries.push(...(sources.get(id) ?? []));
        const recipe = master.source;
        const recipes = Array.isArray(recipe) ? recipe.some(Array.isArray) ? recipe.filter(Array.isArray) : [recipe] : [];
        for (const row of recipes) {
          const materials = [...new Set(row)].map(skill => byId.get(`skill:${skill}`) ?? byId.get(`passive:${skill}`));
          if (materials.length && materials.every(Boolean)) {
            entries.push({ text: `合成レシピ ${materials.map(skill => label(skill, translate)).join(" ＋ ")}` });
          }
        }
      }
      return [name, [...new Map(entries.map(entry => [entry.text, entry])).values()]];
    }));
  }

  const plannerKinds = [["s", "skill", "skills"], ["p", "passive", "passives"]];
  const getReaders = globalThis.hakoAfPartyShareMain?.getReaders;
  const isPlannerPublic = master => isPublic(master) && typeof master.id === "string" && master.used !== false &&
    !(typeof master.open_at === "string" && Date.parse(master.open_at) > Date.now()) && master.enemy_only !== true;
  const encyclopediaHidden = master => ["none", "difficulty"].includes(master.display);
  const defaultRaces = {
    animal: "動物", doll: "人形", "demi-human": "亜人", ghost: "霊", machine: "機械", fairy: "妖精", insect: "虫",
    devil: "悪魔", dragon: "ドラゴン", undead: "アンデッド", aquatic: "水棲", plant: "植物", slime: "スライム",
    angel: "天使", mythical: "幻獣", mysterious: "神秘", magical_beast: "魔獣", god: "神"
  };
  let plannerCatalog;

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

  function plannerData(data, translate) {
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
      skills.set(id, { id, name, passive, unique, description, canDisable: passive && skill.drawback !== true });
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
    return { monsters, raceLabels, categoryLabels, source, skills };
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
    if (plannerCatalog?.data !== data) {
      plannerCatalog = { data, ...plannerData(data, key => properties.$t(key)) };
    }
    const { monsters, raceLabels, categoryLabels, skills } = plannerCatalog;
    const discoveries = properties.$pinia?._s?.get("userProfile")?.monsterDiscoveries;
    reply(JSON.stringify({ raceLabels, categoryLabels, skills: [...skills.values()],
      hasRegistration: !!discoveries, monsters: monsters.map(monster => {
        const discovery = discoveries?.[monster.id];
        return { ...monster, registration: discovery === "owned" || discovery === "encountered" ? discovery : "unknown" };
      }) }));
  });

  document.addEventListener("hako-af:read-training-description", async event => {
    const id = event.detail;
    const skill = plannerCatalog?.skills.get(id);
    const master = plannerCatalog?.source.get(id);
    if (!skill || !master) return;
    let effects = [];
    try {
      const readers = await getReaders?.();
      const app = document.getElementById("__nuxt")?.__vue_app__;
      const nuxt = app?.config?.globalProperties?.$nuxt;
      const run = nuxt?.runWithContext?.bind(nuxt) ?? app?.runWithContext?.bind(app);
      if (readers && run) effects = run(() => {
        const tool = readers.masters();
        const formatted = skill.passive ? tool.formatPassiveSkillEffects?.(master) : tool.formatActiveSkillEffects?.(master);
        return Array.isArray(formatted) ? formatted.filter(line => typeof line === "string") : [];
      });
    } catch { /* The translated description is already available to the planner. */ }
    document.dispatchEvent(new CustomEvent("hako-af:training-description", { detail: JSON.stringify({ id, effects }) }));
  });

  globalThis.hakoAfTrainingSources = { readMasters, sourceIndex, rank6UniqueName };
})();
