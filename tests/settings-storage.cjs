const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname, "../scripts/arkhomu-af-settings-storage.js"), "utf8");
const checks = fs.readFileSync(path.join(__dirname, "../extension/update-check.js"), "utf8");
const prefix = "arkhomu-af-settings:data:", flag = "arkhomu-af-settings:enabled";
const wait = () => new Promise(resolve => setTimeout(resolve, 0));
const values = new Map([["arkhomu-af-release", "keep-update-code"]]);
const siteValues = new Map();
let failRead = false, failWrite = false;
const calls = [];
const manager = {
  async getValue(key, fallback) { calls.push(["get", key]);if (failRead) throw new Error("read unavailable");return values.get(key) ?? fallback; },
  async setValue(key, value) { calls.push(["set", key]);if (failWrite) throw new Error("write unavailable");values.set(key, value); },
  async listValues() { calls.push(["list"]);return [...values.keys()]; },
  async deleteValue(key) { calls.push(["delete", key]);values.delete(key); }
};
function session() {
  const listeners = new Map();
  const site = { get length() { return siteValues.size; }, key: index => [...siteValues.keys()][index] ?? null,
    getItem: key => siteValues.get(String(key)) ?? null,
    setItem: (key, value) => siteValues.set(String(key), String(value)), removeItem: key => siteValues.delete(String(key)), clear: () => siteValues.clear() };
  const document = {
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []);listeners.get(name).push(callback); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) ?? []) {
      assert.equal(callback(event), undefined, "Browser event callbacks must never return a privileged Promise");
    } }
  };
  function realm() {
    const scope = { window: { localStorage: site, addEventListener() {} }, document, crypto: webcrypto, setTimeout, clearTimeout, DOMException, AbortController,
      CustomEvent: class { constructor(type, options) { this.type = type;this.detail = options.detail; } } };
    vm.createContext(scope);vm.runInContext(checks + "\n" + source, scope);return scope.createArkHomuSettingsStorage;
  }
  const backend = realm()("manager", manager);
  return { backend, async initialize() { await backend.initialize();this.page = realm()("page", null, JSON.stringify(backend.state()));return this.page; },
    emit(request) { document.dispatchEvent({ type: "hako-af:settings-storage-request", detail: JSON.stringify(request) }); } };
}
async function settled(page) { for (let index = 0; index < 50 && page.state().busy; index++) await wait();assert.equal(page.state().busy, false); }
(async () => {
  siteValues.set("hakoAf4000:settings", '{"features":{"gacha":false}}');
  siteValues.set("hakoAf4000:userscript:af-filter-preset:速度", '{"root":{"join":"or","children":[]}}');
  siteValues.set("ha4-training-routes-v2", '{"routes":[],"bindings":[],"mothers":[]}');
  siteValues.set("hakoAf4000:monster-boxes:account", '{"boxes":[["pve","探索用"]]}');
  siteValues.set("hakoAf4000:guild-dungeon-filter-state", '{"combineNations":true}');
  siteValues.set("game-session", "do-not-save");siteValues.set("hakoAf4000:guild-lineup:cache", "do-not-save");
  const current = session(), page = await current.initialize();
  assert.equal(page.state().enabled, false);
  assert.equal(calls.some(([method]) => method === "list" || method === "set"), false, "Default off does not enumerate or save data");
  page.storage.setItem("hakoAf4000:artifact-sort:inventory", "物攻");
  await wait();assert.equal(values.has(prefix + "hakoAf4000:artifact-sort:inventory"), false);
  await page.setEnabled(true);
  assert.equal(values.get(flag), true);
  assert.equal(page.state().count, 6);
  assert.equal(values.has(prefix + "game-session"), false);
  assert.equal(values.has(prefix + "hakoAf4000:guild-lineup:cache"), false, "Caches are outside the backup scope");
  const guild = '{"root":{"join":"or","children":[{"key":"mobEnemies","value":"ファフニール"}]}}';
  page.storage.setItem("hakoAf4000:guild-dungeon-filter-state", guild);await settled(page);
  assert.equal(values.get(prefix + "hakoAf4000:guild-dungeon-filter-state"), guild);
  page.storage.removeItem("hakoAf4000:artifact-sort:inventory");await settled(page);
  assert.equal(values.has(prefix + "hakoAf4000:artifact-sort:inventory"), false);
  siteValues.clear(); // Simulate Tor clearing only the site's data between sessions.
  const reopened = session(), restored = await reopened.initialize();
  assert.equal(restored.state().enabled, true);
  assert.equal(siteValues.get("hakoAf4000:guild-dungeon-filter-state"), guild);
  assert.ok(siteValues.has("ha4-training-routes-v2"));assert.ok(siteValues.has("hakoAf4000:monster-boxes:account"));
  assert.equal(siteValues.has("game-session"), false);
  siteValues.set("hakoAf4000:settings", "newer site value");
  const another = session(), other = await another.initialize();
  assert.equal(siteValues.get("hakoAf4000:settings"), "newer site value", "Restoring never overwrites existing newer site settings");
  restored.storage.setItem("hakoAf4000:userscript:af-filter-preset:A", "A");
  other.storage.setItem("hakoAf4000:userscript:af-filter-preset:B", "B");
  await settled(restored);await settled(other);
  assert.equal(values.get(prefix + "hakoAf4000:userscript:af-filter-preset:A"), "A");
  assert.equal(values.get(prefix + "hakoAf4000:userscript:af-filter-preset:B"), "B", "Independent tabs cannot overwrite other named presets");
  another.emit({ id: "invalid", action: "write", key: "arkhomu-af-release", value: "bad" });await wait();
  assert.equal(values.get("arkhomu-af-release"), "keep-update-code");
  await other.setEnabled(false);
  assert.equal(values.get(flag), false);
  assert.equal([...values.keys()].some(key => key.startsWith(prefix)), false);
  assert.equal(siteValues.get("hakoAf4000:guild-dungeon-filter-state"), guild, "Turning off deletes only the manager backup");
  restored.storage.setItem("hakoAf4000:showDetail", "on");await settled(restored);
  assert.equal(values.has(prefix + "hakoAf4000:showDetail"), false, "A stale tab cannot resume backups after another tab turned them off");
  failWrite = true;
  await assert.rejects(other.setEnabled(true), /write unavailable/);
  assert.equal(values.get(flag), false);assert.equal(other.state().busy, false);
  assert.equal(siteValues.get("hakoAf4000:guild-dungeon-filter-state"), guild);
  failWrite = false;await other.setEnabled(true);
  assert.equal(other.state().enabled, true, "A storage failure can be retried without losing site data");
  failRead = true;const failed = session();const fallback = await failed.initialize();
  assert.equal(fallback.state().available, false);assert.match(fallback.state().error, /read unavailable/);
  fallback.storage.setItem("hakoAf4000:showDetail", "off");
  assert.equal(siteValues.get("hakoAf4000:showDetail"), "off", "A failed manager read leaves normal site storage working");
  failRead = false;
  console.log("Manager settings storage: default off, migration, filter/preset/route/box restore after site clearing, per-key concurrent writes, exclusions, disable cleanup and failure recovery passed.");
})().catch(error => { console.error(error);process.exitCode = 1; });
