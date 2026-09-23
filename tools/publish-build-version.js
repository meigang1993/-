"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const buildPattern = /^(\d{8})-(\d+)$/;

function buildVersion(html) {
  return html.match(
    /<meta\b[^>]*\bname=["']game-build["'][^>]*\bcontent=["']([^"']+)["']/i
  )?.[1] || "";
}

function compareBuildVersions(left, right) {
  const leftParts = buildPattern.exec(left);
  const rightParts = buildPattern.exec(right);
  if (!leftParts || !rightParts) {
    throw new Error("game-build must use YYYYMMDD-N format");
  }
  const dateDifference = Number(leftParts[1]) - Number(rightParts[1]);
  return dateDifference || Number(leftParts[2]) - Number(rightParts[2]);
}

function git(root, args, encoding = "utf8") {
  return spawnSync("git", args, {
    cwd: root,
    encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function hasRepositoryHead(root) {
  const worktree = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (worktree.status !== 0 || worktree.stdout.trim() !== "true") {
    throw new Error("Publish version checks require a Git worktree; migrate the repository with .git history");
  }
  const head = git(root, ["rev-parse", "--verify", "HEAD"]);
  if (head.status === 0) return true;
  const message = head.stderr?.trim() || "unknown git error";
  if (/Needed a single revision|unknown revision|ambiguous argument 'HEAD'/.test(message)) {
    return false;
  }
  throw new Error(`Cannot inspect Git HEAD: ${message}`);
}

function readHeadFile(root, relative) {
  const result = git(root, ["show", `HEAD:${relative}`], null);
  if (result.status === 0) return result.stdout;
  const message = result.stderr?.toString().trim() || "unknown git error";
  if (/does not exist in 'HEAD'|exists on disk, but not in 'HEAD'/.test(message)) return null;
  throw new Error(`Cannot inspect HEAD:${relative}: ${message}`);
}

function assertPublishVersionAdvanced({
  currentIndex,
  headIndex,
  currentResources,
  headResources,
}) {
  if (headIndex === null) return [];
  const names = [...new Set([
    ...Object.keys(currentResources),
    ...Object.keys(headResources),
  ])].sort();
  const changed = names.filter(name => {
    const current = Object.hasOwn(currentResources, name) ? currentResources[name] : null;
    const previous = Object.hasOwn(headResources, name) ? headResources[name] : null;
    if (current === null || previous === null) return current !== previous;
    return !Buffer.from(current).equals(Buffer.from(previous));
  });
  if (!changed.length) return changed;

  const current = buildVersion(currentIndex);
  const previous = buildVersion(headIndex.toString());
  if (!current || !previous || compareBuildVersions(current, previous) <= 0) {
    throw new Error(
      `Cache-versioned publish resources changed (${changed.join(", ")}); bump meta[name=game-build] ` +
      `above ${previous || "the HEAD version"} before rebuilding`
    );
  }
  return changed;
}

function listCss(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listCss(full, relative);
    return entry.name.endsWith(".css") ? [relative.replace(/\\/g, "/")] : [];
  });
}

function headCss(root) {
  const result = git(root, ["ls-tree", "-r", "--name-only", "HEAD", "--", "publish"]);
  if (result.status !== 0) {
    throw new Error(
      `Cannot list HEAD publish resources: ${result.stderr?.trim() || "unknown git error"}`
    );
  }
  return result.stdout.split(/\r?\n/)
    .filter(file => file.startsWith("publish/") && file.endsWith(".css"))
    .map(file => file.slice("publish/".length));
}

function assertRepositoryPublishVersion(root, outputs, currentIndex) {
  if (!hasRepositoryHead(root)) return [];
  const publish = path.join(root, "publish");
  const headIndex = readHeadFile(root, "publish/index.html");
  const currentResources = Object.fromEntries(Object.entries(outputs).map(([name, code]) => [
    `bundles/${name}.min.js`,
    Buffer.from(code),
  ]));
  for (const relative of listCss(publish)) {
    currentResources[relative] = fs.readFileSync(path.join(publish, relative));
  }
  const names = new Set([...Object.keys(currentResources), ...headCss(root)]);
  const headResources = Object.fromEntries([...names].map(relative => [
    relative,
    readHeadFile(root, `publish/${relative}`),
  ]));
  return assertPublishVersionAdvanced({
    currentIndex,
    headIndex,
    currentResources,
    headResources,
  });
}

module.exports = {
  assertPublishVersionAdvanced,
  assertRepositoryPublishVersion,
  buildVersion,
  compareBuildVersions,
};
