// 批量实战套件：串行跑完所有 tools/test-*-live.js，汇总 PASS/FAIL
// 用法: node tools/run-live-suite.js [--only=关键字] [--timeout=秒]
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const toolsDir = path.join(root, "tools");

const argv = process.argv.slice(2);
const onlyArg = (argv.find(a => a.startsWith("--only=")) || "").split("=")[1];
const timeoutArg = Number((argv.find(a => a.startsWith("--timeout=")) || "--timeout=180").split("=")[1]);

const files = fs.readdirSync(toolsDir)
  .filter(f => /^test-.*-live\.js$/.test(f))
  .filter(f => !onlyArg || f.includes(onlyArg))
  .sort();

const runOne = (file) => new Promise(resolve => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [path.join(toolsDir, file)], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    // 统一注入浏览器路径：部分脚本自身未设置，会落到 /root/.cache 找不到可执行文件
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers" },
  });
  let out = "";
  child.stdout.on("data", d => out += d);
  child.stderr.on("data", d => out += d);
  const timer = setTimeout(() => { child.kill("SIGKILL"); out += "\n[TIMEOUT]"; }, timeoutArg * 1000);
  child.on("close", code => {
    clearTimeout(timer);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    // 判定：子进程退出码 0 且未出现失败标记
    const failed = code !== 0 || /失败 [1-9]|\bFAIL\b|\[TIMEOUT\]/.test(out);
    resolve({ file, code, secs, failed, out });
  });
});

(async () => {
  console.log(`批量实战套件：${files.length} 个脚本，单脚本超时 ${timeoutArg}s`);
  const results = [];
  for (const f of files) {
    const r = await runOne(f);
    results.push(r);
    console.log(`${r.failed ? "❌" : "✅"} ${f}  exit=${r.code}  ${r.secs}s`);
  }
  const bad = results.filter(r => r.failed);
  console.log(`\n汇总: ${results.length - bad.length} 通过 / ${bad.length} 失败  总耗时 ${(results.reduce((a, b) => a + Number(b.secs), 0)).toFixed(0)}s`);
  if (bad.length) {
    console.log("\n--- 失败详情 ---");
    for (const b of bad) {
      console.log(`\n### ${b.file} (exit=${b.code})`);
      console.log(b.out.split("\n").filter(l => /失败|FAIL|❌|Error|TIMEOUT/.test(l)).slice(0, 12).join("\n"));
    }
  }
  process.exit(bad.length ? 1 : 0);
})();
