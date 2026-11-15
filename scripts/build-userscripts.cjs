const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const project = path.resolve(__dirname, "..");
const outputs = path.join(project, "dist");
const source = path.join(project, "extension");
const read = file => fs.readFileSync(path.join(source, file), "utf8").replace(/\r\n/g, "\n").trim();
const { name, description, version } = JSON.parse(read("manifest.json"));
const files = ["forecast.js", "artifact-effects.js", "list-rules.js", "filter-popup.js", "hidden-titles.js", "extras.js", "extras-main.js",
  "enhance-estimate.js", "explore-analysis.js", "market-watch.js", "content.js", "read-af.js"];
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
const loader = fs.readFileSync(path.join(__dirname, "arkhomu-af-auto-update.js"), "utf8").trim();
const checks = read("update-check.js");
const installerBody = `\n\n(() => {\n${checks}\n\n(${loader})(${JSON.stringify(distribution)}, ${JSON.stringify(version)}, ${JSON.stringify(runtime)});\n})();\n`;
const installer = header.replace(grantsMarker, [
  ...installerGrants, "// @sandbox      DOM", "// @downloadURL  none"
].join("\n")) + installerBody;
const destination = path.join(outputs, scriptName);
fs.mkdirSync(outputs, { recursive: true });
fs.writeFileSync(destination, installer, "utf8");
console.log(destination);

if (process.argv.includes("--pages")) {
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
  const zipName = `arkhomu-af-lv4000-v${version}.zip`;
  const archive = fs.readFileSync(path.join(outputs, zipName));
  const archiveHash = createHash("sha256").update(archive).digest("hex");
  fs.mkdirSync(safari, { recursive: true });
  fs.writeFileSync(path.join(site, scriptName), installer);
  fs.writeFileSync(path.join(safari, scriptName), header.replace(grantsMarker, installerGrants.join("\n")) + installerBody);
  fs.writeFileSync(path.join(site, metaName), migrationHeader + "\n");
  fs.writeFileSync(path.join(site, "runtime.js"), runtime);
  fs.writeFileSync(path.join(site, "runtime.json"), JSON.stringify({ version, sha256 }, null, 2) + "\n");
  fs.writeFileSync(path.join(site, zipName), archive);
  fs.writeFileSync(path.join(site, "pc.json"), JSON.stringify({ version, sha256: archiveHash }, null, 2) + "\n");
}
