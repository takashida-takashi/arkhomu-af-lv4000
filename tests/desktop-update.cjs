const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { webcrypto, createHash } = require("node:crypto");
const extension = path.join(__dirname, "../extension");
const sender = { frameId: 0, origin: "https://arkhomu.com", url: "https://arkhomu.com/", tab: { id: 1 }, documentId: "document" };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function workerFixture(writeStalls = false) {
  const archive = Buffer.from("fixture");
  const stored = { hakoAfDesktopUpdateArchive: { version: "3.3.0", url: "data:application/zip;base64," + archive.toString("base64"),
    sha256: createHash("sha256").update(archive).digest("hex") } };
  const events = [], warnings = [];
  let listener, diskVersion = "3.2.28", folderReads = 0, unblock;
  const folder = { queryPermission: async () => "granted" };
  const storage = { get: async key => ({ [key]: stored[key] }), set: async values => Object.assign(stored, values), remove: async key => { delete stored[key]; } };
  const chrome = {
    runtime: { id: "fixture", getManifest: () => ({ version: "3.2.28" }), getURL: p => "chrome-extension://fixture/" + p,
      reload: () => events.push("reload"), onMessage: { addListener: fn => { listener = fn; } },
      onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    management: { getSelf: async () => ({ installType: "development" }) },
    storage: { local: storage, session: storage },
    downloads: { download: async () => { events.push("download"); return 1; }, search: async () => [],
      onChanged: { addListener() {} }, onErased: { addListener() {} } },
    tabs: { sendMessage: async (_id, message) => { events.push(message); } }
  };
  const context = vm.createContext({ chrome, crypto: webcrypto, DOMException, AbortController,
    console: { warn: (...args) => warnings.push(args) }, clearTimeout,
    setTimeout: (callback, ms) => setTimeout(callback, ms >= 15000 ? 80 : ms),
    fetch: async url => url.startsWith("data:") ? new Response(archive) : new Response(JSON.stringify({ version: diskVersion })),
    arkHomuUpdateFiles: {
      readFolder: () => { folderReads++; return writeStalls ? Promise.resolve(folder) : new Promise(resolve => { unblock = resolve; }); },
      readManifest: async () => ({ version: "3.2.28" }), matchesExtension: () => true,
      install: async (_folder, _archive, _version, report) => { report("write", { file: "fixture.js", index: 1, total: 2 }); await new Promise(() => {}); }
    }, importScripts() {} });
  vm.runInContext(fs.readFileSync(path.join(extension, "update-check.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(extension, "local-reload-worker.js"), "utf8"), context);
  const send = message => new Promise(resolve => listener(message, sender, resolve));
  return { send, events, warnings, setDiskVersion: v => { diskVersion = v; }, folderReads: () => folderReads,
    unblock: () => unblock?.(null) };
}

(async () => {
  const f = workerFixture();
  const pending = f.send({ type: "hako-af:apply-update", version: "3.3.0", token: webcrypto.randomUUID() });
  await delay(5);
  assert.equal(f.folderReads(), 1);
  assert.equal(await Promise.race([f.send({ type: "hako-af:download-update", version: "3.3.0" }), delay(25).then(() => "blocked")]), true,
    "A stalled folder operation must not block manual ZIP saving");
  f.setDiskVersion("3.3.0");
  await f.send({ type: "hako-af:check-local-update" });
  assert.ok(f.events.includes("reload"), "Manual file replacement is detected without waiting for the stalled update/ZIP queues");
  const queued = f.send({ type: "hako-af:apply-update", version: "3.3.0" });
  const failure = await pending;
  assert.equal(failure.applied, false, "A hung apply request replies with failure instead of waiting forever");
  assert.equal(failure.failed, true);
  assert.equal(failure.stage, "folder");
  assert.equal(await queued, false);
  assert.ok(f.warnings.some(args => args[1]?.stage === "folder"), "Timeout diagnostics identify the stalled step");
  f.unblock(); await delay(5);
  assert.equal(f.folderReads(), 1, "Timed-out queued attempts never start a late installation");

  const w = workerFixture(true);
  const write = w.send({ type: "hako-af:apply-update", version: "3.3.0", token: webcrypto.randomUUID() });
  await delay(10);
  w.setDiskVersion("3.3.0");
  await w.send({ type: "hako-af:check-local-update" });
  assert.ok(!w.events.includes("reload"), "Do not reload partway through our own write/rollback transaction");
  assert.equal(await w.send({ type: "hako-af:download-update", version: "3.3.0" }), true);
  assert.equal((await write).stage, "write");
  assert.ok(w.warnings.some(args => args[1]?.stage === "write" && args[1]?.file === "fixture.js"));
  console.log("Desktop update: stalled folder/write requests are bounded, ZIP saving and manual replacement remain independent, late installs are cancelled and writes stay serialized.");
})().catch(error => { console.error(error); process.exitCode = 1; });
