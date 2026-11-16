"use strict";

importScripts("update-check.js");

const gameOrigin = "https://arkhomu.com";
const pendingKey = "hakoAfPendingLocalReload";
const archiveKey = "hakoAfDesktopUpdateArchive";
const updateFilename = "arkhomu-af-lv4000-update.zip";
const savedZipKey = "hakoAfSavedUpdateZip";
const downloadKey = id => `hakoAfUpdateDownload:${id}`;
const zipDataPrefix = "data:application/zip;base64,";
const legacyFilename = /(?:^|[/\\])arkhomu-af-lv4000-v(\d+\.\d+\.\d+)(?: \(\d+\))?\.zip$/;
// These releases could be saved by a page link without an extension download ID.
const legacyArchiveHashes = {
  "3.0.8": "fab472cae2fb6265c3d88ed07163c5038443bee3d2932bd05502e794441709e6",
  "3.0.9": "34b4ddd7ed2439be1bf634c39e07c0a5ff83a175a1df66f95c324c212095ccc2"
};
let checking;
let cleanup;
let zipOperations = Promise.resolve();

function queueZipOperation(run) {
  const operation = zipOperations.then(run);
  zipOperations = operation.catch(() => {});
  return operation;
}

async function removeTrackedZip(current) {
  const { [savedZipKey]: saved } = await chrome.storage.local.get(savedZipKey);
  if (!Number.isInteger(saved?.id) || !validArkHomuReleaseVersion(saved.version) ||
      newerArkHomuRelease(saved.version, current)) return;
  const [item] = await chrome.downloads.search({ id: saved.id });
  if (item?.state === "in_progress") return;
  if (item?.state === "complete" && item.exists && item.byExtensionId === chrome.runtime.id &&
      item.filename.split(/[/\\]/).at(-1) === updateFilename) {
    await chrome.downloads.removeFile(item.id);
  }
  await chrome.storage.local.remove(savedZipKey);
}

async function matchesLegacyDownload(item, version) {
  if (!item.url.startsWith(zipDataPrefix)) return false;
  if (item.byExtensionId) return item.byExtensionId === chrome.runtime.id;
  const hash = legacyArchiveHashes[version];
  if (!hash || item.url.length > 3_000_000) return false;
  const bytes = await (await fetch(item.url)).arrayBuffer();
  return matchesArkHomuReleaseHash(bytes, hash);
}

function cleanUpAppliedZips() {
  return cleanup ??= queueZipOperation(async () => {
    const current = chrome.runtime.getManifest().version;
    await removeTrackedZip(current);

    const items = await chrome.downloads.search({ filenameRegex: legacyFilename.source, orderBy: ["-startTime"] });
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.filename)) continue;
      seen.add(item.filename);
      const version = legacyFilename.exec(item.filename)?.[1];
      if (!validArkHomuReleaseVersion(version) || newerArkHomuRelease(version, current) ||
          item.state !== "complete" || !item.exists) continue;
      try {
        if (await matchesLegacyDownload(item, version)) await chrome.downloads.removeFile(item.id);
      } catch {
        // An entry may disappear while Chrome is checking it.
      }
    }
  }).catch(() => { cleanup = null; });
}

async function checkLocalUpdate(tabId, url) {
  const { installType } = await chrome.management.getSelf();
  if (installType !== "development") return;

  const response = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
  if (!response.ok) return;
  const { version } = await response.json();
  const current = chrome.runtime.getManifest().version;
  if (!newerArkHomuRelease(version, current)) return;

  await chrome.storage.local.set({ [pendingKey]: { tabId, url, version, current, time: Date.now() } });
  chrome.runtime.reload();
}

async function finishUpdateDownload(id, state) {
  if (state !== "complete" && state !== "interrupted") return;
  const key = downloadKey(id);
  const { [key]: target } = await chrome.storage.session.get(key);
  if (!target) return;
  await chrome.storage.session.remove(key);
  await chrome.tabs.sendMessage(target.tabId, {
    type: "hako-af:update-download-finished", token: target.token, complete: state === "complete"
  }, { documentId: target.documentId });
}

async function downloadUpdate({ token, version }, sender) {
  if (token !== undefined && (typeof token !== "string" || !/^[\da-f-]{36}$/.test(token) || !sender.documentId)) return false;
  if (!newerArkHomuRelease(version, chrome.runtime.getManifest().version)) return false;
  const { [archiveKey]: record } = await chrome.storage.local.get(archiveKey);
  if (record?.version !== version || typeof record.url !== "string" ||
      !record.url.startsWith(zipDataPrefix)) return false;

  const id = await chrome.downloads.download({ url: record.url, filename: updateFilename, conflictAction: "overwrite" });
  await chrome.storage.local.set({ [savedZipKey]: { id, version } });
  if (token === undefined) return true;
  await chrome.storage.session.set({ [downloadKey(id)]: { tabId: sender.tab.id, documentId: sender.documentId, token } });
  // A cached ZIP can finish before the tracking entry is written.
  const [item] = await chrome.downloads.search({ id });
  void finishUpdateDownload(id, item?.state ?? "interrupted").catch(() => {});
  return true;
}

chrome.downloads.onChanged.addListener(({ id, state }) => {
  if (state?.current) void finishUpdateDownload(id, state.current).catch(() => {});
});
chrome.downloads.onErased.addListener(id => { void finishUpdateDownload(id, "interrupted").catch(() => {}); });

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.frameId !== 0 || sender.origin !== gameOrigin || !sender.url || !Number.isInteger(sender.tab?.id)) return;
  if (message?.type === "hako-af:download-update") {
    void queueZipOperation(() => downloadUpdate(message, sender)).then(respond, () => respond(false));
    return true;
  }
  if (message?.type !== "hako-af:check-local-update") return;

  void cleanUpAppliedZips();
  checking ??= checkLocalUpdate(sender.tab.id, sender.url).catch(() => {}).finally(() => { checking = null; });
  void checking.then(() => respond());
  return true;
});

async function resumeTab(previousVersion) {
  const { [pendingKey]: pending } = await chrome.storage.local.get(pendingKey);
  if (!pending) return;
  await chrome.storage.local.remove(pendingKey);
  const age = Date.now() - pending.time;
  if (pending.current !== previousVersion || pending.version !== chrome.runtime.getManifest().version ||
      !(age >= 0 && age < 30_000)) return;

  const tab = await chrome.tabs.get(pending.tabId);
  if (!tab.pendingUrl && tab.url === pending.url && new URL(tab.url).origin === gameOrigin) {
    await chrome.tabs.reload(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  if (reason === "update") void resumeTab(previousVersion).catch(() => {});
  void cleanUpAppliedZips();
});
chrome.runtime.onStartup.addListener(() => { void cleanUpAppliedZips(); });
