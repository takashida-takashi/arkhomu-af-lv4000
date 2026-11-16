(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const { normalize } = globalThis.hakoAf4000;
  const { groups } = globalThis.hakoAfEffects;
  const { activeGroup, minimumMatches } = globalThis.hakoAfListRules;
  const PRESET_PREFIX = "af-filter-preset:";
  let openPopup;
  let titleId = 0;

  function conditionRows(group) {
    return group.children.flatMap(child => child.children ? conditionRows(child) : [child]);
  }

  function element(tag, className, label) {
    const el = document.createElement(tag);
    if (className) el.className = "ha4-" + className;
    if (label) el.textContent = label;
    return el;
  }

  function button(label, className) {
    const el = element("button", className, label);
    el.type = "button";
    return el;
  }

  function toggle(label, value, onChange) {
    const field = element("input");
    field.type = "checkbox";
    field.checked = value;
    field.setAttribute("aria-label", label);
    field.addEventListener("change", () => onChange(field.checked));
    const wrapper = element("label", "checkbox");
    wrapper.append(field, label);
    return { wrapper, field };
  }

  function createPopup(state, onChange, storage = chrome.storage.local) {
    const trigger = button(names.filter);
    trigger.dataset.ha4 = "filter";
    trigger.setAttribute("aria-haspopup", "dialog");
    const dialog = element("dialog");
    dialog.dataset.ha4 = "filter-popup";
    const title = element("h2", null, names.filter);
    title.id = "ha4-filter-title-" + ++titleId;
    dialog.setAttribute("aria-labelledby", title.id);
    const closeIcon = button("×", "close-icon");
    closeIcon.setAttribute("aria-label", "閉じる");
    const header = element("header", "header");
    header.append(title, closeIcon);

    const mode = toggle("Lv4000未満を予測値で比較", state.useForecast, checked => {
      state.useForecast = checked;
      onChange();
    });
    const sortKey = element("select");
    sortKey.setAttribute("aria-label", names.sort);
    const sortDirection = element("select");
    sortDirection.setAttribute("aria-label", "並べる方向");
    sortDirection.append(new Option("高い順", "desc"), new Option("低い順", "asc"));
    sortDirection.value = state.sortDirection;
    sortKey.addEventListener("change", () => {
      state.sortKey = sortKey.value;
      sortDirection.disabled = !state.sortKey;
      onChange();
    });
    sortDirection.addEventListener("change", () => {
      state.sortDirection = sortDirection.value;
      onChange();
    });
    const sortControls = element("label", "view");
    sortControls.append(names.sort, sortKey, sortDirection);
    const presetPicker = element("select");
    presetPicker.setAttribute("aria-label", "保存済みのプリセット");
    const presetName = element("input");
    presetName.type = "text";
    presetName.maxLength = 48;
    presetName.placeholder = "プリセット名";
    presetName.setAttribute("aria-label", presetName.placeholder);
    const loadPreset = button("読み込み");
    const savePreset = button("保存");
    const presetStatus = element("small", "preset-status");
    presetStatus.setAttribute("aria-live", "polite");
    const presetControls = element("section", "presets");
    const presetLoadRow = element("div", "preset-row");
    const presetSaveRow = element("div", "preset-row");
    presetLoadRow.append(presetPicker, loadPreset);
    presetSaveRow.append(presetName, savePreset);
    presetControls.append(element("h3", null, `${names.filter}のプリセット`), presetLoadRow, presetSaveRow, presetStatus);
    const unknown = toggle("判定できないAFも表示", state.showUnknown, checked => {
      state.showUnknown = checked;
      onChange();
    });
    const search = element("input", "search");
    search.type = "search";
    search.placeholder = "パラメータ・特性を検索";
    search.setAttribute("aria-label", search.placeholder);
    const active = element("section", "selected");
    const selectedRows = element("div", "selected-rows");
    active.append(selectedRows);
    const categories = element("div", "categories");
    const noResults = element("p", "empty", "一致する項目がありません。");
    noResults.hidden = true;
    const body = element("div", "body");
    const view = element("select");
    view.setAttribute("aria-label", "分解タブに表示するAF");
    view.append(new Option("一致したAF（残す候補）", "match"), new Option("条件に一致しないAF（分解候補）", "discard"),
      new Option("残すチェックを付けたAF", "kept"),
      new Option("残すチェックがないAF（分解候補）", "unchecked"));
    view.value = state.view ?? "match";
    view.addEventListener("change", () => {
      state.view = view.value;
      onChange();
    });
    const viewControl = element("label", "view");
    viewControl.hidden = state.view == null;
    viewControl.append("表示するAF", view);
    const keepShown = button("一覧の一致をすべて残す");
    const clearKept = button("残すチェックを解除");
    const keepActions = element("div", "keep-actions");
    keepActions.hidden = state.view == null;
    keepActions.append(keepShown, clearKept);
    body.append(presetControls, mode.wrapper, sortControls, viewControl, keepActions, active, search, categories, noResults);
    const status = element("small", "status");
    status.setAttribute("role", "status");
    const notice = element("small", "notice");
    notice.hidden = true;
    const reset = button("リセット");
    const close = button("閉じる", "primary");
    const actions = element("div", "actions");
    actions.append(reset, close);
    const footer = element("footer", "footer");
    footer.append(status, unknown.wrapper, notice, actions);
    dialog.append(header, body, footer);

    let options = new Map();
    let signature;
    let counts = new Map();
    let matchingIds = [];
    const rendered = new Map();
    const thresholds = new Map();
    const expanded = new Map();
    let targetGroup = state.root;
    let presets = new Map();
    let busyWithPresets = false;
    let presetNeedsRender = false;

    function updatePresetButtons() {
      const name = presetName.value.trim();
      loadPreset.disabled = busyWithPresets || !presets.has(presetPicker.value);
      savePreset.disabled = busyWithPresets || !name;
      savePreset.textContent = presets.has(name) ? "上書き保存" : "保存";
    }

    async function refreshPresets() {
      if (busyWithPresets) return;
      const selected = presetPicker.value;
      busyWithPresets = true;
      updatePresetButtons();
      try {
        const stored = await storage.get();
        presets = new Map(Object.entries(stored)
          .filter(([key, value]) => key.startsWith(PRESET_PREFIX) && Array.isArray(value?.root?.children))
          .map(([key, value]) => [key.slice(PRESET_PREFIX.length), value]));
        renderPresetOptions(selected);
      } catch {
        presetStatus.textContent = "保存済みのプリセットを取得できませんでした。";
      } finally {
        busyWithPresets = false;
        updatePresetButtons();
      }
    }

    function renderPresetOptions(selected) {
      presetPicker.replaceChildren(new Option("プリセットを選択", ""));
      for (const name of [...presets.keys()].sort((a, b) => a.localeCompare(b, "ja"))) {
        presetPicker.append(new Option(name, name));
      }
      presetPicker.value = presets.has(selected) ? selected : "";
    }

    presetPicker.addEventListener("change", updatePresetButtons);
    presetName.addEventListener("input", updatePresetButtons);
    loadPreset.addEventListener("click", () => {
      const name = presetPicker.value;
      const preset = presets.get(name);
      if (!preset || busyWithPresets) return;
      state.root = structuredClone(preset.root);
      targetGroup = state.root;
      mode.field.checked = state.useForecast = preset.useForecast !== false;
      unknown.field.checked = state.showUnknown = preset.showUnknown === true;
      state.sortKey = preset.sortKey || "";
      sortDirection.value = state.sortDirection = preset.sortDirection === "asc" ? "asc" : "desc";
      presetName.value = name;
      presetStatus.textContent = `「${name}」を読み込みました。`;
      updatePresetButtons();
      presetNeedsRender = true;
      onChange();
    });
    savePreset.addEventListener("click", async () => {
      const name = presetName.value.trim();
      if (!name || busyWithPresets) return;
      const { root, useForecast, showUnknown, sortKey, sortDirection } = state;
      const preset = { root: structuredClone(root), useForecast, showUnknown, sortKey, sortDirection };
      busyWithPresets = true;
      updatePresetButtons();
      try {
        await storage.set({ [PRESET_PREFIX + name]: preset });
        presets.set(name, preset);
        renderPresetOptions(name);
        presetStatus.textContent = `「${name}」を保存しました。`;
      } catch {
        presetStatus.textContent = "プリセットを保存できませんでした。";
      } finally {
        busyWithPresets = false;
        updatePresetButtons();
      }
    });
    presetName.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing || savePreset.disabled) return;
      event.preventDefault();
      savePreset.click();
    });
    updatePresetButtons();

    keepShown.addEventListener("click", () => {
      for (const id of matchingIds) state.kept.add(id);
      onChange();
    });
    clearKept.addEventListener("click", () => {
      state.kept.clear();
      onChange();
    });

    function updateControls() {
      reset.disabled = state.root.children.length === 0 && state.root.join === "and" &&
        (state.view == null || state.view === "match") && !state.sortKey;
      const conditions = conditionRows(state.root);
      for (const [group, { count, total }] of thresholds) {
        const available = activeGroup(group).children.length;
        const selected = minimumMatches(group);
        const signature = `${available}/${selected}`;
        if (count.dataset.options === signature) continue;
        count.dataset.options = signature;
        total.textContent = `${available}件中 `;
        count.replaceChildren(...Array.from({ length: Math.max(1, available) }, (_, index) =>
          new Option(String(index + 1), String(index + 1))));
        if (selected > count.options.length) count.add(new Option(String(selected), String(selected)));
        count.value = String(selected);
      }
      for (const [group, view] of rendered) {
        view.badge.textContent = String(new Set(conditions.filter(({ key }) => options.get(key)?.group === group)
          .map(({ key }) => key)).size);
        for (const [key, item] of view.items) {
          const inGroup = targetGroup.children.some(child => child.key === key);
          item.toggle.field.checked = inGroup;
          item.toggle.field.indeterminate = !inGroup && conditions.some(condition => condition.key === key);
          item.count.textContent = counts.has(key) ? ` (${counts.get(key).toLocaleString("ja-JP")})` : "";
        }
      }
    }

    function renderCondition(condition, group) {
      const { label, unit } = options.get(condition.key);
      const row = element("div", "condition");
      row.dataset.ha4Condition = condition.key;
      row.append(element("strong", "condition-name", label));
      for (const [field, caption] of [["min", "下限"], ["max", "上限"]]) {
        const input = element("input");
        input.type = "number";
        input.step = "any";
        input.value = condition[field];
        input.placeholder = caption;
        input.setAttribute("aria-label", label + "の" + caption);
        input.addEventListener("input", () => {
          condition[field] = input.value;
          onChange();
        });
        row.append(input);
      }
      row.append(element("span", "unit", unit));
      if (condition.key !== "power" && condition.key !== "rate_sum") {
        const stars = element("select");
        stars.setAttribute("aria-label", label + "の★の数");
        stars.append(new Option("★指定なし", ""), ...[1, 2, 3, 4, 5].map(n =>
          new Option(`★${n}${n < 5 ? "以上" : ""}`, String(n))));
        stars.value = condition.stars;
        stars.addEventListener("change", () => {
          condition.stars = stars.value;
          onChange();
        });
        row.append(stars);
      }
      const remove = button("×", "remove");
      remove.setAttribute("aria-label", label + "の条件を外す");
      remove.addEventListener("click", () => setCondition(condition.key, false, group));
      row.append(remove);
      return row;
    }

    function renderGroup(group, parent, number) {
      const box = element("section", parent ? "group" : "root-group");
      const header = element("div", "join");
      header.setAttribute("role", "group");
      header.setAttribute("aria-label", parent ? "グループ " + number + " のつなぎ方" : "条件のつなぎ方");
      const caption = parent ? "グループ " + number : "条件のつなぎ方";
      header.append(element("strong", null, caption));
      const threshold = element("label", "threshold");
      const count = element("select");
      count.setAttribute("aria-label", caption + "の最低一致数");
      const total = element("span");
      thresholds.set(group, { count, total });
      count.addEventListener("change", () => {
        group.minimum = Number(count.value);
        onChange();
      });
      threshold.hidden = group.join !== "count";
      threshold.append(total, count, " 件以上");
      for (const [value, label] of [["and", "すべて一致（AND）"], ["or", "どれか1つ（OR）"], ["count", "指定数以上"]]) {
        const operator = button(label);
        operator.setAttribute("aria-pressed", String(group.join === value));
        operator.addEventListener("click", () => {
          group.join = value;
          for (const peer of header.querySelectorAll("button[data-ha4-operator]")) {
            peer.setAttribute("aria-pressed", String(peer.dataset.ha4Operator === value));
          }
          threshold.hidden = value !== "count";
          updateControls();
          onChange();
        });
        operator.dataset.ha4Operator = value;
        header.append(operator);
      }
      header.append(threshold);
      if (state.root.children.some(child => child.children)) {
        const target = button(group === targetGroup ? "追加先" : "ここに追加");
        target.setAttribute("aria-label", caption + "を項目の追加先にする");
        target.setAttribute("aria-pressed", String(group === targetGroup));
        target.addEventListener("click", () => {
          targetGroup = group;
          updateSelected();
        });
        header.append(target);
      }
      const add = button("＋ グループ");
      add.setAttribute("aria-label", caption + "にグループを追加");
      add.addEventListener("click", () => {
        const child = { join: "and", children: [] };
        group.children.push(child);
        targetGroup = child;
        updateSelected();
      });
      header.append(add);
      if (parent) {
        const remove = button("×", "remove");
        remove.setAttribute("aria-label", caption + "を削除");
        remove.addEventListener("click", () => {
          parent.children = parent.children.filter(child => child !== group);
          targetGroup = parent;
          updateSelected();
          onChange();
        });
        header.append(remove);
      }
      box.append(header);
      let index = 0;
      for (const child of group.children) {
        if (child.children) {
          index++;
          box.append(renderGroup(child, group, number ? number + "." + index : String(index)));
        } else {
          box.append(renderCondition(child, group));
        }
      }
      return box;
    }

    function updateSelected() {
      thresholds.clear();
      selectedRows.replaceChildren(renderGroup(state.root, null, ""));
      updateControls();
    }

    function setCondition(key, checked, group = targetGroup) {
      if (checked) group.children.push({ key, min: "", max: "", stars: "" });
      else group.children = group.children.filter(condition => condition.key !== key);
      updateSelected();
      onChange();
    }

    function applySearch() {
      const query = normalize(search.value).toLowerCase();
      let results = 0;
      for (const [group, view] of rendered) {
        let matches = 0;
        for (const [key, item] of view.items) {
          const label = normalize(options.get(key).label).toLowerCase();
          const searchText = label + " " + normalize(groups[group]).toLowerCase() +
            (key === "rate_sum" ? " af合計 変換率合計" : "");
          const visible = !query || searchText.includes(query) ||
            (query.includes("af") && label.includes(query.replaceAll("af", "アーティファクト")));
          item.toggle.wrapper.hidden = !visible;
          if (visible) matches++;
        }
        results += matches;
        view.section.hidden = !matches;
        view.section.open = query ? matches > 0 : expanded.get(group);
      }
      noResults.hidden = results !== 0;
    }

    function renderOptions() {
      rendered.clear();
      const sections = [];
      for (const [group, groupLabel] of Object.entries(groups)) {
        const entries = [...options].filter(([, option]) => option.group === group);
        if (!entries.length) continue;
        const section = element("details", "category");
        if (!expanded.has(group)) expanded.set(group, group === "basic" || group === "parameter" || group === "reward");
        section.open = expanded.get(group);
        const summary = element("summary", null, groupLabel);
        const badge = element("span", "category-count");
        summary.append(badge);
        summary.addEventListener("click", () => {
          if (!search.value.trim()) expanded.set(group, !section.open);
        });
        const grid = element("div", "option-grid");
        const items = new Map();
        for (const [key, { label }] of entries) {
          const choice = toggle(label, false, checked => setCondition(key, checked));
          choice.field.dataset.ha4Option = key;
          const count = element("span", "option-count");
          count.setAttribute("aria-hidden", "true");
          choice.wrapper.append(count);
          grid.append(choice.wrapper);
          items.set(key, { toggle: choice, count });
        }
        section.append(summary, grid);
        sections.push(section);
        rendered.set(group, { section, badge, items });
      }
      categories.replaceChildren(...sections);
      applySearch();
      updateSelected();
    }

    function refresh(entries, newCounts, result) {
      const { active: hasConditions, matched, unknown: unknownCount, message, resultLabel, decomposeNotice } = result;
      matchingIds = result.matchingIds;
      keepShown.disabled = state.view !== "match" || !matchingIds.some(id => !state.kept.has(id));
      clearKept.disabled = !state.kept?.size;
      const caption = hasConditions ? `${names.filter}｜${resultLabel} ${matched}件` : names.filter;
      if (trigger.textContent !== caption) trigger.textContent = caption;
      if (status.textContent !== message) status.textContent = message;
      notice.hidden = !decomposeNotice;
      notice.textContent = decomposeNotice
        ? "残すチェックはこのタブ内の目印です。分解候補を表示して、ゲームの一括解体モードで対象を選んでください。"
        : "";
      unknown.wrapper.hidden = unknownCount === 0;
      counts = newCounts;
      const nextSignature = JSON.stringify(entries);
      if (signature !== nextSignature) {
        options = new Map(entries);
        signature = nextSignature;
        sortKey.replaceChildren(new Option("ゲームの並び順を使う", ""));
        for (const [group, groupLabel] of Object.entries(groups)) {
          const list = entries.filter(([, option]) => option.group === group);
          if (!list.length) continue;
          const groupNode = element("optgroup");
          groupNode.label = groupLabel;
          for (const [key, { label }] of list) groupNode.append(new Option(label, key));
          sortKey.append(groupNode);
        }
        if (dialog.open) renderOptions();
      } else if (dialog.open) {
        if (presetNeedsRender) updateSelected();
        else updateControls();
      }
      presetNeedsRender = false;
      sortKey.value = state.sortKey;
      sortDirection.disabled = !state.sortKey;
    }

    search.addEventListener("input", applySearch);
    reset.addEventListener("click", () => {
      state.root.children = [];
      state.root.join = "and";
      delete state.root.minimum;
      state.sortKey = sortKey.value = "";
      state.sortDirection = sortDirection.value = "desc";
      if (state.view != null) state.view = view.value = "match";
      targetGroup = state.root;
      updateSelected();
      onChange();
    });
    for (const control of [closeIcon, close]) control.addEventListener("click", () => dialog.close());
    trigger.addEventListener("click", () => {
      if (openPopup && openPopup !== dialog) openPopup.close();
      if (dialog.open) return;
      search.value = "";
      if (!dialog.isConnected) document.body.append(dialog);
      renderOptions();
      dialog.showModal();
      refreshPresets();
      openPopup = dialog;
      search.focus({ preventScroll: true });
    });
    dialog.addEventListener("close", () => {
      if (openPopup === dialog) openPopup = undefined;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    });
    for (const control of [trigger, dialog]) {
      for (const event of ["pointerdown", "click", "dblclick", "keydown"]) {
        control.addEventListener(event, e => e.stopPropagation());
      }
    }
    return {
      element: trigger,
      refresh,
      close() { if (dialog.open) dialog.close(); },
      remove() {
        if (dialog.open) dialog.close();
        trigger.remove();
        dialog.remove();
      }
    };
  }

  globalThis.hakoAfFilterPopup = createPopup;
  globalThis.hakoAfConditionRows = conditionRows;
})();
