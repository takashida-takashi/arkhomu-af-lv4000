(() => {
  "use strict";
  if (globalThis.hakoAfFrameContext?.active === false) return;
  const attribute = "data-ha4-guild-selected";
  const valid = row => row && typeof row.id === "string" && row.id.length > 0 && row.id.length <= 200 &&
    Number.isSafeInteger(row.revision) && row.revision >= 0;
  const record = row => ({ id: row.id, revision: row.revision, name: String(row.name ?? row.id).slice(0, 200),
    guild: typeof row.guild === "string" ? row.guild.slice(0, 200) : "" });
  function createStore(saved) {
    const hidden = new Map(), updated = new Map();
    function load(value = {}) {
      for (const [map, key] of [[hidden, "hiddenDungeons"], [updated, "updatedDungeons"]]) {
        map.clear();
        for (const row of Array.isArray(value[key]) ? value[key].slice(0, 1000) : []) if (valid(row)) map.set(row.id, record(row));
      }
    }
    load(saved);
    return { hidden, updated, load,
      has: row => hidden.has(row.id),
      hide(row) {
        if (!valid(row) || hidden.size >= 1000 && !hidden.has(row.id)) return false;
        hidden.set(row.id, record(row));updated.delete(row.id);return true;
      },
      restore: id => hidden.delete(id),
      observe(rows) {
        let changed = false;
        for (const row of rows) {
          const previous = hidden.get(row.id);
          if (previous && valid(row) && row.revision > previous.revision) {
            hidden.delete(row.id);updated.set(row.id, record(row));changed = true;
          }
        }
        return changed;
      },
      serialize: () => ({ hiddenDungeons: [...hidden.values()], updatedDungeons: [...updated.values()] })
    };
  }

  function controls(store, changed) {
    const buttons = new Map(), notices = new Map();
    let dialog, dialogSignature;
    const el = (tag, kind, text) => {
      const node = document.createElement(tag);if (kind) node.dataset.ha4 = kind;if (text) node.textContent = text;return node;
    };
    const button = (label, action) => {
      const node = el("button", "guild-hidden-action", label);node.type = "button";
      node.addEventListener("click", event => { event.preventDefault();event.stopPropagation();action(); });return node;
    };
    function management() {
      if (dialog?.open) return;
      dialog?.remove();dialog = el("dialog", "guild-hidden-manager");dialogSignature = undefined;dialog.setAttribute("aria-label", "非表示のギルダン");
      const head = el("header");head.append(el("h2", null, "非表示のギルダン"), button("閉じる", () => dialog.close()));
      dialog.append(head, el("p", null, "公開情報の更新を確認すると非表示を解除します。入場人数や本日の残り回数の変化では解除しません。"), el("div", "guild-hidden-entries"));
      const all = button("すべて再表示", () => { store.hidden.clear();changed(); });
      const current = dialog;
      dialog.append(all);dialog.addEventListener("close", () => { current.remove();if (dialog === current) dialog = null; });
      document.body.append(dialog);refreshDialog();dialog.showModal();
    }
    function refreshDialog() {
      if (!dialog) return;
      const signature = JSON.stringify([...store.hidden.values()]);
      if (signature === dialogSignature) return;
      dialogSignature = signature;
      const rows = [...store.hidden.values()].map(row => {
        const line = el("div", "guild-hidden-entry"), name = el("span", null, row.name);
        if (row.guild) name.append(el("small", null, row.guild));
        line.append(name, button("再表示", () => { store.restore(row.id);changed(); }));return line;
      });
      dialog.querySelector('[data-ha4="guild-hidden-entries"]').replaceChildren(...(rows.length ? rows : [el("p", null, "個別に非表示にしたギルダンはありません。") ]));
      dialog.lastElementChild.disabled = !rows.length;
    }
    function toolbar(parent) {
      let ui = notices.get(parent);
      if (!ui) {
        const manage = button("", management), notice = el("div", "guild-hidden-notice");
        notice.setAttribute("role", "status");const text = el("span");
        notice.append(text, button("確認した", () => { store.updated.clear();changed(); }));
        parent.append(manage, notice);ui = { manage, notice, text };notices.set(parent, ui);
      }
      const caption = `個別非表示（${store.hidden.size}件）`;
      if (ui.manage.textContent !== caption) ui.manage.textContent = caption;
      const restored = [...store.updated.values()];ui.notice.hidden = !restored.length;
      const text = restored.length ? "更新があったため非表示を解除しました：" + restored.slice(0, 3).map(row => row.name).join("、") +
        (restored.length > 3 ? ` ほか${restored.length - 3}件` : "") : "";
      if (ui.text.textContent !== text) ui.text.textContent = text;
      refreshDialog();
    }
    function note(parent, row) {
      let node = parent.querySelector('[data-ha4="guild-hidden-restored"]');
      if (!store.updated.has(row.id)) { node?.remove();return; }
      if (!node) { node = el("small", "guild-hidden-restored", "以前は非表示（更新のため解除）");parent.append(node); }
    }
    function scan(enabled) {
      const active = new Set();
      if (enabled) for (const native of document.querySelectorAll(`[${attribute}]`)) {
        if (!native.getClientRects().length) continue;
        let row;try { row = JSON.parse(native.getAttribute(attribute)); } catch { continue; }
        if (!row?.id) continue;
        active.add(native);
        let control = buttons.get(native);
        if (!control) {
          control = button("", () => {
            // Refresh the selected row before acting if the player has just changed selection.
            document.dispatchEvent(new Event("hako-af:read-list"));
            if (!native.isConnected || !native.hasAttribute(attribute)) return;
            let current;try { current = JSON.parse(native.getAttribute(attribute)); } catch { return; }
            if (!current?.id) return;
            if (store.has(current)) store.restore(current.id);
            else if (!store.hide(current)) return;
            changed();
          });control.dataset.ha4 = "guild-hide-selected";buttons.set(native, control);
        }
        if (native.nextElementSibling !== control) native.after(control);
        const hidden = store.has(row), text = hidden ? "このギルダンを再表示" : "このギルダンを非表示";
        if (control.textContent !== text) control.textContent = text;
        control.disabled = !hidden && (!valid(row) || store.hidden.size >= 1000);
        control.title = !valid(row) ? "公開情報の読み込みを待っています。" : "公開情報が更新されるまで、このダンジョンを一覧から隠します。";
      }
      for (const [native, control] of buttons) if (!active.has(native)) {
        control.remove();buttons.delete(native);
      }
      for (const [parent] of notices) if (!parent.isConnected) notices.delete(parent);
      if (!enabled) dialog?.close();
    }
    return { toolbar, scan, note };
  }
  globalThis.hakoAfGuildDungeonHidden = { createStore, controls };
})();
