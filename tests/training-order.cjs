const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const scope = { document: { addEventListener() {}, dispatchEvent() {} }, Event: class {}, MouseEvent: class {} };vm.createContext(scope);
for (const file of ["feature-names.js", "training-routes-main.js"]) {
  let source = fs.readFileSync(path.join(__dirname, "../extension", file), "utf8");
  if (file === "training-routes-main.js") source = source.replace("  globalThis.hakoAfTrainingRoutesMain = globalThis[singleton] = { read,", `
  globalThis.orderDraftTest = { syncSkillOrderDraft, queue(instance, pending) {
    enabled = true;targets.set(pending.id, { routeId: pending.routeId, skillStateRevision: pending.revision });
    orderDrafts.set(instance, pending);
  }, unbind(id) { targets.delete(id); } };
  globalThis.hakoAfTrainingRoutesMain = globalThis[singleton] = { read,`);
  vm.runInContext(source, scope);
}
const plain = value => JSON.parse(JSON.stringify(value));
const order = route => plain(scope.hakoAfSkillIdentity.routeOrder(route));
const ids = (route, active, passive, saved = {}) => plain(scope.hakoAfTrainingRoutesMain.orderedSkillIds(route,
  { active: active.map(([id, name]) => ({ id, name })), passive: passive.map(([id, name]) => ({ id, name })) }, entry => entry.name, saved));
const route = { ordinary: ["後攻【パッシブ】", "同名【アクティブ】", "先攻【パッシブ】"], permanent: ["永久【パッシブ】"],
  skillOrder: ["先攻【パッシブ】", "永久【パッシブ】", "後攻【パッシブ】", "同名【アクティブ】"], reserved: ["後攻【パッシブ】"] };
// Imported processing order is independent from the ordinary/permanent allocation.
assert.deepEqual(order(route), route.skillOrder);
const saved = JSON.stringify(route);
assert.deepEqual(ids(route, [["same", "同名"], ["extra", "固有技"]], [["first", "先攻"], ["last", "後攻"], ["perm", "永久"], ["extra", "対象外"]],
  { active: ["stale", "extra", "same"], passive: ["first", "last", "extra", "perm"] }),
  { active: ["same", "extra"], passive: ["first", "perm", "last", "extra"] });
assert.equal(JSON.stringify(route), saved, "Applying order never rewrites the saved route");
assert.deepEqual(ids({ ordinary: ["同名【アクティブ】", "足りない【パッシブ】"], permanent: ["同名【パッシブ】"] },
  [["s", "同名"]], [["unmatched", "別スキル"], ["p", "同名"]]), { active: ["s"], passive: ["p", "unmatched"] });
assert.deepEqual(ids({ ordinary: ["表示名変更前"], permanent: [], previewSkillIds: { "表示名変更前": "p.correct" } }, [],
  [["wrong", "表示名変更前"], ["correct", "表示名変更後"]]), { active: [], passive: ["correct", "wrong"] });
assert.deepEqual(order({ ordinary: ["旧通常"], permanent: ["旧永久"] }), ["旧通常", "旧永久"], "Old routes work without new metadata");
assert.deepEqual(order({ ordinaryNames: ["旧通常"], permanentNames: ["旧永久"], permanent: new Set(["旧永久"]) }), ["旧通常", "旧永久"], "The native bridge's membership sets are separate from ordered names");
assert.deepEqual(order({ ordinary: ["通常"], permanent: [], skillOrder: ["削除済み", "通常", "通常", null] }), ["通常"]);
assert.deepEqual(order({ ordinary: ["通常【パッシブ】"], permanent: ["永久【パッシブ】"], orderUnique: "R6固有【パッシブ】",
  skillOrder: ["R6固有【パッシブ】", "永久【パッシブ】", "通常【パッシブ】"] }), ["R6固有【パッシブ】", "永久【パッシブ】", "通常【パッシブ】"]);
assert.deepEqual(order({ ...route, ordinary: [route.ordinary[0], route.ordinary[1], route.permanent[0]], permanent: [route.ordinary[2]] }), route.skillOrder,
  "Moving a skill between ordinary and permanent never changes its processing position");
// The game's native detail owns a separate editing draft. Updating only its store leaves the UI stale.
for (const flex of [false, true]) {
  let draft = { active: ["extra", "target"], passive: ["last", "first", "reserved"] }, stored, writes = 0;
  const desired = { active: ["target", "extra"], passive: ["first", "last", "reserved"] };
  const rows = Object.entries(draft).flatMap(([kind, ids]) => ids.filter(id => id !== "reserved").map(id => ({
    key: `${kind}-${id}`, props: flex ? { "data-fx-drag-id": `${kind}:${id}` } : {}, children: [{ type: "button", props: {
      "aria-label": "いちばん上へ", onClick() { draft = { ...draft, [kind]: [id, ...draft[kind].filter(value => value !== id)] }; }
    } }]
  })));
  const instance = { subTree: { children: rows } }, pending = { id: "owned", routeId: "route", revision: "apply", desired,
    settings: { replaceSkillOrder(id, next) { assert.equal(id, "owned");stored = next;writes++; } } };
  scope.orderDraftTest.queue(instance, pending);
  scope.orderDraftTest.syncSkillOrderDraft(instance, "other");
  assert.equal(writes, 0, "A reused detail must not apply a different monster's pending order");
  scope.orderDraftTest.syncSkillOrderDraft(instance, "owned");
  assert.deepEqual(draft, desired, "The visible native draft follows the same order as the store");
  assert.deepEqual(stored, desired, "Reserved rows without move controls retain their full saved order");
  draft.active.reverse();scope.orderDraftTest.syncSkillOrderDraft(instance, "owned");
  assert.equal(writes, 1, "Subsequent manual edits are not repeatedly overwritten");
  scope.orderDraftTest.queue(instance, pending);scope.orderDraftTest.unbind("owned");
  scope.orderDraftTest.syncSkillOrderDraft(instance, "owned");assert.equal(writes, 1, "Unbinding cancels pending UI work");
}
console.log("Training order: mixed ordinary/permanent processing, typed IDs, R6, reserves, legacy routes, native editing drafts, reused details and manual edits passed.");
