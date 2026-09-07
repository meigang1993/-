"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const bundles = require("./publish-bundles.json");
const qaCatalog = require("./qa-test-catalog");
const browserCatalog = require("./browser-test-catalog");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src", "original");
const testRoot = path.join(root, "tools");
const browserRoot = path.join(root, "tests");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function changedFiles(args) {
  if (args.length) return args.map(file => file.replaceAll("\\", "/"));
  const output = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  return output.split(/\r?\n/).filter(Boolean);
}

function sourceName(file) {
  return path.basename(file).replace(/\.js$/, "");
}

function bundleFor(file) {
  const name = sourceName(file);
  return Object.entries(bundles)
    .filter(([, sources]) => sources.includes(`${name}.js`))
    .map(([bundle]) => bundle);
}

function textFiles(directory, extension) {
  return fs.readdirSync(directory)
    .filter(file => file.endsWith(extension))
    .map(file => ({ file, text: fs.readFileSync(path.join(directory, file), "utf8") }));
}

function matchingFiles(files, needles) {
  return files
    .filter(({ text }) => needles.some(needle => text.includes(needle)))
    .map(({ file }) => file);
}

function relatedLogicTests(files) {
  const ids = new Set();
  const sourceNames = files.filter(file => file.startsWith("src/original/")).map(sourceName);
  const needles = sourceNames.flatMap(name => [name, name.replace(/^data-/, ""), name.replace(/^ui-/, "")]);
  for (const test of qaCatalog.tests) {
    const text = fs.readFileSync(path.join(testRoot, test.file), "utf8");
    if (needles.some(needle => text.includes(needle))) ids.add(test.id);
  }
  const domains = new Set();
  for (const file of files) {
    if (file.includes("/battle") || file.includes("skills") || file.includes("card")) domains.add("battle");
    if (file.includes("store") || file.includes("save") || file.includes("checkpoint") || file.includes("core")) domains.add("storage");
    if (file.includes("character") || file.includes("relic") || file.includes("skin")) domains.add("characters");
    if (file.includes("villa") || file.includes("dungeon") || file.includes("progression") || file.includes("unlock")) domains.add("progression");
    if (file.includes("ui-") || file.includes("fx") || file.includes("art") || file.includes("audio")) domains.add("presentation");
  }
  for (const domain of domains) {
    for (const test of qaCatalog.tests.filter(candidate => candidate.group === domain)) ids.add(test.id);
  }
  return [...ids].sort();
}

function relatedBrowserTests(files) {
  const needles = files.map(file => sourceName(file));
  const selected = new Set();
  for (const test of browserCatalog.tests) {
    const text = fs.readFileSync(path.join(browserRoot, test.file), "utf8");
    if (needles.some(needle => text.includes(needle))) selected.add(test.id);
  }
  const groups = new Set();
  for (const file of files) {
    if (file.includes("battle") || file.includes("card") || file.includes("skill")) groups.add("battle-core");
    if (file.includes("effect") || file.includes("fx") || file.includes("motion")) groups.add("battle-effects");
    if (file.includes("store") || file.includes("save") || file.includes("kv")) groups.add("storage");
    if (file.includes("dungeon") || file.includes("progression") || file.includes("unlock")) groups.add("progression");
    if (file.includes("villa") || file.includes("skin") || file.includes("art") || file.includes("modal")) groups.add("presentation");
    if (file.includes("runtime") || file.includes("bundle") || file.includes("startup")) groups.add("platform");
  }
  for (const group of groups) {
    for (const test of browserCatalog.tests.filter(candidate => candidate.group === group)) selected.add(test.id);
  }
  return [...selected].sort();
}

function printList(title, values) {
  console.log(`${title}: ${values.length ? values.join(", ") : "none"}`);
}

const files = changedFiles(process.argv.slice(2));
if (!files.length) {
  console.log("No changed files detected.");
  process.exit(0);
}

console.log("Impact analysis");
console.log("===============");
console.log(`Files: ${files.join(", ")}`);

const runtimeSources = files.filter(file => file.startsWith("src/original/"));
const affectedBundles = [...new Set(runtimeSources.flatMap(bundleFor))].sort();
const publishChanged = files.some(file => file.startsWith("publish/"));
const cssChanged = files.some(file => file.endsWith(".css"));
const dataChanged = runtimeSources.some(file => /data-|skills|cards|relic|dungeon|enemy|character/.test(file));
const docsNeeded = dataChanged || runtimeSources.some(file => /app|ui|battle|store|save|runtime/.test(file));

printList("Affected bundles", affectedBundles);
printList("Focused logic tests", relatedLogicTests(files));
printList("Focused browser tests", relatedBrowserTests(files));
console.log(`Build bundles: ${runtimeSources.length || publishChanged ? "yes" : "no"}`);
console.log(`Bump game-build: ${runtimeSources.length > 0 || cssChanged ? "yes" : "no"}`);
console.log(`Run resource/path checks: ${runtimeSources.length > 0 || publishChanged ? "yes" : "no"}`);
console.log(`Review game-settings/architecture memory: ${docsNeeded ? "yes" : "no"}`);
console.log("Suggested commands:");
if (runtimeSources.length || publishChanged) console.log("  npm run build:bundles && npm run check:bundles");
const logic = relatedLogicTests(files);
if (logic.length) console.log(`  npm run test:original:focus -- ${logic.join(" ")}`);
const browser = relatedBrowserTests(files);
if (browser.length) console.log(`  npm run test:original:browser:focus -- ${browser.join(" ")}`);
