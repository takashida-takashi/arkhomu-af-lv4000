(() => {
  "use strict";

  const stats = { hp: "体力", atk: "物攻", mtk: "魔攻", def: "物防", mdf: "魔防", spd: "速度",
    lck: "運", cri: "会心率", cdmg: "会心威力" };
  const aptitudes = { fire: "炎", ice: "氷", thunder: "雷", wind: "風", earth: "地", holy: "光", dark: "闇",
    physical: "物理", magic: "魔法", slash: "斬撃", strike: "打撃", punch: "格闘", breath: "ブレス", shot: "射撃",
    light_wave: "光波", sound: "音波", drain: "吸収", poison: "毒", blood: "出血", sleep: "睡眠", burn: "火傷",
    frost: "凍傷", charm: "魅了", fear: "恐怖", paralysis: "麻痺", electrified: "感電", frozen: "凍結", curse: "呪い",
    stun: "スタン", silence: "沈黙", slow: "スロウ", deterioration: "劣化", blind: "暗闇", confusion: "混乱",
    bind: "拘束", pain: "痛み", heal: "回復", shield: "シールド" };
  const mainElements = ["fire", "ice", "thunder", "wind", "earth", "holy", "dark"];
  const numbers = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
  const signed = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2, signDisplay: "exceptZero" });
  const dates = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });
  const createArtifacts = globalThis.hakoAfTrainingArtifacts;
  const optional = input => input.value === "" || !Number.isFinite(input.valueAsNumber) ? null : input.valueAsNumber;

  function create({ node, button, getDraft, getRoutes, onPreviewChange, resolveSkill, resolveAptitude }) {
    const root = node("details", "planner-preview");
    const enabled = node("summary", "planner-action", "完成形プレビュー");
    const body = node("div", "planner-preview-body");
    const status = node("p", "planner-hint");
    status.setAttribute("role", "status");
    const output = node("div", "planner-preview-output");
    const inputs = node("div", "planner-preview-fields");
    const baseline = node("p", "planner-hint", "世代値を空欄にすると、最大Lvに届く最小の世代で試算します。");
    const accessory = node("section", "planner-preview-section");
    const artifacts = createArtifacts({ node, button, onChange: () => { onPreviewChange(); refresh(); } });
    const team = node("details", "planner-preview-section");
    const teamFields = node("div", "planner-preview-fields");
    const mode = document.createElement("select");
    mode.append(new Option("通常", "normal"), new Option("公式戦", "official"));
    let sequence = 0, timer, lastInput, lastRoutes;
    let skillLevels = {}, levelSignature, levelOptions = {};

    function field(parent, label, control) {
      const row = node("label", "planner-preview-field");
      control.dataset.ha4 = "planner-field";
      control.setAttribute("aria-label", label);
      row.append(node("span", "planner-field-label", label), control);
      parent.append(row);
      return control;
    }
    function numeric(parent, label, min = 0, step = 1) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = min;
      input.step = step;
      input.placeholder = "0";
      return field(parent, label, input);
    }
    const scenario = node("div", "planner-preview-fields");
    field(scenario, "ルール", mode);
    const rank = field(scenario, "完成時のランク", document.createElement("select"));
    const season = document.createElement("input");
    season.type = "datetime-local";
    field(scenario, "シーズン終了日時（JST・任意）", season);
    const generation = numeric(inputs, "世代値", 0, .1);
    generation.removeAttribute("placeholder");
    const bonus = Object.fromEntries(Object.entries(stats).map(([id, label]) => [id, numeric(inputs,
      `${label}ボーナスパラメータ${id === "cri" || id === "cdmg" ? "（%）" : ""}`, 0, id === "cri" || id === "cdmg" ? .01 : 1)]));

    const manually = node("details", "planner-preview-section");
    const manualFields = node("div", "planner-preview-fields");
    const manualStats = Object.fromEntries(Object.entries(stats).slice(0, 7).map(([id, label]) =>
      [id, numeric(manualFields, `${label}（%）`, 0, .01)]));
    const manualApt = Object.fromEntries(mainElements.map(id => [id, numeric(manualFields, `${aptitudes[id]}適正（%）`, 0, .01)]));
    manually.append(node("summary", "planner-action", "AF補正を手入力"), manualFields);
    accessory.append(artifacts.root, manually);
    const allySlots = Array.from({ length: 5 }, (_, i) => field(teamFields, `味方 ${i + 1}`, document.createElement("select")));
    const fromGroup = button("同じグループから追加", () => {
      const draft = getDraft();
      const group = draft.group.trim().replace(/\s+/g, " ");
      const peers = getRoutes().filter(entry => entry.group === group && entry.id !== draft.id && entry.baseMonsterId);
      for (const [index, control] of allySlots.entries()) control.value = peers[index]?.id ?? "";
      refresh();
    });
    team.append(node("summary", "planner-action", "編成する味方（保存済みルート）"), fromGroup, teamFields);
    body.append(scenario, baseline, inputs, accessory, team, status, output);
    root.append(enabled, body);
    for (const control of [mode, rank, season, generation, ...Object.values(bonus), ...allySlots,
      ...Object.values(manualStats), ...Object.values(manualApt)]) {
      control.addEventListener(control.tagName === "SELECT" ? "change" : "input", () => refresh());
    }
    root.addEventListener("toggle", () => {
      if (root.open) refresh(true);
    });
    document.addEventListener("hako-af:planner-season", () => { if (mode.value === "official") refresh(true); });
    const refreshLevels = () => { levelSignature = undefined; if (root.closest("dialog")?.open) refresh(true); };
    document.addEventListener("hako-af:planner-levels-ready", refreshLevels);
    window.addEventListener("storage", event => {
      if (event.key?.startsWith("hakoAf4000:planner-levels:")) refreshLevels();
    });

    function getValues() {
      return { mode: mode.value, rank: rank.value ? Number(rank.value) : null, generation: optional(generation),
        seasonEnd: season.value, bonus: valuesOf(bonus), manualStats: valuesOf(manualStats),
        manualApt: valuesOf(manualApt), allies: allySlots.map(control => control.value), afs: artifacts.get(), skillLevels: { ...skillLevels } };
    }

    function valuesOf(controls) {
      return Object.fromEntries(Object.entries(controls).flatMap(([id, control]) =>
        optional(control) == null ? [] : [[id, optional(control)]]));
    }

    function renderOptions(restore) {
      const draft = getDraft();
      const routes = getRoutes().filter(route => route.baseMonsterId);
      const signature = JSON.stringify(routes.map(({ id, name, group }) => [id, name, group]));
      if (restore || signature !== lastRoutes) {
        const groups = new Map();
        for (const route of routes) {
          const label = route.group || "グループなし";
          if (!groups.has(label)) groups.set(label, []);
          groups.get(label).push(route);
        }
        const choices = [...groups].map(([label, records]) => {
          const group = document.createElement("optgroup");
          group.label = label;
          group.append(...records.map(route => new Option(route.name, route.id)));
          return group;
        });
        for (const [index, control] of allySlots.entries()) {
          const value = restore ? restore.allies?.[index] : control.value;
          control.replaceChildren(new Option("空き", ""), ...choices.map(group => group.cloneNode(true)));
          if (value && !routes.some(route => route.id === value)) control.add(new Option("削除済みの育成ルート", value));
          control.value = value ?? "";
        }
        lastRoutes = signature;
      }
      const species = draft.monster;
      const rankValue = restore ? restore.rank : rank.value ? Number(rank.value) : null;
      const base = Number(species?.rank) || 1;
      const maximum = Math.max(base, 6);
      if (rank.dataset.base !== String(base) || restore) {
        rank.replaceChildren(new Option(`最大 Rank ${maximum}`, ""), ...Array.from({length: maximum - base + 1},
          (_, index) => new Option(`Rank ${base + index}`, String(base + index))));
        rank.dataset.base = String(base);
        rank.value = rankValue >= base && rankValue <= maximum ? String(rankValue) : "";
      }
      const group = draft.group.trim().replace(/\s+/g, " ");
      fromGroup.disabled = !group || !routes.some(route => route.group === group && route.id !== draft.id);
    }

    function load(saved = {}) {
      artifacts.load(saved.afs);
      skillLevels = { ...saved.skillLevels };
      levelSignature = undefined;
      for (const [control, value] of [[generation, saved.generation], [season, saved.seasonEnd]]) {
        control.value = value ?? "";
      }
      for (const [controls, results] of [[bonus, saved.bonus], [manualStats, saved.manualStats], [manualApt, saved.manualApt]]) {
        for (const [id, control] of Object.entries(controls)) control.value = results?.[id] ?? "";
      }
      mode.value = saved.mode === "official" ? "official" : "normal";
      renderOptions(saved);
      lastInput = undefined;
      refresh();
    }

    function skills(route) {
      return [...new Set([...route.ordinary, ...route.permanent].map(name =>
        route.previewSkillIds?.[name] ?? resolveSkill(name)).filter(Boolean))];
    }

    function skillLevelField({ id, name }) {
      const host = node("span", "planner-skill-level");
      host.dataset.skillRef = id;
      host.dataset.skillName = name;
      drawSkillLevel(host);
      return host;
    }

    function drawSkillLevel(host) {
      const { skillRef: ref, skillName: name } = host.dataset;
      const data = levelOptions.available?.[ref];
      const savedLevel = Number(skillLevels[ref]) || 1;
      host.replaceChildren();
      if (data || savedLevel > 1) {
        const options = [...new Set([...(data?.options ?? [1]), savedLevel])].sort((a, b) => a - b);
        const control = node("select", "planner-skill-level-select");
        control.setAttribute("aria-label", `${name}のスキルLv`);
        control.append(...options.map(level => new Option(`Lv${level}`, String(level))));
        control.value = String(savedLevel);
        control.addEventListener("change", () => {
          const level = Number(control.value);
          if (level > 1) skillLevels[ref] = level;
          else delete skillLevels[ref];
          onPreviewChange();
          refresh();
          for (const peer of root.closest("dialog").querySelectorAll('[data-ha4="planner-skill-level"]')) {
            if (peer === host || peer.dataset.skillRef !== ref) continue;
            drawSkillLevel(peer);
          }
        });
        host.append(control);
      }
      if (data && !data.loaded || !data && (!levelOptions.targetsLoaded || savedLevel > 1)) {
        const caption = data ? "Lv効果を読む" : "Lv対応を確認";
        const link = node("a", "planner-action", caption);
        link.setAttribute("aria-label", `${name}の${caption}`);
        link.href = "/skill-levels?skill=" + encodeURIComponent((ref.startsWith("p.") ? "passive:" : "skill:") + ref.slice(2));
        link.target = "_blank";
        link.rel = "noopener";
        host.append(link);
      }
      host.hidden = !host.childElementCount;
    }

    function refresh(force = false) {
      renderOptions();
      const official = mode.value === "official";
      season.parentElement.hidden = !official;
      baseline.hidden = official;
      accessory.hidden = official;
      inputs.hidden = official;
      const draft = getDraft();
      const chosenSkills = skills(draft);
      if (draft.rank6Passive?.enabled) chosenSkills.push("p." + draft.rank6Passive.id);
      const nextLevels = JSON.stringify(draft.rank6Passive?.enabled === false ? [...chosenSkills, "p." + draft.rank6Passive.id] : chosenSkills);
      if (nextLevels !== levelSignature) {
        levelSignature = nextLevels;
        document.dispatchEvent(new CustomEvent("hako-af:read-planner-levels", { detail: nextLevels }));
      }
      if (!root.open) return;
      if (!draft.species) {
        status.textContent = "育成対象のホムンクルスを選んでください。";
        output.replaceChildren();
        return;
      }
      const values = getValues();
      const arts = [...values.afs];
      if (Object.keys(values.manualStats).length || Object.keys(values.manualApt).length) arts.push({
        params: values.manualStats,
        traits: Object.entries(values.manualApt).map(([id, value]) => ({ key: "add_appropriate_" + id, value: value / 100 }))
      });
      const allRoutes = getRoutes();
      const request = { mode: values.mode, seasonEnd: values.seasonEnd, arts,
        missingRouteCount: values.allies.filter(id => id && !allRoutes.some(route => route.id === id && route.baseMonsterId)).length,
        member: { ...values, afs: undefined, allies: undefined, species: draft.species, rank: values.rank ?? 6,
          name: draft.name || draft.monster?.name, skills: chosenSkills, rank6Enabled: draft.rank6Passive?.enabled },
        allies: values.allies.flatMap(id => {
          const route = allRoutes.find(item => item.id === id);
          return route?.baseMonsterId ? [{ name: route.name, species: route.baseMonsterId, skills: skills(route),
            rank: route.preview?.rank ?? 6, generation: route.preview?.generation,
            bonus: route.preview?.bonus, skillLevels: route.preview?.skillLevels, rank6Enabled: route.rank6Passive?.enabled }] : [];
        }) };
      const input = JSON.stringify(request);
      if (!force && input === lastInput) return;
      lastInput = input;
      clearTimeout(timer);
      output.replaceChildren();
      status.textContent = "試算中…";
      const id = ++sequence;
      timer = setTimeout(() => document.dispatchEvent(new CustomEvent("hako-af:calculate-training-preview", {
        detail: JSON.stringify({ id, ...request })
      })), 150);
    }

    function drawTable(title, rows, columns) {
      const wrap = node("div", "planner-preview-table-wrap");
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", title);
      const table = node("table", "planner-preview-table");
      table.append(node("caption", "planner-section-title", title));
      const header = table.createTHead().insertRow();
      for (const column of columns) header.append(node("th", "planner-preview-column", column));
      const content = table.createTBody();
      for (const [name, ...values] of rows) {
        const row = content.insertRow();
        row.append(node("th", "planner-preview-label", name));
        for (const value of values) row.insertCell().textContent = value;
      }
      wrap.append(table);
      return wrap;
    }

    function renderResult(report) {
      if (report.missing) {
        status.textContent = report.missing;
        return;
      }
      const { member, stages: [self, artifacts, completed], official } = report;
      status.textContent = `戦闘開始時点の試算 · Lv${numbers.format(member.level)} · Rank ${member.rank}` +
        (official ? " · 公式戦" : ` · 世代 ${numbers.format(member.generation)} · 上限潜在評価値 ${numbers.format(member.potential)}`);
      const pct = (after, before) => after === before ? "—" : before ?
        signed.format((after / before - 1) * 100) + "%" : signed.format(after - before);
      const points = (after, before) => Math.abs(after - before) < 1e-9 ? "—" : signed.format((after - before) * 100) + "pt";
      const columns = ["基準", "完成時", "本人", ...(official ? [] : ["AF"]), "味方"];
      const rows = Object.entries(stats).map(([key, label]) => {
        const values = [numbers.format(member.base[key]), numbers.format(completed.values[key]),
          pct(self.values[key], member.base[key]), ...(official ? [] : [pct(artifacts.values[key], self.values[key])]),
          pct(completed.values[key], artifacts.values[key])];
        const finals = completed.final[key];
        return [label, ...values, finals ? signed.format(finals * 100) + "%" : "—"];
      });
      output.replaceChildren(drawTable("ステータス", rows, ["項目", ...columns, "最終補正"]));
      const aptRows = Object.keys(completed.apt).map(key => {
        const label = aptitudes[key] ?? resolveAptitude(key) ?? key;
        return [label + "適正", numbers.format(member.apt[key] * 100) + "%", numbers.format(completed.apt[key] * 100) + "%",
          points(self.apt[key], member.apt[key]), ...(official ? [] : [points(artifacts.apt[key], self.apt[key])]),
          points(completed.apt[key], artifacts.apt[key])];
      });
      output.append(drawTable("適正", aptRows, ["項目", ...columns]));
      if (completed.checks.length) {
        const checks = node("ul", "planner-preview-checks");
        for (const check of completed.checks) {
          const label = resolveSkill("p." + check.id, true) ?? check.id;
          const element = aptitudes[check.key] ?? resolveAptitude(check.key) ?? check.key;
          checks.append(node("li", "planner-preview-check",
            `${label} · ${element}適正 ${numbers.format(check.value * 100)}% / ${numbers.format(check.threshold * 100)}%超 · ${check.reached ? "達成" : "未達成"}`));
        }
        output.append(checks);
      }
      if (report.names.length > 1) output.append(node("p", "planner-hint", "編成した味方 " + report.names.slice(1).join("、")));
      if (report.missingAllies) output.append(node("p", "planner-status", "一部の味方のデータを読み込めませんでした。"));
      if (report.missingLevels?.length) output.append(node("p", "planner-status",
        report.missingLevels.map(ref => resolveSkill(ref, true) ?? ref).join("、") +
        "の指定Lvの効果は未読み込みです。Lv1で試算しています。"));
      if (official) {
        const rule = `素の高ランク ${official.natural}/${official.naturalLimit}体・昇格 ${official.promoted}/${official.promotedLimit}体`;
        output.append(node("p", official.valid ? "planner-hint" : "planner-status",
          official.valid ? rule : "公式戦の編成上限を超えています · " + rule));
        const limit = official.cutoff ? dates.format(official.cutoff) + "（日本時間）" : "";
        output.append(node("p", "planner-hint", limit ? `${limit}以降に追加されたスキルを除外` :
          "公式戦を開くか終了日時を指定すると、新スキルの使用制限を判定します。"));
        if (report.blocked.length) output.append(node("p", "planner-status",
          report.blocked.map(({ ref, member }) => `${member}の${resolveSkill(ref, true) ?? ref}`).join("、") + "は使用制限の対象です。"));
      }
      output.append(node("p", "planner-hint", "本人・AF・味方は、直前の値からの増減です。最終補正は完成時の値に含まれます。"),
        node("p", "planner-hint", "対応する開幕効果の試算です。ランダム発動、召喚、敵の状態や複数効果の発動順に依存する結果は変動します。"));
    }

    document.addEventListener("hako-af:planner-level-options", event => {
      if (typeof event.detail !== "string") return;
      try { levelOptions = JSON.parse(event.detail); } catch { return; }
      for (const host of root.closest("dialog")?.querySelectorAll('[data-ha4="planner-skill-level"]') ?? []) drawSkillLevel(host);
    });
    document.addEventListener("hako-af:training-preview", event => {
      if (!root.open || typeof event.detail !== "string") return;
      let report;
      try { report = JSON.parse(event.detail); } catch { return; }
      if (report.id === sequence) renderResult(report);
    });
    return { root, load, getValues, refresh, skillLevelField };
  }

  globalThis.hakoAfTrainingPreview = create;
})();
