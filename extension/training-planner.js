(() => {
  "use strict";

  const title = globalThis.hakoAfFeatureNames.trainingPlanner;
  const identity = globalThis.hakoAfSkillIdentity;
  const createPreview = globalThis.hakoAfTrainingPreview;
  const hash = "#ha4-training-planner";
  const otherLabels = ".home-facility-menu .facility-band-tile, section.order-2 .custom-scrollbar h4";
  const facilityStyle = "btn-3d btn-3d-soft relative rounded border bg-background border-gray-700 hover:border-primary hover:bg-primary/10 transition-all text-left";
  const launchSelector = '[data-ha4="training-planner-launch"]';
  const collator = new Intl.Collator("ja", { numeric: true });
  const key = text => text.normalize("NFKC").trim().toLowerCase();
  const skillKey = name => key(name).replace(/\s+/g, " ");
  const isRank6Passive = skill => skill?.unique === "rank6" && skill.passive;
  const batchSize = 60;
  const requests = new Set();
  const explanations = new Map();
  const explanationErrors = new Map();
  const explanationKey = (id, level = 1) => `${id}@${level}`;

  function monsterPicker({ node, button, field, choose, leave, retry }) {
    const root = node("section", "planner-monster-picker");
    const header = node("div", "planner-picker-header");
    const actions = node("div", "planner-toolbar");
    actions.append(button("スキル選択へ", leave));
    header.append(node("h3", "planner-section-title", "育成するホムンクルス"), actions);
    const filters = node("div", "planner-monster-filters");
    const status = field("select", "図鑑の登録状態");
    const rank = field("select", "ランク");
    const race = field("select", "種族");
    const category = field("select", "カテゴリ");
    const sort = field("select", "ホムンクルスの並び順");
    const query = field("input", "ホムンクルス名で検索");
    query.type = "search";
    const recent = node("input", "planner-monster-new");
    recent.type = "checkbox";
    const recentLabel = node("label", "planner-monster-new-label");
    recentLabel.title = "追加から14日以内のホムンクルス";
    recentLabel.append(recent, "新規のみ");
    status.append(new Option("すべて", ""), new Option("仲間済み", "owned"),
      new Option("遭遇のみ", "encountered"), new Option("未遭遇", "unknown"));
    sort.append(new Option("五十音順", "name"), new Option("ランク順", "rank"), new Option("追加日の新しい順", "new"));
    const filterSelects = [status, rank, race, category, sort];
    const resetFilters = button("条件をリセット", reset);
    filters.append(...filterSelects, recentLabel, resetFilters);
    const message = node("p", "planner-hint", "図鑑データを読み込み中…");
    message.setAttribute("role", "status");
    const reload = button("再読み込み", () => {
      reload.hidden = true;
      message.textContent = "図鑑データを読み込み中…";
      retry();
    });
    reload.hidden = true;
    const viewport = node("div", "planner-monster-scroll");
    viewport.tabIndex = 0;
    const grid = node("ul", "planner-monster-grid");
    grid.setAttribute("aria-label", "育成ホムンクルスの候補");
    viewport.append(grid);
    root.append(header, filters, query, message, reload, viewport);
    let catalog, selected, matches = [], rendered = 0;
    const date = new Date();
    date.setDate(date.getDate() - 13);
    const recentCutoff = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(n => String(n).padStart(2, "0")).join("-");
    const recentEntry = monster => !!monster.added && monster.added >= recentCutoff;
    const monsterKey = text => key(text).replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 96));

    function card(monster) {
      const row = node("li", "planner-monster-item");
      const option = button("", () => choose(monster), "planner-monster-option");
      option.dataset.monsterId = monster.id;
      option.setAttribute("aria-pressed", String(monster.id === selected));
      const art = node("span", "planner-monster-art");
      if (monster.image) {
        const image = node("img", "planner-monster-image");
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => image.remove(), { once: true });
        image.src = `/images/monsters/${encodeURIComponent(monster.image)}.png`;
        art.append(image);
      }
      if (monster.otherRank || monster.rank) {
        art.append(node("span", "planner-monster-rank", monster.otherRank ? "その他" : `Rank ${monster.rank}`));
      }
      if (recentEntry(monster)) art.append(node("span", "planner-monster-new-tag", "新規"));
      option.append(art, node("span", "planner-monster-name", monster.name));
      row.append(option);
      return row;
    }

    function append() {
      const next = matches.slice(rendered, rendered + 48);
      grid.append(...next.map(card));
      rendered += next.length;
    }

    function render() {
      if (!catalog) return;
      const terms = monsterKey(query.value).split(/\s+/).filter(Boolean);
      matches = catalog.monsters.filter(monster =>
        (!status.value || monster.registration === status.value) &&
        (!rank.value || (rank.value === "other" ? monster.otherRank : !monster.otherRank && String(monster.rank) === rank.value)) &&
        (!race.value || monster.races.includes(race.value)) &&
        (!category.value || monster.categories.includes(category.value)) &&
        (!recent.checked || recentEntry(monster)) &&
        terms.every(term => monster.searchName.includes(term)));
      if (sort.value === "rank") matches.sort((a, b) => Number(!b.otherRank && b.rank) - Number(!a.otherRank && a.rank));
      if (sort.value === "new") matches.sort((a, b) => b.added.localeCompare(a.added));
      message.textContent = matches.length ? `${matches.length.toLocaleString("ja-JP")}種` : "条件に一致するホムンクルスがいません。";
      resetFilters.disabled = !query.value && filterSelects.slice(0, -1).every(select => !select.value) &&
        sort.value === "name" && !recent.checked;
      rendered = 0;
      grid.replaceChildren();
      viewport.scrollTop = 0;
      append();
    }

    function reset() {
      for (const select of filterSelects) select.selectedIndex = 0;
      query.value = "";
      recent.checked = false;
      render();
    }

    function options(select, none, values) {
      const previous = select.value;
      select.replaceChildren(new Option(none, ""), ...values.map(([value, label]) => new Option(label, value)));
      if (values.some(([value]) => value === previous)) select.value = previous;
    }

    function setCatalog(data) {
      if (!data) {
        reload.hidden = false;
        message.textContent = "図鑑データを読み込めませんでした。図鑑を開いてから再読み込みしてください。";
        return;
      }
      catalog = data;
      status.disabled = !data.hasRegistration;
      if (status.disabled) status.value = "";
      const ranks = new Set(), races = new Set(), categories = new Set();
      for (const monster of data.monsters) {
        monster.searchName = monsterKey(monster.name);
        if (monster.otherRank) ranks.add("other");
        else if (monster.rank) ranks.add(String(monster.rank));
        for (const id of monster.races) races.add(id);
        for (const id of monster.categories) categories.add(id);
      }
      options(rank, "全ランク", [...ranks].sort(collator.compare).map(value => [value, value === "other" ? "その他" : `Rank ${value}`]));
      const labeled = (set, labels) => [...set].map(id => [id, labels?.[id] || id]).sort((a, b) => collator.compare(a[1], b[1]));
      options(race, "全種族", labeled(races, data.raceLabels));
      options(category, "全カテゴリ", labeled(categories, data.categoryLabels));
      reload.hidden = true;
      render();
    }

    function setSelected(monster) {
      selected = monster?.id;
      for (const card of grid.querySelectorAll("[data-monster-id]")) {
        card.setAttribute("aria-pressed", String(card.dataset.monsterId === selected));
      }
    }

    for (const select of [...filterSelects, recent]) select.addEventListener("change", render);
    query.addEventListener("input", render);
    viewport.addEventListener("scroll", () => {
      if (rendered < matches.length && viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 220) append();
    }, { passive: true });
    return { root, reset, setCatalog, setSelected, focus: () =>
      (matchMedia("(hover: hover) and (pointer: fine)").matches ? query : viewport).focus({ preventScroll: true }) };
  }

  function start(node, enabled, routes) {
    if (!routes) return;
    const { groups } = routes;
    const groupKeys = Object.keys(groups);
    let catalog, dialog, renderCatalog, resetOnReopen, timeout, previousHash = "";
    const picked = { ordinary: [], permanent: [] };

    function button(label, action, kind = "planner-button") {
      const control = node("button", kind, label);
      control.type = "button";
      control.addEventListener("click", action);
      return control;
    }

    function readCatalog() {
      clearTimeout(timeout);
      timeout = setTimeout(() => renderCatalog?.(), 2500);
      document.dispatchEvent(new Event("hako-af:read-training-planner"));
    }

    document.addEventListener("hako-af:training-planner-data", event => {
      if (!dialog?.open || typeof event.detail !== "string") return;
      clearTimeout(timeout);
      if (event.detail) {
        let data;
        try { data = JSON.parse(event.detail); } catch { renderCatalog?.(); return; }
        if (!Array.isArray(data?.skills) || !Array.isArray(data.monsters)) return;
        const byName = (a, b) => collator.compare(a.name, b.name);
        catalog = { ...data, monsters: data.monsters.sort(byName), skills: data.skills.sort(byName) };
        for (const skill of catalog.skills) {
          skill.searchText = key([skill.name, skill.id, skill.description, skill.searchEffects].filter(Boolean).join("\n"));
          skill.tagSearchText = key((skill.tags ?? []).flatMap(id => [id, data.skillTagLabels?.[id]]).filter(Boolean).join("\n"));
          skill.recentDate = skill.updated > skill.added ? skill.updated : skill.added;
          if (skill.searchEffects) explanations.set(explanationKey(skill.id), skill.searchEffects.split("\n"));
        }
        catalog.byId = new Map(catalog.skills.map(skill => [skill.id, skill]));
        catalog.byName = new Map();
        for (const skill of catalog.skills) {
          const name = skillKey(skill.name);
          catalog.byName.set(name, catalog.byName.has(name) ? null : skill);
          catalog.byName.set(skillKey(identity.typed(skill.name, skill.passive ? "passive" : "skill")), skill);
        }
      }
      renderCatalog?.();
    });

    document.addEventListener("hako-af:training-description", event => {
      if (typeof event.detail !== "string") return;
      try {
        const { id, level = 1, effects, loaded, message } = JSON.parse(event.detail);
        const ref = explanationKey(id, level);
        if (!requests.has(ref) || !Array.isArray(effects)) return;
        requests.delete(ref);
        if (loaded !== false) {
          explanations.set(ref, effects);
          explanationErrors.delete(ref);
        } else explanationErrors.set(ref, message);
        if (dialog?.open) dialog.dispatchEvent(new Event("ha4-refresh-description"));
      } catch { /* Ignore invalid descriptions. */ }
    });

    function open() {
      if (dialog?.open || !enabled()) return;
      if (dialog) {
        resetOnReopen();
        dialog.showModal();
        if (!catalog) readCatalog();
        return;
      }
      dialog = node("dialog", "training-planner");
      dialog.setAttribute("aria-label", title);
      dialog.addEventListener("close", () => {
        if (location.hash === hash) history.replaceState(history.state, "", previousHash || location.pathname + location.search);
        previousHash = "";
      });
      const head = node("header", "planner-header");
      const headerActions = node("div", "planner-toolbar");
      const back = button("ルート選択へ", () => showScreen("start"));
      headerActions.append(back, button("閉じる", () => dialog.close()));
      head.append(node("h2", "planner-heading", title), headerActions);
      const body = node("div", "planner-layout");
      const left = node("div", "planner-column");
      const right = node("section", "planner-column");
      const base = node("section", "planner-card");
      const field = (tag, placeholder) => {
        const control = node(tag, "planner-field");
        control.setAttribute("aria-label", placeholder);
        if (tag === "input") control.placeholder = placeholder;
        return control;
      };
      const menu = node("section", "planner-route-menu");
      const menuActions = node("div", "planner-menu-actions");
      const newRoute = button("新規作成", () => openDraft(), "planner-primary");
      const editRoute = button("保存済みルートを編集", () => showSavedRoutes(true));
      const resume = button("編集中のルートに戻る", () => showScreen(draftScreen));
      const savedPanel = node("section", "planner-saved-panel");
      savedPanel.id = "ha4-planner-saved-routes";
      editRoute.setAttribute("aria-controls", savedPanel.id);
      const searchRoute = field("input", "ルート名・グループ名で検索");
      searchRoute.type = "search";
      const routeList = node("div", "planner-saved-list");
      const routeMessage = node("p", "planner-hint");
      routeMessage.setAttribute("role", "status");
      menuActions.append(newRoute, editRoute, resume);
      savedPanel.append(searchRoute, routeList);
      menu.append(node("h3", "planner-section-title", "育成ルート"), menuActions, routeMessage, savedPanel);
      const changeMonster = button("ホムンクルスを選ぶ", () => showScreen("picker"));
      const picker = monsterPicker({ node, button, field, retry: readCatalog, leave: () => showScreen("editor"),
        choose: choice => {
          if (baseMonsterId !== choice.id) {
            baseMonsterId = choice.id;
            monster = choice;
            syncRank6Passive();
            innateExpanded = true;
            resetStatus();
            picker.setSelected(monster);
            filterSkills();
            render();
          }
          showScreen("editor");
        } });
      const baseStatus = node("div", "planner-base");
      const innateList = node("div", "planner-innate");
      const baseHead = node("div", "planner-plan-head");
      baseHead.append(node("h3", "planner-section-title", "育成するホムンクルス"), changeMonster);
      base.append(baseHead, baseStatus, innateList);
      const library = node("section", "planner-card");
      const skillQuery = field("input", "名前・ID・効果で検索");
      skillQuery.type = "search";
      const tagQuery = field("input", "タグで検索（例：炎 魔法）");
      tagQuery.type = "search";
      const tagSuggestions = node("datalist", "planner-tag-suggestions");
      tagSuggestions.id = "ha4-planner-skill-tags";
      tagQuery.setAttribute("list", tagSuggestions.id);
      const skillType = field("select", "スキルの種類");
      skillType.append(new Option("すべて", ""), new Option("アクティブ", "s"), new Option("パッシブ", "p"));
      const skillCategory = field("select", "スキルのカテゴリ");
      const skillUnique = field("select", "固有スキルの絞り込み");
      skillUnique.append(new Option("固有：すべて", ""), new Option("固有のみ", "unique"), new Option("継承可能のみ", "inheritable"));
      const skillFilters = node("div", "planner-filters");
      const searchLabel = (text, input) => {
        const label = node("label", "planner-search-label");
        label.append(text, input);
        return label;
      };
      skillFilters.append(searchLabel("スキル検索", skillQuery), searchLabel("タグ検索", tagQuery));
      const skillOptions = node("div", "planner-skill-options");
      const recent = node("input", "planner-skill-checkbox");
      recent.type = "checkbox";
      const recentLabel = node("label", "planner-search-toggle");
      recentLabel.title = "図鑑と同じ、追加・更新から7日以内のスキル";
      recentLabel.append(recent, "新規のみ");
      const leveled = node("input", "planner-skill-checkbox");
      leveled.type = "checkbox";
      const leveledLabel = node("label", "planner-search-toggle");
      leveledLabel.append(leveled, "スキルレベルあり");
      const resetSkillFilters = button("条件をリセット", () => {
        skillQuery.value = tagQuery.value = skillType.value = skillCategory.value = skillUnique.value = "";
        recent.checked = leveled.checked = false;
        filterSkills();
      });
      skillOptions.append(skillType, skillCategory, skillUnique, recentLabel, leveledLabel, resetSkillFilters);
      const searchHint = node("p", "planner-hint", "複数の語はスペースで区切ると、すべてを含むスキルに絞り込みます。カテゴリなどの条件も同時に使えます。");
      const list = node("ul", "planner-skill-list");
      list.tabIndex = 0;
      list.setAttribute("aria-label", "追加候補のスキル");
      const target = node("div", "planner-toolbar");
      target.setAttribute("role", "group");
      target.setAttribute("aria-label", "選んだスキルの追加先");
      const targetButtons = new Map(groupKeys.map(group => [group, button(groups[group][0], () => {
        destination = group;
        filterSkills();
        render();
      })]));
      target.append("追加先", ...targetButtons.values());
      const retry = button("再読み込み", () => {
        retry.hidden = true;
        readCatalog();
      });
      const loadStatus = node("p", "planner-hint");
      loadStatus.setAttribute("role", "status");
      const levelStatus = node("p", "planner-hint");
      const levelGuide = node("a", "planner-action", "本体のスキルLv対象一覧を開く");
      levelGuide.href = "/skill-level-notice";
      levelGuide.target = "_blank";
      levelGuide.rel = "noopener";
      levelStatus.append(levelGuide);
      levelStatus.hidden = true;
      let levelTargets = new Set();
      let levelAdded = {};
      document.addEventListener("hako-af:planner-level-targets", event => {
        if (!dialog.open || typeof event.detail !== "string") return;
        let data;
        try { data = JSON.parse(event.detail); } catch { return; }
        if (!Array.isArray(data?.ids)) return;
        const { ids, loaded } = data;
        levelTargets = new Set(ids);
        levelAdded = data.added ?? {};
        levelStatus.hidden = loaded === true;
        for (const mark of dialog.querySelectorAll('[data-ha4="planner-level-mark"]')) {
          mark.hidden = !levelTargets.has(mark.dataset.skillRef);
        }
        if (leveled.checked || recent.checked) filterSkills();
      });
      const taxonomyStatus = node("p", "planner-hint", "タグ・カテゴリ名を取得できませんでした。「再読み込み」で再取得できます。");
      taxonomyStatus.hidden = true;
      library.append(node("h3", "planner-section-title", "スキルを選ぶ"), target, skillFilters, skillOptions, searchHint,
        loadStatus, taxonomyStatus, levelStatus, retry, tagSuggestions, list);
      const routeName = field("input", "ルート名");
      routeName.maxLength = 120;
      const routeGroup = field("input", "グループ名（任意）");
      const groupList = node("datalist", "training-group-list");
      routes.groupInput(routeGroup, groupList);
      const rank6Panel = node("section", "planner-rank6");
      const plan = node("div", "planner-plan");
      const footer = node("footer", "planner-footer");
      const status = node("span", "planner-status");
      status.setAttribute("role", "status");
      const savedRoute = button("保存したルートを開く", () => {
        dialog.close();
        routes.open(currentId);
      });
      const save = button("拡張育成ルートに保存", () => {
        const draft = routeDraft();
        draft.name ||= monster?.name ?? "";
        const result = routes.saveRoute(draft, status);
        if (!result) return;
        currentId = result.id;
        routeName.value = result.name;
        routeGroup.value = result.group;
        cleanDraft = JSON.stringify(routeDraft());
        save.textContent = "変更を保存";
        status.textContent = `「${result.name}」を保存しました。`;
        savedRoute.hidden = false;
      }, "planner-primary");
      footer.append(status, savedRoute, save);
      left.append(base, library);
      right.append(node("h3", "planner-section-title", "育成ルート"), routeName, routeGroup, groupList, rank6Panel, plan);
      right.dataset.ha4 = "planner-route";
      body.append(left, right);
      const tooltip = node("div", "planner-tooltip");
      tooltip.id = "ha4-planner-skill-description";
      tooltip.setAttribute("role", "tooltip");
      tooltip.hidden = true;
      dialog.append(head, menu, picker.root, body, footer, tooltip);
      document.body.append(dialog);
      let destination = "ordinary";
      let matches = [];
      let rendered = 0;
      let tooltipAnchor, tooltipTimer, tooltipLevel = 1;
      let pinned = false;
      let monster, baseMonsterId, currentId, rank6Passive = null, reservedNames;
      let draftScreen, cleanDraft;
      let innateExpanded = true;
      const preview = createPreview?.({ node, button,
        getDraft: () => ({ ...routeDraft(), species: baseMonsterId, monster }),
        getRoutes: () => routes.groupedRoutes().flatMap(([, entries]) => entries),
        onPreviewChange: resetStatus,
        resolveSkill: (value, label) => label ? catalog?.byId.get(value)?.name : catalog?.byName.get(skillKey(value))?.id,
        resolveAptitude: key => catalog?.aptitudeLabels?.[key] });
      if (preview) right.insertBefore(preview.root, plan);

      function routeDraft() {
        const draft = { id: currentId, baseMonsterId, rank6Passive, name: routeName.value, group: routeGroup.value,
          preview: preview?.getValues(), previewSkillIds: {} };
        for (const group of groupKeys) for (const skill of picked[group]) {
          if (skill.id) draft.previewSkillIds[routeSkillName(skill)] = skill.id;
        }
        for (const group of groupKeys) draft[group] = picked[group].map(routeSkillName);
        if (reservedNames) draft.reserved = [...new Set([...draft.ordinary, ...draft.permanent])]
          .filter(name => reservedNames.has(skillKey(name)) || reservedNames.has(skillKey(identity.parse(name).name)));
        return draft;
      }

      function hasUnsavedChanges() {
        return !!draftScreen && JSON.stringify(routeDraft()) !== cleanDraft;
      }

      function attachSkill(name, id) {
        const skill = catalog?.byId.get(id) ?? catalog?.byName.get(skillKey(name));
        return { name: skill?.name ?? name, id: skill?.id, unique: skill?.unique, passive: skill?.passive };
      }

      function routeSkillName(skill) { return skill.id ? identity.typed(skill.name, skill.passive ? "passive" : "skill") : skill.name; }
      const isReserved = skill => !!reservedNames && (reservedNames.has(skillKey(routeSkillName(skill))) || reservedNames.has(skillKey(skill.name)));

      function setRank6Passive(skill) {
        const id = skill.id.slice(2);
        const enabled = skill.canDisable && rank6Passive?.id === id ? rank6Passive.enabled : true;
        rank6Passive = { id, name: skill.name, enabled };
        picked.ordinary = picked.ordinary.filter(item => item.id ? item.id !== skill.id : skillKey(item.name) !== skillKey(skill.name));
      }

      function syncRank6Passive() {
        if (!catalog) return;
        const legacy = picked.ordinary.filter(isRank6Passive);
        const id = monster ? monster.rank6PassiveId :
          rank6Passive ? `p.${rank6Passive.id}` : legacy.length === 1 ? legacy[0].id : undefined;
        const skill = catalog.byId.get(id);
        if (isRank6Passive(skill)) setRank6Passive(skill);
        else if (monster && !id) rank6Passive = null;
      }

      function openDraft(id) {
        if (id && id === currentId && hasUnsavedChanges()) return showScreen("editor");
        const saved = id && routes.groupedRoutes().flatMap(([, entries]) => entries).find(route => route.id === id);
        if (id && !saved) {
          renderSavedRoutes("この育成ルートは削除されています。");
          return;
        }
        if (hasUnsavedChanges() && !window.confirm("保存していない変更を破棄しますか？")) return;
        currentId = saved?.id;
        reservedNames = Array.isArray(saved?.reserved) ? new Set(saved.reserved.map(skillKey)) : saved ? undefined : new Set();
        baseMonsterId = typeof saved?.baseMonsterId === "string" ? saved.baseMonsterId : "";
        monster = catalog?.monsters.find(item => item.id === baseMonsterId);
        const savedRank6 = saved?.rank6Passive;
        rank6Passive = typeof savedRank6?.id === "string" && typeof savedRank6.name === "string" &&
          typeof savedRank6.enabled === "boolean" ? savedRank6 : null;
        routeName.value = saved?.name ?? "";
        routeGroup.value = typeof saved?.group === "string" ? saved.group : "";
        destination = "ordinary";
        innateExpanded = true;
        for (const group of groupKeys) picked[group] = (saved?.[group] ?? []).map(name =>
          attachSkill(name, saved?.previewSkillIds?.[name]));
        syncRank6Passive();
        picker.setSelected(monster);
        picker.reset();
        resetStatus();
        preview?.load(saved?.preview);
        cleanDraft = JSON.stringify(routeDraft());
        filterSkills();
        render();
        showScreen(id ? "editor" : "picker");
      }

      function renderSavedRoutes(override) {
        const grouped = routes.groupedRoutes();
        editRoute.disabled = !grouped.length;
        const terms = key(searchRoute.value).split(/\s+/).filter(Boolean);
        const visible = grouped.map(([name, entries]) => [name || "グループなし", entries]).map(([label, entries]) =>
          [label, entries.filter(route => terms.every(term => key(route.name).includes(term) || key(label).includes(term)))])
          .filter(([, entries]) => entries.length);
        routeList.replaceChildren(...visible.map(([name, entries]) => {
          const section = node("section", "planner-saved-group");
          const rows = node("ul", "planner-saved-rows");
          rows.append(...entries.map(route => {
            const row = node("li", "planner-saved-row");
            const choice = button(route.name, () => openDraft(route.id), "planner-saved-choice");
            const rank6Status = route.rank6Passive ? `・R6 ${route.rank6Passive.enabled ? "ON" : "OFF"}` : "";
            const details = node("span", "planner-saved-count", `通常 ${route.ordinary.length}・永久 ${route.permanent.length}${rank6Status}`);
            choice.append(details);
            row.append(choice);
            return row;
          }));
          section.append(node("h4", "planner-section-title", name), rows);
          return section;
        }));
        routeMessage.textContent = typeof override === "string" ? override : !grouped.length ? "保存済みルートがありません。" :
          !savedPanel.hidden && !visible.length ? "条件に一致するルートがありません。" : "";
      }

      function showSavedRoutes(show) {
        savedPanel.hidden = !show;
        editRoute.setAttribute("aria-expanded", String(show));
        if (!show) searchRoute.value = "";
        renderSavedRoutes();
        if (show) searchRoute.focus({ preventScroll: true });
      }

      searchRoute.addEventListener("input", renderSavedRoutes);

      function resetStatus() {
        savedRoute.hidden = true;
        status.textContent = "";
      }

      function duplicate(group, skill) {
        return picked[group].some(item => item.id && skill.id ? item.id === skill.id : skillKey(item.name) === skillKey(skill.name));
      }

      const isInnate = skill => monster?.innate.some(([id]) => id === skill.id);

      function canAdd(group, skill) {
        const allowed = !skill.unique || group === "ordinary" && !isRank6Passive(skill) && isInnate(skill);
        const used = picked[group].filter(item => !isReserved(item)).length;
        return allowed && !duplicate(group, skill) &&
          (isReserved(skill) || used < groups[group][1]);
      }

      function add(group, skill) {
        if (!canAdd(group, skill)) return;
        picked[group].push(skill);
        resetStatus();
        render();
      }

      function nameButton(skill) {
        if (!skill.id) {
          const caption = node("span", "planner-saved-skill-name", skill.name);
          if (catalog) caption.title = "図鑑のスキル名と照合できませんでした。";
          return caption;
        }
        const name = node("button", "planner-skill-name", skill.name);
        name.type = "button";
        name.dataset.skillId = skill.id;
        return name;
      }

      function hideTooltip() {
        clearTimeout(tooltipTimer);
        tooltipAnchor?.removeAttribute("aria-describedby");
        tooltipAnchor = undefined;
        tooltip.hidden = true;
        pinned = false;
      }

      function positionTooltip() {
        const box = dialog.getBoundingClientRect();
        const anchor = tooltipAnchor.getBoundingClientRect();
        const x = Math.max(box.left + 8, Math.min(anchor.left, box.right - tooltip.offsetWidth - 8));
        const below = anchor.bottom + 6;
        const y = below + tooltip.offsetHeight <= box.bottom - 8 ? below :
          Math.max(box.top + 8, anchor.top - tooltip.offsetHeight - 6);
        Object.assign(tooltip.style, { left: `${x}px`, top: `${y}px` });
      }

      function renderTooltip() {
        if (!tooltipAnchor?.isConnected) return hideTooltip();
        const id = tooltipAnchor.dataset.skillId;
        const skill = catalog.byId.get(id);
        const ref = explanationKey(id, tooltipLevel);
        const effects = explanations.get(ref);
        const heading = `${skill.name}${levelTargets.has(id) || tooltipLevel > 1 ? ` Lv${tooltipLevel}` : ""}`;
        tooltip.replaceChildren(node("strong", "planner-tooltip-name", heading));
        if (skill.description && tooltipLevel === 1) tooltip.append(node("p", "planner-tooltip-description", skill.description));
        tooltip.append(node("strong", "planner-tooltip-effects-title", "効果"));
        tooltip.append(node("div", "planner-tooltip-description", effects?.length ? effects.join("\n") :
          effects ? "図鑑に追加の効果表記はありません。" : explanationErrors.get(ref) || "効果の詳細を読み込み中…"));
        tooltip.hidden = false;
        positionTooltip();
      }

      function showTooltip(anchor, pin = false) {
        if (!anchor || pinned && !pin) return;
        if (pin && pinned && anchor === tooltipAnchor) return hideTooltip();
        hideTooltip();
        tooltipAnchor = anchor;
        const id = anchor.dataset.skillId;
        tooltipLevel = anchor.closest('[data-ha4="planner-route"]') ? Number(preview?.getValues()?.skillLevels?.[id]) || 1 : 1;
        pinned = pin;
        anchor.setAttribute("aria-describedby", tooltip.id);
        renderTooltip();
        const level = tooltipLevel;
        const ref = explanationKey(id, level);
        if (!requests.has(ref) && !explanations.has(ref)) tooltipTimer = setTimeout(() => {
          requests.add(ref);
          document.dispatchEvent(new CustomEvent("hako-af:read-training-description", { detail: JSON.stringify({ id, level }) }));
        }, pin ? 0 : 180);
      }

      dialog.addEventListener("ha4-refresh-description", () => {
        if (tooltipAnchor) renderTooltip();
      });
      const skillName = target => target instanceof Element ? target.closest('[data-ha4="planner-skill-name"]') : null;
      dialog.addEventListener("pointerover", event => {
        const anchor = skillName(event.target);
        if (event.pointerType === "mouse" && anchor !== tooltipAnchor) showTooltip(anchor);
      });
      dialog.addEventListener("pointerout", event => {
        if (!pinned && tooltipAnchor && event.pointerType === "mouse" && skillName(event.target) === tooltipAnchor &&
          ![tooltipAnchor, tooltip].some(el => el.contains(event.relatedTarget))) hideTooltip();
      });
      tooltip.addEventListener("pointerleave", () => { if (!pinned) hideTooltip(); });
      dialog.addEventListener("focusin", event => {
        const anchor = skillName(event.target);
        if (anchor && anchor.matches(":focus-visible")) showTooltip(anchor);
      });
      dialog.addEventListener("focusout", event => {
        if (!pinned && event.target === tooltipAnchor && !tooltip.contains(event.relatedTarget)) hideTooltip();
      });
      dialog.addEventListener("click", event => {
        const anchor = skillName(event.target);
        if (anchor) showTooltip(anchor, true);
        else if (!tooltip.contains(event.target)) hideTooltip();
      });
      dialog.addEventListener("scroll", event => { if (!tooltip.contains(event.target)) hideTooltip(); }, true);
      dialog.addEventListener("change", event => {
        if (event.target.matches('[data-ha4="planner-skill-level-select"]')) hideTooltip();
      });
      dialog.addEventListener("keydown", event => {
        if (event.key === "Escape" && !tooltip.hidden) {
          event.preventDefault();
          hideTooltip();
        }
      });
      dialog.addEventListener("close", hideTooltip);

      function specialMark(skill) {
        const mark = node("small", "planner-special", skill.unique === "rank6" ? "Rank 6 固有" : "固有");
        mark.title = isRank6Passive(skill) ? "Rank 6で習得する枠外のパッシブです。" : "通常スキルの習得目標として追加できます。";
        mark.dataset.rank6 = String(skill.unique === "rank6");
        return mark;
      }

      const destinationFor = skill => skill.unique ? "ordinary" : destination;

      function skillRow(skill, level) {
        const row = node("li", "planner-skill");
        const text = nameButton(skill);
        const kind = node("small", "planner-type", (skill.passive ? "パッシブ" : "アクティブ") + (level > 0 ? `・習得 Lv${level}` : ""));
        kind.dataset.passive = String(skill.passive);
        row.append(text, kind);
        if (skill.unique) row.append(specialMark(skill));
        const levelMark = node("small", "planner-level-mark", "スキルLvあり");
        levelMark.hidden = !levelTargets.has(skill.id);
        levelMark.dataset.skillRef = skill.id;
        row.append(levelMark);
        const addButton = button("追加", () => add(destinationFor(skill), skill));
        addButton.dataset.plannerAdd = skill.id;
        updateAddButton(addButton, skill);
        row.append(addButton);
        return row;
      }

      function updateAddButton(button, skill) {
        if (isRank6Passive(skill)) {
          button.textContent = "自動追加済";
          button.disabled = true;
          button.setAttribute("aria-label", `${skill.name}はRank 6枠外に自動追加済み`);
          return;
        }
        const group = destinationFor(skill);
        const exists = duplicate(group, skill);
        button.textContent = exists ? "追加済" : group !== destination ? "通常に追加" : "追加";
        button.disabled = !canAdd(group, skill);
        button.setAttribute("aria-label", `${skill.name}を${groups[group][0]}に追加`);
      }

      function renderRank6Passive() {
        rank6Panel.hidden = !rank6Passive;
        rank6Panel.replaceChildren();
        if (!rank6Passive) return;
        const skill = catalog?.byId.get(`p.${rank6Passive.id}`);
        const row = node("div", "planner-skill");
        row.append(nameButton({ name: rank6Passive.name, id: skill?.id }), node("small", "planner-special", "枠消費なし"));
        if (skill && preview) row.append(preview.skillLevelField(skill));
        if (!baseMonsterId) {
          row.append(button("外す", () => {
            rank6Passive = null;
            resetStatus();
            render();
          }));
        }
        const toggle = node("div", "planner-toolbar");
        toggle.setAttribute("role", "group");
        toggle.setAttribute("aria-label", "Rank 6固有パッシブの発動設定");
        if (skill?.canDisable) {
          const controls = [true, false].map(enabled => button(enabled ? "ON" : "OFF", () => {
            if (rank6Passive.enabled === enabled) return;
            rank6Passive = { ...rank6Passive, enabled };
            updatePressed();
            resetStatus();
            preview?.refresh();
          }));
          const updatePressed = () => controls.forEach((control, index) =>
            control.setAttribute("aria-pressed", String(rank6Passive.enabled === (index === 0))));
          updatePressed();
          toggle.append(...controls);
        } else {
          toggle.append(node("span", "planner-hint", skill ? "常時ON（OFF不可）" :
            `${rank6Passive.enabled ? "ON" : "OFF"}（切り替え可否未確認）`));
        }
        rank6Panel.append(node("h4", "planner-section-title", "Rank 6固有パッシブ"), row, toggle);
      }

      function appendSkills() {
        const next = matches.slice(rendered, rendered + batchSize);
        list.append(...next.map(skill => skillRow(skill)));
        rendered += next.length;
      }

      list.addEventListener("scroll", () => {
        if (rendered < matches.length && list.scrollHeight - list.scrollTop - list.clientHeight < 160) appendSkills();
      }, { passive: true });

      function filterSkills() {
        hideTooltip();
        const terms = key(skillQuery.value).split(/\s+/).filter(Boolean);
        const tagTerms = key(tagQuery.value).split(/\s+/).filter(Boolean);
        const date = new Date();
        date.setDate(date.getDate() - 6);
        const cutoff = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(n => String(n).padStart(2, "0")).join("-");
        matches = catalog?.skills.filter(skill => (!skill.unique || destination === "ordinary" && isInnate(skill)) &&
          (!skillType.value || skill.id.startsWith(skillType.value + ".")) &&
          (!skillCategory.value || skill.categories?.includes(skillCategory.value)) &&
          (!skillUnique.value || (skillUnique.value === "unique") === !!skill.unique) &&
          (!recent.checked || !!skill.recentDate && skill.recentDate >= cutoff || !!levelAdded[skill.id] && levelAdded[skill.id] >= cutoff) &&
          (!leveled.checked || levelTargets.has(skill.id)) &&
          terms.every(term => skill.searchText.includes(term)) &&
          tagTerms.every(term => skill.tagSearchText.includes(term))) ?? [];
        rendered = 0;
        list.replaceChildren();
        list.scrollTop = 0;
        appendSkills();
        if (catalog) loadStatus.textContent = matches.length ? `${matches.length.toLocaleString("ja-JP")}件` : "一致するスキルがありません。";
      }

      function updateSkillFilters() {
        const selected = skillCategory.value;
        const used = new Set(catalog?.skills.flatMap(skill => skill.categories ?? []));
        const order = new Map((catalog?.skillCategoryOrder ?? []).map((id, index) => [id, index]));
        const label = id => catalog?.skillCategoryLabels?.[id] ?? id;
        const ids = [...used].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || collator.compare(label(a), label(b)));
        skillCategory.replaceChildren(new Option("全カテゴリ", ""), ...ids.map(id => new Option(label(id), id)));
        if (used.has(selected)) skillCategory.value = selected;
        const tagLabels = new Set(catalog?.skills.flatMap(skill => (skill.tags ?? []).map(id => catalog.skillTagLabels?.[id]).filter(Boolean)));
        tagSuggestions.replaceChildren(...[...tagLabels].sort(collator.compare).map(label => new Option(label, label)));
        taxonomyStatus.hidden = !catalog || catalog.hasSkillTaxonomy !== false;
      }

      function showScreen(screen, focus = true) {
        hideTooltip();
        menu.hidden = screen !== "start";
        picker.root.hidden = screen !== "picker";
        body.hidden = footer.hidden = screen !== "editor";
        back.hidden = screen === "start";
        dialog.toggleAttribute("data-route-selection", screen !== "editor");
        if (screen === "start") {
          resume.hidden = !draftScreen;
          showSavedRoutes(false);
        } else draftScreen = screen;
        if (screen === "editor") document.dispatchEvent(new Event("hako-af:read-planner-level-targets"));
        if (!focus) return;
        if (screen === "start") newRoute.focus({ preventScroll: true });
        if (screen === "picker") picker.focus();
        if (screen === "editor") {
          body.scrollTop = 0;
          changeMonster.focus({ preventScroll: true });
        }
      }

      function render() {
        hideTooltip();
        for (const [group, control] of targetButtons) {
          control.setAttribute("aria-pressed", String(group === destination));
        }
        baseStatus.replaceChildren();
        innateList.replaceChildren();
        changeMonster.textContent = monster ? "ホムンクルスを変更" : "ホムンクルスを選ぶ";
        if (monster) {
          if (monster.image) {
            const portrait = node("img", "planner-portrait");
            portrait.alt = "";
            portrait.src = `/images/monsters/${encodeURIComponent(monster.image)}.png`;
            baseStatus.append(portrait);
          }
          const info = node("div", "planner-species");
          info.append(node("strong", "planner-species-name", monster.name),
            node("div", "planner-hint", monster.rank ? `Rank ${monster.rank}` : ""));
          baseStatus.append(info);
          if (monster.innate.length) {
            const innate = node("ul", "planner-skill-list");
            const details = node("details", "planner-innate-fold");
            details.open = innateExpanded;
            details.addEventListener("toggle", () => { if (details.isConnected) innateExpanded = details.open; });
            details.append(node("summary", "planner-action", `もともと覚えるスキル ${monster.innate.length}件`), innate);
            innate.append(...monster.innate.map(([id, level]) => skillRow(catalog.byId.get(id), level)));
            innateList.append(details);
          }
        }
        for (const button of list.querySelectorAll("[data-planner-add]")) {
          updateAddButton(button, catalog.byId.get(button.dataset.plannerAdd));
        }
        renderRank6Passive();
        plan.replaceChildren(...groupKeys.map(group => {
          const other = group === "ordinary" ? "permanent" : "ordinary";
          const [name, limit] = groups[group];
          const section = node("section", "planner-group");
          const reserveCount = picked[group].filter(isReserved).length;
          const count = reserveCount ? `使用中 ${picked[group].length - reserveCount} / ${limit}・控え ${reserveCount}`
            : `${picked[group].length} / ${limit}`;
          section.append(node("h4", "planner-section-title", `${name} ${count}`));
          if (!picked[group].length) section.append(node("p", "planner-hint", "一覧からスキルを追加できます。"));
          else {
            const rows = node("ul", "planner-chosen-list");
            rows.append(...picked[group].map((skill, index) => {
              const row = node("li", "planner-skill");
              row.append(nameButton(skill));
              row.append(node("small", "planner-type", skill.id ? skill.passive ? "パッシブ" : "アクティブ" : "種別未指定"));
              if (skill.unique) row.append(specialMark(skill));
              if (skill.id && preview) row.append(preview.skillLevelField(skill));
              const reserve = node("input", "training-reserve");
              reserve.type = "checkbox";
              reserve.checked = isReserved(skill);
              reserve.setAttribute("aria-label", `${routeSkillName(skill)}を控えにする`);
              reserve.addEventListener("change", () => {
                reservedNames ??= new Set();
                reservedNames.delete(skillKey(skill.name));
                if (reserve.checked) reservedNames.add(skillKey(routeSkillName(skill)));
                else reservedNames.delete(skillKey(routeSkillName(skill)));
                resetStatus();
                render();
              });
              const reserveLabel = node("label", "training-reserve-choice");
              reserveLabel.append(reserve, "控え");
              row.append(reserveLabel);
              if (!skill.unique || other === "ordinary") {
                const move = button(`${groups[other][0]}へ`, () => {
                  if (!canAdd(other, skill)) return;
                  picked[group].splice(index, 1);
                  add(other, skill);
                });
                move.disabled = !canAdd(other, skill);
                row.append(move);
              }
              const remove = button("外す", () => {
                picked[group].splice(index, 1);
                resetStatus();
                render();
              });
              remove.setAttribute("aria-label", `${skill.name}を${name}から外す`);
              row.append(remove);
              return row;
            }));
            section.append(rows);
          }
          return section;
        }));
        save.textContent = currentId ? "変更を保存" : "拡張育成ルートに保存";
        save.disabled = !currentId && !baseMonsterId && !rank6Passive && !picked.ordinary.length && !picked.permanent.length;
        preview?.refresh();
      }

      renderCatalog = () => {
        retry.hidden = !!catalog && catalog.hasSkillTaxonomy !== false;
        if (!catalog) loadStatus.textContent = "図鑑データを読み込めませんでした。図鑑のホムンクルス・スキルを開いてから再読み込みしてください。";
        if (catalog) {
          const wasClean = !hasUnsavedChanges();
          monster = catalog.monsters.find(item => item.id === baseMonsterId);
          for (const group of groupKeys) picked[group] = picked[group].map(skill =>
            skill.id ? skill : attachSkill(skill.name));
          syncRank6Passive();
          if (wasClean && draftScreen) cleanDraft = JSON.stringify(routeDraft());
        }
        picker.setCatalog(catalog);
        picker.setSelected(monster);
        updateSkillFilters();
        filterSkills();
        render();
      };
      skillQuery.addEventListener("input", filterSkills);
      tagQuery.addEventListener("input", filterSkills);
      for (const field of [skillType, skillCategory, skillUnique, recent, leveled]) field.addEventListener("change", filterSkills);
      for (const field of [routeName, routeGroup]) field.addEventListener("input", resetStatus);
      routeGroup.addEventListener("change", () => preview?.refresh());
      resetOnReopen = () => {
        if (!hasUnsavedChanges()) {
          draftScreen = undefined;
          showScreen("start", false);
        } else if (!menu.hidden) renderSavedRoutes();
      };
      retry.hidden = true;
      loadStatus.textContent = "図鑑データを読み込み中…";
      showScreen("start", false);
      render();
      dialog.showModal();
      readCatalog();
    }

    function openFromHome() {
      if (location.hash !== hash) {
        previousHash = location.hash;
        history.replaceState(history.state, "", hash);
      }
      open();
    }

    function launchIcon(compact) {
      const icon = node("span", "training-planner-icon");
      icon.className = compact ? "shrink-0 text-2xl text-primary" : "shrink-0 text-xl text-primary home-facility-label__glow";
      icon.setAttribute("aria-hidden", "true");
      return icon;
    }

    function addFacilityLaunch(grid) {
      if (grid.querySelector(launchSelector)) return;
      const name = grid.querySelector(":scope > .btn-3d .home-facility-label__name");
      if (!name) return;
      const template = name.closest(".btn-3d");
      const compact = !template.classList.contains("facility-btn");
      const launch = button("", openFromHome, "training-planner-launch");
      launch.className = `${facilityStyle} ${compact ? "min-w-0 px-1 py-2 min-h-[4.75rem] flex flex-col items-center" :
        "facility-btn w-full px-3 py-[0.7rem] min-h-[3.5rem] flex items-center"}`;
      for (const attr of template.getAttributeNames()) {
        if (attr.startsWith("data-v-")) launch.setAttribute(attr, "");
      }
      const label = name.closest(".home-facility-label").cloneNode(false);
      label.classList.remove("home-facility-label--img", "text-text-muted", "opacity-60");
      label.classList.add("text-text");
      label.removeAttribute("title");
      const caption = name.cloneNode(false);
      caption.textContent = title;
      caption.style.setProperty("--fit-len", String([...title].length + .25));
      const icon = launchIcon(compact);
      for (const attr of caption.getAttributeNames()) {
        if (attr.startsWith("data-v-")) icon.setAttribute(attr, "");
      }
      label.append(icon, caption);
      launch.append(label);
      grid.append(launch);
    }

    function scan() {
      const home = /^\/(?:f\/?|)$/.test(location.pathname);
      const active = home && enabled();
      if (!active) {
        for (const launch of document.querySelectorAll(launchSelector)) launch.remove();
        dialog?.close();
        return;
      }
      for (const tile of document.querySelectorAll(otherLabels)) {
        if (tile.textContent.trim() !== "その他") continue;
        if (tile.matches("h4") && tile.closest("section.order-2")?.querySelector("header h3")?.textContent.trim() !== "行動メニュー") continue;
        const grid = tile.nextElementSibling;
        if (grid?.matches(".grid,.facility-grid")) addFacilityLaunch(grid);
      }
      const flexGroup = document.querySelector('.fx-home__places[aria-label="ほかの場所"]');
      if (flexGroup && !flexGroup.querySelector(launchSelector)) {
        const launch = button("", openFromHome, "training-planner-launch");
        launch.className = "fx-button fx-button--sm fx-home__place";
        launch.append(launchIcon(true), ` ${title}`);
        flexGroup.append(launch);
      }
      if (location.hash === hash && (dialog || document.querySelector("#__nuxt"))) open();
    }

    window.addEventListener("hashchange", () => {
      if (location.hash !== hash && dialog?.open) dialog.close();
      else scan();
    });
    return { scan };
  }

  globalThis.hakoAfTrainingPlanner = { start };
})();
