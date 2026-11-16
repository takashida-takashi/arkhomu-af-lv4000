const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");

const project = path.resolve(__dirname, "..");
const outputs = path.join(project, "dist");
const source = path.join(project, "extension");
const read = file => fs.readFileSync(path.join(source, file), "utf8").replace(/\r\n/g, "\n").trim();
const manifest = JSON.parse(read("manifest.json"));
const { name, description } = manifest;
const buildPages = process.argv.includes("--pages");
const git = (...args) => execFileSync("git", args, { cwd: project, encoding: "utf8" }).trim();
const version = buildPages ? releaseVersion() : manifest.version;
const desktopVersion = buildPages ? pcReleaseVersion() : manifest.version;

function releaseVersion() {
  // Last hand-built release, v2.0.19. Each first-parent commit adds one patch.
  const baseline = "93b8dd2757a151c7faf4516ec6f6d572eb823947";
  const history = git("rev-list", "--first-parent", "HEAD").split("\n");
  const depth = history.indexOf(baseline);
  if (depth < 0) throw new Error("Release baseline is missing. Fetch the full history of main.");
  const baseVersion = JSON.parse(git("show", `${baseline}:extension/manifest.json`)).version;
  const [major, minor, patch] = baseVersion.split(".").map(Number);
  if (patch + depth > 65535) throw new Error("Release patch exceeds the Chrome manifest limit.");
  return [major, minor, patch + depth].join(".");
}

function pcReleaseVersion() {
  // Advance from the commit that first set the current desktop manifest version.
  let baseline;
  for (const commit of git("log", "--first-parent", "--format=%H", "--", "extension/manifest.json").split("\n")) {
    if (JSON.parse(git("show", `${commit}:extension/manifest.json`)).version !== manifest.version) break;
    baseline = commit;
  }
  const depth = baseline ? Number(git("rev-list", "--first-parent", "--count", `${baseline}..HEAD`)) : 0;
  const [major, minor, patch] = manifest.version.split(".").map(Number);
  if (patch + depth > 65535) throw new Error("PC release patch exceeds the Chrome manifest limit.");
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
  return template.replace(badge, (_, open, close) => `${open}v${desktopVersion}${close}`)
    .replace(download, `href="./${zipName}"`);
}

function keepPreviousMobileRelease(site, scriptName, metaName) {
  const [head, ...previous] = git("log", "--first-parent", "--format=%H%x09%s").split("\n");
  if (!head.endsWith(" [pc-only]")) return;
  const previousRelease = previous.find(line => !line.endsWith(" [pc-only]"))?.split("\t")[0];
  if (!previousRelease) throw new Error("Previous full release commit is missing.");
  const checkout = fs.mkdtempSync(path.join(outputs, "mobile-"));
  git("worktree", "add", "--detach", checkout, previousRelease);
  try {
    execFileSync(process.execPath, ["scripts/build-userscripts.cjs", "--pages"], { cwd: checkout, stdio: "inherit" });
    for (const item of [scriptName, `safari/${scriptName}`, metaName, "runtime.js", "runtime.json"]) {
      fs.copyFileSync(path.join(checkout, "dist", "pages", item), path.join(site, item));
    }
  } finally {
    const target = fs.realpathSync(checkout);
    if (path.dirname(target) !== fs.realpathSync(outputs)) throw new Error("Unexpected mobile build directory.");
    git("worktree", "remove", "--force", target);
  }
}

function copyPreviousDownloads(site) {
  for (const file of fs.readdirSync(project)) {
    if (/^arkhomu-af-lv4000-v\d+\.\d+\.\d+\.zip$/.test(file) || file === "release.json") {
      fs.copyFileSync(path.join(project, file), path.join(site, file));
    }
  }
}

const files = ["feature-names.js", "forecast.js", "artifact-effects.js", "list-rules.js", "filter-popup.js", "hidden-titles.js", "extras.js", "extras-main.js",
  "enhance-estimate.js", "explore-analysis.js", "market-watch.js", "party-share-main.js", "training-routes-main.js",
  "party-share.js", "training-routes.js", "content.js", "read-af.js"];
// Register the UI before the game bridge discards the module exports it uses. The first scan runs next frame.
const moduleSource = file => "// " + file + "\n" + read(file).replaceAll("globalThis.hakoAf", "modules.hakoAf");
const modules = files.map(moduleSource);
const css = read("style.css") + `

@media (hover: none) and (pointer: coarse) {
  [data-ha4="filter-popup"] :is(input[type="number"], input[type="search"], input[type="text"], select) {
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

const start = `(() => {
  "use strict";
  if (location.origin !== "https://arkhomu.com" || window.top !== window.self) return;
  // Each preset has a separate key, so saving from one tab cannot replace other names.
  const presetPrefix = "hakoAf4000:userscript:";
  const modules = {
    hakoAfUserscriptVersion: ${JSON.stringify(version)},
    hakoAfUpdateManaged: document.currentScript?.dataset.hakoAfUpdateManaged === "true",
    hakoAfPresetStorage: {
      get() {
        const storage = window.localStorage;
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
          window.localStorage.setItem(presetPrefix + key, JSON.stringify(value));
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
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
})();`;
const runtime = [header, start, moduleSource("market-snapshot.js"), mount, ...modules, ready].join("\n\n") + "\n";
const distribution = "https://takashida-takashi.github.io/arkhomu-af-lv4000/";
const scriptName = "arkhomu-af-lv4000.user.js";
const installerGrants = [
  "// @grant        GM.getValue",
  "// @grant        GM.setValue",
  "// @inject-into  content"
];
const grantsMarker = "// @grant        none\n// @sandbox      raw\n// @inject-into  page";
const loader = fs.readFileSync(path.join(__dirname, "arkhomu-af-auto-update.js"), "utf8").replace(/\r\n/g, "\n").trim();
const checks = read("update-check.js");
const installerBody = `\n\n(() => {\n${checks}\n\n(${loader})(${JSON.stringify(distribution)}, ${JSON.stringify(version)}, ${JSON.stringify(runtime)});\n})();\n`;
const installer = header.replace(grantsMarker, [
  ...installerGrants, "// @sandbox      DOM", "// @downloadURL  none"
].join("\n")) + installerBody;
const destination = path.join(outputs, scriptName);
fs.mkdirSync(outputs, { recursive: true });
fs.writeFileSync(destination, installer, "utf8");
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
  fs.writeFileSync(path.join(site, scriptName), installer);
  fs.writeFileSync(path.join(safari, scriptName), header.replace(grantsMarker, installerGrants.join("\n")) + installerBody);
  fs.writeFileSync(path.join(site, metaName), migrationHeader + "\n");
  fs.writeFileSync(path.join(site, "runtime.js"), runtime);
  fs.writeFileSync(path.join(site, "runtime.json"), JSON.stringify({ version, sha256 }, null, 2) + "\n");
  fs.writeFileSync(path.join(site, "pc.json"), JSON.stringify({ version: desktopVersion, sha256: archiveHash }, null, 2) + "\n");
  keepPreviousMobileRelease(site, scriptName, metaName);
}
