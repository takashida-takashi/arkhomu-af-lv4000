const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
async function run({ count = 6000, prefilled = 0, pulls = 1000, cancelAt, failAt, changeAt } = {}) {
  let clock = 0, pauses = 0, attempts = 0, state;
  const scope = { Event, performance: { now: () => clock }, document: { addEventListener() {}, dispatchEvent() {} },
    setTimeout: callback => { pauses++;queueMicrotask(callback); } };
  vm.createContext(scope);
  const source = fs.readFileSync(path.join(__dirname, "../extension/gacha-sets.js"), "utf8").replace(/\r\n/g, "\n");
  const exposed = source.replace("return {\n      readClassic", "return { useSets,\n      readClassic");
  assert.notEqual(source, exposed);vm.runInContext(exposed, scope);
  const plan = { enabled: true }, selected = new Map();
  const items = Array.from({ length: count }, (_, index) => ({ id: "AF " + index, power: 1000, m_items: { rank: 10 }, _artifact: {} }));
  const protectedItems = ["is_equipped", "is_favorite"].map(flag => ({ id: flag, power: 100000, m_items: { rank: 10 }, _artifact: { [flag]: true } }));
  for (const item of items.slice(0, prefilled)) selected.set(item.id, item);
  const auto = {}, option = { value: "5000", disabled: false, parentElement: { parentElement: { parentElement: auto } } };
  const root = { isConnected: true, querySelector: selector => selector === "#agacha-auto-set" ? option :
    selector.includes("gacha-use-sets") ? { checked: true } : null };
  const toggle = item => {
    clock += 3;
    if (selected.has(item.id)) selected.delete(item.id);
    else if (++attempts !== failAt) selected.set(item.id, item);
    if (selected.size >= cancelAt) state.cancelRequested = true;
    if (selected.size >= changeAt) option.value = "6000";
  };
  state = { classic: true, root, candidates: { value: [...items, ...protectedItems] },
    cartItems: { get value() { return [...selected.values()]; } }, power: item => item.power,
    store: { isArtifactsLoaded: true, isArtifactFavoriteUpdating: () => false },
    presets: { isReady: true, presets: [] }, powerReady: true,
    grid: { vnode: { el: { isConnected: true }, children: { default: ({ item }) => ({ props: { item, onClick: () => toggle(item) } }) } } }, message: "" };
  const api = scope.hakoAfGachaSets.start({ dependencies() {}, readThrough() {}, currentPlan: () => plan });
  await api.useSets(state, pulls);
  assert.equal(Boolean(state.busy), false);assert.equal(selected.has("is_equipped"), false);assert.equal(selected.has("is_favorite"), false);
  return { selected, state, clock, pauses };
}
(async () => {
  const full = await run();assert.equal(full.selected.size, 5000);assert.ok(full.clock > 2000);assert.ok(full.pauses > 1);
  assert.match(full.state.message, /カート合計 1,000 \/ 1,000連/);
  const partial = await run({ prefilled: 1500 });assert.equal(partial.selected.size, 5000);assert.match(partial.state.message, /700連をセット/);
  const shortage = await run({ count: 1250 });assert.equal(shortage.selected.size, 1250);assert.match(shortage.state.message, /250 \/ 1,000連/);assert.match(shortage.state.message, /候補が足りず/);
  const cancelled = await run({ cancelAt: 502 });assert.ok(cancelled.selected.size > 0 && cancelled.selected.size < 5000);assert.equal(cancelled.selected.size % 5, 0);assert.match(cancelled.state.message, /中止しました/);
  const failed = await run({ failAt: 13 });assert.equal(failed.selected.size, 10);assert.match(failed.state.message, /途中で止まり/);
  const changed = await run({ changeAt: 252 });assert.ok(changed.selected.size < 5000);assert.equal(changed.selected.size % 5, 0);assert.match(changed.state.message, /途中で止まり/);
  const one = await run({ prefilled: 15, pulls: 1 });assert.equal(one.selected.size, 20);
  const complete = await run({ prefilled: 1500, pulls: 100 });assert.equal(complete.selected.size, 1500);assert.match(complete.state.message, /セット済み/);
  console.log("Gacha filling: 1000 pulls beyond two seconds, existing cart top-up, shortages, cooperative yields, whole-set cancellation/rollback, changed conditions and protected AF passed.");
})().catch(error => { console.error(error);process.exitCode = 1; });
