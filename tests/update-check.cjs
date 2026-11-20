const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");

// Reproduce Firefox's denial of indexed TypedArray reads across a userscript boundary.
// Data returned by crypto originates in a different realm from the verifier.
function wrappedTypedArray(...args) {
  const bytes = new Uint8Array(...args);
  let wrapped;
  wrapped = new Proxy(bytes, { get(target, key) {
    if (typeof key === "string" && /^\d+$/.test(key)) throw new Error("Xray indexed TypedArray access denied");
    if (key === Symbol.iterator) return function* () { for (let i = 0; i < target.length; i++) yield wrapped[i]; };
    return Reflect.get(target, key, target);
  } });
  return wrapped;
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../extension/update-check.js"), "utf8");
  const context = { crypto: webcrypto, Uint8Array: wrappedTypedArray, navigator: {}, DOMException };
  vm.createContext(context);
  vm.runInContext(source, context);
  const binary = Buffer.alloc(900000);
  for (let i = 0; i < binary.length; i++) binary[i] = i % 256;
  for (const bytes of [Buffer.alloc(0), Buffer.from("abc"), Buffer.from("日本語\r\n🙂"), binary]) {
    const expected = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await context.matchesArkHomuReleaseHash(bytes, expected), true);
    assert.equal(await context.matchesArkHomuReleaseHash(bytes, "0".repeat(64)), false);
  }
  assert.equal(await context.matchesArkHomuReleaseHash(Buffer.from("abc"), "invalid"), false);
  const lock = context.withArkHomuUpdateLock;
  let calls = 0;
  const task = () => { calls++; return "downloaded"; };
  assert.equal(await lock("fixture", task), "downloaded");
  for (const name of ["AbortError", "SecurityError", "NotSupportedError", "TypeError"]) {
    context.navigator.locks = { request() { return Promise.reject(new DOMException("Unavailable in this context", name)); } };
    const previous = calls;
    assert.equal(await lock("fixture", task, new AbortController().signal), "downloaded");
    assert.equal(calls, previous + 1, `${name}: lock failure does not prevent the update`);
  }
  Object.defineProperty(context.navigator, "locks", { configurable: true, get() { throw new DOMException("Denied", "SecurityError"); } });
  assert.equal(await lock("fixture", task), "downloaded", "A denied property lookup also falls back");
  delete context.navigator.locks;
  context.navigator.locks = { request(_name, options, callback) { return (callback ?? options)(); } };
  const failedUpdate = new DOMException("Update cancelled", "AbortError");
  const previous = calls;
  await assert.rejects(lock("fixture", () => { calls++; throw failedUpdate; }), error => error === failedUpdate);
  assert.equal(calls, previous + 1, "An update that already started is never run twice");
  const controller = new AbortController();
  let pending, requested = 0;
  context.navigator.locks = { request(_name, options, callback) {
    requested++;
    pending = callback;
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  } };
  const stopped = lock("fixture", task, controller.signal);
  controller.abort();
  await assert.rejects(stopped, error => error.name === "AbortError");
  assert.throws(pending, error => error.name === "AbortError");
  assert.equal(calls, previous + 1, "Aborted lock waits cannot start a late download");
  await assert.rejects(lock("fixture", task, controller.signal), error => error.name === "AbortError");
  assert.equal(requested, 1, "Already cancelled requests never acquire a lock");

  let foreignPromises = 0, browserLocks = 0;
  const foreignPromise = new Proxy(vm.runInNewContext("Promise"), {
    get() { foreignPromises++; throw new Error('Permission denied to access property "then"'); },
    construct() { foreignPromises++; throw new Error('Permission denied to access property "then"'); }
  });
  const listeners = new Map(), events = [], stored = new Map();
  const sandbox = {
    Promise: foreignPromise, DOMException, AbortController, setTimeout, clearTimeout, console,
    navigator: {}, localStorage: { getItem: () => "false" },
    window: { addEventListener() {}, location: {} }, location: { href: "https://arkhomu.com/" },
    document: { hidden: false,
      addEventListener(name, callback) { listeners.set(name, callback); },
      dispatchEvent(event) { events.push(event); }
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  Object.defineProperty(sandbox.navigator, "locks", { get() {
    browserLocks++; throw new Error('Permission denied to access property "then"');
  } });
  Object.defineProperty(sandbox.window, "Promise", { get() {
    foreignPromises++; throw new Error('Permission denied to access property "then"');
  } });
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  let received = 0;
  const updater = sandbox.startArkHomuReleaseCheck("https://example.invalid/", {
    async getValue(key, fallback) { return stored.get(key) ?? fallback; },
    async setValue(key, value) { stored.set(key, value); }
  }, "fixture-check", "fixture-lock", async () => { received++; return "3.2.25"; }, "3.2.24", { browserLocks: false });
  assert.equal(await updater.checkNow(), "3.2.25");
  assert.equal(received, 1, "Managed update proceeds exactly once with browser APIs inaccessible");
  assert.equal(browserLocks, 0, "Userscript mode never reads or invokes the browser lock API");
  assert.equal(foreignPromises, 0, "Update jobs never use a page/manager-owned Promise constructor");
  sandbox.bindArkHomuUserscriptManualCheck(async () => null);
  const result = listeners.get("click")({ isTrusted: true, target: { closest: () => ({}) } });
  assert.equal(result, undefined, "DOM click listeners never return a privileged Promise to the browser");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(JSON.parse(events.filter(event => event.type === "hako-af:userscript-update-status").at(-1).detail).text, "最新です");
  assert.equal(listeners.get("hako-af:read-update-history")(), undefined, "History events also return no Promise");
  console.log("Update integrity: cross-realm SHA-256 checks pass with Xray indexed reads forbidden; altered hashes reject.");
  console.log("Update locks: missing/denied/aborted browser API falls back; task failures and real cancellations never retry or start late work.");
  console.log("Managed updates: no browser locks, no foreign Promise constructor, no Promise returned by DOM callbacks; manual update and latest status passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
