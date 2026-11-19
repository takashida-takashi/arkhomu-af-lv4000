const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const scope = { document: { addEventListener() {} } };
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/feature-names.js"), "utf8"), scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/training-sources-main.js"), "utf8"), scope);
const { sourceIndex, matingAdvice } = scope.hakoAfTrainingSources;
const normalize = value => value.normalize("NFKC").trim();
const data = {
  skills: [{ id: "a", name: "蜂の襲撃" }, { id: "b", name: "招集" },
    { id: "fixed", name: "固有技", inheritability: false }],
  passives: [{ id: "c", name: "カラミティ・ロア" }, { id: "r6", name: "Rank6固有" }],
  monsters: [
    { id: "sentinel", name: "ハイヴセンチネル", rank: 4,
      skills: [{ skill_id: "a", level_unlocked: 1 }, { skill_id: "b", level_unlocked: 50 }, { skill_id: "b", level_unlocked: 200 }],
      passives: [{ passive_id: "c", level_unlocked: 400 }] },
    { id: "golem", name: "ハニーゴーレム", rank: 4, skills: [{ skill_id: "a", level_unlocked: 1 }] },
    { id: "fixed", name: "固有持ち", rank: 6, skills: [{ skill_id: "a" }, { skill_id: "fixed" }], rank6_unique_skill: "r6" },
    { id: "same-a", name: "同名個体", rank: 3, skills: [{ skill_id: "a" }] },
    { id: "same-b", name: "同名個体", rank: 3, skills: [{ skill_id: "b" }] },
    { id: "unseen", name: "未発見の正体", rank: 5, skills: [{ skill_id: "a" }, { skill_id: "b" }] }
  ],
  items: [{ id: "book", name: "付与アイテム", effects: { skill: ["a", "b"] } }]
};
const profile = { monsterDiscoveries: Object.fromEntries(data.monsters.filter(m => m.id !== "unseen").map(m => [m.id, "owned"])) };
const saved = JSON.stringify(data);
const names = ["蜂の襲撃", "招集", "カラミティ・ロア", "固有技", "Rank6固有"];
const entry = (index, name, id) => index.get(name).find(row => row.monsterId === id);
const index = sourceIndex(data, names, profile, key => key, normalize, names);
const overlaps = row => JSON.parse(JSON.stringify(row.overlaps ?? []));
assert.deepEqual(overlaps(entry(index, "蜂の襲撃", "sentinel")), [
  { name: "招集", level: 50, skillKind: "skill" }, { name: "カラミティ・ロア", level: 400, skillKind: "passive" }
]);
assert.deepEqual(overlaps(entry(index, "招集", "sentinel")), [
  { name: "蜂の襲撃", level: 1, skillKind: "skill" }, { name: "カラミティ・ロア", level: 400, skillKind: "passive" }
]);
for (const [name, id] of [["蜂の襲撃", "golem"], ["蜂の襲撃", "same-a"], ["招集", "same-b"],
  ["蜂の襲撃", "fixed"], ["固有技", "fixed"], ["Rank6固有", "fixed"]]) {
  assert.deepEqual(overlaps(entry(index, name, id)), [], "Count distinct inheritable skills per species only");
}
for (const rows of index.values()) for (const row of rows) if (!row.monsterId) assert.equal(row.overlaps, undefined);
assert.ok(!JSON.stringify([...index.values()]).includes("未発見の正体"));
assert.ok(!JSON.stringify([...index.values()]).includes('"monsterId":"unseen"'));
const onlyOneMissing = sourceIndex(data, names, profile, key => key, normalize, ["蜂の襲撃"]);
assert.deepEqual(overlaps(entry(onlyOneMissing, "蜂の襲撃", "sentinel")), [], "Permanent-only or learned skills do not count");
const twoMissing = sourceIndex(data, names, profile, key => key, normalize, ["蜂の襲撃", "カラミティ・ロア"]);
assert.deepEqual(overlaps(entry(twoMissing, "蜂の襲撃", "sentinel")), [{ name: "カラミティ・ロア", level: 400, skillKind: "passive" }]);
assert.equal(JSON.stringify(data), saved, "Keep the cached master data unchanged");
for (const rows of index.values()) {
  const levels = Array.from(rows).filter(row => row.kind === "monster").map(row => row.level ?? Infinity);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "Preserve ascending learn level order");
}
console.log("Training source overlaps: distinct species/skills, lowest level, ordinary-only needs, unique exclusions, privacy, live need changes and existing sort verified.");

const typedData = structuredClone(data);
typedData.passives.push({ id: "a", name: "蜂の襲撃" }, { id: "hidden", name: "非表示技", display: "none" });
typedData.monsters[0].passives.push({ passive_id: "a", level_unlocked: 400 }, { passive_id: "hidden", level_unlocked: 5 });
const typedIndex = sourceIndex(typedData, names, profile, key => key, normalize);
const sameName = Array.from(typedIndex.get("蜂の襲撃")).filter(row => row.monsterId === "sentinel");
assert.deepEqual(sameName.map(row => [row.skillKind, row.skillId, row.level]), [["skill", "a", 1], ["passive", "a", 400]]);
const selectedIndex = sourceIndex(typedData, names, profile, key => key, normalize, names, { "蜂の襲撃": "p.a" });
assert.deepEqual(Array.from(selectedIndex.get("蜂の襲撃")).filter(row => row.monsterId === "sentinel").map(row => row.skillKind), ["passive"]);
const typedNames = ["蜂の襲撃【アクティブ】", "蜂の襲撃【パッシブ】"];
const namedIndex = sourceIndex(typedData, typedNames, profile, key => key, normalize);
assert.deepEqual(Array.from(namedIndex.get(typedNames[0])).filter(row => row.monsterId === "sentinel").map(row => row.level), [1]);
assert.deepEqual(Array.from(namedIndex.get(typedNames[1])).filter(row => row.monsterId === "sentinel").map(row => row.level), [400]);

const skill = (id, skillKind = "skill") => ({ id, skillKind });
const plain = value => JSON.parse(JSON.stringify(value));
const donor = { monster_id: "sentinel", level: 1 };
const advice = (route, recipient = [], learned = [], record = donor, chosen) => plain(matingAdvice(typedData,
  route, recipient, learned, record, key => key, normalize, chosen));
const normalRoute = { ordinaryNames: ["招集", "カラミティ・ロア"] };
let result = advice(normalRoute);
assert.equal(result.current.length, 0);
assert.deepEqual(result.future, [{ name: "招集", skillKind: "skill", level: 50 }, { name: "カラミティ・ロア", skillKind: "passive", level: 400 }]);
assert.equal(result.remaining, 2);
assert.equal(advice(normalRoute, [], [skill("b")]).current.length, 1);
assert.equal(advice(normalRoute, [], [skill("b")], donor, []).current.length, 0, "An unselected candidate adds nothing");
assert.equal(advice(normalRoute, [], [skill("b")], donor, ["s:b"]).current.length, 1);
assert.equal(advice(normalRoute, [], [skill("b")], donor, ["unknown-key"]).current.length, 1, "Unknown legacy key formats fall back to donor skills");
assert.equal(advice(normalRoute, [skill("b"), skill("c", "passive")]).remaining, 0, "No warning for a completed ordinary route");
assert.deepEqual(advice(normalRoute, [], [], { ...donor, max_level: 100 }).future, [{ name: "招集", skillKind: "skill", level: 50 }]);
assert.deepEqual(advice(normalRoute, [], [], { ...donor, forgotten_skills: ["s:b", "p:c"] }).future, []);
assert.deepEqual(advice(normalRoute, [], [], { ...donor, forgotten_skills: ["p:b"] }).future, result.future, "Forget active/passive independently");
const typedRoute = { ordinaryNames: ["蜂の襲撃"], previewSkillIds: { "蜂の襲撃": "p.a" } };
assert.equal(advice(typedRoute, [skill("a")], [skill("a")]).current.length, 0, "The active namesake is not the requested passive");
assert.equal(advice(typedRoute, [skill("a")], [skill("a", "passive")]).current.length, 1);
assert.equal(advice(typedRoute, [skill("a", "passive")]).remaining, 0);
assert.deepEqual(advice(typedRoute, [skill("a")]).future, [{ name: "蜂の襲撃", skillKind: "passive", level: 400 }]);
assert.equal(advice({ ordinaryNames: ["蜂の襲撃"] }, [skill("a")]).remaining, 0, "Keep name-only legacy route semantics");
const fixedData = { ...typedData, monsters: [{ ...typedData.monsters[0], attack_skill: "a", rank6_unique_skill: "b" }] };
assert.equal(matingAdvice(fixedData, { ordinaryNames: ["蜂の襲撃", "招集", "固有技", "非表示技"] }, [], [skill("a"), skill("b")],
  donor, key => key, normalize).current.length, 0, "Native attacks, unique skills and hidden passives are not inheritance gains");
assert.equal(advice({ ordinaryNames: [], permanentNames: ["カラミティ・ロア"] }).remaining, 0);
assert.equal(advice({ ordinaryNames: typedNames }, [skill("a")]).remaining, 1);
console.log("Training sources: same-name active/passive identity and route mating advice, selected inheritance, future learn levels, caps and forgotten skills verified.");
