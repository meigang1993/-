"use strict";

/*
 * 聚合巡检：一次跑全部 5 项 pre-commit check + 行数巡检，
 * 统一输出每项状态 (PASS/FAIL) 与耗时，最后汇总。
 *
 * 与 .githooks/pre-commit 等价的快速本地验证。
 *
 * 用法: node tools/check-all.js
 * 退出码: 任一失败返回 1，全部通过返回 0。
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

// 项目特定 fallback: 当前终端 PATH 缺 git 时, 尝试本地安装路径。
// 让工具在任何终端都能直接跑, 不必重启加载 PowerShell profile。
const gitFallback = "E:\\AI\\Git\\cmd";
function buildEnv() {
  const env = { ...process.env };
  try {
    const probe = spawnSync("git", ["--version"], { encoding: "utf8", windowsHide: true });
    if (probe.status === 0) return env;
  } catch {}
  if (fs.existsSync(gitFallback)) {
    // Windows env key 大小写不敏感: 找到真实 key 再覆盖, 避免新增 PATH 覆盖 Path
    const pathKey = Object.keys(env).find(k => k.toLowerCase() === "path") || "PATH";
    env[pathKey] = gitFallback + ";" + (env[pathKey] || "");
  }
  return env;
}
const childEnv = buildEnv();

// 5 项 pre-commit check + 行数巡检
const checks = [
  { name: "check:bundles",       cmd: ["node", "tools/build-publish-bundles.js", "--check"] },
  { name: "check:static",        cmd: ["node", "tools/check-static.js"] },
  { name: "check:resources",    cmd: ["node", "tools/check-resources.js"] },
  { name: "check:asset-budget", cmd: ["node", "tools/check-asset-budget.js"] },
  { name: "check:scripts",      cmd: ["node", "tools/check-script-contracts.js"] },
  { name: "check:lines",        cmd: ["node", "tools/line-count.js", "--short"] },
];

const results = [];
const startAll = Date.now();

for (const c of checks) {
  const t0 = Date.now();
  const res = spawnSync(c.cmd[0], c.cmd.slice(1), {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: childEnv,
  });
  const ms = Date.now() - t0;
  const ok = res.status === 0;
  results.push({ name: c.name, ok, ms, stdout: res.stdout || "", stderr: res.stderr || "" });

  const flag = ok ? "PASS" : "FAIL";
  const head = `[${flag}] ${c.name.padEnd(20)} ${ms}ms`;

  if (ok) {
    const oneLine = (res.stdout || "").trim().split(/\r?\n/).pop() || "";
    console.log(`${head}  ${oneLine}`);
  } else {
    console.log(head);
    if (res.error) console.log(`        | spawn error: ${res.error.message}`);
    const stream = (res.stdout || "") + (res.stderr || "");
    const lines = stream.split(/\r?\n/).filter(Boolean);
    for (const l of lines.slice(0, 10)) console.log(`        | ${l}`);
    if (lines.length > 10) console.log(`        | ... (${lines.length - 10} more lines)`);
  }
}

const total = Date.now() - startAll;
const failed = results.filter(r => !r.ok);

console.log("-".repeat(72));
if (failed.length === 0) {
  console.log(`[OK] ${results.length}/${results.length} 通过, 总耗时 ${total}ms`);
  process.exit(0);
}
console.error(`[FAIL] ${failed.length}/${results.length} 失败, 总耗时 ${total}ms`);
for (const r of failed) console.error(`  - ${r.name}`);
process.exit(1);
