(() => {
  "use strict";
  if (globalThis.hakoAfFrameContext?.active === false) return;

  // The classic export is renamed after compilation; its instance uses the exported name.
  const views = new Set(["DungeonSelectModal", "ExploreDungeonSelectModal", "FlexDungeonSelectDialog"]);
  const fallbackLabels = ["通常", "過酷", "凶悪", "災厄", "修羅", "修羅Ⅱ", "修羅Ⅲ", "神域", "黙示録",
    "裏Ⅰ", "裏Ⅱ", "裏Ⅲ", "裏Ⅳ", "裏Ⅴ", "裏Ⅵ"];
  const listAttribute = "data-ha4-dungeon-reward-list";
  const rowAttribute = "data-ha4-dungeon-reward-id";
  const watchedStores = new WeakSet();
  const watchedScopes = new WeakSet();
  const changed = () => {
    if (document.querySelector(`[${listAttribute}]`)) document.dispatchEvent(new Event("hako-af:dungeon-rewards-changed"));
  };
  const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const open = value => {
    const timestamp = Number.isFinite(Number(value)) ? Number(value) : Date.parse(value);
    return !value || !Number.isFinite(timestamp) || timestamp <= Date.now();
  };
  const floorState = (party, id, difficulty, floor) => party?.dungeon_progress?.[id]?.byDifficulty?.[String(difficulty)]?.floors?.[String(floor)];
  const hasFloorHistory = (party, id, difficulty) => {
    const floors = party?.dungeon_progress?.[id]?.byDifficulty?.[String(difficulty)]?.floors;
    return floors && typeof floors === "object" && Object.keys(floors).length > 0;
  };

  function model(dungeons, partyStore, owner, selectedPartyIndex, translate) {
    const parties = Array.isArray(partyStore?.parties) ? partyStore.parties : [];
    const ready = !!owner && partyStore?.isLoaded === true &&
      (!partyStore.ownerUserId || partyStore.ownerUserId === owner);
    const selected = parties.find(party => Number(party.party_index) === Number(selectedPartyIndex));
    const currentParties = selected ? [selected] : parties;
    const text = (key, fallback) => {
      const value = translate(key);
      return typeof value === "string" && value && value !== key ? value : fallback;
    };
    const legacyClear = (id, difficulty) => difficulty === 1 && parties.some(party =>
      party.cleared_dungeon_ids?.includes(id) && !hasFloorHistory(party, id, 1));
    const cleared = (id, difficulty, floor) => legacyClear(id, difficulty) || parties.some(party =>
      floorState(party, id, difficulty, floor)?.cleared === true);
    const definitions = (Array.isArray(dungeons) ? dungeons : []).filter(dungeon =>
      dungeon?.id && !dungeon.is_guild && !dungeon.is_random && !dungeon.is_tower && open(dungeon.open_at));
    return { owner: owner ?? "", ready, dungeons: definitions.map(dungeon => {
      const modes = [];
      for (let difficulty = 1; difficulty <= 9; difficulty++) modes.push({ difficulty, floors: dungeon.floors ?? [] });
      const back = dungeon.back_dungeon;
      const template = back?.tiers?.find(tier => Number(tier.tier) === 1);
      if (back?.enabled === true && open(back.open_at) && Array.isArray(template?.floors)) {
        for (const tier of back.tiers) {
          const number = positiveInteger(tier.tier);
          if (number && number <= 6 && open(tier.open_at)) modes.push({ difficulty: 9 + number, floors: template.floors });
        }
      }
      const byDifficulty = new Map(modes.map(mode => [mode.difficulty, mode]));
      const rows = modes.map(({ difficulty, floors }) => ({ difficulty,
        label: text(`DUNGEON_DIFFICULTY_${difficulty}_NAME`, fallbackLabels[difficulty - 1]),
        floors: floors.map(floor => {
          const number = positiveInteger(floor.floor);
          const wins = positiveInteger(floor.boss_unlock_count);
          const rewards = (floor.rewards ?? []).filter(reward => reward.condition === "first_clear");
          const potions = rewards.flatMap(reward => reward.resources ?? []).filter(resource => resource.type === "stamina_potion")
            .reduce((sum, resource) => sum + Math.max(0, Number(resource.amount) || 0), 0);
          const claimed = ready ? cleared(dungeon.id, difficulty, number) : null;
          let unlocked = ready && !dungeon._locked;
          if (unlocked && difficulty > 9) {
            for (let previous = 9; previous < difficulty; previous++) {
              const before = byDifficulty.get(previous)?.floors ?? [];
              const final = Math.max(0, ...before.map(entry => Number(entry.floor) || 0));
              if (!final || !cleared(dungeon.id, previous, final)) { unlocked = false; break; }
            }
          } else if (unlocked && difficulty > 1) {
            unlocked = modes.some(mode => mode.difficulty >= difficulty - 1 && mode.difficulty <= 9 &&
              cleared(dungeon.id, mode.difficulty, number));
          }
          if (unlocked && number > 1) unlocked = currentParties.some(party => {
            const progress = party?.dungeon_progress?.[dungeon.id]?.byDifficulty?.[String(difficulty)];
            const reached = Number(progress?.max_reached) || 1;
            const current = party.current_dungeon_id === dungeon.id && Number(party.current_difficulty) === difficulty
              ? Number(party.max_floor_reached) || 1 : 1;
            return Math.max(reached, current) >= number || floorState(party, dungeon.id, difficulty, number - 1)?.cleared === true ||
              floorState(party, dungeon.id, difficulty, number)?.cleared === true || difficulty === 1 && legacyClear(dungeon.id, 1);
          });
          return { floor: number, wins, potions, net: wins == null ? null : potions * 10 - wins,
            claimed, unlocked: !!unlocked };
        }).filter(floor => floor.floor).sort((a, b) => a.floor - b.floor)
      }));
      return { id: dungeon.id, name: text(dungeon.name_key, dungeon.name ?? dungeon.id), locked: !!dungeon._locked, modes: rows };
    }) };
  }

  function startScan(stores, translate) {
    const contexts = new WeakMap();
    const owner = stores?.get("userProfile")?.profile?.id;
    const parties = stores?.get("parties");
    for (const store of [parties, stores?.get("userProfile")]) {
      if (!store || watchedStores.has(store) || typeof store.$subscribe !== "function") continue;
      watchedStores.add(store);
      store.$subscribe(changed, { detached: true, flush: "post" });
    }
    return (name, instance, vnode, el) => {
      if (views.has(name) && instance) {
        const props = instance.props;
        if (!props?.modelValue || props.readonly || !Array.isArray(props.dungeons)) {
          contexts.set(instance, null);
          return;
        }
        const report = model(props.dungeons, parties, owner, props.selectedPartyIndex, translate);
        contexts.set(instance, { report, rows: new Map(report.dungeons.map(row => [row.id, row])), json: JSON.stringify(report) });
      }
      if (el?.nodeType !== 1 || !vnode.ctx || vnode.key == null) return;
      const context = contexts.get(vnode.ctx);
      if (context === null && el.hasAttribute(rowAttribute)) {
        el.removeAttribute(rowAttribute);
        el.removeAttribute("data-ha4-dungeon-reward-hidden");
        el.parentElement?.removeAttribute("data-ha4-dungeon-reward-filtered");
      }
      if (!context) return;
      const classic = vnode.type === "button" && String(vnode.key).startsWith("thumb-");
      const flex = vnode.type === "li" && !!el.querySelector(":scope > .fx-dungeon-stage__thumb");
      if (!classic && !flex) return;
      const id = classic ? String(vnode.key).slice(6) : String(vnode.key);
      if (!context.rows.has(id)) return;
      const list = el.parentElement;
      if (!list) return;
      const scope = list.closest('[data-base-modal-root],.fx-dungeon') ?? list.parentElement;
      if (scope && !watchedScopes.has(scope)) {
        watchedScopes.add(scope);
        scope.addEventListener("click", changed);
        scope.addEventListener("change", changed);
      }
      if (el.getAttribute(rowAttribute) !== id) el.setAttribute(rowAttribute, id);
      if (list.getAttribute(listAttribute) !== context.json) list.setAttribute(listAttribute, context.json);
      const kind = classic ? "classic" : "flex";
      if (list.dataset.ha4DungeonRewardLayout !== kind) list.dataset.ha4DungeonRewardLayout = kind;
    };
  }

  globalThis.hakoAfDungeonRewardsMain = { startScan, model };
})();
