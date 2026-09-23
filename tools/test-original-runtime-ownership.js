"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  assertOriginalRuntime,
  originalRuntimeFiles,
} = require("./version-domain-contracts");
const { startupBundlePaths } = require("./publish-bundle-groups");

const root = path.resolve(__dirname, "..");
assertOriginalRuntime(root);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "original-runtime-ownership-"));
try {
  for (const relative of originalRuntimeFiles) {
    const file = path.join(temp, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relative.endsWith("index.html")
      ? `<meta name="game-build" content="test">${startupBundlePaths
        .map(src => `<script defer src="${src}"></script>`).join("")}\n`
      : "\n");
  }

  assertOriginalRuntime(temp);
  fs.writeFileSync(path.join(temp, "publish", "game-random.js"), "source");
  assert.throws(
    () => assertOriginalRuntime(temp),
    /publish must contain only generated bundles/,
    "unbundled JavaScript must be rejected from publish"
  );
  fs.rmSync(path.join(temp, "publish", "game-random.js"));
  const nestedSource = path.join(temp, "publish", "scripts", "new-feature.js");
  fs.mkdirSync(path.dirname(nestedSource), { recursive: true });
  fs.writeFileSync(nestedSource, "source");
  assert.throws(
    () => assertOriginalRuntime(temp),
    /publish must contain only generated bundles/,
    "nested source modules must be rejected from publish"
  );
  fs.rmSync(path.join(temp, "publish", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(temp, "publish", "index.pck"), "engine");
  assert.throws(
    () => assertOriginalRuntime(temp),
    /non-static engine artifacts cannot occupy publish/,
    "engine exports must be rejected from publish"
  );
  fs.rmSync(path.join(temp, "publish", "index.pck"));

  fs.mkdirSync(path.join(temp, "docs"), { recursive: true });
  fs.mkdirSync(path.join(temp, "backups"), { recursive: true });
  const frozenFiles = originalRuntimeFiles.filter(relative => relative.startsWith("publish/"));
  const checksums = frozenFiles.map(relative => {
    const digest = crypto.createHash("sha256")
      .update(fs.readFileSync(path.join(temp, relative))).digest("hex");
    return `${digest}  ${relative}`;
  }).join("\n") + "\n";
  const checksumFile = path.join(temp, "backups", "freeze.files.sha256");
  const archiveFile = path.join(temp, "backups", "freeze.tar.gz");
  fs.writeFileSync(checksumFile, checksums);
  fs.writeFileSync(archiveFile, "archive");
  fs.writeFileSync(
    path.join(temp, "docs", "original-runtime-freeze.json"),
    `${JSON.stringify({
      version: 1,
      active: true,
      scope: "publish",
      baselineTree: "test-tree",
      archive: "backups/freeze.tar.gz",
      archiveSha256: crypto.createHash("sha256").update("archive").digest("hex"),
      fileManifest: "backups/freeze.files.sha256",
      fileManifestSha256: crypto.createHash("sha256").update(checksums).digest("hex"),
      fileCount: frozenFiles.length,
    })}\n`
  );
  assertOriginalRuntime(temp);
  fs.appendFileSync(path.join(temp, "publish", "bundles", "startup.min.js"), "changed\n");
  assert.throws(
    () => assertOriginalRuntime(temp),
    /original runtime freeze mismatch: publish\/bundles\/startup\.min\.js/,
    "the active migration freeze must reject original runtime changes"
  );
  const inactiveFreeze = JSON.parse(fs.readFileSync(
    path.join(temp, "docs", "original-runtime-freeze.json"),
    "utf8"
  ));
  inactiveFreeze.active = false;
  inactiveFreeze.unlockedAt = "2026-08-03T08:47:56Z";
  fs.writeFileSync(
    path.join(temp, "docs", "original-runtime-freeze.json"),
    `${JSON.stringify(inactiveFreeze)}\n`
  );
  const unlocked = assertOriginalRuntime(temp);
  assert.deepEqual(unlocked.freeze, { active: false },
    "inactive historical freeze evidence must not reject original runtime changes");
  fs.writeFileSync(path.join(temp, "publish", "index.html"), "<html></html>\n");
  assert.throws(
    () => assertOriginalRuntime(temp),
    /original publish entry must declare the game build/,
    "unlocking must not disable original runtime identity checks"
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("Original runtime ownership contracts passed");
