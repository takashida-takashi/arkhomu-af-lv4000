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

function startArkHomuReleaseCheck(distribution, storage, nextCheckKey, lockName, receive) {
  const preferenceKey = "hakoAf4000:autoUpdate";
  const day = 24 * 60 * 60 * 1000;
  let checking;
  let manualCheck;
  let nextCheck = 0;
  let timer;
  let pending;

  function enabled() {
    try { return localStorage.getItem(preferenceKey) !== "false"; } catch { return false; }
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
    const storedCheck = await storage.getValue(nextCheckKey, 0);
    if (storedCheck > now && storedCheck <= now + day) {
      nextCheck = storedCheck;
      return;
    }
    nextCheck = now + day;
    await storage.setValue(nextCheckKey, nextCheck);
    await receive(fetchFile, enabled);
  }

  function refresh() {
    clearTimeout(timer);
    if (!enabled()) {
      pending?.abort();
      return;
    }
    if (document.hidden || checking || manualCheck) return;
    const wait = nextCheck - Date.now();
    if (wait > 0) timer = setTimeout(refresh, Math.min(day, wait + 20));
    else void check();
  }

  function locked(task) {
    // Serialize checks from simultaneously opened game tabs.
    return navigator.locks ? navigator.locks.request(lockName, task) : task();
  }

  function check() {
    checking = Promise.resolve().then(() => locked(downloadIfDue)).catch(() => {
      if (Date.now() >= nextCheck) nextCheck = Date.now() + day;
    }).finally(() => {
      checking = null;
      refresh();
    });
  }

  function checkNow(progress) {
    if (manualCheck) return manualCheck;
    const fetchManually = (path, maxLength) => fetchFile(path, maxLength, true);
    manualCheck = Promise.resolve(checking).then(() => locked(() =>
      receive(fetchManually, () => true, { progress }))).finally(() => {
      manualCheck = null;
      refresh();
    });
    return manualCheck;
  }

  document.addEventListener("visibilitychange", refresh);
  document.addEventListener("hako-af:auto-update-changed", refresh);
  window.addEventListener("pageshow", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("storage", event => { if (!event.key || event.key === preferenceKey) refresh(); });
  refresh();
  return { checkNow };
}
