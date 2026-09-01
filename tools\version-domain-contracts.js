"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  publishedBundlePaths,
  startupBundlePaths,
} = require("./publish-bundle-groups");

const freezeManifestPath = "docs/original-runtime-freeze.json";
const originalRuntimeFiles = Object.freeze([
  "publish/index.html",
  "src/original/game-random.js",
  "src/original/data-cards.js",
  "src/original/runtime-loader.js",
  ...publishedBundlePaths.map(relative => `publish/${relative}`),
]);
const publishedJavaScript = Object.freeze([...publishedBundlePaths].sort());

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readFreeze(root) {
  const file = path.join(root, freezeManifestPath);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readChecksums(root, relative) {
  const entries = new Map();
  const lines = fs.readFileSync(path.join(root, relative), "utf8").trim().split(/\r?\n/);
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (publish\/.+)$/.exec(line);
    assert(match, `invalid original freeze checksum entry: ${line}`);
    assert(!entries.has(match[2]), `duplicate original freeze path: ${match[2]}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function assertOriginalRuntimeFreeze(root) {
  const freeze = readFreeze(root);
  if (!freeze?.active) return { active: false };
  assert.equal(freeze.version, 1, "unsupported original runtime freeze version");
  assert.equal(freeze.scope, "publish", "original runtime freeze must own publish/");
  assert.equal(sha256(path.join(root, freeze.fileManifest)), freeze.fileManifestSha256,
    "original runtime freeze checksum manifest changed");
  assert.equal(sha256(path.join(root, freeze.archive)), freeze.archiveSha256,
    "original runtime freeze archive changed");

  const expected = readChecksums(root, freeze.fileManifest);
  assert.equal(expected.size, freeze.fileCount,
    "original runtime freeze file count does not match its checksum manifest");
  const actual = walk(path.join(root, "publish"))
    .map(file => path.relative(root, file).replaceAll(path.sep, "/"))
    .sort();
  assert.deepEqual(actual, [...expected.keys()].sort(),
    "original runtime freeze file set changed");
  for (const relative of actual) {
    assert.equal(sha256(path.join(root, relative)), expected.get(relative),
      `original runtime freeze mismatch: ${relative}`);
  }
  return { active: true, fileCount: expected.size, baselineTree: freeze.baselineTree };
}

function assertOriginalRuntime(root) {
  const publish = path.join(root, "publish");
  const artifacts = walk(publish)
    .map(file => path.relative(publish, file).replaceAll(path.sep, "/"))
    .filter(file => file.endsWith(".pck") || file.endsWith(".wasm"));
  assert.deepEqual(artifacts, [],
    `non-static engine artifacts cannot occupy publish/: ${artifacts.join(", ")}`);

  for (const relative of originalRuntimeFiles) {
    assert(fs.existsSync(path.join(root, relative)),
      `missing original runtime marker: ${relative}`);
  }
  const actualJavaScript = walk(publish)
    .map(file => path.relative(publish, file).replaceAll(path.sep, "/"))
    .filter(file => file.endsWith(".js"))
    .sort();
  assert.deepEqual(actualJavaScript, publishedJavaScript,
    `publish must contain only generated bundles: ${actualJavaScript.join(", ")}`);

  const index = fs.readFileSync(path.join(publish, "index.html"), "utf8");
  assert.match(index, /<meta\s+name=["']game-build["']/,
    "original publish entry must declare the game build");
  const entryScripts = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(match => match[1].split(/[?#]/)[0]);
  assert.deepEqual(entryScripts, startupBundlePaths,
    "original publish entry must load every startup bundle in manifest order");
  return {
    requiredFiles: originalRuntimeFiles,
    freeze: assertOriginalRuntimeFreeze(root),
  };
}

module.exports = {
  assertOriginalRuntime,
  assertOriginalRuntimeFreeze,
  freezeManifestPath,
  originalRuntimeFiles,
  publishedJavaScript,
};
