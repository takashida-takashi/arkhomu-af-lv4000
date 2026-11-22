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
  let archive, pendingDownload, pendingApply;
  let applyFailed = false;
  let state = { text: "", busy: false, error: false };

  function usable(record) {
    return newerArkHomuRelease(record?.version, version) && typeof record.url === "string" &&
      record.url.startsWith("data:application/zip;base64,");
  }

  function setArchive(record) {
    archive = usable(record) ? record : undefined;
    document.dispatchEvent(new Event("hako-af:desktop-update-archive"));
  }

  async function saveArchive(record = archive, manual = false) {
    if (!record) return;
    const token = manual ? crypto.randomUUID() : undefined;
    if (manual) {
      pendingDownload = { token, version: record.version };
      setState("ZIPをダウンロード中…", true);
    }
    try {
      const started = await waitForArkHomuUpdate(() => chrome.runtime.sendMessage({ type: "hako-af:download-update", token, version: record.version }), 30_000);
      if (!started) throw new Error("Could not start the ZIP download");
      return true;
    } catch (error) {
      console.warn("[はこホム拡張] 更新ZIPの保存に失敗しました", error);
      if (manual && pendingDownload?.token === token) {
        pendingDownload = null;
        setState("ZIPを保存できませんでした。拡張機能ページで再読み込みしてください", false, true);
      }
      return false;
    }
  }

  async function applyArchive(version, reload = false, manual = false) {
    const token = crypto.randomUUID();
    if (manual) { pendingApply = token; applyFailed = false; }
    try {
      const result = await waitForArkHomuUpdate(() => chrome.runtime.sendMessage({ type: "hako-af:apply-update", version, reload, token }), 65_000);
      if (manual && result?.failed === true) applyFailed = true;
      return result === true || result?.applied === true;
    } catch (error) {
      console.warn("[はこホム拡張] PC更新の応答を確認できませんでした", error);
      if (manual) applyFailed = true;
      return false;
    } finally {
      if (pendingApply === token) pendingApply = null;
    }
  }

  function onApplyProgress(message) {
    if (message?.type !== "hako-af:update-apply-progress" || !pendingApply || message.token !== pendingApply) return;
    const labels = { extension: "拡張機能を確認中…", folder: "更新先フォルダーを確認中…", permission: "書き込み権限を確認中…",
      manifest: "現在のファイルを確認中…", archive: "更新ZIPを確認中…", verify: "更新ZIPを検証中…", extract: "更新ZIPを展開中…",
      write: "更新を書き込み中…", rollback: "元のファイルに戻しています…", complete: "更新の適用を確認中…" };
    if (message.stage === "failed") { applyFailed = true; return; }
    let label = labels[message.stage];
    if (!label) return;
    if (message.stage === "write" && Number.isInteger(message.index) && Number.isInteger(message.total))
      label = `更新を書き込み中（${message.index}/${message.total}）…`;
    setState(label, true);
  }

  function openFolderSettings() {
    void chrome.runtime.sendMessage({ type: "hako-af:open-update-folder" }).catch(() => {});
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
      if (!manual && !newerArkHomuRelease(release.version, previous.version)) {
        if (!previous.applied && !state.busy && enabled()) await applyArchive(previous.version);
        return previous.version;
      }
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
    if (!manual && !state.busy && enabled() && !await applyArchive(record.version) && enabled()) await saveArchive(record);
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
      setState("更新先フォルダーを確認中…", true);
      const samePage = page === location.href;
      if (await applyArchive(available, samePage, true)) {
        setState(samePage ? `v${available} に更新しました。再読み込みします…` : `v${available} を適用できます`, samePage);
        if (samePage) setTimeout(() => setState(`v${available} をフォルダーに適用しました。タブを再読み込みしてください`, false), 5000);
        return;
      }
      downloading = true;
      token = crypto.randomUUID();
      pendingDownload = { token, version: available };
      setState("ZIPをダウンロード中…", true);
      const started = await waitForArkHomuUpdate(() => chrome.runtime.sendMessage({ type: "hako-af:download-update", token, version: available }), 30_000);
      if (!started) throw new Error("Could not start the ZIP download");
    } catch (error) {
      console.warn("[はこホム拡張] PC更新を完了できませんでした", error);
      if (token && pendingDownload?.token !== token) return;
      pendingDownload = null;
      setState(downloading ? "ZIPを取得できませんでした" : "更新を確認できませんでした", false, true);
    }
  }

  function onDownloadFinished(message) {
    if (message?.type !== "hako-af:update-download-finished" || !pendingDownload || message.token !== pendingDownload.token) return;
    const { version: downloaded } = pendingDownload;
    pendingDownload = null;
    if (message.complete !== true) {
      setState("ZIPのダウンロードが中断されました", false, true);
      return;
    }
    setState(`v${downloaded} のZIPを保存しました。${applyFailed ? "拡張機能ページで再読み込みしてから更新を試してください" : "更新先フォルダーを設定できます"}`, false);
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
    chrome.runtime.onMessage.addListener(onApplyProgress);
    chrome.storage.onChanged.addListener(onArchiveChanged);
  } catch (error) {
    if (error?.message === "Extension context invalidated.") return;
    throw error;
  }

  storage.getValue(archiveKey, null).then(setArchive).catch(() => {});
  const updates = startArkHomuReleaseCheck(distribution, storage, "hakoAfDesktopUpdateNextCheck", "arkhomu-af-desktop-update", receive, version);
  globalThis.hakoAfDesktopUpdates = { version, archiveVersion: () => archive?.version,
    archiveApplied: () => archive?.applied === true, openFolderSettings, saveArchive: () => saveArchive(archive, true), checkNow, status: () => state };
})();
