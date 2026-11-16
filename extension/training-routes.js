(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const loadRouteLabel = `${names.trainingRoutes}を読み込む`;
  const storageKey = "ha4-training-routes-v2";
  const legacyKey = "ha4-training-routes-v1";
  const detailsSelector = "[data-ha4-training-target]";
  const groups = { ordinary: ["通常スキル", 26], permanent: ["永久スキル", 10] };
  const nameKey = value => value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const skillLines = text => [...new Map(text.split(/\r?\n/)
    .map(line => line.trim()).filter(Boolean).map(line => [nameKey(line), line])).values()];

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey)) ?? { routes: JSON.parse(localStorage.getItem(legacyKey)) };
      const routes = (Array.isArray(saved.routes) ? saved.routes : []).filter(route => typeof route?.id === "string" &&
        typeof route.name === "string" && Object.keys(groups).every(key => Array.isArray(route[key]) &&
          route[key].every(skill => typeof skill === "string")));
      const ids = new Set(routes.map(route => route.id));
      const bindings = (Array.isArray(saved.bindings) ? saved.bindings : []).filter(binding =>
        typeof binding?.monsterId === "string" && ids.has(binding.routeId));
      return { routes, bindings };
    } catch { /* Invalid or unavailable local storage. */ }
    return { routes: [], bindings: [] };
  }

  function start(node, enabled, requestScan) {
    let dialog, lastSent, watchingMatings;
    const button = (label, action) => {
      const el = node("button", "extra-button", label);
      el.type = "button";
      el.addEventListener("click", action);
      return el;
    };

    function update(data) {
      if (!watchingMatings) {
        watchingMatings = true;
        document.dispatchEvent(new Event("hako-af:watch-mating-results"));
      }
      data ??= load();
      const payload = JSON.stringify(enabled() ? data : { routes: [], bindings: [] });
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
      if (inherited.size !== 1) return;
      const assigned = data.bindings.some(binding => binding.monsterId === result.child);
      data.bindings = data.bindings.filter(binding => !parents.has(binding.monsterId));
      if (!assigned) data.bindings.push({ monsterId: result.child, routeId: inherited.values().next().value });
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

    function open(initial) {
      const root = modal(names.trainingRoutes);
      const form = node("form", "training-form");
      const picker = node("select", "training-input");
      const name = node("input", "training-input");
      const status = node("p", "extra-note");
      status.setAttribute("role", "status");
      name.maxLength = 120;
      form.append(field("保存済みのルート", picker), field("ルート名（任意）", name),
        node("p", "extra-note", `スキル名を1行に1つ入力してください。保存後、ホムンクルス詳細の「${loadRouteLabel}」から設定できます。`));
      const fields = node("div", "training-skill-fields");
      const inputs = Object.fromEntries(Object.entries(groups).map(([key, [label, limit]]) => {
        const input = node("textarea", "training-input");
        input.rows = 9;
        input.spellcheck = false;
        const count = node("span", "training-count");
        const wrapper = field(label, input);
        wrapper.insertBefore(count, input);
        fields.append(wrapper);
        const refresh = () => {
          const size = skillLines(input.value).length;
          count.textContent = `${size} / ${limit}`;
          input.setCustomValidity(size > limit ? `${label}は${limit}個まで設定できます。` : "");
        };
        input.addEventListener("input", refresh);
        return [key, { input, refresh }];
      }));
      const controls = node("div", "party-actions");
      const save = node("button", "extra-button", "保存");
      save.type = "submit";
      const remove = button("削除", () => {
        const data = load();
        const saved = data.routes.find(route => route.id === currentId);
        if (!saved || !window.confirm(`「${saved.name}」の育成ルートを削除しますか？`)) return;
        data.routes = data.routes.filter(route => route.id !== currentId);
        data.bindings = data.bindings.filter(binding => binding.routeId !== currentId);
        if (persist(data, status)) {
          setRoute();
          status.textContent = "育成ルートを削除しました。";
        }
      });
      controls.append(save, remove);
      form.append(fields, controls, status);

      let currentId;
      function setRoute(route) {
        currentId = route?.id;
        picker.replaceChildren(new Option("新規ルート", ""), ...load().routes.map(item => new Option(item.name, item.id)));
        picker.value = currentId ?? "";
        name.value = route?.name ?? "";
        for (const [key, { input, refresh }] of Object.entries(inputs)) {
          input.value = route?.[key]?.join("\n") ?? "";
          refresh();
        }
        status.textContent = "";
        remove.hidden = !currentId;
      }

      picker.addEventListener("change", () => setRoute(load().routes.find(route => route.id === picker.value)));
      form.addEventListener("submit", event => {
        event.preventDefault();
        const data = load();
        const index = data.routes.findIndex(item => item.id === currentId);
        const route = { id: currentId ?? crypto.randomUUID(),
          name: name.value.trim() || data.routes[index]?.name || `育成ルート ${data.routes.length + 1}` };
        for (const [key, { input }] of Object.entries(inputs)) route[key] = skillLines(input.value);
        if (index === -1) data.routes.push(route);
        else data.routes[index] = route;
        if (persist(data, status)) {
          setRoute(route);
          status.textContent = "育成ルートを保存しました。";
        }
      });
      setRoute(initial);
      show(root, form);
    }

    function openMember(member, slot, party) {
      const entries = [...member.active, ...member.passive];
      open({ name: slot == null ? member.name : `${party} ${slot}枠目 ${member.name}`.slice(0, 120),
        ordinary: entries.filter(skill => !skill.permanent).map(skill => skill.name),
        permanent: entries.filter(skill => skill.permanent).map(skill => skill.name) });
    }

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
      picker.replaceChildren(new Option("育成ルートを選ぶ", ""), ...routes.map(route => new Option(route.name, route.id)));
      picker.value = current ?? "";
      const status = node("p", "extra-note");
      status.setAttribute("role", "status");
      const controls = node("div", "party-actions");
      const save = node("button", "extra-button", "この個体に設定");
      save.type = "submit";
      controls.append(save);
      if (current) controls.append(button("設定を解除", () => commit("")));
      form.append(field("保存済みのルート", picker), controls, status);
      form.addEventListener("submit", event => { event.preventDefault(); commit(picker.value); });
      show(root, form);

      function commit(routeId) {
        const data = load();
        if (routeId && !data.routes.some(route => route.id === routeId)) {
          status.textContent = "この育成ルートは削除されています。";
          return;
        }
        data.bindings = data.bindings.filter(binding => binding.monsterId !== target.id);
        if (routeId) data.bindings.push({ monsterId: target.id, routeId });
        if (persist(data, status)) root.close();
      }
    }

    function readTarget(anchor) {
      try { return JSON.parse(anchor.dataset.ha4TrainingTarget); } catch { return null; }
    }

    function scan({ routes, bindings }) {
      for (const panel of document.querySelectorAll('[data-ha4="training-detail"]')) {
        if (!panel.parentElement?.matches(detailsSelector)) panel.remove();
      }
      for (const anchor of document.querySelectorAll(detailsSelector)) {
        const target = readTarget(anchor);
        if (!target?.id || !anchor.getClientRects().length) continue;
        let panel = anchor.querySelector(':scope > [data-ha4="training-detail"]');
        if (!panel) {
          panel = node("div", "training-detail");
          const open = button(loadRouteLabel, () => {
            document.dispatchEvent(new Event("hako-af:read-list"));
            const current = readTarget(anchor);
            if (current?.id) assign(current);
          });
          open.setAttribute("aria-haspopup", "dialog");
          panel.append(open, node("span", "training-detail-route"));
          anchor.append(panel);
        }
        const binding = bindings.find(item => item.monsterId === target.id);
        const route = binding && routes.find(item => item.id === binding.routeId);
        const label = panel.lastElementChild;
        const text = route ? `設定中　${route.name}` : "";
        if (label.textContent !== text) label.textContent = text;
      }
    }

    return { open: () => open(load().routes[0]), openMember, update, scan };
  }

  globalThis.hakoAfTrainingRoutes = { start };
})();
