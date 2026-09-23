"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const message = process.argv.slice(2).join(" ") || "开发检查并保存游戏修改";

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function hasRuntimeChanges() {
  const result = spawnSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.stdout.split(/\r?\n/).some(file =>
    file.startsWith("src/original/") || file.startsWith("publish/"));
}

function pathCheck() {
  const result = spawnSync("bash", ["-lc",
    "find publish \\( -type f -o -type d \\) 2>/dev/null | LC_ALL=C grep -nP '[^\\x00-\\x7f]| ' || true",
  ], { cwd: root, encoding: "utf8" });
  if (result.stdout.trim()) {
    console.error("保存前检查失败：publish 下存在非 ASCII 或含空格路径：");
    console.error(result.stdout.trim());
    process.exit(1);
  }
}

function save() {
  const config = [
    `header = "X-Container-Secret: ${process.env.CONTAINER_SECRET || ""}"`,
    `header = "X-Provisioning-Generation: ${process.env.PROVISIONING_GENERATION || ""}"`,
    `header = "X-Provisioning-Token: ${process.env.PROVISIONING_TOKEN || ""}"`,
    "header = \"Content-Type: application/json\"",
    `data = ${JSON.stringify(JSON.stringify({ message }))}`,
  ].join("\n");
  const result = spawnSync("curl", [
    "--fail-with-body", "-sS", "-X", "POST",
    "http://localhost:3005/git/save", "-K", "-",
  ], { cwd: root, input: config, encoding: "utf8", stdio: ["pipe", "inherit", "inherit"] });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!process.env.CONTAINER_SECRET || !process.env.PROVISIONING_GENERATION || !process.env.PROVISIONING_TOKEN) {
  console.error("保存失败：CONTAINER_SECRET、PROVISIONING_GENERATION、PROVISIONING_TOKEN 必须全部存在。");
  process.exit(1);
}

run(process.execPath, ["tools/install-git-hooks.js", "--check"]);
pathCheck();
if (hasRuntimeChanges()) run(process.execPath, ["tools/build-publish-bundles.js"]);
run(process.execPath, ["tools/run-qa.js", "quick"]);
save();
console.log("\n保存完成。请切换到 Preview 面板并点击刷新查看最新效果。");
