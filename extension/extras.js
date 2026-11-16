(() => {
  "use strict";

  const { activeGroup } = globalThis.hakoAfListRules;
  const slotHome = globalThis.hakoAfSlotHome;

  const features = {
    detail: "AF詳細の予測・コピー",
    inventory: "装備・強化・分解の拡張フィルター",
    enhanceEstimate: "強化画面にLv4000までの費用の目安を表示",
    market: "フリマ・オークション・個人間取引の拡張フィルター",
    marketWatch: "フリマの最安値の推移を記録",
    explore: "探索結果の全件一覧・絞り込み",
    exploreAnalysis: "探索結果にストックあたりの獲得量を表示",
    hiddenTitles: "称号設定に未取得の隠し称号を表示",
    gacha: "AFガチャ・スーパーガチャの結果に性能を表示",
    skillPresets: "ホムンクルスのスキルプリセット",
    partyShare: "編成共有",
    trainingRoutes: "育成ルートの目印・優先表示・引き継ぎ",
    slotBonus: "スロットに継続ストックと決戦情報を表示",
    ...(slotHome ? { slotHome: "Homeでスロットを並行表示" } : {}),
    chat: "チャットの返信元へ移動",
    daily: "今日のゴールド・ポーション増減",
    home: "ホームの拡張通知"
  };
  const afRanks = ["コモン", "アンコモン", "レア", "エリート", "エピック", "ヒロイック", "レジェンダリー",
    "ミシック", "セレスティアル", "ディヴァイン", "トランセンデント", "エターナル"];
  // Each row includes the default order and page for a new installation.
  const types = [
    ...afRanks.slice(0, 9).map((name, index) => [`af${index + 1}`, `AF・${name}`, 5, 3, "artifact"]).concat([
      ["af10", `AF・${afRanks[9]}`, 2, 1, "divine"],
      ["af11", `AF・${afRanks[10]}`, 1, 1, "transcendent"],
      ["af12", `AF・${afRanks[11]}`, 1, 1, "transcendent"]
    ]).reverse(),
    ["soul", "魂", 3, 2], ["egg", "タマゴ", 4, 2], ["normal", "通常アイテム", 6, 4, "other"],
    ["special", "特殊アイテム", 6, 5, "other"], ["afOther", "AF・レアリティ不明", 5, 5, "artifact"],
    ["other", "その他のアイテム", 6, 5]
  ];
  const alerts = {
    npc: "NPCショップ",
    npcLimited: "NPCショップの限定品",
    npcNormal: "NPCショップの通常品",
    npcMedal: "NPCショップの勲章交換",
    npcMark: "NPCショップの踏破交換",
    guildBoss: "ギルドボス",
    guildShop: "ギルドショップ",
    expedition: "遠征",
    hatchery: "孵化",
    ark: "アークショップの限定商品",
    production: "生産",
    colosseum: "コロシアム",
    "slot:low": "スロット（低レート）",
    "slot:mid": "スロット（中レート）",
    "slot:high": "スロット（高レート）",
    "slot:vip": "スロット（超高レート）",
    nation: "国のイベント",
    materials: "通常アイテムの所持数",
    other: "その他のホーム通知"
  };
  const configKey = "hakoAf4000:settings";
  const autoUpdateKey = "hakoAf4000:autoUpdate";
  const closedUpdateNoticeKey = "hakoAf4000:closed-update-notice";
  const homeAlertsOpenKey = "hakoAf4000:home-alerts-open";
  const matchColors = [["red", "赤（既定）"], ["blue", "水色"], ["purple", "紫"], ["white", "白"], ["gold", "金"]];
  const alertsOffByDefault = new Set(["npc", "npcLimited", "npcMedal", "ark", "production", "colosseum",
    "slot:low", "slot:mid", "slot:high", "nation"]);

  function get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep the in-tab settings. */ }
  }
  function bounded(number, fallback) {
    const n = Math.floor(Number(number));
    return Number.isFinite(n) && n >= 1 && n <= 99 ? n : fallback;
  }
  function loadSettings() {
    const stored = get(configKey) ?? {};
    return {
      features: Object.fromEntries(Object.keys(features).map(id => [id, stored.features?.[id] !== false])),
      paging: ["standard", "all", "priority"].includes(stored.paging) ? stored.paging : "priority",
      candidates: ["mark", "first", "only"].includes(stored.candidates) ? stored.candidates : "first",
      matchColor: matchColors.some(([color]) => color === stored.matchColor) ? stored.matchColor : "red",
      thresholdName: typeof stored.thresholdName === "string" ? stored.thresholdName : "",
      groups: Object.fromEntries(types.map(([id, , order, page, legacy]) => [id, {
        order: bounded((stored.groups?.[id] ?? stored.groups?.[legacy])?.order, order),
        page: bounded((stored.groups?.[id] ?? stored.groups?.[legacy])?.page, page)
      }])),
      alerts: Object.fromEntries(Object.keys(alerts).map(id => [id,
        stored.alerts?.[id] ?? (id.startsWith("slot:") ? stored.alerts?.slot : undefined) ?? !alertsOffByDefault.has(id)]))
    };
  }
  const settings = loadSettings();
  const balanceDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const balanceTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
  const numbers = new Intl.NumberFormat("ja-JP");
  const delta = new Intl.NumberFormat("ja-JP", { signDisplay: "exceptZero" });
  const homeText = {
    npc: /NPCショップ|勲章交換|踏破交換/, guildBoss: /ギルド.{0,8}(?:ボス|守護)/,
    guildShop: /ギルドショップ/, expedition: /遠征/, hatchery: /孵化/,
    ark: /アークショップ/, production: /生産|アイテム錬金|上限到達/,
    colosseum: /コロシアム/, nation: /国のお知らせ|ビンゴ|買取|買い取り|国王|国の/
  };
  const homeRoot = "[data-home-tutorial-root],.fx-home,[data-ha4-home-root]";
  const settingsControl = ".fx-topbar__settings,[data-ha4-settings-anchor]";
  const menuControl = 'button[title="メニュー"]';

  function start({ node, requestScan, viewRule, toMetrics, listOptions, effectOption, makePanel, appendExploreReset, openPartyFile, openTrainingRoutes }) {
    const enabled = key => settings.features[key] !== false;
    const refreshSlotHome = slotHome?.start(() => enabled("slotHome"));
    const desktop = globalThis.hakoAfDesktopUpdates;
    const version = desktop?.version ?? globalThis.hakoAfUserscriptVersion ??
      (globalThis.hakoAfFrameContext?.embedded ? chrome.runtime.getManifest().version : undefined);
    let currentDrops = null;
    let previousDrops;
    let currentBalance = null;
    let explore;
    let settingsDialog;
    let updateNotice;
    let closedUpdateVersion = get(closedUpdateNoticeKey);
    let gameBuild, requestedBuild;
    let nativeAlertState = new Set();
    let homeTimers = [];
    let homeChecked = new Set();
    let watchOwner;
    let watchItems = [];
    let watchCounts = new Map();
    let inventoryItem, itemWatch;
    const skillRoots = new Map();
    const skillRows = new Map();
    const skillPanels = new Map();
    const selectedSkillPresets = new Map();
    let skillMarks = new Map();
    const settingButton = makeButton("拡張設定", "settings-launch");
    settingButton.setAttribute("aria-haspopup", "dialog");
    settingButton.addEventListener("click", event => {
      event.stopPropagation();
      openSettings();
    });
    let dailyChip, homePanel, chatPreview, chatPreviewQuote;

    function makeButton(label, kind = "extra-button") {
      const button = node("button", kind, label);
      button.type = "button";
      return button;
    }
    function tellMain() {
      const detail = JSON.stringify(settings.features);
      document.dispatchEvent(new CustomEvent("hako-af:extra-settings", { detail }));
      if (!enabled("chat")) {
        closeChatPreview();
        for (const quote of document.querySelectorAll("[data-ha4-chat-quote]")) {
          if (quote.dataset.ha4 === "chat-hidden-quote") {
            quote.remove();
            continue;
          }
          quote.removeAttribute("data-ha4-chat-quote");
          quote.removeAttribute("role");
          quote.removeAttribute("tabindex");
        }
      }
    }
    function changeSettings() {
      save(configKey, settings);
      tellMain();
      requestScan();
    }
    function readItems() {
      const request = /^\/(?:f\/)?items\/?$/.test(location.pathname) || enabled("home") && settings.alerts.materials
        ? { owner: watchOwner, ids: watchItems.map(item => item.id) }
        : null;
      document.dispatchEvent(new CustomEvent("hako-af:read-items", { detail: JSON.stringify(request) }));
    }
    function saveWatches() {
      if (watchOwner) save("hakoAf4000:materials:" + watchOwner, watchItems);
      requestScan();
    }
    function receiveItems(data) {
      const newOwner = data?.owner;
      const changedOwner = watchOwner !== newOwner;
      if (changedOwner) {
        watchOwner = newOwner;
        const saved = newOwner && get("hakoAf4000:materials:" + newOwner);
        watchItems = Array.isArray(saved) ? saved.filter(item => typeof item?.id === "string" && typeof item.name === "string") : [];
        watchCounts = new Map();
      }
      const next = new Map(data.counts);
      const now = Date.now();
      let changed = false;
      for (const item of watchItems) {
        const amount = next.get(item.id);
        if (amount == null || watchCounts.has(item.id) && item.amount === amount) continue;
        Object.assign(item, { amount, checkedAt: now });
        changed = true;
      }
      if (changed) saveWatches();
      watchCounts = next;
      requestScan();
    }

    function updateItemWatch() {
      const entry = inventoryItem?.anchor.isConnected && watchOwner ? inventoryItem : null;
      if (!entry) {
        itemWatch?.element.remove();
        itemWatch = null;
        return;
      }
      const { anchor, id, name } = entry;
      const find = () => watchItems.find(item => item.id === id);
      const saved = find();
      const signature = JSON.stringify([watchOwner, id, saved?.goal ?? null, !!saved]);
      if (itemWatch?.signature === signature && itemWatch.element.parentElement === anchor) return;
      itemWatch?.element.remove();
      const element = node("div", "watch-item");
      const toggle = makeButton(saved ? "ホーム通知を解除" : "ホーム通知に追加");
      const goal = document.createElement("input");
      goal.type = "text";
      goal.inputMode = "numeric";
      goal.maxLength = 21;
      goal.placeholder = "任意";
      goal.value = saved?.goal ?? "";
      goal.setAttribute("aria-label", name + "の目標数");
      const readGoal = () => {
        const digits = goal.value.normalize("NFKC").replace(/[\s,]/g, "");
        const number = Number(digits);
        return !digits ? null : /^\d+$/.test(digits) && Number.isSafeInteger(number) && number > 0 ? number : undefined;
      };
      const checkGoal = () => {
        const value = readGoal();
        goal.setCustomValidity(value === undefined ? "目標数は正の整数で入力してください。" : "");
        return goal.reportValidity();
      };
      goal.addEventListener("change", () => {
        if (!checkGoal()) return;
        const item = find();
        if (item) {
          item.goal = readGoal();
          saveWatches();
        }
      });
      toggle.addEventListener("click", () => {
        if (find()) watchItems = watchItems.filter(item => item.id !== id);
        else if (checkGoal()) watchItems.push({ id, name, goal: readGoal() });
        else return;
        saveWatches();
        updateItemWatch();
        itemWatch?.element.querySelector("button")?.focus();
      });
      element.append(toggle);
      const label = node("label", "watch-goal", "目標数");
      label.append(goal);
      element.append(label);
      anchor.prepend(element);
      itemWatch = { element, signature };
    }

    function updateSkillPresets() {
      for (const [root, panel] of skillPanels) {
        if (skillRoots.get(root) === panel.key && root.isConnected) continue;
        panel.bar.remove();
        skillPanels.delete(root);
      }
      const nextMarks = new Map();
      for (const [root, key] of skillRoots) {
        const rows = [...(skillRows.get(key)?.values() ?? [])];
        if (!rows.length) continue;
        const presets = get(key) ?? [];
        let panel = skillPanels.get(root);
        if (!panel) {
          const bar = node("div", "skill-presets");
          const picker = document.createElement("select");
          picker.setAttribute("aria-label", "スキルプリセット");
          const name = document.createElement("input");
          name.placeholder = "プリセット名";
          name.setAttribute("aria-label", "プリセット名");
          name.maxLength = 50;
          const add = makeButton("現在の控えを保存");
          const remove = makeButton("プリセットを削除");
          const status = node("span", "skill-preset-status");
          status.setAttribute("role", "status");
          bar.append(picker, name, add, remove, status);
          root.prepend(bar);
          panel = { key, bar, picker, status, remove };
          skillPanels.set(root, panel);
          picker.addEventListener("change", () => {
            selectedSkillPresets.set(key, picker.value);
            requestScan();
          });
          add.addEventListener("click", () => {
            const label = name.value.trim() || picker.value;
            if (!label) {
              name.focus();
              return;
            }
            const current = get(key) ?? [];
            const entries = [...(skillRows.get(key)?.values() ?? [])].map(({ id, name, reserved }) => ({ id, name, reserved }));
            save(key, [...current.filter(item => item.label !== label), { label, entries }]);
            selectedSkillPresets.set(key, label);
            name.value = "";
            requestScan();
          });
          remove.addEventListener("click", () => {
            if (!picker.value) return;
            save(key, (get(key) ?? []).filter(item => item.label !== picker.value));
            selectedSkillPresets.delete(key);
            requestScan();
          });
        }
        const chosen = presets.find(item => item.label === selectedSkillPresets.get(key));
        const labels = JSON.stringify(presets.map(item => item.label));
        if (panel.labels !== labels) {
          panel.labels = labels;
          panel.picker.replaceChildren(new Option("スキルプリセット", ""), ...presets.map(item => new Option(item.label, item.label)));
        }
        panel.picker.value = chosen?.label ?? "";
        panel.remove.disabled = !chosen;
        const differences = [];
        let missing = 0;
        for (const desired of chosen?.entries ?? []) {
          const row = skillRows.get(key).get(desired.id);
          if (!row) {
            missing++;
            continue;
          }
          if (row.reserved === desired.reserved) continue;
          differences.push(desired);
          row.anchor.dataset.ha4SkillChange = "";
          const label = desired.reserved ? "控えにする" : "使用に戻す";
          const mark = skillMarks.get(row.anchor) ?? node("span", "skill-change");
          if (mark.textContent !== label) mark.textContent = label;
          if (row.anchor.nextElementSibling !== mark) row.anchor.after(mark);
          nextMarks.set(row.anchor, mark);
        }
        differences.sort((a, b) => Number(b.reserved) - Number(a.reserved));
        const message = !chosen ? "表示中の控えと使用中の状態を保存できます。" : !differences.length ?
          "表示中のスキルに変更はありません。" : differences.map(item => (item.reserved ? "控えへ " : "使用に戻す ") + item.name).join(" ／ ");
        const full = missing ? message + `　未表示・未確認 ${missing}件` : message;
        if (panel.status.textContent !== full) panel.status.textContent = full;
      }
      for (const [anchor, mark] of skillMarks) {
        if (nextMarks.has(anchor)) continue;
        delete anchor.dataset.ha4SkillChange;
        mark.remove();
      }
      skillMarks = nextMarks;
    }
    function labeled(parent, name, control) {
      const label = node("label", "extra-field");
      label.append(name, control);
      control.setAttribute("aria-label", name);
      parent.append(label);
    }
    function subsection(dialog, title) {
      const section = node("section", "extra-section");
      section.append(node("h3", "extra-heading", title));
      dialog.append(section);
      return section;
    }
    function select(parent, label, values, selected, onChange) {
      const field = document.createElement("select");
      field.replaceChildren(...values.map(([value, name]) => new Option(name, value)));
      field.value = selected;
      labeled(parent, label, field);
      field.addEventListener("change", () => { onChange(field.value); changeSettings(); });
    }
    function field(parent, label, type, value, onChange) {
      const input = document.createElement("input");
      input.type = type;
      if (type === "checkbox") input.checked = value;
      else input.value = value;
      if (type === "number") {
        input.min = 1;
        input.max = 99;
      }
      if (type === "text") input.maxLength = 80;
      labeled(parent, label, input);
      input.addEventListener("change", () => {
        onChange(type === "checkbox" ? input.checked : input.value);
        changeSettings();
      });
    }

    function openSettings() {
      if (settingsDialog?.open) return;
      settingsDialog?.remove();
      const dialog = settingsDialog = node("dialog", "settings");
      const title = node("h2", "extra-heading", "拡張設定");
      title.id = "ha4-settings-title";
      dialog.setAttribute("aria-labelledby", title.id);
      const close = makeButton("閉じる");
      close.autofocus = true;
      close.addEventListener("click", () => dialog.close());
      const header = node("header", "extra-header");
      header.append(title, close);
      dialog.append(header);

      if (version) {
        const updates = subsection(dialog, "更新");
        updates.dataset.ha4UpdateSettings = "";
        updates.append(versionControl("使用中のバージョン v" + version, "extra-note"));
        if (desktop || globalThis.hakoAfUpdateManaged) {
          const autoUpdate = document.createElement("input");
          autoUpdate.type = "checkbox";
          autoUpdate.checked = get(autoUpdateKey) !== false;
          labeled(updates, "自動更新", autoUpdate);
          autoUpdate.addEventListener("change", () => {
            save(autoUpdateKey, autoUpdate.checked);
            document.dispatchEvent(new Event("hako-af:auto-update-changed"));
          });
          updates.append(node("p", "extra-note", desktop
            ? "24時間に1回確認し、新版は同じ名前の更新ZIPに上書き保存します。現在の拡張機能フォルダーに上書き展開して、はこホムのタブを再読み込みします。新版が読み込まれると、拡張が保存したZIPは削除されます。"
            : "はこホムを表示している間に24時間に1回確認し、次にページが読み込まれるときに反映します。"));
        }
        if (desktop) {
          const status = node("p", "extra-note");
          status.setAttribute("role", "status");
          const saveZip = makeButton("更新ZIPを保存");
          saveZip.addEventListener("click", desktop.saveArchive);
          const showArchive = () => {
            const available = desktop.archiveVersion();
            status.textContent = available ? "v" + available + "のZIPを取得済み" : "";
            saveZip.hidden = !available;
          };
          updates.append(status, saveZip);
          showArchive();
          document.addEventListener("hako-af:desktop-update-archive", showArchive);
          dialog.addEventListener("close", () => document.removeEventListener("hako-af:desktop-update-archive", showArchive), { once: true });
        }
      }
      const functions = subsection(dialog, "機能のオン／オフ");
      for (const [id, name] of Object.entries(features)) {
        field(functions, name, "checkbox", settings.features[id], value => { settings.features[id] = value; });
      }
      if (openPartyFile) {
        const party = subsection(dialog, "編成共有");
        const load = makeButton("編成ファイルを開く");
        load.addEventListener("click", () => {
          dialog.close();
          openPartyFile();
        });
        party.append(load);
      }
      if (openTrainingRoutes) {
        const section = subsection(dialog, "育成ルート");
        const edit = makeButton("育成ルートを開く");
        edit.addEventListener("click", () => {
          dialog.close();
          openTrainingRoutes();
        });
        section.append(edit);
      }
      const drops = subsection(dialog, "探索結果");
      appendExploreReset?.(drops);
      select(drops, "ページ表示", [["standard", "標準の件数"], ["all", "全件表示"], ["priority", "優先度別ページ"]],
        settings.paging, value => { settings.paging = value; });
      select(drops, "しきい値に合ったAF", [["first", "目印を付けて先頭へ"], ["mark", "目印を付ける"], ["only", "該当AFだけ表示"]],
        settings.candidates, value => { settings.candidates = value; });
      select(drops, "一致したAFの強調色", matchColors, settings.matchColor, value => { settings.matchColor = value; });
      field(drops, "条件名（通知用）", "text", settings.thresholdName, value => { settings.thresholdName = value.trim(); });
      drops.append(node("p", "extra-note", "数字が小さい種類から先に表示します。同じ表示順ではゲーム側の並び順が使われます。リソース・レシピは標準の獲得欄に表示されます。"));
      const table = node("div", "extra-ranks");
      for (const caption of ["アイテムの種類", "表示順", "ページ"]) table.append(node("strong", "extra-caption", caption));
      for (const [id, name] of types) {
        table.append(node("span", "extra-category", name));
        field(table, name + "の表示順", "number", settings.groups[id].order, value => {
          settings.groups[id].order = bounded(value, settings.groups[id].order);
        });
        field(table, name + "のページ", "number", settings.groups[id].page, value => {
          settings.groups[id].page = bounded(value, settings.groups[id].page);
        });
      }
      drops.append(table);
      const home = subsection(dialog, "ホームの通知");
      home.append(node("p", "extra-note", "ショップやギルドの当日分は、状態を読み込むまで「未実行（未確認）」と表示します。"));
      for (const [id, name] of Object.entries(alerts)) {
        field(home, name, "checkbox", settings.alerts[id], value => { settings.alerts[id] = value; });
      }
      dialog.addEventListener("close", () => {
        dialog.remove();
        if (settingsDialog === dialog) settingsDialog = undefined;
        placeUpdateNotice();
        requestScan();
      });
      document.body.append(dialog);
      dialog.showModal();
      placeUpdateNotice();
      requestScan();
    }

    function labelThreshold(state) {
      if (settings.thresholdName) return settings.thresholdName;
      const format = group => {
        const parts = group.children.map(row => {
          if (row.children) return `（${format(row)}）`;
          const { label, unit } = effectOption(row.key);
          return label + (row.min ? ` ${row.min}${unit}以上` : "") +
            (row.max ? ` ${row.max}${unit}以下` : "") + (row.stars ? ` ★${row.stars}以上` : "");
        });
        return group.join === "count" ? `${parts.length}件中${group.minimum}件以上（${parts.join(" ／ ")}）` :
          parts.join(group.join === "or" ? " または " : " かつ ");
      };
      return format(activeGroup(state.root));
    }

    function clearExplore() {
      if (!explore) return;
      explore.panel.remove();
      explore.controls.remove();
      explore.status.remove();
      explore = null;
      applyExplore(null);
    }

    let sentExplore;
    function applyExplore(plan) {
      const detail = JSON.stringify(plan);
      if (sentExplore === detail) return;
      sentExplore = detail;
      document.dispatchEvent(new CustomEvent("hako-af:apply-explore", { detail }));
    }

    function prepareExplore(anchor) {
      if (explore?.anchor === anchor) return explore;
      clearExplore();
      sentExplore = undefined;
      const panel = makePanel("explore");
      const controls = node("div", "explore-controls");
      const status = node("div", "explore-status");
      status.setAttribute("role", "status");
      status.setAttribute("aria-atomic", "true");
      status.hidden = true;
      const statusCount = node("strong", "explore-status-count");
      const statusBasis = node("span", "explore-status-basis");
      const statusDetail = node("span", "explore-status-detail");
      status.append(statusCount, statusBasis, statusDetail);
      const legend = node("span", "explore-sort-legend");
      legend.hidden = true;
      const matchLegend = node("span", "explore-match-legend", "✓ 一致した条件");
      matchLegend.hidden = true;
      const mode = document.createElement("select");
      mode.setAttribute("aria-label", "探索結果のページ表示");
      mode.replaceChildren(new Option("標準の件数", "standard"), new Option("全件表示", "all"), new Option("優先度別ページ", "priority"));
      mode.addEventListener("change", () => {
        settings.paging = mode.value;
        changeSettings();
      });
      controls.append(panel.element, mode, legend, matchLegend);
      anchor.append(controls);
      const summary = anchor.closest(".fx-summary") ?? anchor.parentElement?.parentElement;
      const banner = summary?.querySelector(".fx-summary__banner") ?? [...(summary?.querySelectorAll("span") ?? [])]
        .find(el => el.textContent.trim() === "アーティファクトアイテムを獲得しました！")?.parentElement;
      if (banner) banner.after(status);
      else anchor.after(status);
      explore = { anchor, panel, controls, status, statusCount, statusBasis, statusDetail, mode, legend, matchLegend };
      return explore;
    }

    function updateExplore() {
      if (!enabled("explore") || !currentDrops || !currentDrops.anchor.isConnected) {
        clearExplore();
        return;
      }
      const { anchor, rows: data } = currentDrops;
      const ui = prepareExplore(anchor);
      const { state } = ui.panel;
      if (ui.mode.value !== settings.paging) ui.mode.value = settings.paging;
      const plan = { enabled: true, root: state.root, useForecast: state.useForecast, showUnknown: state.showUnknown,
        sort: state.sortKey ? { key: state.sortKey, direction: state.sortDirection, forecast: state.useForecast } : null,
        paging: settings.paging, groups: settings.groups, candidates: settings.candidates };
      applyExplore(plan);
      const config = JSON.stringify([plan, settings.thresholdName]);
      if (config === ui.signature && data === ui.data) return;
      ui.signature = config;
      ui.data = data;
      const view = viewRule(state);
      const legendText = plan.sort ? "並び順 " + effectOption(plan.sort.key).label +
        (!view.active && plan.sort.forecast ? "（→ Lv4000予測）" : "") : "";
      if (ui.legend.textContent !== legendText) ui.legend.textContent = legendText;
      ui.legend.hidden = !legendText;
      const matchText = "✓ 一致した条件" + (state.useForecast ? "　→ Lv4000予測" : "");
      if (ui.matchLegend.textContent !== matchText) ui.matchLegend.textContent = matchText;
      ui.matchLegend.hidden = !view.active;
      ui.matchLegend.dataset.color = settings.matchColor;
      const list = data.map(item => ({ ...item, ...toMetrics(item.raw) }));
      let matches = 0;
      let unknown = 0;
      const counts = new Map();
      for (const item of list) {
        const outcome = view.check(item);
        if (outcome.result === true) matches += item.amount;
        if (outcome.unknown) unknown += item.amount;
        for (const metric of item.metrics.keys()) counts.set(metric, (counts.get(metric) ?? 0) + item.amount);
      }
      const condition = view.active && !view.error ? labelThreshold(state) : "";
      const unverified = unknown ? "（判定不可 " + numbers.format(unknown) + "個）" : "";
      let message = "";
      if (view.error) message = view.error;
      else if (view.active) {
        const short = condition.length > 95 ? condition.slice(0, 94) + "…" : condition;
        message = "「" + short + "」の条件を満たしたAFが" + numbers.format(matches) + "個ドロップしました。" + unverified;
      }
      const countLabel = view.error ? "条件を確認" : matches > 0 ? "一致あり " + numbers.format(matches) + "個" : "一致なし 0個";
      const basisLabel = view.error ? "" : state.useForecast ? "Lv4000予測" : "現在値";
      const detailLabel = view.error || (condition ? "「" + condition + "」" + unverified : "");
      ui.status.dataset.result = view.error ? "error" : matches > 0 ? "hit" : "miss";
      if (ui.statusCount.textContent !== countLabel) ui.statusCount.textContent = countLabel;
      if (ui.statusBasis.textContent !== basisLabel) ui.statusBasis.textContent = basisLabel;
      ui.statusBasis.hidden = !basisLabel;
      if (ui.statusDetail.textContent !== detailLabel) ui.statusDetail.textContent = detailLabel;
      if (ui.statusDetail.title !== detailLabel) ui.statusDetail.title = detailLabel;
      ui.status.hidden = !message;
      ui.panel.refresh(listOptions(list, state), counts, {
        active: view.active, matched: matches, unknown, message, resultLabel: "候補", matchingIds: []
      });
    }

    function recordBalance(value) {
      if (!value && currentBalance) requestScan();
      currentBalance = value;
      if (!value || !enabled("daily")) return;
      const date = balanceDate.format(value.now);
      const key = "hakoAf4000:daily:" + value.id;
      const previous = get(key);
      const day = previous?.date === date ? previous : { date };
      let changed = previous?.date !== date;
      for (const type of ["gold", "potion"]) {
        if (value[type] == null) continue;
        if (!day[type] || value.now < day[type].baselineAt) {
          day[type] = { baseline: value[type], baselineAt: value.now };
          changed = true;
        }
      }
      if (changed) save(key, day);
      currentBalance = { ...value, day };
      requestScan();
    }

    function dailyText() {
      if (!currentBalance?.day) return "";
      const { day } = currentBalance;
      return ["gold", "potion"].flatMap((type, index) => {
        const data = day[type];
        if (!data || currentBalance[type] == null) return [];
        const amount = BigInt(currentBalance[type]) - BigInt(data.baseline);
        return [`${index ? "ポーション" : "G"} ${delta.format(amount)}`];
      }).join(" ／ ");
    }

    function classify(label, hint) {
      if (Object.hasOwn(alerts, hint)) return hint;
      return ["guildBoss", "guildShop", "npc", "expedition", "hatchery", "ark", "production",
        "colosseum", "nation"].find(id => homeText[id].test(label)) ?? "other";
    }
    function withinFilter(id) {
      return settings.alerts[id] && (!id.startsWith("npc") || settings.alerts.npc);
    }
    function updateHome() {
      const home = location.pathname === "/" || location.pathname === "/f/home" || location.pathname === "/home";
      const top = document.querySelector(".fx-topbar,.layout-header") ?? (home ? document.querySelector("#__nuxt header") : null);
      const anchor = home ? document.querySelector(homeRoot) ?? document.querySelector("#__nuxt main") : null;
      const label = enabled("daily") && dailyText();
      if (label && (top || home && anchor)) {
        dailyChip ??= node("div", "daily-balance");
        const caption = "今日の増減（JST） " + label;
        if (dailyChip.textContent !== caption) dailyChip.textContent = caption;
        const times = Object.entries(currentBalance.day).filter(([, v]) => v?.baselineAt != null)
          .map(([type, v]) => (type === "gold" ? "ゴールド" : "ポーション") + " " + balanceTime.format(v.baselineAt));
        dailyChip.title = "基準は今日最初に確認した残高（" + times.join("／") + "）";
        if (top) {
          if (top.nextElementSibling !== dailyChip) top.after(dailyChip);
        } else if (dailyChip.parentElement !== anchor) anchor.prepend(dailyChip);
      } else dailyChip?.remove();
      const nextHidden = new Set();
      if (!home || !anchor || !enabled("home")) {
        for (const row of nativeAlertState) row.removeAttribute("data-ha4-hidden-alert");
        nativeAlertState = nextHidden;
        homePanel?.remove();
        return;
      }
      const rows = [];
      const nativeCategories = new Set();
      const hasHatcheryTimer = homeTimers.some(task => task.id === "hatchery");
      for (const row of document.querySelectorAll("#fx-todo .fx-todo__list > li,[aria-label='国のお知らせ'] li")) {
        const message = row.textContent.trim().replace(/\s+/g, " ").replace(/[×›▽]\s*$/g, "").trim();
        const link = row.querySelector("a[href]");
        if (/ギルドダンジョン/.test(message) || /^\/(?:f\/)?guild-dungeons(?:\/|$)/.test(link?.pathname ?? "")) continue;
        const isNation = row.closest("[aria-label='国のお知らせ']") && !homeText.guildBoss.test(message);
        const id = classify(message, isNation ? "nation" : null);
        if (!withinFilter(id)) {
          row.setAttribute("data-ha4-hidden-alert", "");
          nextHidden.add(row);
        } else if (message && id !== "guildBoss" && !(id === "hatchery" && hasHatcheryTimer) &&
            !(id === "npc" && homeChecked.has("npcLimited") && homeChecked.has("npcNormal") && /商品が入れ替わりました/.test(message))) {
          nativeCategories.add(id);
          rows.push({ id, message, to: link?.pathname && link.origin === location.origin ? link.pathname + link.search : null });
        }
      }
      for (const row of nativeAlertState) if (!nextHidden.has(row)) row.removeAttribute("data-ha4-hidden-alert");
      nativeAlertState = nextHidden;
      for (const task of homeTimers) {
        if ((task.pending && nativeCategories.has(task.id)) || !withinFilter(task.id)) continue;
        rows.push(task);
      }
      if (settings.alerts.materials) {
        for (const item of watchItems) {
          const live = watchCounts.has(item.id);
          const amount = watchCounts.get(item.id) ?? item.amount;
          const valid = Number.isSafeInteger(amount) && amount >= 0;
          const goal = item.goal;
          const reached = valid && goal > 0 && amount >= goal;
          const reading = valid ? numbers.format(amount) + (goal ? " / " + numbers.format(goal) : "") : "所持数未確認";
          const when = item.checkedAt ? `（前回確認 ${balanceDate.format(item.checkedAt).slice(5)} ${balanceTime.format(item.checkedAt)}）` : "";
          const status = reached ? live ? "　目標達成" : "　前回確認時に目標達成" : "";
          rows.push({ id: "materials", to: "/items?ha4_item=" + encodeURIComponent(item.id), reached: reached && live, message:
            `${item.name}　${reading}${status}${live ? "" : when}` });
        }
      }
      if (!rows.length) {
        homePanel?.remove();
        return;
      }
      if (!homePanel) {
        const panel = homePanel = node("details", "home-alerts");
        let lastOpen = get(homeAlertsOpenKey) !== false;
        panel.open = lastOpen;
        panel.addEventListener("toggle", () => {
          if (panel.open === lastOpen) return;
          lastOpen = panel.open;
          save(homeAlertsOpenKey, lastOpen);
        });
        panel.append(node("summary", "extra-heading", "拡張通知"), node("ul", "extra-alert-list"));
      }
      if (homePanel.parentElement !== anchor) anchor.prepend(homePanel);
      const messages = new Map(rows.map(({ id, message, end, to, reached }) => {
        const label = id.startsWith("slot:") ? "スロット" : alerts[id];
        const prefix = id === "materials" || id === "hatchery" || message.startsWith(label) ? "" : label + "  ";
        const time = end ? `（${balanceDate.format(end).slice(5)} ${balanceTime.format(end)} JST）` : "";
        return [prefix + message + time, { to, reached }];
      }));
      const signature = JSON.stringify([...messages]);
      if (homePanel.dataset.content !== signature) {
        homePanel.dataset.content = signature;
        homePanel.lastElementChild.replaceChildren(...[...messages].map(([message, { to, reached }]) => {
          const item = node("li", "extra-alert");
          if (reached) item.dataset.ha4Goal = "";
          if (typeof to === "string" && /^\/(?!\/)/.test(to)) {
            const link = node("a", "extra-link", message);
            link.href = to;
            item.append(link);
          } else item.textContent = message;
          return item;
        }));
      }
    }

    function placeSettings() {
      const menu = document.querySelector(`#__nuxt header ${menuControl}`);
      const classic = Array.from(document.querySelectorAll("#__nuxt header nav button, #__nuxt header button[title='メニュー'] ~ div button"))
        .find(button => button.textContent.trim() === "設定");
      const anchor = document.querySelector(settingsControl) ?? classic;
      if (!anchor) {
        settingButton.remove();
        return;
      }
      settingButton.dataset.ha4Placement = anchor.matches(".fx-topbar__settings") ? "topbar" :
        menu && menu.parentElement.contains(anchor) ? "menu" : "header";
      if (anchor.nextElementSibling !== settingButton) anchor.after(settingButton);
    }

    function refreshVersionControl(control) {
      const { text, busy, error } = desktop.status();
      const trigger = control.querySelector("button");
      const status = control.querySelector('[data-ha4="update-version-status"]');
      trigger.disabled = busy;
      status.textContent = text;
      status.toggleAttribute("data-error", error);
    }

    function versionControl(caption, kind) {
      if (!desktop?.checkNow) return node("span", kind, caption);
      const control = node("span", kind);
      control.dataset.ha4VersionCheck = "";
      const trigger = makeButton(caption, "update-version-button");
      trigger.title = "配布版の更新を確認する";
      trigger.addEventListener("click", desktop.checkNow);
      const status = node("small", "update-version-status");
      status.setAttribute("role", "status");
      control.append(trigger, status);
      refreshVersionControl(control);
      return control;
    }

    document.addEventListener("hako-af:desktop-update-status", () => {
      for (const control of document.querySelectorAll("[data-ha4-version-check]")) refreshVersionControl(control);
    });

    function makeUpdateNotice(available) {
      const notice = node("aside", "update-notice");
      notice.dataset.version = available;
      notice.setAttribute("aria-label", "拡張機能の更新案内");
      const head = node("div", "update-notice-head");
      const close = makeButton("×", "update-notice-close");
      close.setAttribute("aria-label", "更新案内を閉じる");
      close.addEventListener("click", () => {
        closedUpdateVersion = available;
        save(closedUpdateNoticeKey, available);
        placeUpdateNotice();
      });
      head.append(node("strong", "update-notice-title", `拡張 v${available} に更新できます`), close);
      const status = node("p", "update-notice-status", "更新ZIPを取得済みです。");
      status.setAttribute("role", "status");

      const steps = node("details", "update-notice-details");
      const instructions = node("ol", "update-notice-steps");
      instructions.append(node("li", "update-notice-step", "ZIPを現在の拡張機能フォルダーに上書き展開します。"),
        node("li", "update-notice-step", "はこホムのタブを再読み込みします。"));
      const saveZip = makeButton("ZIPを再保存");
      saveZip.addEventListener("click", desktop.saveArchive);
      steps.append(node("summary", "update-notice-summary", "更新手順"), instructions,
        node("p", "update-notice-note", "自動更新がオフの場合は、先にChromeの拡張機能画面で拡張機能を再読み込みしてください。"), saveZip);
      notice.append(head, status, steps);
      return notice;
    }

    function placeUpdateNotice() {
      const available = desktop?.archiveVersion();
      if (!available || available === closedUpdateVersion) {
        updateNotice?.remove();
        updateNotice = null;
        return;
      }
      if (updateNotice?.dataset.version !== available) {
        updateNotice?.remove();
        updateNotice = makeUpdateNotice(available);
      }
      const settingsSection = settingsDialog?.open && settingsDialog.querySelector("[data-ha4-update-settings]");
      const owner = settingsSection || document.body;
      if (owner && updateNotice.parentElement !== owner) owner.append(updateNotice);
    }

    if (desktop) {
      document.addEventListener("hako-af:desktop-update-archive", placeUpdateNotice);
      window.addEventListener("storage", event => {
        if (event.key !== closedUpdateNoticeKey && event.key !== null) return;
        closedUpdateVersion = get(closedUpdateNoticeKey);
        placeUpdateNotice();
      });
    }

    function placeVersions() {
      for (const footer of document.querySelectorAll("#__nuxt footer")) {
        const previous = footer.querySelector('[data-ha4="footer-versions"]');
        if (!footer.querySelector('a[href="/terms"]') || !footer.querySelector('a[href="/privacy"]')) {
          previous?.remove();
          continue;
        }
        if (!requestedBuild) {
          requestedBuild = true;
          document.dispatchEvent(new Event("hako-af:read-game-build"));
        }
        const list = footer.querySelector(".fx-hub-foot__links");
        const owner = list ?? footer;
        if ((!version && !gameBuild) || previous?.parentElement === owner) continue;
        previous?.remove();
        const label = node(list ? "li" : "span", "footer-versions");
        if (version) label.append(versionControl(`拡張 v${version}`, "footer-extension-version"));
        if (gameBuild) {
          const build = node("span", "footer-game-build", `本体ビルド ${gameBuild.slice(0, 8)}`);
          build.title = `本体ビルド ${gameBuild}`;
          label.append(build);
        }
        owner.append(label);
      }
    }

    function receive(event, callback) {
      try { callback(JSON.parse(event.detail)); } catch { /* Ignore data that could not be decoded. */ }
    }
    document.addEventListener("hako-af:game-build", event => receive(event, build => {
      if (typeof build === "string") gameBuild = build;
    }));
    document.addEventListener("hako-af:drops", event => {
      if (previousDrops?.anchor === event.target && previousDrops.payload === event.detail) {
        currentDrops = previousDrops;
        return;
      }
      receive(event, rows => {
        if (Array.isArray(rows)) currentDrops = previousDrops = { anchor: event.target, rows, payload: event.detail };
      });
    });
    document.addEventListener("hako-af:balance", event => receive(event, recordBalance));
    document.addEventListener("hako-af:watched-items", event => receive(event, receiveItems));
    document.addEventListener("hako-af:inventory-item", event => receive(event, item => {
      if (event.target instanceof Element && item?.id && item.name) inventoryItem = { ...item, anchor: event.target };
    }));
    const skillKey = identity => "hakoAf4000:skill-presets:" + JSON.stringify(identity);
    document.addEventListener("hako-af:skill-preset-editor", event => receive(event, identity => {
      if (event.target instanceof Element) skillRoots.set(event.target, skillKey(identity));
    }));
    document.addEventListener("hako-af:skill-preset-entry", event => receive(event, entry => {
      if (!(event.target instanceof Element)) return;
      const key = skillKey(entry.identity);
      if (!skillRows.has(key)) skillRows.set(key, new Map());
      const rows = skillRows.get(key);
      if (!rows.has(entry.id)) rows.set(entry.id, { ...entry, anchor: event.target });
    }));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) requestScan(); });
    document.addEventListener("hako-af:home-alerts", event => receive(event, data => {
      if (Array.isArray(data?.alerts) && Array.isArray(data.checked)) {
        homeTimers = data.alerts;
        homeChecked = new Set(data.checked);
        requestScan();
      }
    }));
    function closeChatPreview() {
      chatPreview?.remove();
      chatPreviewQuote?.removeAttribute("aria-expanded");
      chatPreview = chatPreviewQuote = null;
    }
    document.addEventListener("hako-af:chat-reply-preview", event => receive(event, reply => {
      const quote = event.target;
      if (!enabled("chat") || !(quote instanceof Element)) return;
      const keepClosed = chatPreviewQuote === quote && chatPreview?.isConnected;
      closeChatPreview();
      if (keepClosed || typeof reply?.text !== "string") return;
      quote.nextElementSibling?.matches('[data-ha4="chat-note"]') && quote.nextElementSibling.remove();
      const caption = reply.quoted ? "返信元（保存された引用）" : "非表示の返信元";
      chatPreview = node("section", "chat-reply-preview");
      chatPreview.setAttribute("aria-label", caption);
      chatPreview.setAttribute("aria-live", "polite");
      chatPreview.append(node("strong", "chat-reply-author", `${caption}　${reply.name}`),
        node("p", "chat-reply-text", reply.text));
      quote.after(chatPreview);
      chatPreviewQuote = quote;
      quote.setAttribute("aria-expanded", "true");
    }));
    document.addEventListener("hako-af:chat-missing", event => receive(event, message => {
      closeChatPreview();
      const quote = event.target;
      const note = node("span", "chat-note", message);
      note.setAttribute("role", "status");
      quote.nextElementSibling?.matches('[data-ha4="chat-note"]') && quote.nextElementSibling.remove();
      quote.after(note);
      setTimeout(() => note.remove(), 4200);
    }));
    window.addEventListener("storage", event => {
      if (event.key !== configKey && event.key !== null) return;
      if (!globalThis.hakoAfFrameContext?.embedded &&
          !document.documentElement.hasAttribute("data-ha4-slot-home-active")) return;
      Object.assign(settings, loadSettings());
      tellMain();
      requestScan();
    });
    window.addEventListener("resize", requestScan, { passive: true });
    tellMain();
    return {
      enabled,
      matchColor: () => settings.matchColor,
      beforeRead() {
        currentDrops = inventoryItem = null;
        skillRoots.clear();
        skillRows.clear();
        readItems();
      },
      refresh() {
        refreshSlotHome?.();
        if (chatPreview && (!chatPreviewQuote.isConnected || chatPreviewQuote.nextElementSibling !== chatPreview)) {
          closeChatPreview();
        }
        placeSettings();
        placeVersions();
        placeUpdateNotice();
        updateItemWatch();
        updateSkillPresets();
        updateExplore();
        updateHome();
      }
    };
  }

  globalThis.hakoAfExtras = { start, get, save };
})();
