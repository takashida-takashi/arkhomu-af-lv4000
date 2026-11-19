const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
class CustomEvent extends Event { constructor(name, options = {}) { super(name, options); this.detail = options.detail; } }
const document = new EventTarget(), window = new EventTarget(), confirmations = [], requests = [];
const recipient = { user_monster_id: "recipient", monster_id: "fox", generation_value: 20, level: 100, mockActive: [] };
const donor = { user_monster_id: "donor", monster_id: "bee", generation_value: 20, level: 1, mockActive: [] };
const store = { monsters: [recipient, donor] };
const data = { skills: [{ id: "a", name: "蜂の襲撃" }], passives: [{ id: "a", name: "蜂の襲撃" }],
  monsters: [{ id: "bee", skills: [{ skill_id: "a", level_unlocked: 1 }], passives: [{ passive_id: "a", level_unlocked: 400 }] }] };
const app = { config: { globalProperties: { $pinia: { _s: new Map([["userMonsters", store]]) }, $t: value => value } }, runWithContext: callback => callback() };
document.getElementById = () => ({ __vue_app__: app });
document.querySelectorAll = () => [];
window.confirm = text => { confirmations.push(text); return window.accept !== false; };
const scope = { document, window, Event, CustomEvent, setTimeout, clearTimeout, clearInterval, queueMicrotask, console,
  $fetch: async (url, options) => { requests.push({ url, body: options?.body }); return { success: false }; },
  hakoAfPartyShareMain: { getReaders: async () => ({ learned: () => ({
    getActiveSkills: member => member.mockActive ?? [], getPassiveSkills: member => member.mockPassive ?? []
  }), masters: () => ({ isLoaded: { value: true } }) }) } };
vm.createContext(scope);
const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension", file), "utf8"), scope);
run("feature-names.js");run("market-snapshot.js");run("training-sources-main.js");
scope.hakoAfTrainingSources.readMasters = async () => data;
run("training-routes-main.js");
const snapshot = (bound = true, mothers = []) => document.dispatchEvent(new CustomEvent("hako-af:training-routes", { detail: JSON.stringify({
  enabled: true, routes: [{ id: "route", name: "確認ルート", ordinary: ["蜂の襲撃【パッシブ】"], permanent: [] }],
  bindings: bound ? [{ monsterId: "recipient", routeId: "route" }] : [], mothers
}) }));
const body = extra => ({ parentAId: "recipient", parentBId: "donor", ...extra });
const mate = extra => scope.$fetch("/api/mating/execute", { method: "POST", body: body(extra) });
(async () => {
  snapshot();window.accept = false;
  await assert.rejects(mate({ requestId: "declined" }), error => error.statusCode === 400);
  assert.equal(requests.length, 0);
  assert.match(confirmations.at(-1), /増えません/);assert.match(confirmations.at(-1), /パッシブ.*Lv400/);
  window.accept = true;
  await mate({ requestId: "declined" });assert.equal(requests.length, 1, "A declined request may be reconsidered");
  let count = confirmations.length;
  await mate({ requestId: "declined", recover: true });assert.equal(confirmations.length, count, "Recovery shares the same approval");
  await mate({ requestId: "declined", selectedTraitKeys: ["p:a"] });assert.equal(confirmations.length, ++count, "A changed selection requires confirmation");
  donor.level = 400;donor.mockPassive = [{ id: "a" }];
  await mate({ requestId: "gain", selectedTraitKeys: ["p:a"] });assert.equal(confirmations.length, count, "The required passive is gained");
  await mate({ requestId: "omitted", selectedTraitKeys: ["s:a"] });assert.equal(confirmations.length, ++count, "The active namesake does not satisfy a passive goal");
  assert.doesNotMatch(confirmations.at(-1), /レベルを上げる/);
  recipient.mockPassive = [{ id: "a" }];await mate({ requestId: "complete" });assert.equal(confirmations.length, count);
  recipient.mockPassive = [];donor.mockPassive = [];donor.level = 1;donor.generation_value = 1000;
  snapshot(true, ["recipient", "donor"]);
  const previousFetch = scope.$fetch;scope.$fetch = (...args) => previousFetch(...args);
  run("training-routes-main.js");
  assert.equal(scope.hakoAfMonsterGuards.size, 1, "Repeated initialization does not register duplicate guards");
  await mate({ requestId: "wrapped" });assert.equal(confirmations.length, ++count, "A delegating fetch wrapper asks once");
  assert.match(confirmations.at(-1), /母体が2体/);assert.match(confirmations.at(-1), /増えません/);
  await mate();assert.equal(confirmations.length, ++count, "Nested wrappers without request IDs also ask once");
  scope.hakoAfTrainingRoutesMain.legacyMating(["recipient", "donor"]);
  store.monsters = [];
  await mate({ requestId: "suppressed" });assert.equal(confirmations.length, ++count);
  assert.match(confirmations.at(-1), /Lv400/, "Remember parent records while the game suppresses them during execution");
  donor.generation_value = 20;
  snapshot(false);await mate({ requestId: "unbound" });assert.equal(confirmations.length, count, "Unbound low-generation parents need no route warning");
  // The donor is no longer in the current store, but its protection is remembered by the mating selection.
  snapshot(false, ["recipient", "donor"]);
  await scope.$fetch("/api/soul/soulify", { method: "POST", body: { userMonsterId: "donor" } });
  assert.equal(confirmations.length, ++count);assert.match(confirmations.at(-1), /魂化/);
  console.log("Monster guards: typed route gains, future levels, cancellation, parent suppression, combined warnings, wrapper deduplication, recovery and singleton registration passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
