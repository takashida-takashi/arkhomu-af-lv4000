const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
function anchor() {
  const values = new Map();
  const element = { nodeType: 1, isConnected: true, querySelector: () => null,
    setAttribute: (key, value) => values.set(key, value), removeAttribute: key => values.delete(key),
    hasAttribute: key => values.has(key), getAttribute: key => values.get(key) ?? null,
    toggleAttribute: (key, on) => on ? values.set(key, "") : values.delete(key) };
  element.dataset = new Proxy({}, { get: (_target, key) => values.get(key === "ha4TrainingTarget" ? "data-ha4-training-target" : key),
    set: (_target, key, value) => { values.set(key === "ha4TrainingTarget" ? "data-ha4-training-target" : key, value); return true; } });
  return element;
}
const notices = [], watches = [], store = { monsters: [] }, header = anchor(), root = anchor();
root.firstElementChild = header;
const app = { config: { globalProperties: { $pinia: { _s: new Map([["userMonsters", store]]) } } } };
const scope = { Event, location: { pathname: "/monsters" }, document: { addEventListener() {},
  getElementById: () => ({ __vue_app__: app }), dispatchEvent: event => notices.push(event.type) } };
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/party-share-main.js"), "utf8"), scope);
const api = scope.hakoAfPartyShareMain;
const instance = { subTree: { el: root }, proxy: { $watch(get, changed, options) { watches.push({ get, changed, options }); } } };
const props = { monster: { user_monster_id: "one", level: 80, m_monsters: { name_key: "FOX" } }, maskSkills: false };
const bind = () => api.bindMember("MonsterDetailPanel", props, { component: instance }, store.monsters, key => key);
assert.equal(bind(), undefined);
assert.equal(header.hasAttribute("data-ha4-stat-member"), true);
assert.equal(header.hasAttribute("data-ha4-share-member"), false);
assert.equal(watches.length, 1, "A detail watches ownership data independently of DOM mutations");
assert.equal(watches[0].options.flush, "post");
const events = notices.length;
bind(); assert.equal(notices.length, events, "Unchanged scans do not request another scan");
store.monsters = [{ ...props.monster }];
watches[0].changed();
assert.equal(header.hasAttribute("data-ha4-share-member"), true);
assert.equal(JSON.parse(header.getAttribute("data-ha4-training-target")).id, "one");
assert.equal(notices.length, events + 1);
props.maskSkills = true; watches[0].changed();
assert.equal(header.hasAttribute("data-ha4-share-member"), false);
assert.equal(header.hasAttribute("data-ha4-stat-member"), true);
assert.equal(header.hasAttribute("data-ha4-training-target"), false);
props.maskSkills = false;
props.monster = { user_monster_id: "two", level: 100, m_monsters: { name_key: "BEE" } };
store.monsters.push(props.monster);
const replaced = anchor(); root.firstElementChild = replaced;
watches[0].changed();
assert.equal(header.hasAttribute("data-ha4-stat-member"), false, "A replaced header loses its old binding");
assert.equal(JSON.parse(replaced.getAttribute("data-ha4-training-target")).id, "two");
assert.equal(watches.length, 1, "Reuse does not create duplicate component watchers");
assert.ok(notices.every(name => name === "hako-af:member-ready"));
console.log("Member actions: late ownership, post-render readiness, no notification loop, masked details and reused header selection passed.");
