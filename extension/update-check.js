function validArkHomuReleaseVersion(version) {
  return typeof version === "string" && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version);
}

function newerArkHomuRelease(candidate, current) {
  if (!validArkHomuReleaseVersion(candidate)) return false;
  const left = candidate.split(".").map(Number);
  const right = current.split(".").map(Number);
  const difference = left.findIndex((part, index) => part !== right[index]);
  return difference >= 0 && left[difference] > right[difference];
}

async function matchesArkHomuReleaseHash(bytes, expected) {
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return actual === expected;
}

function usableArkHomuRuntime(release, currentVersion) {
  if (!newerArkHomuRelease(release?.version, currentVersion) || typeof release.code !== "string" ||
      release.code.length > 1_048_576) return false;
  const start = release.code.slice(0, 2048);
  const end = start.indexOf("// ==/UserScript==");
  const header = start.slice(0, end);
  return end > 0 && header.startsWith("// ==UserScript==\n") &&
    header.match(/^\/\/ @namespace\s+(\S+)$/m)?.[1] === "arkhomu-af-lv4000" &&
    header.match(/^\/\/ @version\s+(\S+)$/m)?.[1] === release.version;
}

function bindArkHomuUserscriptManualCheck(checkNow) {
  let busy = false;
  function publish(text, pending, error = false) {
    busy = pending;
    document.dispatchEvent(new CustomEvent("hako-af:userscript-update-status", {
      detail: JSON.stringify({ text, busy, error })
    }));
  }

  document.addEventListener("click", async event => {
    if (busy || !event.isTrusted ||
        !event.target?.closest?.('[data-ha4-version-check] > button[data-ha4="update-version-button"]')) return;
    const page = location.href;
    let downloading = false;
    publish("更新を確認中…", true);
    try {
      const version = await checkNow(() => {
        downloading = true;
        publish("更新を取得中…", true);
      });
      if (!version) return publish("最新です", false);
      if (page !== location.href) return publish(`v${version} を取得しました`, false);
      publish(`v${version} を取得しました。再読み込みします…`, true);
      setTimeout(() => {
        if (page === location.href) location.reload();
        else publish(`v${version} を取得しました`, false);
      }, 400);
    } catch {
      publish(downloading ? "更新を取得できませんでした" : "更新を確認できませんでした", false, true);
    }
  }, true);
}

function startArkHomuReleaseCheck(distribution, storage, nextCheckKey, lockName, receive, version) {
  const preferenceKey = "hakoAf4000:autoUpdate";
  const hour = 60 * 60 * 1000;
  const interval = 2 * hour;
  const scheduleKey = nextCheckKey + ":2h";
  const installedKey = nextCheckKey + ":installed";
  const lastCheckKey = nextCheckKey + ":last-check";
  let checking;
  let manualCheck;
  let nextCheck = 0;
  let timer;
  let pending;

  function enabled() {
    try { return localStorage.getItem(preferenceKey) !== "false"; } catch { return false; }
  }

  async function publishHistory() {
    try {
      const [installed, check] = await Promise.all([
        storage.getValue(installedKey, null), storage.getValue(lastCheckKey, null)
      ]);
      document.dispatchEvent(new CustomEvent("hako-af:update-history", {
        detail: JSON.stringify({ installed, check })
      }));
    } catch { /* Keep the current display if storage is temporarily unavailable. */ }
  }

  async function recordInstalled() {
    if (!validArkHomuReleaseVersion(version)) return;
    const previous = await storage.getValue(installedKey, null);
    const known = validArkHomuReleaseVersion(previous?.version);
    if (known && !newerArkHomuRelease(version, previous.version)) return;
    await storage.setValue(installedKey, { version, at: Date.now(), initial: !known });
    await publishHistory();
  }

  async function performCheck(fetchRelease, isEnabled, manual) {
    const at = Date.now();
    let successful = false;
    try {
      const result = await receive(fetchRelease, isEnabled, manual);
      successful = true;
      return result;
    } finally {
      try { await storage.setValue(lastCheckKey, { at, successful }); } catch { /* Downloads can proceed. */ }
      await publishHistory();
    }
  }

  async function fetchFile(path, maxLength, manual = false) {
    if (!manual && !enabled()) throw new Error("Automatic updates disabled");
    const controller = new AbortController();
    if (!manual) pending = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(distribution + path, {
        cache: "no-cache",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: controller.signal
      });
      if (!response.ok || Number(response.headers.get("content-length")) > maxLength) throw new Error("Invalid update response");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxLength) throw new Error("Update exceeds the size limit");
      return bytes;
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = undefined;
    }
  }

  async function downloadIfDue() {
    if (document.hidden || !enabled()) return;
    const now = Date.now();
    let storedCheck = await storage.getValue(scheduleKey, 0);
    if (!storedCheck) {
      // Older versions recorded a due time 24 hours after the last automatic check.
      const previousDue = await storage.getValue(nextCheckKey, 0);
      if (previousDue > now && previousDue <= now + 24 * hour) storedCheck = previousDue - 24 * hour + interval;
      if (storedCheck > now) await storage.setValue(scheduleKey, storedCheck);
    }
    if (storedCheck > now && storedCheck <= now + interval) {
      nextCheck = storedCheck;
      return;
    }
    nextCheck = now + interval;
    await storage.setValue(scheduleKey, nextCheck);
    await performCheck(fetchFile, enabled);
  }

  function refresh() {
    clearTimeout(timer);
    if (!enabled()) {
      pending?.abort();
      return;
    }
    if (document.hidden || checking || manualCheck) return;
    const wait = nextCheck - Date.now();
    if (wait > 0) timer = setTimeout(refresh, Math.min(interval, wait + 20));
    else void check();
  }

  function locked(task) {
    // Serialize checks from simultaneously opened game tabs.
    return navigator.locks ? navigator.locks.request(lockName, task) : task();
  }

  function check() {
    checking = Promise.resolve().then(() => locked(downloadIfDue)).catch(() => {
      if (Date.now() >= nextCheck) nextCheck = Date.now() + interval;
    }).finally(() => {
      checking = null;
      refresh();
    });
  }

  function checkNow(progress) {
    if (manualCheck) return manualCheck;
    const fetchManually = (path, maxLength) => fetchFile(path, maxLength, true);
    manualCheck = Promise.resolve(checking).then(() => locked(() =>
      performCheck(fetchManually, () => true, { progress }))).finally(() => {
      manualCheck = null;
      refresh();
    });
    return manualCheck;
  }

  document.addEventListener("hako-af:read-update-history", publishHistory);
  void Promise.resolve().then(() => locked(recordInstalled)).catch(() => {});
  document.addEventListener("visibilitychange", refresh);
  document.addEventListener("hako-af:auto-update-changed", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("storage", event => { if (!event.key || event.key === preferenceKey) refresh(); });
  refresh();
  return { checkNow };
}
