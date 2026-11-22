const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const scope = {};
vm.createContext(scope);
const source = fs.readFileSync(path.join(__dirname, "../extension/guild-dungeon-main.js"), "utf8");
vm.runInContext(source.replace("globalThis.hakoAfGuildDungeonMain = { startScan };",
  "globalThis.api = { nativeOrder, rowData };"), scope);
const make = id => ({ id, guildId: id, is_guild: true, name: id });
const [a,b,c,d] = ["A","B","C","D"].map(make);
const groups = [{ entries: [a,c] }, { entries: [b,d] }];
const raw = { _value: [b,d,a,c] }, grouped = { _value: groups, refs: [raw] };
const deps = ref => ref?.refs ?? [], plain = order => JSON.parse(JSON.stringify([...order]));
const flex = { effect: { refs: [grouped] } };
const classic = { effect: { refs: [] }, parent: flex };
const expected = [["B",0],["D",1],["A",2],["C",3]];
assert.deepEqual(plain(scope.api.nativeOrder(flex,groups,deps)),expected);
assert.deepEqual(plain(scope.api.nativeOrder(classic,groups,deps)),expected);
raw._value = [c,a,d,b];
assert.deepEqual(plain(scope.api.nativeOrder(flex,groups,deps)),[["C",0],["A",1],["D",2],["B",3]],"Follow native sort changes");
raw._value = [b,d,a,c,make("unrelated")];
assert.deepEqual(plain(scope.api.nativeOrder(flex,groups,deps)),expected,"Ignore unrelated non-displayed entries");
grouped.refs = [{_value:[a,b]}, { _value: [d,b,c,a] }];
assert.deepEqual(plain(scope.api.nativeOrder(flex,groups,deps)),[["D",0],["B",1],["C",2],["A",3]],"A partial source cannot replace the whole list");
assert.deepEqual(plain(scope.api.nativeOrder({},groups,deps)),[["A",0],["C",1],["B",2],["D",3]],"Unknown layouts keep a stable fallback");
assert.equal(JSON.parse(scope.api.rowData(a,value=>value,0)).nativeOrder,0);
assert.equal(JSON.parse(scope.api.rowData(a,value=>value,3)).nativeOrder,3,"Refresh cached snapshots when native positions change");
a.summary = { todayClosed: false };
assert.equal(JSON.parse(scope.api.rowData(a,value=>value,3)).todayClosed,"0");
a.summary.todayClosed = true;
assert.equal(JSON.parse(scope.api.rowData(a,value=>value,3)).todayClosed,"1","Refresh a challenge that ends without replacing the entry");
console.log("Guild global order: classic/flex native order, sort changes, source matching, fallback and snapshot invalidation passed.");

const ui = { hakoAfFeatureNames: { filter: "拡張フィルタ" }, hakoAfListRules: {} };
vm.createContext(ui);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/guild-dungeon-filter.js"), "utf8")
  .replace("globalThis.hakoAfGuildDungeonFilter = { start };", "globalThis.listSort = listSort;"), ui);
let selects = [{ value: "fee_low", closest: () => null }];
const list = { querySelectorAll: () => selects }, state = { combineNations: true, sortKey: "", sortDirection: "asc" };
const sort = () => JSON.parse(JSON.stringify(ui.listSort(list, state)));
assert.deepEqual(sort(), { key: "entryFee", direction: "asc" }, "A country-only native layout sorts nationwide fees directly");
state.combineNations = false;assert.equal(sort().key, "", "Preserve native country grouping when disabled");
state.combineNations = true;state.sortKey = "bossStars";state.sortDirection = "desc";
assert.deepEqual(sort(), { key: "bossStars", direction: "desc" }, "Explicit extension sorting takes priority");
state.sortKey = "";selects = [{ value: "renamed", selectedOptions: [{ textContent: " 入場料の安い順 " }], closest: () => null }];
assert.equal(sort().key, "entryFee", "Recognize the native label when its internal value changes");
selects = [{ value: "fee_low", closest: () => ({}) }];assert.equal(sort().key, "", "Do not mistake a popup's select for the native sort");
a.summary = { entryFee: 8000000, specialEntryFee: 12000000, specialToday: true };
assert.equal(JSON.parse(scope.api.rowData(a,value=>value,0)).entryFee,12000000);
a.summary.specialToday = false;assert.equal(JSON.parse(scope.api.rowData(a,value=>value,0)).entryFee,8000000);
a.summary = { entryFee: 0, specialEntryFee: 0 };assert.equal(JSON.parse(scope.api.rowData(a,value=>value,0)).entryFee,0,"Free admission is a real zero");
console.log("National fee order: current-day fees, free admission, country-only data, native labels and extension-sort priority passed.");

// Observe native browse responses without requesting or reconstructing server rankings.
(async () => {
  const document = new EventTarget(), window = new EventTarget(), requests = [], responses = [];
  const observed = { document, window, Event, console, localStorage: { getItem: () => null },
    $fetch: (url, options) => { requests.push({ url, options }); return responses.shift(); } };
  vm.createContext(observed);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/market-snapshot.js"), "utf8"), observed);
  vm.runInContext(source.replace("globalThis.hakoAfGuildDungeonMain = { startScan };", "globalThis.api = { nativeOrder };"), observed);
  const rawRow = (id, slot = 1) => ({ guild_id: id, slot, published: {} });
  const read = mode => observed.api.nativeOrder(flex, groups, deps, {
    querySelectorAll: () => [{ value: mode, closest: () => null }]
  });
  const call = async (sort, rows, cursor) => {
    const response = Promise.resolve({ rows });responses.push(response);
    const returned = observed.$fetch("/api/guild-dungeons/browse", { query: { sort, ...(cursor ? { cursor } : {}) } });
    assert.equal(returned, response, "The native caller receives its original promise");
    await returned;
    await new Promise(setImmediate);
  };
  const modes = ["new", "prize", "today_visits", "lottery", "review", "trial_low", "trial_high", "fee_low", "bookmark"];
  for (const [index, mode] of modes.entries()) {
    const ids = index % 2 ? ["C", "B", "A", "D"] : ["B", "D", "A", "C"];
    await call(mode, ids.map(id => rawRow(id)));
    assert.deepEqual(plain(read(mode)), groups.flatMap(group => group.entries).map(row => [row.id, ids.indexOf(row.id)]), mode);
  }
  await call("bookmark", [rawRow("C"), rawRow("A"), rawRow("C")], "page2");
  assert.equal(observed.hakoAfGuildBrowseOrder.positions.size, 4, "Paginated duplicates retain their first position");
  assert.deepEqual([...read("review")].map(([id]) => id), ["D", "B", "C", "A"], "Do not apply cached rankings to another sort");
  let resolveOld;
  responses.push(new Promise(resolve => { resolveOld = resolve; }));
  const old = observed.$fetch("/api/guild-dungeons/browse", { query: { sort: "new" } });
  await call("review", [rawRow("D"), rawRow("B")]);
  resolveOld({ rows: [rawRow("A")] });await old;await new Promise(setImmediate);
  assert.equal(observed.hakoAfGuildBrowseOrder.sort, "review", "A stale response cannot overwrite the current sort");
  assert.deepEqual([...observed.hakoAfGuildBrowseOrder.positions.keys()], ["D", "B"]);
  await call("review", [rawRow("B"), rawRow("C"), rawRow("C")], "page2");
  assert.deepEqual(plain(observed.hakoAfGuildBrowseOrder.positions), [["D",0],["B",1],["C",2]]);
  await call("new", [rawRow("A", 2), rawRow("A"), rawRow("D")]);
  const slots = [{ entries: [{ ...a, id: "guild:A:2", slot: 2 }, a, d, { ...b, summary: { sessionId: "active" } }] }];
  assert.deepEqual(plain(observed.api.nativeOrder({}, slots, deps, { querySelectorAll: () => [{ value: "new", closest: () => null }] })),
    [["guild:A:2",0],["A",1],["D",2],["B",6]], "Slots stay distinct and entries absent from browse have a stable fallback");
  assert.equal(requests.length, modes.length + 5, "Observation issues no additional browse requests");
  console.log("Guild national order: all nine native sorts, pagination, duplicate rows, stale responses, slots and passive observation passed.");
})().catch(error => { console.error(error);process.exitCode = 1; });
