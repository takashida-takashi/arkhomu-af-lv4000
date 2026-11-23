const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { minify_sync } = require("terser");

const project = path.resolve(__dirname, "..");
const outputs = path.join(project, "dist");
const source = path.join(project, "extension");
const readSource = file => fs.readFileSync(path.join(project, file), "utf8").replace(/\r\n/g, "\n").trim();
const manifest = JSON.parse(readSource("extension/manifest.json"));
const buildPages = process.argv.includes("--pages");
const git = (...args) => execFileSync("git", args, { cwd: project, encoding: "utf8" }).trim();
const releaseSources = ["extension", "scripts/arkhomu-af-auto-update.js", "scripts/arkhomu-af-legacy-update.js", "scripts/arkhomu-af-settings-storage.js"];
const mobileRef = buildPages ? previousMobileRelease() : null;
const readMobileSource = file => mobileRef ? git("show", `${mobileRef}:${file}`) : readSource(file);
const read = file => readMobileSource(`extension/${file}`);
const mobileManifest = mobileRef ? JSON.parse(read("manifest.json")) : manifest;
const { name, description } = mobileManifest;
const desktopVersion = buildPages ? releaseVersion("HEAD", manifest.version) : manifest.version;
const version = mobileRef ? releaseVersion(mobileRef, mobileManifest.version) : desktopVersion;

function previousMobileRelease() {
  const commits = git("log", "--first-parent", "--format=%H%x09%s", "--", ...releaseSources).split("\n");
  const pcOnly = entry => /\[pc-only\]$/.test(entry);
  if (!pcOnly(commits[0])) return null;
  const previous = commits.find(entry => !pcOnly(entry));
  if (!previous) throw new Error("A PC-only release requires an earlier mobile release.");
  return previous.split("\t", 1)[0];
}

function releaseVersion(ref, manifestVersion) {
  let baseline;
  for (const commit of git("log", "--first-parent", "--format=%H", ref, "--", "extension/manifest.json").split("\n")) {
    if (JSON.parse(git("show", `${commit}:extension/manifest.json`)).version !== manifestVersion) break;
    baseline = commit;
  }
  const depth = baseline ? Number(git("rev-list", "--first-parent", "--count", `${baseline}..${ref}`, "--", ...releaseSources)) : 0;
  const [major, minor, patch] = manifestVersion.split(".").map(Number);
  if (patch + depth > 65535) throw new Error("Release patch exceeds the Chrome manifest limit.");
  return [major, minor, patch + depth].join(".");
}

function makePcZip(destination) {
  const staging = fs.mkdtempSync(path.join(outputs, "pc-"));
  const folder = "arkhomu-af-lv4000";
  try {
    const target = path.join(staging, folder);
    fs.cpSync(source, target, { recursive: true });
    fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify({ ...manifest, version: desktopVersion }, null, 2) + "\n");
    const archive = path.join(staging, "extension.zip");
    if (process.platform === "win32") {
      execFileSync("tar.exe", ["-a", "-cf", archive, "-C", staging, folder], { stdio: "inherit" });
    } else {
      execFileSync("zip", ["-q", "-r", archive, folder], { cwd: staging, stdio: "inherit" });
    }
    fs.copyFileSync(archive, destination);
  } finally {
    const root = fs.realpathSync(outputs);
    const directory = fs.realpathSync(staging);
    if (path.dirname(directory) !== root) throw new Error("Unexpected ZIP staging directory.");
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function renderPage(zipName) {
  const template = fs.readFileSync(path.join(project, "index.html"), "utf8");
  const badge = /(<div class="version">)v\d+\.\d+\.\d+(<\/div>)/;
  const download = /href="\.\/arkhomu-af-lv4000-v\d+\.\d+\.\d+\.zip"/;
  if (!badge.test(template) || !download.test(template)) throw new Error("Missing release fields in index.html.");
  const releaseLabel = desktopVersion === version ? `v${version}` : `PC v${desktopVersion} / スマホ v${version}`;
  return template.replace(badge, (_, open, close) => `${open}${releaseLabel}${close}`)
    .replace(download, `href="./${zipName}"`);
}

function copyPreviousDownloads(site) {
  for (const file of fs.readdirSync(project)) {
    if (/^arkhomu-af-lv4000-v\d+\.\d+\.\d+\.zip$/.test(file) || file === "release.json") {
      fs.copyFileSync(path.join(project, file), path.join(site, file));
    }
  }
}

const files = ["feature-names.js", "popup-dismiss.js", "forecast.js", "artifact-effects.js", "list-rules.js", "filter-popup.js", "hidden-titles.js", "extras.js", "extras-main.js",
  "enhance-estimate.js", "explore-analysis.js", "market-watch.js", "party-share-main.js", "training-sources-main.js", "training-preview-main.js", "stat-compensation.js", "training-routes-main.js",
  "party-share.js", "training-routes.js", "training-artifacts.js", "training-preview.js", "training-planner.js", "expedition.js", "guild-dungeon-hidden.js", "guild-dungeon-filter.js", "dungeon-rewards.js", "content.js", "gacha-sets.js",
  "expedition-main.js", "expedition-native.js", "monster-boxes.js", "guild-dungeon-main.js", "dungeon-rewards-main.js", "stat-simulator-main.js", "op-model-data.js", "op-insights-main.js", "read-af.js"];
const desktopOnly = new Set(["frame-context.js", "local-reload.js", "desktop-update.js", "slot-home.js"]);
const bundled = new Set([...files, "market-snapshot.js", "update-check.js"]);
const desktopModules = new Set(mobileManifest.content_scripts.flatMap(entry => entry.js));
const missing = [...desktopModules].filter(file => !desktopOnly.has(file) && !bundled.has(file));
const extra = [...bundled].filter(file => !desktopModules.has(file));
if (missing.length || extra.length) {
  throw new Error(`Userscript module mismatch. Missing: ${missing.join(", ")}. Extra: ${extra.join(", ")}.`);
}
// Register the UI before the game bridge discards the module exports it uses. The first scan runs next frame.
// These UI modules do not inspect function source like the game bridges do.
const compactModules = new Set(["stat-simulator-main.js", "stat-compensation.js", "op-insights-main.js", "market-watch.js", "guild-dungeon-filter.js", "training-planner.js", "training-routes.js", "guild-dungeon-hidden.js"]);
const moduleSource = file => {
  const source = read(file).replaceAll("globalThis.hakoAf", "modules.hakoAf");
  return "// " + file + "\n" + (compactModules.has(file) ? minify_sync(source, {
    compress: false, mangle: true, format: { comments: false, ascii_only: false }
  }).code : source);
};
const modules = files.map(moduleSource);
const css = read("style.css") + `

@media (hover: none) and (pointer: coarse) {
  [data-ha4="filter-popup"] :is(input[type="number"], input[type="search"], input[type="text"], textarea, select) {
    font-size: 16px;
    min-height: 36px;
  }

  [data-ha4="filter-popup"] .ha4-body { padding-inline: 12px; }
  [data-ha4="filter-popup"] .ha4-preset-row > button { min-height: 36px; }
}

[data-ha4="filter-popup"] .ha4-condition input[type="number"] {
  inline-size: calc(11ch + 2rem);
  min-width: 0;
}
`;

const header = `// ==UserScript==
// @name         ${name}
// @namespace    arkhomu-af-lv4000
// @version      ${version}
// @description  ${description}
// @match        https://arkhomu.com/*
// @run-at       document-start
// @noframes
// @grant        none
// @sandbox      raw
// @inject-into  page
// ==/UserScript==`;

const distribution = "https://takashida-takashi.github.io/arkhomu-af-lv4000/";
const checks = read("update-check.js");
const legacyUpdates = readMobileSource("scripts/arkhomu-af-legacy-update.js");
const settingsStorageSource = readMobileSource("scripts/arkhomu-af-settings-storage.js");
const start = `(() => {
  "use strict";
  if (location.origin !== "https://arkhomu.com" || window.top !== window.self) return;
  const loader = document.currentScript?.dataset;
  const managed = loader?.hakoAfUpdateManaged === "true";
  const manual = loader?.hakoAfUserscriptManualUpdate === "true";
  const legacy = managed && !manual;
  ${checks}
  const settingsStorage = (${settingsStorageSource})("page", null, loader?.hakoAfSettingsStorage);
  const localStorage = settingsStorage.storage;
  const promote = legacy && (${legacyUpdates})(${JSON.stringify(distribution)}, ${JSON.stringify(version)},
    loader?.hakoAfLegacyForwarded === "true");
  // Each preset has a separate key, so saving from one tab cannot replace other names.
  const presetPrefix = "hakoAf4000:userscript:";
  const modules = {
    hakoAfUserscriptVersion: ${JSON.stringify(version)},
    hakoAfUpdateManaged: managed,
    hakoAfUserscriptManualUpdate: manual || legacy,
    hakoAfSettingsStorage: settingsStorage,
    hakoAfPresetStorage: {
      get() {
        const storage = localStorage;
        const values = Object.create(null);
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key?.startsWith(presetPrefix)) continue;
          try {
            values[key.slice(presetPrefix.length)] = JSON.parse(storage.getItem(key));
          } catch {
            // Ignore an unreadable preset without hiding the remaining ones.
          }
        }
        return values;
      },
      set(values) {
        for (const [key, value] of Object.entries(values)) {
          localStorage.setItem(presetPrefix + key, JSON.stringify(value));
        }
      }
    }
  };
`;
const mount = `function mount() {
  if (document.querySelector('style[data-ha4="userscript-style"]')) return;
  const style = document.createElement("style");
  style.dataset.ha4 = "userscript-style";
  style.textContent = ${JSON.stringify(css)};
  (document.head ?? document.documentElement).append(style);`;
const ready = `}
function startRuntime() {
  startNativeObservers();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
}
if (promote) void promote.then(loaded => { if (!loaded) startRuntime(); });
else startRuntime();
})();`;
const observers = `function startNativeObservers() {\n${moduleSource("market-snapshot.js")}\n}`;
// Existing bridge modules inspect function source; preserve their formatting and exported property names.
const runtime = [header, start, observers, mount, ...modules, ready].join("\n\n") + "\n";
if (Buffer.byteLength(runtime, "utf8") >= 1048576) throw new Error("Runtime exceeds the 1 MiB limit supported by existing automatic updaters.");
const scriptName = "arkhomu-af-lv4000.user.js";
const installerGrants = [
  "// @grant        GM.getValue",
  "// @grant        GM.setValue",
  "// @grant        GM.listValues",
  "// @grant        GM.deleteValue",
  "// @inject-into  content"
];
const grantsMarker = "// @grant        none\n// @sandbox      raw\n// @inject-into  page";
const loader = readMobileSource("scripts/arkhomu-af-auto-update.js");
const installerBody = `\n\n(() => {\n${checks}\n\n${settingsStorageSource}\n\n(${loader})(${JSON.stringify(distribution)}, ${JSON.stringify(version)}, ${JSON.stringify(runtime)});\n})();\n`;
const installer = header.replace(grantsMarker, [
  ...installerGrants, "// @sandbox      DOM", "// @downloadURL  none"
].join("\n")) + installerBody;
const safariInstaller = header.replace(grantsMarker, installerGrants.join("\n")) + installerBody;
const destination = path.join(outputs, scriptName);
const localSafari = path.join(outputs, "safari");
fs.mkdirSync(localSafari, { recursive: true });
fs.writeFileSync(destination, installer, "utf8");
fs.writeFileSync(path.join(localSafari, scriptName), safariInstaller, "utf8");
console.log(destination);

if (buildPages) {
  const site = path.join(outputs, "pages");
  const safari = path.join(site, "safari");
  const metaName = "arkhomu-af-lv4000.meta.js";
  const marker = "// ==/UserScript==";
  // The previous Tampermonkey release can discover the installer at its original URL.
  const migrationHeader = header.replace(marker, [
    "// @updateURL    " + distribution + metaName,
    "// @downloadURL  " + distribution + scriptName,
    marker
  ].join("\n"));
  const sha256 = createHash("sha256").update(runtime).digest("hex");
  const zipName = `arkhomu-af-lv4000-v${desktopVersion}.zip`;
  fs.mkdirSync(safari, { recursive: true });
  copyPreviousDownloads(site);
  makePcZip(path.join(site, zipName));
  const archive = fs.readFileSync(path.join(site, zipName));
  const archiveHash = createHash("sha256").update(archive).digest("hex");
  fs.writeFileSync(path.join(site, "index.html"), renderPage(zipName));
  fs.cpSync(path.join(project, "guide"), path.join(site, "guide"), { recursive: true });
  fs.cpSync(path.join(project, "calculator"), path.join(site, "calculator"), { recursive: true });
  fs.writeFileSync(path.join(site, scriptName), installer);
  fs.writeFileSync(path.join(safari, scriptName), safariInstaller);
  fs.writeFileSync(path.join(site, metaName), migrationHeader + "\n");
  fs.writeFileSync(path.join(site, "runtime.js"), runtime);
  fs.writeFileSync(path.join(site, "runtime.json"), JSON.stringify({ version, sha256 }, null, 2) + "\n");
  fs.writeFileSync(path.join(site, "pc.json"), JSON.stringify({ version: desktopVersion, sha256: archiveHash }, null, 2) + "\n");
}
