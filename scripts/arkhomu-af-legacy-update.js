function startArkHomuLegacyUpdates(distribution, version, forwarded) {
  "use strict";

  // An older installer can load a new runtime, but has no manual bridge to its private GM storage.
  const requestedKey = "hakoAf4000:legacy-runtime-version";
  const scheduleKey = "hakoAf4000:legacy-update-check";
  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  const storage = {
    async getValue(key, fallback) {
      try { return JSON.parse(read(key)) ?? fallback; } catch { return fallback; }
    },
    async setValue(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  async function fetchFile(file, limit, signal, cache = "no-cache") {
    const response = await fetch(distribution + file, {
      signal, cache, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error"
    });
    if (!response.ok || Number(response.headers.get("content-length")) > limit) throw new Error("Invalid update response");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > limit) throw new Error("Update exceeds the size limit");
    return bytes;
  }

  async function receive(minimum, progress, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const decoder = new TextDecoder();
      const meta = JSON.parse(decoder.decode(await fetchFile("runtime.json", 4096, controller.signal)));
      if (!validArkHomuReleaseVersion(meta?.version)) throw new Error("Invalid update version");
      if (!newerArkHomuRelease(meta.version, version) || newerArkHomuRelease(minimum, meta.version)) return null;
      if (minimum && read("hakoAf4000:autoUpdate") === "false" && meta.version !== minimum) return null;
      progress?.();
      // Keep only a version in site storage. Run code fetched over HTTPS from the distribution with a verified hash.
      const file = "runtime.js?v=" + encodeURIComponent(meta.version);
      let bytes = await fetchFile(file, 1_048_576, controller.signal, "default");
      if (!await matchesArkHomuReleaseHash(bytes, meta.sha256)) {
        bytes = await fetchFile(file, 1_048_576, controller.signal, "reload");
        if (!await matchesArkHomuReleaseHash(bytes, meta.sha256)) throw new Error("Invalid update hash");
      }
      const release = { version: meta.version, code: decoder.decode(bytes) };
      if (!usableArkHomuRuntime(release, version)) throw new Error("Invalid update runtime");
      return release;
    } finally {
      clearTimeout(timer);
    }
  }

  function bind() {
    let ready = null;
    function publish() {
      document.dispatchEvent(new CustomEvent("hako-af:userscript-update-ready", { detail: ready }));
    }
    document.addEventListener("hako-af:read-userscript-update", publish);
    const updates = startArkHomuReleaseCheck(distribution, storage, scheduleKey, "arkhomu-af-legacy-auto-update",
      async (_fetchFile, enabled, manual) => {
        const release = await receive(null, manual?.progress, 12_000);
        if (!release || !enabled()) return null;
        const pending = read(requestedKey);
        if (newerArkHomuRelease(pending, release.version)) return pending;
        localStorage.setItem(requestedKey, release.version);
        if (!manual) {
          ready = release.version;
          publish();
        }
        return release.version;
      }, version);
    bindArkHomuUserscriptManualCheck(progress => updates.checkNow(progress));
  }

  const requested = read(requestedKey);
  if (!forwarded && newerArkHomuRelease(requested, version)) {
    return receive(requested, null, 7000).then(release => {
      if (!release) return false;
      const script = document.createElement("script");
      script.dataset.hakoAfUpdateManaged = "true";
      script.dataset.hakoAfLegacyForwarded = "true";
      script.textContent = release.code;
      (document.head ?? document.documentElement).append(script);
      script.remove();
      return true;
    }).catch(() => false).then(loaded => {
      if (!loaded) bind();
      return loaded;
    });
  }
  if (!forwarded && requested) {
    try { localStorage.removeItem(requestedKey); } catch { /* The current version is already installed. */ }
  }
  bind();
  return null;
}
