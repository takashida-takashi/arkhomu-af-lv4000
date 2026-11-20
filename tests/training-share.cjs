const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const scope = { Blob, Response, CompressionStream, DecompressionStream, Uint8Array, TextDecoder,
  btoa, atob, location: { origin: "https://arkhomu.com" } };
vm.createContext(scope);
const source = fs.readFileSync(path.join(__dirname, "../extension/party-share.js"), "utf8");
vm.runInContext(source.replace("globalThis.hakoAfPartyShare = { start };",
  "globalThis.api = { validated, validatedTrainingRoute, compactParty, expandLink, shareLink, readLink, skillGroups, skillLabel };"), scope);
const api = scope.api, plain = value => JSON.parse(JSON.stringify(value));
const route = { id: "private-route", name: "探索用の完成目標", group: "探索編成", baseMonsterId: "hive_sentinel",
  ordinary: ["蜂の襲撃【アクティブ】", "蜂の襲撃【パッシブ】"], permanent: ["原初の血宴【アクティブ】"],
  reserved: ["蜂の襲撃【パッシブ】"], rank6Passive: { id: "bee_body", name: "蜂の統率", enabled: false },
  previewSkillIds: { "蜂の襲撃【アクティブ】": "s.bee_assault", "蜂の襲撃【パッシブ】": "p.bee_assault",
    "原初の血宴【アクティブ】": "s.primordial_blood_feast" },
  preview: { skillLevels: { "s.primordial_blood_feast": 10, "p.bee_body": 5, "p.unrelated": 10 },
    allies: ["private-ally"], afs: [{ user_artifact_id: "private-af" }] } };
const member = { name: "育成中のホム", portrait: "hive_sentinel", level: 1, active: [], passive: [], trainingRoute: route };
const party = { version: 1, individual: true, name: route.name, slots: [member, null, null, null, null, null] };
(async () => {
  const input = JSON.stringify(route), validated = plain(api.validated(party));
  const portable = validated.slots[0].trainingRoute;
  assert.equal(JSON.stringify(route), input, "Sharing does not mutate saved routes");
  assert.equal(portable.id, undefined, "Local route IDs must not be shared");
  assert.deepEqual(portable.ordinary, route.ordinary);
  assert.deepEqual(portable.reserved, route.reserved);
  assert.deepEqual(portable.rank6Passive, route.rank6Passive);
  assert.deepEqual(portable.preview, { skillLevels: { "s.primordial_blood_feast": 10, "p.bee_body": 5 } });
  assert.doesNotMatch(JSON.stringify(portable), /private-|unrelated/);
  assert.deepEqual(plain(api.validated(api.expandLink(api.compactParty(validated)))), validated);
  const link = await api.shareLink(validated);
  assert.deepEqual(plain(await api.readLink(new URL(link).hash)), validated);
  const groups = plain(api.skillGroups(member));
  assert.deepEqual(groups.map(([title]) => title), ["通常スキル（完成目標）", "永久スキル（完成目標）", "控え"]);
  assert.deepEqual(groups[2][1], [{ name: "蜂の襲撃【パッシブ】", permanent: false }]);
  assert.equal(api.skillLabel(groups[1][1][0], validated.slots[0]), "原初の血宴【アクティブ】 Lv10");
  const legacy = { version: 1, individual: true, name: "従来の個体", slots: [
    { name: "ホム", active: [{ name: "通常技", permanent: false }, { name: "控え", reserved: true, permanent: true }], passive: [] },
    null, null, null, null, null] };
  const old = plain(api.validated(legacy));
  assert.deepEqual(plain(api.validated(api.expandLink(api.compactParty(old)))), old);
  assert.deepEqual(plain(await api.readLink(new URL(await api.shareLink(old)).hash)), old);
  assert.equal(Object.hasOwn(api.validatedTrainingRoute({ name: "旧ルート", ordinary: ["種別未指定"], permanent: [] }), "reserved"), false);
  assert.deepEqual(plain(api.validatedTrainingRoute({ ...route, reserved: [] }).reserved), []);
  assert.throws(() => api.validatedTrainingRoute({ ...route, ordinary: Array.from({length: 38}, (_, i) => "技" + i), reserved: [] }), /Too many/);
  assert.throws(() => api.validatedTrainingRoute({ ...route, ordinary: [{ name: "不正" }] }), /Invalid text/);
  assert.throws(() => api.expandLink([3, "不正", true, party.slots, [], []]), /Invalid unique skills/);
  console.log("Training share: link/file and compact round trips, typed names, reserves, levels, R6, legacy data, limits and private-ID exclusion passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
