"use strict";

const arkHomuUpdateFiles = (() => {
  const folderKey = "extension-folder";
  const archiveRoot = "arkhomu-af-lv4000/";
  const maxFileBytes = 2_000_000;

  function folderStore(mode, run) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open("hako-af-pc-update", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("settings");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction("settings", mode);
          const request = run(tx.objectStore("settings"));
          tx.oncomplete = () => { db.close(); resolve(request.result); };
          tx.onabort = () => { db.close(); reject(tx.error); };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  const readFolder = () => folderStore("readonly", store => store.get(folderKey));
  const saveFolder = handle => folderStore("readwrite", store => handle ? store.put(handle, folderKey) : store.delete(folderKey));

  async function readManifest(folder) {
    const file = await (await folder.getFileHandle("manifest.json")).getFile();
    if (file.size > 100_000) throw new Error("Invalid extension manifest");
    return JSON.parse(await file.text());
  }

  function matchesExtension(manifest) {
    const current = chrome.runtime.getManifest();
    return manifest?.name === current.name && manifest.manifest_version === current.manifest_version;
  }

  async function inflate(bytes, size) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const result = new Uint8Array(size);
    let position = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (position + value.length > size) throw new Error("ZIP entry exceeds its size");
        result.set(value, position);
        position += value.length;
      }
      if (position !== size) throw new Error("Truncated ZIP entry");
      return result;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async function extractFiles(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const u16 = offset => view.getUint16(offset, true);
    const u32 = offset => view.getUint32(offset, true);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const minEnd = Math.max(0, buffer.byteLength - 22 - 65535);
    let end = buffer.byteLength - 22;
    while (end >= minEnd && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== buffer.byteLength)) end--;
    if (end < minEnd || u32(end + 4) !== 0 || u16(end + 8) !== u16(end + 10)) throw new Error("Invalid ZIP directory");
    const count = u16(end + 10);
    const start = u32(end + 16);
    if (count > 250 || start + u32(end + 12) !== end) throw new Error("Unsupported ZIP directory");

    const files = new Map();
    const names = new Set();
    let position = start;
    let total = 0;
    for (let index = 0; index < count; index++) {
      if (position + 46 > end || u32(position) !== 0x02014b50) throw new Error("Invalid ZIP entry");
      const flags = u16(position + 8);
      const method = u16(position + 10);
      const compressed = u32(position + 20);
      const size = u32(position + 24);
      const filenameEnd = position + 46 + u16(position + 28);
      const offset = u32(position + 42);
      const next = filenameEnd + u16(position + 30) + u16(position + 32);
      if (next > end) throw new Error("Truncated ZIP entry");
      const filename = decoder.decode(bytes.subarray(position + 46, filenameEnd));
      position = next;
      if (filename === archiveRoot && size === 0) continue;
      const name = filename.slice(archiveRoot.length);
      if (!filename.startsWith(archiveRoot) || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.(?:js|json|css|html|md|png|svg|webp|ico|woff2)$/.test(name) ||
          names.has(name.toLowerCase()) || offset + 30 > start || u32(offset) !== 0x04034b50 || (flags & 1) ||
          (method !== 0 && method !== 8) || size > maxFileBytes || (total += size) > maxFileBytes) throw new Error("Unsupported update ZIP entry");
      const data = offset + 30 + u16(offset + 26) + u16(offset + 28);
      if (data + compressed > start || (method === 0 && compressed !== size)) throw new Error("Invalid ZIP entry size");
      const entry = bytes.subarray(data, data + compressed);
      files.set(name, method === 0 ? entry : await inflate(entry, size));
      names.add(name.toLowerCase());
    }
    if (position !== end || !files.has("manifest.json")) throw new Error("Missing update manifest");
    return files;
  }

  async function write(handle, contents) {
    const stream = await handle.createWritable();
    try {
      await stream.write(contents);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
  }

  async function isLoadedFolder(folder) {
    const probe = `hako-af-update-${crypto.randomUUID()}.txt`;
    const handle = await folder.getFileHandle(probe, { create: true });
    try {
      await write(handle, probe);
      const response = await fetch(chrome.runtime.getURL(probe), { cache: "no-store" });
      return response.ok && await response.text() === probe;
    } finally {
      await folder.removeEntry(probe);
    }
  }

  async function install(folder, buffer, version, report = () => {}) {
    report("extract");
    const files = await extractFiles(buffer);
    const manifestFile = files.get("manifest.json");
    const manifest = JSON.parse(new TextDecoder().decode(manifestFile));
    if (!matchesExtension(manifest) || manifest.version !== version) throw new Error("Invalid update manifest");
    const needed = [manifest.background?.service_worker, manifest.options_ui?.page,
      ...manifest.content_scripts.flatMap(script => [...(script.js ?? []), ...(script.css ?? [])])];
    if (needed.some(name => name && !files.has(name))) throw new Error("Missing extension files");

    // The version used by the existing reload check changes after all scripts have been written.
    files.delete("manifest.json");
    files.set("manifest.json", manifestFile);
    const originals = [];
    try {
      for (const [name, contents] of files) {
        report("write", { file: name, index: originals.length + 1, total: files.size });
        const existing = await folder.getFileHandle(name).catch(error => {
          if (error.name !== "NotFoundError") throw error;
          return null;
        });
        const original = existing && await (await existing.getFile()).arrayBuffer();
        const handle = existing ?? await folder.getFileHandle(name, { create: true });
        if (!existing) originals.push({ name, handle, original });
        await write(handle, contents);
        if (existing) originals.push({ name, handle, original });
      }
    } catch (error) {
      report("rollback");
      const rollback = await Promise.allSettled(originals.reverse().map(({ name, handle, original }) =>
        original ? write(handle, original) : folder.removeEntry(name)));
      if (rollback.some(result => result.status === "rejected")) console.warn("はこホム拡張の更新から一部のファイルを復元できませんでした。");
      throw error;
    }
  }

  return { readFolder, saveFolder, readManifest, matchesExtension, isLoadedFolder, install };
})();
