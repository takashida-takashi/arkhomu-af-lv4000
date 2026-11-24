(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const prefix = "hakoAf4000:price-watch:";
  const format = new Intl.NumberFormat("ja-JP");
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
  const priceText = price => `${format.format(price)} G`;
  const axisPrice = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });

  function priceChart(node, record) {
    const points = record.points.filter(point => Number.isFinite(point?.at) && point.at >= 0 &&
      Number.isSafeInteger(point.price) && point.price > 0).slice(-90).sort((a, b) => a.at - b.at);
    const last = points.at(-1);
    if (last && Number.isFinite(record.checked) && record.checked > last.at) points.push({ at: record.checked, price: last.price });
    if (!points.length) return node("p", "market-watch-note", "価格の記録はまだありません。");
    const root = node("figure", "market-watch-chart");
    const reading = node("figcaption", "market-watch-chart-reading");
    reading.setAttribute("aria-live", "polite");
    const svg = (tag, attrs, text) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
      if (text != null) element.textContent = text;
      return element;
    };
    const width = 600, height = 230, left = 76, right = width - 16, top = 18, bottom = height - 38;
    const low = Math.min(...points.map(point => point.price)), high = Math.max(...points.map(point => point.price));
    const padding = Math.max((high - low) * .12, high === low ? high * .05 : 0, 1);
    const floor = Math.max(0, low - padding), ceiling = high + padding;
    const firstAt = points[0].at, lastAt = points.at(-1).at;
    const x = point => firstAt === lastAt ? (left + right) / 2 : left + (point.at - firstAt) / (lastAt - firstAt) * (right - left);
    const y = point => bottom - (point.price - floor) / (ceiling - floor) * (bottom - top);
    const plot = svg("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", tabindex: 0,
      "aria-label": `${record.name}の最安値推移。グラフを押すか左右キーで日時と価格を確認できます。`, "data-ha4": "market-watch-plot" });
    plot.append(svg("title", {}, `${record.name}の最安値推移`));
    for (let index = 0; index < 3; index++) {
      const value = floor + (ceiling - floor) * index / 2, position = bottom - (bottom - top) * index / 2;
      plot.append(svg("line", { x1: left, x2: right, y1: position, y2: position, class: "ha4-price-grid" }),
        svg("text", { x: left - 9, y: position + 5, "text-anchor": "end", class: "ha4-price-axis" }, `${axisPrice.format(value)} G`));
    }
    for (const [point, position, anchor] of firstAt === lastAt ? [[points[0], (left + right) / 2, "middle"]] :
      [[points[0], left, "start"], [points.at(-1), right, "end"]]) {
      plot.append(svg("text", { x: position, y: height - 12, "text-anchor": anchor, class: "ha4-price-axis" }, `${date.format(point.at)} JST`));
    }
    const coordinates = points.map(point => `${x(point).toFixed(2)},${y(point).toFixed(2)}`).join(" ");
    if (points.length > 1) plot.append(svg("polygon", { points: `${x(points[0])},${bottom} ${coordinates} ${x(points.at(-1))},${bottom}`, class: "ha4-price-area" }));
    plot.append(svg("polyline", { points: coordinates, class: "ha4-price-line" }));
    for (const point of points) {
      const dot = svg("circle", { cx: x(point), cy: y(point), r: 3, class: "ha4-price-dot" });
      dot.append(svg("title", {}, `${date.format(point.at)} JST　${priceText(point.price)}`));
      plot.append(dot);
    }
    const guide = svg("line", { y1: top, y2: bottom, class: "ha4-price-guide" });
    const cursor = svg("circle", { r: 5, class: "ha4-price-cursor" });
    plot.append(guide, cursor);
    let selected = -1;
    const select = index => {
      index = Math.max(0, Math.min(points.length - 1, index));
      if (selected === index) return;
      selected = index;
      const point = points[index];
      reading.textContent = `${date.format(point.at)} JST　${priceText(point.price)}`;
      guide.setAttribute("x1", x(point));guide.setAttribute("x2", x(point));
      cursor.setAttribute("cx", x(point));cursor.setAttribute("cy", y(point));
    };
    const pointAt = event => {
      const rect = plot.getBoundingClientRect();
      if (!rect.width) return;
      const position = (event.clientX - rect.left) / rect.width * width;
      let nearest = 0;
      for (let index = 1; index < points.length; index++) if (Math.abs(x(points[index]) - position) < Math.abs(x(points[nearest]) - position)) nearest = index;
      select(nearest);
    };
    plot.addEventListener("pointermove", pointAt);
    plot.addEventListener("click", pointAt);
    plot.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();event.stopPropagation();
      select(event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : selected + (event.key === "ArrowLeft" ? -1 : 1));
    });
    select(points.length - 1);
    root.append(reading, plot, node("p", "market-watch-chart-hint", "タップ・マウス・左右キーで価格を確認"));
    return root;
  }

  function findLauncherPosition(market) {
    const page = market.querySelector("main") ?? market;
    const visible = element => element?.getClientRects().length;
    const heading = [...page.querySelectorAll("h2")].find(element =>
      visible(element) && [...element.childNodes].some(child =>
        child.nodeType === Node.TEXT_NODE && child.textContent.trim() === "アイテム検索"));
    if (heading) return { anchor: heading, inline: true };

    const flexSearch = page.querySelector(".fx-market-finder__search");
    if (visible(flexSearch)) return { anchor: flexSearch };

    const searchToggle = [...page.querySelectorAll("section button[aria-expanded]")].find(button =>
      visible(button) && button.querySelector("span.truncate")?.textContent === "検索・絞り込み");
    if (searchToggle) return { anchor: searchToggle.parentElement };

    const search = page.querySelector('input[enterkeyhint="search"][placeholder^="アイテム"]');
    if (visible(search)) return { anchor: search.parentElement };

    const modes = page.querySelector(".fx-market__modes");
    if (visible(modes)) return { anchor: modes.parentElement };

    const marketTab = [...page.querySelectorAll("button")].find(button =>
      visible(button) && button.textContent.trim() === "フリマ" &&
      [...button.parentElement.children].some(tab => tab.matches("button") && tab.textContent.trim() === "スキル"));
    if (marketTab) return { anchor: marketTab.parentElement.parentElement };

    const title = [...page.querySelectorAll("h1, h2")].find(element =>
      visible(element) && ["フリーマーケット", "フリマ"].includes(element.textContent.trim()));
    if (title) return { anchor: title };
  }

  function start(node, enabled, requestScan) {
    const targets = new Map();
    const active = new Set();
    const prices = new Map();
    const records = new Map();
    let loaded = false;
    let market, launcher, dialog, status;

    function load() {
      records.clear();
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (!key?.startsWith(prefix)) continue;
          const record = JSON.parse(localStorage.getItem(key));
          if (typeof record?.name === "string" && Array.isArray(record.points)) records.set(key.slice(prefix.length), record);
        }
      } catch { /* Existing records remain available when one entry cannot be read. */ }
      loaded = true;
    }

    function save(key, record) {
      if (record) records.set(key, record);
      else records.delete(key);
      try {
        if (record) localStorage.setItem(prefix + key, JSON.stringify(record));
        else localStorage.removeItem(prefix + key);
      } catch {
        status = "ブラウザに保存できませんでした。このタブでのみ表示されます。";
      }
    }

    function writePrice(key, point) {
      const record = records.get(key);
      const { price, at } = point ?? {};
      if (!record || !Number.isSafeInteger(price) || price <= 0 || !Number.isFinite(at) || at < (record.checked ?? 0)) return false;
      const last = record.points.at(-1);
      if (last?.price === price && at === record.checked) return false;
      const points = last?.price === price ? record.points : [...record.points.slice(-89), { at, price }];
      save(key, { ...record, points, checked: at });
      return true;
    }

    function refreshButtons() {
      for (const { button, key, name } of targets.values()) {
        const text = records.has(key) ? "最安値の推移を見る" : "最安値を追跡";
        if (button.textContent !== text) button.textContent = text;
        button.setAttribute("aria-label", `${name}の${text}`);
      }
    }

    function open(focus) {
      if (!dialog?.open) {
        dialog = node("dialog", "market-watch-dialog");
        dialog.setAttribute("aria-label", names.marketWatch);
        document.body.append(dialog);
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        dialog.showModal();
      }
      render(focus);
    }

    function render(focus) {
      if (!dialog?.open) return;
      const expanded = new Set([...dialog.querySelectorAll("details[open]")].map(el => el.dataset.watchKey));
      if (focus) expanded.add(focus);
      const header = node("header", "extra-header");
      const close = node("button", "extra-button", "閉じる");
      close.type = "button";
      close.addEventListener("click", () => dialog.close());
      header.append(node("h2", "extra-heading", names.marketWatch), close);
      const intro = node("p", "market-watch-note", status || "通常アイテムはフリマの表示時、永久スキルは個別の最安値が確認できたときに記録します。");
      const list = node("div", "market-watch-list");
      dialog.replaceChildren(header, intro, list);
      if (!records.size) {
        list.append(node("p", "market-watch-note", "商品を選び、「最安値を追跡」を押すと記録が始まります。"));
        return;
      }
      const sorted = [...records].sort(([a, left], [b, right]) =>
        Number(b === focus) - Number(a === focus) || (right.checked ?? 0) - (left.checked ?? 0));
      for (const [key, record] of sorted) {
        const row = node("details", "market-watch-row");
        row.dataset.watchKey = key;
        row.open = expanded.has(key);
        const latest = record.points.at(-1);
        const previous = record.points.at(-2);
        const heading = node("summary", "market-watch-summary");
        const caption = node("span", "market-watch-caption");
        caption.append(node("span", "market-watch-name", record.name), node("strong", "market-watch-price", latest ? priceText(latest.price) : "未観測"));
        if (latest && previous) {
          const delta = latest.price - previous.price;
          const trend = node("span", "market-watch-delta", `${delta > 0 ? "↑ +" : "↓ −"}${priceText(Math.abs(delta))}`);
          trend.dataset.direction = delta > 0 ? "up" : "down";
          caption.append(trend);
        }
        heading.append(caption);
        if (!key.startsWith("skill:")) {
          const go = node("a", "extra-button", "商品を開く");
          go.href = `/market?${new URLSearchParams({ item: key.slice(5) })}`;
          go.setAttribute("aria-label", `${record.name}の商品を開く`);
          go.addEventListener("click", event => event.stopPropagation());
          heading.append(go);
        }
        row.append(heading);
        const body = node("div", "market-watch-detail");
        const fill = () => {
          if (!row.open || body.childElementCount) return;
          if (record.checked) body.append(node("p", "market-watch-note", `最終確認 ${date.format(record.checked)} JST`));
          body.append(priceChart(node, record));
          if (record.points.length) {
            const history = node("ul", "market-watch-points");
            for (const point of record.points.slice().reverse()) {
              history.append(node("li", "market-watch-point", `${date.format(point.at)} JST　${priceText(point.price)}`));
            }
            body.append(history);
          }
          if (key.startsWith("skill:")) {
            const check = node("button", "extra-button", "価格を確認");
            check.type = "button";
            check.addEventListener("click", event => {
              if (!event.isTrusted) return;
              const refresh = market?.querySelector(`[data-ha4-market-price-refresh="${CSS.escape(key)}"]`);
              const entry = market?.querySelector(`[data-ha4-market-skill-row="${CSS.escape(key.slice(6))}"]`);
              const button = [refresh, entry].find(control => control?.getClientRects().length && !control.disabled);
              if (button) {
                dialog.close();
                button.click();
              } else {
                status = `永久スキルの「買う」で「${record.name}」を検索して選択してください。出品が複数ページある場合は「価格が安い順」で確認できます。`;
                render(key);
              }
            });
            body.append(check);
          }
          const remove = node("button", "extra-button", "追跡を解除して履歴を削除");
          remove.type = "button";
          remove.addEventListener("click", () => {
            save(key, null);
            refreshButtons();
            render();
            requestScan();
          });
          body.append(remove);
        };
        row.append(body);
        row.addEventListener("toggle", fill);
        fill();
        list.append(row);
      }
    }

    document.addEventListener("hako-af:market-watch-target", event => {
      if (!enabled("marketWatch") || !(event.target instanceof Element)) return;
      let target;
      try { target = JSON.parse(event.detail); } catch { return; }
      const { key, name } = target;
      if (typeof key !== "string" || typeof name !== "string") return;
      const anchor = event.target;
      active.add(anchor);
      if (targets.get(anchor)?.key === key) {
        const button = targets.get(anchor).button;
        if (button.parentElement !== anchor) anchor.append(button);
        return;
      }
      targets.get(anchor)?.button.remove();
      const button = node("button", "market-watch-button");
      button.type = "button";
      button.addEventListener("click", () => {
        if (!records.has(key)) {
          if (records.size >= 100) {
            status = "追跡できる商品は100件までです。不要な追跡を解除してください。";
          } else {
            status = "";
            save(key, { name, points: [] });
            writePrice(key, prices.get(key));
          }
          requestScan();
          refreshButtons();
        }
        open(key);
      });
      anchor.append(button);
      targets.set(anchor, { button, key, name });
      refreshButtons();
    });

    function placeLauncher() {
      const position = findLauncherPosition(market);
      if (!position) {
        launcher?.remove();
        return;
      }
      if (!launcher) {
        launcher = node("button", "market-watch-button", "最安値の推移");
        launcher.type = "button";
        launcher.addEventListener("click", () => open());
      }
      const { anchor, inline } = position;
      const placement = inline ? "heading" : "below";
      if (launcher.dataset.ha4MarketLauncher !== placement) launcher.dataset.ha4MarketLauncher = placement;
      if (inline) {
        if (launcher.parentElement !== anchor) anchor.append(launcher);
      } else if (anchor.nextElementSibling !== launcher) {
        anchor.after(launcher);
      }
    }

    document.addEventListener("hako-af:market-watch-prices", event => {
      if (!enabled("marketWatch") || !(event.target instanceof Element)) return;
      let samples;
      try { samples = JSON.parse(event.detail); } catch { return; }
      if (!Array.isArray(samples)) return;
      market = event.target;
      placeLauncher();
      prices.clear();
      let changed = false;
      for (const [key, point] of samples) {
        prices.set(key, point);
        if (writePrice(key, point)) changed = true;
      }
      if (changed) render();
    });

    window.addEventListener("storage", event => {
      if (event.key === null || event.key.startsWith(prefix)) {
        loaded = false;
        requestScan();
      }
    });

    return {
      beforeRead() {
        market = null;
        active.clear();
        if (!enabled("marketWatch") || !/^\/(?:f\/)?market\/?$/.test(location.pathname)) return;
        if (!loaded) {
          load();
          refreshButtons();
          render();
        }
        document.dispatchEvent(new CustomEvent("hako-af:market-watch-keys", { detail: JSON.stringify([...records.keys()]) }));
      },
      afterRead() {
        for (const [anchor, { button }] of targets) {
          if (active.has(anchor)) continue;
          button.remove();
          targets.delete(anchor);
        }
        if (!market) {
          launcher?.remove();
          dialog?.close();
        }
      }
    };
  }

  globalThis.hakoAfMarketWatch = { start };
})();
