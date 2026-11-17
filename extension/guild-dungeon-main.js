(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const browseLayouts = globalThis.hakoAfGuildBrowseLayouts;
  const observedLineups = globalThis.hakoAfGuildLineups;
  const classicLists = new Set(["GuildDungeonNationList", "ExploreGuildDungeonNationList"]);
  const flexList = ".fx-dungeon__list";
  const listSelector = flexList + ',[aria-label="ギルドダンジョンの一覧"]';
  const listAttribute = "data-ha4-guild-filter-list";
  const rowAttribute = "data-ha4-guild-filter-row";
  const snapshots = new WeakMap();
  const number = value => (typeof value === "number" || typeof value === "string" && value.trim()) &&
    Number.isFinite(Number(value)) ? Number(value) : null;
  const flag = value => typeof value === "boolean" ? String(Number(value)) : null;

  function entries(groups) {
    return groups.flatMap(group => group.entries).filter(entry => entry?.is_guild && entry.id && entry.guildId);
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

  function rowData(entry, translate) {
    const summary = entry.summary ?? {};
    const id = String(entry.guildId);
    const fromList = summary.sessionId ? null : browseLayouts?.get(id);
    const revision = fromList?.revision;
    const current = entry.detail;
    const detail = Number.isSafeInteger(revision) && Number.isSafeInteger(current?.revision) &&
      current.revision !== revision ? null : current;
    const definition = detail?.definition;
    const lineup = observedLineups?.get(id, revision);
    const cached = snapshots.get(entry);
    if (cached && cached.fromList === fromList && cached.detail === detail && cached.lineup === lineup) return cached.value;
    const specialToday = detail?.business?.hasSpecialRewards ?? summary.specialToday;
    const normalFee = number(definition?.entryFee ?? fromList?.entryFee ?? summary.entryFee);
    const specialFee = number(definition?.specialEntryFee ?? fromList?.specialEntryFee ?? summary.specialEntryFee) ?? normalFee;
    const entryFee = specialToday === true ? specialFee : specialToday === false || normalFee === specialFee ? normalFee : null;
    const todayEntrants = number(summary.todayEntrants);
    const todayClearers = number(summary.todayClearers);
    const data = {
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
      todayClearRate: todayEntrants > 0 && todayClearers != null ? (todayClearers / todayEntrants) * 100 : null
    };
    const value = JSON.stringify(data);
    if (data.mobEnemies?.complete !== false && data.bossEnemies?.complete !== false) {
      snapshots.set(entry, { fromList, detail, lineup, value });
    }
    return value;
  }

  function startScan(dependencies, translate) {
    if (!document.querySelector(listSelector)) return;
    const contexts = new WeakMap();
    return (name, instance, vnode, el) => {
      if (classicLists.has(name) && instance && el?.nodeType === 1) {
        const rows = entries(instance.props?.groups ?? []);
        contexts.set(instance, new Map(rows.map(row => [row.id, row])));
        if (!el.hasAttribute(listAttribute)) el.setAttribute(listAttribute, "");
      } else if (name === "FlexDungeonSelectDialog" && instance) {
        // Its list renders grouped dungeon entries, including details fetched by the game's selector.
        const groups = dependencies(instance.effect).map(ref => ref._value).find(value =>
          Array.isArray(value) && value.some(group => Array.isArray(group?.entries) && group.entries.some(row => row?.is_guild)));
        const rows = groups ? entries(groups) : [];
        contexts.set(instance, new Map(rows.map(row => [row.id, row])));
      }
      if (el?.nodeType !== 1 || !vnode.ctx) return;
      const rows = contexts.get(vnode.ctx);
      if (!rows) return;
      if (el.matches(flexList)) {
        el.toggleAttribute(listAttribute, rows.size > 0 || !!el.querySelector(".fx-dungeon__guild-bar"));
      } else if (vnode.type === "li" && vnode.key != null) {
        const entry = rows.get(vnode.key);
        if (!entry) return;
        const value = rowData(entry, translate);
        if (el.getAttribute(rowAttribute) !== value) el.setAttribute(rowAttribute, value);
      }
    };
  }

  globalThis.hakoAfGuildDungeonMain = { startScan };
})();
