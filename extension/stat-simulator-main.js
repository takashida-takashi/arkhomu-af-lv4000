(() => {
  "use strict";
  if (window.top !== window || globalThis.hakoAfFrameContext?.active === false) return;
  const model = globalThis.hakoAfTrainingModel, solver = globalThis.hakoAfStatCompensation;
  const partyShare = globalThis.hakoAfPartyShareMain;
  const readMasters = globalThis.hakoAfTrainingSources?.readMasters;
  if (!model || !solver) return;
  const { stats } = solver, keys = Object.keys(stats), fmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
  const props = () => document.getElementById("__nuxt")?.__vue_app__?.config?.globalProperties;
  const element = (tag, text, kind) => { const el = document.createElement(tag);if (text != null) el.textContent = text;if (kind) el.dataset.ha4 = kind;return el; };
  const button = (text, action) => { const b = element("button", text, "extra-button");b.type = "button";b.addEventListener("click", action);return b; };
  let dialog, data, imported, scenario = {}, arts = [], timer, validInputs = false;
  const copiedButtons = new WeakMap();
  function routes() { try { return JSON.parse(localStorage.getItem("ha4-training-routes-v2"))?.routes ?? []; } catch { return []; } }
  function routeSkills(route) {
    const reserved = new Set(route.reserved ?? []);
    const refs = [...(route.ordinary ?? []), ...(route.permanent ?? [])].filter(name => !reserved.has(name)).map(name => route.previewSkillIds?.[name]).filter(ref => /^[sp]\./.test(ref ?? ""));
    if (route.rank6Passive?.enabled) refs.push("p." + route.rank6Passive.id);
    return [...new Set(refs)];
  }
  async function masters() {
    const p = props(), build = p?.$config?.public?.buildId ?? p?.$nuxt?.$config?.public?.buildId;
    let result = await readMasters?.(build, "game-config");
    if (!result?.monsters?.length || !result?.passives?.length) {
      try {
        const tools = await partyShare.getReaders();
        const app = document.getElementById("__nuxt")?.__vue_app__;
        const run = p.$nuxt?.runWithContext?.bind(p.$nuxt) ?? app.runWithContext.bind(app);
        const native = run(() => tools.masters());
        await native.ensureLoaded?.();
        result = await readMasters?.(build, "game-config");
      } catch { /* Explain the missing catalogue below. */ }
    }
    if (!result?.monsters?.length || !result?.["game-config"]?.monster) throw Error("図鑑データを読み込めませんでした。図鑑を一度開いてからお試しください。");
    return result;
  }
  const label = master => { const name = props()?.$t?.(master.name_key);return name && name !== master.name_key ? name : master.name ?? master.id; };

  function mount() {
    if (dialog) return;
    dialog = element("dialog", null, "stat-simulator");
    dialog.setAttribute("aria-label", "拡張ステータスシミュレーター");
    dialog.innerHTML = `<header><h2>拡張ステータスシミュレーター</h2><button type="button" data-stat-close>閉じる</button></header>
      <div class="ha4-stat-body"><section><h3>現状を読み込む</h3>
      <p>ホム詳細の「拡張コピー」を貼り付けると、世代・ボナパラ・スキル・AFを読み込めます。</p>
      <textarea aria-label="性能コピーまたは拡張コピー" rows="3" placeholder="性能をコピー／拡張コピーの内容を貼り付け"></textarea>
      <div class="ha4-stat-actions" data-stat-import-actions></div><p data-stat-import-note></p>
      <div class="ha4-stat-fields"><label>ホムを検索<input type="search" data-stat-search placeholder="ホムンクルス名"></label>
      <label>育成するホム<select data-stat-species></select></label><label>世代値<input type="number" data-stat-gen min="0" max="1000000000" step="any" value="2129.1"></label>
      <label>完成時のランク<input type="number" data-stat-rank min="1" max="7" value="7"></label><label>AF装備枠<select data-stat-loadout><option value="normal">通常</option><option value="boss">ボス／天昇の塔</option><option value="pvp">PvP</option></select></label></div>
      <p data-stat-level></p><label class="ha4-stat-extra-toggle"><input type="checkbox" data-stat-extras>追加の通常／最終補正も入力</label><div class="ha4-stat-scroll"><table data-stat-inputs><thead><tr><th>項目</th><th>現在のボナパラ</th><th>AF合計（%）</th><th>追加の通常補正（%）</th><th>追加の最終補正（%）</th></tr></thead><tbody></tbody></table></div>
      <details><summary>パッシブ・育成ルート</summary><div class="ha4-stat-actions" data-stat-route-actions></div><p data-stat-skills>スキル未指定</p>
      <p>拡張コピー／ルートの使用中スキルを使います。追加補正欄には、まだ含めていない補正だけを入力してください。</p></details>
      </section>
      <section><h3>AF・世代・ボナパラを換算する</h3>
      <label class="ha4-stat-fields">比較方法<select data-stat-view><option value="goal">不足分を補う</option><option value="exchange">変更前後を換算する</option></select></label>
      <div data-stat-goal>
      <label class="ha4-stat-extra-toggle"><input type="checkbox" data-stat-multiple>複数項目をまとめて補う</label>
      <div data-stat-single><div class="ha4-stat-fields"><label>補う項目<select data-stat-target></select></label>
      <label>不足分の種類<select data-stat-source><option value="bonus">ボナパラ</option><option value="af">AF合計（pt）</option><option value="generation">世代（増分）</option></select></label>
      <label><span data-stat-amount-label>不足するボナパラ</span><input type="number" data-stat-deficit min="0" max="1000000000000" value="140000"></label>
      <label>組み合わせ比較の世代値<input type="number" data-stat-mixed min="0" max="1000000000" step="any" value="5000"></label></div></div>
      <div data-stat-multi hidden><div data-stat-rules></div><div data-stat-rule-actions class="ha4-stat-actions"></div></div>
      <p>不足分は現状への増加量で指定します。AF +100ptは、合計200%から300%に増やす意味です。</p></div>
      <div data-stat-exchange hidden><div class="ha4-stat-fields">
      <label>変更するもの<select data-stat-kind><option value="generation">世代</option><option value="af">AF合計（%）</option><option value="bonus">ボナパラ</option></select></label>
      <label data-stat-exchange-target hidden>対象の能力<select data-stat-exchange-stat></select></label>
      <label><span data-stat-before-label>変更前の世代</span><input data-stat-before type="number" min="0" max="1000000000" step="any" value="2000"></label>
      <label><span data-stat-after-label>変更後の世代</span><input data-stat-after type="number" min="0" max="1000000000" step="any" value="6000"></label></div>
      <p>比較の開始値は「変更前」です。他の内訳はそのまま使います。世代の変更は全7能力、AF・ボナパラは選んだ能力を換算します。</p></div></section>
      <div class="ha4-stat-actions" data-stat-apply></div>
      <section data-stat-summary><h3>試算結果</h3>
      <p role="status" data-stat-status>現状の内訳を読み込むか、入力して試算してください。</p><div data-stat-results></div>
      <p>最大Lvまで育成した通常モード・戦闘開始時の比較です。他の入力とスキル構成は固定します。条件付き効果、ランダム発動、未対応の効果などで実際の値と差が出る場合があります。</p>
      <p>通常の性能コピーだけでは、AF・ボナパラ・パッシブの内訳は復元できません。AFの数値は5枠の合計で、AFを実際に入手できる確率は含みません。</p></section></div>`;
    document.body.append(dialog);
    dialog.querySelector("[data-stat-close]").addEventListener("click", () => dialog.close());
    const importActions = dialog.querySelector("[data-stat-import-actions]");
    importActions.append(button("コピー内容を読み込む", importText), button("現在装備中のAFを読み込む", readEquipped));
    dialog.querySelector("[data-stat-apply]").append(button("入力した内訳で試算", () => { validInputs = true;refresh();control("summary").scrollIntoView({ block: "start" }); }));
    const tbody = dialog.querySelector("[data-stat-inputs] tbody");
    for (const [key, name] of Object.entries(stats)) {
      const row = element("tr");row.append(element("th", name));
      for (const column of ["bonus", "af", "rate", "final"]) {
        const td = element("td"), input = element("input");input.type = "number";input.value = "0";
        input.min = column === "rate" || column === "final" ? "-99" : "0";input.max = "1000000000000";
        input.step = column === "bonus" ? "1" : ".01";input.dataset.statKey = key;input.dataset.statColumn = column;
        input.setAttribute("aria-label", `${name}${{ bonus: "ボーナスパラメータ", af: "AF合計", rate: "追加の通常補正", final: "追加の最終補正" }[column]}`);
        td.append(input);row.append(td);
      }
      tbody.append(row);
      dialog.querySelector("[data-stat-target]").append(new Option(name, key));
      control("exchange-stat").append(new Option(name, key));
    }
    control("view").addEventListener("change", () => {
      const exchange = control("view").value === "exchange";
      control("goal").hidden = exchange;control("exchange").hidden = !exchange;
      if (exchange && !control("exchange").dataset.ready) { resetExchange();control("exchange").dataset.ready = "1"; }
    });
    for (const name of ["kind", "exchange-stat"]) control(name).addEventListener("change", resetExchange);
    dialog.querySelector("[data-stat-search]").addEventListener("input", drawSpecies);
    control("multiple").addEventListener("change", () => {
      control("single").hidden = control("multiple").checked;control("multi").hidden = !control("multiple").checked;refresh();
    });
    control("source").addEventListener("change", () => {
      const source = control("source").value;
      control("amount-label").textContent = { bonus: "不足するボナパラ", af: "不足するAF合計（pt）", generation: "不足する世代（増分）" }[source];
      control("deficit").step = source === "af" ? ".01" : source === "generation" ? ".1" : "1";
    });
    control("rule-actions").append(button("項目を追加", () => { addRule();schedule(); }));addRule();
    control("extras").addEventListener("change", () => { dialog.dataset.statExtra = String(control("extras").checked); });
    dialog.querySelector("[data-stat-loadout]").addEventListener("change", () => {
      arts = imported?.loadouts?.[dialog.querySelector("[data-stat-loadout]").value] ?? [];
      setAfFields();refresh();
    });
    dialog.addEventListener("input", event => { if (event.target.tagName !== "TEXTAREA" && !event.target.matches("[data-stat-search]")) schedule(); });
    dialog.addEventListener("change", event => { if (event.target.tagName === "SELECT") schedule(); });
  }
  const control = name => dialog.querySelector(`[data-stat-${name}]`);
  function resetExchange() {
    const kind = control("kind").value, stat = control("exchange-stat").value;
    const from = kind === "generation" ? Number(control("gen").value) : values(kind === "af" ? "af" : "bonus")[stat];
    const max = { generation: 1e9, af: 1e6, bonus: 1e12 }[kind], name = { generation: "世代", af: "AF合計（%）", bonus: "ボナパラ" }[kind];
    control("before").value = from;control("after").value = Math.min(max, from + { generation: 4000, af: 100, bonus: 10000 }[kind]);
    for (const key of ["before", "after"]) { control(key).max = max;control(key).step = kind === "bonus" ? "1" : "any"; }
    control("before-label").textContent = "変更前の" + name;control("after-label").textContent = "変更後の" + name;
    control("exchange-target").hidden = kind === "generation";
  }
  function addRule() {
    const host = control("rules"), used = new Set([...host.querySelectorAll('[data-rule="stat"]')].map(el => el.value));
    const next = keys.find(key => !used.has(key));if (!next) return;
    const row = element("div");row.className = "ha4-stat-fields";row.dataset.statRule = "";
    function select(name, title, entries, selected) {
      const label = element("label", title), select = element("select");select.dataset.rule = name;
      select.setAttribute("aria-label", title);select.append(...entries.map(([key, text]) => new Option(text, key)));select.value = selected;
      label.append(select);row.append(label);return select;
    }
    select("stat", "補う能力", Object.entries(stats), next);
    const types = [["bonus", "ボナパラ"], ["af", "AF合計（pt）"], ["generation", "世代（増分）"]];
    const source = select("source", "不足分の種類", types, "bonus");
    const label = element("label", "不足分"), input = element("input");input.type = "number";input.min = "0";input.max = "1000000000000";
    input.step = "1";input.value = next === "hp" ? "140000" : "10000";input.dataset.rule = "amount";input.setAttribute("aria-label", "不足分");label.append(input);row.append(label);
    source.addEventListener("change", () => { input.step = source.value === "af" ? ".01" : source.value === "generation" ? ".1" : "1"; });
    select("via", "補う方法", [["af", "AF"], ["generation", "世代"], ["bonus", "ボナパラ"]], "af");
    row.append(button("削除", () => { row.remove();schedule(); }));host.append(row);
  }
  const cells = column => [...dialog.querySelectorAll(`[data-stat-column="${column}"]`)];
  function values(column) { return Object.fromEntries(cells(column).map(el => [el.dataset.statKey, Number(el.value)])); }
  function setFields(column, values = {}) { for (const el of cells(column)) el.value = String(Math.round((values[el.dataset.statKey] ?? 0) * 1e6) / 1e6); }
  function afSum() { return Object.fromEntries(keys.map(key => [key, arts.reduce((n, af) => n + (Number(af.params?.[key]) || 0), 0)])); }
  function setAfFields() { setFields("af", afSum()); }
  function drawSpecies(forced) {
    if (!data) return;
    const selected = typeof forced === "string" ? forced : control("species").value || scenario.species, query = control("search").value.normalize("NFKC").trim();
    const rows = data.monsters.filter(x => !x.summon_only && (!query || label(x).normalize("NFKC").includes(query)));
    const shown = rows.slice(0, 80), current = data.monsters.find(x => x.id === selected);
    if (current && !shown.includes(current)) shown.unshift(current);
    control("species").replaceChildren(...shown.map(x => new Option(`${label(x)} · Rank ${x.rank}`, x.id)));
    if (current) control("species").value = current.id;
  }
  function routeOptions() {
    const host = control("route-actions"), picker = element("select");
    picker.setAttribute("aria-label", "読み込む育成ルート");picker.append(new Option("育成ルートを選択", ""), ...routes().map(r => new Option(`${r.group ? r.group + " / " : ""}${r.name}`, r.id)));
    host.replaceChildren(picker, button("ルートを反映", () => {
      const all = routes(), route = all.find(r => r.id === picker.value);if (!route) return;
      scenario.skills = routeSkills(route);scenario.skillLevels = route.preview?.skillLevels ?? {};scenario.skillDefinitions = {};
      scenario.rank6Enabled = route.rank6Passive?.enabled !== false;
      scenario.allies = route.group ? all.filter(r => r.group === route.group && r.id !== route.id && r.baseMonsterId).slice(0, 5).map(r => ({
        species: r.baseMonsterId, name: r.name, skills: routeSkills(r), rank: r.preview?.rank ?? 6,
        generation: r.preview?.generation, skillLevels: r.preview?.skillLevels, rank6Enabled: r.rank6Passive?.enabled })) : [];
      showSkills();schedule();
    }));
  }
  function showSkills() {
    const names = (scenario.skills ?? []).map(ref => {
      const master = (ref.startsWith("p.") ? data.passives : data.skills)?.find(x => x.id === ref.slice(2));
      return (master ? label(master) : ref) + ((scenario.skillLevels?.[ref] ?? 1) > 1 ? ` Lv${scenario.skillLevels[ref]}` : "");
    });
    control("skills").textContent = `${names.length}件 · 味方 ${scenario.allies?.length ?? 0}体` + (names.length ? " · " + names.join("、") : " · スキル未指定");
    if (scenario.training) control("skills").textContent += ` · ${scenario.training.source === "chip" ? "強化チップ" : "訓練所"}補正あり`;
  }
  function importText() {
    try {
      const value = solver.parse(dialog.querySelector("textarea").value);
      if (value.format === "native") {
        const text = value.name.normalize("NFKC");
        const species = data.monsters.filter(x => !x.summon_only && text.includes(label(x).normalize("NFKC"))).sort((a, b) => label(b).length - label(a).length)[0];
        if (!species) throw Error("コピー内のホムを特定できませんでした。ホムを検索して選択してください。");
        scenario = { ...value, species: species.id, skills: [], allies: [] };imported = null;arts = [];
        validInputs = false;
        control("import-note").textContent = "通常コピーを読み込みました。内訳は未取得です。ボナパラ・AF・パッシブを指定して「入力した内訳で試算」を押してください。未入力の欄は0として試算します。";
      } else {
        imported = value;scenario = { ...value, allies: value.allies ?? [] };
        arts = value.loadouts?.[control("loadout").value] ?? [];
        validInputs = value.afsLoaded === true;
        control("import-note").textContent = value.afsLoaded ? "拡張コピーの内訳を読み込みました。" : "AFの取得を確認できません。AF一覧を開いてから、現在装備中のAFを読み込んでください。";
        if (value.public) control("import-note").textContent = "他のプレイヤーの公開情報を読み込みました。AF・強化チップは不明です。比較したい補正を入力して「入力した内訳で試算」を押してください。表示されていたステータスも比較用に保持しています。";
        if (value.skillsUnavailable) control("import-note").textContent += " スキルは非公開のため読み込んでいません。";
        if (value.trainingLoaded === false) control("import-note").textContent += " 訓練所・強化チップの補正は未取得です。必要なら追加補正欄で指定してください。";
      }
      control("gen").value = scenario.generation;control("rank").value = scenario.rank ?? 6;
      setFields("bonus", scenario.bonus);setFields("rate");setFields("final");setAfFields();
      drawSpecies(scenario.species);control("species").value = scenario.species;showSkills();
      if (control("view").value === "exchange") resetExchange();refresh();
    } catch (error) { validInputs = false;control("results").replaceChildren();control("import-note").textContent = "コピーを読み込めませんでした。";control("status").textContent = error.message; }
  }
  function readEquipped() {
    const store = props()?.$pinia?._s?.get("userItems"), mode = control("loadout").value;
    if (!store?.isEquippedArtifactsLoaded && !store?.isArtifactsLoaded) { control("status").textContent = "標準のAF一覧を一度開いてからお試しください。";return; }
    arts = (store.allArtifacts ?? []).filter(item => mode === "boss" ? item._artifact?.is_equipped_boss : mode === "pvp" ? item._artifact?.is_equipped_rating :
      (item._artifact?.is_equipped_normal ?? item._artifact?.is_equipped)).slice(0, 5).map(item => ({
        params: item._artifact.params ?? {}, traits: item._artifact.traits ?? [], passive: item.m_items?.artifact_passive ?? item.artifact_passive }));
    setAfFields();control("import-note").textContent = `装備中のAF ${arts.length}個を読み込みました。`;
    if (imported) { validInputs = true;refresh(); }
  }
  function schedule() { clearTimeout(timer);timer = setTimeout(refresh, 150); }
  function refresh() {
    if (!dialog?.open || !data) return;
    const species = control("species").value, generation = Number(control("gen").value), rank = Number(control("rank").value);
    const targetStat = control("target").value, deficit = Number(control("deficit").value), mixedGeneration = Number(control("mixed").value);
    const base = { ...scenario, species, generation, rank, bonus: values("bonus"), skills: [...(scenario.skills ?? []), "p.ha4_sim_manual"] };
    const cap = model.settings(base, data["game-config"], false);
    control("level").textContent = `世代から決まる完成Lv ${fmt.format(cap.level)} · 潜在上限 ${fmt.format(cap.potential)}（この値に加えLv成長を計算）`;
    if (!validInputs) { control("status").textContent = "AFなど不明な内訳を指定し、「入力した内訳で試算」を押してください。";control("results").replaceChildren();return; }
    const invalid = [...dialog.querySelectorAll('input[type="number"]')].filter(input => !input.closest("[hidden]")).some(input => !input.value || !input.checkValidity() || !Number.isFinite(Number(input.value)));
    if (invalid) { control("status").textContent = "数値入力を確認してください。";control("results").replaceChildren();return; }
    const currentAf = values("af"), nativeAf = afSum(), extraRate = values("rate"), extraFinal = values("final");
    const effects = keys.flatMap(key => [extraRate[key] && { type: "param", effect: "add_param", target_stat: key, value: extraRate[key] / 100 },
      extraFinal[key] && { type: "param", effect: "add_fix_param", target_stat: key, value: extraFinal[key] / 100 }].filter(Boolean));
    const catalogue = { ...data, passives: [...(data.passives ?? []), { id: "ha4_sim_manual", effects }] };
    const unknown = (scenario.skills ?? []).filter(ref => !(ref.startsWith("p.") ? data.passives : data.skills)?.some(item => item.id === ref.slice(2)));
    if (unknown.length) { control("status").textContent = `${unknown.length}件のスキルの図鑑データが未取得です。図鑑を開いてから読み直してください。`;return; }
    const evaluate = changes => {
      const races = data.monsters.find(item => item.id === species)?.race ?? [];
      const racial = races.reduce((n, race) => n + (Number(scenario.training?.raceParams?.[race]) || 0), 0) * 100;
      const params = Object.fromEntries(keys.map(key => [key, currentAf[key] - nativeAf[key] +
        (Number(scenario.training?.params?.[key]) || 0) * 100 + (["atk", "mtk", "def", "mdf"].includes(key) ? racial : 0)]));
      for (const key of keys) if (changes.af?.[key] != null) params[key] += changes.af[key] - currentAf[key];
      const member = { ...base, generation: changes.generation ?? generation,
        bonus: Object.fromEntries(keys.map(key => [key, base.bonus[key] + (changes.bonus?.[key] ?? 0)])) };
      const report = model.calculate({ member, mode: "normal", arts: [...arts, { params }], allies: scenario.allies ?? [] }, catalogue, NaN);
      if (report.missing) throw Error(report.missing);
      if (report.missingLevels?.length) throw Error("一部のスキルLvの効果が未取得です。個体詳細から拡張コピーを読み直すか、プランナーで効果を読み込んでください。");
      return report.stages[2].values;
    };
    try {
      if (control("view").value === "exchange") {
        renderExchange(solver.exchange({ evaluate, source: control("kind").value, stat: control("exchange-stat").value,
          from: Number(control("before").value), to: Number(control("after").value), generation, af: currentAf, bonus: base.bonus }));return;
      }
      if (control("multiple").checked) {
        const rules = [...control("rules").children].map(row => Object.fromEntries(["stat", "source", "via", "amount"].map(key => [key,
          key === "amount" ? Number(row.querySelector(`[data-rule="${key}"]`).value) : row.querySelector(`[data-rule="${key}"]`).value])));
        renderMany(solver.solveMany({ evaluate, rules, generation, af: currentAf }), currentAf, generation);return;
      }
      const single = changes => evaluate({ generation: changes.generation,
        af: changes.afTotal == null ? {} : { [targetStat]: changes.afTotal }, bonus: { [targetStat]: changes.bonusDelta ?? 0 } });
      const result = solver.solve({ evaluate: single, stat: targetStat, deficit, source: control("source").value, generation, af: currentAf[targetStat], mixedGeneration });
      render(result, currentAf[targetStat], generation);
    } catch (error) { control("status").textContent = error.message;control("results").replaceChildren(); }
  }
  function render(result, currentAf, currentGeneration) {
    const output = control("results"), name = stats[result.stat];output.replaceChildren();
    const sourceName = { bonus: "ボナパラ", af: "AF合計", generation: "世代" }[result.source];
    control("status").textContent = `${name}${sourceName} +${fmt.format(result.deficit)}${result.source === "af" ? "pt" : ""}と同等の${name} ${fmt.format(result.target)}を目指します。`;
    const cards = element("div", null, "stat-result-cards");
    for (const [title, value] of [["AFだけで補う", result.af ? `AF合計 ${fmt.format(result.af.total)}%（+${fmt.format(result.af.extra)}pt）` : "試算上限内では届きません"],
      ["世代だけで補う", result.generation ? `${fmt.format(result.generation.total)}世代まで上げる（+${fmt.format(result.generation.extra)}世代）` : "10億世代まででは届きません"],
      ["世代とAFを組み合わせる", result.mixed ? `世代 ${fmt.format(result.mixed.generation)}・AF ${fmt.format(result.mixed.total)}%（+${fmt.format(result.mixed.extra)}pt）` : "この世代ではAFの試算上限内で届きません"]]) {
      const card = element("article");card.append(element("h4", title), element("strong", value));cards.append(card);
    }
    if (result.source !== "bonus") {
      const card = element("article");card.append(element("h4", "ボナパラだけで補う"), element("p", result.bonus ? `ボナパラ +${fmt.format(result.bonus.extra)}` : "試算上限内では届きません"));cards.append(card);
    }
    output.append(cards, element("p", `現状は世代 ${fmt.format(currentGeneration)}・${name}AF合計 ${fmt.format(currentAf)}%。「pt」はAF合計への加算量です。`));
    const table = element("table"), head = element("tr"), thead = element("thead"), tbody = element("tbody");
    for (const title of ["項目", "現状の計算値", "不足分の目標値", "AFで代替", "世代で代替"]) head.append(element("th", title));thead.append(head);
    for (const [key, label] of Object.entries(stats)) {
      const row = element("tr");if (key === result.stat) row.dataset.statTargetRow = "";
      row.append(element("th", label));for (const values of [result.base, result.goal, result.af?.values, result.generation?.values]) row.append(element("td", values ? fmt.format(values[key]) : "—"));tbody.append(row);
    }
    table.append(thead, tbody);const scroll = element("div");scroll.className = "ha4-stat-scroll";scroll.append(table);output.append(scroll);
    if (scenario.observed) {
      const differences = keys.filter(key => Number.isFinite(scenario.observed[key])).map(key => `${stats[key]} ${fmt.format(scenario.observed[key])} → ${fmt.format(result.base[key])}`);
      output.append(element("p", "通常コピーの表示値 → 現状の計算値：" + differences.join("／")));
    }
  }
  function renderExchange(result) {
    const output = control("results");output.replaceChildren();
    const names = { generation: "世代", af: "AF合計", bonus: "ボナパラ" }, units = { generation: "世代", af: "%", bonus: "" };
    const signed = n => (n >= 0 ? "+" : "") + fmt.format(n), unit = units[result.source];
    const title = (result.source === "generation" ? "" : stats[result.stat]) + names[result.source];
    control("status").textContent = "変更前の状態で、別の要素だけを変えた場合の換算です。各能力・各方法は個別の比較です。";
    const main = element("div", null, "stat-common-generation");main.append(element("h4", title + "の変更前 → 変更後"),
      element("strong", `${fmt.format(result.from)}${unit} → ${fmt.format(result.to)}${unit}`));output.append(main);
    const cards = element("div", null, "stat-result-cards");
    for (const row of result.rows) {
      const card = element("article");card.append(element("h4", stats[row.stat]));
      for (const kind of ["bonus", "af", "generation"].filter(key => key !== result.source)) {
        const value = row.equivalents[kind];
        const line = element("p");line.append(element("strong", names[kind] + "換算：" + (value ? signed(value.delta) + (kind === "af" ? "pt" : units[kind]) : "試算範囲内では換算できません")));card.append(line);
        if (value) card.append(element("p", `合計 ${fmt.format(value.from)}${units[kind]} → ${fmt.format(value.to)}${units[kind]}`));
      }
      card.append(element("p", `${stats[row.stat]}の計算値：${fmt.format(row.before)} → ${fmt.format(row.after)}（${signed(row.delta)}）`));cards.append(card);
    }
    output.append(cards, element("p", "世代による完成Lv・潜在値の変化も再計算します。換算値は、変更後のステータス以上になる最小量へ丸めています。"));
  }
  function renderMany(result, af, generation) {
    const output = control("results"), { changes } = result;output.replaceChildren();
    control("status").textContent = `${result.goals.length}項目を同時に満たす組み合わせです。`;
    const common = element("div", null, "stat-common-generation");
    common.append(element("h4", "必要な共通の世代"), element("strong", `${fmt.format(changes.generation)}世代`),
      element("p", `現在 ${fmt.format(generation)}世代から +${fmt.format(changes.generation - generation)}世代${changes.generation === generation ? "（世代の追加は不要）" : "増やします"}。他の能力への上昇も反映済みです。`));
    output.append(common);
    const cards = element("div", null, "stat-result-cards");
    for (const rule of result.goals) {
      const card = element("article"), key = rule.stat;
      const extra = rule.via === "af" ? changes.af[key] - af[key] : changes.bonus[key];
      const change = rule.via === "generation" ? "上記の共通世代で補う" : rule.via === "af" ? extra > 0 ? `AF合計 ${fmt.format(changes.af[key])}%（+${fmt.format(extra)}pt）` : `AF追加不要（合計 ${fmt.format(af[key])}%を維持）` : `ボナパラ +${fmt.format(extra)}`;
      card.append(element("h4", stats[key]), element("strong", change));
      if (rule.via === "af" && !extra) card.append(element("p", result.base[key] < rule.target && changes.generation > generation ? "共通の世代上昇で目標に届くため、AFを増やす必要はありません。" : "現在の構成で目標に届いています。"));
      card.append(element("p", `目標の${stats[key]}：${fmt.format(rule.target)}`), element("p", `試算後の${stats[key]}：${fmt.format(result.values[key])}（目標達成）`));cards.append(card);
    }
    output.append(cards);
  }
  async function open(snapshot) {
    mount();if (!dialog.open) dialog.showModal();control("status").textContent = "図鑑データを読み込み中…";
    const actions = [...dialog.querySelectorAll("[data-stat-import-actions] button,[data-stat-apply] button")];
    for (const action of actions) action.disabled = true;
    try { data = await masters();drawSpecies();routeOptions();
      if (snapshot) { dialog.querySelector("textarea").value = JSON.stringify(snapshot);importText(); }
      else { if (!scenario.species) { scenario.species = data.monsters.find(x => x.id === "apisophia_origin")?.id ?? data.monsters.find(x => !x.summon_only)?.id;drawSpecies(scenario.species); }showSkills();refresh();if (!validInputs) control("status").textContent = "現状の内訳を読み込むか、入力して試算してください。"; }
    } catch (error) { control("status").textContent = error.message; }
    finally { for (const action of actions) action.disabled = !data; }
  }
  function scan() {
    const planner = document.querySelector('[data-ha4="training-planner-launch"]');
    if (planner && !document.querySelector('[data-ha4="stat-simulator-launch"]')) {
      const launch = planner.cloneNode(true);launch.dataset.ha4 = "stat-simulator-launch";launch.removeAttribute("id");
      launch.setAttribute("aria-label", "拡張ステータスシミュレーター");launch.title = "拡張ステータスシミュレーター";
      const caption = launch.querySelector(".home-facility-label__name");
      if (caption) { caption.textContent = "拡張ステータスシミュレーター";caption.style.setProperty("--fit-len", "19"); }
      else { launch.replaceChildren(element("span", "◈"), element("span", "拡張ステータスシミュレーター"));launch.firstElementChild.style.color = "#b371e7"; }
      launch.addEventListener("click", () => { void open(); });planner.after(launch);
    }
    for (const anchor of document.querySelectorAll("[data-ha4-stat-member]")) {
      if (copiedButtons.get(anchor)?.isConnected) continue;
      const copy = button("拡張コピー", async () => {
        try {
          const snapshot = await partyShare.readSimulatorMember(anchor);
          if (!snapshot) return;
          try { await navigator.clipboard.writeText("【はこホム拡張ステータス v1】\n" + JSON.stringify(snapshot));copy.textContent = "拡張コピーしました"; }
          catch { await open(snapshot);dialog.querySelector("textarea").value = "【はこホム拡張ステータス v1】\n" + JSON.stringify(snapshot);dialog.querySelector("textarea").focus();dialog.querySelector("textarea").select(); }
          setTimeout(() => { copy.textContent = "拡張コピー"; }, 2000);
        } catch { copy.textContent = "読み込めませんでした"; }
      });
      const simulate = button("この個体をシミュレート", async () => {
        try { const snapshot = await partyShare.readSimulatorMember(anchor);if (snapshot) void open(snapshot); }
        catch { simulate.textContent = "読み込めませんでした。個体詳細を開き直してください"; }
      });
      const row = element("div");row.className = "ha4-stat-actions";row.dataset.ha4 = "stat-copy-actions";row.append(copy, simulate);anchor.append(row);copiedButtons.set(anchor, copy);
    }
  }
  setInterval(scan, 1000);
  globalThis.hakoAfStatSimulator = { open };
})();
