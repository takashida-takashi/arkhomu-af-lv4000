(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const browseLayouts = globalThis.hakoAfGuildBrowseLayouts;
  const browseOrder = globalThis.hakoAfGuildBrowseOrder;
  const observedLineups = globalThis.hakoAfGuildLineups;
  const classicLists = new Set(["GuildDungeonNationList", "ExploreGuildDungeonNationList"]);
  const flexList = ".fx-dungeon__list";
  const listSelector = flexList + ',[aria-label="ギルドダンジョンの一覧"]';
  const listAttribute = "data-ha4-guild-filter-list";
  const rowAttribute = "data-ha4-guild-filter-row";
  const number = value => (typeof value === "number" || typeof value === "string" && value.trim()) &&
    Number.isFinite(Number(value)) ? Number(value) : null;
  const flag = value => typeof value === "boolean" ? String(Number(value)) : null;

  function entries(groups) {
    return groups.flatMap(group => group.entries).filter(entry => entry?.is_guild && entry.id && entry.guildId);
  }

  function nativeOrder(instance, groups, dependencies, list) {
    const grouped = entries(groups);
    const container = list?.querySelector?.(listSelector) ?? list;
    const selected = [...container?.querySelectorAll("select") ?? []].find(select => !select.closest("[data-ha4]"));
    // The game regroups its sorted browse response by country before rendering.
    // Keep the original order, including server-only rankings and bookmark order.
    if (selected && browseOrder?.sort === selected.value && browseOrder.positions.size) {
      const positions = browseOrder.positions;
      const key = row => Number(row.slot ?? row.summary?.slot) > 1 ? `${row.guildId}:${Number(row.slot ?? row.summary?.slot)}` : String(row.guildId);
      if (grouped.some(row => positions.has(key(row)))) {
        return new Map(grouped.map((row, index) => [row.id, positions.get(key(row)) ?? positions.size + index]));
      }
    }
    const ids = new Set(grouped.map(row => row.id));
    const pending = [];
    for (let owner = instance, depth = 0; owner && depth < 4; owner = owner.parent, depth++) {
      pending.push(...dependencies(owner.effect));
    }
    const seen = new Set();
    while (pending.length && seen.size < 100) {
      const ref = pending.shift();
      if (seen.has(ref)) continue;
      seen.add(ref);
      const value = ref?._value;
      if (Array.isArray(value)) {
        const rows = value.filter(row => row?.is_guild && ids.has(row.id));
        if (rows.length === ids.size && rows.length && new Set(rows.map(row => row.id)).size === ids.size) {
          return new Map(rows.map((row, index) => [row.id, index]));
        }
      }
      pending.push(...dependencies(ref));
    }
    return new Map(grouped.map((row, index) => [row.id, index]));
  }

  function enemyNames(enemies, translate) {
    if (!Array.isArray(enemies)) return null;
    const names = new Set();
    let complete = true;
    for (const enemy of enemies) {
      if (!enemy) continue;
      const id = enemy.master_id;
      const keys = [enemy.name_key, id && "MONSTER_" + String(id).toUpperCase() + "_NAME"].filter(Boolean);
      const species = keys.map(key => {
        const result = translate(key);
        return result === key ? "" : result;
      }).find(Boolean) || (enemy.name !== enemy.nickname ? enemy.name : "");
      if (!species) complete = false;
      if (typeof species === "string" && species) names.add(species);
    }
    return { names: [...names], complete };
  }

  function lineupEnemies(definition, lineup, fromList, key) {
    // The standard detail treats missing slots in a loaded definition as empty.
    if (definition) return definition[key] ?? [];
    return lineup?.[key] ?? fromList?.[key];
  }

  function rowData(entry, translate, order, nationName) {
    const summary = entry.summary ?? {};
    const id = Number(entry.slot ?? summary.slot) > 1 ? `${entry.guildId}:${Number(entry.slot ?? summary.slot)}` : String(entry.guildId);
    const fromList = summary.sessionId ? null : browseLayouts?.get(id);
    const revision = fromList?.revision;
    const current = entry.detail;
    const detail = Number.isSafeInteger(revision) && Number.isSafeInteger(current?.revision) &&
      current.revision !== revision ? null : current;
    const definition = detail?.definition;
    const lineup = observedLineups?.get(id, revision);
    const settings = definition ?? lineup?.definition ?? fromList;
    const completeSettings = !!(definition || lineup?.definition);
    const specialToday = detail?.business?.hasSpecialRewards ?? summary.specialToday;
    const normalFee = number(definition?.entryFee ?? fromList?.entryFee ?? summary.entryFee);
    const specialFee = number(definition?.specialEntryFee ?? fromList?.specialEntryFee ?? summary.specialEntryFee) ?? normalFee;
    const entryFee = specialToday === true ? specialFee : specialToday === false || normalFee === specialFee ? normalFee : null;
    const todayEntrants = number(summary.todayEntrants);
    const todayClearers = number(summary.todayClearers);
    const mobEnemies = lineupEnemies(definition, lineup, fromList, "mobEnemies"), bossEnemies = lineupEnemies(definition, lineup, fromList, "bossEnemies");
    const names = values => values ? { names: values.map(item => {
      const key = item.nameKey ?? item.name_key ?? (item.skillId ? "PASSIVE_" + item.skillId.toUpperCase() + "_NAME" : item.source_item_id ? "ITEM_" + item.source_item_id.toUpperCase() + "_NAME" : "");
      const name = translate(key);return name && name !== key ? name : "";
    }).filter(Boolean), complete: values.every(item => { const key = item.nameKey ?? item.name_key ?? (item.skillId ? "PASSIVE_" + item.skillId.toUpperCase() + "_NAME" : item.source_item_id ? "ITEM_" + item.source_item_id.toUpperCase() + "_NAME" : "");return !!key && translate(key) !== key; }) } : null;
    const maxLevel = rows => Array.isArray(rows) && rows.filter(Boolean).every(e => number(e.level) != null) ? Math.max(0, ...rows.filter(Boolean).map(e => Number(e.level))) : null;
    const data = {
      id, revision: number(browseLayouts?.get(id)?.revision ?? (!summary.sessionId ? current?.revision : null)),
      nativeOrder: order,
      name: entry.name ?? summary.name,
      guild: entry.guildName ?? summary.guildName,
      mobDifficulty: number(definition?.mobDifficulty ?? fromList?.mobDifficulty ?? summary.mobDifficulty),
      bossDifficulty: number(definition?.bossDifficulty ?? fromList?.bossDifficulty ?? summary.bossDifficulty),
      mobEnemies: enemyNames(lineupEnemies(definition, lineup, fromList, "mobEnemies"), translate),
      bossEnemies: enemyNames(lineupEnemies(definition, lineup, fromList, "bossEnemies"), translate),
      mobStars: number(detail?.strength?.mob?.stars ?? fromList?.mobStars ?? summary.strength?.mob?.stars),
      bossStars: number(detail?.strength?.boss?.stars ?? fromList?.bossStars ?? summary.strength?.boss?.stars),
      entryFee, normalFee, specialFee,
      specialToday: flag(specialToday),
      todayClosed: flag(summary.todayClosed),
      todayEntrants, todayClearers,
      todayClearRate: todayEntrants > 0 && todayClearers != null ? (todayClearers / todayEntrants) * 100 : null,
      description: settings?.description ?? entry.description ?? summary.description,
      nation: summary.nationId ? { names: [nationName, String(summary.nationId)].filter(Boolean), complete: !!nationName } : null,
      version: settings?.version == null ? null : String(settings.version),
      slot: number(entry.slot ?? summary.slot) ?? 1,
      sourceDungeon: settings?.sourceDungeonId ? { names: [translate("DUNGEON_" + settings.sourceDungeonId.toUpperCase() + "_NAME"), settings.sourceDungeonId], complete: true } : null,
      mobCount: Array.isArray(mobEnemies) ? mobEnemies.filter(Boolean).length : null,
      bossCount: Array.isArray(bossEnemies) ? bossEnemies.filter(Boolean).length : null,
      mobMaxLevel: maxLevel(mobEnemies), bossMaxLevel: maxLevel(bossEnemies),
      dungeonEffects: names(settings?.dungeonEffectList ?? (completeSettings ? [] : null)), effectCount: settings?.dungeonEffectList?.length ?? (completeSettings ? 0 : null),
      upperChance: number(settings?.upperPrefixFloor?.chance) == null ? null : Number(settings.upperPrefixFloor.chance) * 100,
      upperMinRank: number(settings?.upperPrefixFloor?.minRank),
      rank6MobDrop: number(settings?.rank6MobDrop?.factor) == null ? null : Number(settings.rank6MobDrop.factor) * 100,
      rank6MobFull: number(settings?.rank6MobDrop?.full),
      visits: number(detail?.visits), clears: number(detail?.clears),
      clearRate: Number(detail?.visits) > 0 && number(detail?.clears) != null ? Number(detail.clears) / Number(detail.visits) * 100 : null,
      winsRemaining: number(detail?.dailyRemaining?.wins), bossRemaining: number(detail?.dailyRemaining?.boss),
      reviewAverage: number(detail?.reviewSummary?.avg), reviewCount: number(detail?.reviewSummary?.count),
      todayShared: flag(detail?.today?.shared ?? summary.todayShared)
    };
    for (const side of ["mob", "boss"]) {
      const slots = settings?.passiveSlots?.[side];
      data[side + "Passives"] = names(slots?.chosen ?? (completeSettings ? [] : null));
      data[side + "PassiveCount"] = number(slots?.total) ?? (completeSettings ? 0 : null);
      data[side + "ChosenCount"] = slots?.chosen?.length ?? (completeSettings ? 0 : null);
      data[side + "RandomCount"] = number(slots?.random) ?? (completeSettings ? 0 : null);
      const trial = settings?.[side + "TrialPassive"];
      data[side + "TrialPassive"] = typeof trial === "boolean" ? flag(trial) : completeSettings ? "0" : null;
      for (const rate of ["drop", "steal"]) data[side + (rate === "drop" ? "DropRate" : "StealRate")] = number(settings?.rateBoosts?.[side]?.[rate]) ?? (completeSettings ? 1 : null);
      const factor = number(settings?.trialDropFactor?.[side]) ?? (completeSettings ? 1 : null);
      data[side + "TrialDrop"] = factor == null ? null : factor * 100;
      const equipped = side === "boss" && settings?.bossEnemyArtifacts ? settings.bossEnemyArtifacts : settings?.enemyArtifacts;
      data[side + "Artifacts"] = names(equipped ?? (completeSettings ? [] : null));data[side + "ArtifactCount"] = equipped?.length ?? (completeSettings ? 0 : null);
    }
    const value = JSON.stringify(data);
    return value;
  }

  function startScan(dependencies, translate) {
    const contexts = new WeakMap();
    const selected = [];
    const countries = new Map();
    const rememberCountries = groups => { for (const group of groups) if (group.nationId != null && group.name) countries.set(String(group.nationId), group.name); };
    const read = (name, instance, vnode, el) => {
      if (classicLists.has(name) && instance && el?.nodeType === 1) {
        const groups = instance.props?.groups ?? [];
        rememberCountries(groups);
        const rows = entries(groups);
        contexts.set(instance, { rows: new Map(rows.map(row => [row.id, row])), order: nativeOrder(instance, groups, dependencies, el) });
        if (!el.hasAttribute(listAttribute)) el.setAttribute(listAttribute, "");
      } else if (name === "FlexDungeonSelectDialog" && instance) {
        // Its list renders grouped dungeon entries, including details fetched by the game's selector.
        const groups = dependencies(instance.effect).map(ref => ref._value).find(value =>
          Array.isArray(value) && value.some(group => Array.isArray(group?.entries) && group.entries.some(row => row?.is_guild)));
        const rows = groups ? entries(groups) : [];
        rememberCountries(groups ?? []);
        contexts.set(instance, { rows: new Map(rows.map(row => [row.id, row])), order: nativeOrder(instance, groups ?? [], dependencies, el) });
      }
      if (el?.nodeType !== 1 || !vnode.ctx) return;
      const context = contexts.get(vnode.ctx);
      if (!context) return;
      const { rows, order } = context;
      if (el.matches(flexList)) {
        el.toggleAttribute(listAttribute, rows.size > 0 || !!el.querySelector(".fx-dungeon__guild-bar"));
      } else if (vnode.type === "li" && vnode.key != null) {
        const entry = rows.get(vnode.key);
        if (!entry) return;
        const value = rowData(entry, translate, order.get(entry.id), countries.get(String(entry.summary?.nationId)));
        if (el.getAttribute(rowAttribute) !== value) el.setAttribute(rowAttribute, value);
        if (el.querySelector(':scope > button[aria-pressed="true"]')) selected.push({ el, value });
      }
    };
    read.finish = () => {
      const active = new Set();
      for (const { el, value } of selected) {
        const area = el.closest('[data-base-modal-root],dialog') ?? el.closest('.fx-dungeon') ?? document.getElementById("__nuxt");
        const heading = [...area?.querySelectorAll('.fx-dungeon-stage__title,#fx-dungeon-detail-title,h4.text-2xl.text-center.leading-tight') ?? []]
          .find(node => node.getClientRects().length && !node.closest('[data-ha4]'));
        if (!heading) continue;
        active.add(heading);
        if (heading.getAttribute("data-ha4-guild-selected") !== value) heading.setAttribute("data-ha4-guild-selected", value);
      }
      for (const heading of document.querySelectorAll('[data-ha4-guild-selected]')) if (!active.has(heading)) heading.removeAttribute("data-ha4-guild-selected");
    };
    return read;
  }

  globalThis.hakoAfGuildDungeonMain = { startScan };
})();
