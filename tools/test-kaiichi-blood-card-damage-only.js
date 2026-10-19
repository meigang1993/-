// 星野海一 ·【半魅魔血】触发口径专项
//
// 设定：半魅魔血只由「实体牌或虚拟牌」造成的伤害触发。
// 技能造成的追加伤害（电钻火花/疯狂刺刀 type:"skill"）、技能牌（_skill，
// 如猛龙断空斩）、状态类技能伤害（燃烧/锁魂镰刀）都不属于牌伤害，不触发。
//
// 虚拟牌（螺旋桨、组合进攻、追魂之刃重放、疯狂射击转化等）虽然带 virtual，
// 但 type 仍是卡牌类型（slash/tactic），属于「虚拟牌」，应当触发。
const {
  assert,
  combat,
  scenario,
} = require("./kaiichi-reaction-harness");

let pass = 0, fail = 0;
const T = (name, cond, extra) => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`); }
  return !!cond;
};

// 每次用一个全新战斗，避免上一例的 kaiichiShare / locked 残留影响下一例
function freshKaiichi(withMate) {
  const state = scenario([], []).state;
  const kaiichi = {
    uid: "kaiichi", name: "星野海一", ref: "hoshino_kaiichi", side: "ally",
    hp: 100, maxHp: 100, block: 0, intent: 1,
    // 交牌以手牌数为上限（min(2, hand.length)），空手牌时本就不该进入交牌流程
    hand: [{ name: "闪", type: "response", suit: "♠" }],
    stats: { attack: 1, magic: 1, speed: 1, maxHp: 100, handLimit: 4, drawPerTurn: 2 },
    skills: [{ name: "半魅魔血", type: "trigger" }],
  };
  const foe = {
    uid: "foe", name: "测试敌人", ref: "foe", side: "enemy",
    hp: 100, maxHp: 100, block: 0, hand: [], intent: 1,
    stats: { attack: 1, magic: 1, speed: 1, maxHp: 100, handLimit: 4, drawPerTurn: 2 },
    skills: [],
  };
  const mate = {
    uid: "mate", name: "测试队友", ref: "mate", side: "ally",
    hp: 100, maxHp: 100, block: 0, hand: [], intent: 1,
    stats: { attack: 1, magic: 1, speed: 1, maxHp: 100, handLimit: 4, drawPerTurn: 2 },
    skills: [],
  };
  Object.assign(state.battle, {
    allies: withMate ? [kaiichi, mate] : [kaiichi],
    enemies: [foe], activeUid: foe.uid, phase: 4,
    locked: false, kaiichiShare: null, animQueue: [],
  });
  state.log = [];
  window.state = state;
  return { state, kaiichi, foe, mate };
}

// 返回本次是否触发（触发 = 摸了牌）
function triggerWith(card, { hpLoss = 5, withMate = false } = {}) {
  const { state, kaiichi, foe } = freshKaiichi(withMate);
  const draws = [];
  const deps = {
    draw: (target, count) => { draws.push(count); return []; },
    damage: combat.damage,
    pushFloat: () => {},
  };
  window.HoshinoSkills.afterDamage(state, foe, kaiichi, card, hpLoss, deps);
  return {
    triggered: draws.length > 0,
    draws: draws.slice(),
    shared: !!state.battle.kaiichiShare,
    logs: (state.log || []).map(String),
  };
}

const ENTITY_SLASH = {
  name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack",
};
const VIRTUAL_SLASH = {
  name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack",
  virtual: true, _entitySourceCard: ENTITY_SLASH, _skipHandMove: true,
};
const VIRTUAL_PROPELLER = {
  name: "杀（普攻）", type: "slash", suit: "", power: 0, scale: "attack",
  virtual: true, temporary: true, void: true, noIntentCost: true,
  generatedBySkill: "螺旋桨",
};
const VIRTUAL_TACTIC = {
  name: "决斗", type: "tactic", virtual: true, _skipHandMove: true,
};
const ENTITY_TACTIC = { name: "决斗", type: "tactic", suit: "♥" };
const CONVERTED_SLASH = {
  name: "机枪扫杀", type: "slash", suit: "♠", power: 0, scale: "attack",
  convertedFrom: "杀（普攻）",
};
const DRILL_EXTRA = {
  name: "电钻火花", type: "skill", _drillExtraHit: true,
  ignoreResponse: true, skipDamageModify: true,
};
const CRAZY_BAYONET = { name: "疯狂刺刀", type: "skill", _drillExtraHit: true };
const BURNING = { name: "燃烧", type: "skill", fire: true, burningTick: true };
const SOUL_SCYTHE = {
  name: "锁魂镰刀", type: "skill", soulScythe: true, magicDamage: true,
};
const SKILL_CARD_DRAGON = {
  name: "猛龙断空斩", _skill: true, dragonSlash: true, targetless: true,
};
const SKILL_CARD_STEAL = {
  name: "窃取", type: "tactic", _skill: true, catherineSteal: true,
};

console.log("【应当触发】实体牌与虚拟牌造成的伤害");
{
  const r = triggerWith(ENTITY_SLASH);
  T("实体单体【杀】触发", r.triggered === true, r);
  T("实体单体【杀】触发后写入半魅魔血日志",
    r.logs.some(t => /半魅魔血/.test(t)) === true, r);
}
{
  // 交牌需要「一名其他友方角色」，单独一人时本就不该进入交牌流程
  const r = triggerWith(ENTITY_SLASH, { withMate: true });
  T("有队友时进入交牌流程", r.shared === true, r);
}
{
  const r = triggerWith(ENTITY_SLASH);
  T("无其他友方角色时不进入交牌流程（仍照常摸牌）",
    r.triggered === true && r.shared === false, r);
}
{
  const r = triggerWith(VIRTUAL_SLASH);
  T("虚拟【杀】（带实体源牌）触发", r.triggered === true, r);
}
{
  const r = triggerWith(VIRTUAL_PROPELLER);
  T("虚拟【杀】（螺旋桨生成，无实体源牌）触发", r.triggered === true, r);
}
{
  const r = triggerWith(VIRTUAL_TACTIC);
  T("虚拟战术牌触发", r.triggered === true, r);
}
{
  const r = triggerWith(ENTITY_TACTIC);
  T("实体战术牌触发", r.triggered === true, r);
}
{
  const r = triggerWith(CONVERTED_SLASH);
  T("转换杀（convertedFrom，实为实体牌）触发", r.triggered === true, r);
}

console.log("\n【不应触发】技能伤害与技能牌");
{
  const r = triggerWith(DRILL_EXTRA);
  T("电钻火花追加段（type:skill）不触发", r.triggered === false, r);
}
{
  const r = triggerWith(CRAZY_BAYONET);
  T("疯狂刺刀追加段（type:skill）不触发", r.triggered === false, r);
}
{
  const r = triggerWith(BURNING);
  T("燃烧状态伤害（type:skill）不触发", r.triggered === false, r);
}
{
  const r = triggerWith(SOUL_SCYTHE);
  T("锁魂镰刀（type:skill）不触发", r.triggered === false, r);
}
{
  const r = triggerWith(SKILL_CARD_DRAGON);
  T("技能牌·猛龙断空斩（_skill）不触发", r.triggered === false, r);
}
{
  const r = triggerWith(SKILL_CARD_STEAL);
  T("技能牌·窃取（_skill，type 为 tactic）不触发", r.triggered === false, r);
}

console.log("\n【不应触发】无牌伤害与零伤害");
{
  const r = triggerWith(null);
  T("无卡牌来源的伤害不触发", r.triggered === false, r);
}
{
  const r = triggerWith(undefined);
  T("卡牌为 undefined 时不触发", r.triggered === false, r);
}
{
  const r = triggerWith(ENTITY_SLASH, { hpLoss: 0 });
  T("实体牌但未造成生命值伤害时不触发", r.triggered === false, r);
}

console.log(`\n结果：${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
