const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const scope = {}; vm.createContext(scope);
for (const file of ["forecast.js", "artifact-effects.js", "list-rules.js", "filter-popup.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension", file), "utf8"), scope);
}
const { readSnapshot, readEffects, optionFor } = scope.hakoAfEffects;
const { dropMetrics, viewRule } = scope.hakoAfListRules;
const parse = scope.hakoAfFilterPopup.parseSharedPreset;
const plain = value => JSON.parse(JSON.stringify(value));
const make = (prefix, extra = {}) => {
  const artifact = { level: 1000, params: {}, traits: [{ key: "add_drop", value: 2 }], prefix, ...extra };
  return dropMetrics(readSnapshot(artifact));
};
const shin = make("真・錬成の"), goku = make("極・錬成の"), normal = make("錬成の"), empty = make("");
const unknown = make(undefined), missing = dropMetrics(null);
const check = (item, children, join = "and", minimum = 2) => viewRule({
  root: { join, minimum, children }, useForecast: true, kept: [], showUnknown: false
}).check(item).result;
const trueOnly = { key: "variant:shin" }, extremeOnly = { key: "variant:goku" };
assert.equal(check(shin, [trueOnly]), true); assert.equal(check(goku, [trueOnly]), false);
assert.equal(check(goku, [extremeOnly]), true); assert.equal(check(shin, [extremeOnly]), false);
for (const item of [normal, empty]) {
  assert.equal(check(item, [trueOnly]), false);
  assert.equal(check(item, [{ ...trueOnly, absent: true }, { ...extremeOnly, absent: true }]), true);
}
for (const item of [unknown, missing]) {
  assert.equal(check(item, [trueOnly]), null);
  assert.equal(check(item, [{ ...trueOnly, absent: true }]), null, "Unknown prefixes cannot be treated as ordinary artifacts");
}
assert.equal(check(make("錬成の", { name: "真・自分で付けた名前" }), [trueOnly]), false, "Use the actual prefix, not a custom name");
assert.equal(check(make("接頭語に真・を含むだけ"), [trueOnly]), false);
assert.equal(check(shin, [trueOnly, extremeOnly], "or"), true);
assert.equal(check(goku, [trueOnly, extremeOnly], "or"), true);
assert.equal(check(normal, [trueOnly, extremeOnly], "or"), false);
assert.equal(check(shin, [trueOnly, extremeOnly]), false);
const drop = { key: "trait:add_drop", min: "200", max: "", stars: "" };
assert.equal(check(shin, [trueOnly, drop]), true, "A prefix condition combines with forecast OP thresholds");
assert.equal(check(normal, [trueOnly, drop]), false);
assert.equal(check(shin, [trueOnly, extremeOnly, drop], "count", 2), true);
assert.equal(check(normal, [trueOnly, extremeOnly, drop], "count", 2), false);
assert.equal(check(unknown, [{ children: [trueOnly, extremeOnly], join: "or" }, { ...drop, min: "999999" }]), false);
for (const key of [trueOnly.key, extremeOnly.key]) {
  assert.equal(optionFor(key).group, "basic"); assert.equal(optionFor(key).kind, "flag"); assert.equal(optionFor(key).sortable, false);
}
const preset = { format: "hako-af-filter", version: 2, name: "真極", root: { join: "or", children: [
  { join: "and", children: [trueOnly, drop], sectionPage: "真極", sectionColor: "#ff0000" },
  { ...extremeOnly, absent: true, min: "999", max: "1", stars: "5", sectionName: "極以外" }
] }, sortKey: "variant:shin" };
const restored = parse(JSON.stringify(preset));
assert.equal(restored.sortKey, "", "Prefix conditions are not numeric sorts");
assert.equal(restored.root.children[1].absent, true);
assert.equal(restored.root.children[1].min, ""); assert.equal(restored.root.children[1].stars, "");
assert.equal(restored.root.children[0].sectionPage, "真極");
assert.equal(check(shin, restored.root.children, restored.root.join), true);
const legacy = { format: "hako-af-filter", version: 1, root: { join: "and", children: [drop] } };
assert.equal(parse(JSON.stringify(legacy)).root.children[0].min, "200");
assert.deepEqual(plain(parse(JSON.stringify({ ...legacy, version: 2 })).root), plain(parse(JSON.stringify(legacy)).root));
assert.throws(() => parse(JSON.stringify({ ...preset, root: { join: "and", children: [{ key: "variant:unknown" }] } })));
console.log("AF prefix filters: true/extreme/ordinary/unknown, custom names, nested AND/OR/count, forecast OPs, legacy/shared presets and nonnumeric controls passed.");
