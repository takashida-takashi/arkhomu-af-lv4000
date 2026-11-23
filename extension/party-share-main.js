(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const panels = new WeakMap();
  const individuals = new WeakMap();
  const simulatorMembers = new WeakMap();
  const detailAnchors = new WeakMap();
  const memberWatches = new WeakSet();
  const memberStates = new WeakMap();
  const profileViews = new Set(["ProfilePublicView", "FlexPublicProfileView"]);
  const profileParties = new Set(["TopRatedPartyModal", "ColosseumTopRatedPartyModal", "FlexProfilePartyDialog"]);
  const guildDetails = new Set(["GuildMonsterDetailModal", "FlexGuildMembers", "FlexGuildDetailDialog"]);
  const partyModes = { 1: "探索", boss: "ボス", raid: "レイド", "pvp-official": "公式PvP", "pvp-rating": "魔王PvP", conquest: "国取り" };
  const baseBonusKeys = ["hp", "atk", "mtk", "def", "mdf", "spd"];
  const bonusKeys = new Set([...baseBonusKeys, "lck", "cri", "cdmg"]);
  let readers;
  let effectReaders;
  let simulatorTraining;

  function nativeUrl(file, base = location.origin) {
    const url = new URL(file, base);
    if (url.origin !== location.origin || !/^\/_nuxt\/[\w-]+\.js$/.test(url.pathname) || url.search || url.hash) {
      throw new Error("Unexpected native module");
    }
    return url.href;
  }

  async function nativeSource(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { cache: "force-cache", credentials: "omit", redirect: "error", signal: controller.signal });
      if (!response.ok) throw new Error("Native module unavailable");
      return await response.text();
    } finally { clearTimeout(timer); }
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

  function getReaders() {
    return readers ??= loadReaders().catch(error => { readers = null; throw error; });
  }

  async function readTrainingFactory() {
    const script = [...document.querySelectorAll('script[type="module"][src]')].find(node => /^\/_nuxt\/[\w-]+\.js$/.test(new URL(node.src).pathname));
    const entry = nativeUrl(script?.src), source = await nativeSource(entry);
    const route = /name:\s*["']monsters["'][^{}]{0,240}?\bimport\(\s*["']([^"']+)["']/.exec(source);
    const page = nativeUrl(route?.[1], entry), pageSource = await nativeSource(page);
    const lazy = /\bimport\(\s*["']([^"']+)["']/.exec(pageSource);
    const detail = nativeUrl(lazy?.[1], page), detailSource = await nativeSource(detail);
    const controller = importedBinding(detailSource, destructuredFrom(detailSource, "effectiveTrainingBonus"), detail);
    const controllerSource = await nativeSource(controller.url);
    const training = importedBinding(controllerSource, destructuredFrom(controllerSource, "deployBonus"), controller.url);
    return (await import(training.url))[training.exported];
  }

  async function loadEffectReaders() {
    const script = [...document.querySelectorAll('script[type="module"][src]')]
      .find(node => /^\/_nuxt\/[\w-]+\.js$/.test(new URL(node.src).pathname));
    const entry = nativeUrl(script?.src);
    const routes = await nativeSource(entry);
    const route = /name:\s*["']skill-level-notice["'][^{}]{0,240}?\bimport\(\s*["']([^"']+)["']/.exec(routes);
    const page = nativeUrl(route?.[1], entry);
    const component = await nativeSource(page);
    // The classic page wraps the same view as mobile. Follow its named imports only.
    const children = [...component.matchAll(/\bimport\s*\{[^}]+\}\s*from\s*["']([^"']+)["']/g)]
      .map(match => nativeUrl(match[1], page)).filter(url => url !== entry);
    const candidates = [{ url: page, source: component }, ...[...new Set(children)].reverse().slice(0, 6).map(url => ({ url }))];
    for (const candidate of candidates) {
      const source = candidate.source ?? await nativeSource(candidate.url);
      let local;
      try { local = destructuredFrom(source, "formatPassiveSkillEffects"); } catch { continue; }
      const binding = importedBinding(source, local, candidate.url);
      const module = await import(binding.url);
      const factory = module[binding.exported];
      if (typeof factory === "function") return factory;
    }
    throw new Error("Native skill effect formatter unavailable");
  }

  function getEffectReaders() {
    return effectReaders ??= loadEffectReaders().catch(error => { effectReaders = null; throw error; });
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

  function clearMember(anchor, preserveSimulator = false) {
    anchor.removeAttribute("data-ha4-share-member");
    anchor.removeAttribute("data-ha4-training-target");
    anchor.removeAttribute("data-ha4-training-import-member");
    individuals.delete(anchor);
    if (!preserveSimulator) { anchor.removeAttribute("data-ha4-stat-member");simulatorMembers.delete(anchor); }
  }

  function showsPublicSkills(props) {
    const monster = props?.monster;
    const native = monster?.t_user_monsters ?? monster;
    return props?.maskSkills === false && !!native && ![monster, native].some(member =>
      member?._maskSkills === true || member?.build_hidden === true);
  }

  function isTrainingSource(instance) {
    const guildPage = /^\/(?:f\/)?guild\/?$/.test(location.pathname);
    let inProfileParty = false;
    for (let parent = instance.parent; parent; parent = parent.parent) {
      const name = parent.type?.__name;
      if (guildPage && guildDetails.has(name)) return true;
      if (profileParties.has(name) && parent.props?.modelValue === true) inProfileParty = true;
      if (inProfileParty && profileViews.has(name)) return true;
    }
    return false;
  }

  function bindMemberDetail(name, props, vnode, owned, translate) {
    const tree = vnode.component?.subTree;
    const root = tree?.el?.nodeType === 1 ? tree.el : Array.isArray(tree?.children) ?
      tree.children.find(child => child?.el?.nodeType === 1)?.el : null;
    if (!root?.isConnected) return;
    const anchor = name === "MonsterDetailPanel" ? (props.hideHeader ? root : root.firstElementChild ?? root) :
      root.querySelector(".fx-mdetail__head") ?? root;
    const previous = detailAnchors.get(vnode.component);
    if (previous && previous !== anchor) clearMember(previous);
    detailAnchors.set(vnode.component, anchor);
    const monster = props?.monster;
    const native = monster?.t_user_monsters ?? monster;
    const id = monster?.user_monster_id ?? native?.user_monster_id;
    const record = id == null || !Array.isArray(owned) ? null : owned.find(member => member?.user_monster_id === id);
    if (monster && native) {
      anchor.setAttribute("data-ha4-stat-member", "");
      simulatorMembers.set(anchor, { monster, props, instance: vnode.component, publicTraining: !record,
        skillsVisible: !!record || showsPublicSkills(props) });
    } else { clearMember(anchor);return; }
    const trainingSource = isTrainingSource(vnode.component);
    root.toggleAttribute("data-ha4-public-training-detail", trainingSource);
    const publicTraining = trainingSource && showsPublicSkills(props);
    if (props?.maskSkills || !record && !publicTraining) {
      clearMember(anchor, true);
      return;
    }
    individuals.set(anchor, { monster, props, instance: vnode.component, publicTraining });
    anchor.toggleAttribute("data-ha4-share-member", !!record);
    anchor.toggleAttribute("data-ha4-training-import-member", publicTraining);
    if (!record) {
      anchor.removeAttribute("data-ha4-training-target");
      return;
    }
    const key = native.m_monsters?.name_key ?? monster.m_monsters?.name_key ?? record.name_key ?? record.m_monsters?.name_key;
    const species = key ? translate(key) : record.m_monsters?.name ?? "この個体";
    const nickname = native.nickname ?? record.nickname;
    const nameLabel = typeof nickname === "string" && nickname.trim() && nickname.trim() !== species ?
      `${nickname.trim()}（${species}）` : species;
    const level = native.level ?? record.level;
    const target = JSON.stringify({ id: String(id), name: level ? `${nameLabel} Lv${level}` : nameLabel });
    if (anchor.dataset.ha4TrainingTarget !== target) anchor.dataset.ha4TrainingTarget = target;
    return { anchor, monster, record, id: String(id), instance: vnode.component };
  }

  function bindMember(name, props, vnode, owned, translate) {
    const instance = vnode.component;
    const ownedNow = () => document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get("userMonsters")?.monsters ?? owned;
    const result = bindMemberDetail(name, props, vnode, ownedNow(), translate);
    if (!instance) return result;
    const anchor = detailAnchors.get(instance);
    const state = [anchor, props?.monster, anchor?.isConnected, anchor?.hasAttribute("data-ha4-share-member"),
      anchor?.hasAttribute("data-ha4-training-import-member"), anchor?.hasAttribute("data-ha4-stat-member"),
      anchor?.getAttribute("data-ha4-training-target")];
    const previous = memberStates.get(instance);
    if (!previous || state.some((value, index) => value !== previous[index])) {
      memberStates.set(instance, state);
      document.dispatchEvent(new Event("hako-af:member-ready"));
    }
    if (!memberWatches.has(instance) && typeof instance.proxy?.$watch === "function") {
      memberWatches.add(instance);
      // Observe late ownership data; Vue disposes this watch on unmount.
      instance.proxy.$watch(() => {
        const monster = props?.monster, native = monster?.t_user_monsters ?? monster, rows = ownedNow();
        return [monster, monster?.user_monster_id, native?.user_monster_id, native?.level, props?.maskSkills, props?.hideHeader,
          monster?._maskSkills, native?._maskSkills, monster?.build_hidden, native?.build_hidden, rows, rows?.length, isTrainingSource(instance)];
      }, () => bindMember(name, props, vnode, owned, translate), { flush: "post" });
    }
    return result;
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
    const reserved = skills.getSkillReserveState?.(member)?.reservedKeys ??
      new Set(member.t_user_monsters?.reserved_skills ?? member.reserved_skills ?? []);
    const savedPermanent = native.permanent_skills ?? monster.permanent_skills;
    const permanent = Array.isArray(savedPermanent) ? savedPermanent : [];
    const label = (key, fallback) => typeof key === "string" && key ? translate(key) || fallback : fallback;
    const describe = (list, type, getMaster) => list.map(entry => ({
      name: label(entry.name_key ?? getMaster(entry.id)?.name_key, entry.id),
      permanent: permanent.some(skill => typeof skill === "string" ? skill === entry.id :
        skill?.id === entry.id && (skill.effect === "passive" ? "passive" : "skill") === type),
      ...(reserved.has(`${type === "passive" ? "p" : "s"}:${entry.id}`) ? { reserved: true } : {})
    }));
    const attack = native.attack_skill ?? master?.attack_skill;
    const art = master?.image_file_name ?? monster.image_file_name;
    const rawGeneration = native.generation_value ?? monster.generation_value;
    const generation = rawGeneration == null ? undefined : Number(rawGeneration);
    const disabled = new Set(id && Object.hasOwn(settings?.disabledSkills ?? {}, id)
      ? settings.getDisabledSkills(id) : native.disabled_skills ?? []);
    const active = skills.getActiveSkills(member, { includeReserved: true }).filter(entry => {
      const stored = native.skill_priorities?.[entry.id] ?? 1;
      const priority = id ? settings?.getPriority?.(id, entry.id, stored) ?? stored : stored;
      return reserved.has("s:" + entry.id) || !disabled.has(entry.id) && priority !== 0;
    });
    const passive = skills.getPassiveSkills(member, { includeReserved: true, includeDisabled: true })
      .filter(entry => reserved.has("p:" + entry.id) || !entry._userDisabled && !entry._disabledBy);
    const effectiveRank = Math.max(1, Math.floor(Number(master?.rank ?? native.rank) || 1)) +
      Math.max(0, Math.floor(Number(native.rank_up ?? monster.rank_up) || 0));
    const uniqueId = [native.meta?.rank6_unique_skill, native.rank6_unique_skill_granted, monster.rank6_unique_skill_granted,
      effectiveRank >= 6 ? (master ?? native).rank6_unique_skill : null]
      .find(value => typeof value === "string" && value.trim())?.trim();
    const uniqueEntry = active.find(entry => entry.id === uniqueId) ?? passive.find(entry => entry.id === uniqueId);
    const uniqueMaster = uniqueEntry && (active.includes(uniqueEntry) ? masters.getActiveSkill(uniqueId) : masters.getPassiveSkill(uniqueId));
    return {
      name: displayName || label(master?.name_key ?? monster.name_key, String(master?.id ?? native.monster_id ?? native.master_id ?? "ホムンクルス")),
      level: Number(native.level ?? monster.level) || 0,
      generation: Number.isFinite(generation) && generation >= 0 ? generation : undefined,
      bonus: bonusParameters(monster, native),
      portrait: typeof art === "string" ? art : "",
      skillStates: true,
      rank6Unique: uniqueEntry ? label(uniqueEntry.name_key ?? uniqueMaster?.name_key, uniqueId) : undefined,
      attack: typeof attack === "string" ? label(masters.getActiveSkill(attack)?.name_key, attack) : "",
      active: describe(active, "skill", masters.getActiveSkill),
      passive: describe(passive, "passive", masters.getPassiveSkill)
    };
  }

  document.addEventListener("hako-af:read-party-share", async event => {
    const anchor = event.target;
    const individual = individuals.get(anchor);
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
      const tools = await getReaders();
      if (!anchor.isConnected || !anchor.getClientRects().length) return;
      const panel = panels.get(anchor);
      if (post && panel?.props.detail?.post !== post) {
        reply("error", "表示中の投稿が切り替わりました。共有する編成を開き直してください。");
        return;
      }
      const selected = individuals.get(anchor);
      if (individual && (individual.monster !== selected?.monster || individual.monster !== selected.props.monster ||
          selected.props.maskSkills || individual.publicTraining &&
          (!showsPublicSkills(selected.props) || !isTrainingSource(selected.instance)))) {
        reply("error", "表示中の個体が切り替わりました。個体詳細を開き直してください。");
        return;
      }
      const party = individual ? [selected.monster] : partyOf(panel);
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
        const settings = panel?.hall || individual?.publicTraining ? null : properties.$pinia?._s?.get("skillSettings");
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
  async function readSimulatorMember(anchor) {
    const selected = simulatorMembers.get(anchor);
    if (!selected || !anchor.isConnected) return null;
    const properties = document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
    const tools = await getReaders();
    const levelStore = properties.$pinia?._s?.get("skillLevelDisplay");
    if (!selected.publicTraining) await levelStore?.ensureAccount?.();
    let trainingFactory;
    if (!selected.publicTraining) try { trainingFactory = await (simulatorTraining ??= readTrainingFactory().catch(error => { simulatorTraining = null;throw error; })); } catch { /* The UI reports omitted training data. */ }
    if (simulatorMembers.get(anchor)?.monster !== selected.monster || selected.props.monster !== selected.monster) return null;
    const run = properties.$nuxt?.runWithContext?.bind(properties.$nuxt) ?? document.getElementById("__nuxt").__vue_app__.runWithContext.bind(document.getElementById("__nuxt").__vue_app__);
    return run(() => {
      const monster = selected.monster, native = monster.t_user_monsters ?? monster;
      const master = native.m_monsters ?? monster.m_monsters ?? native.official_master ?? monster.official_master ?? native.master ?? monster.master;
      const learned = tools.learned(), masters = tools.masters();
      const settings = selected.publicTraining ? null : properties.$pinia?._s?.get("skillSettings");
      const skillsVisible = !selected.publicTraining || showsPublicSkills(selected.props);
      const snapshot = skillsVisible ? monsterSnapshot(monster, learned, masters, settings, properties.$t ?? (key => key)) : {
        name: properties.$t?.(master?.name_key) ?? master?.name ?? native.monster_id,
        generation: Number(native.generation_value ?? monster.generation_value) || 0,
        level: Number(native.level ?? monster.level) || 1, bonus: bonusParameters(monster, native), active: [], passive: [] };
      const active = skillsVisible ? learned.getActiveSkills(monster, { includeReserved: false }) : [];
      const passive = skillsVisible ? learned.getPassiveSkills(monster, { includeReserved: false, includeDisabled: false }) : [];
      const allowed = (entry, kind) => snapshot[kind].some(item => !item.reserved && item.name ===
        (properties.$t?.(entry.name_key ?? (kind === "active" ? masters.getActiveSkill(entry.id) : masters.getPassiveSkill(entry.id))?.name_key) ?? entry.id));
      const usedActive = active.filter(entry => allowed(entry, "active")), usedPassive = passive.filter(entry => allowed(entry, "passive"));
      const refs = [...usedActive.map(entry => "s." + entry.id), ...usedPassive.map(entry => "p." + entry.id)];
      const skillLevels = {}, skillDefinitions = {};
      const publicLevels = monster._skillLevels ?? native._skillLevels;
      const levels = selected.publicTraining ? (publicLevels ? levelStore?.displayFor?.(publicLevels) : null) : levelStore?.account;
      for (const ref of refs) {
        const key = (ref[0] === "p" ? "passive:" : "skill:") + ref.slice(2);
        const level = Number(levels?.levels?.[key] ?? publicLevels?.[key]) || 1;
        skillLevels[ref] = level;
        const definition = levels?.definitions?.[key];
        if (level > 1 && definition) skillDefinitions[ref] = definition;
      }
      const deployed = selected.publicTraining ? null : selected.props.trainingBonus ?? monster._trainingBonus ?? trainingFactory?.().deployBonus?.value;
      const training = deployed ? { params: deployed.params ?? {}, raceParams: deployed.raceParams ?? {}, source: deployed.source } : null;
      const rows = selected.publicTraining ? [] : properties.$pinia?._s?.get("userItems")?.allArtifacts ?? [];
      const detail = selected.instance.subTree?.el?.nodeType === 1 ? selected.instance.subTree.el : anchor.parentElement;
      const text = detail?.textContent ?? "", observed = {};
      for (const [key, label] of Object.entries({ hp: "体力", atk: "物攻", mtk: "魔攻", def: "物防", mdf: "魔防", spd: "速度", lck: "運" })) {
        const found = text.match(new RegExp(label + "\\s*([\\d,]+)"));
        if (found) observed[key] = Number(found[1].replaceAll(",", ""));
      }
      const loadout = mode => rows.filter(item => mode === "boss" ? item._artifact?.is_equipped_boss : mode === "pvp" ? item._artifact?.is_equipped_rating :
        (item._artifact?.is_equipped_normal ?? item._artifact?.is_equipped)).slice(0, 5).map(item => ({
          level: item._artifact.level, params: item._artifact.params ?? {}, traits: item._artifact.traits ?? [],
          passive: item.m_items?.artifact_passive ?? item.artifact_passive }));
      return { format: "hako-stat-v1", exportedAt: new Date().toISOString(),
        species: native.monster_id ?? native.master_id ?? master?.id, name: snapshot.name, level: snapshot.level,
        rank: Math.max(1, Number(master?.rank ?? native.rank) || 1) + Math.max(0, Number(native.rank_up ?? monster.rank_up) || 0),
        generation: snapshot.generation ?? 0, bonus: snapshot.bonus ?? {}, observed,
        public: selected.publicTraining, skillsUnavailable: !skillsVisible,
        skills: refs, skillLevels, skillDefinitions, training, trainingLoaded: !!trainingFactory || !!deployed,
        rank6Enabled: !master?.rank6_unique_skill || [...usedActive, ...usedPassive].some(entry => entry.id === master.rank6_unique_skill),
        loadouts: { normal: loadout("normal"), boss: loadout("boss"), pvp: loadout("pvp") },
        afsLoaded: !selected.publicTraining && (!!properties.$pinia?._s?.get("userItems")?.isEquippedArtifactsLoaded || !!properties.$pinia?._s?.get("userItems")?.isArtifactsLoaded) };
    });
  }
  globalThis.hakoAfPartyShareMain = { bind, bindMember, bindHall, getReaders, getEffectReaders, readSimulatorMember };
})();
