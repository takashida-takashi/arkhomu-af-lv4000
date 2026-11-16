(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const kinds = ["skills", "passives", "monsters", "items"];
  const versionOrder = new Intl.Collator("en", { numeric: true });
  let pending;
  let cached;
  let readAt = 0;

  function readMasters(buildId, requiredKind) {
    if (cached?.buildId === buildId && Date.now() - readAt < 60_000 &&
        (!requiredKind || cached[requiredKind]?.length)) return Promise.resolve(cached);
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
              if (Array.isArray(get.result)) result[kind] = get.result;
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

  globalThis.hakoAfTrainingSources = { readMasters, sourceIndex, rank6UniqueName };
})();
