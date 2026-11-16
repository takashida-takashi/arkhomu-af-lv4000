(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const names = globalThis.hakoAfFeatureNames;
  const getReaders = globalThis.hakoAfPartyShareMain?.getReaders;
  const trainingSources = globalThis.hakoAfTrainingSources;
  const matingComponents = new Set(["FlexMatingInherit", "MatingNewUiPanel"]);
  const grantComponents = new Set(["TrainingSkillGrantPanel", "FlexTrainingSkillGrant", "FlexTrainingSkillGrantFlow"]);
  const grantLists = new Set(["fx-tgrant__rows", "fx-tgflow__rows"]);
  const bothParentRoutes = "__parents__";
  const matingChoices = new WeakMap();
  const bulkChoices = new WeakMap();
  const legacyAutoKeys = new WeakMap();
  const bulkKey = "ha4-training-mating-bulk";
  const grantBindings = new WeakMap();
  const progressBindings = new WeakMap();
  let routes = new Map();
  let targets = new Map();
  let savedSkills = new Set();
  let enabled = false;
  let mothers = new Set();
  let legacyParents = [];
  let flexCandidate;
  let quickAttempt;
  let previousRows;
  let protectedRows = new Map();

  const nameKey = value => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  const componentName = vnode => (vnode.component?.type ?? vnode.type)?.__name;
  const monsterId = monster => monster?.user_monster_id ?? monster?.t_user_monsters?.user_monster_id;
  const element = vnode => {
    const el = vnode.el ?? vnode.component?.subTree?.el;
    return el?.nodeType === 1 && el.isConnected ? el : null;
  };

  function* walk(root, components = false) {
    const todo = [root];
    while (todo.length) {
      const vnode = todo.pop();
      if (!vnode || typeof vnode !== "object") continue;
      yield vnode;
      if (components && vnode.component?.subTree) {
        todo.push(vnode.component.subTree);
      } else if (vnode.suspense?.activeBranch) {
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
      enabled = data.enabled === true;
      mothers = new Set(Array.isArray(data.mothers) ? data.mothers : []);
      savedSkills = new Set([...routes.values()].flatMap(route => [...route.skills]));
    } catch { /* Ignore malformed snapshots. */ }
  });

  function ownedRecords() {
    const properties = document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
    const rows = properties?.$pinia?._s?.get("userMonsters")?.monsters;
    return { rows: Array.isArray(rows) ? rows : [], translate: properties?.$t };
  }

  function rememberOwned() {
    if (!enabled) return;
    const { rows } = ownedRecords();
    if (previousRows === rows) return;
    previousRows = rows;
    // The game temporarily removes the selected parents from its store before sending a mating request.
    for (const record of rows) {
      const id = parentId(record);
      if (id == null) continue;
      if (generation(record) >= 1000) protectedRows.set(String(id), record);
      else protectedRows.delete(String(id));
    }
  }

  function parentId(record) {
    return monsterId(record) ?? record?.id;
  }

  function generation(record) {
    const value = record?.t_user_monsters?.generation_value ?? record?.generation_value;
    return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  }

  function recordsFor(ids, rows) {
    const wanted = new Set(ids);
    return new Map(rows.filter(record => wanted.has(String(parentId(record)))).map(record => [String(parentId(record)), record]));
  }

  document.addEventListener("hako-af:guard-monster-operation", event => {
    if (!enabled) return;
    let operation, ids;
    try { [operation, ids] = JSON.parse(event.detail); } catch { return; }
    if (!Array.isArray(ids)) return;
    const { rows, translate } = ownedRecords();
    const records = recordsFor(ids, rows);
    for (const id of ids) if (!records.has(id) && protectedRows.has(id)) records.set(id, protectedRows.get(id));
    const normalMating = operation === "合成";
    const twoMothers = normalMating && ids.filter(id => mothers.has(id)).length >= 2;
    const protectedIds = ids.filter(id => mothers.has(id) ? !normalMating || twoMothers : generation(records.get(id)) >= 1000);
    if (!protectedIds.length) return;
    const details = protectedIds.map(id => {
      const raw = records.get(id);
      const record = raw?.t_user_monsters ?? raw;
      const key = record?.m_monsters?.name_key ?? record?.name_key;
      const title = record?.nickname || (key && translate?.(key)) || "対象のホムンクルス";
      const value = generation(raw);
      return title + (value == null ? "" : "（世代 " + value.toLocaleString("ja-JP") + "）") +
        (mothers.has(id) ? "［世代上げ母体］" : "");
    });
    if (!window.confirm("拡張育成ルート　" + operation + "の警告\n\n" +
        (twoMothers ? "世代上げ母体が2体選ばれています。通常は母体1体と素材1体を選びます。\n\n" : "") +
        details.join("\n") + "\n\nこの個体を消費します。続けますか？")) event.preventDefault();
  });

  document.addEventListener("hako-af:mating-completed", event => {
    try { for (const id of JSON.parse(event.detail).parents ?? []) protectedRows.delete(id); } catch { /* Ignore malformed results. */ }
  });

  const clickedButton = event => event.target instanceof Element ? event.target.closest("button") : null;
  const visibleButton = button => button?.isConnected && !button.matches(':disabled,[aria-disabled="true"]') && !!button.getClientRects().length;
  const buttonText = button => button?.textContent.trim();
  const dialogSelector = '[role="dialog"],[role="alertdialog"],[data-base-modal-root]';
  // The game's BaseModal blocks clicks for the first 350 ms, including programmatic ones.
  const modalReadyDelay = 360;
  const dialogHeading = (dialog, heading) => [...dialog.querySelectorAll("h2,h3,[role=heading]")]
    .some(title => heading.test(title.textContent.trim()) && title.getClientRects().length);

  function topGameModal() {
    let top;
    for (const modal of document.querySelectorAll("[data-base-modal-root]")) {
      if (modal.getClientRects().length && (!top || Number(modal.dataset.baseModalZ || 100) >= Number(top.dataset.baseModalZ || 100))) {
        top = modal;
      }
    }
    return top;
  }

  function findDialogButton(root, label, heading) {
    const dialogs = root?.matches(dialogSelector) ? [root, ...root.querySelectorAll(dialogSelector)] :
      document.querySelectorAll(dialogSelector);
    for (const dialog of dialogs) {
      if (!dialogHeading(dialog, heading)) continue;
      const button = [...dialog.querySelectorAll("button")].find(button =>
        button.closest(dialogSelector) === dialog && buttonText(button) === label && visibleButton(button));
      if (button) return button;
    }
  }

  function stopQuick() {
    const attempt = quickAttempt;
    quickAttempt = null;
    clearInterval(attempt?.timer);
  }

  function quickStep(attempt) {
    if (quickAttempt !== attempt) return;
    const parents = attempt.flow ? attempt.ctx.matingSlots?.map(parentId) : legacyParents;
    if (!enabled || performance.now() >= attempt.deadline || location.pathname !== attempt.path ||
        JSON.stringify(parents?.map(String)) !== attempt.parents) {
      stopQuick();
      return;
    }
    const modal = topGameModal();
    if (modal !== attempt.modal) {
      attempt.modal = modal;
      attempt.modalOpenedAt = performance.now();
    }
    if (modal && performance.now() - attempt.modalOpenedAt < modalReadyDelay) return;
    const trim = findDialogButton(modal, "次へ（継承選択）", /^永久化スキルを選別$/);
    const unused = findDialogButton(modal, "このまま進む", /^(継承枠が余っています|継承スキルが引き継がれません)$/);
    const next = attempt.flow ? document.querySelector(".fx-matflow__next") :
      findDialogButton(modal, "内容を確認 →", /^継承するスキル \/ パッシブを選択$/);
    const finish = attempt.flow ? buttonText(next) === "継承合成する" && next :
      findDialogButton(modal, "この内容で合成する", /^合成内容の最終確認$/);
    const advance = attempt.flow && buttonText(next) !== "確認へ →" ? null : next;
    const button = [trim, unused, finish, advance].find(item =>
      visibleButton(item) && (!modal || modal.contains(item)) && !attempt.steps.has(buttonText(item)));
    if (button) {
      attempt.steps.add(buttonText(button));
      // The Flex flow can show its unused-slot dialog after the final click. Continue only that native dialog.
      if (button === finish && !attempt.flow || button === unused && attempt.finalClicked) stopQuick();
      if (button === finish) attempt.finalClicked = true;
      button.click();
    }
  }

  document.addEventListener("click", event => {
    if (!event.isTrusted || !enabled) return;
    stopQuick();
    if (!mothers.size || !/^\/(?:f\/)?mating(?:\/|$)/.test(location.pathname)) return;
    const button = clickedButton(event);
    const classic = buttonText(button) === "このホムンクルスを継承生成する";
    const flex = button?.matches(".fx-matflow__pick") && flexCandidate?.flow.detailCandidate?.is_inheritance;
    if (!(classic || flex) || !visibleButton(button)) return;
    const parents = (flex ? flexCandidate.ctx.matingSlots?.map(parentId) : legacyParents)?.map(String);
    if (parents?.length !== 2 || parents.filter(id => mothers.has(id)).length !== 1) return;
    const { rows } = ownedRecords();
    const records = recordsFor(parents, rows);
    const material = parents.find(id => !mothers.has(id));
    const materialGeneration = generation(records.get(material));
    if (materialGeneration == null || materialGeneration >= 1000) return;
    const attempt = { ...(flex ? flexCandidate : {}), path: location.pathname, parents: JSON.stringify(parents),
      steps: new Set(), deadline: performance.now() + 10000 };
    attempt.timer = setInterval(() => quickStep(attempt), 60);
    quickAttempt = attempt;
  }, true);
  document.addEventListener("keydown", event => { if (event.isTrusted && event.key === "Escape") stopQuick(); }, true);

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
    const scope = { skills, specific: !!route, bulk: parentRoutes.includes(selected), parentSignature, selected };
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

  function runBulk(anchor, panel, scope, candidate, apply, delay = 0) {
    const control = anchor.querySelector(':scope > [data-ha4="training-active-route"]');
    let label = anchor.querySelector(':scope > [data-ha4="training-bulk"]');
    if (!scope?.bulk || !control) {
      label?.remove();
      bulkChoices.delete(panel);
      return;
    }
    const signature = JSON.stringify([scope.parentSignature, candidate, scope.selected, [...scope.skills]]);
    let state = bulkChoices.get(panel);
    if (state?.signature !== signature) bulkChoices.set(panel, state = { signature });
    if (!label) {
      label = document.createElement("label");
      label.dataset.ha4 = "training-bulk";
      const input = document.createElement("input");
      input.type = "checkbox";
      try { input.checked = localStorage.getItem(bulkKey) !== "off"; } catch { input.checked = true; }
      label.append(input, " 育成ルートの「覚える・覚えない」を一括選択");
      input.addEventListener("change", () => {
        try { localStorage.setItem(bulkKey, input.checked ? "on" : "off"); } catch { /* Keep the page preference. */ }
        if (input.checked) bulkChoices.delete(panel);
        document.dispatchEvent(new Event("hako-af:grid-rendered"));
      });
      control.after(label);
    }
    const input = label.firstElementChild;
    if (!input.checked || state.scheduled || state.applied) return;
    state.scheduled = true;
    const applyWhenReady = () => {
      state.scheduled = false;
      const active = () => input.isConnected && input.checked && bulkChoices.get(panel) === state && !!panel.getClientRects().length;
      if (!active()) return;
      state.applied = true;
      void apply(active);
    };
    if (delay) setTimeout(applyWhenReady, delay);
    else requestAnimationFrame(() => requestAnimationFrame(applyWhenReady));
  }

  const visibleSkill = label => !!label && !/^[？?]/.test(label);

  function applyBulk(ctx, scope) {
    if (typeof ctx.toggleInheritKey !== "function" || typeof ctx.toggleForgetKey !== "function" ||
        typeof ctx.canSelectInheritItem !== "function") return;
    const byKey = new Map((ctx.autoGrantedSkillPassive ?? []).map(entry => [entry.key, entry]));
    const forget = (ctx.childForgetPool ?? []).map(entry => {
      const automatic = byKey.get(entry.key);
      return { key: entry.key, label: automatic?.hidden ? "" : ctx.formatAutoGrantLabel?.(automatic ?? entry) };
    });
    // Free available slots before attempting to add skills through the game's validators.
    for (const { key, label } of forget) {
      if (!visibleSkill(label)) continue;
      const desired = scope.skills.has(nameKey(label));
      if (!desired && ctx.lockedInheritanceKeys?.has(key)) continue;
      if (ctx.selectedForgetKeys?.has(key) === desired) ctx.toggleForgetKey(key);
    }
    for (const entry of ctx.inheritSelectablePool ?? []) {
      const label = entry.hidden ? "" : ctx.formatInheritEntryLabel?.(entry);
      if (visibleSkill(label) && scope.skills.has(nameKey(label)) && !ctx.selectedInheritKeys?.has(entry.key) &&
          ctx.canSelectInheritItem(entry.key)) ctx.toggleInheritKey(entry.key);
    }
  }

  function mating(instance, props, root) {
    const rows = [...root.querySelectorAll(".fx-mati__row,[data-inherit-row]")].filter(row => row.getClientRects().length);
    const { ctx } = props;
    const anchor = root.matches(".fx-mati") ? root : rows[0]?.parentElement;
    const parentIds = ctx?.matingSlots?.map(monster => monsterId(monster) ?? monster?.id);
    const scope = anchor && rows.length ? matingSkills(anchor, parentIds, root) : null;
    if (!scope) {
      root.querySelector('[data-ha4="training-active-route"]')?.remove();
      root.querySelector('[data-ha4="training-bulk"]')?.remove();
      bulkChoices.delete(root);
      return;
    }
    if (typeof ctx?.toggleInheritKey === "function" && !ctx.inheritanceLockSelectionChanged && !ctx.isSavingInheritanceLocks) {
      runBulk(anchor, root, scope, ctx.selectedCandidateId ?? ctx.childMaster?.id, () => applyBulk(ctx, scope));
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

  const legacyRowSelector = ".bg-background.border.rounded.transition-colors.overflow-hidden,[class~='bg-emerald-950/30'].border.rounded.overflow-hidden";

  function legacySelections(modal, scope) {
    const { rows: owned } = ownedRecords();
    const locked = new Set([...recordsFor(legacyParents.map(String), owned).values()].flatMap(record => {
      const meta = record.meta ?? record.t_user_monsters?.meta;
      return Array.isArray(meta?.inheritance_locked_skills) ? meta.inheritance_locked_skills : [];
    }));
    const changes = [];
    const additions = [];
    for (const row of modal.querySelectorAll(legacyRowSelector)) {
      const auto = row.classList.contains("bg-emerald-950/30");
      const name = row.querySelector("span.font-bold.break-words");
      const forget = auto && [...row.querySelectorAll("input[type=checkbox]")]
        .find(input => input.closest("label")?.textContent.trim() === "覚えない");
      const label = name?.textContent;
      const selected = row.classList.contains("border-secondary") || row.querySelector('[aria-checked="true"]');
      if (visibleSkill(label)) {
        const desired = scope.skills.has(nameKey(label));
        const lock = locked.has(legacyAutoKeys.get(row)) || row.querySelector('[aria-label*="ロック"],[title*="ロック"]');
        if (forget && !forget.disabled && (desired || !lock)) {
          changes.push({ input: forget, desired });
        } else if (!auto && desired && !selected) additions.push(row);
      }
      advise(row, name, label, scope, {
        auto, forgot: forget?.checked, forgettable: !!forget,
        selected,
        blocked: row.classList.contains("opacity-60")
      });
    }
    return { changes, additions };
  }

  function legacyMating(parentIds) {
    legacyParents = Array.isArray(parentIds) ? parentIds : [];
    const heading = [...document.querySelectorAll('[role="dialog"] h3,[data-base-modal-root] h3')]
      .find(el => el.textContent.trim() === "継承するスキル / パッシブを選択" && el.getClientRects().length);
    const modal = heading?.closest(dialogSelector);
    const firstRow = modal?.querySelector(legacyRowSelector);
    if (!firstRow) return;
    if (!modal.hasAttribute("data-ha4-training-scope")) modal.setAttribute("data-ha4-training-scope", "");
    const body = firstRow.closest(".p-3.flex.flex-col.h-full") ?? heading.closest("header")?.nextElementSibling ?? modal;
    const scope = matingSkills(body, parentIds);
    legacySelections(modal, scope);
    runBulk(body, modal, scope, null, async active => {
      const overlay = modal.closest("[data-base-modal-root]");
      if (overlay && topGameModal() !== overlay) return;
      const { changes, additions } = legacySelections(modal, scope);
      for (const { input, desired } of changes) {
        if (!active()) return;
        if (input.isConnected && input.checked === desired) { input.click(); await Promise.resolve(); }
      }
      for (const row of additions) {
        if (!active()) return;
        if (!row.isConnected || row.classList.contains("opacity-60") || row.classList.contains("border-secondary")) continue;
        const control = row.querySelector('[role="checkbox"]') ?? row.firstElementChild;
        if (control && !control.matches(':disabled,[aria-disabled="true"]')) { control.click(); await Promise.resolve(); }
      }
    }, modalReadyDelay);
  }

  for (const type of ["click", "change", "keydown"]) {
    document.addEventListener(type, event => {
      if (type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.target instanceof Element && event.target.closest("[data-ha4-training-scope]")) {
        if (type === "click" && event.isTrusted && event.target.closest(legacyRowSelector)) {
          const state = bulkChoices.get(event.target.closest(dialogSelector));
          if (state) state.applied = true;
        }
        document.dispatchEvent(new Event("hako-af:grid-rendered"));
      }
    }, true);
  }

  function prioritize(instance, listNode, items, matches, signature, onPrioritize, dependencies, readThrough) {
    let state = grantBindings.get(instance);
    if (!state && matches && Array.isArray(items)) {
      // Both standard layouts derive the page from the same full computed list.
      // Project that list before the slice and the virtualizer consume it.
      let owner = listNode?.component?.parent;
      let ref;
      while (owner && !ref) {
        ref = dependencies(owner.effect).find(source => source._value === items);
        if (owner === instance) break;
        owner = owner.parent;
      }
      ref ??= dependencies(instance.effect).find(source => source._value === items);
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
    const classic = instance.type?.__name === "TrainingSkillGrantPanel";
    let listNode, list, picker, pager;
    for (const vnode of walk(instance.subTree, true)) {
      const name = componentName(vnode);
      const props = vnode.component?.props ?? vnode.props;
      if (name === "FlexVirtualList" && grantLists.has(props?.listClass)) {
        list = props;
        listNode = vnode;
      }
      if (classic && name === "VirtualItemList" && Number(props?.estimateSize) === 42 &&
          element(vnode)?.closest('[data-ha4-training-scope]') === root) {
        list = props;
        listNode = vnode;
      }
      if (classic ? name === "MonsterList" && props?.showAllStorageScope === "training-skill-grant" : name === "FlexMonsterList") picker = props;
      if (list && name === "FlexPager" && element(vnode)?.closest('.fx-tgflow__pane--skills,.fx-tgrant__browser')) {
        pager = vnode;
      }
    }
    const id = picker?.currentId ?? picker?.selectedId ?? picker?.["current-id"] ?? picker?.["selected-id"];
    const recipient = id == null || !Array.isArray(picker?.monsters) ? null :
      picker.monsters.find(monster => String(parentId(monster)) === String(id));
    const controls = classic ? root.querySelector('select:has(option[value="point"]):has(option[value="name"])') :
      root.querySelector(".fx-tgrant__controls,.fx-tgflow__controls");
    const route = grantRoute(controls?.parentElement, id);
    const permanent = recipient?.t_user_monsters?.permanent_skills ?? recipient?.permanent_skills;
    const acquired = new Set(Array.isArray(permanent) ? permanent.filter(Boolean).map(skill =>
      typeof skill === "string" ? skill : `${skill.effect === "passive" ? "passive" : "active"}:${skill.id}`) : []);
    const matches = route?.permanent.size ? row => {
      const skill = row?.skill;
      if (!skill || acquired.has(row.key) || acquired.has(skill.id)) return false;
      return route.permanent.has(nameKey(skill.name_key ? translate(skill.name_key) : skill.name ?? skill.id));
    } : null;
    const signature = matches ? JSON.stringify([id, [...route.permanent], [...acquired]]) : null;
    prioritize(instance, listNode, list?.items, matches, signature, () => {
      if (classic) listNode?.component?.exposed?.scrollToIndex?.(0);
      if (pager?.props?.page > 1) pager.props.onChange?.(1);
    }, dependencies, readThrough);

    if (classic) {
      const visible = element(listNode ?? {})?.querySelectorAll(":scope > div > [data-index]") ?? [];
      mark(visible, new Set([...visible].filter(el => matches?.(list.items[Number(el.dataset.index)]))));
      return;
    }
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
    if (name === "FlexMatingCandidates") {
      flexCandidate = props;
      return;
    }
    if (!routes.size && !grantBindings.has(instance) && !root.querySelector('[data-ha4="training-active-route"]')) return;
    if (!root.hasAttribute("data-ha4-training-scope")) root.setAttribute("data-ha4-training-scope", "");
    if (matingComponents.has(name)) mating(instance, props, root);
    else if (grantComponents.has(name)) grant(instance, root, translate, dependencies, readThrough);
  }

  globalThis.hakoAfTrainingRoutesMain = { read, readMonster, legacyMating, rememberOwned,
    rememberLegacyAuto: (element, key) => legacyAutoKeys.set(element, key),
    accepts: name => matingComponents.has(name) || grantComponents.has(name) || name === "FlexMatingCandidates" };
})();
