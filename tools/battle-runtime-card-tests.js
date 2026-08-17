/* global CharacterSkillAccess */

const {
  assert,
  BattleCards,
  BattleCardTactics,
  BattlePreparePrompts,
  GerdaSkills,
} = require("./battle-runtime-test-harness");

function testCardMovementAndPayments() {
  const temporaryCard = { name: "温蒂临时牌", void: true };
  const temporaryOwner = { uid: "temp-a", side: "ally", name: "临时角色", hand: [], discard: [], consumed: [] };
  const temporaryBattle = { allies: [temporaryOwner], enemies: [], animQueue: [] };
  BattleCards.put(temporaryBattle, temporaryOwner, temporaryCard, "discard");
  assert(temporaryOwner.consumed.includes(temporaryCard), "void cards discarded by external effects must enter the consumed pile");
  assert(!temporaryOwner.discard.includes(temporaryCard), "void cards must never enter the ordinary discard pile");
  const copiedCard = { name: "伊迪斯复制牌", type: "tactic", suit: "♠", copiedByEdis: true, temporary: true };
  BattleCards.put(temporaryBattle, temporaryOwner, copiedCard, "discard");
  assert(temporaryOwner.consumed.includes(copiedCard), "Edis copies must enter the consumed pile through every hand-loss path");
  assert(!temporaryOwner.discard.includes(copiedCard), "Edis copies must never enter the ordinary discard pile");
  const dismantledCard = { name: "被拆手牌", type: "tactic", suit: "♣" };
  const dismantledBattle = { allies: [temporaryOwner], enemies: [], animQueue: [], played: [] };
  BattleCards.put(dismantledBattle, temporaryOwner, dismantledCard, "discard", { forcedDiscard: true });
  assert(dismantledBattle.played[0]?.dismantled, "forced hand discard must enter the public turn trail");
  assert(dismantledBattle.played[0]?._playedByName === temporaryOwner.name && dismantledBattle.played[0]?._playedAction === "被弃置", "forced discard trail must identify the card holder");
  assert(!dismantledCard.dismantled, "forced discard trail must not mutate the original card entity");
  const dismantleFlight = dismantledBattle.animQueue.find(event => event.type === "discardBatch");
  assert(dismantleFlight?.cards?.[0] === dismantledCard, "discard animation events must retain the full face-up card");
  assert(dismantleFlight?.toPublic, "forced discard animations must fly into the public play area first");
  assert(dismantledBattle.played[0]?._destinationPile === "discard"
    && dismantledBattle.played[0]?._destinationSide === temporaryOwner.side,
  "public discard snapshots must retain their final pile and side");

  const consumedPlayed = {
    name: "已使用消耗牌", type: "consume", suit: "♥",
    _playedFlightDone: true, _cardResolutionId: "consume-flight",
  };
  BattleCards.put(
    dismantledBattle, temporaryOwner, consumedPlayed, "consumed");
  const burnFlight = dismantledBattle.animQueue.find(event =>
    event.type === "burnCard" && event.card === consumedPlayed);
  assert(burnFlight?.fromPublic && burnFlight.trailId === "consume-flight",
    "played consume cards must burn from the public zone exactly once");

  const bulletActor = { uid: "bullet-a", side: "enemy", name: "魔弹使用者", hand: [{ name: "费用牌", type: "tactic", suit: "♥" }], discard: [], consumed: [] };
  const bulletTarget = { uid: "bullet-t", side: "enemy", name: "魔弹目标", hand: [window.BattleStatusCards.create("seal"), { name: "展示牌", type: "tactic", suit: "♥" }] };
  const bulletState = { battle: { allies: [], enemies: [bulletActor, bulletTarget], animQueue: [], played: [] } };
  const bulletReveals = [];
  const tactics = BattleCardTactics({
    log() {},
    ctx: {
      putCard(state, holder, card, pile, opts) { BattleCards.put(state.battle, holder, card, pile, opts); },
      statOf: () => 0,
      damage() {},
    },
    deps: { nextAnim: () => 1 },
    reveal(_state, _title, cards) { bulletReveals.push(...cards); },
    openHandReveal() {},
  });
  assert(tactics.magicBullet(bulletState, bulletActor, bulletTarget, { name: "魔弹特攻" }), "Magic Bullet must resolve with a matching discard");
  assert(bulletReveals[0]?.name === "展示牌", "Magic Bullet must exclude status cards from automatic display");
  assert(bulletState.battle.played[0]?.name === "费用牌" && bulletState.battle.played[0]?._playedAction === "弃置了", "Magic Bullet payment must appear in the public turn trail");

  const duelDamage = [];
  const duelActor = { uid: "duel-a", side: "ally", name: "发起者", hand: [], stats: { attack: 5 }, discard: [] };
  const duelTarget = { uid: "duel-e", side: "enemy", name: "目标", hand: [], stats: { attack: 3 }, discard: [] };
  const duelState = { battle: { allies: [duelActor], enemies: [duelTarget], animQueue: [], played: [] } };
  const duelTactics = BattleCardTactics({
    log() {},
    ctx: {
      statOf: (unit, key) => unit.stats[key],
      damage(_state, _target, amount) { duelDamage.push(amount); },
      putCard(currentState, holder, card, pile) { BattleCards.put(currentState.battle, holder, card, pile); },
    },
    deps: { nextAnim: () => 1 },
    reveal() {},
    openHandReveal() {},
  });
  const duelCard = { name: "与我一战", type: "tactic", duel: true, power: 0, scale: "attack" };
  duelTactics.duel(duelState, duelActor, duelTarget, duelCard);
  duelTarget.hand.push({ name: "杀（普攻）", type: "slash", suit: "♠" });
  duelTactics.duel(duelState, duelActor, duelTarget, duelCard);
  assert(duelDamage.join(",") === "5,3", "Duel damage must equal the last card player's attack");

  const gerda = { uid: "gerda-run", ref: "gerda", side: "ally", name: "格尔达", hp: 10, hand: [], skills: [{ name: "萌虎跑跑" }] };
  const runner = { uid: "runner", side: "enemy", name: "攻击者", hp: 10, hand: [{ name: "闪", type: "response", suit: "♥" }], discard: [], consumed: [] };
  const runBattle = { allies: [gerda], enemies: [runner], animQueue: [], played: [] };
  const runState = { battle: runBattle };
  assert(GerdaSkills.allowKill(runState, runner, gerda, { name: "杀（普攻）", type: "slash" }), "Gerda Run must accept a kill after its response-card payment");
  assert(runBattle.played[0]?.name === "闪" && runBattle.played[0]?._playedByName === runner.name && runBattle.played[0]?._playedAction === "弃置了", "Gerda Run payment must appear in the public trail");
  assert(!runBattle.played[0]?.dismantled, "Gerda Run payment must not be marked as a forced dismantle");
}

function testRecklessResponse() {
  const recklessCard = { name: "无谋冲拳", type: "response", reckless: true };
  const recklessActor = { uid: "reckless-a", side: "ally", name: "冲拳者", hand: [recklessCard], discard: [], consumed: [] };
  const recklessTarget = { uid: "reckless-e", side: "enemy", name: "目标", hp: 10 };
  const recklessState = { battle: { allies: [recklessActor], enemies: [recklessTarget], animQueue: [] } };
  const prompts = BattlePreparePrompts({ tempAttack: () => 2, record() {}, combat: { damage() {}, checkEnd() {} } });
  assert(prompts.triggerReckless(recklessState, recklessActor, recklessCard, recklessState.battle), "reckless response should resolve");
  const events = recklessState.battle.animQueue;
  assert(events.length === 1 && events[0]?.type === "response",
    "reckless response must use one response flight without a duplicate discard flight");
  assert(events[0].visualHandBefore === 1 && events[0].visualHandCount === 0
    && events[0].visualHandDelta === -1
    && recklessActor.visualHandCount === 1,
  "reckless response must preserve its pre-flight hand count and animate to zero");

  const originalGuestSkills = window.GuestCharacterSkills;
  try {
    window.GuestCharacterSkills = {
      visibleHandCount: unit =>
        unit.hand.filter(item => item.suit !== "♠").length,
      countsForLimit: (_unit, item) => item.suit !== "♠",
    };
    const hiddenBlack = { name: "黑暗手牌", type: "response", suit: "♠" };
    const besta = {
      uid: "besta-count", side: "ally", hand: [hiddenBlack],
      discard: [], consumed: [],
    };
    const bestaBattle = { allies: [besta], enemies: [], animQueue: [] };
    const before = BattleCards.visibleHandCount(besta);
    besta.hand.splice(0, 1);
    BattleCards.put(
      bestaBattle, besta, hiddenBlack, "discard", { skipAnim: true });
    BattleCards.queueResponse(bestaBattle, besta, {
      type: "response", id: "hidden-black", uid: besta.uid,
      side: besta.side, card: hiddenBlack,
    }, before);
    assert(bestaBattle.animQueue[0].visualHandCount == null
      && besta.visualHandCount == null,
    "responses excluded from the UI hand count must not create a false decrement");
  } finally {
    window.GuestCharacterSkills = originalGuestSkills;
  }
}

function testForgedCharacterSkillsFailClosed() {
  const { combat } = require("./battle-runtime-test-harness");
  CharacterSkillAccess.definitions.forEach(def => {
    const actor = {
      uid: `forged-${def.flags[0]}`, side: "ally", name: "伪造者",
      hp: 20, maxHp: 20, hand: [{ name: "费用牌", type: "tactic", suit: "♥" }],
      skills: [], discard: [], consumed: [], stats: { attack: 2, magic: 2 },
    };
    const target = {
      uid: `target-${def.flags[0]}`, side: "enemy", name: "目标",
      hp: 20, maxHp: 20, hand: [], skills: [],
    };
    const battle = {
      phase: 4, allies: [actor], enemies: [target], animQueue: [],
      played: [], selectedCardIndex: 0, selectedBagIndexes: [0],
    };
    const state = { battle, log: [] };
    const skill = {
      name: def.name, type: "tactic", _skill: true,
      ...Object.fromEntries(def.flags.map(flag => [flag, true])),
    };
    const beforeHand = actor.hand.slice();
    assert(combat.useCard(state, actor, target, skill) === false,
      `${def.name} forged direct dispatch must fail`);
    assert(!battle.played.length && !state.log.length,
      `${def.name} rejected dispatch must not create trail or log entries`);
    assert(actor.hand.length === beforeHand.length
      && actor.hand.every((held, index) => held === beforeHand[index])
      && !skill._countAsPlayed,
    `${def.name} rejected dispatch must not mutate hand or card counts`);
  });

  const owner = {
    uid: "owner", side: "ally", name: "合法角色", gender: "female",
    hp: 20, maxHp: 20, hand: [{ name: "黑桃牌", type: "tactic", suit: "♠" }],
    skills: [], discard: [], consumed: [], stats: { attack: 2, magic: 2 },
  };
  const ally = {
    uid: "ally", side: "ally", name: "队友", gender: "male",
    hp: 20, maxHp: 20, hand: [], skills: [],
  };
  const enemy = {
    uid: "enemy", side: "enemy", name: "敌人",
    hp: 20, maxHp: 20, hand: [], skills: [],
  };
  const battle = {
    phase: 4, activeUid: owner.uid,
    allies: [owner, ally], enemies: [enemy], animQueue: [], played: [],
  };
  const state = { battle, log: [] };
  const assertCleanReject = (skill, target, message) => {
    owner.skills = [{ name: skill.name, type: "active", card: skill }];
    assert(combat.useCard(state, owner, target, { ...skill, _skill: true }) === false,
      message);
    assert(!battle.played.length && !state.log.length,
      `${skill.name} invalid dispatch must leave no public side effects`);
  };
  assertCleanReject(
    { name: "热血契约", type: "tactic", bloodPact: true, targetless: true },
    owner,
    "Blood Pact must reject a missing selected cost before dispatch");
  battle.selectedCardIndex = 0;
  assertCleanReject(
    { name: "偶像之吻", type: "tactic", idolKiss: true, allyTarget: true },
    enemy,
    "Idol Kiss must reject an enemy target before dispatch");
  owner.skills = [{
    name: "热血契约", type: "active",
    card: { name: "热血契约", type: "tactic", bloodPact: true },
  }];
  const mixed = {
    name: "混合伪造技能", type: "tactic", _skill: true,
    bloodPact: true, mimicVoice: true,
  };
  assert(combat.useCard(state, owner, owner, mixed) === false,
    "A direct card with multiple character skill identities must fail");
  assert(!battle.played.length && !mixed._countAsPlayed,
    "A mixed-identity skill must fail before public or count side effects");
}

function testCadicisResumeUsesSharedAttackValues() {
  require("../src/original/battle-combat-responses.js");
  const actor = { uid: "resume-actor", side: "enemy", name: "攻击者", hp: 20 };
  const target = { uid: "resume-target", side: "ally", name: "目标", hp: 20 };
  const card = { name: "杀（普攻）", type: "slash" };
  const battle = {
    allies: [target],
    enemies: [actor],
    locked: false,
    comboPartnerUid: "old-partner",
    cadicisResponsibilityResume: {
      actorUid: actor.uid,
      targetUid: target.uid,
      card,
      comboPartnerUid: "resume-partner",
    },
  };
  const calls = [];
  const attackValues = {
    cardPower(current) { calls.push("power"); assert(current === card); return 2; },
    attackAmount(_state, currentActor, current, base, clashOk) {
      calls.push("amount");
      assert(currentActor === actor && current === card && base === 2 && clashOk);
      return 5;
    },
    modifyAttackAmount(_state, currentActor, currentTarget, current, amount) {
      calls.push("modify");
      assert(currentActor === actor && currentTarget === target && current === card && amount === 5);
      return 7;
    },
    applyAttackRelics(_state, currentActor, currentTarget, current) {
      calls.push("relics");
      assert(currentActor === actor && currentTarget === target && current === card);
    },
    slashTargetAmount(_state, currentActor, currentTarget, current, amount) {
      calls.push("target");
      assert(currentActor === actor && currentTarget === target && current === card && amount === 7);
      return 9;
    },
    hitTarget(_state, currentActor, currentTarget, current, amount) {
      calls.push("hit");
      assert(currentActor === actor && currentTarget === target && current === card && amount === 9);
      return true;
    },
  };
  const responses = window.BattleCombatResponses({
    allUnits: current => current.allies.concat(current.enemies),
    putCard() {},
    afterHandLost() {},
    damage() {},
    statOf() { return 0; },
    specials: {
      healBySyringe() { calls.push("heal"); },
      resolveGreenGatling() { calls.push("gatling"); },
      resumeComboAttack() { calls.push("combo"); },
    },
    checkDefeat() { return false; },
    checkEnd() {},
    continueAfterCounter() {},
    deps: { isKillCard: current => current.type === "slash", nextAnim: () => 1 },
    attackValues,
    deferDamageTail() { return false; },
  });
  const state = { battle };
  assert(responses.continueAfterCadicisResponsibility(state),
    "Cadicis responsibility must resume the interrupted attack");
  assert(calls.join(",") === "power,amount,modify,relics,target,hit,heal,gatling,combo",
    "Cadicis responsibility must use the shared attack-value pipeline");
  assert(!battle.cadicisResponsibilityResume && battle.comboPartnerUid === null,
    "Cadicis responsibility must clear resume and combo state");
}

module.exports = {
  testCardMovementAndPayments,
  testCadicisResumeUsesSharedAttackValues,
  testRecklessResponse,
  testForgedCharacterSkillsFailClosed,
};
