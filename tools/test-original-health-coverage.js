"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const packageJson = JSON.parse(read("package.json"));
const qaRunner = read("tools/run-qa.js");
const verify = read("scripts/verify.sh");
const exhaustive = read("scripts/verify-exhaustive.sh");
const browserCatalog = require("./browser-test-catalog");
const browserRunner = require("./run-browser-tests");
const attributes = read(".gitattributes").split(/\r?\n/).map(line => line.trim()).filter(Boolean);

assert.deepEqual(
  attributes.filter(line => line.endsWith("-export-ignore")),
  [
    "/publish -export-ignore",
    "/publish/** -export-ignore",
  ],
  "health experience exports must include only publish"
);
assert(attributes.includes("/* export-ignore"),
  "health experience exports must exclude repository roots by default");
assert(!attributes.some(line => line.startsWith("/src") && line.endsWith("-export-ignore")),
  "health experience exports must exclude all source modules");

assert(qaRunner.includes("quick: [...lintTasks, ...coreTasks]"),
  "qa:quick must retain lint and core health checks");
for (const task of [
  "check-runtime-risks.js",
  "check-static.js",
  "build-publish-bundles.js",
  "validate-data.js",
  "validate-relations.js",
  "check-resources.js",
  "check-asset-budget.js",
  "check-script-contracts.js",
]) {
  assert(qaRunner.includes(task), `qa:quick is missing ${task}`);
}

assert(read("tools/run-domain-lint.js").includes('"src/original"'),
  "original ESLint must scan src/original");
assert(read("eslint.config.js").includes('files: ["src/original/**/*.js"]'),
  "ESLint browser-runtime rules must target src/original");

for (const file of [
  "tools/check-runtime-risks.js",
  "tools/check-static.js",
  "tools/build-publish-bundles.js",
  "tools/validate-data.js",
  "tools/validate-relations.js",
  "tools/check-resources.js",
  "tools/check-asset-budget.js",
  "tools/check-script-contracts.js",
]) {
  assert(/path\.join\([^;\n]+,\s*"src",\s*"original"\)/.test(read(file)),
    `${file} must inspect src/original`);
}

const duplicates = JSON.parse(read(".jscpd.json"));
assert(duplicates.path.includes("src/original"),
  "duplicate health checks must scan src/original");
assert(packageJson.scripts["qa:watch"].includes("src/original/**/*.js"),
  "qa:watch must rerun when original sources change");
assert(packageJson.scripts["qa:watch"].includes("playwright*.config.js"),
  "qa:watch must include the release Playwright configuration");
assert(verify.includes("run-browser-tests.js release"),
  "qa:full must use the curated release browser suite");
assert(exhaustive.includes("run-browser-tests.js all"),
  "qa:exhaustive must retain the complete browser catalog");
assert.equal(packageJson.scripts["qa:exhaustive"], "bash scripts/verify-exhaustive.sh");
assert(browserCatalog.suites.release.length < browserCatalog.tests.length,
  "the release browser suite must stay smaller than the exhaustive catalog");
assert.deepEqual(
  new Set(browserCatalog.suiteGroups("release")),
  new Set(Object.keys(browserCatalog.groups)),
  "the release browser suite must cover every browser-test group"
);
assert.deepEqual(browserRunner.normalizePassthrough(["--list"]), ["--list"],
  "release browser arguments must pass through npm's normal argument form");
assert.deepEqual(browserRunner.normalizePassthrough(["--", "--list"]), ["--list"],
  "release browser arguments must also accept an explicit separator");
assert.deepEqual(
  browserRunner.buildPlaywrightArgs(
    ["preview.spec.js"],
    ["--list"],
    "playwright.release.config.js"
  ),
  [
    "test",
    "--config",
    "playwright.release.config.js",
    "tests/preview.spec.js",
    "--list",
  ],
  "release browser arguments must preserve config, files, and Playwright options"
);
for (const file of [
  "preview.spec.js",
  "startup-direct-kv-1.scenario.js",
  "preview-storage-slots-1.scenario.js",
  "dungeon-flow-1.scenario.js",
  "preview-battle-effect-lifecycle-3.scenario.js",
  "preview-battle-play-stress.spec.js",
  "preview-progression.spec.js",
  "preview-modal-focus.spec.js",
  "accessibility.spec.js",
]) {
  assert(browserCatalog.suites.release.includes(file),
    `the release browser suite must retain ${file}`);
}

console.log("Original health checks cover src/original");
