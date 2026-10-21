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
  // 时停标记表与登记表同理：battle-rules 的置灰判据读它，battle-skills 的技能逻辑写它。
  // 消费方补录：伊迪斯【无限暗刃】(beforeHeal) 与机械牛王【防御系统】(absorbDefense)
  // 都是在「被标记者自己的回合之外」触发的技能，跳过回合挡不住，必须显式守卫。
  {
    file: "mieryula-time-stop.js",
    consumers: [
      "battle-card-playability.js",
      "mieryula-skills.js",
      "edis-skills.js",
      "machine-factory-skills.js",
    ],
  },
  // 米尔尤拉【无谋霸姬】战术牌免疫：消费方横跨出牌判定、战术牌结算与伤害结算
  // （battle-card-playability / battle-card-tactics / battle-damage-lifecycle /
  //  battle-damage-resolution）。mieryula-skills.js 只是转发它，因此它必须排在
  //  skills 之前，否则转发时会因取不到全局而抛错。
  {
    file: "mieryula-tactic-immunity.js",
    consumers: ["mieryula-skills.js", "battle-card-playability.js"],
  },
  // 米尔尤拉技能模块：battle-rules 的置灰判据（无谋霸姬封锁战术牌）读它，
  // 本文件只在顶层定义、不在加载期调用依赖，因此同样适合打进两个包。
  {
    file: "mieryula-skills.js",
    consumers: ["battle-card-playability.js"],
  },
];

// 只在单个 bundle 内存在、但同样「缺文件即抛错」的拆出模块。
// 它们不需要打进多个包，因此不进 SHARED_SOURCES，但仍要参与顺序校验和夹具护栏
// ——否则一旦有人调整清单顺序，或某个 node 夹具只加载消费方，就会直接炸。
const ORDER_DEPENDENCIES = [
  {
    file: "ui-selection-tip.js",
    consumers: ["ui-hand-view.js"],
  },
];

const sharedFileNames = SHARED_SOURCES.map(entry => entry.file);

// 校验共享文件在单个 bundle 内的位置：必须早于该 bundle 内的任一消费方。
function sharedOrderFailures(bundles) {
  const failures = [];
  for (const [name, files] of Object.entries(bundles)) {
    if (!Array.isArray(files)) continue;
    for (const { file, consumers } of [...SHARED_SOURCES, ...ORDER_DEPENDENCIES]) {
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

module.exports = {
  SHARED_SOURCES,
  ORDER_DEPENDENCIES,
  sharedFileNames,
  sharedOrderFailures,
};
