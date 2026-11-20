function startArkHomuUpdates(distribution, bundledVersion, bundledCode) {
  "use strict";
  if (window.top !== window.self || location.origin !== "https://arkhomu.com") return;

  const manager = typeof GM === "object" && GM;
  const releaseKey = "arkhomu-af-release";
  const maxScriptLength = 1_048_576;
  const storage = {
    getValue: (key, fallback) => waitForArkHomuUpdate(() => manager.getValue(key, fallback), 5_000),
    setValue: (key, value) => waitForArkHomuUpdate(() => manager.setValue(key, value), 10_000)
  };
  let activeVersion = bundledVersion;
  let readyVersion = null;

  function reportReady() {
    document.dispatchEvent(new CustomEvent("hako-af:userscript-update-ready", { detail: readyVersion }));
  }

  function run(code, canUpdate) {
    const root = document.head ?? document.documentElement;
    if (!root) {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        observer.disconnect();
        run(code, canUpdate);
      });
      observer.observe(document, { childList: true });
      return;
    }
    const script = document.createElement("script");
    script.dataset.hakoAfUpdateManaged = String(canUpdate);
    script.dataset.hakoAfUserscriptManualUpdate = String(canUpdate);
    script.textContent = code;
    root.append(script);
    script.remove();
  }

  async function receive(fetchFile, enabled, manual) {
    const decoder = new TextDecoder();
    const { version, sha256 } = JSON.parse(decoder.decode(await fetchFile("runtime.json", 4096)));
    if (!validArkHomuReleaseVersion(version)) throw new Error("Invalid release version");
    if (!newerArkHomuRelease(version, activeVersion)) return null;
    const cached = await storage.getValue(releaseKey, null);
    if (usableArkHomuRuntime(cached, bundledVersion) && !newerArkHomuRelease(version, cached.version)) return cached.version;
    manual?.progress();
    const bytes = await fetchFile("runtime.js", maxScriptLength);
    manual?.progress("verify");
    const code = decoder.decode(bytes);
    if (!usableArkHomuRuntime({ version, code }, bundledVersion) || !await matchesArkHomuReleaseHash(bytes, sha256))
      throw new Error("Invalid update script");
    if (!enabled()) return null;
    manual?.progress("save");
    await storage.setValue(releaseKey, { version, code });
    return version;
  }

  async function start() {
    let cached;
    const canUpdate = typeof manager?.getValue === "function" && typeof manager?.setValue === "function";
    if (canUpdate) {
      try { cached = await storage.getValue(releaseKey, null); } catch { /* Use the bundled script. */ }
    }
    const cachedRelease = usableArkHomuRuntime(cached, bundledVersion) ? cached : null;
    activeVersion = cachedRelease?.version ?? bundledVersion;
    if (canUpdate) {
      document.addEventListener("hako-af:read-userscript-update", reportReady);
      const updates = startArkHomuReleaseCheck(distribution, storage, "arkhomu-af-next-check",
        "arkhomu-af-auto-update", async (fetchFile, enabled, manual) => {
          const version = await receive(fetchFile, enabled, manual);
          if (version && !manual) {
            readyVersion = version;
            reportReady();
          }
          return version;
        }, activeVersion, { browserLocks: false });
      bindArkHomuUserscriptManualCheck(progress => updates.checkNow(progress).catch(error => {
        if (readyVersion) return readyVersion;
        throw error;
      }));
    }
    run(cachedRelease?.code ?? bundledCode, canUpdate);
  }

  void start();
}
