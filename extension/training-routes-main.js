(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const names = globalThis.hakoAfFeatureNames;
  const getReaders = globalThis.hakoAfPartyShareMain?.getReaders;
  const trainingSources = globalThis.hakoAfTrainingSources;
  const matingComponents = new Set(["FlexMatingInherit", "MatingNewUiPanel"]);
  const grantComponents = new Set(["FlexTrainingSkillGrant", "FlexTrainingSkillGrantFlow"]);
  const grantLists = new Set(["fx-tgrant__rows", "fx-tgflow__rows"]);
  const bothParentRoutes = "__parents__";
  const matingChoices = new WeakMap();
  const grantBindings = new WeakMap();
  const progressBindings = new WeakMap();
  let routes = new Map();
  let targets = new Map();
  let savedSkills = new Set();

  const nameKey = value => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  const componentName = vnode => (vnode.component?.type ?? vnode.type)?.__name;
  const monsterId = monster => monster?.user_monster_id ?? monster?.t_user_monsters?.user_monster_id;
  const element = vnode => {
    const el = vnode.el ?? vnode.component?.subTree?.el;
    return el?.nodeType === 1 && el.isConnected ? el : null;
  };

  function* walk(root) {
    const todo = [root];
    while (todo.length) {
      const vnode = todo.pop();
      if (!vnode || typeof vnode !== "object") continue;
      yield vnode;
      if (vnode.suspense?.activeBranch) {
        todo.push(vnode.suspense.activeBranch);
      } else if (Array.isArray(vnode.children)) {
        for (let i = vnode.children.length - 1; i >= 0; i--) todo.push(vnode.children[i]);
      }
    }
  }

  document.addEventListener("hako-af:training-routes", event => {
    if (typeof event.detail !== "string") return;
    try {
      const data = JSON.parse(event.detail);
      const nextRoutes = new Map(data.routes.map(route => [route.id, {
        name: route.name, ordinaryNames: route.ordinary, permanentNames: route.permanent,
        skills: new Set([...route.ordinary, ...route.permanent].map(nameKey)),
        permanent: new Set(route.permanent.map(nameKey))
      }]));
      const nextTargets = new Map(data.bindings.map(binding => [binding.monsterId, binding]));
      routes = nextRoutes;
      targets = nextTargets;
      savedSkills = new Set([...routes.values()].flatMap(route => [...route.skills]));
    } catch { /* Ignore malformed snapshots. */ }
  });

  document.addEventListener("hako-af:read-training-unique", async event => {
    const source = event.target;
    let name = "";
    try {
      const member = JSON.parse(event.detail);
      const properties = document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
      const buildId = properties?.$config?.public?.buildId ?? properties?.$nuxt?.$config?.public?.buildId ??
        globalThis.__NUXT__?.config?.public?.buildId;
      const data = await trainingSources?.readMasters(buildId);
      name = trainingSources?.rank6UniqueName(data, member, key => properties?.$t?.(key) ?? key) ?? "";
    } catch { /* The editor can still open if the official data is unavailable. */ }
    source.dispatchEvent(new CustomEvent("hako-af:training-unique", { detail: name }));
  });

  function grantRoute(anchor, recipient) {
    if (!anchor) return null;
    const binding = targets.get(String(recipient));
    const route = binding && routes.get(binding.routeId);
    let label = anchor.querySelector(':scope > [data-ha4="training-active-route"]');
    if (!route) {
      label?.remove();
      return null;
    }
    if (!label) {
      label = document.createElement("span");
      label.dataset.ha4 = "training-active-route";
      anchor.prepend(label);
    }
    const caption = `${names.trainingRoutes}　${route.name}`;
    if (label.textContent !== caption) label.textContent = caption;
    return route;
  }

  function matingSkills(anchor, parentIds, panel = anchor) {
    let control = anchor.querySelector(':scope > [data-ha4="training-active-route"]');
    if (!routes.size) {
      control?.remove();
      matingChoices.delete(panel);
      return { skills: savedSkills, specific: false };
    }
    const parents = [...new Set((parentIds ?? []).filter(id => id != null && id !== "").map(String))].sort();
    const parentRoutes = [...new Set(parents.map(id => targets.get(id)?.routeId).filter(id => routes.has(id)))];
    const parentSignature = JSON.stringify(parents);
    const previous = matingChoices.get(panel);
    const combined = parentRoutes.length > 1;
    const fallback = combined ? bothParentRoutes : parentRoutes[0] ?? (routes.size === 1 ? routes.keys().next().value : "");
    const choice = previous?.parents === parentSignature ? previous.choice : undefined;
    const selected = choice === "" || routes.has(choice) || (combined && choice === bothParentRoutes) ? choice : fallback;
    const route = routes.get(selected);
    const skills = selected === bothParentRoutes
      ? new Set(parentRoutes.flatMap(id => [...routes.get(id).skills])) : route?.skills ?? savedSkills;
    const scope = { skills, specific: !!route };
    const signature = JSON.stringify([parentSignature, selected, combined, [...routes].map(([id, item]) => [id, item.name])]);
    if (control?.dataset.routeSignature === signature) return scope;
    control?.remove();
    control = document.createElement("label");
    control.dataset.ha4 = "training-active-route";
    control.dataset.routeSignature = signature;
    control.textContent = "継承候補の強調";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "継承候補の強調");
    select.replaceChildren(new Option("保存した全ルート（選ぶ候補のみ）", ""));
    if (combined) select.add(new Option("両親の育成ルート（選ぶ候補のみ）", bothParentRoutes));
    for (const [id, item] of routes) select.add(new Option(item.name, id));
    select.value = selected;
    select.addEventListener("change", () => {
      matingChoices.set(panel, { parents: parentSignature, choice: select.value });
      document.dispatchEvent(new Event("hako-af:grid-rendered"));
    });
    control.append(select);
    if (!route) control.append("外す候補を出すには育成ルートを1つ選んでください。");
    anchor.prepend(control);
    return scope;
  }

  function mark(rows, next) {
    for (const row of rows) {
      const needed = next.has(row);
      row.toggleAttribute("data-ha4-training-needed", needed);
    }
  }

  function advise(row, name, label, scope, state) {
    const visible = !!label && !/^[？?]/.test(label);
    const desired = visible && scope?.skills.has(nameKey(label));
    // A single selected route is the only basis for suggesting removals.
    const outside = visible && scope?.specific && !desired;
    const caption = desired ? (state.auto ? (state.forgot ? "覚えるに戻す" : "残す")
      : state.selected ? "選択済み" : state.blocked ? "選ぶ候補・枠を確認" : "選ぶ") :
      outside ? (state.auto ? (state.forgettable && !state.forgot ? "覚えない候補" : "")
        : state.selected ? "選択を外す候補" : "") : "";
    row.toggleAttribute("data-ha4-training-needed", !!desired);
    row.toggleAttribute("data-ha4-training-inherit", !!desired);
    row.toggleAttribute("data-ha4-training-remove", !!caption && outside);
    let badge = row.querySelector('[data-ha4="training-guidance"]');
    if (!caption) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.ha4 = "training-guidance";
      if (name) name.after(badge);
      else row.append(badge);
    }
    if (badge.textContent !== caption) badge.textContent = caption;
  }

  function mating(instance, props, root) {
    const rows = [...root.querySelectorAll(".fx-mati__row,[data-inherit-row]")].filter(row => row.getClientRects().length);
    const { ctx } = props;
    const anchor = root.matches(".fx-mati") ? root : rows[0]?.parentElement;
    const parentIds = ctx?.matingSlots?.map(monster => monsterId(monster) ?? monster?.id);
    const scope = anchor && rows.length ? matingSkills(anchor, parentIds, root) : null;
    if (!scope) {
      root.querySelector('[data-ha4="training-active-route"]')?.remove();
      return;
    }
    const pool = new Map((ctx?.inheritSelectablePool ?? []).map(item => [item.key, item]));
    const automatic = new Map((ctx?.autoGrantedSkillPassive ?? []).map(item => [item.key, item]));
    const candidates = new Set(rows);
    for (const vnode of walk(instance.subTree)) {
      const row = element(vnode);
      if (!candidates.has(row)) continue;
      const key = typeof vnode.key === "string" ? vnode.key.replace(/^auto-/, "") : vnode.key;
      const auto = !!automatic.get(key) && (!pool.has(key) || key !== vnode.key);
      const entry = (auto ? automatic : pool).get(key);
      const checkbox = row.querySelector('[role="checkbox"]');
      const name = row.querySelector(".fx-mati__name,span.font-bold.leading-tight");
      const label = entry?.hidden ? "" : (entry && ctx.formatInheritEntryLabel?.(entry)) ||
        checkbox?.getAttribute("aria-label") || name?.textContent || row.firstChild?.textContent;
      advise(row, name, label, scope, {
        auto, forgot: auto && ctx.selectedForgetKeys?.has(key),
        forgettable: auto && ctx.forgettableKeySet?.has(key),
        selected: ctx?.selectedInheritKeys?.has(key) || checkbox?.getAttribute("aria-checked") === "true",
        blocked: row.dataset.state === "disabled" || checkbox?.getAttribute("aria-disabled") === "true"
      });
    }
  }

  function readMonster(target, app, profile) {
    const { id, anchor, record, monster } = target ?? {};
    const assigned = targets.get(id);
    const route = assigned && routes.get(assigned.routeId);
    if (!route || !anchor.getClientRects().length) return;
    const native = monster.t_user_monsters ?? monster;
    const storedPermanent = record.permanent_skills ?? native.permanent_skills;
    const permanent = Array.isArray(storedPermanent) ? storedPermanent : [];
    const signature = JSON.stringify([id, assigned.routeId, route.ordinaryNames, route.permanentNames, record.level ?? native.level,
      record.monster_id ?? native.monster_id, record.rank_up ?? native.rank_up, permanent,
      record.inherited_traits ?? native.inherited_traits, record.excluded_skill_ids ?? native.excluded_skill_ids,
      record.forgotten_skills ?? native.forgotten_skills, record.forgotten_passives ?? native.forgotten_passives]);
    const previous = progressBindings.get(anchor);
    if (previous?.signature === signature && Date.now() - previous.at < (previous.ready ? 60_000 : 4000)) return;
    const state = { signature, at: Date.now() };
    progressBindings.set(anchor, state);
    const send = value => {
      if (!anchor.isConnected || progressBindings.get(anchor) !== state || targets.get(id)?.routeId !== assigned.routeId) return;
      anchor.dispatchEvent(new CustomEvent("hako-af:training-progress", { bubbles: true,
        detail: JSON.stringify({ id, routeId: assigned.routeId, ...value }) }));
    };
    const properties = app?.config?.globalProperties;
    const buildId = properties?.$config?.public?.buildId ?? properties?.$nuxt?.$config?.public?.buildId;
    if (!getReaders || !properties) return;
    void Promise.all([getReaders(), trainingSources?.readMasters(buildId)]).then(([readers, data]) => {
      const run = properties.$nuxt?.runWithContext?.bind(properties.$nuxt) ?? app.runWithContext.bind(app);
      const translate = key => properties.$t?.(key) ?? key;
      const result = run(() => {
        const masters = readers.masters();
        if (masters.isLoaded?.value !== true) return null;
        const skills = readers.learned();
        const member = { ...native, ...record, m_monsters: record.m_monsters ?? native.m_monsters ?? monster.m_monsters };
        const title = (entry, kind) => {
          const key = entry?.name_key ?? (kind === "passive" ? masters.getPassiveSkill(entry?.id) : masters.getActiveSkill(entry?.id))?.name_key;
          return nameKey(key ? translate(key) : entry?.id);
        };
        const knownPermanent = new Set(permanent.filter(Boolean).map(entry => {
          if (typeof entry !== "string") return title(entry, entry.effect === "passive" ? "passive" : "skill");
          return title({ id: entry }, masters.getActiveSkill(entry) ? "skill" : "passive");
        }).filter(Boolean));
        const known = new Set([
          ...knownPermanent,
          ...skills.getActiveSkills(member, { includeReserved: true }).map(entry => title(entry, "skill")),
          ...skills.getPassiveSkills(member, { includeReserved: true, includeDisabled: true }).map(entry => title(entry, "passive"))
        ]);
        const normal = route.ordinaryNames.filter(name => !known.has(nameKey(name)));
        const missingPermanent = route.permanentNames.filter(name => !knownPermanent.has(nameKey(name)));
        const index = trainingSources?.sourceIndex(data, [...normal, ...missingPermanent], profile, translate, nameKey);
        const describe = name => ({ name, sources: index?.get(nameKey(name)) ?? [] });
        return { ordinary: normal.map(describe), permanent: missingPermanent.map(name => ({
          ...describe(name), learned: known.has(nameKey(name))
        })), sourcesLoaded: !!data?.monsters && !!data?.items };
      });
      state.ready = !!result;
      send(result ?? { unavailable: true });
    }).catch(() => send({ unavailable: true }));
  }

  function legacyMating(parentIds) {
    const heading = [...document.querySelectorAll('[role="dialog"] h3,[data-base-modal-root] h3')]
      .find(el => el.textContent.trim() === "継承するスキル / パッシブを選択" && el.getClientRects().length);
    const modal = heading?.closest('[role="dialog"],[data-base-modal-root]');
    if (!modal) return;
    const rows = modal.querySelectorAll(".bg-background.border.rounded.transition-colors.overflow-hidden,[class~='bg-emerald-950/30'].border.rounded.overflow-hidden");
    if (!rows.length) return;
    if (!modal.hasAttribute("data-ha4-training-scope")) modal.setAttribute("data-ha4-training-scope", "");
    const body = rows[0].closest(".p-3.flex.flex-col.h-full") ?? heading.closest("header")?.nextElementSibling ?? modal;
    const scope = matingSkills(body, parentIds);
    for (const row of rows) {
      const auto = row.classList.contains("bg-emerald-950/30");
      const name = row.querySelector("span.font-bold.break-words");
      const forget = auto && [...row.querySelectorAll("input[type=checkbox]")]
        .find(input => input.closest("label")?.textContent.trim() === "覚えない");
      advise(row, name, name?.textContent, scope, {
        auto, forgot: forget?.checked, forgettable: !!forget,
        selected: row.classList.contains("border-secondary") || row.querySelector('[aria-checked="true"]'),
        blocked: row.classList.contains("opacity-60")
      });
    }
  }

  for (const type of ["click", "change", "keydown"]) {
    document.addEventListener(type, event => {
      if (type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.target instanceof Element && event.target.closest("[data-ha4-training-scope]")) {
        document.dispatchEvent(new Event("hako-af:grid-rendered"));
      }
    }, true);
  }

  function prioritize(instance, items, matches, signature, onPrioritize, dependencies, readThrough) {
    let state = grantBindings.get(instance);
    if (!state && matches && Array.isArray(items)) {
      // Both standard layouts derive the page from the same full computed list.
      // Project that list before the slice and the virtualizer consume it.
      const ref = dependencies(instance.effect).find(source => source._value === items);
      if (!ref?.dep?.trigger) return;
      state = { ref };
      if (!readThrough(ref, native => {
        if (!state.matches || !Array.isArray(native)) return native;
        if (state.native !== native) {
          const needed = [], rest = [];
          for (const row of native) (state.matches(row) ? needed : rest).push(row);
          state.native = native;
          state.projected = needed.length ? needed.concat(rest) : native;
        }
        return state.projected;
      })) return;
      grantBindings.set(instance, state);
    }
    if (!state || state.signature === signature) return;
    state.signature = signature;
    state.matches = matches;
    state.native = null;
    state.ref.dep.trigger();
    if (matches && items?.some(matches)) onPrioritize();
  }

  function grant(instance, root, translate, dependencies, readThrough) {
    let list, picker, pager;
    for (const vnode of walk(instance.subTree)) {
      const name = componentName(vnode);
      const props = vnode.component?.props ?? vnode.props;
      if (name === "FlexVirtualList" && grantLists.has(props?.listClass)) list = props;
      if (name === "FlexMonsterList") picker = props;
      if (list && name === "FlexPager" && element(vnode)?.closest('.fx-tgflow__pane--skills,.fx-tgrant__browser')) {
        pager = vnode;
      }
    }
    const id = picker?.currentId ?? picker?.["current-id"];
    const recipient = id == null || !Array.isArray(picker?.monsters) ? null :
      picker.monsters.find(monster => String(monsterId(monster)) === String(id));
    const controls = root.querySelector(".fx-tgrant__controls,.fx-tgflow__controls");
    const route = grantRoute(controls?.parentElement, monsterId(recipient));
    const permanent = recipient?.permanent_skills;
    const acquired = new Set(Array.isArray(permanent) ? permanent.filter(Boolean).map(skill =>
      typeof skill === "string" ? skill : `${skill.effect === "passive" ? "passive" : "active"}:${skill.id}`) : []);
    const matches = route?.permanent.size ? row => {
      const skill = row?.skill;
      if (!skill || acquired.has(row.key) || acquired.has(skill.id)) return false;
      return route.permanent.has(nameKey(skill.name_key ? translate(skill.name_key) : skill.name ?? skill.id));
    } : null;
    const signature = matches ? JSON.stringify([id, [...route.permanent], [...acquired]]) : null;
    prioritize(instance, list?.items, matches, signature, () => {
      if (pager?.props?.page > 1) pager.props.onChange?.(1);
    }, dependencies, readThrough);

    const visible = root.querySelectorAll(".fx-tgrant__rows > li,.fx-tgflow__rows > li");
    const names = matches && new Set(list?.items.filter(matches).map(row =>
      nameKey(row.skill.name_key ? translate(row.skill.name_key) : row.skill.name ?? row.skill.id)));
    const needed = new Set();
    for (const el of visible) {
      const label = el.querySelector(".fx-tgrant__row-name,.fx-tgflow__skill-name");
      const text = label && [...label.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join("");
      if (names?.has(nameKey(text)) && !el.querySelector(".fx-tgrant__granted,.fx-tgflow__granted")) needed.add(el);
    }
    mark(visible, needed);
  }

  function read(name, instance, props, root, translate, dependencies, readThrough) {
    if (!instance || !root?.getClientRects().length) return;
    if (!routes.size && !grantBindings.has(instance) && !root.querySelector('[data-ha4="training-active-route"]')) return;
    if (!root.hasAttribute("data-ha4-training-scope")) root.setAttribute("data-ha4-training-scope", "");
    if (matingComponents.has(name)) mating(instance, props, root);
    else if (grantComponents.has(name)) grant(instance, root, translate, dependencies, readThrough);
  }

  globalThis.hakoAfTrainingRoutesMain = { read, readMonster, legacyMating, accepts: name => matingComponents.has(name) || grantComponents.has(name) };
})();
