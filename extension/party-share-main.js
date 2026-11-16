(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const panels = new WeakMap();
  const individuals = new WeakMap();
  const detailAnchors = new WeakMap();
  const partyModes = { 1: "探索", boss: "ボス", raid: "レイド", "pvp-official": "公式PvP", "pvp-rating": "魔王PvP", conquest: "国取り" };
  const baseBonusKeys = ["hp", "atk", "mtk", "def", "mdf", "spd"];
  const bonusKeys = new Set([...baseBonusKeys, "lck", "cri", "cdmg"]);
  let readers;

  function nativeUrl(file, base = location.origin) {
    const url = new URL(file, base);
    if (url.origin !== location.origin || !/^\/_nuxt\/[\w-]+\.js$/.test(url.pathname) || url.search || url.hash) {
      throw new Error("Unexpected native module");
    }
    return url.href;
  }

  async function nativeSource(url) {
    const response = await fetch(url, { cache: "force-cache", credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error("Native module unavailable");
    return response.text();
  }

  function importedBinding(source, local, base) {
    for (const [, bindings, file] of source.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
      for (const binding of bindings.split(",")) {
        const [exported, alias = exported] = binding.trim().split(/\s+as\s+/);
        if (alias === local) return { url: nativeUrl(file, base), exported };
      }
    }
    throw new Error("Native binding unavailable");
  }

  function destructuredFrom(source, property) {
    const pattern = new RegExp(`\\{[^{}]*\\b${property}\\s*(?::\\s*[$\\w]+)?(?=\\s*[,}])[^{}]*?\\}\\s*=\\s*([$\\w]+)\\(`);
    const match = pattern.exec(source);
    if (!match) throw new Error("Native party data unavailable");
    return match[1];
  }

  async function loadReaders() {
    // Resolve the hashed modules from the standard party page's read-only skill helpers.
    const script = [...document.querySelectorAll('script[type="module"][src]')]
      .find(node => /^\/_nuxt\/[\w-]+\.js$/.test(new URL(node.src).pathname));
    const entry = nativeUrl(script?.src);
    const routes = await nativeSource(entry);
    const route = /name:\s*["']flex-party["'][^{}]{0,240}?\bimport\(\s*["']([^"']+)["']/.exec(routes);
    const page = nativeUrl(route?.[1], entry);
    const component = await nativeSource(page);
    const controller = importedBinding(component, destructuredFrom(component, "currentPartyKey"), page);
    const source = await nativeSource(controller.url);
    const learned = importedBinding(source, destructuredFrom(source, "getActiveSkills"), controller.url);
    const masters = importedBinding(source, destructuredFrom(source, "getActiveSkill"), controller.url);
    const [learnedModule, masterModule] = await Promise.all([import(learned.url), import(masters.url)]);
    return { learned: learnedModule[learned.exported], masters: masterModule[masters.exported] };
  }

  function bind(name, props, el) {
    if (!Array.isArray(props?.party)) return;
    const classic = name === "PartyFormationPanel";
    const panel = classic ? el : el.closest(".fx-party__panel");
    const actions = classic ? el.querySelector('[role="region"][aria-label="パーティ"] > div') : panel?.querySelector(".fx-party__actions");
    if (!actions) return;
    panels.set(panel, { props, classic });
    if (!actions.hasAttribute("data-ha4-party-actions")) actions.setAttribute("data-ha4-party-actions", "");
    if (!panel.hasAttribute("data-ha4-party-panel")) panel.setAttribute("data-ha4-party-panel", "");
  }

  function partyOf(panel) {
    if (!panel?.hall) return panel?.props.party;
    return panel.props.detail?.canView ? panel.props.detail.party?.members : null;
  }

  function bindHall(props, panel) {
    const showcase = panel.querySelector(":scope > .fx-ppd,:scope > .grid.grid-cols-3");
    const comment = [...panel.querySelectorAll(":scope > div > button")]
      .find(button => /^コメント\s*[\d,]+$/.test(button.textContent.trim()));
    const controls = comment?.parentElement;
    const actions = controls ?? showcase;
    const binding = { props, hall: true, actions, showcase };
    const previous = panels.get(panel);
    if (previous?.actions && previous.actions !== actions) previous.actions.removeAttribute("data-ha4-party-hall-actions");
    const party = partyOf(binding);
    if (!showcase || !Array.isArray(party) || !party.some(Boolean)) {
      actions?.removeAttribute("data-ha4-party-hall-actions");
      panel.removeAttribute("data-ha4-party-panel");
      panels.delete(panel);
      return;
    }
    panels.set(panel, binding);
    if (!actions.hasAttribute("data-ha4-party-hall-actions")) actions.setAttribute("data-ha4-party-hall-actions", "");
    if (!panel.hasAttribute("data-ha4-party-panel")) panel.setAttribute("data-ha4-party-panel", "");
  }

  function clearMember(anchor) {
    anchor.removeAttribute("data-ha4-share-member");
    anchor.removeAttribute("data-ha4-training-target");
    individuals.delete(anchor);
  }

  function bindMember(name, props, vnode, owned, translate) {
    const tree = vnode.component?.subTree;
    const root = tree?.el?.nodeType === 1 ? tree.el : Array.isArray(tree?.children) ?
      tree.children.find(child => child?.el?.nodeType === 1)?.el : null;
    if (!root?.isConnected) return;
    const anchor = name === "MonsterDetailPanel" ? (props.hideHeader ? root : root.firstElementChild ?? root) :
      root.querySelector(".fx-mdetail__head") ?? root;
    const previous = detailAnchors.get(vnode.component);
    if (previous && previous !== anchor) clearMember(previous);
    const monster = props?.monster;
    const native = monster?.t_user_monsters ?? monster;
    const id = monster?.user_monster_id ?? native?.user_monster_id;
    const record = id == null || !Array.isArray(owned) ? null : owned.find(member => member?.user_monster_id === id);
    if (props?.maskSkills || !record) {
      clearMember(anchor);
      detailAnchors.delete(vnode.component);
      return;
    }
    detailAnchors.set(vnode.component, anchor);
    individuals.set(anchor, monster);
    if (!anchor.hasAttribute("data-ha4-share-member")) anchor.setAttribute("data-ha4-share-member", "");
    const key = native.m_monsters?.name_key ?? monster.m_monsters?.name_key ?? record.name_key ?? record.m_monsters?.name_key;
    const species = key ? translate(key) : record.m_monsters?.name ?? "この個体";
    const nickname = native.nickname ?? record.nickname;
    const nameLabel = typeof nickname === "string" && nickname.trim() && nickname.trim() !== species ?
      `${nickname.trim()}（${species}）` : species;
    const level = native.level ?? record.level;
    const target = JSON.stringify({ id: String(id), name: level ? `${nameLabel} Lv${level}` : nameLabel });
    if (anchor.dataset.ha4TrainingTarget !== target) anchor.dataset.ha4TrainingTarget = target;
  }

  function bonusParameters(monster, native) {
    const traits = native.inherited_traits ?? monster.inherited_traits;
    const stats = native.bonus_stats ?? monster.bonus_stats;
    const fallback = [monster._battleBonusParamStats, native.equip_param_stats ?? monster.equip_param_stats,
      monster._equipParamStats, monster._isBattleSummon ? stats : null].filter(data => data && typeof data === "object");
    if (!Array.isArray(traits) && !stats && !fallback.length) return;
    const bonus = {};
    // Match the game's detail view: inherited direct bonuses, with displayed equipment values as a fallback.
    for (const trait of Array.isArray(traits) ? traits : []) {
      const effect = trait?.effect_data;
      if (trait?._prefix || !["add_param", "talent", "equip_param"].includes(effect?.type)) continue;
      const key = effect.target_stat === "max_hp" ? "hp" : effect.target_stat;
      const value = Number(effect.value);
      if (bonusKeys.has(key) && Number.isFinite(value)) bonus[key] = (bonus[key] ?? 0) + value;
    }
    for (const key of baseBonusKeys) {
      const first = fallback.find(data => Number.isFinite(Number(data[key])) && Number(data[key]) !== 0);
      if (first && !bonus[key]) bonus[key] = Number(first[key]);
    }
    const luck = Number(stats?.lck);
    if (Number.isFinite(luck)) bonus.lck = (bonus.lck ?? 0) + luck;
    return Object.fromEntries(Object.entries(bonus).map(([key, value]) => [key, Math.floor(value)]).filter(([, value]) => value !== 0));
  }

  function monsterSnapshot(monster, skills, masters, settings, translate, displayName) {
    const native = monster.t_user_monsters ?? monster;
    const master = native.m_monsters ?? monster.m_monsters ?? native.official_master ?? monster.official_master ?? native.master ?? monster.master;
    const id = native.user_monster_id ?? monster.user_monster_id;
    const overrides = {};
    if (id && Object.hasOwn(settings?.reservedSkills ?? {}, id)) overrides.reserved_skills = [...settings.getReservedSkills(id)];
    if (id && Object.hasOwn(settings?.disabledPassives ?? {}, id)) overrides.disabled_passives = [...settings.getDisabledPassives(id)];
    if (id && Object.hasOwn(settings?.skillOrders ?? {}, id)) overrides.skill_order = settings.getSkillOrder(id);
    const member = { ...monster, ...overrides, ...(monster.t_user_monsters ? { t_user_monsters: { ...native, ...overrides } } : {}) };
    const savedPermanent = native.permanent_skills ?? monster.permanent_skills;
    const permanent = Array.isArray(savedPermanent) ? savedPermanent : [];
    const label = (key, fallback) => typeof key === "string" && key ? translate(key) || fallback : fallback;
    const describe = (list, type, getMaster) => list.map(entry => ({
      name: label(entry.name_key ?? getMaster(entry.id)?.name_key, entry.id),
      permanent: permanent.some(skill => typeof skill === "string" ? skill === entry.id :
        skill?.id === entry.id && (skill.effect === "passive" ? "passive" : "skill") === type)
    }));
    const attack = native.attack_skill ?? master?.attack_skill;
    const art = master?.image_file_name ?? monster.image_file_name;
    const rawGeneration = native.generation_value ?? monster.generation_value;
    const generation = rawGeneration == null ? undefined : Number(rawGeneration);
    const disabled = new Set(id && Object.hasOwn(settings?.disabledSkills ?? {}, id)
      ? settings.getDisabledSkills(id) : native.disabled_skills ?? []);
    const active = skills.getActiveSkills(member).filter(entry => {
      const stored = native.skill_priorities?.[entry.id] ?? 1;
      const priority = id ? settings?.getPriority?.(id, entry.id, stored) ?? stored : stored;
      return !disabled.has(entry.id) && priority !== 0;
    });
    return {
      name: displayName || label(master?.name_key ?? monster.name_key, String(master?.id ?? native.monster_id ?? native.master_id ?? "ホムンクルス")),
      level: Number(native.level ?? monster.level) || 0,
      generation: Number.isFinite(generation) && generation >= 0 ? generation : undefined,
      bonus: bonusParameters(monster, native),
      portrait: typeof art === "string" ? art : "",
      attack: typeof attack === "string" ? label(masters.getActiveSkill(attack)?.name_key, attack) : "",
      active: describe(active, "skill", masters.getActiveSkill),
      passive: describe(skills.getPassiveSkills(member), "passive", masters.getPassiveSkill)
    };
  }

  document.addEventListener("hako-af:read-party-share", async event => {
    const anchor = event.target;
    const individual = individuals.has(anchor);
    if (!individual && !panels.has(anchor)) return;
    const reply = (type, value) => anchor.dispatchEvent(new CustomEvent("hako-af:party-share-data", {
      detail: JSON.stringify({ type, value })
    }));
    const root = document.getElementById("__nuxt");
    const app = root?.__vue_app__;
    const original = panels.get(anchor);
    const post = original?.hall ? original.props.detail?.post : null;
    if (!app || (!individual && !partyOf(original)?.some(Boolean))) {
      reply("error", "共有する編成にホムンクルスを配置してください。");
      return;
    }
    try {
      readers ??= loadReaders().catch(error => { readers = null; throw error; });
      const tools = await readers;
      if (!anchor.isConnected || !anchor.getClientRects().length) return;
      const panel = panels.get(anchor);
      if (post && panel?.props.detail?.post !== post) {
        reply("error", "表示中の投稿が切り替わりました。共有する編成を開き直してください。");
        return;
      }
      const party = individual ? [individuals.get(anchor)] : partyOf(panel);
      if (!party?.some(Boolean)) {
        reply("error", "共有する編成にホムンクルスを配置してください。");
        return;
      }
      const properties = app.config.globalProperties;
      const inContext = properties.$nuxt?.runWithContext?.bind(properties.$nuxt) ?? app.runWithContext.bind(app);
      const snapshot = inContext(() => {
        const masters = tools.masters();
        if (masters.isLoaded?.value !== true) return null;
        const skills = tools.learned();
        const settings = panel?.hall ? null : properties.$pinia?._s?.get("skillSettings");
        const visibleSlots = panel?.hall ? panel.showcase.querySelectorAll(panel.showcase.matches(".fx-ppd")
          ? ".fx-ppd__slots > li" : ":scope > div") : [];
        const slots = Array.from({ length: 6 }, (_, index) => party[index]
          ? monsterSnapshot(party[index], skills, masters, settings, properties.$t ?? (key => key),
            visibleSlots[index]?.querySelector(".fx-ppd__member-name,.font-bold.truncate")?.textContent.trim()) : null);
        if (individual) return { version: 1, individual: true, name: slots[0].name.slice(0, 100), slots };
        if (panel.hall) {
          const source = post?.guild ? "殿堂・ギルド" : "殿堂";
          const name = `${post?.author?.name || source}の編成`;
          return { version: 1, name: (post?.author?.name ? `${source}　${name}` : name).slice(0, 100), slots };
        }
        const name = panel.classic ? (partyModes[panel.props.currentPartyIndex] ?? "パーティ") + "の編成"
          : anchor.getAttribute("aria-label") || "パーティ編成";
        return { version: 1, name, slots };
      });
      if (snapshot) reply("snapshot", snapshot);
      else reply("error", "スキルを読み込み中です。少し待ってから開き直してください。");
    } catch {
      reply("error", "この画面から編成情報を読み取れませんでした。編成画面を再読み込みしてからお試しください。");
    }
  });
  globalThis.hakoAfPartyShareMain = { bind, bindMember, bindHall };
})();
