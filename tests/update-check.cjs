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
  const context = { crypto: webcrypto, Uint8Array: wrappedTypedArray };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../extension/update-check.js"), "utf8"), context);
  const binary = Buffer.alloc(900000);
  for (let i = 0; i < binary.length; i++) binary[i] = i % 256;
  for (const bytes of [Buffer.alloc(0), Buffer.from("abc"), Buffer.from("日本語\r\n🙂"), binary]) {
    const expected = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await context.matchesArkHomuReleaseHash(bytes, expected), true);
    assert.equal(await context.matchesArkHomuReleaseHash(bytes, "0".repeat(64)), false);
  }
  assert.equal(await context.matchesArkHomuReleaseHash(Buffer.from("abc"), "invalid"), false);
  console.log("Update integrity: cross-realm SHA-256 checks pass with Xray indexed reads forbidden; altered hashes reject.");
})().catch(error => { console.error(error); process.exitCode = 1; });
