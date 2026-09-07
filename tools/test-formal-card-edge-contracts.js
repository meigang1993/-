const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { combat, card, scenario, unit } = require("./pursue-kill-fixtures");

require("../src/original/card-art.js");
require("../src/original/battle-pile-stats.js");
require("../src/original/enemy-status-effects.js");
require("../src/original/enemy-damage-hooks.js");
require("../src/original/guard-kelly-skills.js");

const formalNames = [
  "杀（普攻）", "魔杀", "闪", "蓄力", "愈魔瓶", "毒杀", "伤口处理",
  "与我一战", "魔力提炼", "拆解", "束缚陷阱", "封印术", "雷杀",
  "机枪扫杀", "无谋冲拳", "物资补给", "刺杀", "看破", "组合进攻",
  "生命之泉", "偷窃",
  "灵魂锁链", "魔法对决", "魔弹特攻", "借刀杀人", "魔王军入侵",
  "双重打杀", "暴走杀", "咬杀", "放血", "圣杀", "怒杀", "佯攻",
  "勒杀", "战争号角", "追杀", "弹反", "武装", "撞杀", "后空翻",
  "仇杀", "火杀",
];
assert.deepStrictEqual(
  window.GameDataCards.cardCodex.map(item => item.name),
  formalNames,
  "formal card audit must name every official card in canonical order",
);
const formalArtwork = window.GameDataCards.cardCodex.map(item => window.CardArt.url(item));
assert.strictEqual(new Set(formalArtwork).size, formalNames.length,
  "every formal card must retain dedicated artwork");
formalArtwork.forEach((art, index) => {
  assert(art.includes("/card-art-"),
    `${formalNames[index]} must resolve formal card artwork`);
  assert(fs.existsSync(path.resolve("publish", art.replace(/^\.\//, ""))),
    `${formalNames[index]} artwork file is missing`);
});

const status = window.EnemyStatusEffects({
  alive: units => units.filter(item => item.hp > 0),
  markStatus(target, name) {
    target.statuses ||= [];
    if (!target.statuses.includes(name)) target.statuses.push(name);
  },
});
const hooks = window.EnemyDamageHooks({
  hasSkill: () => false,
  machine: { afterDamage() {} },
  discardOne: () => null,
  status,
});
window.EnemySkills = {
  modifyDamage: hooks.modifyDamage,
  afterDamage: hooks.afterDamage,
  absorbDefense: (_state, _target, amount) => ({ absorbed: 0, rest: amount }),
  beforeHeal: () => null,
  beforeKillTargeted() {},
  beforeKillUsed() {},
  clearHolyScar: status.clearHolyScar,
  onHeal() {},
};

{
  const hidden = card("闪", { _pendingDraw: true });
  const visible = card("蓄力");
  const { state, actor, target } = scenario([card("刺杀")], [hidden, visible]);
  actor.stats.attack = 2;
  combat.useCard(state, actor, target, actor.hand[0]);
  assert.strictEqual(target.hp, 28, "Assassinate must deal attack with no base damage");
  assert(target.hand.includes(hidden) && !target.hand.includes(visible),
    "Assassinate must discard one visible target card before damage");
}

{
  const stale = card("杀（普攻）", { power: 999 });
  const { state, actor, target } = scenario([stale], []);
  actor.stats.attack = 2;
  combat.useCard(state, actor, target, stale);
  assert.strictEqual(target.hp, 28,
    "legacy or injected Slash power must not restore card base damage");
}

{
  const first = card("暴走杀");
  const invalidated = card("暴走杀");
  const third = card("暴走杀");
  const { state, actor, target } = scenario([first, invalidated, third], []);
  actor.stats.attack = 2;
  actor.intent = 3;
  target.hp = target.maxHp = 100;
  window.BondiSkills = {};
  combat.useCard(state, actor, target, first);
  window.BondiSkills = { cancelKillCard: () => true };
  combat.useCard(state, actor, target, invalidated);
  window.BondiSkills = {};
  combat.useCard(state, actor, target, third);
  assert.strictEqual(target.hp, 92,
    "Berserk Slash must deal damage with its raised battle attack");
  assert.strictEqual(actor.stats.attack, 5,
    "each Berserk Slash use, including an invalidated use, must grant attack");
  assert.strictEqual(actor.tempAttack || 0, 0,
    "Berserk Slash attack growth must not use turn-limited temp attack");
}

{
  const first = card("圣杀");
  const second = card("圣杀");
  const { state, actor, target } = scenario([first, second], []);
  actor.stats.attack = 1;
  actor.intent = 2;
  target.hp = target.maxHp = 100;
  combat.useCard(state, actor, target, first);
  assert(target.holyScar, "Holy Slash hp damage must apply Holy Scar");
  combat.useCard(state, actor, target, second);
  assert.strictEqual(target.hp, 97, "Holy Scar must double later holy damage");
  const potion = card("愈魔瓶");
  target.hand.push(potion);
  combat.useCard(state, target, target, potion);
  assert(!target.holyScar && !target.statuses.includes("圣痕"),
    "actual healing must clear Holy Scar");
}

{
  const injured = scenario([card("怒杀")], []);
  injured.actor.hp -= 1;
  injured.actor.intent = 0;
  assert(combat.canPlay(injured.actor, injured.actor.hand[0], injured.state.battle),
    "Rage Slash must be playable at zero intent while injured");
  combat.useCard(injured.state, injured.actor, injured.target, injured.actor.hand[0]);
  assert.strictEqual(injured.actor.intent, 0, "injured Rage Slash must spend no intent");
  const healthy = scenario([card("怒杀")], []);
  healthy.actor.intent = 0;
  assert(!combat.canPlay(healthy.actor, healthy.actor.hand[0], healthy.state.battle),
    "full-health Rage Slash must still require intent");
}

{
  const { state, actor } = scenario([], []);
  const ally = unit("ally-2", "ally", []);
  actor.intent = 0;
  actor.deck = [card("蓄力"), card("刺杀")];
  ally.deck = [card("战争号角"), card("怒杀")];
  state.battle.allies.push(ally);
  window.WithererRelicSkills.useWarHorn(state, actor, null, () => 4);
  assert.strictEqual(actor.intent, 4, "War Horn must reset intent to its maximum");
  assert(actor.hand.some(item => item.name === "刺杀")
    && ally.hand.some(item => item.name === "怒杀"),
  "War Horn must draw one random kill card for every living ally");
}

{
  const { state, actor } = scenario([card("武装")], []);
  actor.stats.attack = 3;
  actor.block = 1;
  combat.useCard(state, actor, actor, actor.hand[0]);
  assert.strictEqual(actor.block, 4, "Arm Self must grant armor equal to attack");
}

{
  const ram = card("撞杀");
  const { state, actor, target } = scenario([ram], []);
  const mimic = unit("ally-2", "ally", []);
  actor.ref = "nonoka";
  actor.mimicUid = mimic.uid;
  actor.stats.attack = 2;
  actor.block = 4;
  mimic.block = 0;
  state.battle.allies.push(mimic);
  combat.useCard(state, actor, target, ram);
  assert.strictEqual(target.hp, 24, "Armored Ram must deal attack plus current armor");
  assert(target.faceDown,
    "Armored Ram must test the actual card user's remaining armor under Mimic Voice");
}

console.log("Formal card edge contracts passed: 42/42 catalog, 7/7 focused cards");
