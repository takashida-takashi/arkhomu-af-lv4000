const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const values = new Map(), key = "hakoAf4000:guild-dungeon-filter-state";
let blockWrites = false;
const localStorage = { getItem: name => values.get(name) ?? null, setItem: (name, value) => {
  if (blockWrites) throw new Error("Storage unavailable");
  values.set(name, value);
} };
function load() {
  const scope = { localStorage, document: { querySelectorAll: () => [] },
    hakoAf4000: { normalize: value => value }, hakoAfEffects: { groups: {} } };
  vm.createContext(scope);
  for (const file of ["feature-names.js", "list-rules.js", "filter-popup.js", "guild-dungeon-hidden.js", "guild-dungeon-filter.js"]) {
    let source = fs.readFileSync(path.join(__dirname, "../extension", file), "utf8");
    if (file === "guild-dungeon-filter.js") source = source.replace("return { scan };", "return { scan, state, changed, dismissed };");
    vm.runInContext(source, scope);
  }
  return scope.hakoAfGuildDungeonFilter.start(() => true);
}
const plain = value => JSON.parse(JSON.stringify(value));
const current = load();
current.dismissed.hide({id:"my-guild:2",revision:3,name:"個別非表示"});current.changed();
assert.equal(load().dismissed.hidden.get("my-guild:2").revision,3,"Exclusions use the existing manager-backed settings key");
assert.equal(current.state.root.children.length, 0);
assert.equal(current.state.combineNations, false, "Nation grouping stays enabled by default");
assert.equal(current.state.hideFinished, false, "Finished challenges stay visible by default");
const root = { join: "or", children: [{ join: "and", children: [
  { key: "mobDifficulty", value: "13", comparison: "min" }, { key: "mobEnemies", value: "ファフニール" }
] }, { join: "count", minimum: 2, children: [
  { key: "entryFee", min: "", max: "1000000" }, { key: "bossEnemies", value: "ヴォイド", absent: true },
  { key: "todayClearRate", min: "80", max: "" }
] }] };
Object.assign(current.state, { root, sortKey: "mobStars", sortDirection: "desc", showUnknown: true, combineNations: true, hideFinished: true });
current.changed();
assert.deepEqual(plain(load().state), plain(current.state), "Applied conditions survive a new runtime");
const savedWithNations = values.get(key);
const legacy = JSON.parse(savedWithNations);delete legacy.combineNations;delete legacy.hideFinished;values.set(key, JSON.stringify(legacy));
assert.equal(load().state.combineNations, false, "Existing saved filters keep the new option off");
assert.equal(load().state.hideFinished, false, "Existing saved filters keep finished challenges visible");
values.set(key, savedWithNations);
const original = values.get(key);
values.set("guild-dungeon-filter-preset:手動プリセット", "keep");
blockWrites = true;current.state.sortDirection = "asc";current.changed();
assert.equal(values.get(key), original, "Failed writes do not erase saved conditions");
assert.equal(current.state.sortDirection, "asc", "Filtering keeps working when storage is unavailable");
blockWrites = false;current.changed();assert.equal(load().state.sortDirection, "asc");
current.state.root = { join: "and", children: [] };current.state.sortKey = "";current.changed();
assert.equal(load().state.root.children.length, 0, "An intentional reset survives restart");
assert.equal(load().dismissed.hidden.has("my-guild:2"),true,"Resetting filter conditions keeps personal exclusions");
assert.equal(values.get("guild-dungeon-filter-preset:手動プリセット"), "keep");
for (const bad of ["{bad json", JSON.stringify({ format: "wrong", version: 2, root }),
  JSON.stringify({ format: "hako-guild-dungeon-filter", version: 2, root: { join: "or", children: [{ key: "unknown", value: "x" }] } })]) {
  values.set(key, bad);assert.equal(load().state.root.children.length, 0);
}
console.log("Guild filter state: nested AND/OR/count, difficulty comparisons, exclusions, sorting, unknowns, reset, presets and storage failures passed.");
