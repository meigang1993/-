const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

window.BattleLines = {
  skill(state, unit, name) {
    state.lines.push(`${unit.ref}:${name}`);
  },
};
window.BattleLog = {
  add(state, message) {
    state.log.push(message);
  },
};
window.BattleCards = {
  afterHandLost() {},
  syncStatusCards(unit) {
    unit.statusSynced = (unit.statusSynced || 0) + 1;
  },
};

load("./src/original/economy-config.js");
load("./src/original/data-cards.js");
load("./src/original/card-utils.js");
load("./src/original/battle-draw-feedback.js");
load("./src/original/elrana-healing-skills.js");
load("./src/original/ace-skills.js");
load("./src/original/nanali-skills.js");
load("./src/original/ace-nanali-skills.js");
load("./src/original/elrana-ace-nanali-skills.js");
load("./src/original/nanali-sealed.js");

function card(name, type) {
  return { name, type };
}

// ① 复仇之刃已从技能组中彻底移除
load("./src/original/data-characters-extra.js");
const nanaliTemplate = window.GameDataCharactersExtra.find(unit => unit.id === "nanali");
assert(nanaliTemplate, "Nanali must stay in the playable roster");
const nanaliSkillNames = (nanaliTemplate.skills || []).map(skill => skill.name);
assert(!nanaliSkillNames.includes("复仇之刃"),
  "复仇之刃 must be removed from Nanali's public skill list");
assert(nanaliSkillNames.length === 2
  && nanaliSkillNames.includes("魔刀阿波罗")
  && nanaliSkillNames.includes("虚弱斩杀"),
  "Nanali must keep exactly her two remaining skills");
assert(!/复仇之刃/.test(nanaliTemplate.evaluation || ""),
  "Nanali's role text must no longer advertise 复仇之刃");

// ② 运行时不再导出反击相关钩子
assert(ElranaAceNanaliSkills.afterDamage === undefined,
  "Nanali must not expose an afterDamage revenge hook");
assert(ElranaAceNanaliSkills.resolveRevenge === undefined,
  "Nanali must not expose a resolveRevenge hook");
assert(ElranaAceNanaliSkills.resolveRevengeTrigger === undefined,
  "Nanali must not expose a resolveRevengeTrigger hook");

const nanali = {
  uid: "a1",
  side: "ally",
  ref: "nanali",
  name: "娜娜莉",
  hp: 20,
  stats: { attack: 3, magic: 3 },
  hand: [card("谋略", "tactic"), card("杀（普攻）", "slash")],
};
const enemyA = {
  uid: "e1",
  side: "enemy",
  ref: "enemy_a",
  name: "敌人A",
  hp: 30,
  stats: {},
  block: 0,
  hand: [card("调度", "tactic"), card("闪", "response")],
};
const enemyB = {
  uid: "e2",
  side: "enemy",
  ref: "enemy_b",
  name: "敌人B",
  hp: 30,
  stats: {},
  block: 0,
  hand: [card("杀（普攻）", "slash")],
};
const state = {
  lines: [],
  log: [],
  battle: { allies: [nanali], enemies: [enemyA, enemyB], animQueue: [] },
};
let drawCount = 0;
const api = {
  draw(unit, count) {
    if (unit.ref === "nanali") drawCount += count;
  },
};

// ③ 魔刀阿波罗：出牌后按娜娜莉手牌数扣置目标手牌
const apolloKill = card("杀（普攻）", "slash");
ElranaAceNanaliSkills.beforeKillTargeted(state, nanali, enemyA, apolloKill, api);
assert(state.lines.includes("nanali:魔刀阿波罗"),
  "Apollo must speak its skill line on a single slash");
assert(enemyA.hand.length === 0 && enemyA.nanaliSealed?.length === 2,
  "Apollo must seal the target's whole visible hand");
assert(drawCount === 1, "Sealing one tactic should draw one card for Nanali");
const sealEvents = state.battle.animQueue.filter(event => event.type === "sealCards");
assert(sealEvents.length === 1 && sealEvents[0].count === 2,
  "Apollo must animate every sealed hand card");
assert(sealEvents[0].visualHandBefore === 2 && sealEvents[0].visualHandCount === 0,
  "Apollo must snapshot the visible hand before and after sealing");
assert(!("clearTargetLine" in sealEvents[0]),
  "Apollo seal events must no longer carry revenge-only fields");

// ④ 虚弱斩杀：目标空手时单体杀伤害翻倍
assert(ElranaAceNanaliSkills.modifySlashDamage(state, nanali, enemyA, 4, card("杀（普攻）", "slash")) === 8,
  "Weak execution must double a single slash against an empty hand");
const sweepTarget = { ...enemyA, uid: "e4", hand: [card("闪", "response")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, nanali, sweepTarget, { name: "机枪扫杀", type: "slash", sweep: true }, api);
assert(sweepTarget.hand.length === 1 && !sweepTarget.nanaliSealed.length,
  "Apollo must not trigger for group slashes");
assert(ElranaAceNanaliSkills.modifySlashDamage(state, nanali, sweepTarget, 4, { name: "机枪扫杀", type: "slash", sweep: true }) === 4,
  "Weak execution must not affect group slashes");
assert(ElranaAceNanaliSkills.modifySlashDamage(state, nanali, { ...sweepTarget, hand: [] }, 4, card("杀（普攻）", "slash")) === 8,
  "Weak execution must double a single slash against an empty hand");

// ⑤ 扣置牌在回合结束归还（先构造两个已扣置的目标）
const returnTargetA = { ...enemyA, uid: "r1", hand: [card("调度", "tactic")], nanaliSealed: [] };
const returnTargetB = { ...enemyB, uid: "r2", hand: [card("杀（普攻）", "slash")], nanaliSealed: [] };
const returnState = {
  lines: [],
  log: [],
  battle: { allies: [{ ...nanali, uid: "r0" }], enemies: [returnTargetA, returnTargetB], animQueue: [] },
};
const sealer = { ...nanali, uid: "r0" };
ElranaAceNanaliSkills.beforeKillTargeted(returnState, sealer, returnTargetA, card("杀（普攻）", "slash"), { draw() {} });
ElranaAceNanaliSkills.beforeKillTargeted(returnState, sealer, returnTargetB, card("杀（普攻）", "slash"), { draw() {} });
assert(returnTargetA.nanaliSealed.length === 1 && returnTargetB.nanaliSealed.length === 1,
  "Both targets must hold Apollo-sealed cards before the end-of-turn return");
ElranaAceNanaliSkills.endTurn(returnState, sealer, {});
const returnEvents = returnState.battle.animQueue.filter(event => event.type === "gainCards" && event.fromZone === "public");
assert(returnEvents.length === 2 && returnTargetA.hand.length === 1 && returnTargetB.hand.length === 1,
  "Sealed cards must animate back from the public zone");
assert(returnTargetA.statusSynced === 1 && returnTargetB.statusSynced === 1,
  "Returning Apollo cards must refresh status-card markers");

// ⑥ 转换杀 / 虚拟杀 / 重复扣置的既有契约保持不变
const lastHandKill = card("杀（普攻）", "slash");
const lastCardNanali = { ...nanali, uid: "a3", hand: [] };
const lastCardTarget = { ...enemyA, uid: "e3", hand: [card("调度", "tactic")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, lastCardNanali, lastCardTarget, lastHandKill, { draw() {} });
assert(lastCardTarget.hand.length === 0 && lastCardTarget.nanaliSealed.length === 1,
  "Apollo must count the kill card that just left Nanali's hand");
const convertedCost = card("转换费用", "tactic");
const convertedKill = { ...card("杀（普攻）", "slash"), _skipHandMove: true, convertedFrom: convertedCost.name, _entitySourceCard: convertedCost };
const convertedNanali = { ...nanali, uid: "a7", hand: [] };
const convertedTarget = { ...enemyA, uid: "e8", hand: [card("转换扣置牌", "tactic")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, convertedNanali, convertedTarget, convertedKill, { draw() {} });
ElranaAceNanaliSkills.beforeKillTargeted(state, convertedNanali, convertedTarget, convertedKill, { draw() {} });
assert(convertedTarget.hand.length === 0 && convertedTarget.nanaliSealed.length === 1,
  "Converted Slash must count its consumed source card and seal only once per target");
// 实体口径：技能生成的虚拟单体杀不再触发魔刀阿波罗 / 虚弱斩杀
const virtualKill = { ...card("杀（普攻）", "slash"), virtual: true };
const virtualTarget = { ...enemyA, uid: "e9", hand: [card("虚拟扣置牌", "response")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, nanali, virtualTarget, virtualKill, { draw() {} });
assert(virtualTarget.hand.length === 1 && !virtualTarget.nanaliSealed.length,
  "Virtual single Slash must not trigger Apollo (entity-only)");
assert(ElranaAceNanaliSkills.modifySlashDamage(state, nanali, { ...virtualTarget, hand: [] }, 4, virtualKill) === 4,
  "Virtual single Slash must not trigger Weak execution (entity-only)");

// 实体转换杀（由实体牌转换而来，非虚拟）仍应触发
const convertedKill2 = { ...card("杀（普攻）", "slash"), _skipHandMove: true, convertedFrom: "转换费用" };
const convertedTarget2 = { ...enemyA, uid: "e11", hand: [card("转换扣置牌2", "tactic")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, nanali, convertedTarget2, convertedKill2, { draw() {} });
assert(convertedTarget2.hand.length === 0 && convertedTarget2.nanaliSealed.length === 1,
  "Converted (non-virtual) Slash must still trigger Apollo");

const repeatedNanali = { ...nanali, uid: "a5", hp: 20, hand: [] };
const repeatedTarget = {
  uid: "e10", side: "enemy", ref: "enemy_c", name: "敌人C", hp: 30, stats: {}, block: 0,
  hand: [card("牌1", "tactic"), card("牌2", "tactic"), card("牌3", "tactic")], nanaliSealed: [],
};
const repeatedState = { lines: [], log: [], battle: { allies: [repeatedNanali], enemies: [repeatedTarget], animQueue: [] } };
for (let i = 0; i < 3; i++) {
  ElranaAceNanaliSkills.beforeKillTargeted(repeatedState, repeatedNanali, repeatedTarget, card("杀（普攻）", "slash"), { draw() {} });
}
const repeatedSnapshots = repeatedState.battle.animQueue.map(event => [event.visualHandBefore, event.visualHandCount]);
assert(JSON.stringify(repeatedSnapshots) === JSON.stringify([[3, 2], [2, 1], [1, 0]]),
  "Repeated Apollo seals must retain each visible hand-count decrement");
assert(repeatedTarget.visualHandCount === 3,
  "Repeated Apollo seals must hold the pre-animation hand count until the first seal event renders");

console.log("Nanali skill contract tests passed");
