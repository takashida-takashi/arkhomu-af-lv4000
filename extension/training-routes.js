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

  function start(node, enabled, requestScan) {
    let dialog, lastSent, watchingMatings;
    const progressData = new WeakMap();
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
          data.bindings.push({ monsterId: result.child, routeId: inherited.values().next().value });
        }
      }
      data.mothers = [...new Set(data.mothers.filter(id => !parents.has(id)).concat(wasMother ? [result.child] : []))];
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
        input.addEventListener("input", () => {
          refresh();
          refreshTransfers();
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
          if (next[key].length > limit && next[key].length > current.length) {
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
      form.append(transfers, fields, controls, status);

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
        transfers.hidden = !currentId;
        refreshTransfers(true);
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

    function readSharedUnique(member, source) {
      if (member.rank6Unique || !source) return Promise.resolve(member.rank6Unique);
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          source.removeEventListener("hako-af:training-unique", receive);
          resolve("");
        }, 2500);
        function receive(event) {
          clearTimeout(timer);
          resolve(typeof event.detail === "string" ? event.detail : "");
        }
        source.addEventListener("hako-af:training-unique", receive, { once: true });
        source.dispatchEvent(new CustomEvent("hako-af:read-training-unique", { bubbles: true,
          detail: JSON.stringify({ name: member.name, portrait: member.portrait }) }));
      });
    }

    async function openMember(member, slot, party, source) {
      const unique = nameKey(await readSharedUnique(member, source) ?? "");
      if (source && !source.getClientRects().length) return;
      const entries = [...member.active, ...member.passive];
      open({ name: slot == null ? member.name : `${party} ${slot}枠目 ${member.name}`.slice(0, 120),
        ordinary: entries.filter(skill => !skill.permanent && nameKey(skill.name) !== unique).map(skill => skill.name),
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
      title.textContent = ordinary.length || permanent.length ? `不足　通常 ${ordinary.length}件・永久 ${permanent.length}件` : "育成ルート達成";
      if (!ordinary.length && !permanent.length) {
        body.append(node("p", "extra-note", "育成ルートに必要なスキルがそろっています。"));
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
        if (!target?.id || !anchor.getClientRects().length) continue;
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
          const mother = button("世代上げ母体に指定", () => {
            const current = readTarget(anchor);
            if (!current?.id || !enabled()) return;
            const data = load();
            data.mothers = data.mothers.includes(current.id) ? data.mothers.filter(id => id !== current.id) : [...data.mothers, current.id];
            persist(data);
          });
          mother.dataset.ha4 = "training-mother";
          panel.append(loadButton, edit, mother, node("span", "training-detail-route"));
          anchor.append(panel);
        }
        const binding = bindings.find(item => item.monsterId === target.id);
        const route = binding && routes.find(item => item.id === binding.routeId);
        const edit = panel.querySelector('[data-ha4="training-edit-target"]');
        edit.hidden = !route;
        const mother = panel.querySelector('[data-ha4="training-mother"]');
        const designated = mothers.includes(target.id);
        const motherText = designated ? "世代上げ母体の指定を解除" : "世代上げ母体に指定";
        if (mother.textContent !== motherText) mother.textContent = motherText;
        if (mother.getAttribute("aria-pressed") !== String(designated)) mother.setAttribute("aria-pressed", String(designated));
        const label = panel.querySelector('[data-ha4="training-detail-route"]');
        const text = route ? `設定中　${route.name}` : "";
        if (label.textContent !== text) label.textContent = text;
        renderProgress(panel, anchor, target, route);
      }
    }

    return { open: () => open(load().routes[0]), openMember, update, scan };
  }

  globalThis.hakoAfTrainingRoutes = { start };
})();
