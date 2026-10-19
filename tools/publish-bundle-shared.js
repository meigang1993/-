"use strict";

// 允许同一份源文件被打进多个 bundle 的显式白名单。
//
// 背景：登记表 skill-once-per-turn.js 原先只存在于 battle-rules，而 battle-skills
// 里的敌方技能守卫也要用它——属于跨包依赖。构建期用的是串行加载，当前顺序能保证
// 先定义后消费，但只要有人调整 bundle 顺序或新增消费方，就会变成
//「取不到全局 → 抛错 → 整场战斗出牌判定崩溃」的隐性雷。
//
// 因此把它同时打进两个包：每个包内自给自足，不再依赖另一个包的加载顺序。
// 共享文件必须满足：
//   1) 零依赖、纯声明式，重复执行幂等（后加载的覆盖先加载的，内容相同）；
//   2) 在每个引用它的 bundle 中排在所有消费方之前（顺序即装配依赖）。
const SHARED_SOURCES = [
  {
    file: "skill-once-per-turn.js",
    consumers: ["battle-card-playability.js", "ruins-enemy-skills.js"],
  },
];

const sharedFileNames = SHARED_SOURCES.map(entry => entry.file);

// 校验共享文件在单个 bundle 内的位置：必须早于该 bundle 内的任一消费方。
function sharedOrderFailures(bundles) {
  const failures = [];
  for (const [name, files] of Object.entries(bundles)) {
    if (!Array.isArray(files)) continue;
    for (const { file, consumers } of SHARED_SOURCES) {
      const at = files.indexOf(file);
      if (at < 0) continue;
      for (const consumer of consumers) {
        const consumerAt = files.indexOf(consumer);
        if (consumerAt >= 0 && consumerAt < at) {
          failures.push(
            `shared source ${file} must precede consumer ${consumer} in bundle ${name}`
          );
        }
      }
    }
  }
  return failures;
}

module.exports = { SHARED_SOURCES, sharedFileNames, sharedOrderFailures };
