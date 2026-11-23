(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const identity = globalThis.hakoAfSkillIdentity;
  const loadRouteLabel = `${names.trainingRoutes}を読み込む`;
  const storageKey = "ha4-training-routes-v2";
  const legacyKey = "ha4-training-routes-v1";
  const detailsSelector = "[data-ha4-training-target]";
  const groups = { ordinary: ["通常スキル", 37], permanent: ["永久スキル", 37] };
  const groupName = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  const nameKey = value => value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const skillLines = text => [...new Map(text.split(/\r?\n/)
    .map(line => line.trim()).filter(Boolean).map(line => [nameKey(line), line])).values()];

  function reassignSkill(skills, leaving, incoming) {
    const next = skills.filter(skill => skill !== leaving);
    if (incoming && !next.some(skill => nameKey(skill) === nameKey(incoming))) {
      next.splice(leaving ? skills.indexOf(leaving) : next.length, 0, incoming);
    }
    return next;
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey)) ?? { routes: JSON.parse(localStorage.getItem(legacyKey)) };
      const routes = (Array.isArray(saved.routes) ? saved.routes : []).filter(route => typeof route?.id === "string" &&
        typeof route.name === "string" && Object.keys(groups).every(key => Array.isArray(route[key]) &&
          route[key].every(skill => typeof skill === "string")));
      const ids = new Set(routes.map(route => route.id));
      const bindings = (Array.isArray(saved.bindings) ? saved.bindings : []).filter(binding =>
        typeof binding?.monsterId === "string" && ids.has(binding.routeId));
      const mothers = Array.isArray(saved.mothers) ? saved.mothers.filter(id => typeof id === "string" && id) : [];
      return { routes, bindings, mothers };
    } catch { /* Invalid or unavailable local storage. */ }
    return { routes: [], bindings: [], mothers: [] };
  }

  function routeGroups(routes) {
    const grouped = new Map();
    for (const route of routes) {
      const name = groupName(route.group);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name).push(route);
    }
    return [...grouped].sort(([a], [b]) => a && b ? a.localeCompare(b, "ja") : a ? -1 : b ? 1 : 0);
  }

  function routeOptions(routes) {
    return routeGroups(routes).flatMap(([name, entries]) => {
      const options = entries.map(route => new Option(route.name, route.id));
      if (!name) return options;
      const group = document.createElement("optgroup");
      group.label = name;
      group.append(...options);
      return [group];
    });
  }

  function start(node, enabled, requestScan, shareRoute) {
    let dialog, lastSent, watchingMatings;
    const progressData = new WeakMap();
    const button = (label, action) => {
      const el = node("button", "extra-button", label);
      el.type = "button";
      el.addEventListener("click", action);
      return el;
    };

    async function share(draft, status, target) {
      if (!enabled()) return;
      try {
        if (!shareRoute) throw new Error("共有機能を読み込めませんでした。ページを再読み込みしてください。");
        await shareRoute(draft, target);
      } catch (error) {
        if (status) status.textContent = error.message === "Too many route skills"
          ? "通常・永久それぞれの使用中スキルは37件まで共有できます。"
          : /^(Invalid |Empty )/.test(error.message) ? "育成ルートの入力内容を確認してください。"
          : error.message || "育成ルートを共有できませんでした。";
      }
    }

    function update(data) {
      if (!watchingMatings) {
        watchingMatings = true;
        document.dispatchEvent(new Event("hako-af:watch-mating-results"));
      }
      data ??= load();
      const payload = JSON.stringify(enabled() ? { ...data, enabled: true } : { routes: [], bindings: [], mothers: [], enabled: false });
      if (lastSent !== payload) {
        lastSent = payload;
        document.dispatchEvent(new CustomEvent("hako-af:training-routes", { detail: payload }));
      }
      return data;
    }

    window.addEventListener("storage", event => {
      if (event.key === storageKey || event.key === legacyKey || event.key === null) requestScan();
    });

    function persist(data, status) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        if (status) status.textContent = "育成ルートを保存できませんでした。";
        return false;
      }
      update(data);
      requestScan();
      return true;
    }

    function saveRoute(draft, status) {
      const data = load();
      const current = data.routes.find(route => route.id === draft.id);
      if (draft.id && !current) {
        status.textContent = "この育成ルートは削除されています。";
        return;
      }
      const route = { id: current?.id ?? crypto.randomUUID(),
        name: draft.name.trim() || current?.name || `育成ルート ${data.routes.length + 1}`, group: groupName(draft.group) };
      const baseMonsterId = draft.baseMonsterId ?? current?.baseMonsterId;
      if (typeof baseMonsterId === "string" && baseMonsterId) route.baseMonsterId = baseMonsterId;
      const preview = draft.preview ?? current?.preview;
      if (preview && typeof preview === "object") route.preview = preview;
      const rank6 = Object.hasOwn(draft, "rank6Passive") ? draft.rank6Passive : current?.rank6Passive;
      if (typeof rank6?.id === "string" && typeof rank6.name === "string" && typeof rank6.enabled === "boolean") {
        const { id, name, enabled } = rank6;
        if (id && name.trim()) route.rank6Passive = { id, name, enabled };
      }
      const reserved = draft.reserved ?? current?.reserved;
      const reservedKeys = new Set((Array.isArray(reserved) ? reserved : [])
        .filter(name => typeof name === "string").map(nameKey));
      for (const [key, [label, limit]] of Object.entries(groups)) {
        route[key] = skillLines(draft[key].join("\n"));
        if (key === "ordinary" && route.rank6Passive) {
          route[key] = route[key].filter(name => nameKey(name) !== nameKey(route.rank6Passive.name) &&
            nameKey(name) !== identity.typed(route.rank6Passive.name, "passive"));
        }
        if (route[key].filter(name => !reservedKeys.has(nameKey(name))).length > limit) {
          status.textContent = `${label}の使用中は${limit}件まで保存できます。`;
          return;
        }
      }
      const skillIds = draft.previewSkillIds ?? current?.previewSkillIds;
      if (skillIds) route.previewSkillIds = Object.fromEntries([...route.ordinary, ...route.permanent].flatMap(name => {
        const id = skillIds[name];
        return typeof id === "string" && /^[sp]\./.test(id) ? [[name, id]] : [];
      }));
      if (Array.isArray(reserved)) {
        route.reserved = [...new Set([...route.ordinary, ...route.permanent])].filter(name => reservedKeys.has(nameKey(name)));
      }
      const skillOrder = draft.skillOrder ?? current?.skillOrder;
      const orderUnique = draft.orderUnique ?? current?.orderUnique;
      if (typeof orderUnique === "string" && identity.parse(orderUnique).kind) route.orderUnique = orderUnique;
      if (Array.isArray(skillOrder)) route.skillOrder = identity.routeOrder({ ...route, skillOrder });
      if (current) data.routes[data.routes.indexOf(current)] = route;
      else data.routes.push(route);
      return persist(data, status) ? route : undefined;
    }

    function deleteRoute(id, status) {
      const data = load(), saved = data.routes.find(route => route.id === id);
      if (!saved) {
        if (status) status.textContent = "この育成ルートは削除されています。";
        return;
      }
      const count = data.bindings.filter(binding => binding.routeId === id).length;
      const notice = count ? `\n設定中の${count}体の割り当ても解除します。` : "";
      if (!window.confirm(`「${saved.name}」の育成ルートを削除しますか？${notice}`)) return;
      data.routes = data.routes.filter(route => route.id !== id);
      data.bindings = data.bindings.filter(binding => binding.routeId !== id);
      return persist(data, status) ? saved : undefined;
    }

    document.addEventListener("hako-af:mating-completed", event => {
      if (!enabled() || typeof event.detail !== "string") return;
      let result;
      try { result = JSON.parse(event.detail); } catch { return; }
      if (!Array.isArray(result?.parents) || !result.parents.length ||
          !result.parents.every(id => typeof id === "string" && id) || typeof result.child !== "string" ||
          !result.child || result.parents.includes(result.child)) return;

      const data = load();
      const parents = new Set(result.parents);
      const inherited = new Set(data.bindings.filter(binding => parents.has(binding.monsterId)).map(binding => binding.routeId));
      const wasMother = data.mothers.some(id => parents.has(id));
      if (!inherited.size && !wasMother) return;
      if (inherited.size === 1) {
        data.bindings = data.bindings.filter(binding => !parents.has(binding.monsterId));
        if (!data.bindings.some(binding => binding.monsterId === result.child)) {
          const routeId = inherited.values().next().value;
          data.bindings.push(routeBinding(result.child, data.routes.find(route => route.id === routeId)));
        }
      }
      data.mothers = [...new Set(data.mothers.filter(id => !parents.has(id)).concat(wasMother ? [result.child] : []))];
      persist(data);
    });

    function routeBinding(monsterId, route) {
      return { monsterId, routeId: route.id, skillStateRevision: crypto.randomUUID(), ...(Array.isArray(route.reserved) ? {
        pendingSkillStates: [...new Set([...route.ordinary, ...route.permanent])]
      } : {}) };
    }

    document.addEventListener("hako-af:training-skill-order-applied", event => {
      if (!enabled()) return;
      let result;try { result = JSON.parse(event.detail); } catch { return; }
      if (typeof result?.signature !== "string") return;
      const data = load(), binding = data.bindings.find(item => item.monsterId === result.monsterId && item.routeId === result.routeId);
      if (!binding || binding.skillStateRevision !== result.revision || binding.skillOrderApplied === result.signature) return;
      binding.skillOrderApplied = result.signature;
      binding.skillOrderResult = typeof result.message === "string" ? result.message : "並び順を反映しました。";
      persist(data);
    });

    document.addEventListener("hako-af:training-skill-states-applied", event => {
      if (!enabled()) return;
      let result;
      try { result = JSON.parse(event.detail); } catch { return; }
      if (!Array.isArray(result?.names) || !result.names.every(name => typeof name === "string")) return;
      const data = load();
      const binding = data.bindings.find(item => item.monsterId === result.monsterId && item.routeId === result.routeId);
      if (!Array.isArray(binding?.pendingSkillStates)) return;
      const applied = new Set(result.names.map(nameKey));
      const next = binding.pendingSkillStates.filter(name => !applied.has(nameKey(name)));
      if (next.length === binding.pendingSkillStates.length) return;
      binding.pendingSkillStates = next;
      persist(data);
    });

    function modal(title) {
      dialog?.close();
      const root = dialog = node("dialog", "training-routes");
      root.setAttribute("aria-label", title);
      const header = node("header", "extra-header");
      header.append(node("h2", "extra-heading", title), button("閉じる", () => root.close()));
      root.append(header);
      root.addEventListener("close", () => {
        root.remove();
        if (dialog === root) dialog = null;
      }, { once: true });
      return root;
    }

    function show(root, body) {
      root.append(body);
      document.body.append(root);
      root.showModal();
    }

    function field(label, el) {
      const wrapper = node("label", "training-field", label);
      wrapper.append(el);
      return wrapper;
    }

    function groupInput(input, list) {
      input.maxLength = 60;
      input.setAttribute("list", list.id = `ha4-route-groups-${crypto.randomUUID()}`);
      const refresh = () => list.replaceChildren(...routeGroups(load().routes)
        .filter(([name]) => name).map(([name]) => new Option(name, name)));
      input.addEventListener("focus", refresh);
      refresh();
    }

    function open(initial) {
      const root = modal(names.trainingRoutes);
      const form = node("form", "training-form");
      const picker = node("select", "training-input");
      const name = node("input", "training-input");
      const group = node("input", "training-input");
      const groupList = node("datalist", "training-group-list");
      group.placeholder = "例：探索編成用";
      groupInput(group, groupList);
      const status = node("p", "extra-note");
      status.setAttribute("role", "status");
      name.maxLength = 120;
      form.append(field("保存済みのルート", picker), field("ルート名（任意）", name),
        field("グループ名（任意）", group), groupList,
        node("p", "extra-note", `スキル名を1行に1つ入力してください。同名のスキルは下の種別で区別できます。保存後、ホムンクルス詳細の「${loadRouteLabel}」から設定できます。`));
      const fields = node("div", "training-skill-fields");
      let reservedNames;
      const reserveFields = node("fieldset", "training-reserves");
      const reserveList = node("div", "training-reserve-list");
      reserveFields.append(node("legend", "training-transfer-title", "使用中・控え"),
        node("p", "extra-note", "チェックしたスキルを控えとして保存します。チェックがないスキルは使用中です。"), reserveList);
      function refreshReserves() {
        reserveList.replaceChildren();
        const skills = skillLines(Object.values(inputs).map(({ input }) => input.value).join("\n"));
        if (!skills.length) {
          reserveList.append(node("p", "extra-note", "スキルを入力すると、控えを指定できます。"));
        }
        for (const name of skills) {
          const input = node("input", "training-reserve");
          input.type = "checkbox";
          input.checked = reservedNames?.has(nameKey(name)) === true;
          input.setAttribute("aria-label", `${name}を控えにする`);
          input.addEventListener("change", () => {
            reservedNames ??= new Set();
            if (input.checked) reservedNames.add(nameKey(name));
            else reservedNames.delete(nameKey(name));
            for (const { refresh } of Object.values(inputs)) refresh();
            refreshTransfers();
          });
          const label = node("label", "training-reserve-choice");
          label.append(input, name, node("span", "extra-note", "控え"));
          const kind = node("select", "training-input");
          kind.setAttribute("aria-label", `${name}の種別`);
          kind.append(new Option("種別未指定（従来の判定）", ""), new Option("アクティブ", "skill"), new Option("パッシブ", "passive"));
          kind.value = identity.parse(name).kind ?? "";
          kind.addEventListener("change", () => {
            const replacement = kind.value ? identity.typed(name, kind.value) : identity.parse(name).name;
            if (reservedNames?.delete(nameKey(name))) reservedNames.add(nameKey(replacement));
            for (const { input, refresh } of Object.values(inputs)) {
              input.value = skillLines(input.value).map(value => value === name ? replacement : value).join("\n");
              refresh();
            }
            refreshTransfers();refreshReserves();
          });
          const row = node("div", "training-reserve-entry");
          row.append(label, kind);
          reserveList.append(row);
        }
      }
      const inputs = Object.fromEntries(Object.entries(groups).map(([key, [label, limit]]) => {
        const input = node("textarea", "training-input");
        input.rows = 9;
        input.spellcheck = false;
        const count = node("span", "training-count");
        const wrapper = field(label, input);
        wrapper.insertBefore(count, input);
        fields.append(wrapper);
        const refresh = () => {
          const skills = skillLines(input.value);
          const reserveCount = skills.filter(name => reservedNames?.has(nameKey(name))).length;
          const size = skills.length - reserveCount;
          count.textContent = reserveCount ? `使用中 ${size} / ${limit}・控え ${reserveCount}` : `${size} / ${limit}`;
          input.setCustomValidity(size > limit ? `${label}は${limit}個まで設定できます。` : "");
        };
        input.addEventListener("input", () => {
          refresh();
          refreshTransfers();
          refreshReserves();
        });
        return [key, { input, refresh }];
      }));
      const transfers = node("fieldset", "training-transfer");
      const transferFields = node("div", "training-skill-fields");
      const choices = Object.fromEntries([["ordinary", "通常から選ぶ"], ["permanent", "永久から選ぶ"]].map(([key, label]) => {
        const select = node("select", "training-input");
        select.setAttribute("aria-label", label);
        transferFields.append(field(label, select));
        return [key, select];
      }));
      const transferStatus = node("span", "extra-note");
      transferStatus.setAttribute("role", "status");
      const applyTransfer = button("移動・入れ替え", () => {
        const plan = transferPlan();
        if (!plan.next) return;
        for (const [key, { input, refresh }] of Object.entries(inputs)) {
          input.value = plan.next[key].join("\n");
          refresh();
        }
        refreshTransfers(true);
        refreshReserves();
        status.textContent = "";
        transferStatus.textContent = "変更しました。「保存」で反映します。";
      });
      const transferActions = node("div", "party-actions");
      transferActions.append(applyTransfer, transferStatus);
      transfers.append(node("legend", "training-transfer-title", "通常・永久の入れ替え"),
        node("p", "extra-note", "片方を選ぶと移動し、両方を選ぶと入れ替えます。"),
        transferFields, transferActions);

      function transferPlan() {
        const ordinary = choices.ordinary.value;
        const permanent = choices.permanent.value;
        const label = ordinary && permanent ? "入れ替える" : ordinary ? "永久へ移す" : permanent ? "通常へ移す" : "移動・入れ替え";
        if (!ordinary && !permanent) return { label };
        if (ordinary && permanent && nameKey(ordinary) === nameKey(permanent)) {
          return { label, message: "入れ替えるスキルは別々に選んでください。" };
        }
        const next = {};
        for (const [key, leaving, incoming] of [["ordinary", ordinary, permanent], ["permanent", permanent, ordinary]]) {
          const current = skillLines(inputs[key].input.value);
          next[key] = reassignSkill(current, leaving, incoming);
          const [group, limit] = groups[key];
          const used = skills => skills.filter(name => !reservedNames?.has(nameKey(name))).length;
          if (used(next[key]) > limit && used(next[key]) > used(current)) {
            return { label, message: `${group}は${limit}枠までです。入れ替える${group}も選んでください。` };
          }
        }
        return { label, next };
      }

      function updateTransferAction() {
        const { label, next, message } = transferPlan();
        applyTransfer.textContent = label;
        applyTransfer.disabled = !next;
        transferStatus.textContent = message ?? "";
      }

      function refreshTransfers(reset = false) {
        for (const [key, select] of Object.entries(choices)) {
          const selected = reset ? "" : select.value;
          const skills = skillLines(inputs[key].input.value);
          select.replaceChildren(new Option("選択なし", ""), ...skills.map(skill => new Option(skill, skill)));
          select.value = skills.includes(selected) ? selected : "";
        }
        updateTransferAction();
      }

      choices.ordinary.addEventListener("change", updateTransferAction);
      choices.permanent.addEventListener("change", updateTransferAction);
      const controls = node("div", "party-actions");
      const save = node("button", "extra-button", "保存");
      save.type = "submit";
      const remove = button("削除", () => {
        if (deleteRoute(currentId, status)) {
          setRoute();
          status.textContent = "育成ルートを削除しました。";
        }
      });
      const shareButton = button("育成ルートを共有", () => {
        if (form.reportValidity()) void share(draft(), status);
      });
      controls.append(save, shareButton, remove);
      form.append(transfers, fields, reserveFields, controls, status);

      let currentId, metadata;
      function setRoute(route) {
        currentId = route?.id;
        metadata = Object.fromEntries(["baseMonsterId", "preview", "previewSkillIds", "rank6Passive", "skillOrder", "orderUnique"]
          .filter(key => route?.[key] !== undefined).map(key => [key, route[key]]));
        reservedNames = Array.isArray(route?.reserved) ? new Set(route.reserved.map(nameKey))
          : route?.id || route?.reserved === null ? undefined : new Set();
        picker.replaceChildren(new Option("新規ルート", ""), ...routeOptions(load().routes));
        picker.value = currentId ?? "";
        name.value = route?.name ?? "";
        group.value = groupName(route?.group);
        for (const [key, { input, refresh }] of Object.entries(inputs)) {
          input.value = route?.[key]?.join("\n") ?? "";
          refresh();
        }
        status.textContent = "";
        remove.hidden = !currentId;
        transfers.hidden = !currentId;
        refreshTransfers(true);
        refreshReserves();
      }

      picker.addEventListener("change", () => setRoute(load().routes.find(route => route.id === picker.value)));
      function draft() {
        const value = { ...metadata, id: currentId, name: name.value, group: group.value };
        for (const [key, { input }] of Object.entries(inputs)) value[key] = skillLines(input.value);
        if (reservedNames) value.reserved = [...value.ordinary, ...value.permanent].filter(name => reservedNames.has(nameKey(name)));
        return value;
      }
      form.addEventListener("submit", event => {
        event.preventDefault();
        const route = saveRoute(draft(), status);
        if (route) {
          setRoute(route);
          status.textContent = "育成ルートを保存しました。";
        }
      });
      setRoute(initial);
      show(root, form);
    }

    function readSharedUnique(member, source) {
      if (!source || identity.parse(member.rank6Unique).kind) return Promise.resolve(member.rank6Unique);
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          source.removeEventListener("hako-af:training-unique", receive);
          resolve(member.rank6Unique ?? "");
        }, 2500);
        function receive(event) {
          clearTimeout(timer);
          resolve(typeof event.detail === "string" && event.detail || member.rank6Unique || "");
        }
        source.addEventListener("hako-af:training-unique", receive, { once: true });
        source.dispatchEvent(new CustomEvent("hako-af:read-training-unique", { bubbles: true,
          detail: JSON.stringify({ name: member.name, portrait: member.portrait }) }));
      });
    }

    async function openMember(member, slot, party, source) {
      if (member.trainingRoute) {
        const { name, group, ordinary, permanent, reserved, baseMonsterId, preview, previewSkillIds, rank6Passive, skillOrder, orderUnique } = member.trainingRoute;
        open({ name, group, ordinary, permanent, reserved: reserved ?? null, baseMonsterId, preview, previewSkillIds, rank6Passive, skillOrder, orderUnique });
        return;
      }
      const unique = nameKey(await readSharedUnique(member, source) ?? "");
      if (source && !source.getClientRects().length) return;
      const entries = [...member.active.map(skill => ({ ...skill, kind: "skill" })),
        ...member.passive.map(skill => ({ ...skill, kind: "passive" }))];
      const routeName = skill => identity.typed(skill.name, skill.kind);
      open({ name: slot == null ? member.name : `${party} ${slot}枠目 ${member.name}`.slice(0, 120),
        ordinary: entries.filter(skill => !skill.permanent && nameKey(skill.name) !== unique && routeName(skill) !== unique).map(routeName),
        permanent: entries.filter(skill => skill.permanent).map(routeName),
        skillOrder: entries.map(routeName),
        orderUnique: entries.find(skill => nameKey(skill.name) === unique) && routeName(entries.find(skill => nameKey(skill.name) === unique)),
        reserved: member.skillStates || entries.some(skill => skill.reserved) ? entries.filter(skill => skill.reserved).map(routeName) : null });
    }

    document.addEventListener("hako-af:training-restore-order", event => {
      if (!enabled() || typeof event.detail !== "string") return;
      let party;try { party = JSON.parse(event.detail); } catch { return; }
      if (!Array.isArray(party?.slots)) return;
      const data = load(), root = modal("既存ルートの並び順を更新"), form = node("form", "training-form"), picks = [];
      form.append(node("p", "extra-note", "通常・永久の割り当て、控え、スキルLvはそのままに、選んだルートの処理順だけを更新します。"));
      party.slots.forEach((member, slot) => {
        if (!member || !Array.isArray(member.active) || !Array.isArray(member.passive)) return;
        const entries = [...member.active.map(skill => ({ ...skill, kind: "skill" })), ...member.passive.map(skill => ({ ...skill, kind: "passive" }))];
        const order = entries.filter(skill => typeof skill.name === "string").map(skill => identity.typed(skill.name, skill.kind));
        const unique = entries.find(skill => nameKey(skill.name) === nameKey(member.rank6Unique ?? ""));
        const picker = node("select", "training-input");
        picker.setAttribute("aria-label", `${slot + 1}枠目 ${member.name}の更新先`);
        picker.replaceChildren(new Option("更新しない", ""), ...routeOptions(data.routes));
        const exact = data.routes.filter(route => nameKey(route.name) === nameKey(`${party.name} ${slot + 1}枠目 ${member.name}`));
        const preferred = exact.filter(route => data.bindings.some(binding => binding.routeId === route.id));
        if (preferred.length === 1 || exact.length === 1) picker.value = (preferred[0] ?? exact[0]).id;
        picks.push({ picker, order, unique: unique && identity.typed(unique.name, unique.kind) });
        form.append(field(`${slot + 1}枠目　${member.name}`, picker));
      });
      const status = node("p", "extra-note");status.setAttribute("role", "status");
      const save = node("button", "extra-button", "選んだルートの並び順を更新");save.type = "submit";
      form.append(save, status);
      form.addEventListener("submit", event => {
        event.preventDefault();const next = load(), selected = picks.filter(item => item.picker.value);
        if (!selected.length) { status.textContent = "更新するルートを選んでください。";return; }
        if (new Set(selected.map(item => item.picker.value)).size !== selected.length) { status.textContent = "同じルートが複数選ばれています。";return; }
        try {
          if (!localStorage.getItem("ha4-training-order-backup-v1")) localStorage.setItem("ha4-training-order-backup-v1", JSON.stringify(next));
        } catch { status.textContent = "元のルートを退避できなかったため、更新を中止しました。";return; }
        for (const item of selected) {
          const route = next.routes.find(route => route.id === item.picker.value);
          if (!route) { status.textContent = "更新先のルートが削除されています。";return; }
          if (item.unique) route.orderUnique = item.unique;
          route.skillOrder = identity.routeOrder({ ...route, skillOrder: item.order });
          for (const binding of next.bindings.filter(binding => binding.routeId === route.id)) {
            delete binding.skillOrderApplied;delete binding.skillOrderResult;binding.skillOrderRevision = crypto.randomUUID();
          }
        }
        if (persist(next, status)) status.textContent = `${selected.length}件の並び順を更新しました。設定済みの個体詳細を開くと反映します。`;
      });
      show(root, form);
    });

    function assign(target) {
      const root = modal(loadRouteLabel);
      const form = node("form", "training-form");
      form.append(node("strong", "training-recipient", target.name));
      const { routes, bindings } = load();
      if (!routes.length) {
        form.append(node("p", "extra-note", "保存済みの育成ルートがありません。"), button("新規ルートを作成", () => open()));
        show(root, form);
        return;
      }
      const current = bindings.find(binding => binding.monsterId === target.id)?.routeId;
      const picker = node("select", "training-input");
      picker.required = true;
      picker.replaceChildren(new Option("育成ルートを選ぶ", ""), ...routeOptions(routes));
      picker.value = current ?? "";
      const status = node("p", "extra-note");
      status.setAttribute("role", "status");
      const controls = node("div", "party-actions");
      const save = node("button", "extra-button", "この個体に設定");
      save.type = "submit";
      controls.append(save);
      if (current) controls.append(button("設定を解除", () => commit("")));
      form.append(field("保存済みのルート", picker), controls, status);
      form.append(node("p", "extra-note", "設定したルートのスキル順を個体に反映します。控えを保存したルートは、スキルタブで使用中・控えも反映します。"));
      form.addEventListener("submit", event => { event.preventDefault(); commit(picker.value); });
      show(root, form);

      function commit(routeId) {
        const data = load();
        if (routeId && !data.routes.some(route => route.id === routeId)) {
          status.textContent = "この育成ルートは削除されています。";
          return;
        }
        data.bindings = data.bindings.filter(binding => binding.monsterId !== target.id);
        if (routeId) data.bindings.push(routeBinding(target.id, data.routes.find(route => route.id === routeId)));
        if (persist(data, status)) root.close();
      }
    }

    function readTarget(anchor) {
      try { return JSON.parse(anchor.dataset.ha4TrainingTarget); } catch { return null; }
    }

    document.addEventListener("hako-af:training-progress", event => {
      const anchor = event.target;
      if (!(anchor instanceof Element) || !anchor.matches(detailsSelector) ||
          progressData.get(anchor)?.signature === event.detail) return;
      try {
        const value = JSON.parse(event.detail);
        progressData.set(anchor, { value, signature: event.detail });
        requestScan();
      } catch { /* Ignore an invalid snapshot. */ }
    });

    function renderProgress(container, anchor, target, route) {
      let panel = container.querySelector('[data-ha4="training-progress"]');
      if (!route) {
        panel?.remove();
        return;
      }
      const snapshot = progressData.get(anchor);
      const value = snapshot?.value;
      const data = value?.id === target.id && value.routeId === route.id ? value : null;
      const signature = data ? snapshot.signature : JSON.stringify([target.id, route.id]);
      if (panel?.dataset.progressSignature === signature) return;
      if (!panel) {
        panel = node("details", "training-progress");
        panel.addEventListener("toggle", () => { if (panel.open) requestScan(); });
        container.append(panel);
      }
      panel.dataset.progressSignature = signature;
      const title = node("summary", "training-progress-title");
      const body = node("div", "training-progress-body");
      panel.replaceChildren(title, body);
      if (!data || data.unavailable) {
        title.textContent = "育成ルートの不足を確認";
        body.append(node("p", "extra-note", data?.unavailable
          ? "この個体のスキルを確認できませんでした。詳細画面を開き直してください。" : "この個体のスキルを確認中…"));
        return;
      }
      const ordinary = data.ordinary ?? [];
      const permanent = data.permanent ?? [];
      const rank6 = data.rank6;
      const rank6Pending = rank6 && (!rank6.learned || rank6.actualEnabled !== rank6.enabled);
      title.textContent = ordinary.length || permanent.length ? `不足　通常 ${ordinary.length}件・永久 ${permanent.length}件` :
        rank6Pending ? "Rank 6固有パッシブを確認" : "育成ルート達成";
      if (rank6) {
        const planned = rank6.enabled ? "ON" : "OFF";
        const current = rank6.learned ? rank6.actualEnabled ? "ON" : "OFF" : "未習得";
        body.append(node("h4", "training-progress-group", "Rank 6固有パッシブ（枠外）"),
          node("p", "extra-note", `${rank6.name}　計画 ${planned} ／ 現在 ${current}`));
      }
      if (!ordinary.length && !permanent.length) {
        if (!rank6Pending) body.append(node("p", "extra-note", "育成ルートに必要なスキルがそろっています。"));
        return;
      }
      for (const [heading, skills, isPermanent] of [["通常スキル", ordinary, false], ["永久スキル", permanent, true]]) {
        if (!skills.length) continue;
        body.append(node("h4", "training-progress-group", heading));
        const list = node("ul", "training-progress-list");
        for (const skill of skills) {
          const item = node("li", "training-progress-skill");
          item.append(node("strong", "training-progress-name", skill.name));
          if (isPermanent) item.append(node("p", "extra-note", skill.learned
            ? "通常で習得済み。永久枠には同名の永久化スキルを付与"
            : "永久枠への追加は訓練所の「スキル付与」から"));
          if (skill.sources?.length && !skill.learned) {
            if (isPermanent) item.append(node("p", "extra-note", "通常スキルの入手元"));
            const sources = node("ul", "training-progress-sources");
            for (const entry of skill.sources) {
              const line = document.createElement("li");
              if (typeof entry.path === "string" && entry.path.startsWith("/encyclopedia?monster=")) {
                const link = document.createElement("a");
                link.href = entry.path;
                link.target = "_blank";
                link.rel = "noopener";
                link.textContent = entry.text;
                line.append(link);
              } else line.textContent = entry.text;
              if (["skill", "passive"].includes(entry.skillKind)) {
                const kind = node("span", "training-source-kind", entry.skillKind === "skill" ? "アクティブ" : "パッシブ");
                kind.dataset.kind = entry.skillKind;
                line.prepend(kind, " ");
              }
              if (!isPermanent && entry.overlaps?.length) {
                const overlap = node("details", "training-source-overlaps");
                const summary = node("summary", "training-source-overlap-title", `※別スキルも重複あり（ほか${entry.overlaps.length}件）`);
                const skills = node("ul", "training-source-overlap-skills");
                for (const other of entry.overlaps) skills.append(node("li", "training-source-overlap-skill",
                  `${identity.parse(other.name).name}${other.skillKind ? `（${other.skillKind === "skill" ? "アクティブ" : "パッシブ"}）` : ""}${Number.isSafeInteger(other.level) && other.level > 0 ? ` Lv${other.level}` : ""}`));
                summary.title = [...skills.children].map(skill => skill.textContent).join("、");
                overlap.append(summary, skills);
                line.append(" ", overlap);
              }
              sources.append(line);
            }
            item.append(sources);
          } else if (!skill.learned) {
            item.append(node("p", "extra-note", data.sourcesLoaded ? "図鑑データから入手元を特定できませんでした。"
              : "入手元の図鑑データを読み込めていません。図鑑を開いてから確認してください。"));
          }
          list.append(item);
        }
        body.append(list);
      }
      const encyclopedia = node("a", "extra-link", "図鑑を開く");
      encyclopedia.href = "/encyclopedia";
      encyclopedia.target = "_blank";
      encyclopedia.rel = "noopener";
      body.append(encyclopedia);
      if (permanent.length) {
        const market = node("a", "extra-link", "フリマで永久化スキルを探す");
        market.href = "/market";
        market.target = "_blank";
        market.rel = "noopener";
        body.append("　", market);
      }
    }

    function scan({ routes, bindings, mothers }) {
      for (const panel of document.querySelectorAll('[data-ha4="training-detail"]')) {
        if (!enabled() || !panel.parentElement?.matches(detailsSelector)) panel.remove();
      }
      if (!enabled()) return;
      for (const anchor of document.querySelectorAll(detailsSelector)) {
        const target = readTarget(anchor);
        if (!target?.id) continue;
        let panel = anchor.querySelector(':scope > [data-ha4="training-detail"]');
        if (!panel) {
          panel = node("div", "training-detail");
          const loadButton = button(loadRouteLabel, () => {
            document.dispatchEvent(new Event("hako-af:read-list"));
            const current = readTarget(anchor);
            if (current?.id) assign(current);
          });
          loadButton.setAttribute("aria-haspopup", "dialog");
          const edit = button("設定中のルートを編集", () => {
            const current = readTarget(anchor);
            const { routes, bindings } = load();
            const assigned = bindings.find(item => item.monsterId === current?.id);
            const route = routes.find(item => item.id === assigned?.routeId);
            if (route) open(route);
          });
          edit.dataset.ha4 = "training-edit-target";
          const shareButton = button("育成ルートを共有", () => {
            const current = readTarget(anchor);
            const { routes, bindings } = load();
            const binding = bindings.find(item => item.monsterId === current?.id);
            const route = routes.find(item => item.id === binding?.routeId);
            if (route) void share(route, panel.querySelector('[data-ha4="training-share-status"]'), current);
          });
          shareButton.dataset.ha4 = "training-share-target";
          shareButton.title = "未習得の目標スキルも含め、通常・永久・控え・スキルLvを共有します。";
          const shareStatus = node("span", "extra-note");
          shareStatus.dataset.ha4 = "training-share-status";
          shareStatus.setAttribute("role", "status");
          const applyStates = button("使用中・控え・並び順を反映", () => {
            const current = readTarget(anchor);
            const data = load();
            const binding = data.bindings.find(item => item.monsterId === current?.id);
            const route = data.routes.find(item => item.id === binding?.routeId);
            if (!route) return;
            Object.assign(binding, routeBinding(current.id, route));
            delete binding.skillOrderApplied;
            binding.skillOrderResult = "並び順を反映中…";
            persist(data);
          });
          applyStates.dataset.ha4 = "training-apply-skill-states";
          applyStates.title = "覚えているスキルの並び順を育成ルートに合わせます。控えの指定がある場合はスキルタブで使用中・控えも反映します。";
          const mother = button("世代上げ母体に指定", () => {
            const current = readTarget(anchor);
            if (!current?.id || !enabled()) return;
            const data = load();
            data.mothers = data.mothers.includes(current.id) ? data.mothers.filter(id => id !== current.id) : [...data.mothers, current.id];
            persist(data);
          });
          mother.dataset.ha4 = "training-mother";
          const applyStatus = node("span", "training-order-status");applyStatus.setAttribute("role", "status");
          panel.append(loadButton, edit, shareButton, applyStates, mother, node("span", "training-detail-route"), applyStatus, shareStatus);
          anchor.append(panel);
        }
        const binding = bindings.find(item => item.monsterId === target.id);
        const route = binding && routes.find(item => item.id === binding.routeId);
        const edit = panel.querySelector('[data-ha4="training-edit-target"]');
        edit.hidden = !route;
        panel.querySelector('[data-ha4="training-share-target"]').hidden = !route;
        panel.querySelector('[data-ha4="training-apply-skill-states"]').hidden = !route;
        const mother = panel.querySelector('[data-ha4="training-mother"]');
        const designated = mothers.includes(target.id);
        const motherText = designated ? "世代上げ母体の指定を解除" : "世代上げ母体に指定";
        if (mother.textContent !== motherText) mother.textContent = motherText;
        if (mother.getAttribute("aria-pressed") !== String(designated)) mother.setAttribute("aria-pressed", String(designated));
        const label = panel.querySelector('[data-ha4="training-detail-route"]');
        const text = route ? `設定中　${[groupName(route.group), route.name].filter(Boolean).join(" ／ ")}` : "";
        if (label.textContent !== text) label.textContent = text;
        const applyStatus = panel.querySelector('[data-ha4="training-order-status"]');
        const result = binding?.skillOrderResult ?? "";
        if (applyStatus.textContent !== result) applyStatus.textContent = result;
        renderProgress(panel, anchor, target, route);
      }
    }

    return { open: (id) => {
      const { routes } = load();
      open(routes.find(route => route.id === id) ?? routes[0]);
    }, openMember, update, scan, saveRoute, deleteRoute, groups, groupInput, share,
      forMonster: monsterId => {
        const { routes, bindings } = load();
        const binding = bindings.find(item => item.monsterId === String(monsterId));
        const route = routes.find(item => item.id === binding?.routeId);
        return route ? { route, binding } : null;
      },
      disablePreset: (monsterId, routeId) => {
        const data = load();
        const binding = data.bindings.find(item => item.monsterId === String(monsterId) && item.routeId === routeId);
        if (!binding || binding.skillPresetHidden) return;
        binding.skillPresetHidden = true;
        persist(data);
      },
      groupedRoutes: () => routeGroups(load().routes) };
  }

  globalThis.hakoAfTrainingRoutes = { start };
})();
