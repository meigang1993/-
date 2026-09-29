"use strict";
// QA 外部工具（eslint / stylelint / htmlhint / jscpd）装在永久目录 /data/workspace/qa-deps，
// 仓库里的 node_modules/.bin/*.exe 软链只是"接线"。沙箱重建会清掉 repo/node_modules，
// 导致 run-qa.js 对这些任务 ENOENT（表现为 0.00s 空转，看起来像跑过其实没跑）。
// 本脚本在每次 QA 启动前重新接线，缺哪个补哪个。
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const QA_DEPS = "/data/workspace/qa-deps";

// 永久目录里的真实入口
const SOURCES = {
  eslint: `${QA_DEPS}/node_modules/eslint/bin/eslint.js`,
  stylelint: `${QA_DEPS}/lib/node_modules/stylelint/bin/stylelint.mjs`,
  htmlhint: `${QA_DEPS}/lib/node_modules/htmlhint/bin/htmlhint`,
  jscpd: `${QA_DEPS}/lib/node_modules/jscpd/run-jscpd.js`,
};

// 除了 .bin 里的可执行文件，有些工具是被 require() 进来用的（比如 terser 供
// build-publish-bundles.js 压缩产物）。这类也要接成包级软链，否则 require 报
// MODULE_NOT_FOUND，check:bundles 直接挂掉。
// 元素可以是包名字符串（取 永久目录/node_modules/<name>），
// 也可以是 { name, abs } 指定绝对路径（给不在 npm 主目录里的包用）。
const MODULES = [
  "terser",
  "source-map",
  "acorn",
  "ajv",
  "@jridgewell",
  "@eslint",
  "globals",
  // ffmpeg-static 是自建的最小替身包，放在 lib/node_modules（与 stylelint/jscpd 同层）而不是
  // npm 主目录——真实包的 postinstall 要从 github.com 下二进制，沙箱内不可达。
  // 缺它 tools/test-audio-loading.js 会 MODULE_NOT_FOUND。
  { name: "ffmpeg-static", abs: `${QA_DEPS}/lib/node_modules/ffmpeg-static` },
];

function symlinkPackage(entry) {
  const { name, target } = typeof entry === "string"
    ? { name: entry, target: path.join(QA_DEPS, "node_modules", entry) }
    : { name: entry.name, target: entry.abs };
  if (!fs.existsSync(target)) return { name: `pkg:${name}`, ok: false, reason: "永久目录缺少该包" };
  const dir = path.join(root, "node_modules");
  fs.mkdirSync(dir, { recursive: true });
  const linkPath = path.join(dir, name);
  let current;
  try {
    current = fs.readlinkSync(linkPath);
  } catch (_) {
    current = null;
  }
  if (current !== target) {
    fs.rmSync(linkPath, { force: true });
    fs.symlinkSync(target, linkPath);
  }
  return { name: `pkg:${name}`, ok: true, relinked: current !== target };
}

function link(name, target) {
  if (!fs.existsSync(target)) return { name, ok: false, reason: "永久目录缺少该工具" };
  const dir = path.join(root, "node_modules", ".bin");
  fs.mkdirSync(dir, { recursive: true });
  const linkPath = path.join(dir, name);
  let current;
  try {
    current = fs.readlinkSync(linkPath);
  } catch (_) {
    current = null;
  }
  if (current !== target) {
    fs.rmSync(linkPath, { force: true });
    fs.symlinkSync(target, linkPath);
  }
  try {
    fs.chmodSync(target, 0o755);
  } catch (_) { /* 只读介质忽略 */ }
  return { name, ok: true, relinked: current !== target };
}

function ensure() {
  return [
    ...Object.entries(SOURCES).map(([name, target]) => link(name, target)),
    ...MODULES.map(symlinkPackage),
  ];
}

if (require.main === module) {
  const rows = ensure();
  for (const r of rows) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.relinked ? " (已重新接线)" : ""}${r.reason ? " — " + r.reason : ""}`);
  }
  const bad = rows.filter(r => !r.ok);
  if (bad.length) {
    console.error("以下工具在永久目录不可用，lint 会空转：", bad.map(b => b.name).join(", "));
    process.exit(1);
  }
}

module.exports = { ensure, SOURCES, QA_DEPS };
