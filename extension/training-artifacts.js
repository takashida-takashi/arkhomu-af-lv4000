(() => {
  "use strict";

  const { POWER, SUM } = globalThis.hakoAfListRules;
  const { optionFor, groups, parameters } = globalThis.hakoAfEffects;
  const { TARGET, ratio, projected } = globalThis.hakoAf4000;
  const limit = 5;
  const numbers = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
  const dates = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeZone: "Asia/Tokyo" });
  const rankNames = ["", "コモン", "アンコモン", "レア", "エリート", "エピック", "ヒロイック", "レジェンダリー",
    "ミシック", "セレスティアル", "ディヴァイン", "トランセンデント", "エターナル"];
  const basicFields = { [SUM]: { label: "AF変換率＋ドロップ率合計", group: "basic", unit: "%" },
    [POWER]: { label: "パワー", group: "basic", unit: "" } };
  const loadouts = { normal: "通常", boss: "ボス／天昇の塔", pvp: "PvP" };
  const plainSorts = { level: "レベル", recent: "入手日", name: "名前" };
  const getOption = key => basicFields[key] ?? optionFor(key);

  function create({ node, button, onChange }) {
    let selected = [], shown = [], sequence = 0, pending, pendingImport, page = 1, pages = 1, timer, rankSignature, ready = false;
    const state = { root: { join: "and", children: [] }, useForecast: true, showUnknown: false, sortKey: "", sortDirection: "desc" };
    const root = node("section", "planner-af-summary");
    const summary = node("div", "planner-toolbar");
    const summaryCount = node("span", "planner-hint");
    const summaryCards = node("div", "planner-af-slots");
    const open = button("アーティファクトを選ぶ", () => {
      if (!dialog.isConnected) document.body.append(dialog);
      dialog.showModal();
      shown = [];
      updateSelection(selected, false);
      page = 1;
      request(undefined, true);
    });
    open.setAttribute("aria-haspopup", "dialog");
    summary.append(open, summaryCount);
    root.append(summary, summaryCards);

    const dialog = node("dialog", "planner-af-dialog");
    dialog.setAttribute("aria-label", "試算用アーティファクト");
    const head = node("header", "planner-header");
    head.append(node("h2", "planner-heading", "試算用アーティファクト"), button("閉じる", () => dialog.close()));
    const body = node("div", "planner-af-body");
    const imports = node("div", "planner-toolbar");
    imports.setAttribute("role", "group");
    imports.setAttribute("aria-label", "装備中のAFを読み込む");
    imports.append(...Object.entries(loadouts).map(([mode, label]) => button(`${label}装備を読み込む`, () => request(mode))));
    const importStatus = node("p", "planner-af-import-status");
    importStatus.setAttribute("role", "status");
    const equippedCount = node("div", "planner-section-title");
    const slots = node("div", "planner-af-slots");
    const controls = node("div", "planner-af-controls");
    const status = node("p", "planner-hint");
    status.setAttribute("role", "status");
    const retry = button("所持AFを再読み込み", () => request(undefined, true));
    retry.hidden = true;

    const search = node("input", "planner-field");
    search.type = "search";
    search.setAttribute("aria-label", "AF名で検索");
    search.placeholder = "AF名で検索";
    search.maxLength = 120;
    const sort = node("select", "planner-field");
    sort.setAttribute("aria-label", "並び順");
    sort.append(new Option("パワー", POWER), new Option(basicFields[SUM].label, SUM), new Option("レベル", "level"),
      new Option("入手順", "recent"), new Option("名前順", "name"),
      ...Object.entries(parameters).map(([key, name]) => new Option(name, `stat_${key}`)));
    const direction = node("select", "planner-field");
    direction.setAttribute("aria-label", "並べる方向");
    direction.append(new Option("高い順", "desc"), new Option("低い順", "asc"));
    const rarity = node("select", "planner-field");
    rarity.setAttribute("aria-label", "レア度");
    rarity.append(new Option("全レア度", ""));
    const favLabel = node("label", "planner-af-favorite");
    const favorite = node("input", "planner-af-checkbox");
    favorite.type = "checkbox";
    favLabel.append(favorite, "お気に入りのみ");
    const forecastLabel = node("label", "planner-af-favorite");
    const forecast = node("input", "planner-af-checkbox");
    forecast.type = "checkbox";
    forecast.checked = state.useForecast;
    forecastLabel.append(forecast, "Lv4000予測値で比較");
    const filter = globalThis.hakoAfFilterPopup(state, restart, globalThis.hakoAfPresetStorage);
    controls.append(search, sort, direction, rarity, favLabel, forecastLabel, filter.element);

    const nav = node("div", "planner-toolbar");
    const prev = button("前へ", () => movePage(-1));
    const next = button("次へ", () => movePage(1));
    const pageText = node("span", "planner-hint");
    nav.append(prev, pageText, next, retry);
    const grid = node("div", "planner-af-grid");
    grid.setAttribute("aria-label", "所持アーティファクト");
    body.append(imports, importStatus, equippedCount, slots, controls, status, nav, grid);
    dialog.append(head, body);

    function rankName(rank) {
      return rankNames[rank] ?? ({ divine: "ディヴァイン", transcendent: "トランセンデント" })[rank] ?? rank;
    }

    function card(af, action, caption, selectedCard = false, showProjection = false) {
      const name = `${af.name} Lv${numbers.format(af.level ?? 0)}`;
      const cell = button("", action, "planner-af-card");
      cell.dataset.rank = af.rank ?? "";
      cell.title = `${name} · ${caption}`;
      cell.setAttribute("aria-label", `${name}を${caption}`);
      const image = node("img", "planner-af-image");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      if (typeof af.image === "string" && /^\/images\/items\/[^/]+\.png$/.test(af.image)) image.src = af.image;
      else image.src = "/images/items/dummy.png";
      const captionBar = node("span", "planner-af-caption");
      captionBar.append(node("span", "planner-af-name", af.name), node("span", "planner-af-level", `Lv${numbers.format(af.level ?? 0)}`));
      cell.append(image, captionBar);
      const rank = rankName(af.rank);
      if (rank) cell.append(node("span", "planner-af-rank", rank));
      if (Number.isFinite(af.power)) cell.append(node("span", "planner-af-power", `PW ${numbers.format(af.power)}`));
      if (showProjection && state.useForecast && af.level < TARGET && Number.isFinite(af.power) && ratio(af.level) != null) {
        cell.append(node("span", "planner-af-power-forecast", `→ ${numbers.format(projected({ n: af.power, unit: "" }, ratio(af.level)))}`));
      }
      if (selectedCard || af.favorite) cell.append(node("span", "planner-af-mark", selectedCard ? "×" : "★"));
      return cell;
    }

    function updateSelection(items, change = true) {
      selected = [...new Map(items.filter(af => af && typeof af.name === "string" && af.id != null)
        .map(({ metric, ...af }) => [String(af.id), af])).values()];
      const count = `${selected.length} / ${limit}枠`;
      summaryCount.textContent = count;
      equippedCount.textContent = `試算の装備枠 ${count}`;
      const slotCards = () => selected.map(af => card(af, () => updateSelection(selected.filter(item => item !== af)), "外す", true));
      summaryCards.replaceChildren(...slotCards());
      if (dialog.open) {
        slots.replaceChildren(...slotCards(), ...Array.from({ length: Math.max(0, limit - selected.length) },
          () => node("span", "planner-af-empty", "空き")));
        drawGrid();
      }
      if (change) onChange();
    }

    function drawGrid() {
      const ids = new Set(selected.map(af => String(af.id)));
      grid.replaceChildren(...shown.map(af => {
        const picked = ids.has(String(af.id));
        const entry = node("div", "planner-af-entry");
        const cell = card(af, () => updateSelection(picked ? selected.filter(item => String(item.id) !== String(af.id)) :
          [...selected, af]), picked ? "外す" : "試算に追加", picked, true);
        cell.setAttribute("aria-pressed", String(picked));
        cell.disabled = !picked && selected.length >= limit;
        entry.append(cell, comparison(af.metric));
        return entry;
      }));
    }

    function comparison({ key, value, unit, predicted } = {}) {
      const row = node("div", "planner-af-comparison");
      if (!key) return row;
      const parameter = plainSorts[key] ?? getOption(key).label;
      const basis = plainSorts[key] || value == null ? "" : predicted ? " · Lv4000予測" : " · 現在値";
      row.append(node("span", "planner-af-comparison-label", parameter + basis));
      const date = key === "recent" && value != null ? new Date(value) : null;
      const formatted = date ? Number.isNaN(date.getTime()) ? "—" : dates.format(date) :
        typeof value === "number" ? numbers.format(value) + unit : value ?? "—";
      row.append(node("strong", "planner-af-comparison-value", formatted));
      return row;
    }

    function movePage(offset) {
      page += offset;
      request();
      grid.scrollTop = 0;
    }

    function restart() { page = 1; forecast.checked = state.useForecast; request(); }

    function request(mode, load = false) {
      if (!mode) clearTimeout(timer);
      const id = ++sequence;
      if (mode) {
        pendingImport = { id, mode };
        importStatus.textContent = `${loadouts[mode]}装備を読み込み中…`;
      } else {
        pending = id;
        retry.hidden = true;
        status.textContent = ready ? "所持AFを比較中…" : "所持AFを全件読み込み中…";
        grid.setAttribute("aria-busy", "true");
        prev.disabled = next.disabled = true;
      }
      const options = { id, mode, load, page, query: search.value, favorite: favorite.checked, rank: rarity.value,
        root: state.root, showUnknown: state.showUnknown, useForecast: state.useForecast,
        sortKey: state.sortKey || sort.value, sortDirection: state.sortKey ? state.sortDirection : direction.value };
      document.dispatchEvent(new CustomEvent("hako-af:read-planner-artifacts", { detail: JSON.stringify(options) }));
    }

    function refreshFilter(data) {
      const counts = new Map(data.counts);
      const keys = new Set([...Object.keys(basicFields), ...Object.keys(parameters).map(key => `stat_${key}`), ...counts.keys()]);
      for (const { key } of globalThis.hakoAfConditionRows(state.root)) keys.add(key);
      if (state.sortKey) keys.add(state.sortKey);
      const entries = [...keys].map(key => [key, getOption(key)]);
      const order = Object.keys(groups);
      entries.sort(([, a], [, b]) => order.indexOf(a.group) - order.indexOf(b.group));
      filter.refresh(entries, counts, { active: data.active, matched: data.matched, unknown: data.unknown, matchingIds: [],
        message: data.error || `所持AF ${numbers.format(data.hits)}件表示`, resultLabel: "一致" });
    }

    document.addEventListener("hako-af:planner-artifacts", event => {
      if (!dialog.open || typeof event.detail !== "string") return;
      let data;
      try { data = JSON.parse(event.detail); } catch { return; }
      if (data.id === pendingImport?.id) {
        const { mode } = pendingImport;
        pendingImport = null;
        if (data.equippedLoaded) updateSelection(data.items);
        importStatus.textContent = data.error || (!data.equippedLoaded ? "装備情報を読み込めませんでした。所持AFの読み込みをお試しください。" :
          data.items.length ? `${loadouts[mode]}装備 ${data.items.length}件を取り込みました。` : `${loadouts[mode]}に装備中のAFはありません。`);
      } else if (data.id === pending) {
        pending = null;
        grid.removeAttribute("aria-busy");
        ready = !data.loadFailed;
        retry.hidden = ready;
        shown = data.items ?? [];
        page = data.page ?? 1;
        pages = data.pages ?? 1;
        const signature = JSON.stringify(data.ranks);
        if (rankSignature !== signature) {
          const value = rarity.value;
          rankSignature = signature;
          rarity.replaceChildren(new Option("全レア度", ""), ...(data.ranks ?? []).slice().sort((a, b) => b - a)
            .map(rank => new Option(rankName(rank), rank)));
          rarity.value = data.ranks?.includes(value) ? value : "";
        }
        const sortNote = state.sortKey ? ` · 拡張ソート ${getOption(state.sortKey).label}` : "";
        status.textContent = data.error || `${numbers.format(data.hits ?? 0)} / ${numbers.format(data.owned ?? 0)}件${sortNote}`;
        pageText.textContent = ready ? `${page} / ${pages}` : "";
        refreshFilter(data);
        drawGrid();
        prev.disabled = page <= 1;
        next.disabled = page >= pages;
      }
    });
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(restart, 150); });
    forecast.addEventListener("change", () => { state.useForecast = forecast.checked; restart(); });
    for (const input of [rarity, favorite]) input.addEventListener("change", restart);
    for (const input of [sort, direction]) input.addEventListener("change", () => { state.sortKey = ""; restart(); });
    dialog.addEventListener("close", () => {
      filter.close();
      clearTimeout(timer);
      pending = pendingImport = null;
      importStatus.textContent = "";
    });

    return { root, get: () => selected, load: items => updateSelection(Array.isArray(items) ? items.slice(0, 40) : [], false) };
  }

  globalThis.hakoAfTrainingArtifacts = create;
})();
