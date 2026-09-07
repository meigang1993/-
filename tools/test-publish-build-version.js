"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  assertPublishVersionAdvanced,
  assertRepositoryPublishVersion,
  compareBuildVersions,
} = require("./publish-build-version");

const index = version => `<meta name="game-build" content="${version}">`;
const baseline = {
  currentIndex: index("20260803-03"),
  headIndex: Buffer.from(index("20260803-03")),
  currentResources: {
    "bundles/startup.min.js": Buffer.from("same\n"),
    "base.css": Buffer.from("same\n"),
  },
  headResources: {
    "bundles/startup.min.js": Buffer.from("same\n"),
    "base.css": Buffer.from("same\n"),
  },
};

assert.deepEqual(assertPublishVersionAdvanced(baseline), []);
assert.throws(
  () => assertPublishVersionAdvanced({
    ...baseline,
    currentResources: {
      ...baseline.currentResources,
      "bundles/startup.min.js": Buffer.from("changed\n"),
    },
  }),
  /bump meta\[name=game-build\] above 20260803-03/,
  "changed generated bundles must reject an unchanged cache version"
);
assert.throws(
  () => assertPublishVersionAdvanced({
    ...baseline,
    currentResources: { ...baseline.currentResources, "base.css": Buffer.from("changed\n") },
  }),
  /bump meta\[name=game-build\] above 20260803-03/,
  "changed CSS must reject an unchanged cache version"
);
assert.deepEqual(assertPublishVersionAdvanced({
  ...baseline,
  currentIndex: index("20260803-04"),
  currentResources: {
    ...baseline.currentResources,
    "bundles/startup.min.js": Buffer.from("changed\n"),
  },
}), ["bundles/startup.min.js"]);
assert.throws(
  () => assertPublishVersionAdvanced({
    ...baseline,
    currentIndex: index("20260802-99"),
    currentResources: { ...baseline.currentResources, "new.css": Buffer.from("new\n") },
  }),
  /bump meta\[name=game-build\]/,
  "new cache-versioned resources must not accept an older version"
);
assert(compareBuildVersions("20260804-01", "20260803-99") > 0);

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

const noGit = fs.mkdtempSync(path.join(os.tmpdir(), "publish-version-no-git-"));
try {
  assert.throws(
    () => assertRepositoryPublishVersion(noGit, { startup: "changed\n" }, index("20260803-03")),
    /require a Git worktree/,
    "copied source without Git history must fail closed"
  );
} finally {
  fs.rmSync(noGit, { recursive: true, force: true });
}

const unborn = fs.mkdtempSync(path.join(os.tmpdir(), "publish-version-unborn-"));
try {
  runGit(unborn, ["init", "-q"]);
  assert.deepEqual(
    assertRepositoryPublishVersion(unborn, { startup: "initial\n" }, index("20260803-01")),
    [],
    "an empty Git repository may establish its first release baseline"
  );
} finally {
  fs.rmSync(unborn, { recursive: true, force: true });
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "publish-build-version-"));
try {
  fs.mkdirSync(path.join(temp, "publish", "bundles"), { recursive: true });
  fs.writeFileSync(path.join(temp, "publish", "index.html"), index("20260803-03"));
  fs.writeFileSync(path.join(temp, "publish", "bundles", "startup.min.js"), "same\n");
  fs.writeFileSync(path.join(temp, "publish", "base.css"), "same\n");
  runGit(temp, ["init", "-q"]);
  runGit(temp, ["add", "."]);
  runGit(temp, [
    "-c", "user.name=QA", "-c", "user.email=qa@example.invalid",
    "commit", "-qm", "baseline",
  ]);

  assert.deepEqual(
    assertRepositoryPublishVersion(temp, { startup: "same\n" }, index("20260803-03")),
    []
  );
  fs.writeFileSync(path.join(temp, "publish", "base.css"), "changed\n");
  assert.throws(
    () => assertRepositoryPublishVersion(temp, { startup: "same\n" }, index("20260803-03")),
    /base\.css.*bump meta\[name=game-build\]/,
    "a CSS-only release change must require a new build version"
  );
  assert.deepEqual(
    assertRepositoryPublishVersion(temp, { startup: "same\n" }, index("20260803-04")),
    ["base.css"]
  );
  fs.rmSync(path.join(temp, "publish", "base.css"));
  assert.throws(
    () => assertRepositoryPublishVersion(temp, { startup: "same\n" }, index("20260803-03")),
    /base\.css.*bump meta\[name=game-build\]/,
    "deleting a published stylesheet must require a new build version"
  );
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("Publish cache-version contracts passed");
