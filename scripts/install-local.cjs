"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const source = path.resolve(__dirname, "../extension");
const destination = process.argv[2] && path.resolve(process.argv[2]);
if (!destination || destination === source) throw new Error("Specify the installed extension folder, separate from extension/.");
const manifest = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8"));
const installed = JSON.parse(fs.readFileSync(path.join(destination, "manifest.json"), "utf8"));
if (installed.name !== manifest.name) throw new Error("The destination is not the same extension.");
const parts = value => {
  if (!/^\d+(?:\.\d+){2,3}$/.test(value)) throw new Error("Invalid extension version: " + value);
  return value.split(".").map(Number);
};
const next = parts(manifest.version), previous = parts(installed.version);
let comparison = 0;
for (let i = 0; i < Math.max(next.length, previous.length) && !comparison; i++) comparison = (next[i] ?? 0) - (previous[i] ?? 0);
if (comparison <= 0) throw new Error(`Local installation requires a newer manifest version (${manifest.version} <= ${installed.version}). Bump extension/manifest.json first.`);
const files = [];
function collect(directory, prefix = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) collect(path.join(directory, entry.name), relative);
    else if (entry.isFile() && relative !== "manifest.json") files.push(relative);
    else if (!entry.isFile()) throw new Error("Unexpected extension source entry: " + relative);
  }
}
collect(source);
// The worker uses the version to trigger chrome.runtime.reload(). Write it last.
for (const relative of [...files, "manifest.json"]) {
  const from = path.join(source, relative), to = path.join(destination, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (hash(from) !== hash(to)) throw new Error("Installed file differs: " + relative);
}
console.log(`Installed local extension ${installed.version} -> ${manifest.version}; verified ${files.length + 1} files. Manifest written last.`);
