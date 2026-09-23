"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const expected = ".githooks";
const hook = path.join(root, expected, "pre-commit");
const checkOnly = process.argv.includes("--check");

function git(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const worktree = git(["rev-parse", "--is-inside-work-tree"]);
if (worktree.status !== 0 || worktree.stdout.trim() !== "true") {
  fail("Git save guard requires a Git worktree");
}
if (!fs.existsSync(hook)) fail(`Missing tracked save guard: ${expected}/pre-commit`);

if (!checkOnly) {
  fs.chmodSync(hook, 0o755);
  const configured = git(["config", "--local", "core.hooksPath", expected]);
  if (configured.status !== 0) fail(configured.stderr.trim() || "Cannot configure Git hooks");
}

const current = git(["config", "--local", "--get", "core.hooksPath"]);
if (current.status !== 0 || current.stdout.trim() !== expected) {
  fail(`Git save guard is inactive; run npm run hooks:install`);
}
if (!(fs.statSync(hook).mode & 0o111)) {
  fail(`Git save guard is not executable; run npm run hooks:install`);
}

console.log(`Git save guard ${checkOnly ? "active" : "installed"}: ${expected}/pre-commit`);
