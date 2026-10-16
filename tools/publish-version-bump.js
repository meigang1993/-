"use strict";

const fs = require("node:fs");
const path = require("node:path");

// 构建版本号形如 YYYYMMDD-N（见 publish-build-version.js 的 buildPattern）。
// 升版只递增序号、保留日期段，保证 compareBuildVersions 判定为「严格更新」。
const buildPattern = /^(\d{8})-(\d+)$/;

// 版本号同时以两种形态出现在产物里：
//   20260915-135  →  publish/index.html 的 meta、资源 ?v= 参数、publish/villa.css
//   26.0915.135   →  index.html 徽章、electron-entry/package.json 的 version
// 两种形态互不重叠（一个有连字符、一个有小数点），可安全地分别全量替换。
const targets = [
  { file: "publish/index.html", tokens: ["dash", "dotted"] },
  { file: "publish/villa.css", tokens: ["dash"] },
  { file: "electron-entry/package.json", tokens: ["dotted"] },
];

function nextBuildVersion(current) {
  const matched = buildPattern.exec(current);
  if (!matched) {
    throw new Error(`Cannot bump game-build: expected YYYYMMDD-N, got "${current}"`);
  }
  return `${matched[1]}-${Number(matched[2]) + 1}`;
}

function variants(current) {
  const matched = buildPattern.exec(current);
  const dotted = `${matched[1].slice(2, 4)}.${matched[1].slice(4)}.${matched[2]}`;
  return { dash: current, dotted };
}

// 把仓库内所有登记过的版本串推进到 next，返回改动摘要。
// 只在确实发生替换时才写盘，避免无谓地触碰文件时间戳。
function bumpRepositoryVersion(root, current) {
  const previous = variants(current);
  const next = variants(nextBuildVersion(current));
  const summary = [];
  for (const target of targets) {
    const full = path.join(root, target.file);
    if (!fs.existsSync(full)) continue;
    const before = fs.readFileSync(full, "utf8");
    let after = before;
    let count = 0;
    for (const kind of target.tokens) {
      if (previous[kind] === next[kind]) continue;
      const parts = after.split(previous[kind]);
      count += parts.length - 1;
      after = parts.join(next[kind]);
    }
    if (!count || after === before) continue;
    fs.writeFileSync(full, after);
    summary.push(`${target.file} ×${count}`);
  }
  return {
    previous: current,
    next: nextBuildVersion(current),
    summary: summary.join(", ") || "no files touched",
    changed: summary.length > 0,
  };
}

module.exports = { bumpRepositoryVersion, nextBuildVersion, targets };
