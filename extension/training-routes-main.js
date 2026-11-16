(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const names = globalThis.hakoAfFeatureNames;
  const matingComponents = new Set(["FlexMatingInherit", "MatingNewUiPanel"]);
  const grantComponents = new Set(["FlexTrainingSkillGrant", "FlexTrainingSkillGrantFlow"]);
  const grantLists = new Set(["fx-tgrant__rows", "fx-tgflow__rows"]);
  const matingChoices = new WeakMap();
  const grantBindings = new WeakMap();
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
        name: route.name, skills: new Set([...route.ordinary, ...route.permanent].map(nameKey)),
        permanent: new Set(route.permanent.map(nameKey))
      }]));
      const nextTargets = new Map(data.bindings.map(binding => [binding.monsterId, binding]));
      routes = nextRoutes;
      targets = nextTargets;
      savedSkills = new Set([...routes.values()].flatMap(route => [...route.skills]));
    } catch { /* Ignore malformed snapshots. */ }
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

  function matingSkills(anchor) {
    let control = anchor.querySelector(':scope > [data-ha4="training-active-route"]');
    if (!routes.size) {
      control?.remove();
      matingChoices.delete(anchor);
      return savedSkills;
    }
    const choice = matingChoices.get(anchor);
    const selected = routes.has(choice) ? choice : "";
    const skills = routes.get(selected)?.skills ?? savedSkills;
    const signature = JSON.stringify([selected, [...routes].map(([id, item]) => [id, item.name])]);
    if (control?.dataset.routeSignature === signature) return skills;
    control?.remove();
    control = document.createElement("label");
    control.dataset.ha4 = "training-active-route";
    control.dataset.routeSignature = signature;
    control.textContent = "継承候補の強調";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "継承候補の強調");
    select.replaceChildren(new Option("保存したすべての育成ルート", ""), ...[...routes].map(([id, item]) => new Option(item.name, id)));
    select.value = selected;
    select.addEventListener("change", () => {
      matingChoices.set(anchor, select.value);
      document.dispatchEvent(new Event("hako-af:grid-rendered"));
    });
    control.append(select);
    anchor.prepend(control);
    return skills;
  }

  function mark(rows, next, inheritance = false) {
    for (const row of rows) {
      const needed = next.has(row);
      row.toggleAttribute("data-ha4-training-needed", needed);
      if (inheritance) row.toggleAttribute("data-ha4-training-inherit", needed);
    }
  }

  function mating(instance, props, root) {
    const rows = [...root.querySelectorAll(".fx-mati__row,[data-inherit-row]")].filter(row => row.getClientRects().length);
    const skills = rows.length ? matingSkills(root) : null;
    const needed = new Set();
    if (skills?.size) {
      const { ctx } = props;
      const pool = new Map((ctx?.inheritSelectablePool ?? []).map(item => [item.key, item]));
      const candidates = new Set(rows);
      for (const vnode of walk(instance.subTree)) {
        const el = element(vnode);
        if (!candidates.has(el)) continue;
        const entry = pool.get(vnode.key);
        if (entry?.hidden) continue;
        const label = (entry && ctx.formatInheritEntryLabel?.(entry)) ||
          el.querySelector('[role="checkbox"][aria-label]')?.getAttribute("aria-label") ||
          el.querySelector(".fx-mati__name")?.textContent;
        if (skills.has(nameKey(label))) needed.add(el);
      }
    }
    if (!rows.length) root.querySelector(':scope > [data-ha4="training-active-route"]')?.remove();
    mark(rows, needed, true);
  }

  function legacyMating(instance) {
    const nodes = [...walk(instance.subTree)];
    const heading = nodes.find(vnode => vnode.type === "h3" && vnode.children === "継承するスキル / パッシブを選択");
    const anchor = heading && element(heading)?.parentElement;
    if (!anchor) return;
    const rows = nodes.filter(vnode => vnode.type === "div" && typeof vnode.key === "string" &&
      element(vnode)?.matches(".bg-background.border.rounded.transition-colors.overflow-hidden"));
    const skills = rows.length ? matingSkills(anchor) : savedSkills;
    const needed = new Set();
    const markers = rows.map(element);
    for (const marker of markers) {
      const label = marker.querySelector("span.font-bold.break-words");
      if (skills.has(nameKey(label?.textContent))) needed.add(marker);
    }
    mark(markers, needed, true);
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
    if (name === "BaseModal") {
      if (props?.modelValue && instance?.parent?.type?.__name === "mating") legacyMating(instance);
      return;
    }
    if (!instance || !root?.getClientRects().length) return;
    if (!routes.size && !grantBindings.has(instance) && !root.querySelector('[data-ha4="training-active-route"]')) return;
    if (!root.hasAttribute("data-ha4-training-scope")) root.setAttribute("data-ha4-training-scope", "");
    if (matingComponents.has(name)) mating(instance, props, root);
    else if (grantComponents.has(name)) grant(instance, root, translate, dependencies, readThrough);
  }

  globalThis.hakoAfTrainingRoutesMain = { read, accepts: name => matingComponents.has(name) || grantComponents.has(name) || name === "BaseModal" };
})();
