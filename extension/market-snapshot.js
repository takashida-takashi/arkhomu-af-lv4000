(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;
  const guardKey = Symbol.for("hako-af.monster-operation-guards");
  const monsterGuards = globalThis[guardKey] ??= new Set();
  globalThis.hakoAfMonsterGuards = monsterGuards;

  const key = Symbol.for("hako-af.market-prices");
  if (globalThis[key]) {
    globalThis.hakoAfMarketSnapshots = globalThis[key];
    return;
  }
  const prices = new Map();
  const wrapped = new WeakSet();
  const approvedOperations = new Map();
  let invokingOperation;
  const expeditionSources = new Map([
    ["/api/expedition/repeat-status", ["repeat", data => data && {
      open: data.open, gateLevel: data.gateLevel, passActive: data.passActive
    }]],
    ["/api/nation-facilities/effects", ["nation", data => data?.expeditionTimeFactor]],
    ["/api/config/game", ["config", data => data?.expedition && { expedition: data.expedition, stats: data.stats }]],
    ["/api/items/category-groups", ["categories", data => data?.find?.(group => group.id === "food")?.categories]]
  ]);
  const expeditionData = new Map();
  const guildLayouts = new Map();
  const guildBrowseOrder = { sort: "", positions: new Map() };
  const guildLineups = new Map();
  const guildLineupPrefix = "hakoAf4000:guild-lineup:";
  const seasonKey = "hakoAf4000:official-season-end";
  const skillLevelsPrefix = "hakoAf4000:planner-levels:";
  let levelNotice;
  let pendingLevelTargets;
  let lastLevelTargetAttempt = 0;
  let guildBrowseSequence = 0;
  const earlyMatings = [];
  let watchMatings = false;
  globalThis.hakoAfMarketSnapshots = globalThis[key] = prices;
  globalThis.hakoAfGuildBrowseLayouts = guildLayouts;
  globalThis.hakoAfGuildBrowseOrder = guildBrowseOrder;
  globalThis.hakoAfGuildLineups = {
    get(id, revision) {
      if (!Number.isSafeInteger(revision)) return;
      const lineup = savedGuildLineup(id);
      return lineup?.revision === revision ? lineup : undefined;
    }
  };

  function publicEnemyNames(enemies) {
    return Array.isArray(enemies) ? enemies.map(enemy => enemy && ({
      master_id: enemy.master_id, name_key: enemy.name_key, name: enemy.name, nickname: enemy.nickname, level: enemy.level
    })) : null;
  }
  const guildKey = (id, slot) => Number(slot) > 1 ? `${id}:${Number(slot)}` : String(id);
  function publicGuildDefinition(value) {
    if (!value) return null;
    const keys = ["description", "sourceDungeonId", "version", "mobDifficulty", "bossDifficulty", "entryFee", "specialEntryFee", "strength",
      "passiveSlots", "mobTrialPassive", "bossTrialPassive", "dungeonEffectList", "upperPrefixFloor", "trialDropFactor", "rank6MobDrop", "rateBoosts"];
    return { ...Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])),
      mobEnemies: publicEnemyNames(value.mobEnemies), bossEnemies: publicEnemyNames(value.bossEnemies),
      enemyArtifacts: value.enemyArtifacts?.map(item => ({ source_item_id: item.source_item_id })),
      bossEnemyArtifacts: value.bossEnemyArtifacts?.map(item => ({ source_item_id: item.source_item_id })) };
  }

  function readStoredGuildLineup(id) {
    try { return JSON.parse(localStorage.getItem(guildLineupPrefix + id)); } catch { return null; }
  }

  function savedGuildLineup(id) {
    if (!guildLineups.has(id)) guildLineups.set(id, readStoredGuildLineup(id));
    return guildLineups.get(id);
  }

  function rememberGuildLineup(id, revision, definition) {
    if (!Number.isSafeInteger(revision) || revision < 0 || !definition) return;
    const stored = readStoredGuildLineup(id);
    const memory = guildLineups.get(id);
    const previous = (memory?.revision ?? -1) > (stored?.revision ?? -1) ? memory : stored;
    if (previous) guildLineups.set(id, previous);
    if (previous?.revision > revision) return;
    const sameRevision = previous?.revision === revision ? previous : null;
    const record = {
      revision,
      mobEnemies: publicEnemyNames(definition.mobEnemies ?? []) ?? sameRevision?.mobEnemies ?? null,
      bossEnemies: publicEnemyNames(definition.bossEnemies ?? []) ?? sameRevision?.bossEnemies ?? null
    };
    record.definition = publicGuildDefinition(definition);
    if (!record.mobEnemies && !record.bossEnemies) return;
    const value = JSON.stringify(record);
    if (value === JSON.stringify(previous)) return;
    guildLineups.set(id, record);
    try { localStorage.setItem(guildLineupPrefix + id, value); } catch { /* Use the data in this tab. */ }
  }

  function guildFilterDataChanged() {
    document.dispatchEvent(new Event("hako-af:guild-filter-data"));
  }

  function observeOfficialSeason(response) {
    Promise.resolve(response).then(payload => {
      const end = Date.parse(payload?.season?.endsAt);
      if (!Number.isFinite(end)) return;
      try { localStorage.setItem(seasonKey, String(end)); } catch { /* Leave the manual date available. */ }
      document.dispatchEvent(new Event("hako-af:planner-season"));
    }).catch(() => {});
  }

  function readLevelRecord(key) {
    try { return JSON.parse(localStorage.getItem(skillLevelsPrefix + key)); } catch { return null; }
  }

  function publishLevelTargets() {
    const notice = readLevelRecord("notice") ?? levelNotice;
    document.dispatchEvent(new CustomEvent("hako-af:planner-level-targets", { detail: JSON.stringify({
      ids: Object.keys(notice?.targets ?? readLevelRecord("targets") ?? {}), added: notice?.added ?? {}, loaded: !!notice?.targets
    }) }));
  }

  document.addEventListener("hako-af:read-planner-level-targets", () => {
    publishLevelTargets();
    const notice = readLevelRecord("notice") ?? levelNotice;
    const now = Date.now();
    if (notice?.targets && notice.added && now - notice.at < 2 * 60 * 60 * 1000 || pendingLevelTargets ||
        now - lastLevelTargetAttempt < 60_000 || typeof globalThis.$fetch !== "function") return;
    lastLevelTargetAttempt = now;
    // The same read-only catalogue as the game's skill encyclopedia; no level-up operation.
    pendingLevelTargets = Promise.resolve().then(() => globalThis.$fetch("/api/skill-levels/notice", { retry: 0, timeout: 8000 }))
      .catch(() => {}).finally(() => { pendingLevelTargets = null; });
  });

  function observePlannerSkillLevels(url, query, response) {
    Promise.resolve(response).then(payload => {
      if (url === "/api/skill-levels/notice-levels") {
        const prefix = query?.effect === "skill" ? "s." : query?.effect === "passive" ? "p." : "";
        if (!prefix || typeof query.id !== "string" || !Array.isArray(payload?.levels)) return;
        const definitions = Object.fromEntries(payload.levels.filter(row => Number.isSafeInteger(row.level) &&
          row.level >= 1 && row.level <= 50 && row.definition && typeof row.definition === "object")
          .map(row => [row.level, row.definition]));
        if (!Object.keys(definitions).length) return;
        localStorage.setItem(skillLevelsPrefix + prefix + query.id, JSON.stringify(definitions));
      } else {
        if (!Array.isArray(payload?.targets) || payload.available === false ||
            (url === "/api/skill-levels/mine" && !payload.targets.length)) return;
        const targets = Object.fromEntries(payload.targets.filter(item => typeof item?.skillId === "string" &&
          ["skill", "passive"].includes(item.effect)).map(item => [
          (item.effect === "skill" ? "s." : "p.") + item.skillId,
          Object.keys(item).flatMap(key => /^lv\d+$/.test(key) && item[key] && item[key] !== "—" ? [Number(key.slice(2))] : [])
        ]));
        if (url === "/api/skill-levels/notice") {
          const added = Object.fromEntries(payload.targets.filter(item => typeof item?.skillId === "string" &&
            ["skill", "passive"].includes(item.effect) && typeof item.addedAt === "string").map(item => [
            (item.effect === "skill" ? "s." : "p.") + item.skillId, item.addedAt.slice(0, 10)
          ]));
          levelNotice = { targets, added, at: Date.now() };
          try { localStorage.setItem(skillLevelsPrefix + "notice", JSON.stringify(levelNotice)); }
          catch { /* The catalogue is still available in this tab. */ }
        } else {
          try { localStorage.setItem(skillLevelsPrefix + "targets", JSON.stringify(targets)); }
          catch { /* Keep using the public catalogue. */ }
        }
        publishLevelTargets();
      }
      document.dispatchEvent(new Event("hako-af:planner-levels-ready"));
    }).catch(() => {});
  }

  window.addEventListener("storage", event => {
    if (event.key === skillLevelsPrefix + "notice" || event.key === skillLevelsPrefix + "targets") publishLevelTargets();
    if (!event.key?.startsWith(guildLineupPrefix)) return;
    guildLineups.delete(event.key.slice(guildLineupPrefix.length));
    guildFilterDataChanged();
  });

  function observeGuildBrowse(options, response) {
    const sequence = ++guildBrowseSequence;
    const sort = String(options?.query?.sort ?? "new");
    const more = !!options?.query?.cursor;
    Promise.resolve(response).then(payload => {
      if (sequence !== guildBrowseSequence || !Array.isArray(payload?.rows)) return;
      if (!more) {
        guildLayouts.clear();
        guildBrowseOrder.positions.clear();
        guildBrowseOrder.sort = sort;
      }
      for (const row of payload.rows) {
        const id = row?.guild_id;
        const key = id && guildKey(id, row.slot);
        if (key && guildBrowseOrder.sort === sort && !guildBrowseOrder.positions.has(key)) {
          guildBrowseOrder.positions.set(key, guildBrowseOrder.positions.size);
        }
        const published = row?.published;
        if (!id || !published) continue;
        guildLayouts.set(guildKey(id, row.slot), {
          ...publicGuildDefinition(published),
          mobDifficulty: published.mobDifficulty, bossDifficulty: published.bossDifficulty,
          entryFee: published.entryFee, specialEntryFee: published.specialEntryFee,
          mobStars: published.strength?.mob?.stars, bossStars: published.strength?.boss?.stars,
          revision: row.published_revision, mobEnemies: publicEnemyNames(published.mobEnemies),
          bossEnemies: publicEnemyNames(published.bossEnemies)
        });
      }
      guildFilterDataChanged();
    }).catch(() => {});
  }

  function observeGuildPublicDetail(url, options, response) {
    const path = /^\/api\/guild-dungeons\/public\/([^/?#]+)$/.exec(url);
    Promise.resolve(response).then(payload => {
      // Session-specific details can describe an earlier version and stay in the game's own view.
      if (path && !options?.query?.sessionId && String(payload?.guildId) === decodeURIComponent(path[1])) {
        rememberGuildLineup(guildKey(payload.guildId, payload.slot), payload.revision, payload.definition);
      }
      guildFilterDataChanged();
    }).catch(() => {});
  }

  function publishMating(result) {
    document.dispatchEvent(new CustomEvent("hako-af:mating-completed", { detail: JSON.stringify(result) }));
  }

  document.addEventListener("hako-af:watch-mating-results", () => {
    watchMatings = true;
    for (const result of earlyMatings.splice(0)) publishMating(result);
  }, { once: true });

  function publishExpedition(type, value) {
    document.dispatchEvent(new CustomEvent("hako-af:expedition-native-data", { detail: { type, value } }));
  }

  document.addEventListener("hako-af:read-expedition-native-data", () => {
    for (const [type, value] of expeditionData) publishExpedition(type, value);
  });

  function observeMating(args, response) {
    const [url, options] = args;
    if (options?.method !== "POST") return;
    const special = url === "/api/mating/r6-execute";
    const parentIds = special ? options.body?.materialIds : [options.body?.parentAId, options.body?.parentBId];
    if (!Array.isArray(parentIds) || !parentIds.length || !parentIds.every(validId)) return;
    const parents = parentIds.map(String);
    const stores = document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties?.$pinia?._s;
    const owner = stores?.get("userProfile")?.profile?.id;
    Promise.resolve(response).then(payload => {
      if (special ? payload?.success === false : payload?.success !== true) return;
      const id = payload?.monster?.id;
      if (!validId(id) || parents.includes(String(id))) return;
      const result = { parents, child: String(id), owner };
      if (watchMatings) publishMating(result);
      else earlyMatings.push(result);
    }).catch(() => {});
  }

  function validId(id) {
    return typeof id === "string" && id.length > 0 || Number.isSafeInteger(id);
  }

  function irreversibleMonsterRequest(url, body) {
    switch (url) {
      case "/api/mating/execute": return ["合成", [body?.parentAId, body?.parentBId]];
      case "/api/mating/r6-execute": return ["特殊合成", body?.materialIds];
      case "/api/mating/sacrifice": return ["素材として消費", body?.sacrificeIds];
      case "/api/soul/soulify": return ["魂化", [body?.userMonsterId]];
      case "/api/soul/soulify-batch": return ["魂化", body?.userMonsterIds];
      case "/api/monsters/release": return ["解放", [body?.userMonsterId]];
      case "/api/monsters/release-batch": return ["解放", body?.userMonsterIds];
      default: return null;
    }
  }

  function observe(native) {
    if (typeof native !== "function" || wrapped.has(native)) return native;
    const proxy = new Proxy(native, {
      apply(target, thisArg, args) {
        const operation = args[1]?.method === "POST" && irreversibleMonsterRequest(args[0], args[1].body);
        const guarded = operation && Array.isArray(operation[1]) && operation[1].length && operation[1].every(validId);
        const signature = guarded && JSON.stringify([args[0], operation[1].map(String)]);
        // Delegating $fetch wrappers must not ask again for the same native call.
        if (guarded && invokingOperation === signature) return Reflect.apply(target, thisArg, args);
        const invoke = () => {
          const previous = invokingOperation;
          let response;
          try {
            invokingOperation = signature;
            response = Reflect.apply(target, thisArg, args);
          } finally { invokingOperation = previous; }
          if (args[0] === "/api/guild-dungeons/browse") observeGuildBrowse(args[1], response);
          if (args[0] === "/api/pvp/season") observeOfficialSeason(response);
          if (["/api/skill-levels", "/api/skill-levels/mine", "/api/skill-levels/notice", "/api/skill-levels/notice-levels"].includes(args[0])) {
            observePlannerSkillLevels(args[0], args[1]?.query, response);
          }
          else if (typeof args[0] === "string" && args[0].startsWith("/api/guild-dungeons/public/")) {
            observeGuildPublicDetail(args[0], args[1], response);
          }
          const expeditionSource = expeditionSources.get(args[0]);
          if (expeditionSource) {
            const [type, select] = expeditionSource;
            Promise.resolve(response).then(payload => {
              const value = select(payload);
              if (value == null) return;
              expeditionData.set(type, value);
              publishExpedition(type, value);
            }).catch(() => {});
          }
          if (args[0] === "/api/market/stats") {
            // Observe the data already returned to the marketplace. Return its original promise to the caller.
            Promise.resolve(response).then(payload => {
              if (!Array.isArray(payload?.stats)) return;
              const at = Date.now();
              const requested = args[1]?.query?.item_ids;
              if (typeof requested === "string") {
                for (const id of requested.split(",")) prices.delete(id);
              } else prices.clear();
              for (const entry of payload.stats) {
                const price = Number(entry?.cheapest_price);
                if (typeof entry?.item_id === "string" && Number.isSafeInteger(price) && price > 0) prices.set(entry.item_id, { price, at });
              }
              document.dispatchEvent(new Event("hako-af:market-snapshot"));
            }).catch(() => {});
          }
          if (args[0] === "/api/mating/execute" || args[0] === "/api/mating/r6-execute") observeMating(args, response);
          return response;
        };
        if (!guarded) return invoke();
        const body = args[1].body;
        // The game's recovery request reuses requestId. Confirm that logical operation once,
        // while changed parents or inheritance selections still require a new confirmation.
        const requestKey = typeof body?.requestId === "string" && body.requestId.length <= 200
          ? JSON.stringify([signature, body.requestId, body.targetMonsterId, body.selectedTraitKeys,
            body.permanentKeepKeys, body.forgetKeys, body.inheritanceMode]) : null;
        let approval = requestKey && approvedOperations.get(requestKey);
        if (!approval) {
          approval = Promise.resolve().then(async () => {
            const ids = operation[1].map(String);
            const allowed = document.dispatchEvent(new CustomEvent("hako-af:guard-monster-operation", {
              cancelable: true, detail: JSON.stringify([operation[0], ids])
            }));
            let accepted = allowed;
            if (accepted) for (const guard of monsterGuards) {
              if (await guard(operation[0], ids, body) === false) { accepted = false; break; }
            }
            if (!accepted) {
              const statusMessage = "拡張育成ルートの警告で操作をキャンセルしました。";
              throw Object.assign(new Error(statusMessage), { statusCode: 400, data: { statusMessage } });
            }
          });
          if (requestKey) {
            approvedOperations.set(requestKey, approval);
            if (approvedOperations.size > 64) approvedOperations.delete(approvedOperations.keys().next().value);
            void approval.catch(() => { if (approvedOperations.get(requestKey) === approval) approvedOperations.delete(requestKey); });
          }
        }
        return approval.then(invoke);
      }
    });
    wrapped.add(proxy);
    return proxy;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "$fetch");
  if (descriptor && (!descriptor.configurable || !Object.hasOwn(descriptor, "value"))) return;
  let nativeFetch = observe(descriptor?.value);
  Object.defineProperty(globalThis, "$fetch", {
    configurable: true, enumerable: descriptor?.enumerable ?? true,
    get: () => nativeFetch,
    set: next => { nativeFetch = observe(next); }
  });
})();
