function startArkHomuUpdates(distribution, bundledVersion, bundledCode) {
  "use strict";
  if (window.top !== window.self || location.origin !== "https://arkhomu.com") return;

  const manager = typeof GM === "object" && GM;
  const releaseKey = "arkhomu-af-release";
  const maxScriptLength = 1_048_576;

  function usable(release) {
    if (!newerArkHomuRelease(release?.version, bundledVersion) || typeof release.code !== "string" ||
        release.code.length > maxScriptLength) return false;
    const start = release.code.slice(0, 2048);
    const end = start.indexOf("// ==/UserScript==");
    const header = start.slice(0, end);
    return end > 0 && header.startsWith("// ==UserScript==\n") &&
      header.match(/^\/\/ @namespace\s+(\S+)$/m)?.[1] === "arkhomu-af-lv4000" &&
      header.match(/^\/\/ @version\s+(\S+)$/m)?.[1] === release.version;
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
    script.textContent = code;
    root.append(script);
    script.remove();
  }

  async function receive(fetchFile, enabled) {
    const decoder = new TextDecoder();
    const { version, sha256 } = JSON.parse(decoder.decode(await fetchFile("runtime.json", 4096)));
    if (!newerArkHomuRelease(version, bundledVersion)) return;
    const cached = await manager.getValue(releaseKey, null);
    if (usable(cached) && !newerArkHomuRelease(version, cached.version)) return;
    const bytes = await fetchFile("runtime.js", maxScriptLength);
    const code = decoder.decode(bytes);
    if (usable({ version, code }) && await matchesArkHomuReleaseHash(bytes, sha256) && enabled()) {
      await manager.setValue(releaseKey, { version, code });
    }
  }

  async function start() {
    let cached;
    const canUpdate = typeof manager?.getValue === "function" && typeof manager?.setValue === "function";
    if (canUpdate) {
      try { cached = await manager.getValue(releaseKey, null); } catch { /* Use the bundled script. */ }
    }
    run(usable(cached) ? cached.code : bundledCode, canUpdate);
    if (canUpdate) startArkHomuReleaseCheck(distribution, manager, "arkhomu-af-next-check", "arkhomu-af-auto-update", receive);
  }

  void start();
}
