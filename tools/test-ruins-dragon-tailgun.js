// 机械AI龙 机尾机枪「每名角色回合限一次」+ 电钻火花连击对反击类技能只结算一次
//
// 两处真实 BUG：
//  1) 机尾机枪描述为「敌方一名角色出牌阶段…每名角色回合限一次」，但 ruinsGunFired
//     从不重置，实际退化成「每场战斗限一次」。
//  2) 电钻火花按骰子点数追加结算段数，_drillExtraHit 此前只保护贝尔蒂丝反击，
//     受击类（半魅魔血 / 精灵守护）按设计逐段结算，不做合并。
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "data-ruins-sand-city-enemies.js",
  "ruins-dragon-skills.js",
  "battle-damage-triggers.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
};

const mkDragon = () => ({
  uid: "d1", name: "机械AI龙", ai: "ruins_dragon", hp: 342, side: "enemy",
  hand: [{ name: "杀", type: "kill", suit: "♠" }], handLimit: 4,
  stats: { attack: 13, magic: 8, speed: 15 },
  ruinsHitsThisTurn: 0, ruinsGunFired: false,
});

// ---------- 场景A：机尾机枪 每名角色回合限一次 ----------
{
  const dragon = mkDragon();
  const state = { battle: { allies: [], enemies: [dragon], animQueue: [] } };
  const ally1 = { uid: "a1", name: "友方甲", side: "ally", hp: 300 };
  const ally2 = { uid: "a2", name: "友方乙", side: "ally", hp: 300 };

  // 第一个角色回合内开火一次
  dragon.ruinsGunFired = true;
  dragon.ruinsHitsThisTurn = 4;
  window.RuinsDragonSkills.allyTurnStart(state, ally1);
  check("A1 友方回合开始重置开火标记", dragon.ruinsGunFired === false,
    `ruinsGunFired=${dragon.ruinsGunFired}`);
  check("A2 友方回合开始重置受击计数", dragon.ruinsHitsThisTurn === 0,
    `ruinsHitsThisTurn=${dragon.ruinsHitsThisTurn}`);

  // 第二个角色回合同样重置 → 每名角色回合各能开火一次
  dragon.ruinsGunFired = true;
  dragon.ruinsHitsThisTurn = 4;
  window.RuinsDragonSkills.allyTurnStart(state, ally2);
  check("A3 第二个友方回合也重置（非每场战斗限一次）",
    dragon.ruinsGunFired === false && dragon.ruinsHitsThisTurn === 0,
    `fired=${dragon.ruinsGunFired} hits=${dragon.ruinsHitsThisTurn}`);

  // 敌方回合开始不应重置友方花色统计以外的龙状态（避免误伤）
  dragon.ruinsGunFired = true;
  window.RuinsDragonSkills.allyTurnStart(state, { uid: "e9", side: "enemy" });
  check("A4 敌方回合开始不重置龙的开火标记", dragon.ruinsGunFired === true,
    `ruinsGunFired=${dragon.ruinsGunFired}`);

  // 死亡音波的花色统计仍在友方回合开始清零
  const ally3 = { uid: "a3", side: "ally", suitsUsedThisTurn: { "♥": true } };
  window.RuinsDragonSkills.allyTurnStart(state, ally3);
  check("A5 友方花色统计仍按原逻辑清零",
    Object.keys(ally3.suitsUsedThisTurn || {}).length === 0);
}

// ---------- 场景B：电钻火花连击下 受击类只结算一次 ----------
{
  const calls = { hoshino: 0, bertis: 0 };
  window.HoshinoSkills = { afterDamage: () => { calls.hoshino += 1; } };
  window.BertisGerlotSkills = {
    afterDamage: () => { calls.bertis += 1; },
    refreshArrogance: () => {}, afterAnyDeath: () => {},
  };
  const api = {
    deps: { draw: () => 0, isKillCard: () => false, pushFloat: () => {} },
    ctx: { hasSkill: () => false, pushFloat: () => {}, queueSlashPlay: () => {}, statOf: () => 0 },
    damage: () => ({}), directDamage: () => {},
  };
  const triggers = window.BattleDamageTriggers(api);
  const state = { battle: { allies: [], enemies: [], animQueue: [] } };
  const actor = { uid: "d1", name: "机械AI龙", ai: "ruins_dragon", hp: 342, side: "enemy" };
  const target = { uid: "a1", name: "星野海一", ref: "hoshino_kaiichi", side: "ally", hp: 300 };

  // 第一段（_drillExtraHit 未置位）：受击类应触发
  triggers.afterDamage(state, actor, target, { name: "杀", type: "slash" }, 5, 0, actor);
  check("B1 第一段触发半魅魔血", calls.hoshino === 1, `hoshino=${calls.hoshino}`);
  check("B2 第一段触发贝尔蒂丝反击判定", calls.bertis === 1, `bertis=${calls.bertis}`);

  // 追加段（_drillExtraHit = true）：受击类与反击类均不得再触发
  for (let i = 0; i < 6; i += 1) {
    triggers.afterDamage(state, actor, target,
      { name: "杀", type: "slash", _drillExtraHit: true }, 5, 0, actor);
  }
  check("B3 追加段仍逐段触发半魅魔血（骰子6 → 共7次摸牌/交牌，属设计）",
    calls.hoshino === 7, `hoshino=${calls.hoshino}（应为7）`);
  check("B4 追加段不再触发贝尔蒂丝反击", calls.bertis === 1, `bertis=${calls.bertis}（应为1）`);
}

console.log(`\n汇总：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
