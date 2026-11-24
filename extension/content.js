(() => {
  "use strict";

  if (globalThis.hakoAfFrameContext?.active === false) return;

  const names = globalThis.hakoAfFeatureNames;
  const { getTarget, normalize, levelFrom, valueFrom, ratio, projected, text } = globalThis.hakoAf4000;
  const { parameters, readEffects, optionFor, groups } = globalThis.hakoAfEffects;
  const { POWER, SUM, DROP, CONVERSION, OP_STAR, sumRates, dropMetrics, metricValue, isVariant, viewRule, orderItems } = globalThis.hakoAfListRules;
  const conditionRows = globalThis.hakoAfConditionRows;
  const OWN = "[data-ha4]";
  const DETAIL = ".fx-item-detail,.item-detail-panel";
  const CLASSIC_GRID = ".virtual-item-grid";
  const CLASSIC_EQUIP = "[data-artifact-equip-inventory],[data-artifact-equip-slot]";
  const FLEX_GRID = ".fx-agrid";
  const FLEX_FILTER = ".fx-alist-controls";
  const FLEX_LISTS = ".fx-artifact__list,.fx-aenh,.fx-adec,.fx-arr";
  const SCOPES = new Set(["inventory", "enhance", "decompose", "gacha", "reroll"]);
  const GACHA_INPUT = ".fx-agacha,[data-ha4-gacha-root],#agacha-auto-set";
  const gachaSetKey = "hakoAf4000:gacha-use-sets";
  const TRADE_ROOTS = '#fx-trade-artifact-controls,.fx-trade,[data-ha4-trade-controls],.fx-agrid,.virtual-item-grid';
  const titleSearch = 'input[aria-label="称号を探す"]';
  const MARKET_SORT = "#market-artifact-sort";
  const MARKET_ROWS = ".overflow-y-auto.custom-scrollbar";
  const AUCTION_ENTRY = '[aria-label="オークションの説明を表示"]';
  const AUCTION_SORT = "[data-ha4-auction-sort]";
  const AUCTION_LIST = "[data-ha4-auction-list]";
  const AUCTION_CARD = 'div[role="button"][tabindex="0"].min-h-11.border-b';
  const AUCTION_CLOCK = `${AUCTION_LIST} > ${AUCTION_CARD} > .min-w-0 > .flex-wrap > span:first-child`;
  const isMarketList = type => type === "market" || type === "auction";
  const SUM_LABEL = "AF変換率＋ドロップ率合計";
  const sectionColors = ["#62e4ff", "#ff8c9e", "#a3f16d", "#d8a0ff", "#ffce70", "#68f2ca",
    "#ff9d62", "#aeb9ff", "#ef94d7", "#d9ed74", "#8bd7a0", "#99c5ff"];
  const NATIVE_SUM = "ha4_rate_sum";
  const extensionSort = key => key === NATIVE_SUM || key?.startsWith(OP_STAR);
  const sentStarSorts = new Map();
  let starSortOptions = [];
  const ROOTS = [
    DETAIL, CLASSIC_GRID, CLASSIC_EQUIP, FLEX_LISTS, ".fx-artifact__slot-grid",
    ".fx-agrid", FLEX_FILTER, MARKET_SORT, AUCTION_ENTRY, AUCTION_SORT, AUCTION_LIST,
    '.artifact-name', '.min-h-\\[36px\\]', '[data-ha4-list-scope]', TRADE_ROOTS, GACHA_INPUT
  ].join(",");
  const LIST_ATTRIBUTE_ROOTS = [FLEX_LISTS, CLASSIC_GRID, CLASSIC_EQUIP, "[data-base-modal-root]", ".fx-alist-controls",
    "[data-ha4-list-scope]", "[data-ha4-list-scope] button[aria-expanded]"].join(",");
  const extrasApi = globalThis.hakoAfExtras;
  const GACHA_CARD = ".rv-card";
  const monsterRoots = '.fx-mlist,.fx-mfilter,[data-ha4-monster-list],input[placeholder="例: 火炎斬り"]';
  const guildDungeonRoots = '.fx-dungeon__list,.fx-dungeon-stage__thumbs,.fx-dungeon,[data-base-modal-root],[aria-label="ギルドダンジョンの一覧"]';
  const extrasRoots = '[data-chat-message-id],.fx-summary-page,.fx-summary,.fx-result,.fx-settings,.fx-topbar,#fx-todo,[aria-label="国のお知らせ"],[data-ha4-settings-anchor],[data-ha4-home-root],[data-ha4-market-watch-root],[data-home-tutorial-root],[data-ha4-shop-notification],.fx-home,.fx-shop-buy,.shop-cell-nolp,.fx-shop-marks,.fx-race-exchange,.fx-ark-product,.fx-wbase-home__outpost,.fx-skedit,.skill-reserve-toggle,.fx-aenh__panel,.fx-bento,.fx-expd,.expedition-modal-body,[data-bento-pointer-slot],#__nuxt header,' + GACHA_CARD + ',' + monsterRoots + ',' + guildDungeonRoots;
  const normalRoute = () => location.pathname.replace(/^\/f\//, "/");
  const isOwnProfile = () => /^\/profile\/?$/.test(normalRoute());
  let finishEstimateScan;
  let exploreAnalysis;
  let partyShare;
  let trainingRoutes;
  let trainingPlanner;
  let guildDungeonFilter;
  let dungeonRewards;
  document.addEventListener("hako-af:dungeon-rewards-changed", () => requestScan());
  document.addEventListener("hako-af:explore-priorities-ready", () => requestScan());
  const partyRoots = '.fx-party__panel,.fx-hall-detail,aside[aria-label="投稿の詳細"],[aria-labelledby="hall-classic-comments-title"],[data-party-pointer-slot],.fx-mdetail__hero,.fx-mdetail__head,.detail-pc-fonts,[data-ha4-share-member],[data-ha4-public-training-detail]';
  const trainingRoots = ".fx-mating,.fx-mati,.fx-tgrant,.fx-tgflow,[data-ha4-training-scope],[data-inherit-row]";
  let marketWatch;
  const modes = new Map();
  const ownedStats = new Map();
  const classicStats = new WeakMap();
  const panels = new Map();
  const activePanels = new Set();
  const decorated = new Set();
  const filtered = new Set();
  const protectedBulkButtons = new Set();
  const sentPlans = new Map();
  const sortedCards = new Set();
  const sortedContainers = new Set();
  const rememberedOrder = new WeakMap();
  const nativeChoices = new Map();
  const savedNativeChoices = new Map();
  const restoredNativeSorts = new WeakMap();
  const nativePreferencesPrefix = "hakoAf4000:artifact-sort:";
  const keepControls = new WeakMap();
  const sectionMarkers = new WeakMap();
  const gachaInputControls = new WeakMap();
  const skinSortControls = new WeakMap();
  const skinSortKey = "hakoAf4000:skin-unowned-first";
  const currentCards = new Map();
  const detailSnapshots = new WeakMap();
  const forecastCopyButtons = new WeakMap();
  const forecastCopyFields = new WeakMap();
  const detailControls = new WeakMap();
  const DETAIL_SETTING = "hakoAf4000:showDetail";
  let showDetailForecast = true;
  try { showDetailForecast = localStorage.getItem(DETAIL_SETTING) !== "off"; } catch { /* Use the tab's setting. */ }
  let listSnapshots = new WeakMap();
  const gachaSnapshots = new Map();
  const exploreCards = new Map();
  const exploreFooters = new WeakMap();
  let standardTraits = [];
  let classicUI = [];
  let gridReports = new WeakMap();
  const gachaControls = new Map();
  let pendingDetail = null;
  let frame = 0;
  let extras;

  const plain = el => el ? el.textContent.trim() : "";
  function nativeText(el) {
    if (!el) return "";
    return Array.from(el.childNodes)
      .filter(node => node.nodeType !== 1 || !node.matches(OWN))
      .map(node => node.textContent).join("").trim();
  }

  function node(tag, kind, label) {
    const el = document.createElement(tag);
    el.dataset.ha4 = kind;
    if (label) el.textContent = label;
    return el;
  }

  function adorn(el, kind, label, title) {
    const parent = el;
    let mark = Array.from(parent.children).find(child => child.dataset.ha4 === kind);
    if (!mark) {
      if (!label) return;
      mark = node("span", kind);
      parent.append(mark);
    }
    if (!label) {
      mark.remove();
      return;
    }
    if (kind === "detail-value") {
      let badge = mark.firstElementChild;
      if (!badge) {
        badge = document.createElement("span");
        mark.append(badge);
      }
      if (badge.textContent !== label) badge.textContent = label;
    } else if (mark.textContent !== label) {
      mark.textContent = label;
    }
    if (title && mark.title !== title) mark.title = title;
    decorated.add(mark);
  }

  const labelFor = raw => normalize(raw.replace(/[★☆]/g, ""))
    .replace(/^アーティファクト変換率$/, "AF変換率");
  function effectOption(key) {
    if (key === POWER) return { label: "パワー", group: "basic", unit: "" };
    if (key === SUM) return { label: SUM_LABEL, group: "basic", unit: "%" };
    return optionFor(key);
  }

  const exploreLabel = key => key === SUM ? "AF合計" : key === POWER ? "PW" : effectOption(key).label;

  function exploreValueLine(kind, label, value) {
    const line = node("span", kind);
    const formatted = value.absent ? "なし" : value.value == null ? "—" : text(value.value, value.unit, false);
    line.append(node("span", "explore-value-label", label),
      node("span", "explore-value-number", value.predicted ? `→${formatted}` : formatted));
    return line;
  }

  function matchDescription(match) {
    const { label } = effectOption(match.key);
    if (match.absent) return label + "を含まない";
    const conditions = [match.min && `${match.min}${match.unit}以上`, match.max && `${match.max}${match.unit}以下`,
      match.minimumStars && `★${match.minimumStars}以上`].filter(Boolean);
    const reading = text(match.value, match.unit, false) + (match.stars > 0 ? `・★${match.stars}` : "");
    return `${label} ${match.predicted ? `Lv${getTarget()}予測 ` : ""}${reading}（${conditions.join("・") || "特性あり"}）`;
  }

  function showExploreMatches(tile, descriptions) {
    const dialog = node("dialog", "explore-match-dialog");
    dialog.setAttribute("aria-label", "一致した条件");
    const header = node("header", "extra-header");
    const close = node("button", "extra-button", "閉じる");
    close.type = "button";
    close.autofocus = true;
    close.addEventListener("click", () => dialog.close());
    header.append(node("h2", "extra-heading", "一致した条件"), close);
    const body = node("div", "extra-section");
    const name = tile.querySelector(".artifact-name,.fx-item-cell__name")?.textContent.trim();
    if (name) body.append(node("p", "extra-note", name));
    const list = node("ul", "explore-match-list");
    for (const description of descriptions) list.append(node("li", "explore-match-entry", description));
    body.append(list);
    dialog.append(header, body);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  function renderExploreCards() {
    for (const [tile, { sort, matches, payload }] of exploreCards) {
      const previous = exploreFooters.get(tile);
      const footer = previous?.footer ?? node("div", "explore-card");
      if (previous?.payload !== payload) {
        footer.replaceChildren();
        if (sort) {
          const { label } = effectOption(sort.key);
          const line = exploreValueLine("explore-sort-value", exploreLabel(sort.key), sort);
          const reading = sort.value == null ? "値を確認できません" : text(sort.value, sort.unit, false);
          line.title = `${label} ${sort.predicted ? `Lv${getTarget()}予測 ` : ""}${reading}`;
          line.setAttribute("aria-label", line.title);
          footer.append(line);
        }
        if (matches.length) {
          const descriptions = matches.map(matchDescription);
          const button = node("button", "explore-matches");
          button.type = "button";
          button.title = "一致条件\n" + descriptions.join("\n");
          button.setAttribute("aria-label", "一致条件 " + descriptions.join("、"));
          button.setAttribute("aria-haspopup", "dialog");
          const otherMetrics = sort ? matches.filter(match => match.key !== sort.key) : matches;
          const visible = (otherMetrics.length ? otherMetrics : matches).slice(0, 2);
          const remaining = matches.length - visible.length;
          button.append(node("span", "explore-match-more", remaining ? `✓ ほか${remaining}件` : "✓ 一致"));
          for (const match of visible) button.append(exploreValueLine("explore-match-value", exploreLabel(match.key), match));
          button.addEventListener("click", event => {
            event.stopPropagation();
            showExploreMatches(tile, descriptions);
          });
          footer.append(button);
        }
        footer.toggleAttribute("data-matches", matches.length > 0);
        exploreFooters.set(tile, { footer, payload });
      }
      footer.dataset.color = extras.matchColor();
      if (footer.parentElement !== tile) tile.append(footer);
      decorated.add(footer);
    }
  }
  const levelForName = (name, alternate) => alternate ? levelFrom(alternate) : levelFrom(name);
  const readPower = el => {
    const value = valueFrom(nativeText(el).replace(/^(?:PW|パワー)\s*/i, ""));
    return value && value.unit === "" ? value : null;
  };

  function compare(value, multiplier) {
    if (!value) return null;
    if (value.parts) {
      return Number(value.parts.reduce((sum, part) => sum + projected(part, multiplier), 0).toFixed(2));
    }
    return projected(value, multiplier);
  }

  function detailData(root) {
    const flex = root.matches(".fx-item-detail");
    const hero = root.querySelector(flex ? ":scope > .fx-item__hero--artifact" : ":scope > .artifact-detail-shell");
    if (!hero) return null;
    const head = hero.querySelector(".artifact-name");
    const alternate = flex ? plain(hero.querySelector(".fx-item__base-name"))
      : (head?.nextElementSibling?.matches("span.leading-tight.text-text-muted") ? plain(head.nextElementSibling) : "");
    const name = plain(head);
    const level = levelForName(name, alternate);
    if (level === null) return null;
    const p = root.querySelector(flex ? ":scope > .fx-item__power .fx-item__power-value" :
      ":scope > .artifact-power-box .artifact-power-value");
    const power = readPower(p);
    const metrics = new Map();
    const entries = [];
    let passive = "";
    if (power) metrics.set(POWER, power);

    for (const section of root.querySelectorAll(flex ? ":scope > .fx-item__section" : ":scope > .item-detail-section")) {
      const heading = section.firstElementChild;
      const title = plain(heading);
      if (title === "装備パッシブ") {
        const nameEl = flex ? section.querySelector(".fx-item__passive-name") : heading.nextElementSibling;
        passive = plain(nameEl).replace(/^パッシブ\s*/, "").trim();
      }
      if (!heading?.matches("h3,h4") || !(title === "特性" || title.startsWith("ステータス"))) continue;
      const rows = heading.nextElementSibling;
      if (!rows) continue;
      for (const row of rows.children) {
        if (row.children.length !== 2) continue;
        const [labelEl, valueEl] = row.children;
        const displayLabel = plain(labelEl).replace(/[★☆]/g, "").trim();
        const label = labelFor(displayLabel);
        const value = valueFrom(nativeText(valueEl));
        if (!label || !value) continue;
        if (label === "追加ヒット数") value.fixed = true;
        const isTrait = title === "特性";
        const knownTraitKeys = [DROP, CONVERSION, ...standardTraits.map(([key]) => "trait:" + key)];
        const key = isTrait
          ? knownTraitKeys.find(key => labelFor(effectOption(key).label) === label)
          : Object.keys(parameters).map(key => "stat_" + key).find(key => effectOption(key).label === label);
        const stars = (plain(labelEl).match(/★/g) ?? []).length;
        if (key && !metrics.has(key)) metrics.set(key, { ...value, stars });
        entries.push({ el: valueEl, value, displayLabel, stars, isTrait });
      }
    }
    const sum = sumRates(metrics);
    if (sum) metrics.set(SUM, sum);
    return { hero, name, baseName: alternate || name, level, p, power, entries, sum, metrics, passive };
  }

  const copyLabel = () => `Lv${getTarget()}予測をコピー`;

  function forecastCopyText(detail) {
    const multiplier = ratio(detail.level);
    const name = detail.baseName.replace(/\s+Lv\s*\.?\s*[\d,]+$/i, "");
    const power = detail.power ? "パワー" + text(projected(detail.power, multiplier), "", false) : "";
    const sum = detail.sum ? "[計" + text(compare(detail.sum, multiplier), "%", false) + "]" : "";
    const lines = [`${sum}【${name} Lv${getTarget()}】${power}`];
    for (const [isTrait, heading] of [[false, "ステータス"], [true, "特性"]]) {
      const entries = detail.entries.filter(entry => entry.isTrait === isTrait);
      if (!entries.length) continue;
      const values = entries.map(({ displayLabel, value, stars }) =>
        displayLabel + text(projected(value, multiplier), value.unit, true) + "★".repeat(stars));
      lines.push(heading + ": " + values.join(" / "));
    }
    if (detail.passive) lines.push("付与パッシブ: " + detail.passive);
    return lines.join("\n");
  }

  function renderForecastCopy(root, detail) {
    const original = root.querySelector(".fx-item__hero--artifact .fx-item__copy") ??
      root.querySelector(':scope > button[title*="性能をテキストでコピー"], :scope > div > button[title*="性能をテキストでコピー"]');
    let button = forecastCopyButtons.get(root);
    if (!button) {
      button = node("button", "copy-forecast", copyLabel());
      button.type = "button";
      button.addEventListener("click", async event => {
        event.stopPropagation();
        const current = detailData(root);
        if (!current || current.level >= getTarget()) return;
        const value = forecastCopyText(current);
        try {
          await navigator.clipboard.writeText(value);
          forecastCopyFields.get(root)?.remove();
          button.textContent = "✓ 予測をコピーしました";
        } catch {
          if (!current.hero.isConnected || !showDetailForecast) return;
          const field = forecastCopyFields.get(root) ?? node("textarea", "forecast-copy-field");
          forecastCopyFields.set(root, field);
          field.value = value;
          field.readOnly = true;
          field.rows = 3;
          field.setAttribute("aria-label", `Lv${getTarget()}予測のコピーテキスト`);
          if (!field.isConnected) current.hero.after(field);
          decorated.add(field);
          field.focus({ preventScroll: true });
          field.select();
          button.textContent = "手動でコピーできます";
        }
        setTimeout(() => { button.textContent = copyLabel(); }, 1500);
      });
      for (const event of ["pointerdown", "dblclick"]) button.addEventListener(event, e => e.stopPropagation());
      forecastCopyButtons.set(root, button);
    }
    if (button.dataset.target !== String(getTarget())) {
      button.dataset.target = String(getTarget());
      button.textContent = copyLabel();
    }
    if (original) {
      if (original.nextElementSibling !== button) original.after(button);
    } else if (button.parentElement !== detail.hero) {
      detail.hero.append(button);
    }
    decorated.add(button);
    const field = forecastCopyFields.get(root);
    if (field?.isConnected && field.value === forecastCopyText(detail)) decorated.add(field);
  }

  function renderDetailSwitch(root) {
    let tools = detailControls.get(root);
    if (!tools) {
      tools = node("div", "detail-tools");
      const button = node("button", "detail-switch");
      button.type = "button";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-label", "AF詳細の予測表示");
      button.addEventListener("click", event => {
        event.stopPropagation();
        showDetailForecast = !showDetailForecast;
        try { localStorage.setItem(DETAIL_SETTING, showDetailForecast ? "on" : "off"); } catch { /* Keep the tab's setting. */ }
        requestScan();
      });
      for (const event of ["pointerdown", "dblclick"]) button.addEventListener(event, e => e.stopPropagation());
      tools.append(button);
      detailControls.set(root, tools);
    }
    const button = tools.firstElementChild;
    const label = showDetailForecast ? "予測 ON" : "予測 OFF";
    if (button.textContent !== label) {
      button.textContent = label;
      button.setAttribute("aria-checked", String(showDetailForecast));
      button.title = showDetailForecast ? "AF詳細の予測表示を隠す" : "AF詳細の予測表示を戻す";
    }
    if (tools.parentElement !== root || root.firstElementChild !== tools) root.prepend(tools);
    decorated.add(tools);
  }

  function renderDetails() {
    const updates = [];
    for (const root of document.querySelectorAll(DETAIL)) {
      const detail = detailData(root);
      if (!detail) {
        detailSnapshots.delete(root);
        continue;
      }
      const { hero, name, level, p, power, entries, sum, metrics } = detail;
      const token = JSON.stringify([name, level, [...metrics].map(([k, v]) => [k, v.n])]);
      if (token !== detailSnapshots.get(root)) updates.push({ root, token, name, level, power, metrics });
      detailSnapshots.set(root, token);
      renderDetailSwitch(root);
      if (!showDetailForecast) continue;
      const low = level < getTarget();
      const multiplier = ratio(level);
      const heading = low ? `現在 Lv${level.toLocaleString("ja-JP")} → Lv${getTarget()}予測` : "";
      adorn(hero, "detail-legend", heading, "artifact-v9 の経験式による予測値。Lv4500を超える部分は外挿です。追加ヒット数は現在の回数を維持します。");
      if (low && (power || entries.length)) renderForecastCopy(root, detail);
      if (p && power) adorn(p, "detail-value", low ? "→ " + text(projected(power, multiplier), "", false) : "");
      for (const { el, value } of entries) {
        adorn(el, "detail-value", low ? "→ " + text(projected(value, multiplier), value.unit, true) : "");
      }
      if (sum) {
        const current = text(sum.n, "%", false);
        const estimate = low ? " → " + text(compare(sum, multiplier), "%", false) : "";
        adorn(hero, "detail-sum", `${SUM_LABEL}：${current}${estimate}`);
      }
    }
    if (!pendingDetail) return;
    if (performance.now() > pendingDetail.until) {
      pendingDetail = null;
      return;
    }
    const matches = updates.filter(detail =>
      detail.root.getClientRects().length && detail.name === pendingDetail.name &&
      detail.power?.n === pendingDetail.power &&
      pendingDetail.before.get(detail.root) !== detail.token);
    if (matches.length === 1) {
      const { card, id, fingerprint } = pendingDetail;
      const entry = { fingerprint, level: matches[0].level, metrics: matches[0].metrics };
      if (id) ownedStats.set(id, entry);
      else classicStats.set(card, entry);
      pendingDetail = null;
    }
  }

  function listRecord(card, nameEl, powerEl, placement, id = null, allowMissingRates = false) {
    const name = plain(nameEl);
    let level = levelFrom(name);
    const snapshot = listSnapshots.get(card);
    const power = readPower(powerEl) ?? (Number.isFinite(snapshot?.power) ? { n: snapshot.power, unit: "" } : null);
    const metrics = new Map();
    if (power) metrics.set(POWER, power);
    const fingerprint = JSON.stringify([name, power?.n ?? null]);
    if (snapshot) {
      level = snapshot.level;
      for (const [key, value] of readEffects(snapshot)) metrics.set(key, value);
      const sum = sumRates(metrics, allowMissingRates);
      if (sum) metrics.set(SUM, sum);
    }
    const cached = snapshot ? null : id ? ownedStats.get(id) : classicStats.get(card);
    if (cached && cached.fingerprint === fingerprint) {
      level = cached.level;
      for (const [key, value] of cached.metrics) metrics.set(key, value);
    }
    return {
      card, name, nameEl, powerEl, placement, id, level, power, metrics, fingerprint,
      complete: !!snapshot, decomposable: snapshot?.decomposable ?? null, keepId: snapshot?.id
    };
  }

  function renderGachaStats() {
    for (const [card, raw] of gachaSnapshots) {
      const face = card.querySelector(".rv-card__face");
      if (!face) continue;
      const { metrics } = dropMetrics(raw);
      const power = metrics.get(POWER);
      const total = metrics.get(SUM)?.n ?? 0;
      const powerLabel = power ? text(power.n, power.unit, false) : "—";
      const sumLabel = text(total, "%", false);
      adorn(face, "gacha-stats", `PW ${powerLabel}\n合計 ${sumLabel}`,
        `パワー ${powerLabel} / ${SUM_LABEL} ${sumLabel}`);
    }
  }

  function ownedFlex() {
    for (const grid of document.querySelectorAll(FLEX_GRID)) {
      const inventory = grid.closest(FLEX_LISTS);
      const gachaList = grid.closest(".fx-agacha__list");
      const items = [];
      for (const card of grid.querySelectorAll(".fx-agrid__cell")) {
        const button = card.querySelector(".fx-item-cell--artifact");
        const p = card.querySelector(".fx-agrid__power");
        if (!button || !p) continue;
        const id = inventory?.matches(".fx-artifact__list") ? button.getAttribute("data-fx-drag-id") : null;
        items.push(listRecord(card, button.querySelector(".fx-item-cell__name"), p, "inline", id, !!gachaList));
      }
      for (const item of items) renderListValue(item);
      if (inventory && isDisplayed(inventory)) {
        const type = inventory.matches(".fx-aenh") ? "enhance" :
          inventory.matches(".fx-adec") ? "decompose" : inventory.matches(".fx-arr") ? "reroll" : "inventory";
        const virtual = !!grid.querySelector(".fx-agrid__rows--virtual");
        const control = inventory.querySelector(FLEX_FILTER) || inventory.querySelector(".fx-artifact__list-controls");
        const active = filterGroup(type, control || grid, control ? "inside" : "before", items, virtual,
          control || grid, control?.querySelector("select"), grid);
        if (type === "decompose" && active) protectBulkSelection(inventory);
        for (const item of items) currentCards.set(item.card, item);
      }
      const gacha = gachaList && gridReports.get(grid)?.scope === "gacha";
      if (gacha && isDisplayed(gachaList)) {
        const control = gachaList.querySelector(FLEX_FILTER) || gachaList.querySelector(".fx-afilter-bar");
        filterGroup("gacha", control || grid, control ? "inside" : "before", items,
          !!grid.querySelector(".fx-agrid__rows--virtual"), control || grid, control?.querySelector("select"), grid);
      }
    }
    for (const card of document.querySelectorAll(".fx-artifact__slot")) {
      const p = card.querySelector(".fx-artifact__power");
      if (p) renderListValue(listRecord(card, card.querySelector(".fx-item-cell--artifact .fx-item-cell__name"), p, "inline"));
    }
  }

  function renderGachaInput(owner, state) {
    const { capacity, ready, busy, message, target } = state;
    if (capacity) {
      const { multiple, cart: inCart } = capacity;
      const count = new Intl.NumberFormat("ja-JP");
      const owned = multiple + inCart;
      adorn(owner, "gacha-capacity", `所持数：${count.format(owned)}個\nガチャ回数：${count.format(Math.floor(owned / 5))}回`,
        "現在の絞り込み条件で連続ガチャに使えるAFの数です（カート内を含む）。5個で1回として換算し、指定した合計パワーによって実際に作れるセット数は変わります。");
    }
    let ui = gachaInputControls.get(owner);
    if (!ui) {
      const root = node("div", "gacha-set-controls");
      const label = node("label", "gacha-set-label");
      const toggle = node("input", "gacha-use-sets");
      toggle.type = "checkbox";
      label.append(toggle, names.gachaSets + "を使う");
      toggle.addEventListener("change", () => {
        extrasApi?.save(gachaSetKey, toggle.checked);
        requestScan();
      });
      const retry = node("button", "extra-button", "計画をリセット");
      const cancel = node("button", "gacha-cancel-sets", "中止");
      const status = node("span", "gacha-set-status");
      status.setAttribute("role", "status");
      retry.type = "button";
      cancel.type = "button";
      cancel.addEventListener("click", event => {
        if (event.isTrusted) owner.dispatchEvent(new Event("hako-af:gacha-cancel-sets", { bubbles: true }));
      });
      retry.addEventListener("click", event => {
        if (event.isTrusted) owner.dispatchEvent(new Event("hako-af:gacha-reset-plan", { bubbles: true }));
      });
      root.append(label, retry, cancel, status);
      ui = { root, toggle, retry, cancel, status };
      gachaInputControls.set(owner, ui);
    }
    if (ui.root.parentElement !== owner) owner.append(ui.root);
    decorated.add(ui.root);
    ui.toggle.checked = extrasApi?.get(gachaSetKey) === true;
    ui.retry.hidden = !ui.toggle.checked || !state.canRecalculate;
    ui.retry.disabled = busy;
    ui.cancel.hidden = !busy;
    const label = ui.toggle.checked ? message || (!target ? "「合計パワー以上」の条件を選んでください。"
      : !ready ? "投入候補の読み込みを待ち、カートに出し入れできる状態でお試しください。" : "") : "";
    if (ui.status.textContent !== label) ui.status.textContent = label;
  }

  function renderSkinSort() {
    if (!/^\/encyclopedia\/?$/.test(normalRoute())) return;
    const title = [...document.querySelectorAll("#__nuxt section p")]
      .find(element => nativeText(element) === "スキン一覧");
    const header = title?.parentElement;
    const grid = header?.parentElement?.querySelector(":scope > .grid.custom-scrollbar");
    if (!grid) return;
    let button = skinSortControls.get(grid);
    if (!button) {
      button = node("button", "extra-button", names.skinSort);
      button.type = "button";
      button.addEventListener("click", () => {
        extrasApi?.save(skinSortKey, extrasApi.get(skinSortKey) !== true);
        requestScan();
      });
      skinSortControls.set(grid, button);
    }
    if (button.parentElement !== header) header.append(button);
    decorated.add(button);
    const enabled = extrasApi?.get(skinSortKey) === true;
    button.setAttribute("aria-pressed", String(enabled));
    button.title = "未入手のスキンを先に表示";
    grid.toggleAttribute("data-ha4-skin-sort", enabled);
    for (const card of grid.querySelectorAll(":scope > article")) {
      card.toggleAttribute("data-ha4-skin-acquired", enabled &&
        [...card.children].some(child => child.tagName === "SPAN" && nativeText(child) === "入手済"));
    }
  }

  function classicPower(card) {
    return Array.from(card.querySelectorAll("span")).find(el => plain(el) === "PW" &&
      el.nextElementSibling && valueFrom(nativeText(el.nextElementSibling)))?.parentElement;
  }

  function isDisplayed(el) {
    return el.isConnected && el.getClientRects().length > 0;
  }

  function protectBulkSelection(container) {
    for (const button of container.querySelectorAll("button")) {
      const label = nativeText(button);
      if (!label.startsWith("絞り込み結果を追加") && label !== "選択分解") continue;
      button.dataset.ha4BulkBlocked = "";
      protectedBulkButtons.add(button);
    }
  }

  function placeClassicFilter(type, controls, anchor, items, virtual, grid) {
    const sortRow = controls && Array.from(controls.children).find(child =>
      child.classList.contains("min-h-[36px]") && Array.from(child.querySelectorAll("label"))
        .some(label => nativeText(label).startsWith("並び順")));
    const active = filterGroup(type, controls || anchor, controls ? "inside" : "before", items,
      virtual, sortRow || controls || anchor, sortRow?.querySelector("select"), grid);
    if (controls) panels.get(controls).element.hidden = !sortRow &&
      !!Array.from(controls.querySelectorAll("button")).find(button =>
        nativeText(button).includes("並び替え・絞り込み"));
    return active;
  }

  function ownedClassic() {
    const usedControls = new Set();
    const visibleUI = classicUI.filter(({ el }) => isDisplayed(el));
    for (const grid of document.querySelectorAll(CLASSIC_GRID)) {
      if (!isDisplayed(grid)) continue;
      const items = [];
      // The classic equipment grid wraps each ItemCell and its original PW badge in a .select-none cell.
      const cells = grid.querySelectorAll(":scope > div > [data-index] > .select-none");
      for (const card of cells) {
        const p = classicPower(card);
        const name = card.querySelector(":scope > .artifact-item-cell .artifact-name");
        if (p && name) items.push(listRecord(card, name, p, "overlay"));
      }
      const mobileSection = grid.parentElement?.parentElement;
      const classicMobileEquip = mobileSection?.matches(".border-t") &&
        !!mobileSection.parentElement?.querySelector('[title="アーティファクトについて"]');
      const inventory = !!grid.closest("[data-artifact-equip-inventory]") || classicMobileEquip;
      const scope = visibleUI.find(entry => entry.kind === "grid" && entry.el === grid)?.scope;
      const type = scope ?? (inventory ? "inventory" : null);
      for (const item of items) renderListValue(item);
      if (type) {
        const anchor = grid.parentElement;
        const sibling = anchor.previousElementSibling;
        const search = sibling?.querySelector('input[placeholder^="名前で検索"],input[placeholder="名前検索"]');
        const scopePanel = visibleUI.find(entry => entry.kind === "panel" && entry.scope === type && entry.el.contains(grid))?.el;
        const controls = visibleUI.find(entry => entry.kind === "controls" && entry.scope === type &&
          (!scopePanel || scopePanel.contains(entry.el)))?.el ?? search?.closest(".flex.flex-col.gap-2");
        const filterAnchor = grid.matches(":only-child") && anchor.matches(".relative.select-none,.list-scrollbar") ? anchor : grid;
        const active = placeClassicFilter(type, controls, filterAnchor, items, grid.matches(".virtual-item-grid--enabled"), grid);
        if (controls) usedControls.add(controls);
        if (type === "decompose" && active && scopePanel) protectBulkSelection(scopePanel);
        for (const item of items) currentCards.set(item.card, item);
      }
    }
    for (const { el, kind, scope } of visibleUI) {
      if (kind !== "controls" || usedControls.has(el)) continue;
      const active = placeClassicFilter(scope, el, el, [], false);
      const scopePanel = visibleUI.find(entry => entry.kind === "panel" && entry.scope === scope && entry.el.contains(el))?.el;
      if (scope === "decompose" && active && scopePanel) protectBulkSelection(scopePanel);
    }
    for (const card of document.querySelectorAll("[data-artifact-equip-slot],.artifact-card")) {
      const p = card.querySelector(".artifact-card-power");
      const name = card.querySelector(".artifact-name");
      if (p && name) renderListValue(listRecord(card, name, p, "overlay"));
    }
  }

  function market() {
    if (location.pathname !== "/market") return;
    const sort = document.querySelector(MARKET_SORT);
    const toolbar = sort?.closest(".border-b");
    const listPane = toolbar?.parentElement;
    if (!listPane) return;
    const list = Array.from(listPane.querySelectorAll(`:scope > ${MARKET_ROWS}`))
      .find(el => el.querySelector(".artifact-name"));
    const items = [];
    const showEffect = /^(?:stat_|trait:)/.test(sort.value);
    for (const card of list?.children ?? []) {
      const name = card.querySelector(".artifact-name");
      if (!name) continue;
      const p = Array.from(card.querySelectorAll("span")).find(el => el.children.length <= 1 &&
        /^パワー\s*[+-]?[\d,.]+$/.test(normalize(nativeText(el))));
      const item = listRecord(card, name, p, "market");
      const effect = showEffect ? p?.previousElementSibling : null;
      const stat = effect?.matches(".mr-1.font-bold.text-amber-200") ?
        nativeText(effect).match(/^(.+?)\s+([+-][\d,.]+(?:[%％回])?)$/) : null;
      const metric = stat ? valueFrom(stat[2]) : null;
      const label = stat ? labelFor(stat[1]) : "";
      if (metric && label && !item.complete) item.metrics.set(sort.value, metric);
      renderListValue(item, metric && label ? { label, metric } : null);
      items.push(item);
    }
    const sortControls = sort.closest("label")?.parentElement;
    const innerToolbar = sortControls && toolbar.contains(sortControls) ? sortControls : toolbar;
    filterGroup("market", toolbar, "inside", items, false, innerToolbar, sort, list);
  }

  function auction() {
    if (location.pathname !== "/market") return;
    for (const sort of document.querySelectorAll(AUCTION_SORT)) {
      const toolbar = sort.closest(".border-b");
      const list = toolbar?.nextElementSibling;
      if (!list?.matches(AUCTION_LIST) || !isDisplayed(toolbar)) continue;
      const items = [];
      for (const card of list.children) {
        if (!card.matches(AUCTION_CARD)) continue;
        const name = card.querySelector(":scope > .min-w-0 > p.truncate");
        if (name) items.push(listRecord(card, name, null, "auction"));
      }
      filterGroup("auction", toolbar, "inside", items, false, toolbar, sort, list);
    }
  }

  function trade() {
    const panelAnchor = classicUI.find(({ el, kind, scope }) => scope === "trade" && kind === "controls" && isDisplayed(el))?.el;
    if (!panelAnchor) {
      if (sentPlans.has("trade")) setGridPlan("trade", { enabled: false });
      return;
    }
    const grid = classicUI.find(({ el, kind, scope }) => scope === "trade" && kind === "grid" && isDisplayed(el))?.el;
    const items = [];
    for (const card of grid?.querySelectorAll(".fx-agrid__cell,.item-cell.artifact-item-cell") ?? []) {
      if (!listSnapshots.has(card)) continue;
      const name = card.querySelector(".artifact-name,.fx-item-cell__name");
      const power = card.querySelector(".fx-agrid__power") ?? classicPower(card);
      if (name) items.push(listRecord(card, name, power, "trade"));
    }
    filterGroup("trade", panelAnchor, "inside", items, !!grid, panelAnchor, undefined, grid);
  }

  function renderListValue(item, effect = null) {
    const { card, level, power, powerEl, placement } = item;
    const low = level !== null && level < getTarget();
    const multiplier = ratio(level);
    const estimate = low && power ? "→ " + text(projected(power, multiplier), "", false) : "";
    if (placement === "market") {
      const desktop = item.nameEl.parentElement.matches(".flex-grow.min-w-0.text-xs");
      const holder = desktop ? item.nameEl.parentElement : card;
      const parts = [];
      if (estimate) parts.push(`PW ${estimate}`);
      if (low && effect) {
        const { label, metric } = effect;
        parts.push(`${label} → ${text(projected(metric, multiplier), metric.unit, true)}`);
      }
      adorn(holder, "market-value", parts.length ? `Lv${getTarget()}予測｜` + parts.join(" / ") : "");
    } else if (powerEl) {
      adorn(powerEl, placement, estimate, `右の数値はLv${getTarget()}予測`);
    }
  }

  function makePanel(type) {
    const state = modes.get(type) ?? {
      useForecast: true, showUnknown: false, root: { join: "and", children: [] },
      view: type === "decompose" ? "match" : null, sortKey: "", sortDirection: "desc"
    };
    if (type === "explore" && !modes.has(type)) {
      const saved = extrasApi?.get("hakoAf4000:explore-filter");
      if (Array.isArray(saved?.root?.children)) Object.assign(state, saved);
    }
    if (SCOPES.has(type) && !modes.has(type)) {
      const saved = extrasApi?.get(nativePreferencesPrefix + type);
      if (typeof saved?.forecast === "boolean") state.nativeForecast = saved.forecast;
      if (typeof saved?.key === "string" && saved.key.length <= 200) savedNativeChoices.set(type, saved.key);
    }
    if (type === "decompose") state.kept ??= new Set();
    modes.set(type, state);
    const onChange = () => {
      if (type === "explore") {
        const { root, useForecast, showUnknown, sortKey, sortDirection } = state;
        extrasApi?.save("hakoAf4000:explore-filter", { root, useForecast, showUnknown, sortKey, sortDirection });
      }
      if (type === "gacha") setGridPlan(type, listPlan(type, state));
      requestScan();
    };
    return { ...globalThis.hakoAfFilterPopup(state, onChange, globalThis.hakoAfPresetStorage, type === "inventory"), state, type };
  }

  function nativeMetric(key) {
    if (key === NATIVE_SUM) return { key: SUM, direction: "desc" };
    if (key.startsWith(OP_STAR)) return { key, direction: "desc" };
    if (key === "power" || key === "power_desc" || key === "power_asc") {
      return { key: POWER, direction: key.endsWith("_asc") ? "asc" : "desc" };
    }
    if (/^(stat_|trait:)/.test(key)) return { key, direction: "desc" };
    return null;
  }

  function saveNativePreferences(type, state) {
    if (!SCOPES.has(type) || !state) return;
    const key = nativeChoices.get(type)?.key;
    if (typeof key === "string") savedNativeChoices.set(type, key);
    extrasApi?.save(nativePreferencesPrefix + type, {
      ...(typeof key === "string" ? { key } : {}), forecast: state.nativeForecast === true
    });
  }

  function configureNativeSort(select, type, state) {
    if (!select) return;
    select.dataset.ha4NativeSort = type;
    let sumOption = select.querySelector(`option[value="${NATIVE_SUM}"]`);
    if (!sumOption || select.firstElementChild !== sumOption) {
      const selected = select.selectedOptions[0];
      if (!sumOption) {
        sumOption = new Option(SUM_LABEL + "の高い順", NATIVE_SUM);
        sumOption.dataset.ha4 = "native-option";
      }
      select.prepend(sumOption);
      select.selectedIndex = selected?.index ?? -1;
    }
    if (starSortOptions.length) {
      let group = select.querySelector('optgroup[data-ha4="op-star-sorts"]');
      if (!group) {
        group = node("optgroup", "op-star-sorts");
        group.label = "OPの推定★順";
        group.append(...starSortOptions.map(([key, label]) => new Option(label + "（推定★順）", OP_STAR + key)));
      }
      if (select.lastElementChild !== group) select.append(group);
    }
    if (SCOPES.has(type) && restoredNativeSorts.get(select) !== type) {
      const previousScope = restoredNativeSorts.get(select);
      restoredNativeSorts.set(select, type);
      const expected = nativeChoices.get(type)?.key ?? savedNativeChoices.get(type) ??
        (previousScope && extensionSort(select.value) ? nativeChoices.get(previousScope)?.previous : undefined);
      if (typeof expected === "string" && [...select.options].some(option => option.value === expected)) {
        const previous = select.value;
        nativeChoices.set(type, { key: expected, metric: nativeMetric(expected),
          ...(extensionSort(expected) ? { previous: nativeChoices.get(type)?.previous ?? previous } : {}) });
        if (previous !== expected) {
          select.value = expected;
          // Let the game's own select update its reactive state for standard options.
          // Extension-only options are kept locally and never sent to the native handler.
          if (!extensionSort(expected)) select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
    const native = nativeChoices.get(type);
    if (extensionSort(native?.key)) select.value = native.key;
    else if (!extensionSort(select.value)) {
      const key = select.value;
      if (native?.key !== key) nativeChoices.set(type, { key, metric: nativeMetric(key) });
    }
    const starKey = nativeChoices.get(type)?.key?.startsWith(OP_STAR) ? nativeChoices.get(type).key : null;
    if ((sentStarSorts.get(type) ?? null) !== starKey) {
      sentStarSorts.set(type, starKey);
      document.dispatchEvent(new CustomEvent("hako-af:op-sort", { detail: JSON.stringify({ scope: type, key: starKey }) }));
      requestScan();
    }
    const parent = select.closest("label")?.parentElement;
    if (!parent) return;
    for (const label of parent.querySelectorAll(':scope > [data-ha4="native-forecast"]')) {
      if (label.dataset.scope !== type) label.remove();
    }
    let label = parent.querySelector(`[data-ha4="native-forecast"][data-scope="${type}"]`);
    if (!label) {
      label = node("label", "native-forecast");
      label.dataset.scope = type;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => {
        state.nativeForecast = input.checked;
        saveNativePreferences(type, state);
        requestScan();
      });
      label.append(input, "予測値順");
      select.closest("label").after(label);
    }
    const input = label.firstElementChild;
    label.hidden = !!starKey;
    input.checked = state.nativeForecast === true;
    input.title = `Lv${getTarget()}予測値順に並べます` + (isMarketList(type) ? "（このページのみ）" : "");
  }

  function setGridPlan(type, plan, section = -1) {
    if (isMarketList(type)) return;
    const semantic = (key, value) => key === "sectionName" || key === "sectionColor" ? undefined : value;
    const signature = JSON.stringify(plan, semantic);
    const previous = sentPlans.get(type);
    if (previous?.signature === signature && previous.section === section) return;
    const order = JSON.stringify([plan.root, plan.view, plan.useForecast, plan.showUnknown, plan.sort], semantic);
    sentPlans.set(type, { signature, order, section });
    document.dispatchEvent(new CustomEvent("hako-af:apply-list", {
      detail: JSON.stringify({ scope: type, plan: previous?.signature === signature ? undefined : plan,
        section, reset: previous?.order !== order || previous?.section !== section }, semantic)
    }));
  }

  function setCardOrder(items, list, sort) {
    if (!sort || !list || !items.length) return;
    const parents = new Set(items.map(item => item.card.parentElement));
    if (parents.size !== 1) return;
    const container = items[0].card.parentElement;
    sortedContainers.add(container);
    if (!container.dataset.ha4SortLayout) {
      const layout = getComputedStyle(container).display;
      container.dataset.ha4SortLayout = container.matches(`${MARKET_ROWS},${AUCTION_LIST}`) &&
        layout !== "flex" ? "list" : "existing";
    }
    let base = rememberedOrder.get(container);
    if (!base) {
      base = items.map(item => item.card);
      rememberedOrder.set(container, base);
    }
    const indexes = new Map(base.map((card, index) => [card, index]));
    const ordered = [...items].sort((a, b) =>
      (indexes.get(a.card) ?? Number.MAX_SAFE_INTEGER) - (indexes.get(b.card) ?? Number.MAX_SAFE_INTEGER));
    for (const [index, item] of orderItems(ordered, sort).entries()) {
      sortedCards.add(item.card);
      item.card.style.setProperty("--ha4-order", String(index));
    }
  }

  function displaySortMetric(item, sort) {
    if (!sort?.key) return;
    const value = item.metrics.get(sort.key);
    const result = metricValue(item, value, sort.forecast);
    const label = effectOption(sort.key).label;
    const valueText = result == null ? "—" : text(result, value.unit, false);
    const mode = !value?.fixed && sort.forecast && item.level < getTarget() && result != null ? `Lv${getTarget()}予測 ` : "";
    if (item.placement === "auction" || item.placement === "trade" || sort.key !== POWER || result === null) {
      const holder = item.placement === "auction" ? item.nameEl.parentElement : item.card;
      adorn(holder, "sort-value", `${label} ${mode}${valueText}`);
    }
  }

  function inventorySectionLabels({ source, condition }, index) {
    const labels = conditionRows({ children: [condition] }).map(({ key, absent }) =>
      effectOption(key).label + (absent ? "なし" : ""));
    const fullName = [...new Set(labels)].join(" ＋ ");
    const defaultName = fullName.length <= 24 ? fullName : `${fullName.slice(0, 21)}…`;
    function describe(node) {
      if (node.children) {
        const entries = node.children.map(describe);
        if (node.join === "count") return `${entries.length}件中${node.minimum}件以上（${entries.join("／")}）`;
        return `（${entries.join(node.join === "or" ? " または " : " かつ ")}）`;
      }
      const { label, unit } = effectOption(node.key);
      if (node.absent) return label + "を含まない";
      return [label, node.min && `${node.min}${unit}以上`, node.max && `${node.max}${unit}以下`,
        node.stars && `★${node.stars}以上`].filter(Boolean).join(" ");
    }
    const color = /^#[a-f0-9]{6}$/i.test(source.sectionColor) ? source.sectionColor : defaultSectionColor(index);
    return { source, defaultName, name: source.sectionName || defaultName, color, description: describe(condition) };
  }

  function defaultSectionColor(index) {
    if (index < sectionColors.length) return sectionColors[index];
    const hue = index * 137.508 % 360;
    const channels = [0, 8, 4].map(offset => {
      const step = (offset + hue / 30) % 12;
      const value = 0.72 - 0.22 * Math.max(-1, Math.min(step - 3, 9 - step, 1));
      return Math.round(255 * value).toString(16).padStart(2, "0");
    });
    return "#" + channels.join("");
  }

  function renderSectionMarks(card, indexes, sections) {
    if (!indexes.length) return;
    const hits = indexes.map(index => sections[index]);
    const label = `一致条件 ${hits.map(hit => hit.name).join("、")}`;
    const colors = hits.map(hit => hit.color);
    const signature = colors.join(",") + label;
    let entry = sectionMarkers.get(card);
    if (!entry) {
      entry = { mark: node("span", "filter-section-marks") };
      entry.mark.setAttribute("role", "img");
      sectionMarkers.set(card, entry);
    }
    const { mark } = entry;
    if (entry.signature !== signature) {
      entry.signature = signature;
      mark.setAttribute("aria-label", label);
      mark.style.setProperty("--ha4-section-color", colors[0]);
      mark.replaceChildren(...colors.map(color => {
        const segment = document.createElement("span");
        segment.style.backgroundColor = color;
        return segment;
      }));
    }
    if (!mark.isConnected) card.append(mark);
    decorated.add(mark);
  }

  function listOptions(items, nativeSort, conditions, type, report, sortKey) {
    const keys = new Map();
    const add = (key, label, category) => {
      if (key.startsWith(OP_STAR)) return;
      const option = effectOption(key);
      const group = category && Object.hasOwn(groups, category) ? category : option.group;
      keys.set(key, { ...option, label: label || option.label, group });
    };
    add(POWER);
    add(SUM);
    for (const key of ["variant:shin", "variant:goku"]) add(key);
    for (const key of Object.keys(parameters)) add("stat_" + key);
    if (SCOPES.has(type) || type === "auction" || type === "trade" || type === "explore") {
      for (const [key, label, category] of standardTraits) add("trait:" + key, label, category);
    }
    for (const option of nativeSort?.options ?? []) {
      if (/^(?:stat_|trait:)/.test(option.value)) {
        if (!keys.has(option.value)) add(option.value, option.textContent.trim());
        else keys.get(option.value).label = option.textContent.trim() || keys.get(option.value).label;
      }
    }
    for (const item of items) {
      for (const key of item.metrics.keys()) if (!keys.has(key)) add(key);
    }
    for (const key of report?.metrics ?? []) if (!keys.has(key)) add(key);
    for (const { key } of conditions) if (key && !keys.has(key)) add(key);
    if (sortKey && !keys.has(sortKey)) add(sortKey);
    return [...keys];
  }

  function renderKeepControl(item, kept) {
    let control = keepControls.get(item.card);
    if (!control) {
      const el = node("label", "keep");
      const input = document.createElement("input");
      input.type = "checkbox";
      el.append(input, "残す");
      control = { el, input, id: item.keepId };
      keepControls.set(item.card, control);
      for (const name of ["click", "dblclick", "pointerdown", "pointerup", "keydown"]) {
        el.addEventListener(name, event => event.stopPropagation());
      }
      input.addEventListener("change", () => {
        if (input.checked) kept.add(control.id);
        else kept.delete(control.id);
        requestScan();
      });
    }
    control.id = item.keepId;
    control.input.checked = kept.has(control.id);
    control.input.setAttribute("aria-label", item.name + "を残す");
    if (!control.el.isConnected) item.card.append(control.el);
    decorated.add(control.el);
  }

  function listPlan(type, state) {
    const native = nativeChoices.get(type);
    const sort = state.sortKey
      ? { key: state.sortKey, direction: state.sortDirection, forecast: state.useForecast }
      : native?.metric && (extensionSort(native.key) || state.nativeForecast)
        ? { ...native.metric, forecast: native.key.startsWith(OP_STAR) ? false : !!state.nativeForecast }
        : null;
    const plan = {
      root: state.root, view: state.view, useForecast: state.useForecast, showUnknown: type !== "gacha" && state.showUnknown,
      kept: state.kept ? [...state.kept] : [], sort
    };
    if (type === "inventory") plan.groupSections = true;
    const { active, discard, checked, error } = viewRule(plan);
    plan.enabled = active || discard || checked || !!sort || type === "gacha" && !!error;
    if (type === "gacha") {
      plan.filterActive = active;
      if (error) plan.error = error;
    }
    return plan;
  }

  function filterGroup(type, anchor, position, items, virtual, holder = anchor, nativeSort, grid) {
    let panel = panels.get(anchor);
    if (panel && panel.type !== type) {
      panel.remove();
      panel = null;
    }
    if (!panel) {
      panel = makePanel(type);
      panels.set(anchor, panel);
    }
    activePanels.add(anchor);
    const { element, state } = panel;
    if (position === "before" && anchor.previousElementSibling !== element) anchor.before(element);
    if (position === "inside" && element.parentElement !== holder) holder.append(element);
    configureNativeSort(nativeSort, type, state);
    const plan = listPlan(type, state);
    const { sort } = plan;
    const rule = viewRule(plan);
    const { active, error, discard, checked } = rule;
    const gridData = gridReports.get(grid);
    const sections = rule.sections.map(inventorySectionLabels);
    const pages = rule.pages.map(({ name, indexes }) => {
      const members = indexes.map(index => sections[index]);
      return { name: name || members[0].name, groupName: name,
        sources: members.map(member => member.source), color: members[0].color,
        description: members.map(member => member.description).join(" または ") };
    });
    const nameCounts = new Map([["すべて", 1]]);
    for (const { name } of pages) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    pages.forEach((page, index) => {
      if (nameCounts.get(page.name) > 1) page.name += `（${index + 1}）`;
    });
    const hasSectionPages = (sections.length > 1 || rule.pages.some(page => page.name)) &&
      !!grid && (!!gridData || !virtual);
    const section = hasSectionPages ? pages.findIndex(({ sources }) => sources.includes(state.sectionTarget)) : -1;
    if (section === -1) state.sectionTarget = null;
    setGridPlan(type, plan, section);
    const report = plan.enabled || type === "gacha" ? gridData?.report : null;
    const sectionCounts = pages.map(() => 0);
    const matches = sections.length ? [] : undefined;
    let matched = 0;
    let unknown = 0;
    let protectedCount = 0;
    let keptCount = 0;
    const matchingIds = [];
    for (const item of items) {
      if (matches) matches.length = 0;
      const status = rule.check(item, matches);
      const hits = matches && status.result === true ? rule.matchedSections(matches) : null;
      const pageHits = hits && rule.matchedPages(hits);
      if (hits) {
        if (state.highlightSections !== false) renderSectionMarks(item.card, hits, sections);
        for (const index of pageHits) sectionCounts[index]++;
      }
      if (status.kept) keptCount++;
      if (state.kept && item.keepId && (active || checked || status.kept)) renderKeepControl(item, state.kept);
      if (state.kept && status.result === true && item.keepId) matchingIds.push(item.keepId);
      if (status.unknown) unknown++;
      if (status.protected) protectedCount++;
      if (status.show && (checked || discard || status.result === true)) matched++;
      if (!gridData && !virtual && (!status.show || (section >= 0 && !pageHits?.includes(section)))) {
        item.card.dataset.ha4Filtered = "page";
        filtered.add(item.card);
      }
      displaySortMetric(item, sort);
    }
    if (!gridData && !virtual) setCardOrder(items, grid, sort);
    if (report) ({ matched, unknown, protectedCount, keptCount } = report);
    if (panel.sectionBar && grid) {
      const after = position === "inside" ? anchor : element;
      if (after.nextElementSibling !== panel.sectionBar) after.after(panel.sectionBar);
    }
    const total = report?.total ?? items.length;
    const scope = gridData ? "読み込み済みの一覧" : virtual ? "読み込み済みの表示範囲" : "このページ";
    const unknownStatus = unknown ? ` · 判定できないAF ${unknown}件（${plan.showUnknown && !discard && !checked ? "表示中" : "非表示"}）` : "";
    const protectedStatus = protectedCount ? ` · 分解できないAF ${protectedCount}件` : "";
    const keptStatus = keptCount ? ` · 残すチェック ${keptCount}件` : "";
    const resultLabel = checked ? "チェック済み" : discard ? "分解候補" : "一致";
    const message = virtual && !gridData && plan.enabled ? "全件表示の絞り込み・予測値順を適用できません。ページ表示に切り替えてください。"
      : error ? error
      : discard && !active ? "分解候補を表示するには、残す条件を設定してください。"
      : `${scope} · ${active || checked ? `${resultLabel} ${matched} / ${total}件` : `読み込み ${total}件`}${unknownStatus}${protectedStatus}${keptStatus}`;
    const counts = new Map();
    for (const { metrics } of items) {
      for (const [key, metric] of metrics) if (!isVariant(key) || metric.n === 1) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    panel.refresh(listOptions(items, nativeSort, conditionRows(state.root), type, report, state.sortKey), counts, {
      active: active || checked, matched, unknown: discard || checked || type === "gacha" ? 0 : unknown, message, resultLabel,
      matchingIds: virtual && !gridData ? [] : report?.matchingIds ?? matchingIds,
      sections, pages, section, hasSectionPages, sectionCounts: gridData ? report?.sectionCounts : sectionCounts,
      decomposeNotice: type === "decompose" && (active || discard || checked || state.kept.size > 0),
      selectionNotice: type === "gacha" ? "絞り込み条件は標準の自動セットと拡張セットの追加候補にも反映されます。" : ""
    });
    return active || discard || checked || !!state.kept?.size;
  }

  const uiFailures = new Map();
  function renderUI(label, render) {
    try {
      const value = render();
      uiFailures.delete(label);
      return value;
    } catch (error) {
      const failures = (uiFailures.get(label) ?? 0) + 1;
      uiFailures.set(label, failures);
      if (failures <= 2) {
        console.warn(`[はこホム拡張] ${label}の表示を再試行します`, error);
        setTimeout(requestScan, failures * 250);
      }
    }
  }

  function scan() {
    frame = 0;
    const oldMarks = Array.from(decorated);
    const oldFiltered = Array.from(filtered);
    const oldBulkButtons = Array.from(protectedBulkButtons);
    const oldSortedCards = Array.from(sortedCards);
    const oldSortedContainers = Array.from(sortedContainers);
    activePanels.clear();
    decorated.clear();
    filtered.clear();
    protectedBulkButtons.clear();
    sortedCards.clear();
    sortedContainers.clear();
    currentCards.clear();
    listSnapshots = new WeakMap();
    gachaSnapshots.clear();
    exploreCards.clear();
    standardTraits = [];
    classicUI = [];
    gridReports = new WeakMap();
    gachaControls.clear();
    renderUI("拡張設定", () => extras?.beforeRead());
    const trainingData = renderUI("育成ルート読込", () => trainingRoutes?.update());
    renderUI("相場読込", () => marketWatch?.beforeRead());
    if (extras?.enabled("daily")) document.dispatchEvent(new Event("hako-af:read-balance"));
    if (extras?.enabled("home")) document.dispatchEvent(new Event("hako-af:read-home"));
    if (["/market", "/explore-result", "/expedition", "/guild", "/guild-raid-result", "/base", "/items", "/slot", "/mating", "/monsters", "/soul", "/hall-of-fame"].includes(normalRoute()) ||
        document.querySelector(GACHA_INPUT) ||
        (isOwnProfile() && document.querySelector(titleSearch)) || document.querySelector(extrasRoots) ||
        document.querySelector(`${FLEX_LISTS},${CLASSIC_GRID},${MARKET_SORT},[data-base-modal-root],${TRADE_ROOTS},${partyRoots},${trainingRoots}`)) {
      document.dispatchEvent(new Event("hako-af:read-list"));
    }
    renderUI("編成共有", () => partyShare?.scan());
    renderUI("ギルダン", () => guildDungeonFilter?.scan());
    renderUI("初回報酬", () => dungeonRewards?.scan());
    renderUI("スキン", renderSkinSort);
    if (trainingData) renderUI("育成ルート", () => trainingRoutes?.scan(trainingData));
    renderUI("育成プランナー", () => trainingPlanner?.scan());
    document.dispatchEvent(new Event("hako-af:ui-ready"));
    renderUI("強化見積もり", () => finishEstimateScan?.());
    renderUI("探索統計", () => exploreAnalysis?.finishScan());
    renderUI("相場表示", () => marketWatch?.afterRead());
    if (extras?.enabled("gacha")) renderUI("ガチャ", renderGachaStats);
    if (extras?.enabled("explore")) renderUI("探索結果", renderExploreCards);
    if (!extras || extras.enabled("detail")) renderUI("AF予測", renderDetails);
    if (!extras || extras.enabled("inventory")) {
      renderUI("AF一覧", () => {
        ownedFlex();
        ownedClassic();
        for (const [anchor, state] of gachaControls) renderGachaInput(anchor, state);
      });
    } else {
      for (const type of SCOPES) {
        if (sentPlans.has(type)) setGridPlan(type, { enabled: false });
      }
    }
    if (!extras || extras.enabled("market")) {
      renderUI("フリマ", market);
      renderUI("オークション", auction);
      renderUI("取引", trade);
    } else if (sentPlans.has("trade")) {
      setGridPlan("trade", { enabled: false });
    }
    for (const select of document.querySelectorAll("select[data-ha4-native-sort]")) {
      const scope = select.dataset.ha4NativeSort;
      if (!extras || extras.enabled(isMarketList(scope) ? "market" : "inventory")) continue;
      const option = select.querySelector(`option[value="${NATIVE_SUM}"]`);
      const selected = select.value;
      option?.remove();
      select.querySelector('optgroup[data-ha4="op-star-sorts"]')?.remove();
      if (extensionSort(selected)) {
        const value = nativeChoices.get(scope)?.previous;
        if (value && Array.from(select.options).some(entry => entry.value === value)) select.value = value;
      }
      if (sentStarSorts.get(scope)) {
        sentStarSorts.delete(scope);
        document.dispatchEvent(new CustomEvent("hako-af:op-sort", { detail: JSON.stringify({ scope, key: null }) }));
      }
      select.closest("label")?.parentElement?.querySelector(`[data-ha4="native-forecast"][data-scope="${scope}"]`)?.remove();
      delete select.dataset.ha4NativeSort;
      nativeChoices.delete(scope);
      restoredNativeSorts.delete(select);
    }
    renderUI("通知・プリセット", () => extras?.refresh());
    for (const el of oldMarks) if (!decorated.has(el)) el.remove();
    for (const el of oldFiltered) if (!filtered.has(el)) delete el.dataset.ha4Filtered;
    for (const el of oldBulkButtons) if (!protectedBulkButtons.has(el)) delete el.dataset.ha4BulkBlocked;
    for (const el of oldSortedCards) if (!sortedCards.has(el)) el.style.removeProperty("--ha4-order");
    for (const el of oldSortedContainers) {
      if (!sortedContainers.has(el)) {
        delete el.dataset.ha4SortLayout;
        rememberedOrder.delete(el);
      }
    }
    for (const [anchor, panel] of panels) {
      if (!anchor.isConnected || !activePanels.has(anchor)) {
        panel.remove();
        panels.delete(anchor);
      } else if (panel.element.hidden || !isDisplayed(panel.element)) {
        panel.close();
      }
    }
  }

  function requestScan() {
    if (!frame) frame = requestAnimationFrame(scan);
  }

  document.addEventListener("hako-af:list-item", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      const snapshot = JSON.parse(event.detail);
      if (Array.isArray(snapshot?.parameters) && Array.isArray(snapshot.effects)) listSnapshots.set(event.target, snapshot);
    } catch {
      // A page event without a readable artifact snapshot does not supply list data.
    }
  });
  document.addEventListener("hako-af:gacha-item", event => {
    if (!(event.target instanceof Element) || !event.target.matches(GACHA_CARD) || typeof event.detail !== "string") return;
    try {
      const raw = JSON.parse(event.detail);
      if (Array.isArray(raw?.parameters) && Array.isArray(raw.effects)) gachaSnapshots.set(event.target, raw);
    } catch { /* Ignore unreadable card data. */ }
  });
  document.addEventListener("hako-af:explore-total", event => {
    const total = Number(event.detail);
    if (extras?.enabled("explore") && event.target instanceof Element && typeof event.detail === "string" &&
        Number.isSafeInteger(total) && total >= 0) {
      adorn(event.target, "explore-total", `AFドロップ合計 ${total.toLocaleString("ja-JP")}個`);
    }
  });
  document.addEventListener("hako-af:explore-card", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      const data = JSON.parse(event.detail);
      const valid = value => typeof value?.key === "string" && (value.value === null || Number.isFinite(value.value));
      if (Array.isArray(data?.matches) && data.matches.every(match => valid(match) && match.value != null) &&
          (data.sort === null || valid(data.sort))) {
        exploreCards.set(event.target, { ...data, payload: event.detail });
      }
    } catch { /* Ignore unreadable item data. */ }
  });
  document.addEventListener("hako-af:grid", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      gridReports.set(event.target, JSON.parse(event.detail));
    } catch {
      // The regular list remains usable if the grid report is unavailable.
    }
  });
  document.addEventListener("hako-af:gacha-controls", event => {
    if (!(event.target instanceof Element)) return;
    try { gachaControls.set(event.target, JSON.parse(event.detail)); } catch { /* Ignore invalid reports. */ }
  });
  document.addEventListener("hako-af:power-ready", requestScan);
  document.addEventListener("hako-af:expedition-update", requestScan);
  document.addEventListener("hako-af:market-snapshot", () => {
    if (extras?.enabled("marketWatch") && /^\/market\/?$/.test(normalRoute())) requestScan();
  });
  window.addEventListener("storage", event => {
    if (event.key !== DETAIL_SETTING && event.key !== null) return;
    showDetailForecast = event.newValue !== "off";
    requestScan();
  });
  document.addEventListener("hako-af:list-ui", event => {
    if (!(event.target instanceof Element) || typeof event.detail !== "string") return;
    try {
      const [kind, scope] = JSON.parse(event.detail);
      if (SCOPES.has(scope) || scope === "trade") classicUI.push({ kind, scope, el: event.target });
    } catch {
      // Ignore events that do not identify an artifact list.
    }
  });
  document.addEventListener("hako-af:list-options", event => {
    if (typeof event.detail !== "string") return;
    try {
      const options = JSON.parse(event.detail);
      if (Array.isArray(options)) standardTraits = options;
    } catch {
      // Use the rendered option labels if the snapshot cannot be read.
    }
  });
  document.addEventListener("hako-af:op-sort-options", event => {
    try {
      const options = JSON.parse(event.detail);
      if (!Array.isArray(options) || !options.every(row => Array.isArray(row) && row.length === 2 &&
          typeof row[0] === "string" && /^[a-z][a-z0-9_-]{0,79}$/.test(row[0]) && typeof row[1] === "string")) return;
      if (JSON.stringify(starSortOptions) === event.detail) return;
      starSortOptions = options;
      requestScan();
    } catch { /* The standard sort options remain available. */ }
  });

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.isTrusted ||
        event.target.closest(`${OWN},[title*="お気に入り"],[aria-label*="お気に入り"]`)) return;
    if (event.target.closest("button[aria-expanded]")) requestScan();
    let card = event.target.closest(".fx-agrid__cell,.select-none");
    while (card && !currentCards.has(card)) card = card.parentElement?.closest(".fx-agrid__cell,.select-none");
    const item = currentCards.get(card);
    if (!item || !item.name || !item.power) return;
    const repeats = Array.from(currentCards.values()).filter(other => other.fingerprint === item.fingerprint);
    if (repeats.length > 1) return;
    const before = new Map(Array.from(document.querySelectorAll(DETAIL), el => [el, detailSnapshots.get(el)]));
    pendingDetail = { ...item, power: item.power.n, before, until: performance.now() + 3000 };
    requestScan();
  }, true);
  function nativeSortChanged(event) {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.dataset.ha4NativeSort) return;
    const type = select.dataset.ha4NativeSort;
    if (extensionSort(select.value)) event.stopImmediatePropagation();
    if (event.type === "change") {
      const prior = nativeChoices.get(type);
      const previous = extensionSort(select.value) ? prior?.previous ?? prior?.key : null;
      nativeChoices.set(type, { key: select.value, metric: nativeMetric(select.value), previous });
      const state = modes.get(type);
      if (state) state.sortKey = "";
      saveNativePreferences(type, state);
      requestScan();
    }
  }
  document.addEventListener("input", nativeSortChanged, true);
  document.addEventListener("change", nativeSortChanged, true);
  document.addEventListener("hako-af:grid-rendered", requestScan);
  document.addEventListener("hako-af:member-ready", requestScan);
  document.addEventListener("hako-af:power-ready", requestScan);
  document.addEventListener("hako-af:forecast-target", () => {
    sentPlans.clear();
    requestScan();
  });
  document.addEventListener("hako-af:guild-filter-data", requestScan);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && (event.target.closest(trainingRoots) ||
        ["/mating", "/monsters", "/soul"].includes(normalRoute()) && event.target.closest("#__nuxt"))) requestScan();
  }, true);
  document.addEventListener("change", event => {
    if (event.target instanceof Element && (event.target.matches(MARKET_SORT) ||
        event.target.closest(GACHA_INPUT) || event.target.matches("select") &&
        event.target.closest("[data-ha4-guild-filter-list]") && !event.target.closest(OWN))) requestScan();
  }, true);

  new MutationObserver(records => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const slotPrompt = target?.closest('.fx-slot-machine__stage [aria-live="polite"]') && normalRoute() === "/slot";
      if (target?.closest(OWN) && !slotPrompt) continue;
      if (record.type === "characterData" && target?.matches(AUCTION_CLOCK)) continue;
      const changed = [...record.addedNodes, ...record.removedNodes];
      const gameChanges = changed.filter(n => !(n.nodeType === 1 && n.matches(OWN)));
      if (record.type === "childList" && !gameChanges.length) {
        if (record.removedNodes.length) requestScan();
        // A native redraw may remove only our controls while keeping the header.
        if (record.removedNodes.length && target?.closest(`${partyRoots},[data-ha4-stat-member],[data-ha4-training-target]`))
          document.dispatchEvent(new Event("hako-af:member-ready"));
        continue;
      }
      if (record.type === "attributes") {
        if (isOwnProfile() && (target?.matches(titleSearch) || target?.querySelector(titleSearch))) {
          requestScan();
          break;
        }
        if (record.attributeName === "aria-checked" && target?.matches(".skill-reserve-toggle")) {
          requestScan();
          break;
        }
        if (record.attributeName === "aria-hidden") {
          if (extras?.enabled("gacha") && target?.matches(".rv-card__hit") && target.closest(GACHA_CARD)) {
            requestScan();
            break;
          }
          continue;
        }
        if (target?.closest(GACHA_INPUT) && ["aria-pressed", "disabled"].includes(record.attributeName)) {
          requestScan();
          break;
        }
        if (target?.matches(LIST_ATTRIBUTE_ROOTS) &&
            (target.closest(ROOTS) || target.querySelector(ROOTS))) {
          requestScan();
          break;
        }
        continue;
      }
      const observed = `${ROOTS},${extrasRoots},${partyRoots},${trainingRoots},.home-facility-menu,section.order-2 > .ui-gloss,#__nuxt footer`;
      const matingDialog = normalRoute() === "/mating" && (target?.closest('[role="dialog"]') ||
        gameChanges.some(n => n.nodeType === 1 && (n.matches('[role="dialog"]') || n.querySelector('[role="dialog"]'))));
      if (slotPrompt || matingDialog || target?.closest(observed) || (isOwnProfile() && (target?.querySelector(titleSearch) ||
          gameChanges.some(n => n.nodeType === 1 && (n.matches(titleSearch) || n.querySelector(titleSearch))))) ||
          (["/explore-result", "/expedition", "/guild", "/guild-raid-result", "/base", "/items", "/slot", "/mating", "/monsters", "/soul", "/hall-of-fame", "/encyclopedia"].includes(normalRoute()) && target?.closest("#__nuxt")) ||
          gameChanges.some(n => n.nodeType === 1 &&
        (n.matches(observed) || n.querySelector(observed)))) {
        requestScan();
        break;
      }
    }
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["style", "hidden", "aria-expanded", "aria-hidden", "aria-checked", "aria-pressed", "disabled"]
  });
  exploreAnalysis = globalThis.hakoAfExploreAnalysis?.start(node, id => extras?.enabled(id));
  globalThis.hakoAfExpedition?.start(node, () => extras?.enabled("expedition"));
  delete globalThis.hakoAfExpedition;
  trainingRoutes = globalThis.hakoAfTrainingRoutes?.start(node, () => extras?.enabled("trainingRoutes"), requestScan,
    (route, target) => partyShare?.openRoute(route, target));
  trainingPlanner = globalThis.hakoAfTrainingPlanner?.start(node, () => extras?.enabled("trainingRoutes"), trainingRoutes);
  partyShare = globalThis.hakoAfPartyShare?.start(node, () => extras?.enabled("partyShare"), trainingRoutes?.openMember,
    () => extras?.enabled("trainingRoutes"));
  delete globalThis.hakoAfTrainingRoutes;
  delete globalThis.hakoAfTrainingPlanner;
  delete globalThis.hakoAfPartyShare;
  extras = extrasApi?.start({ node, requestScan, viewRule, toMetrics: dropMetrics, effectOption, makePanel,
    appendExploreReset: exploreAnalysis?.appendSettingsReset,
    openPartyFile: partyShare?.openFile,
    openTrainingRoutes: trainingRoutes?.open,
    getTrainingRoute: id => extras?.enabled("trainingRoutes") ? trainingRoutes?.forMonster(id) : null,
    disableTrainingPreset: trainingRoutes?.disablePreset,
    listOptions: (items, state) => listOptions(items, null, conditionRows(state.root), "explore", null, state.sortKey) });
  finishEstimateScan = globalThis.hakoAfEnhanceEstimate?.start(node, id => extras?.enabled(id), requestScan);
  marketWatch = globalThis.hakoAfMarketWatch?.start(node, id => extras?.enabled(id), requestScan);
  guildDungeonFilter = globalThis.hakoAfGuildDungeonFilter?.start(() => !extras || extras.enabled("guildDungeonFilter"));
  dungeonRewards = globalThis.hakoAfDungeonRewards?.start(node, () => !extras || extras.enabled("dungeonRewards"));
  requestScan();
})();
