"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
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

// 逐文件 git show 每次都要启动一个 git 进程，在慢文件系统上单次约 1 秒。
// 改用一次 cat-file --batch 批量取回全部 HEAD blob，语义不变（缺失返回 null）。
function readHeadFiles(root, relatives) {
  const result = new Map();
  if (!relatives.length) return result;
  const proc = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: relatives.map(relative => `HEAD:${relative}\n`).join(""),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    const message = proc.stderr?.toString().trim() || "unknown git error";
    throw new Error(`Cannot batch-read HEAD publish resources: ${message}`);
  }
  const buffer = proc.stdout;
  let offset = 0;
  for (const relative of relatives) {
    const newline = buffer.indexOf(10, offset);
    if (newline < 0) break;
    const header = buffer.subarray(offset, newline).toString("utf8").trim();
    offset = newline + 1;
    const matched = /^([0-9a-f]{40}) (\S+) (\d+)$/.exec(header);
    if (!matched) {
      result.set(relative, null);
      continue;
    }
    const size = Number(matched[3]);
    result.set(relative, buffer.subarray(offset, offset + size).toString("utf8"));
    offset += size + 1;
  }
  return result;
}

function assertPublishVersionAdvanced({
  currentIndex,
  headIndex,
  currentResources,
  headResources,
  // 调用方若已通过 blob 哈希算出变化清单，直接复用，避免再读一遍 HEAD 内容。
  changedNames,
}) {
  if (headIndex === null) return [];
  const names = [...new Set([
    ...Object.keys(currentResources),
    ...Object.keys(headResources ?? {}),
  ])].sort();
  const changed = changedNames ?? names.filter(name => {
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

// 一次 ls-tree 同时拿到 HEAD 下全部 publish 资源的 blob 哈希，
// 避免为了比对而逐个读取 HEAD 内容（在慢文件系统上每个 blob 约 300ms）。
function headBlobSha1s(root) {
  const result = git(root, ["ls-tree", "-r", "HEAD", "--", "publish"]);
  if (result.status !== 0) {
    throw new Error(
      `Cannot list HEAD publish resources: ${result.stderr?.trim() || "unknown git error"}`
    );
  }
  const map = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [meta, file] = line.split("\t");
    if (!file || !file.startsWith("publish/")) continue;
    map.set(file.slice("publish/".length), (meta.split(/\s+/)[2] || "").trim());
  }
  return map;
}

// git blob 哈希 = sha1("blob <size>\0" + 内容)，可与 ls-tree 输出直接比对。
function gitBlobSha1(content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return crypto.createHash("sha1").update(Buffer.concat([header, body])).digest("hex");
}

function assertRepositoryPublishVersion(root, outputs, currentIndex) {
  if (!hasRepositoryHead(root)) return [];
  const publish = path.join(root, "publish");
  const currentResources = Object.fromEntries(Object.entries(outputs).map(([name, code]) => [
    `bundles/${name}.min.js`,
    Buffer.from(code),
  ]));
  for (const relative of listCss(publish)) {
    currentResources[relative] = fs.readFileSync(path.join(publish, relative));
  }
  const head = headBlobSha1s(root);
  // 只对「带版本号缓存」的资源做比对：bundles/*.min.js 与 *.css（与 currentResources 同一命名空间）。
  // publish 下还有 assets/**、bundles/*.min.js.map 等未纳入 currentResources 的内容文件，
  // 若把它们并入比对集，current 恒为 null 而 head 有 sha，会被永久误判为「已变更」。
  const versionedResource = relative =>
    relative !== "index.html" &&
    (/^bundles\/[^/]+\.min\.js$/.test(relative) || relative.endsWith(".css"));
  const names = [...new Set([...Object.keys(currentResources), ...head.keys()])]
    .filter(versionedResource);
  // 先按 blob 哈希判断是否真有资源变化；没有变化就不必读取任何 HEAD 内容。
  const changed = names.filter(relative => {
    const current = Object.hasOwn(currentResources, relative)
      ? gitBlobSha1(currentResources[relative])
      : null;
    return current !== (head.get(relative) ?? null);
  });
  if (!changed.length) return [];
  // 版本号校验只需要 HEAD 的 index.html；变化清单已由上面的 blob 哈希比对得出，
  // 不必再读取 publish 下全部 HEAD blob（慢文件系统上每个 blob 约 180ms）。
  const blobs = readHeadFiles(root, ["publish/index.html"]);
  const headIndex = blobs.get("publish/index.html") ?? null;
  return assertPublishVersionAdvanced({
    currentIndex,
    headIndex,
    currentResources,
    headResources: {},
    changedNames: changed,
  });
}

module.exports = {
  assertPublishVersionAdvanced,
  assertRepositoryPublishVersion,
  buildVersion,
  compareBuildVersions,
};
