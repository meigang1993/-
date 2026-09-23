const {
  assert,
  combat,
  card,
  unit,
  scenario,
  resumeKaiichiPrompt,
  trackedCombat,
} = require("./kaiichi-reaction-harness");

async function runKaiichiGenericResume() {
  const armorDraws = [], armorCombat = trackedCombat(armorDraws);
  const armorSlash = card("双重打杀");
  const armorAttacker = unit("armor-attacker", "enemy", [armorSlash]);
  const armorBlood = unit("armor-kaiichi", "ally", [card("蓄力")]);
  const armorHelper = unit("armor-helper", "ally", []);
  Object.assign(armorAttacker, { name: "破甲连击敌人", stats: { attack: 2, magic: 0, speed: 2 }, intent: 2 });
  Object.assign(armorBlood, { name: "星野海一", ref: "hoshino_kaiichi", block: 2, skills: [{ name: "半魅魔血" }] });
  const armorState = scenario([], []).state;
  Object.assign(armorState.battle, { allies: [armorBlood, armorHelper], enemies: [armorAttacker], activeUid: armorAttacker.uid, phase: 4 });
  window.state = armorState;
  armorCombat.useCard(armorState, armorAttacker, armorBlood, armorSlash);
  assert.strictEqual(armorBlood.block, 0, "the first Double Slash hit must consume armor");
  assert.strictEqual(armorBlood.hp, 28, "only the second Double Slash hit must reduce HP");
  assert.deepStrictEqual(armorDraws, [{ uid: armorBlood.uid, count: 2 }], "an armor-only hit must not trigger Half-Succubus Blood");
  assert.strictEqual(armorState.log.filter(text => text.includes("半魅魔血令其未摸到牌")).length, 1, "only the actual HP-loss hit must create a skill log");
  assert(armorState.battle.locked && armorState.battle.kaiichiShare, "the later HP-loss hit must still open its transfer picker");
  await resumeKaiichiPrompt(armorState, armorCombat);
  assert(!armorState.battle.locked && !window.BattleReactionQueue.pending(armorState.battle), "the armor-filtered chain must finish without stale state");

  const shockDraws = [], shockCombat = trackedCombat(shockDraws);
  const thunderSlash = card("雷杀");
  const shockAttacker = unit("shock-attacker", "enemy", [thunderSlash]);
  const shockBlood = unit("shock-kaiichi", "ally", [card("蓄力")]);
  const shockHelper = unit("shock-helper", "ally", []);
  Object.assign(shockAttacker, { name: "雷击敌人", stats: { attack: 2, magic: 0, speed: 2 }, intent: 2 });
  Object.assign(shockBlood, { name: "星野海一", ref: "hoshino_kaiichi", shock: 2, skills: [{ name: "半魅魔血" }] });
  const shockState = scenario([], []).state;
  Object.assign(shockState.battle, { allies: [shockBlood, shockHelper], enemies: [shockAttacker], activeUid: shockAttacker.uid, phase: 4 });
  window.state = shockState;
  shockCombat.useCard(shockState, shockAttacker, shockBlood, thunderSlash);
  assert.strictEqual(shockBlood.hp, 26, "Thunder Slash and its two-layer Shock bonus must both settle before the picker");
  assert.strictEqual(shockBlood.shock, 3, "Thunder Slash must add one Shock layer after the preloaded bonus resolves");
  assert.deepStrictEqual(shockDraws, [{ uid: shockBlood.uid, count: 2 }, { uid: shockBlood.uid, count: 2 }],
    "base damage and Shock bonus damage must each trigger one two-card draw");
  assert(shockState.battle.kaiichiShare && shockState.battle.kaiichiShareQueue?.length === 1,
    "Shock bonus damage must keep one active and one queued Half-Succubus Blood picker");
  await resumeKaiichiPrompt(shockState, shockCombat);
  assert(shockState.battle.locked && shockState.battle.kaiichiShare,
    "resolving the first Shock-related picker must activate the queued picker");
  await resumeKaiichiPrompt(shockState, shockCombat);
  assert(!shockState.battle.locked && !window.BattleReactionQueue.pending(shockState.battle),
    "both Shock-related pickers must finish without stale lock or reaction state");

  const doubleSlash = card("双重打杀");
  const attacker = unit("double-attacker", "enemy", [doubleSlash]);
  const blood = unit("double-kaiichi", "ally", [card("蓄力")]);
  const helper = unit("double-helper", "ally", []);
  Object.assign(attacker, { name: "双击敌人", stats: { attack: 2, magic: 0, speed: 2 }, intent: 2 });
  Object.assign(blood, { name: "星野海一", ref: "hoshino_kaiichi", skills: [{ name: "半魅魔血" }] });
  const doubleState = scenario([], []).state;
  Object.assign(doubleState.battle, { allies: [blood, helper], enemies: [attacker], activeUid: attacker.uid, phase: 4 });
  window.state = doubleState;
  combat.useCard(doubleState, attacker, blood, doubleSlash);
  assert.strictEqual(blood.hp, 28, "Double Slash must pause after its first hit");
  assert(doubleState.battle.manualDodgeResume?.remainingHits === 1, "Double Slash must retain its unfinished hit");
  await resumeKaiichiPrompt(doubleState);
  assert.strictEqual(blood.hp, 26, "Double Slash must resume its second hit after the first transfer");
  assert(doubleState.battle.locked && doubleState.battle.kaiichiShare, "the resumed second hit must open its own transfer");
  await resumeKaiichiPrompt(doubleState);
  assert(!doubleState.battle.manualDodgeResume && !doubleState.battle.locked, "Double Slash continuation must finish cleanly");

  const sweep = card("机枪扫杀");
  const gunner = unit("sweep-attacker", "enemy", [sweep]);
  const sweepBlood = unit("sweep-kaiichi", "ally", [card("蓄力")]);
  const laterTarget = unit("sweep-later", "ally", []);
  Object.assign(gunner, { name: "扫射敌人", stats: { attack: 1, magic: 0, speed: 2 }, intent: 2 });
  Object.assign(sweepBlood, { name: "星野海一", ref: "hoshino_kaiichi", skills: [{ name: "半魅魔血" }] });
  const sweepState = scenario([], []).state;
  Object.assign(sweepState.battle, { allies: [sweepBlood, laterTarget], enemies: [gunner], activeUid: gunner.uid, phase: 4 });
  window.state = sweepState;
  combat.useCard(sweepState, gunner, sweepBlood, sweep);
  assert.strictEqual(sweepBlood.hp, 29, "Machine Gun Sweep must pause after damaging Kaiichi");
  assert.strictEqual(laterTarget.hp, 30, "later sweep targets must wait during the transfer");
  assert(sweepState.battle.demonInvasionResume?.nextTargetIndex === 1, "Machine Gun Sweep must retain its next target");
  await resumeKaiichiPrompt(sweepState);
  assert.strictEqual(laterTarget.hp, 29, "Machine Gun Sweep must continue to later targets after the transfer");
  assert(!sweepState.battle.demonInvasionResume && !sweepState.battle.locked, "Machine Gun Sweep continuation must finish cleanly");

  const oldRelicSystem = window.RelicSystem;
  const rootSlash = card("杀（普攻）"), extraSlash = card("杀（普攻）");
  const greenAttacker = unit("green-attacker", "enemy", [rootSlash, extraSlash]);
  const greenBlood = unit("green-kaiichi", "ally", [card("蓄力")]);
  const greenHelper = unit("green-helper", "ally", []);
  Object.assign(greenAttacker, { name: "格林机枪敌人", stats: { attack: 1, magic: 0, speed: 2 }, intent: 3 });
  Object.assign(greenBlood, { name: "海一", ref: "hoshino_kaiichi", skills: [{ name: "半魅魔血" }] });
  window.RelicSystem = { hasEquipped: (_state, owner, name) => owner === greenAttacker && name === "格林机枪" };
  const greenState = scenario([], []).state;
  Object.assign(greenState.battle, { allies: [greenBlood, greenHelper], enemies: [greenAttacker], activeUid: greenAttacker.uid, phase: 4 });
  window.state = greenState;
  combat.useCard(greenState, greenAttacker, greenBlood, rootSlash);
  await resumeKaiichiPrompt(greenState);
  assert(greenState.battle.locked && greenState.battle.kaiichiShare, "Green Gatling follow-up Slash must open its own transfer");
  await resumeKaiichiPrompt(greenState);
  assert.strictEqual(greenBlood.hp, 28, "Green Gatling follow-up Slash must resume after the root Slash transfer");
  assert.strictEqual(greenAttacker.hand.length, 0, "Green Gatling must consume the queued follow-up Slash");
  assert(!greenState.battle.cardResumeQueue && !greenState.battle.greenGatlingResume, "Green Gatling card tails must finish cleanly");
  window.RelicSystem = oldRelicSystem;

  const oldEnemySkills = window.EnemySkills, oldBattleSystem = window.BattleSystem;
  window.EnemySkills = {
  beforeHeal: (...args) => window.EdisSkills.beforeHeal(...args),
  beforeKillTargeted() {}, beforeKillUsed() {}, afterDamage() {},
  modifyDamage: (_state, _target, amount) => amount,
  absorbDefense: (_state, _target, amount) => ({ absorbed: 0, rest: amount }),
  clearHolyScar() {}, onHeal() {},
  };
  window.BattleSystem = { draw: () => [], pushFloat() {} };
  const darkEdis = unit("dark-edis", "enemy", [card("杀（普攻）")]);
  const darkBlood = unit("dark-kaiichi", "ally", [card("蓄力")]);
  const darkYi = unit("dark-yi", "ally", []);
  const darkHelper = unit("dark-helper", "ally", []);
  Object.assign(darkEdis, { name: "伊迪斯", ai: "pursuer_edis", stats: { attack: 1, magic: 0, handLimit: 5 } });
  Object.assign(darkBlood, { name: "海一", ref: "hoshino_kaiichi", hp: 3, maxHp: 3, skills: [{ name: "半魅魔血" }] });
  Object.assign(darkYi, { name: "星野依", ref: "hoshino_yi", stats: { attack: 0, magic: 1 } });
  const darkState = scenario([], []).state;
  Object.assign(darkState.battle, { allies: [darkBlood, darkYi, darkHelper], enemies: [darkEdis], activeUid: darkEdis.uid, phase: 4 });
  window.state = darkState;
  combat.useCard(darkState, darkEdis, darkBlood, darkEdis.hand[0]);
  while (darkState.battle.kaiichiShare) await resumeKaiichiPrompt(darkState);
  assert.strictEqual(darkBlood.hp, 0, "repeated Infinite Dark Blade healing interception must settle");
  assert.strictEqual(darkYi.hp, 28, "each Infinite Dark Blade must resume against Yi after Kaiichi's picker");
  assert.strictEqual(darkHelper.hp, 28, "each Infinite Dark Blade must resume against every later ally");
  assert(!darkState.battle.locked && !window.BattleReactionQueue.pending(darkState.battle), "Infinite Dark Blade recursion must leave no stale lock");

  const healer = unit("heal-owner", "ally", [card("生命之泉")]);
  const healBlood = unit("heal-kaiichi", "ally", [card("蓄力")]);
  const healDodger = unit("heal-dodger", "ally", [card("闪")]);
  const healEdis = unit("heal-edis", "enemy", []);
  Object.assign(healer, { name: "治疗者", hp: 20, stats: { attack: 0, magic: 0 } });
  Object.assign(healBlood, { name: "海一", ref: "hoshino_kaiichi", hp: 20, skills: [{ name: "半魅魔血" }] });
  Object.assign(healDodger, { name: "闪避者", hp: 20 });
  Object.assign(healEdis, { name: "伊迪斯", ai: "pursuer_edis", stats: { attack: 1, magic: 0 } });
  const healState = scenario([], []).state;
  Object.assign(healState.battle, { allies: [healBlood, healDodger, healer], enemies: [healEdis], activeUid: healer.uid, phase: 4 });
  window.state = healState;
  combat.useCard(healState, healer, healer, healer.hand[0]);
  assert(healState.battle.groupHealResume && healState.battle.kaiichiShare, "group healing must pause with its remaining targets preserved");
  await resumeKaiichiPrompt(healState);
  assert.strictEqual(healDodger.hp, 29, "a later ally who dodges Infinite Dark Blade must still receive group healing");
  assert.strictEqual(healer.hp, 19, "an ally who does not dodge Infinite Dark Blade must remain healing-suppressed");
  assert(!healState.battle.groupHealResume && !healState.battle.cardResumeQueue, "group healing continuation must finish cleanly");
  window.EnemySkills = oldEnemySkills; window.BattleSystem = oldBattleSystem;
}

module.exports = { runKaiichiGenericResume };
