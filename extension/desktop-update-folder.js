"use strict";

const choose = document.getElementById("choose");
const allow = document.getElementById("allow");
const clear = document.getElementById("clear");
const status = document.getElementById("status");
const permission = { mode: "readwrite" };
let folder;

async function showFolder() {
  const writable = folder && await folder.queryPermission(permission) === "granted";
  clear.hidden = !folder;
  allow.hidden = !folder || writable;
  status.textContent = folder ? `更新先は「${folder.name}」です。${writable ? "はこホムに戻り、バージョンを押すと更新できます。" : "書き込みを許可してください。"}`
    : "更新先が未登録です。";
}

choose.addEventListener("click", async () => {
  try {
    const selected = await window.showDirectoryPicker({ id: "hako-af-update", ...permission });
    const manifest = await arkHomuUpdateFiles.readManifest(selected);
    if (!arkHomuUpdateFiles.matchesExtension(manifest) || manifest.version !== chrome.runtime.getManifest().version ||
        !await arkHomuUpdateFiles.isLoadedFolder(selected)) {
      throw new Error("Invalid extension folder");
    }
    await arkHomuUpdateFiles.saveFolder(selected);
    folder = selected;
    await showFolder();
  } catch (error) {
    if (error.name !== "AbortError") status.textContent = error.name === "NotAllowedError" ? "選んだフォルダーへの書き込みを許可してください。"
      : "現在読み込んでいるはこホム拡張のフォルダーを選んでください。";
  }
});

allow.addEventListener("click", async () => {
  try {
    await folder.requestPermission(permission);
    await showFolder();
  } catch {
    status.textContent = "書き込みの許可を確認できませんでした。";
  }
});

clear.addEventListener("click", async () => {
  try {
    await arkHomuUpdateFiles.saveFolder(null);
    folder = null;
    await showFolder();
  } catch {
    status.textContent = "登録を解除できませんでした。";
  }
});

if (typeof window.showDirectoryPicker !== "function") {
  choose.disabled = true;
  status.textContent = "このブラウザーでは更新先フォルダーを選べません。";
} else {
  void arkHomuUpdateFiles.readFolder().then(handle => {
    folder = handle;
    return showFolder();
  }).catch(() => { status.textContent = "更新先を読み込めませんでした。"; });
}
