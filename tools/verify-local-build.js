#!/usr/bin/env node
/**
 * 本地构建对比验证脚本
 *
 * 用途：验证你本地 `npm run build:bundles` 的产物
 *      与 AI 协助环境（容器）生成的产物是否逐字节一致。
 *
 * 用法（在项目根目录）：
 *   node tools/verify-local-build.js            # 只对比，不构建
 *   node tools/verify-local-build.js --bump     # 先自动推进版本号，再构建，再对比
 *   node tools/verify-local-build.js --build    # 只构建，再对比（不自动改版本号）
 *
 * 前置条件：
 *   1. 已 git pull 到含修复的最新提交
 *   2. publish/bundles/ 与 HEAD 不一致时必须先 bump 版本号，
 *      否则 assertRepositoryPublishVersion 会抛错导致构建失败
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const bundlesDir = path.join(root, "publish", "bundles");

// 容器构建产物的 SHA256（terser 5.49.0，版本 20260908-01）
const expected = {
  "battle-ai.min.js": "f570dcf006fcabc4d7375b2753ac6023431180be78b89542bd67feb296fc11e7",
  "battle-flow.min.js": "38b11a655b99f6bb2c0039c6e2989cacd967ac1f8a0d829fc12cb339fdbd873a",
  "battle-presentation.min.js": "1b18fcd9692fbcf99b505742c57894f51b34b3a5bc3597ea17f4acedc8d89571",
  "battle-rules.min.js": "2ffcb996f53ae806e842f69df6cbfc4dd4cfc31b7ef048007dc0a9db1b1773a3",
  "battle-skills.min.js": "1102ed24bac0db77f493ded8ba426b8c0ae08363714b256bf38f530adf2ada97",
  "battle-ui.min.js": "9bffc2482091990b56e8c6c1486e69607daa7751cd3dbe6921356382fe6e8906",
  "dungeon.min.js": "d41669b01d335cd12eef9c5910c5f378b0a31036c89674be25c7346d8e7527b9",
  "hall.min.js": "6ddf418c96e167a8ff789d73d9c1b035e2ed9ab20000081d6b86799c415d7b5e",
  "startup-app.min.js": "00ef93793892cbc404bb87e106c15a2996b5a85eb910457a9450077f15128992",
  "startup-store.min.js": "a0b16364a2301e8a657c16e55456dc046203dc39ef08320ec9f95704fa7f581c",
  "startup.min.js": "9de462f4dd21a0db8773fc8bfdad3853e0a220eab07491146b60e2e153bd9370",
};

const TARGET_VERSION = "20260908-01";
const TARGET_BADGE = "v26.0908.01";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function currentBuildVersion() {
  const html = fs.readFileSync(path.join(root, "publish", "index.html"), "utf8");
  return html.match(/<meta\b[^>]*\bname=["']game-build["'][^>]*\bcontent=["']([^"']+)["']/i)?.[1] || "";
}

function headBuildVersion() {
  const r = git(["show", "HEAD:publish/index.html"]);
  if (r.status !== 0) return null;
  return r.stdout.match(/<meta\b[^>]*\bname=["']game-build["'][^>]*\bcontent=["']([^"']+)["']/i)?.[1] || "";
}

// ── 步骤 1：按需推进版本号（3 处，缺一不可）──
function bumpVersion() {
  const cur = currentBuildVersion();
  const head = headBuildVersion();
  console.log("=== 版本号状态 ===");
  console.log(`  当前 index.html : ${cur}`);
  console.log(`  HEAD 版本       : ${head || "(无)"}`);
  if (cur === TARGET_VERSION) {
    console.log(`  ✅ 已是目标版本 ${TARGET_VERSION}，跳过 bump`);
    return true;
  }
  console.log(`  → 推进到 ${TARGET_VERSION}（3 处）`);

  // 1) index.html meta + 所有 v= 引用
  const idxPath = path.join(root, "publish", "index.html");
  let html = fs.readFileSync(idxPath, "utf8");
  html = html.replace(new RegExp(cur.replace(/[-]/g, "-"), "g"), TARGET_VERSION);
  fs.writeFileSync(idxPath, html);
  console.log("     ✅ index.html meta/v= 已更新");

  // 2) villa.css 的 4 行 @import ?v=
  const cssPath = path.join(root, "publish", "villa.css");
  if (fs.existsSync(cssPath)) {
    let css = fs.readFileSync(cssPath, "utf8");
    css = css.replace(/v=\d{8}-\d+/g, `v=${TARGET_VERSION}`);
    fs.writeFileSync(cssPath, css);
    console.log("     ✅ villa.css @import 已更新");
  }

  // 3) build badge 显示文本（格式 v26.0908.01，正则 \d{8}-\d+ 匹配不到）
  html = fs.readFileSync(idxPath, "utf8");
  html = html.replace(/v26\.\d{4}\.\d{2}/g, TARGET_BADGE);
  fs.writeFileSync(idxPath, html);
  console.log(`     ✅ build badge 已更新为 ${TARGET_BADGE}`);
  return true;
}

// ── 步骤 2：构建 ──
function build() {
  console.log("\n=== 执行 npm run build:bundles ===");
  const r = spawnSync("npm", ["run", "build:bundles"], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0) {
    console.log("  ❌ 构建失败（退出码 " + r.status + "）");
    console.log(out.split("\n").slice(0, 12).map(l => "     " + l).join("\n"));
    return false;
  }
  console.log("  ✅ 构建成功");
  console.log(out.trim().split("\n").filter(Boolean).slice(-2).map(l => "     " + l).join("\n"));
  return true;
}

// ── 步骤 3：对比哈希 ──
function compare() {
  console.log("\n=== 与容器产物对比（SHA256）===");
  let pass = 0, fail = 0, missing = 0;
  for (const [name, want] of Object.entries(expected)) {
    const file = path.join(bundlesDir, name);
    if (!fs.existsSync(file)) {
      console.log(`  ⬜ ${name.padEnd(26)} 文件不存在`);
      missing++;
      continue;
    }
    const got = sha256(file);
    if (got === want) {
      console.log(`  ✅ ${name.padEnd(26)} 一致`);
      pass++;
    } else {
      console.log(`  ❌ ${name.padEnd(26)} 不一致`);
      console.log(`       期望 ${want}`);
      console.log(`       实际 ${got}`);
      fail++;
    }
  }
  console.log(`\n  结果: 一致 ${pass} / 不一致 ${fail} / 缺失 ${missing}`);
  if (fail === 0 && missing === 0) {
    console.log("  🎉 本地构建产物与容器产物逐字节一致，可以放心提交发布");
  } else if (missing > 0 && pass === 0) {
    console.log("  ⚠️  未找到 bundle，请先构建");
  } else {
    console.log("  ⚠️  存在差异。常见原因：terser 版本不符（须 5.49.0）、源码未 pull 到最新、版本号不同");
  }
  return fail === 0 && missing === 0;
}

// ── 步骤 4：跑 --check（pre-commit 第一道）──
function runCheck() {
  console.log("\n=== 运行 --check（pre-commit 第一道）===");
  const r = spawnSync("node", ["tools/build-publish-bundles.js", "--check"], {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  const out = ((r.stdout || "") + (r.stderr || "")).trim();
  if (r.status === 0) {
    console.log("  ✅ " + out);
    return true;
  }
  console.log("  ❌ " + out.split("\n").slice(0, 5).join("\n     "));
  return false;
}

// ── main ──
const args = process.argv.slice(2);
console.log("魅魔杀 · 本地构建对比验证");
console.log("目标版本: " + TARGET_VERSION + "\n");

let ok = true;
if (args.includes("--bump")) ok = bumpVersion() && build();
else if (args.includes("--build")) ok = build();

const cmp = compare();
const chk = runCheck();

console.log("\n" + "=".repeat(52));
console.log(cmp && chk ? "✅ 全部通过：产物一致且 --check 通过" : "❌ 存在问题，见上方输出");
process.exit(cmp && chk ? 0 : 1);
