// 防呆巡检：工具/测试脚本用 vm 逐个加载 src 模块时，容易漏掉新模块，
// 而漏掉的症状是运行时才炸（如 window.GameSaveEpoch is undefined），
// 且往往在改动合入很久后才被发现。这里做静态检查，要求：
//   凡是加载了某个模块的文件，必须同时加载它声明的依赖。
// 规则表按需扩展（依赖既有模块的新增模块都应登记，防止再次漏配）。
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const toolsDir = path.join(root, "tools");

// dep -> 依赖它的模块（加载后者必须同时加载前者）
const REQUIRED = [
  { dep: "save-epoch.js", dependent: "store-state-factory.js",
    why: "store-state-factory 直接调用 window.GameSaveEpoch.current()" },
];

const SCAN = [toolsDir, path.join(root, "tests")];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") return;
      walk(full, out);
    } else if (entry.name.endsWith(".js")) out.push(full);
  });
  return out;
}

function main() {
  const files = SCAN.flatMap(dir => walk(dir));
  const violations = [];
  files.forEach(file => {
    const source = fs.readFileSync(file, "utf8");
    // 只看真正触发加载的字符串（数组清单或 loadRuntime 调用），注释里的提及不算
    const lines = source.split("\n").filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("*");
    });
    const body = lines.join("\n");
    REQUIRED.forEach(({ dep, dependent, why }) => {
      if (!body.includes(dependent)) return;
      if (body.includes(dep)) return;
      violations.push({ file: path.relative(root, file), dep, dependent, why });
    });
  });

  if (violations.length) {
    console.error(`[FAIL] 模块加载清单缺依赖 (${violations.length})`);
    violations.forEach(v => console.error(
      `  ${v.file}\n    加载了 ${v.dependent} 但未加载 ${v.dep}\n    原因: ${v.why}`));
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] 模块加载清单依赖完整 (${files.length} 个文件, ${REQUIRED.length} 条规则)`);
}

main();
