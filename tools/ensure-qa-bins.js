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
  // playwright 与 playwright-core 装在 lib3（独立目录）：主目录 node_modules 被 npm
  // 反复改写时会把这两个包弄残缺，表现为 cli.js 找不到 ./lib/program。
  { name: "playwright", abs: `${QA_DEPS}/lib3/node_modules/playwright` },
  { name: "playwright-core", abs: `${QA_DEPS}/lib3/node_modules/playwright-core` },
  // 整个 @playwright scope 都要来自 lib3：只接 test 的话，它向上找 playwright 时会
  // 掉进 NODE_PATH 里的系统旧版（1.63），报 "two different versions"。
  { name: "@playwright", abs: `${QA_DEPS}/lib3/node_modules/@playwright` },
  // 无障碍用例直接 require("axe-core/axe.min.js")
  { name: "axe-core", abs: `${QA_DEPS}/lib3/node_modules/axe-core` },
];

function symlinkPackage(entry) {
  const { name, target } = typeof entry === "string"
    ? { name: entry, target: path.join(QA_DEPS, "node_modules", entry) }
    : { name: entry.name, target: entry.abs };
  if (!fs.existsSync(target)) return { name: `pkg:${name}`, ok: false, reason: "永久目录缺少该包" };
  const dir = path.join(root, "node_modules");
  fs.mkdirSync(dir, { recursive: true });
  const linkPath = path.join(dir, name);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  let current;
  let isLink = true;
  try {
    current = fs.readlinkSync(linkPath);
  } catch (_) {
    current = null;
    isLink = false;
  }
  // 仓库自己装了真实包（不是软链）就别覆盖，避免把可用目录换成软链。
  if (!isLink && fs.existsSync(path.join(linkPath, "package.json"))) {
    return { name: `pkg:${name}`, ok: true, skipped: true, reason: "仓库自带该包" };
  }
  if (current !== target) {
    fs.rmSync(linkPath, { force: true, recursive: true });
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

// playwright 是仓库自带的（不在永久目录），但 node_modules 被沙箱重建清过之后
// .bin/playwright 会指向一个已经不存在的路径，run-browser-tests.js 里 spawn 直接
// ENOENT，表现为"测试没跑"。这里在每次 QA 启动前把悬空软链重新指回包内入口。
const LOCAL_BINS = [
  { name: "playwright", rel: "../playwright/cli.js" },
];

function ensureLocalBins() {
  const binDir = path.join(root, "node_modules", ".bin");
  fs.mkdirSync(binDir, { recursive: true });
  return LOCAL_BINS.map(({ name, rel }) => {
    const cli = path.resolve(binDir, rel);
    if (!fs.existsSync(cli)) return { name, ok: true, skipped: true, reason: "仓库未安装该包" };
    const linkPath = path.join(binDir, name);
    let current;
    try {
      current = fs.readlinkSync(linkPath);
    } catch (_) {
      current = null;
    }
    const valid = !!current && fs.existsSync(path.resolve(binDir, current));
    if (!valid) {
      fs.rmSync(linkPath, { force: true });
      fs.symlinkSync(rel, linkPath);
    }
    return { name, ok: true, relinked: !valid };
  });
}

// playwright 的浏览器二进制装在永久目录 /data/workspace/.pw-browsers，但它默认去
// ~/.cache/ms-playwright 找。沙箱重建会清掉 HOME 下的缓存，浏览器测试就变成 ENOENT
// 空转（"看起来跑了其实没跑"）。这里把搜索路径指到永久目录，并校验二进制在位。
const BROWSER_DIR = "/data/workspace/.pw-browsers";

function ensureBrowserCache() {
  if (!fs.existsSync(BROWSER_DIR)) {
    return [{ name: "browsers", ok: true, skipped: true, reason: "永久目录无浏览器缓存" }];
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSER_DIR;
  const shells = fs.readdirSync(BROWSER_DIR)
    .filter(entry => /^chromium_headless_shell-\d+$/.test(entry))
    .filter(entry => {
      const bin = path.join(BROWSER_DIR, entry, "chrome-headless-shell-linux64", "chrome-headless-shell");
      return fs.existsSync(bin);
    });
  const full = fs.readdirSync(BROWSER_DIR)
    .filter(entry => /^chromium-\d+$/.test(entry))
    .filter(entry => fs.existsSync(path.join(BROWSER_DIR, entry, "chrome-linux64", "chrome")));
  const ok = shells.length > 0 && full.length > 0;
  return [{
    name: "browsers",
    ok,
    relinked: true,
    reason: ok
      ? `headless shell ${shells.join(",")} / chromium ${full.join(",")}`
      : "永久目录缺少可用的 chromium 二进制",
  }];
}

function ensure() {
  return [
    ...Object.entries(SOURCES).map(([name, target]) => link(name, target)),
    ...MODULES.map(symlinkPackage),
    ...ensureLocalBins(),
    ...ensureBrowserCache(),
  ];
}

if (require.main === module) {
  const rows = ensure();
  for (const r of rows) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}${r.relinked ? " (已重新接线)" : ""}${r.skipped ? " (跳过)" : ""}${r.reason ? " — " + r.reason : ""}`);
  }
  const bad = rows.filter(r => !r.ok);
  if (bad.length) {
    console.error("以下工具在永久目录不可用，lint 会空转：", bad.map(b => b.name).join(", "));
    process.exit(1);
  }
}

module.exports = { ensure, SOURCES, QA_DEPS };
