(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const prefix = "hakoAf4000:price-watch:";
  const format = new Intl.NumberFormat("ja-JP");
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
  const priceText = price => `${format.format(price)} G`;

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
        heading.append(node("span", "market-watch-name", record.name), node("strong", "market-watch-price", latest ? priceText(latest.price) : "未観測"));
        if (latest && previous) {
          const delta = latest.price - previous.price;
          const trend = node("span", "market-watch-delta", `${delta > 0 ? "↑ +" : "↓ −"}${priceText(Math.abs(delta))}`);
          trend.dataset.direction = delta > 0 ? "up" : "down";
          heading.append(trend);
        }
        row.append(heading);
        const body = node("div", "market-watch-detail");
        const fill = () => {
          if (!row.open || body.childElementCount) return;
          if (record.checked) body.append(node("p", "market-watch-note", `最終確認 ${date.format(record.checked)} JST`));
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
          } else {
            const go = node("a", "extra-button", "商品を開く");
            go.href = `/market?${new URLSearchParams({ item: key.slice(5) })}`;
            body.append(go);
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
      if (targets.get(anchor)?.key === key) return;
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

    document.addEventListener("hako-af:market-watch-prices", event => {
      if (!enabled("marketWatch") || !(event.target instanceof Element)) return;
      let samples;
      try { samples = JSON.parse(event.detail); } catch { return; }
      if (!Array.isArray(samples)) return;
      market = event.target;
      if (launcher?.parentElement !== market) {
        launcher?.remove();
        launcher = node("button", "market-watch-button", "最安値の推移");
        launcher.type = "button";
        launcher.addEventListener("click", () => open());
        market.prepend(launcher);
      }
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
