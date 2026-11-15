(() => {
  "use strict";

  const version = chrome.runtime.getManifest().version;
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
  let archive;

  function usable(record) {
    return newerArkHomuRelease(record?.version, version) && typeof record.url === "string" &&
      record.url.startsWith("data:application/zip;base64,");
  }

  function setArchive(record) {
    archive = usable(record) ? record : undefined;
    document.dispatchEvent(new Event("hako-af:desktop-update-archive"));
  }

  function saveArchive() {
    if (!archive) return;
    const link = document.createElement("a");
    link.href = archive.url;
    link.download = `arkhomu-af-lv4000-v${archive.version}.zip`;
    link.click();
  }

  function archiveUrl(bytes) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(new Blob([bytes], { type: "application/zip" }));
    });
  }

  async function receive(fetchFile, enabled) {
    const release = JSON.parse(new TextDecoder().decode(await fetchFile("pc.json", 4096)));
    if (!newerArkHomuRelease(release?.version, version)) return;
    const previous = await storage.getValue(archiveKey, null);
    if (usable(previous) && !newerArkHomuRelease(release.version, previous.version)) return;

    const bytes = await fetchFile(`arkhomu-af-lv4000-v${release.version}.zip`, archiveLimit);
    if (bytes.byteLength < 4 || new DataView(bytes).getUint32(0) !== 0x504b0304 ||
        !await matchesArkHomuReleaseHash(bytes, release.sha256)) return;
    const record = { version: release.version, url: await archiveUrl(bytes) };
    if (!enabled()) return;
    await storage.setValue(archiveKey, record);
    setArchive(record);
    if (enabled()) saveArchive();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[archiveKey]) setArchive(changes[archiveKey].newValue);
  });
  storage.getValue(archiveKey, null).then(setArchive).catch(() => {});
  globalThis.hakoAfDesktopUpdates = { version, archiveVersion: () => archive?.version, saveArchive };
  startArkHomuReleaseCheck(distribution, storage, "hakoAfDesktopUpdateNextCheck", "arkhomu-af-desktop-update", receive);
})();
