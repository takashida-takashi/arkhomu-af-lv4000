(() => {
  "use strict";

  let version;
  const archiveKey = "hakoAfDesktopUpdateArchive";
  const distribution = "https://takashida-takashi.github.io/arkhomu-af-lv4000/";
  const archiveLimit = 2_000_000;
  const storage = {
    async getValue(key, fallback) {
      return (await chrome.storage.local.get(key))[key] ?? fallback;
    },
    setValue(key, value) {
      return chrome.storage.local.set({ [key]: value });
    }
  };
  let archive, pendingDownload;
  let state = { text: "", busy: false, error: false };

  function usable(record) {
    return newerArkHomuRelease(record?.version, version) && typeof record.url === "string" &&
      record.url.startsWith("data:application/zip;base64,");
  }

  function setArchive(record) {
    archive = usable(record) ? record : undefined;
    document.dispatchEvent(new Event("hako-af:desktop-update-archive"));
  }

  async function saveArchive(record = archive) {
    if (!record) return;
    try {
      return await chrome.runtime.sendMessage({ type: "hako-af:download-update", version: record.version });
    } catch {
      return false;
    }
  }

  function archiveUrl(bytes) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob([bytes], { type: "application/zip" }));
    });
  }

  async function receive(fetchFile, enabled, manual) {
    const release = JSON.parse(new TextDecoder().decode(await fetchFile("pc.json", 4096)));
    if (!validArkHomuReleaseVersion(release?.version)) throw new Error("Invalid release version");
    if (!newerArkHomuRelease(release.version, version)) return null;
    if (!/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error("Invalid release hash");
    const previous = await storage.getValue(archiveKey, null);
    if (usable(previous)) {
      if (!manual && !newerArkHomuRelease(release.version, previous.version)) return previous.version;
      if (manual && previous.version === release.version && previous.sha256 === release.sha256) return release.version;
    }

    manual?.progress();
    const bytes = await fetchFile(`arkhomu-af-lv4000-v${release.version}.zip`, archiveLimit);
    if (bytes.byteLength < 4 || new DataView(bytes).getUint32(0) !== 0x504b0304 ||
        !await matchesArkHomuReleaseHash(bytes, release.sha256)) throw new Error("Invalid update ZIP");
    const url = await archiveUrl(bytes);
    if (!enabled()) return null;
    const record = { version: release.version, sha256: release.sha256, url };
    await storage.setValue(archiveKey, record);
    setArchive(record);
    if (!manual && !state.busy && enabled()) saveArchive(record);
    return record.version;
  }

  function setState(text, busy, error = false) {
    state = { text, busy, error };
    document.dispatchEvent(new Event("hako-af:desktop-update-status"));
  }

  async function checkNow(event) {
    if (state.busy || event?.isTrusted === false) return;
    const page = location.href;
    setState("更新を確認中…", true);
    let downloading = false;
    let token;
    try {
      const available = await updates.checkNow(() => {
        downloading = true;
        setState("ZIPをダウンロード中…", true);
      });
      if (!available) {
        setState("最新です", false);
        return;
      }
      downloading = true;
      token = crypto.randomUUID();
      pendingDownload = { token, page, version: available };
      setState("ZIPをダウンロード中…", true);
      const started = await chrome.runtime.sendMessage({ type: "hako-af:download-update", token, version: available });
      if (!started) throw new Error("Could not start the ZIP download");
    } catch {
      if (token && pendingDownload?.token !== token) return;
      pendingDownload = null;
      setState(downloading ? "ZIPを取得できませんでした" : "更新を確認できませんでした", false, true);
    }
  }

  function onDownloadFinished(message) {
    if (message?.type !== "hako-af:update-download-finished" || !pendingDownload || message.token !== pendingDownload.token) return;
    const { page, version: downloaded } = pendingDownload;
    pendingDownload = null;
    if (message.complete !== true) {
      setState("ZIPのダウンロードが中断されました", false, true);
      return;
    }
    if (page === location.href) {
      setState(`v${downloaded} のZIPを保存しました。再読み込みします…`, true);
      location.reload();
    } else setState(`v${downloaded} のZIPを保存しました`, false);
  }

  function onArchiveChanged(changes, area) {
    if (area === "local" && changes[archiveKey]) setArchive(changes[archiveKey].newValue);
  }

  try {
    // A page reload can start just before the worker reloads the unpacked extension.
    version = chrome.runtime?.getManifest?.()?.version;
    if (!version) return;
    globalThis.hakoAfDesktopVersion = version;
    if (window.top !== window) return;
    chrome.runtime.onMessage.addListener(onDownloadFinished);
    chrome.storage.onChanged.addListener(onArchiveChanged);
  } catch (error) {
    if (error?.message === "Extension context invalidated.") return;
    throw error;
  }

  storage.getValue(archiveKey, null).then(setArchive).catch(() => {});
  const updates = startArkHomuReleaseCheck(distribution, storage, "hakoAfDesktopUpdateNextCheck", "arkhomu-af-desktop-update", receive);
  globalThis.hakoAfDesktopUpdates = { version, archiveVersion: () => archive?.version,
    saveArchive: () => saveArchive(), checkNow, status: () => state };
})();
