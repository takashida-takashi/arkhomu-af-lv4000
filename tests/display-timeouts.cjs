const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
let opens = 0, late, closed = 0;
const scope = { setTimeout: (callback, _ms) => setTimeout(callback, 10), clearTimeout,
  document: { addEventListener() {} }, indexedDB: { open() { opens++; return late = {}; } } };
vm.createContext(scope);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/training-sources-main.js"), "utf8"), scope);
(async () => {
  const api = scope.hakoAfTrainingSources;
  const first = api.readMasters("fixture");
  assert.equal(api.readMasters("fixture"), first, "Concurrent UI readers share one in-flight read");
  assert.equal(await first, null, "An unresponsive database reaches an unavailable state instead of loading forever");
  late.result = { close: () => closed++ };
  late.onsuccess();
  assert.equal(closed, 1, "A database opening after timeout is closed");
  const retry = api.readMasters("fixture");
  assert.equal(opens, 2, "Timeout clears the pending read so reopening can retry");
  late.result = { objectStoreNames: { contains: () => false }, close: () => closed++ };
  late.onsuccess();
  assert.equal(await retry, null);
  assert.equal(closed, 2);
  scope.indexedDB.open = () => { throw new Error("Database permission denied"); };
  assert.equal(await api.readMasters("fixture"), null, "A synchronously denied database also settles and clears its timer");
  console.log("Display loading: bounded master reads, shared pending work, late connection cleanup and retry after failure passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
