(() => {
  "use strict";

  const names = globalThis.hakoAfFeatureNames;
  const prefix = "#ha4-party=";
  const legacyLinkLimit = 1800;
  const linkLimit = 32 * 1024;
  const fileLimit = 128 * 1024;
  const numbers = new Intl.NumberFormat("ja-JP");
  const signedNumbers = new Intl.NumberFormat("ja-JP", { signDisplay: "exceptZero" });
  const generations = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const statLabels = [
    ["hp", "体力"], ["atk", "物攻"], ["mtk", "魔攻"], ["def", "物防"], ["mdf", "魔防"], ["spd", "速度"],
    ["lck", "運"], ["cri", "会心率", "%"], ["cdmg", "会心威力", "%"]
  ];

  function text(value, limit) {
    if (typeof value !== "string" || value.length > limit) throw new Error("Invalid text");
    return value.trim();
  }

  function validated(data) {
    if (data?.version !== 1 || !Array.isArray(data.slots) || data.slots.length !== 6 || !data.slots.some(Boolean)) {
      throw new Error("Invalid party");
    }
    const skills = entries => {
      if (!Array.isArray(entries) || entries.length > 160) throw new Error("Invalid skills");
      return entries.map(entry => ({ name: text(entry?.name, 140), permanent: entry.permanent === true }));
    };
    const individual = data.individual === true && data.slots.filter(Boolean).length === 1;
    return {
      version: 1,
      ...(individual ? { individual: true } : {}),
      name: text(data.name, 100) || "共有された編成",
      slots: data.slots.map(member => {
        if (member === null) return null;
        const portrait = text(member?.portrait ?? "", 120).replace(/\.png$/i, "");
        const generation = Number.isFinite(member.generation) && member.generation >= 0 ? member.generation : undefined;
        const bonus = member.bonus && typeof member.bonus === "object" && !Array.isArray(member.bonus)
          ? Object.fromEntries(statLabels.flatMap(([key]) => Number.isSafeInteger(member.bonus[key]) ? [[key, member.bonus[key]]] : []))
          : undefined;
        return {
          name: text(member?.name, 120),
          level: Number.isSafeInteger(member.level) && member.level > 0 ? member.level : 0,
          generation,
          bonus,
          portrait: /^[\w-]+$/.test(portrait) ? portrait : "",
          attack: text(member.attack ?? "", 140),
          active: skills(member.active),
          passive: skills(member.passive)
        };
      })
    };
  }

  function encode(bytes) {
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function compactParty(data) {
    const skills = entries => entries.map(({ name, permanent }) => permanent ? [name] : name);
    const slots = data.slots.map(member => member && [member.name, member.level, member.generation ?? null,
      member.bonus ? statLabels.map(([key]) => member.bonus[key] ?? null) : null, member.portrait, member.attack,
      skills(member.active), skills(member.passive)]);
    return [2, data.name, data.individual === true, slots];
  }

  function expandLink(data) {
    if (!Array.isArray(data)) return data;
    const [version, name, individual, slots] = data;
    if (version !== 2 || !Array.isArray(slots) || slots.length !== 6) throw new Error("Invalid compact party");
    const skills = entries => {
      if (!Array.isArray(entries) || entries.length > 160) throw new Error("Invalid compact skills");
      return entries.map(entry => Array.isArray(entry) && entry.length === 1
        ? { name: entry[0], permanent: true } : { name: entry, permanent: false });
    };
    return { version: 1, name, individual, slots: slots.map(member => {
      if (member === null) return null;
      if (!Array.isArray(member) || member.length !== 8) throw new Error("Invalid compact member");
      const [name, level, generation, values, portrait, attack, active, passive] = member;
      const bonus = Array.isArray(values) ? Object.fromEntries(statLabels.map(([key], index) => [key, values[index]])) : undefined;
      return { name, level, generation, bonus, portrait, attack, active: skills(active), passive: skills(passive) };
    }) };
  }

  async function compressedParty(data) {
    const blob = new Blob([JSON.stringify(data)]);
    if (blob.size > fileLimit) return null;
    const compressed = blob.stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(compressed).arrayBuffer());
  }

  async function shareLink(data) {
    const base = location.origin + "/" + prefix;
    const urlLength = bytes => bytes ? base.length + Math.ceil(bytes.length * 4 / 3) : Infinity;
    const original = await compressedParty(data);
    if (urlLength(original) <= legacyLinkLimit) return base + encode(original);
    // Keep short links usable by older versions. Longer links can use either representation.
    const compact = await compressedParty(compactParty(data));
    const bytes = urlLength(compact) < urlLength(original) ? compact : original;
    return urlLength(bytes) <= linkLimit ? base + encode(bytes) : null;
  }

  async function readLink(hash) {
    const encoded = hash.slice(prefix.length);
    if (!/^[\w-]+$/.test(encoded) || encoded.length > linkLimit) throw new Error("Invalid share link");
    const bytes = Uint8Array.from(atob(encoded.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    const buffer = new Uint8Array(fileLimit);
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (size + value.length > buffer.length) throw new Error("Party data too large");
        buffer.set(value, size);
        size += value.length;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return validated(expandLink(JSON.parse(new TextDecoder().decode(buffer.subarray(0, size)))));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function saveParty(data) {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), data.individual ? "はこホム-個体.json" : "はこホム-編成.json");
  }

  function memberMetadata(member) {
    return [member.level ? "Lv" + numbers.format(member.level) : "",
      member.generation == null ? "" : "世代 " + generations.format(member.generation)].filter(Boolean).join("  ·  ");
  }

  function bonusLabels(bonus) {
    return bonus == null ? [] : statLabels.flatMap(([key, label, unit = ""]) =>
      bonus[key] ? [label + " " + signedNumbers.format(bonus[key]) + unit] : []);
  }

  const rows = data => data.individual ? [["", data.slots.filter(Boolean)]] :
    [["前衛", data.slots.slice(0, 3)], ["後衛", data.slots.slice(3, 6)]];
  const skillGroups = member => [["アクティブ", member.active], ["パッシブ", member.passive]];

  function imageText(ctx, width) {
    const lines = [];
    let height = 0;
    function write(value, { size = 15, color = "#f0e9f5", bold = false, inset = 0, gap = 0 } = {}) {
      if (!value) return;
      const font = `${bold ? 700 : 400} ${size}px system-ui, sans-serif`;
      ctx.font = font;
      height += gap;
      const grouped = Array.isArray(value);
      const separator = grouped ? "　" : "";
      let part = "";
      function line() {
        lines.push({ text: part.trim(), x: inset, y: height, font, color });
        height += Math.ceil(size * 1.38);
      }
      for (const item of value) {
        const next = part ? part + separator + item : item;
        if (part && ctx.measureText(next).width > width - inset) {
          line();
          part = item;
        } else part = next;
      }
      if (part) line();
    }
    function draw(x, y) {
      for (const line of lines) {
        ctx.font = line.font;
        ctx.fillStyle = line.color;
        ctx.fillText(line.text, x + line.x, y + line.y);
      }
    }
    return { write, draw, get height() { return height; } };
  }

  function imageCard(ctx, width, member, portraits) {
    const text = imageText(ctx, width);
    if (!member) {
      text.write("空き枠", { color: "#b8a6c9" });
      return { text };
    }
    const portrait = portraits.get(member.portrait);
    const inset = portrait ? 57 : 0;
    text.write(member.name, { size: 19, bold: true, inset });
    text.write(memberMetadata(member), { size: 14, color: "#dbcbea", inset });
    if (member.bonus != null) {
      text.write("ボーナスパラメータ", { size: 14, bold: true, color: "#dab7f2", gap: 9 });
      const labels = bonusLabels(member.bonus);
      text.write(labels.length ? labels : "0");
    }
    if (member.attack) text.write("通常攻撃　" + member.attack, { size: 14, gap: 7 });
    for (const [kind, skills] of skillGroups(member)) {
      if (!skills.length) continue;
      text.write(kind, { size: 14, bold: true, color: "#dab7f2", gap: 8 });
      for (const skill of skills) {
        text.write(skill.name + (skill.permanent ? "　［永久］" : ""), { color: skill.permanent ? "#ffc8ec" : "#f0e9f5" });
      }
    }
    return { text, portrait };
  }

  function partyCanvas(data, portraits) {
    const width = data.individual ? 440 : 1080, margin = 24, gap = 12, padding = 13;
    const cardWidth = data.individual ? width - 2 * margin : (width - 2 * margin - 2 * gap) / 3;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const title = imageText(ctx, width - 2 * margin);
    if (!data.individual) title.write(data.name, { size: 30, bold: true });
    const sections = rows(data).map(([name, members]) => {
      const cards = members.map(member => imageCard(ctx, cardWidth - 2 * padding, member, portraits));
      const height = Math.max(26, ...cards.map(({ text, portrait }) => Math.max(text.height, portrait ? 42 : 0))) + 2 * padding;
      return { name, cards, height };
    });
    const height = 2 * margin + title.height + sections.reduce((sum, section) =>
      sum + section.height + (section.name ? 43 : 0), 0);
    const scale = Math.min(1.5, 8192 / height, Math.sqrt(12000000 / (width * height)));
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#17121f";
    ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
    ctx.textBaseline = "top";
    title.draw(margin, margin);
    let y = margin + title.height + (data.individual ? 0 : 16);
    for (const section of sections) {
      if (section.name) {
        ctx.font = "700 18px system-ui, sans-serif";
        ctx.fillStyle = "#e2c4f3";
        ctx.fillText(section.name, margin, y);
        y += 27;
      }
      section.cards.forEach(({ text, portrait }, index) => {
        const x = margin + index * (cardWidth + gap);
        ctx.fillStyle = "#231b2e";
        ctx.strokeStyle = "#544468";
        ctx.beginPath();
        ctx.roundRect(x, y, cardWidth, section.height, 8);
        ctx.fill();
        ctx.stroke();
        if (portrait) ctx.drawImage(portrait, x + padding, y + padding, 42, 42);
        text.draw(x + padding, y + padding);
      });
      y += section.height + 16;
    }
    return canvas;
  }

  async function savePartyImage(data, body) {
    const portraits = new Map([...body.querySelectorAll('[data-ha4="party-portrait"]')]
      .filter(image => image.complete && image.naturalWidth > 0)
      .map(image => [image.dataset.portrait, image]));
    const png = canvas => new Promise((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png"));
    let blob;
    try {
      blob = await png(partyCanvas(data, portraits));
    } catch (error) {
      if (!portraits.size || error.name !== "SecurityError") throw error;
      blob = await png(partyCanvas(data, new Map()));
    }
    downloadBlob(blob, data.individual ? "はこホム-個体.png" : "はこホム-編成.png");
  }

  function start(node, enabled, openTrainingTarget) {
    let dialog;
    let lastHash;
    const detailLaunchers = new Map();
    const detailActions = "[data-ha4-share-member],[data-ha4-party-hall-actions]";
    const makeButton = label => {
      const button = node("button", "extra-button", label);
      button.type = "button";
      return button;
    };
    const launcher = makeButton(names.partyShare);
    launcher.setAttribute("aria-haspopup", "dialog");

    function partyCards(data) {
      const overview = node("div", "party-overview");
      let slot = 0;
      for (const [label, members] of rows(data)) {
        const section = node("section", "party-rank");
        const grid = node("div", data.individual ? "party-individual" : "party-grid");
        for (const member of members) {
          const position = ++slot;
          const card = node("article", "party-card");
          if (!member) {
            card.append(node("p", "party-empty", "空き枠"));
            grid.append(card);
            continue;
          }
          const identity = node("header", "party-identity");
          if (member.portrait) {
            const image = node("img", "party-portrait");
            image.src = "/images/monsters/" + member.portrait + ".png";
            image.dataset.portrait = member.portrait;
            image.alt = "";
            image.width = image.height = 36;
            image.addEventListener("error", () => image.remove(), { once: true });
            identity.append(image);
          }
          const title = node("div", "party-name");
          title.append(node("h4", "party-monster", member.name));
          const metadata = memberMetadata(member);
          if (metadata) title.append(node("span", "party-level", metadata));
          identity.append(title);
          card.append(identity);
          if (member.bonus != null) {
            const labels = bonusLabels(member.bonus);
            const bonus = node("p", "party-bonus");
            for (const label of labels.length ? labels : ["0"]) bonus.append(node("span", "party-bonus-value", label));
            card.append(node("h5", "party-skill-heading", "ボーナスパラメータ"), bonus);
          }
          if (member.attack) card.append(node("p", "party-attack", "通常攻撃　" + member.attack));
          for (const [kind, entries] of skillGroups(member)) {
            if (!entries.length) continue;
            const list = node("ul", "party-skills");
            for (const skill of entries) {
              const item = node("li", "party-skill");
              item.append(node("span", "party-skill-name", skill.name));
              if (skill.permanent) item.append(node("span", "party-permanent", "永久"));
              list.append(item);
            }
            card.append(node("h5", "party-skill-heading", kind), list);
          }
          const actions = node("div", "party-member-actions");
          if (openTrainingTarget) {
            const train = makeButton(`${names.trainingRoutes}に取り込む`);
            train.addEventListener("click", () => openTrainingTarget(member, data.individual ? null : position, data.name));
            actions.append(train);
          }
          if (!data.individual) {
            const share = makeButton("この個体を共有");
            share.addEventListener("click", () => {
              void showParty(openDialog(), { version: 1, individual: true, name: member.name.slice(0, 100),
                slots: [member, null, null, null, null, null] });
            });
            actions.append(share);
          }
          if (actions.children.length) card.append(actions);
          grid.append(card);
        }
        if (label) section.append(node("h3", "party-rank-heading", label));
        section.append(grid);
        overview.append(section);
      }
      return overview;
    }

    function openDialog() {
      dialog?.close();
      const root = dialog = node("dialog", "party-share");
      root.setAttribute("aria-label", names.partyShare);
      const heading = node("h2", "extra-heading", names.partyShare);
      const close = makeButton("閉じる");
      close.autofocus = true;
      close.addEventListener("click", () => root.close());
      const header = node("header", "extra-header");
      header.append(heading, close);
      const controls = node("div", "party-actions");
      const status = node("p", "party-status");
      status.setAttribute("role", "status");
      const body = node("div", "party-body");
      root.append(header, controls, status, body);
      root.addEventListener("close", () => {
        root.remove();
        if (dialog === root) dialog = null;
      }, { once: true });
      document.body.append(root);
      root.showModal();
      return { root, heading, controls, status, body };
    }

    async function showParty(ui, input) {
      const data = validated(input);
      if (!ui.root.open) return;
      ui.heading.textContent = data.name;
      ui.body.replaceChildren(partyCards(data));
      ui.status.textContent = "";
      const image = makeButton("画像を保存");
      image.addEventListener("click", async () => {
        image.disabled = true;
        try {
          await savePartyImage(data, ui.body);
          ui.status.textContent = data.individual ? "個体画像を保存しました。" : "編成画像を保存しました。";
        } catch {
          ui.status.textContent = "編成画像を保存できませんでした。";
        } finally {
          image.disabled = false;
        }
      });
      const download = makeButton(data.individual ? "個体ファイルを保存" : "編成ファイルを保存");
      download.addEventListener("click", () => saveParty(data));
      ui.controls.replaceChildren(image, download);
      let url;
      try { url = await shareLink(data); } catch { /* File sharing works on browsers without compression streams. */ }
      if (!ui.root.open) return;
      if (!url) {
        if (!ui.status.textContent) ui.status.textContent = data.individual ?
          "この個体はファイルで共有できます。" : "この編成はファイルで共有できます。";
        return;
      }
      const copy = makeButton("共有リンクをコピー");
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(url);
          ui.status.textContent = url.length > legacyLinkLimit
            ? `共有リンクをコピーしました（${numbers.format(url.length)}文字）。` : "共有リンクをコピーしました。";
        } catch {
          const field = node("input", "party-link");
          field.readOnly = true;
          field.value = url;
          field.setAttribute("aria-label", "共有リンク");
          ui.status.replaceChildren(field);
          field.select();
        }
      });
      ui.controls.prepend(copy);
    }

    function openFile() {
      const ui = openDialog();
      const label = node("label", "party-file", "共有された編成・個体ファイルを選ぶ");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      label.append(input);
      ui.controls.append(label);
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          if (file.size > fileLimit) throw new Error("File too large");
          await showParty(ui, JSON.parse(await file.text()));
        } catch {
          ui.status.textContent = "編成ファイルを開けませんでした。共有されたJSONファイルを選んでください。";
        }
      });
    }

    function openNative(panel, individual = false) {
      if (!panel) return;
      const ui = openDialog();
      ui.status.textContent = individual ? "個体とスキルを読み取っています…" : "編成とスキルを読み取っています…";
      const listener = event => {
        clearTimeout(timeout);
        try {
          const { type, value } = JSON.parse(event.detail);
          if (type === "snapshot") {
            void showParty(ui, value).catch(() => { ui.status.textContent = "編成を読み取れませんでした。"; });
          } else {
            ui.status.textContent = value;
          }
        } catch {
          ui.status.textContent = "編成を読み取れませんでした。";
        }
      };
      const timeout = setTimeout(() => {
        panel.removeEventListener("hako-af:party-share-data", listener);
        ui.status.textContent = "編成を読み取れませんでした。編成画面を開き直してください。";
      }, 12000);
      panel.addEventListener("hako-af:party-share-data", listener, { once: true });
      ui.root.addEventListener("close", () => {
        clearTimeout(timeout);
        panel.removeEventListener("hako-af:party-share-data", listener);
      }, { once: true });
      panel.dispatchEvent(new Event("hako-af:read-party-share", { bubbles: true }));
    }
    launcher.addEventListener("click", () => openNative(launcher.closest("[data-ha4-party-panel]")));

    async function readSharedLocation() {
      const hash = location.hash;
      if (!enabled() || !hash.startsWith(prefix) || lastHash === hash) return;
      lastHash = hash;
      const ui = openDialog();
      ui.status.textContent = "共有された編成を開いています…";
      try {
        await showParty(ui, await readLink(hash));
      } catch {
        ui.status.textContent = "共有リンクを開けませんでした。リンク全体を開くか、編成ファイルを受け取ってください。";
      }
    }
    window.addEventListener("hashchange", readSharedLocation);

    function scan() {
      for (const [anchor, button] of detailLaunchers) {
        if (enabled() && anchor.isConnected && anchor.matches(detailActions)) continue;
        button.remove();
        detailLaunchers.delete(anchor);
      }
      if (!enabled()) {
        launcher.remove();
        return;
      }
      const actions = [...document.querySelectorAll("[data-ha4-party-actions]")].find(el => el.getClientRects().length);
      if (actions) {
        if (launcher.parentElement !== actions) actions.append(launcher);
      } else launcher.remove();
      for (const anchor of document.querySelectorAll(detailActions)) {
        if (detailLaunchers.has(anchor) || !anchor.getClientRects().length) continue;
        const individual = anchor.hasAttribute("data-ha4-share-member");
        const button = makeButton(individual ? "この個体を共有" : "この編成を共有・育成に使う");
        button.setAttribute("aria-haspopup", "dialog");
        button.addEventListener("click", () => openNative(individual ? anchor : anchor.closest("[data-ha4-party-panel]"), individual));
        if (individual) anchor.append(button);
        else {
          button.classList.add("ha4-hall-share");
          anchor.prepend(button);
        }
        detailLaunchers.set(anchor, button);
      }
      void readSharedLocation();
    }

    return { scan, openFile };
  }

  globalThis.hakoAfPartyShare = { start };
})();
