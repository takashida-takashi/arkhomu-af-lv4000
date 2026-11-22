(() => {
  "use strict";

  const labels = { hp: "体力", atk: "物攻", def: "物防", mtk: "魔攻", mdf: "魔防", spd: "速度", lck: "運" };
  const format = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 6 });

  function duration(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return (hours ? `${hours}時間` : "") + (rest || !hours ? `${rest}分` : "");
  }

  function start(node, enabled) {
    const panels = new WeakMap();
    const foodCards = new WeakMap();
    const preparationControls = new WeakMap();
    const name = globalThis.hakoAfFeatureNames.expedition;
    const rulesKey = "hakoAf4000:expedition-food-preferences";
    const foodOrderOptions = { native: "本体と同じ", rank: "ランク順", recent: "入手順", amount: "所持数" };
    const cardSelector = '[data-ha4="expedition-food-card-toggle"]';
    const rankNames = ["コモン", "アンコモン", "レア", "エリート", "エピック", "ヒロイック", "レジェンダリー",
      "ミシック", "セレスティアル", "ディバイン", "トランセンデント", "エターナル"];
    let stored;
    try { stored = JSON.parse(localStorage.getItem(rulesKey)); } catch { /* Use the defaults. */ }
    let maxRank = Number.isInteger(stored?.maxRank) && stored.maxRank >= 1 && stored.maxRank <= rankNames.length ? stored.maxRank : 0;
    let foodOrder = Object.hasOwn(foodOrderOptions, stored?.foodOrder) ? stored.foodOrder : "native";
    let includeMissing = stored?.includeMissing === true;
    const excluded = new Map(Array.isArray(stored?.excluded) ? stored.excluded.filter(item =>
      Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string") : []);

    function saveFoodRules() {
      try { localStorage.setItem(rulesKey, JSON.stringify({ maxRank, foodOrder, includeMissing, excluded: [...excluded] })); }
      catch { /* Keep the current settings for this tab. */ }
    }

    function forEachPlanner(callback) {
      for (const panel of document.querySelectorAll('[data-ha4="expedition-planner"]')) {
        const planner = panels.get(panel.parentElement);
        if (planner) callback(planner);
      }
    }

    function renderFoodCard(control, item) {
      const blocked = excluded.has(item.id);
      const pressed = String(blocked);
      const title = blocked ? `${item.label}の除外を解除` : `${item.label}を配分計算から除外`;
      if (control.title === title && control.getAttribute("aria-pressed") === pressed) return;
      control.title = title;
      control.setAttribute("aria-label", `${item.label}を配分計算から除外`);
      control.setAttribute("aria-pressed", pressed);
      control.textContent = blocked ? "除外中" : "除外";
    }

    function setExcluded(id, label) {
      if (label) excluded.set(id, label);
      else excluded.delete(id);
      saveFoodRules();
      forEachPlanner(planner => planner.rulesChanged());
      for (const control of document.querySelectorAll(cardSelector)) {
        const item = foodCards.get(control.parentElement)?.item;
        if (item?.id === id) renderFoodCard(control, item);
      }
    }

    function create(anchor) {
      const panel = node("details", "expedition-planner");
      const controls = node("div", "expedition-controls");
      const stat = node("select", "expedition-stat");
      stat.append(new Option("総合値（7能力の合計）", "total"));
      for (const [key, label] of Object.entries(labels)) stat.append(new Option(label, key));
      stat.append(new Option("カスタム（重み・最低値）", "custom"));
      const custom = node("div", "expedition-custom");
      const rules = node("div", "expedition-rules");
      for (const text of ["能力", "重み", "最低値"]) rules.append(node("strong", "expedition-rule-heading", text));
      const fields = Object.values(labels).map(name => {
        const weight = numberInput("", `${name}の重み`);
        const minimum = numberInput("", `${name}の最低値`);
        for (const field of [weight, minimum]) {
          field.placeholder = "0";
          field.max = Number.MAX_SAFE_INTEGER;
        }
        weight.inputMode = "decimal";
        weight.step = "any";
        rules.append(node("span", "expedition-rule-stat", name), weight, minimum);
        return { weight, minimum };
      });
      custom.hidden = true;
      custom.append(rules, node("p", "expedition-rule-hint", "最低値は1体あたりの最終上昇量です。重み0の能力にも最低値を指定できます。"));
      const hours = numberInput(4, "時間");
      const minutes = numberInput(0, "分");
      minutes.max = 59;
      const repeat = node("input", "expedition-repeat");
      repeat.type = "checkbox";
      repeat.checked = true;
      const estimate = button("配分を計算");
      const message = node("p", "expedition-message");
      message.setAttribute("role", "status");
      const outcome = node("div", "expedition-outcome");
      const repeatLabel = label("くり返しも含める", repeat, true);
      const missing = node("input", "expedition-include-missing");
      missing.type = "checkbox";
      missing.checked = includeMissing;
      const foodRules = node("details", "expedition-food-rules");
      const cap = node("select", "expedition-stat");
      cap.append(new Option("指定なし", "0"));
      rankNames.forEach((text, i) => cap.append(new Option(text, String(i + 1))));
      cap.value = String(maxRank);
      const order = node("select", "expedition-stat");
      for (const [value, text] of Object.entries(foodOrderOptions)) order.append(new Option(text, value));
      order.value = foodOrder;
      const search = node("input", "expedition-food-search");
      search.type = "search";
      search.placeholder = "除外する食材を検索";
      search.setAttribute("aria-label", search.placeholder);
      const foodChoice = node("select", "expedition-stat");
      foodChoice.setAttribute("aria-label", "除外する食材");
      const addFood = button("除外");
      const selectedFoods = node("ul", "expedition-food-excluded");
      const foodPicker = node("div", "expedition-food-picker");
      foodPicker.append(search, foodChoice, addFood);
      foodRules.append(node("summary", "expedition-food-summary", "食材の使用条件"),
        label("最高レア度", cap), label("除外候補の並び順", order), foodPicker, selectedFoods);
      let foods;
      let foodReady = false;
      let revision = 0;
      controls.append(label("比較方法", stat), label("時間", hours, true), label("分以内", minutes, true),
        repeatLabel, label("未所持・所持数不足も候補に含める", missing, true), custom, foodRules, estimate);
      panel.append(node("summary", "expedition-summary", name), controls, message, outcome);
      anchor.prepend(panel);

      function requestFoods() {
        anchor.dispatchEvent(new CustomEvent("hako-af:expedition-food-list", {
          bubbles: true, detail: JSON.stringify({ order: foodOrder, includeMissing })
        }));
      }

      function renderFoodPicker() {
        const before = foodChoice.value;
        const query = search.value.trim().toLocaleLowerCase();
        const matches = [...(foods?.values() ?? [])].filter(item =>
          !excluded.has(item.id) && item.label.toLocaleLowerCase().includes(query));
        const prompt = matches.length ? "食材を選ぶ" : foods ? "候補なし" : "読み込み中…";
        foodChoice.replaceChildren(new Option(prompt, ""), ...matches.map(item => new Option(item.label, item.id)));
        if (matches.some(item => item.id === before)) foodChoice.value = before;
        addFood.disabled = !foodChoice.value;
      }

      function renderFoodRules() {
        cap.value = String(maxRank);
        renderFoodPicker();
        selectedFoods.replaceChildren(...[...excluded].map(([id, name]) => {
          const line = node("li", "expedition-food-exclusion", name);
          const remove = button("戻す");
          remove.setAttribute("aria-label", `${name}を除外から戻す`);
          remove.addEventListener("click", () => setExcluded(id));
          line.append(remove);
          return line;
        }));
      }

      panel.addEventListener("toggle", () => { if (panel.open && foodRules.open) requestFoods(); });
      foodRules.addEventListener("toggle", () => { if (foodRules.open) requestFoods(); });
      search.addEventListener("input", event => { event.stopPropagation(); renderFoodPicker(); });
      foodChoice.addEventListener("input", event => {
        event.stopPropagation();
        addFood.disabled = !foodChoice.value;
      });
      order.addEventListener("input", event => {
        event.stopPropagation();
        foodOrder = order.value;
        saveFoodRules();
        forEachPlanner(planner => planner.refreshOrder());
      });
      cap.addEventListener("input", event => {
        event.stopPropagation();
        maxRank = Number(cap.value);
        saveFoodRules();
        forEachPlanner(planner => planner.rulesChanged());
      });
      missing.addEventListener("input", event => {
        event.stopPropagation();
        includeMissing = missing.checked;
        saveFoodRules();
        forEachPlanner(planner => {
          planner.rulesChanged();
          planner.refreshOrder();
        });
      });
      addFood.addEventListener("click", () => {
        const item = foods?.get(foodChoice.value);
        if (item) setExcluded(item.id, item.label);
      });
      renderFoodRules();

      function input() {
        const total = Number(hours.value) * 60 + Number(minutes.value);
        if (!hours.checkValidity() || !minutes.checkValidity() || !Number.isSafeInteger(total) || total < 1) {
          return { error: "1分以上の時間を入力してください。" };
        }
        const data = { stat: stat.value, minutes: total, repeat: repeat.checked && !repeat.disabled,
          maxRank, excluded: [...excluded.keys()], includeMissing };
        if (stat.value !== "custom") return data;
        if (fields.some(({ weight, minimum }) => !weight.checkValidity() || !minimum.checkValidity())) {
          return { error: "重みには0以上の数値を、最低値には0以上の整数を入力してください。" };
        }
        const weights = fields.map(({ weight }) => Number(weight.value));
        if (!weights.some(value => value > 0)) return { error: "重みを1つ以上指定してください。" };
        return { ...data, weights, minimums: fields.map(({ minimum }) => Number(minimum.value)) };
      }

      function request(apply) {
        const data = input();
        outcome.replaceChildren();
        if (data.error) {
          message.textContent = data.error;
          return;
        }
        message.textContent = "配分を計算中…";
        estimate.disabled = true;
        const requested = ++revision;
        requestAnimationFrame(() => setTimeout(() => {
          if (requested !== revision || !anchor.isConnected || !enabled()) return;
          anchor.dispatchEvent(new CustomEvent("hako-af:expedition-plan", {
            bubbles: true, detail: JSON.stringify({ ...data, apply, requestId: requested })
          }));
        }, 0));
      }

      estimate.addEventListener("click", () => request());
      function invalidate() {
        revision++;
        anchor.dispatchEvent(new CustomEvent("hako-af:expedition-cancel", { bubbles: true }));
        custom.hidden = stat.value !== "custom";
        estimate.disabled = false;
        message.textContent = "";
        outcome.replaceChildren();
      }
      controls.addEventListener("input", invalidate);

      return {
        panel,
        update({ gate, repeatReady, foodReady: ready }) {
          if (panel.parentElement !== anchor) anchor.prepend(panel);
          panel.hidden = !enabled();
          repeat.disabled = !gate;
          repeatLabel.title = gate ? `遠征の門の上限 ${duration(gate)}`
            : repeatReady ? "くり返しは利用できません" : "くり返しの利用状況を確認中";
          if (ready && !foodReady && foodRules.open) queueMicrotask(requestFoods);
          foodReady = ready;
        },
        refreshOrder() {
          order.value = foodOrder;
          if (enabled() && panel.open && foodRules.open) requestFoods();
        },
        rulesChanged() {
          missing.checked = includeMissing;
          renderFoodRules();
          invalidate();
        },
        catalog(data) {
          foods = data.ready ? new Map(data.items.map(item => [item.id, item])) : null;
          renderFoodPicker();
        },
        show(result) {
          if (result.requestId !== revision) return;
          estimate.disabled = false;
          outcome.replaceChildren();
          message.textContent = result.error ?? (result.changed ? "条件または所持数が変わったので再計算しました。"
            : result.applied ? "弁当欄にセットしました。" : "");
          if (result.error) return;
          const time = result.trips > 1 ? `（初回 ${duration(result.first)}）` : "";
          const objective = stat.value === "custom" ? "加重スコア" : labels[stat.value] ?? "総合値";
          const slots = ` · 弁当 ${result.foods.length}/${result.slots}枠`;
          outcome.append(node("strong", "expedition-total",
            `${objective} +${format.format(result.gain)}／1体 · ${duration(result.minutes)} · ${result.trips}回${time}${slots}`));
          if (result.limited) outcome.append(node("p", "expedition-repeat-hint", "探索上限までに見つかった候補です。最大値は未確定です。"));
          if (stat.value === "total" || stat.value === "custom") {
            const breakdown = Object.values(labels).map((label, i) => result.gains[i]
              ? `${label} +${format.format(result.gains[i])}` : "").filter(Boolean);
            outcome.append(node("div", "expedition-gains", breakdown.join("・")));
          }
          const groups = new Map();
          for (const food of result.foods) {
            const group = groups.get(food.id) ?? { ...food, count: 0 };
            group.count++;
            groups.set(food.id, group);
          }
          const foods = node("ul", "expedition-foods");
          const supply = new Map(result.supply?.map(item => [item.id, item]));
          for (const { itemId, label: food, count, value } of groups.values()) {
            const row = node("li", "expedition-food",
              `${food} ×${count}（1個あたり ${objective} +${format.format(value)}）`);
            const stock = supply.get(itemId);
            if (stock?.unfilled) {
              const detail = stock.short
                ? `（所持${format.format(stock.owned)}個／必要${format.format(stock.needed)}個）`
                : "（所持数の内訳では、くり返し分を確保できません）";
              const shortage = stock.short ? `あと${format.format(stock.short)}個` : "くり返し分が不足";
              row.append(node("div", "expedition-food-shortage", shortage + detail));
            }
            foods.append(row);
          }
          outcome.append(foods);
          if (result.canApply && (result.trips > 1 || result.applied && !repeat.disabled)) outcome.append(node("p", "expedition-repeat-hint",
            `出発前に標準の確認画面で ${result.trips}回 を選んでください。`));
          if (!result.canApply) outcome.append(node("p", "expedition-repeat-hint",
            "必要な食材がそろったら、もう一度計算して弁当にセットできます。"));
          if (!result.applied && result.canApply) {
            const apply = button("この配分をセット");
            apply.addEventListener("click", () => request(result.signature));
            outcome.append(apply);
          }
        }
      };
    }

    function button(text) {
      const el = node("button", "expedition-button", text);
      el.type = "button";
      return el;
    }

    function numberInput(value, unit) {
      const el = node("input", "expedition-time");
      el.type = "number";
      el.inputMode = "numeric";
      el.min = 0;
      el.step = 1;
      el.value = value;
      el.setAttribute("aria-label", unit);
      return el;
    }

    function label(text, el, controlFirst = false) {
      const label = node("label", "expedition-label");
      label.append(...(controlFirst ? [el, text] : [text, el]));
      return label;
    }

    document.addEventListener("hako-af:expedition-panel", event => {
      const anchor = event.target;
      if (!enabled() && !panels.has(anchor)) return;
      const panel = panels.get(anchor) ?? create(anchor);
      panels.set(anchor, panel);
      panel.update(JSON.parse(event.detail));
    });

    document.addEventListener("hako-af:expedition-result", event => {
      panels.get(event.target)?.show(JSON.parse(event.detail));
    });

    document.addEventListener("hako-af:expedition-food-catalog", event =>
      panels.get(event.target)?.catalog(JSON.parse(event.detail)));

    document.addEventListener("change", event => {
      const select = event.target;
      if (foodOrder !== "native" || !select.matches?.('select:not([data-ha4])') ||
          !select.closest('[data-bento-pointer-remove], [data-fx-drop="bento-list"]')) return;
      requestAnimationFrame(() => forEachPlanner(planner => planner.refreshOrder()));
    }, true);

    document.addEventListener("hako-af:expedition-food-card", event => {
      const card = event.target;
      let entry = foodCards.get(card);
      if (!enabled()) {
        entry?.control.remove();
        return;
      }
      const item = JSON.parse(event.detail);
      if (!entry) {
        const control = node("button", "expedition-food-card-toggle");
        control.type = "button";
        entry = { control, item };
        foodCards.set(card, entry);
        for (const type of ["pointerdown", "pointerup", "dblclick"]) {
          control.addEventListener(type, event => event.stopPropagation());
        }
        control.addEventListener("click", event => {
          event.stopPropagation();
          const { id, label } = entry.item;
          setExcluded(id, excluded.has(id) ? null : label);
        });
      }
      entry.item = item;
      renderFoodCard(entry.control, item);
      if (entry.control.parentElement !== card) card.append(entry.control);
    });

    document.addEventListener("hako-af:expedition-preparation", event => {
      const anchor = event.target;
      const { phase, saved } = JSON.parse(event.detail);
      const previous = preparationControls.get(anchor);
      const visible = enabled() && phase !== "normal" && (phase !== "ready" || saved);
      if (!visible) {
        if (!enabled() && phase === "editing" && previous)
          anchor.dispatchEvent(new CustomEvent("hako-af:expedition-preparation-toggle", { bubbles: true }));
        previous?.element.remove();
        preparationControls.delete(anchor);
        anchor.removeAttribute("data-ha4-expedition-preparing");
        return;
      }
      if (previous?.phase === phase && previous.element.isConnected) return;
      previous?.element.remove();
      const element = node("div", "expedition-preparation-controls");
      const trigger = button(phase === "editing" ? "遠征状況に戻る" : phase === "ready" ? "下書きを反映" : "遠征画面を開く");
      const status = node("span", "expedition-message", phase === "editing" ? "次の遠征を準備中 · 出発は報酬回収後" : "");
      status.setAttribute("role", "status");
      trigger.addEventListener("click", () => anchor.dispatchEvent(new CustomEvent(phase === "ready"
        ? "hako-af:expedition-preparation-restore" : "hako-af:expedition-preparation-toggle", { bubbles: true })));
      element.append(trigger, status);
      if (phase === "editing") {
        anchor.dataset.ha4ExpeditionPreparing = "";
        const header = anchor.querySelector(".fx-expd__heading");
        if (header) header.after(element);
        else anchor.prepend(element);
      } else if (phase === "ready") anchor.after(element);
      else anchor.append(element);
      preparationControls.set(anchor, { phase, element, status });
    });

    document.addEventListener("hako-af:expedition-preparation-notice", event => {
      const control = preparationControls.get(event.target);
      if (control) control.status.textContent = event.detail;
    });

    document.addEventListener("hako-af:expedition-elapsed", event => {
      const label = event.target.nextElementSibling;
      const existing = label?.matches('[data-ha4="expedition-elapsed"]') ? label : null;
      if (!enabled()) return existing?.remove();
      const text = `経過 ${duration(event.detail)}`;
      if (existing) {
        if (existing.textContent !== text) existing.textContent = text;
      } else event.target.after(node("span", "expedition-elapsed", text));
    });
  }

  globalThis.hakoAfExpedition = { start };
})();
