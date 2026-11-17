(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const { normalize } = globalThis.hakoAf4000;
  const { groups } = globalThis.hakoAfEffects;
  const { activeGroup, minimumMatches, supportsAbsence } = globalThis.hakoAfListRules;
  const PRESET_PREFIX = "af-filter-preset:";
  const SHARE_FORMAT = "hako-af-filter";
  let openPopup;
  let titleId = 0;

  function conditionRows(group) {
    return group.children.flatMap(child => child.children ? conditionRows(child) : [child]);
  }

  function parseSharedPreset(text, fields, format = SHARE_FORMAT) {
    if (text.length > 256 * 1024) throw new Error("共有テキストが長すぎます。");
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("プリセットの共有テキストを確認してください。"); }
    if (data?.format !== format || ![1, 2].includes(data.version) || !Array.isArray(data.root?.children)) {
      throw new Error("この共有データの形式には対応していません。");
    }
    let visited = 0;
    const metric = key => typeof key === "string" && (fields ? fields.has(key) :
      /^(power|rate_sum|(?:stat_|trait:)[\w-]{1,128})$/.test(key));
    function readNumber(value) {
      if (value == null || value === "") return "";
      if ((typeof value === "number" || (typeof value === "string" && value.trim())) && Number.isFinite(Number(value))) {
        return String(Number(value));
      }
      throw new Error("上限と下限には数値を指定してください。");
    }
    function readNode(node, depth) {
      if (++visited > 2000 || depth > 60) throw new Error("共有データの入れ子か条件数が多すぎます。");
      const annotation = {};
      if (typeof node?.sectionName === "string" && node.sectionName.trim()) annotation.sectionName = node.sectionName.trim().slice(0, 48);
      if (typeof node?.sectionColor === "string" && /^#[0-9a-f]{6}$/i.test(node.sectionColor)) annotation.sectionColor = node.sectionColor;
      if (data.version === 2 && typeof node?.sectionPage === "string" && node.sectionPage.trim()) {
        annotation.sectionPage = node.sectionPage.trim().slice(0, 48);
      }
      if (Array.isArray(node?.children)) {
        if (!["and", "or", "count"].includes(node.join) || (node.minimum != null &&
            (!Number.isSafeInteger(node.minimum) || node.minimum < 1))) throw new Error("グループの一致条件を確認してください。");
        return { join: node.join, minimum: node.minimum, children: node.children.map(child => readNode(child, depth + 1)), ...annotation };
      }
      if (!metric(node?.key)) throw new Error("条件の項目名を確認してください。");
      if (fields) {
        const { kind, choices, ordered } = fields.get(node.key);
        if (kind === "number") return { key: node.key, min: readNumber(node.min), max: readNumber(node.max) };
        const value = node.value ?? "";
        if (typeof value !== "string" || value.length > 100 ||
            (kind === "choice" && value && !choices.some(([id]) => id === value))) {
          throw new Error("条件の入力値を確認してください。");
        }
        if (ordered && node.comparison != null && !["eq", "min", "max"].includes(node.comparison)) {
          throw new Error("難易度の比較方法を確認してください。");
        }
        return { key: node.key, value, ...(ordered && node.comparison ? { comparison: node.comparison } : {}),
          ...(kind === "text" && node.absent === true ? { absent: true } : {}) };
      }
      if (node.absent !== undefined) {
        if (data.version !== 2 || node.absent !== true || !supportsAbsence(node.key)) {
          throw new Error("「含まない」の対象を確認してください。");
        }
        annotation.absent = true;
      }
      const stars = node.stars == null ? "" : String(node.stars);
      if (stars && !/^[1-5]$/.test(stars)) throw new Error("★の数は1～5で指定してください。");
      return { key: node.key, min: readNumber(node.min), max: readNumber(node.max), stars, ...annotation };
    }
    return {
      name: typeof data.name === "string" ? data.name.trim().slice(0, 48) : "",
      root: readNode(data.root, 0), useForecast: data.useForecast !== false, showUnknown: data.showUnknown === true,
      sortKey: metric(data.sortKey) && fields?.get(data.sortKey)?.sortable !== false ? data.sortKey : "",
      sortDirection: data.sortDirection === "asc" ? "asc" : "desc",
      highlightSections: data.highlightSections !== false
    };
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

  function createPopup(state, onChange, storage = chrome.storage.local, inventory = false, custom) {
    const titleLabel = custom?.title ?? names.filter;
    const groupLabels = custom?.groups ?? groups;
    const presetPrefix = custom?.presetPrefix ?? PRESET_PREFIX;
    const shareFormat = custom?.shareFormat ?? SHARE_FORMAT;
    const trigger = button(names.filter);
    trigger.dataset.ha4 = "filter";
    trigger.setAttribute("aria-haspopup", "dialog");
    const dialog = element("dialog");
    dialog.dataset.ha4 = "filter-popup";
    const title = element("h2", null, titleLabel);
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
    const sharing = element("details", "preset-sharing");
    sharing.append(element("summary", null, "プリセットを共有・取り込み"));
    const shareText = element("textarea", "preset-share-text");
    shareText.rows = 3;
    shareText.spellcheck = false;
    shareText.placeholder = "受け取った共有テキストを貼り付けると反映します";
    shareText.setAttribute("aria-label", "プリセットの共有テキスト");
    const copyPreset = button("現在の条件をコピー");
    const applyShared = button("共有テキストを反映");
    const shareActions = element("div", "preset-row");
    shareActions.append(copyPreset, applyShared);
    sharing.append(shareText, shareActions);
    presetControls.append(element("h3", null, `${names.filter}のプリセット`),
      presetLoadRow, presetSaveRow, sharing, presetStatus);
    const unknown = toggle(custom?.unknownLabel ?? "判定できないAFも表示", state.showUnknown, checked => {
      state.showUnknown = checked;
      onChange();
    });
    const search = element("input", "search");
    search.type = "search";
    search.placeholder = custom ? "条件項目を検索" : "パラメータ・特性を検索";
    search.setAttribute("aria-label", search.placeholder);
    const active = element("section", "selected");
    const selectedRows = element("div", "selected-rows");
    active.append(selectedRows);
    const sectionBar = inventory ? element("div") : null;
    const sectionSettings = inventory ? element("details", "section-settings") : null;
    const sectionFields = inventory ? element("div", "section-fields") : null;
    const pageNames = inventory ? element("datalist") : null;
    const highlight = inventory ? toggle("一致した条件の色でAFを強調", state.highlightSections !== false, checked => {
      state.highlightSections = checked;
      onChange();
    }) : null;
    if (inventory) {
      sectionBar.dataset.ha4 = "filter-section-pages";
      sectionBar.hidden = true;
      sectionBar.setAttribute("role", "group");
      sectionBar.setAttribute("aria-label", "AFの条件別ページ");
      sectionSettings.hidden = true;
      pageNames.id = title.id + "-pages";
      sectionSettings.append(element("summary", null, "条件別の色・ページ"), highlight.wrapper,
        element("small", "section-description", "同じページに表示する条件には、共通のまとめ先を入力します。"),
        sectionFields, pageNames);
    }
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
    body.append(presetControls);
    if (!custom) body.append(mode.wrapper);
    body.append(sortControls);
    if (!custom) body.append(viewControl, keepActions);
    body.append(active);
    if (sectionSettings) body.append(sectionSettings);
    body.append(search, categories, noResults);
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
    let sectionEditors = [];
    let pageSections = [];
    const sectionButtons = [];

    function updatePresetButtons() {
      const name = presetName.value.trim();
      loadPreset.disabled = busyWithPresets || !presets.has(presetPicker.value);
      savePreset.disabled = busyWithPresets || !name;
      savePreset.textContent = presets.has(name) ? "上書き保存" : "保存";
      applyShared.disabled = !shareText.value.trim();
    }

    async function refreshPresets() {
      if (busyWithPresets) return;
      const selected = presetPicker.value;
      busyWithPresets = true;
      updatePresetButtons();
      try {
        const stored = await storage.get();
        presets = new Map(Object.entries(stored)
          .filter(([key, value]) => key.startsWith(presetPrefix) && Array.isArray(value?.root?.children))
          .map(([key, value]) => [key.slice(presetPrefix.length), value]));
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
    function applyPreset(preset, name) {
      state.root = structuredClone(preset.root);
      targetGroup = state.root;
      state.sectionTarget = null;
      mode.field.checked = state.useForecast = preset.useForecast !== false;
      unknown.field.checked = state.showUnknown = preset.showUnknown === true;
      state.sortKey = preset.sortKey || "";
      sortDirection.value = state.sortDirection = preset.sortDirection === "asc" ? "asc" : "desc";
      state.highlightSections = preset.highlightSections !== false;
      if (highlight) highlight.field.checked = state.highlightSections;
      presetName.value = name;
      updatePresetButtons();
      presetNeedsRender = true;
      onChange();
    }

    function currentPreset() {
      const { root, useForecast, showUnknown, sortKey, sortDirection, highlightSections } = state;
      return { root: structuredClone(root), useForecast, showUnknown, sortKey, sortDirection, highlightSections };
    }

    loadPreset.addEventListener("click", () => {
      const name = presetPicker.value;
      const preset = presets.get(name);
      if (!preset || busyWithPresets) return;
      applyPreset(preset, name);
      presetStatus.textContent = `「${name}」を読み込みました。`;
    });
    savePreset.addEventListener("click", async () => {
      const name = presetName.value.trim();
      if (!name || busyWithPresets) return;
      const preset = currentPreset();
      busyWithPresets = true;
      updatePresetButtons();
      try {
        await storage.set({ [presetPrefix + name]: preset });
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
    copyPreset.addEventListener("click", async () => {
      const preset = currentPreset();
      const needsCurrentFormat = node => node.sectionPage || node.absent || node.children?.some(needsCurrentFormat);
      const version = needsCurrentFormat(preset.root) ? 2 : 1;
      shareText.value = JSON.stringify({ format: shareFormat, version, name: presetName.value.trim(), ...preset });
      updatePresetButtons();
      try {
        await navigator.clipboard.writeText(shareText.value);
        presetStatus.textContent = "現在のプリセットをコピーしました。";
      } catch {
        shareText.focus();
        shareText.select();
        presetStatus.textContent = "共有テキストを選択しました。コピーして送ってください。";
      }
    });
    function importShared() {
      try {
        const preset = parseSharedPreset(shareText.value.trim(), custom ? options : undefined, shareFormat);
        presetPicker.value = "";
        applyPreset(preset, preset.name);
        presetStatus.textContent = "共有プリセットを反映しました。保存する場合はプリセット名を指定してください。";
      } catch (error) {
        presetStatus.textContent = error.message;
      }
    }
    shareText.addEventListener("input", updatePresetButtons);
    shareText.addEventListener("paste", event => {
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      shareText.value = text;
      updatePresetButtons();
      importShared();
    });
    applyShared.addEventListener("click", importShared);
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
        const available = activeGroup(group, undefined, custom?.isActive).children.length;
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

    function renderValues(row, condition, { label, unit, kind, choices, ordered }) {
      if (kind === "text" || kind === "choice") {
        if (kind === "text") {
          const operator = element("select");
          operator.setAttribute("aria-label", label + "の一致方法");
          operator.append(new Option("含む", "present"), new Option("含まない", "absent"));
          operator.value = condition.absent ? "absent" : "present";
          operator.addEventListener("change", () => {
            condition.absent = operator.value === "absent";
            onChange();
          });
          row.append(operator);
        }
        if (ordered) {
          const operator = element("select");
          operator.setAttribute("aria-label", label + "の比較方法");
          operator.append(new Option("一致", "eq"), new Option("以上", "min"), new Option("以下", "max"));
          operator.value = condition.comparison ?? "eq";
          operator.addEventListener("change", () => {
            condition.comparison = operator.value;
            onChange();
          });
          row.append(operator);
        }
        const input = element(kind === "choice" ? "select" : "input", "condition-value");
        input.setAttribute("aria-label", label + "の条件値");
        if (kind === "choice") input.append(new Option("指定なし", ""), ...choices.map(([id, name]) => new Option(name, id)));
        else {
          input.type = "text";
          input.maxLength = 100;
          input.placeholder = "名前を入力";
        }
        input.value = condition.value ?? "";
        input.addEventListener(kind === "choice" ? "change" : "input", () => {
          condition.value = input.value;
          updateControls();
          onChange();
        });
        row.append(input);
        return;
      }
      const bounds = [];
      if (supportsAbsence(condition.key)) {
        const operator = element("select");
        operator.setAttribute("aria-label", label + "の有無");
        operator.append(new Option("含む", "present"), new Option("含まない", "absent"));
        operator.value = condition.absent ? "absent" : "present";
        operator.addEventListener("change", () => {
          if (operator.value === "absent") condition.absent = true;
          else delete condition.absent;
          for (const field of bounds) field.hidden = condition.absent === true;
          onChange();
        });
        row.append(operator);
      }
      for (const [field, caption] of [["min", "下限"], ["max", "上限"]]) {
        const input = element("input");
        input.type = "number";
        input.step = "any";
        input.value = condition[field];
        input.placeholder = caption;
        input.setAttribute("aria-label", label + "の" + caption);
        input.addEventListener("input", () => {
          condition[field] = input.value;
          if (custom) updateControls();
          onChange();
        });
        bounds.push(input);
      }
      bounds.push(element("span", "unit", unit));
      if (!custom && condition.key !== "power" && condition.key !== "rate_sum") {
        const stars = element("select");
        stars.setAttribute("aria-label", label + "の★の数");
        stars.append(new Option("★指定なし", ""), ...[1, 2, 3, 4, 5].map(n =>
          new Option(`★${n}${n < 5 ? "以上" : ""}`, String(n))));
        stars.value = condition.stars;
        stars.addEventListener("change", () => {
          condition.stars = stars.value;
          onChange();
        });
        bounds.push(stars);
      }
      for (const field of bounds) field.hidden = condition.absent === true;
      row.append(...bounds);
    }

    function renderCondition(condition, group) {
      const option = options.get(condition.key);
      const { label } = option;
      const row = element("div", "condition");
      row.dataset.ha4Condition = condition.key;
      row.append(element("strong", "condition-name", label));
      renderValues(row, condition, option);
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
          const searchText = label + " " + normalize(groupLabels[group]).toLowerCase() +
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
      for (const [group, groupLabel] of Object.entries(groupLabels)) {
        const entries = [...options].filter(([, option]) => option.group === group);
        if (!entries.length) continue;
        const section = element("details", "category");
        if (!expanded.has(group)) expanded.set(group, custom ? group === Object.keys(groupLabels)[0] :
          group === "basic" || group === "parameter" || group === "reward");
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

    function refreshSections(sections, pages, selected, hasPages, sectionCounts) {
      if (!inventory) return;
      sectionSettings.hidden = !sections.length;
      highlight.field.checked = state.highlightSections !== false;
      if (sections.length !== sectionEditors.length ||
          sections.some(({ source }, index) => sectionEditors[index].source !== source)) {
        sectionEditors = sections.map(({ source }, index) => {
          const row = element("div", "section-field");
          const description = element("small", "section-description");
          const name = element("input");
          name.type = "text";
          name.maxLength = 48;
          name.setAttribute("aria-label", `条件${index + 1}のページ名`);
          name.addEventListener("change", () => {
            const value = name.value.trim();
            if (value) source.sectionName = value;
            else delete source.sectionName;
            onChange();
          });
          const color = element("input");
          color.type = "color";
          color.setAttribute("aria-label", `条件${index + 1}の強調色`);
          color.addEventListener("change", () => {
            source.sectionColor = color.value;
            onChange();
          });
          const page = element("input", "section-page");
          page.type = "text";
          page.maxLength = 48;
          page.placeholder = "まとめ先（空欄は個別ページ）";
          page.setAttribute("aria-label", `条件${index + 1}のまとめ先`);
          page.setAttribute("list", pageNames.id);
          page.addEventListener("change", () => {
            page.value = page.value.trim();
            if (page.value) source.sectionPage = page.value;
            else delete source.sectionPage;
            onChange();
          });
          page.addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.isComposing) page.blur();
          });
          row.append(name, color, description, page);
          return { row, source, name, color, description, page };
        });
        sectionFields.replaceChildren(...sectionEditors.map(({ row }) => row));
      }
      sections.forEach(({ defaultName, color, description }, index) => {
        const editor = sectionEditors[index];
        editor.name.placeholder = defaultName;
        if (document.activeElement !== editor.name) editor.name.value = editor.source.sectionName || "";
        if (document.activeElement !== editor.page) editor.page.value = editor.source.sectionPage || "";
        if (editor.color.value !== color) editor.color.value = color;
        if (editor.description.textContent !== description) editor.description.textContent = description;
      });
      const names = pages.map(page => page.groupName).filter(Boolean);
      if (names.length !== pageNames.options.length || names.some((name, i) => name !== pageNames.options[i].value)) {
        pageNames.replaceChildren(...names.map(name => new Option(name)));
      }
      sectionBar.hidden = !hasPages;
      if (!hasPages) return;
      pageSections = pages;
      const entries = [{ name: "すべて" }, ...pages];
      while (sectionButtons.length > entries.length) sectionButtons.pop().remove();
      entries.forEach(({ name, color, description }, index) => {
        let tab = sectionButtons[index];
        if (!tab) {
          tab = button("");
          tab.addEventListener("click", () => {
            state.sectionTarget = pageSections[index - 1]?.sources[0] ?? null;
            onChange();
          });
          sectionButtons.push(tab);
          sectionBar.append(tab);
        }
        const count = sectionCounts?.[index - 1];
        const label = count == null ? name : `${name} ${count.toLocaleString("ja-JP")}件`;
        if (tab.textContent !== label) tab.textContent = label;
        tab.setAttribute("aria-pressed", String(index - 1 === selected));
        if (color) tab.style.setProperty("--ha4-section-color", color);
        tab.title = description || "絞り込み結果をまとめて表示";
      });
    }

    function refresh(entries, newCounts, result) {
      const { active: hasConditions, matched, unknown: unknownCount, message, resultLabel, decomposeNotice, selectionNotice } = result;
      mode.field.checked = state.useForecast;
      matchingIds = result.matchingIds;
      keepShown.disabled = state.view !== "match" || !matchingIds.some(id => !state.kept.has(id));
      clearKept.disabled = !state.kept?.size;
      const caption = hasConditions ? `${names.filter}｜${resultLabel} ${matched}件` : names.filter;
      if (trigger.textContent !== caption) trigger.textContent = caption;
      if (status.textContent !== message) status.textContent = message;
      notice.hidden = !decomposeNotice && !selectionNotice;
      notice.textContent = decomposeNotice
        ? "残すチェックはこのタブ内の目印です。分解候補を表示して、ゲームの一括解体モードで対象を選んでください。"
        : selectionNotice ?? "";
      unknown.wrapper.hidden = unknownCount === 0;
      if (custom) unknown.field.checked = state.showUnknown;
      refreshSections(result.sections ?? [], result.pages ?? [], result.section, result.hasSectionPages, result.sectionCounts);
      counts = newCounts;
      const nextSignature = JSON.stringify(entries);
      if (signature !== nextSignature) {
        options = new Map(entries);
        signature = nextSignature;
        sortKey.replaceChildren(new Option("ゲームの並び順を使う", ""));
        for (const [group, groupLabel] of Object.entries(groupLabels)) {
          const list = entries.filter(([, option]) => option.group === group && option.sortable !== false);
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
      delete state.root.sectionName;
      delete state.root.sectionColor;
      delete state.root.sectionPage;
      state.sectionTarget = null;
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
      if (custom) targetGroup = state.root;
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
      sectionBar,
      refresh,
      close() { if (dialog.open) dialog.close(); },
      remove() {
        if (dialog.open) dialog.close();
        trigger.remove();
        sectionBar?.remove();
        dialog.remove();
      }
    };
  }

  globalThis.hakoAfFilterPopup = createPopup;
  globalThis.hakoAfConditionRows = conditionRows;
})();
