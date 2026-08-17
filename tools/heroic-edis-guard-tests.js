const {
  assert, battleState, card, makeEdis, unit,
} = require("./heroic-edis-test-harness");

require("../src/original/guest-ophelia-guard.js");
require("../src/original/manny-skills.js");

function testOpheliaGuardPursuitResume() {
  const slash = card("杀（普攻）");
  const edis = makeEdis([slash], []);
  edis.stats.attack = 1;
  const ophelia = unit("ophelia", "ally", []);
  const guard = unit("guard", "ally", []);
  const laterTarget = unit("later-target", "ally", []);
  Object.assign(ophelia, { ref: "ophelia", name: "奥菲莉亚" });
  Object.assign(guard, { ref: "lokar", name: "罗卡尔" });
  const state = battleState(edis, [ophelia, guard, laterTarget]);
  const guardSkill = window.GuestOpheliaGuard({
    alive: current => current?.hp > 0,
    visible: current => current?.hand || [],
    isSlash: current => window.CardUtils.isKillCard(current),
    line() {},
  });

  let api;
  let simulatedBloodPrompt = false;
  function hitWithoutDodge(current, actor, target, amount, source, currentCard) {
    target.hp = Math.max(0, target.hp - amount);
    window.EdisSkills.afterDamage(
      current, actor, target, currentCard, amount, damage);
    if (!currentCard.virtual && !simulatedBloodPrompt) {
      simulatedBloodPrompt = true;
      current.battle.kaiichiShare = { unitUid: target.uid };
      current.battle.locked = true;
    }
    return { dodged: false, hpLoss: amount };
  }
  function damage(current, target, amount, source, actor, currentCard) {
    const guarded = guardSkill.guardOphelia(
      current, actor, target, amount, source, currentCard, api);
    if (guarded || current.battle.opheliaGuard) {
      return guarded || { dodged: false, hpLoss: 0 };
    }
    return hitWithoutDodge(
      current, actor, target, amount, source, currentCard);
  }
  api = {
    canDodge: () => false,
    draw() {},
    hitWithoutDodge,
    finalizeDamage: current =>
      window.BattleReactionQueue.flush(current, damage),
    afterDodged() {},
  };

  window.EdisSkills.beforeSlash(state, edis, ophelia, slash);
  assert.strictEqual(
    guardSkill.guardOphelia(
      state, edis, ophelia, 1, slash.name, slash, api),
    null,
    "Edis's entity Slash must first open Ophelia's guard picker",
  );
  assert(state.battle.locked && state.battle.opheliaGuard,
    "the first guard choice must lock battle resolution");

  state.battle.animQueue.push({ type: "pending-animation" });
  assert.strictEqual(guardSkill.resolveOpheliaGuard(state, guard.uid, api), false,
    "the guard choice must reject input until the incoming card animation finishes");
  assert.strictEqual(guard.hp, 30,
    "hidden guard input must not apply redirected damage early");
  assert(!state.battle.reactionQueue,
    "hidden guard input must not generate or advance Edis's pursuits early");
  state.battle.animQueue.length = 0;
  assert(guardSkill.resolveOpheliaGuard(state, guard.uid, api),
    "the first guard choice must resolve");
  assert.strictEqual(guard.hp, 29,
    "the selected guard must take the original entity Slash");
  assert(state.battle.locked && state.battle.kaiichiShare,
    "a later damage trigger must pause before Edis's queued pursuits");
  assert(!state.battle.opheliaGuard,
    "Edis's pursuit must not jump ahead of the current damage trigger");
  assert.strictEqual(state.battle.reactionQueue?.length, 2,
    "both pursuit targets must remain queued behind the damage prompt");
  state.battle.kaiichiShare = null;
  state.battle.locked = false;
  assert.strictEqual(
    window.BattleReactionQueue.flush(state, damage), false,
    "resuming after the damage prompt must pause at Ophelia's pursuit");
  assert(state.battle.locked && state.battle.opheliaGuard,
    "the pursuit returning to Ophelia must open a fresh guard picker");
  assert.strictEqual(laterTarget.hp, 30,
    "later pursuit targets must remain pending behind the second picker");
  assert.strictEqual(state.battle.reactionQueue?.length, 1,
    "the interrupted pursuit queue must retain the later target");

  assert(guardSkill.resolveOpheliaGuard(state, guard.uid, api),
    "the second guard choice must resolve independently");
  assert.strictEqual(guard.hp, 28,
    "the chosen guard must take the virtual pursuit exactly once");
  assert.strictEqual(
    window.BattleReactionQueue.flush(state, damage), true,
    "the retained pursuit must finish after the second guard choice");
  assert.strictEqual(laterTarget.hp, 29,
    "the later target must receive its original pending pursuit");
  assert(!state.battle.locked
    && !window.BattleReactionQueue.pending(state.battle),
  "the full guard and pursuit chain must leave no stale lock or action");
}

function testDeclinedDimensionTransferLifecycle() {
  const slash = card("杀（普攻）");
  const edis = makeEdis([slash], []);
  edis.stats.attack = 1;
  const primary = unit("dimension-primary", "ally", []);
  const laterTarget = unit("dimension-later", "ally", []);
  const manny = unit("dimension-manny", "ally", []);
  Object.assign(manny, { ref: "manny", name: "曼妮" });
  const state = battleState(edis, [primary, laterTarget, manny]);
  let simulatedPrompt = false;

  function hitWithoutDodge(current, actor, target, amount, source, currentCard) {
    target.hp = Math.max(0, target.hp - amount);
    window.EdisSkills.afterDamage(
      current, actor, target, currentCard, amount, damage);
    if (!currentCard.virtual && !simulatedPrompt) {
      simulatedPrompt = true;
      current.battle.locked = true;
    }
    return { dodged: false, hpLoss: amount };
  }
  function damage(current, target, amount, source, actor, currentCard) {
    return hitWithoutDodge(
      current, actor, target, amount, source, currentCard);
  }
  damage.hitWithoutDodge = hitWithoutDodge;
  damage.finalizeDamage = current =>
    window.BattleReactionQueue.flush(current, damage);

  window.EdisSkills.beforeSlash(state, edis, primary, slash);
  state.battle.dimensionTransfer = {
    actorUid: edis.uid,
    targetUid: primary.uid,
    mannyUid: manny.uid,
    amount: 1,
    source: slash.name,
    card: slash,
  };
  state.battle.locked = true;
  state.battle.animQueue.push({ type: "pending-animation" });
  assert.strictEqual(
    window.MannySkills.resolveDimensionTransfer(state, null, damage), false,
    "Dimension Transfer must reject input until the current effect finishes");
  assert.strictEqual(primary.hp, 30,
    "hidden Dimension Transfer input must not apply the confirmed hit early");
  assert(!state.battle.reactionQueue,
    "hidden Dimension Transfer must not generate or advance Edis's pursuits early");
  state.battle.animQueue.length = 0;
  assert(window.MannySkills.resolveDimensionTransfer(state, null, damage),
    "declining Dimension Transfer must resolve the confirmed hit");
  assert.strictEqual(primary.hp, 29,
    "the original target must take the declined transferred hit once");
  assert.strictEqual(laterTarget.hp, 30,
    "Edis's pursuit must wait behind later triggers from that hit");
  assert.strictEqual(state.battle.reactionQueue?.length, 2,
    "all pursuit targets must remain queued while the later trigger is open");

  state.battle.locked = false;
  assert.strictEqual(window.BattleReactionQueue.flush(state, damage), true,
    "the declined transfer's queued pursuits must resume cleanly");
  assert.strictEqual(laterTarget.hp, 29,
    "the first later target must receive one pursuit");
  assert.strictEqual(manny.hp, 29,
    "Manny must receive her original pending pursuit");
  assert(!window.BattleReactionQueue.pending(state.battle),
    "declined Dimension Transfer must leave no stale reaction");
}

module.exports = {
  testDeclinedDimensionTransferLifecycle,
  testOpheliaGuardPursuitResume,
};
