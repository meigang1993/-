"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const hook = fs.readFileSync(path.join(root, ".githooks", "pre-commit"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const qa = fs.readFileSync(path.join(root, "tools", "run-qa.js"), "utf8");
const save = fs.readFileSync(path.join(root, "scripts", "save.sh"), "utf8");
const checkpoint = fs.readFileSync(path.join(root, "scripts", "save-checkpoint.sh"), "utf8");

for (const token of [
  "git diff --quiet",
  "git ls-files --others --exclude-standard -- src/original publish",
  "build-publish-bundles.js --check",
  "check-static.js",
  "check-resources.js",
  "check-asset-budget.js",
  "check-script-contracts.js",
  "grep -nP",
  "game-save-guard.last",
]) {
  assert(hook.includes(token), `pre-commit save guard is missing ${token}`);
}
assert.equal(packageJson.scripts["hooks:install"], "node tools/install-git-hooks.js");
assert.equal(packageJson.scripts["check:hooks"], "node tools/install-git-hooks.js --check");
assert(qa.includes('name: "git save guard"'));
assert(save.includes("node tools/install-git-hooks.js --check"));
assert(checkpoint.includes("node tools/install-git-hooks.js --check"));

console.log("Git save guard contracts passed");
