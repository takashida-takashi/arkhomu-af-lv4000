const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const stored = new Map(), scope = { localStorage: { getItem: key => stored.get(key) ?? null },
  document: { addEventListener() {} }, window: { addEventListener() {} } };
vm.createContext(scope);
for (const file of ["forecast.js", "artifact-effects.js", "list-rules.js", "feature-names.js", "extras.js"]) {
  let source = fs.readFileSync(path.join(__dirname, "../extension", file), "utf8");
  if (file === "extras.js") source = source.replace("{ start, get, save };", "{ start, get, save, loadSettings };");
  vm.runInContext(source, scope);
}
const { dropType, dropGroup, itemPriorities } = scope.hakoAfListRules;
const plain = value => JSON.parse(JSON.stringify(value));
for (const item of [
  { _artifact: { rank: 12 } }, { _artifact: {}, artifact_rank: 12 },
  { _artifact: { rarities: { __artifact_rank: 12 } }, m_items: { rank: 10 } },
  { _artifact: {}, rarities: { __artifact_rank: 12 } },
  { _artifact: {}, display_rank: 12 }, { _artifact: {}, m_items: { rank: 12 } }
]) assert.equal(dropType(item), "af12");
assert.equal(dropType({ _artifact: { rank: 11, rarities: { __artifact_rank: 12 } } }), "af11", "Prefer the rank used by native cards");
assert.equal(dropType({ _artifact: {} }), "afOther");
assert.equal(dropType({ _artifact: { rank: 13 } }), "afOther", "Unknown ranks remain explicit");
assert.equal(dropType({ item_id: "wood", m_items: {} }), "normal");
assert.equal(dropType({ soul_monster_id: "soul" }), "soul");
assert.equal(dropType({ m_items: { type: "homunculus_egg" } }), "egg");
const rules = itemPriorities([{ name: "  木材  ", order: "1.1", page: "2" },
  { name: "ポーション", order: 2.05, page: 3 }, { name: "", order: 5 }, null]);
assert.deepEqual(plain(rules), [{ name: "木材", order: 1.1, page: 2 }, { name: "ポーション", order: 2.05, page: 3 }]);
const groups = { normal: { order: 6, page: 4 }, af12: { order: 1, page: 1 }, other: { order: 8, page: 5 } };
assert.deepEqual(plain(dropGroup({ item_id: "wood" }, {}, groups, rules, "木材")), { ...plain(rules[0]), type: "normal" });
assert.equal(dropGroup({ item_id: "wood" }, {}, groups, rules, "ポーションの欠片").order, 6, "Names are exact matches, not substrings");
assert.equal(dropGroup({ item_id: "wood" }, {}, groups, rules, "別の木材").order, 6);
assert.equal(dropGroup({ _artifact: { rank: 12 } }, {}, groups, rules, "木材").order, 1, "Item-name rules never reclassify AFs");
const invalid = itemPriorities([{ name: "A", order: Infinity, page: 0 }, { name: "B", order: 100, page: 2.9 }]);
assert.deepEqual(plain(invalid), [{ name: "A", order: 1, page: 1 }, { name: "B", order: 1, page: 2 }]);
stored.set("hakoAf4000:settings", JSON.stringify({ groups: { af12: { order: 1.1, page: 2 },
  af11: { order: 1.25, page: 3 }, normal: { order: 6.05, page: 4 } }, itemPriorities: rules,
  features: { skipExploreLogs: false }, candidates: "mark" }));
let loaded = scope.hakoAfExtras.loadSettings();
assert.equal(loaded.groups.af12.order, 1.1); assert.equal(loaded.groups.af11.order, 1.25);
assert.equal(loaded.groups.normal.order, 6.05); assert.equal(loaded.groups.af12.page, 2);
assert.deepEqual(plain(loaded.itemPriorities), plain(rules));
assert.equal(loaded.features.skipExploreLogs, false); assert.equal(loaded.candidates, "mark");
stored.set("hakoAf4000:settings", JSON.stringify({ groups: { transcendent: { order: 1.7, page: 3 } } }));
loaded = scope.hakoAfExtras.loadSettings();
assert.equal(loaded.groups.af12.order, 1.7); assert.equal(loaded.groups.af11.order, 1.7);
assert.deepEqual(plain(loaded.itemPriorities), []);
console.log("Explore priorities: native Eternal rank sources, exact item overrides, AF exclusions, decimal orders, integer pages and existing/legacy settings passed.");
