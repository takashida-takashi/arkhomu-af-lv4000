const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const root = path.join(__dirname, "../extension"), listeners = new Map(), values = new Map();
const document = {
  addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []);listeners.get(type).push(callback); },
  dispatchEvent(event) { for (const callback of listeners.get(event.type) ?? []) callback(event); }
};
const storageListeners = [];
function create() {
  const scope = { document, window: { addEventListener(type, callback) { if (type === "storage") storageListeners.push(callback); } },
    localStorage: { getItem: key => values.get(key) ?? null },
    CustomEvent: class { constructor(type, options) { this.type = type;this.detail = options?.detail; } },
    performance, setTimeout: callback => queueMicrotask(callback) };
  vm.createContext(scope);
  for (const file of ["forecast.js", "artifact-effects.js", "list-rules.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), scope);
  return scope;
}
const page = create(), isolated = create(), forecast = page.hakoAf4000, rules = page.hakoAfListRules;
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(forecast.getTarget(), 4500);
assert.equal(isolated.hakoAf4000.getTarget(), 4500);
for (const level of [1, 1000, 3999, 4000, 4250, 4499]) assert.ok(forecast.ratio(level) > 1);
for (const level of [4500, 4501, 5000]) assert.equal(forecast.ratio(level), 1);
const artifact = (id, level, hp) => ({ id, ...rules.dropMetrics({ level, parameters: [["hp", hp, 3]], effects: [] }) });
const formerCap = artifact("former-cap", 4000, 100), complete = artifact("complete", 4500, 105);
const filter = useForecast => rules.viewRule({ root: { join: "and", children: [{ key: "stat_hp", min: "105" }] }, useForecast, kept: [] });
assert.equal(filter(false).check(formerCap).show, false);
assert.equal(filter(true).check(formerCap).show, true, "Lv4000 AFs can satisfy a filter using their Lv4500 forecast");
assert.deepEqual(plain(rules.orderItems([formerCap, complete], { key: "stat_hp", direction: "desc", forecast: true }).map(item => item.id)), ["former-cap", "complete"]);
assert.deepEqual(plain(rules.orderItems([formerCap, complete], { key: "stat_hp", direction: "desc", forecast: false }).map(item => item.id)), ["complete", "former-cap"]);
forecast.setTarget(4000);
assert.equal(isolated.hakoAf4000.getTarget(), 4000, "The page and isolated worlds share target changes");
assert.equal(forecast.ratio(4000), 1);
assert.equal(filter(true).check(formerCap).show, false, "Changing the target changes filter results without reloading");
forecast.setTarget(4250);
assert.ok(forecast.ratio(4000) > 1);assert.equal(forecast.ratio(4250), 1);
for (const value of [null, "", -1, 0, 1.5, 1_000_001, Infinity, "invalid"]) assert.equal(forecast.normalizeTarget(value), 4500);
for (const target of [4501, 5000, 10_000, 1_000_000]) {
  forecast.setTarget(target);
  assert.equal(forecast.getTarget(), target);
  assert.equal(isolated.hakoAf4000.getTarget(), target);
  assert.ok(Number.isFinite(forecast.projected({ n: 100, unit: "%" }, forecast.ratio(4000))));
  assert.ok(forecast.projected({ n: 100, unit: "%" }, forecast.ratio(4000)) > 100);
  assert.equal(forecast.projected({ n: 4, unit: "回" }, forecast.ratio(1)), 4);
  assert.equal(forecast.projected({ n: 4, unit: "", fixed: true }, forecast.ratio(1)), 4);
}
const hitArtifact = (id, level, hits) => ({ id, ...rules.dropMetrics({ level, parameters: [], effects: [["add_multi_hit", hits, 2]] }) });
const fewHits = hitArtifact("few", 1, 2), manyHits = hitArtifact("many", 4500, 3);
const hitRule = rules.viewRule({ root: { join: "and", children: [{ key: "trait:add_multi_hit", min: "3" }] }, useForecast: true, kept: [] });
assert.equal(hitRule.check(fewHits).show, false, "A distant target must not turn two hits into three hits");
assert.equal(hitRule.check(manyHits).show, true);
assert.deepEqual(plain(rules.orderItems([fewHits, manyHits], { key: "trait:add_multi_hit", direction: "desc", forecast: true }).map(item => item.id)), ["many", "few"]);
values.set("hakoAf4000:settings", JSON.stringify({ forecastTarget: 4200, features: { detail: false } }));
assert.equal(create().hakoAf4000.getTarget(), 4200, "Saved targets survive startup without replacing existing settings");
for (const callback of storageListeners) callback({ key: "hakoAf4000:settings" });
assert.equal(forecast.getTarget(), 4200);assert.equal(isolated.hakoAf4000.getTarget(), 4200);
values.clear();for (const callback of storageListeners) callback({ key: null });
assert.equal(forecast.getTarget(), 4500);

vm.runInContext(fs.readFileSync(path.join(root, "enhance-estimate.js"), "utf8")
  .replace("globalThis.hakoAfEnhanceEstimate = { start };", "globalThis.calculateEstimate = calculate;"), page);
const deterministic = { successGain: [1, 1], greatGain: [1, 1], baseCap: 1000, advancedCost: 1, advancedSuccess: 1,
  itemsPerStep: 0, gamma: 1, goldMultiplier: 1, basePrice: 1, starCoefficient: 0, discount: 0,
  failMax: 0, failRate: 0, failStep: 0, failReduction: 0 };
(async () => {
  let result = await page.calculateEstimate(4000, deterministic, 0, () => true);
  assert.deepEqual(plain(result), { expected: 500, p90: 500, goldExpected: 2124750, goldP90: 2124750 });
  result = await page.calculateEstimate(4499, deterministic, 0, () => true);
  assert.deepEqual(plain(result), { expected: 1, p90: 1, goldExpected: 4499, goldP90: 4499 });
  forecast.setTarget(4100);
  result = await page.calculateEstimate(4000, deterministic, 0, () => true);
  assert.deepEqual(plain(result), { expected: 100, p90: 100, goldExpected: 404950, goldP90: 404950 });
  assert.equal(await page.calculateEstimate(4000, deterministic, 0, () => false), undefined, "Obsolete estimates can be cancelled");
  result = await page.calculateEstimate(4000, deterministic, 0, () => true, 5000);
  assert.deepEqual(plain(result), { expected: 1000, p90: 1000, goldExpected: 4499500, goldP90: 4499500 });
  result = await page.calculateEstimate(99_999, deterministic, 0, () => true, 100_000);
  assert.deepEqual(plain(result), { expected: 1, p90: 1, goldExpected: 99999, goldP90: 99999 });
  assert.equal(await page.calculateEstimate(4000, deterministic, 0, () => true, 100_001), undefined, "Cost bounds never silently estimate a smaller target");
  let checks = 0;
  assert.equal(await page.calculateEstimate(1, deterministic, 0, () => ++checks < 3, 100_000), undefined, "Large dynamic programming calculations can be cancelled before sampling");
  console.log("AF target: default 4500, configurable through one million, fixed additional hits in forecasts/filter/sort, synchronized settings, exact material/gold estimates through 100000, safe cost limits and cancellation passed.");
})().catch(error => { console.error(error);process.exitCode = 1; });
