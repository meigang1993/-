// 拆分感知的源码视图（测试固件专用，不参与产品 bundle）
//
// 三个主文件已各拆出一个子模块（见 check-split-assembly.js）。大量历史测试固件
// 按「单个文件名」读源码做静态断言，或把单个文件名交给 vm 执行；拆分后若仍只读
// 主文件，静态断言会因代码搬到子模块而假红，vm 会因装配点显式抛错而直接崩。
//
// sourceOf(file) 对这三个主文件返回「子模块源码 + 主文件源码」的拼接视图（子在前，
// 与 publish-bundles.json 的加载顺序一致）：
//   · 静态断言：仍能在模块簇里找到搬走的代码，语义不变；
//   · vm 加载：一次执行就把子模块挂上、主文件装配成功；
//   · REVERT 反向验证：要替换的代码仍在视图里，能精准命中。
// 其它文件原样返回，读取路径可以是文件名或完整路径。
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "..", "src", "original");
const SUBS = Object.freeze({
  "ruins-dragon-skills.js": ["ruins-dragon-tailgun.js"],
  "local-core-dungeon.js": ["local-core-dungeon-settlement.js"],
  "ruins-elite-skills.js": ["ruins-elite-prepare-skills.js"],
  "battle-damage-resolution.js": ["battle-damage-resolution-modifiers.js"],
});

function sourceOf(file) {
  const p = String(file);
  const name = path.basename(p);
  // 非拆分目标（文档、配置、其它源码）：按调用方给的路径原样读，绝不改写路径。
  if (!SUBS[name]) return fs.readFileSync(p, "utf8");
  const main = fs.readFileSync(path.join(DIR, name), "utf8");
  const subs = SUBS[name]
    .map(sub => fs.readFileSync(path.join(DIR, sub), "utf8"));
  return `${subs.join("\n")}\n${main}`;
}

module.exports = { SUBS, sourceOf };
