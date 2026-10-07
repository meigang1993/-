// 防止拆分模块「静默兜底」退化与「加载顺序」错位的护栏。
//
// 背景：拆分子文件后，主文件通过 window 全局组装子模块。早期写法是
//   const sub = window.X?.() || {};
// 一旦子文件漏加载，方法会「无声消失」——例如封印/燃烧动画不播、面板状态标记不显示、
// 多段剩余段丢失，且不产生任何报错，排查成本极高。现已改为显式抛错（快速失败）。
//
// 本检查锁住两条不变量：
//   1) 装配点不得再出现 `|| {}` / `||{}` 之类的静默兜底，必须带显式依赖报错；
//   2) publish-bundles.json 中，子模块文件必须排在主文件之前（顺序即装配依赖）。
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src", "original");

// 主文件 -> 其依赖的子模块挂载名
const SPLITS = [
  {
    main: "battle-effect-card-transfers.js",
    deps: ["BattleEffectCardTransfersExit"],
  },
  {
    main: "ui-info.js",
    deps: ["GameUIInfoMarks"],
  },
  {
    main: "battle-reaction-queue.js",
    deps: ["BattleReactionQueueStore", "BattleReactionQueueRun"],
  },
];

const failures = [];

// ── 不变量 1：装配点必须是显式报错，不能静默兜底 ────────────────────────────
for (const { main, deps } of SPLITS) {
  const file = path.join(srcDir, main);
  if (!fs.existsSync(file)) {
    failures.push(`${main}: 文件不存在`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const dep of deps) {
    // 找到引用该依赖的那一行
    const line = text.split("\n").find((l) => l.includes(dep));
    if (!line) {
      failures.push(`${main}: 找不到对 ${dep} 的引用，装配关系可能已被删除`);
      continue;
    }
    if (/\|\|\s*\{\s*\}/.test(line)) {
      failures.push(
        `${main}: ${dep} 的装配点回退成了静默兜底 \`|| {}\`，子文件漏加载时会无声丢失方法`
      );
      continue;
    }
    // 同一装配块内必须存在显式报错（throw）
    const idx = text.indexOf(line);
    const window_ = text.slice(Math.max(0, idx - 200), idx + 600);
    if (!/throw\s+new\s+Error/.test(window_)) {
      failures.push(
        `${main}: ${dep} 的装配点缺少显式报错，漏加载时不会快速失败`
      );
    }
  }
}

// ── 不变量 2：bundle 清单里子模块必须排在主文件之前 ────────────────────────
const bundlesPath = path.join(root, "tools", "publish-bundles.json");
if (!fs.existsSync(bundlesPath)) {
  failures.push("publish-bundles.json 不存在");
} else {
  const bundles = JSON.parse(fs.readFileSync(bundlesPath, "utf8"));
  // 主文件 -> 子模块文件名（去掉 .js 便于前缀匹配）
  const depFiles = {
    "battle-effect-card-transfers.js": ["battle-effect-card-transfers-exit.js"],
    "ui-info.js": ["ui-info-marks.js"],
    "battle-reaction-queue.js": [
      "battle-reaction-queue-store.js",
      "battle-reaction-queue-run.js",
    ],
  };
  for (const [main, subs] of Object.entries(depFiles)) {
    let found = false;
    for (const [name, files] of Object.entries(bundles)) {
      if (!Array.isArray(files)) continue;
      const mi = files.indexOf(main);
      if (mi < 0) continue;
      found = true;
      for (const sub of subs) {
        const si = files.indexOf(sub);
        if (si < 0) {
          failures.push(`[${name}] ${main} 在册，但依赖的 ${sub} 缺失`);
        } else if (si > mi) {
          failures.push(
            `[${name}] ${sub}(idx ${si}) 排在 ${main}(idx ${mi}) 之后，装配时会拿到 undefined`
          );
        }
      }
    }
    if (!found) failures.push(`${main} 未出现在任何 bundle 清单中`);
  }
}

if (failures.length) {
  console.log("[FAIL] split assembly");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("[PASS] split assembly (3 splits, 显式报错 + 顺序)");
