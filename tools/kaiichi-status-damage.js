const {
  assert,
  card,
  unit,
  scenario,
  resumeKaiichiPrompt,
  trackedCombat,
} = require("./kaiichi-reaction-harness");

function kaiichi(uid, hand = [card("蓄力")]) {
  const target = unit(uid, "ally", hand);
  Object.assign(target, {
    name: "星野海一",
    ref: "hoshino_kaiichi",
    skills: [{ name: "半魅魔血" }],
  });
  return target;
}

async function runKaiichiStatusDamage() {
  require("../src/original/bakar-relic-skills.js");
  require("../src/original/bakar-core-skills.js");
  require("../src/original/bakar-fire-skills.js");
  require("../src/original/bakar-skills.js");
  require("../src/original/manny-skills.js");
  require("../src/original/angelica-luka-skills.js");

  const poisonDraws = [], poisonCombat = trackedCombat(poisonDraws);
  const poisonBlood = kaiichi("poison-kaiichi");
  const poisonHelper = unit("poison-helper", "ally", []);
  const poisoner = unit("poison-source", "enemy", []);
  Object.assign(poisonBlood, { poison: 2, poisonSourceUid: poisoner.uid, statuses: ["毒"] });
  const poisonState = scenario([], []).state;
  Object.assign(poisonState.battle, { allies: [poisonBlood, poisonHelper], enemies: [poisoner], activeUid: poisonBlood.uid, phase: 1 });
  window.state = poisonState;
  window.EnemySkills.tickPoison(poisonState, poisonBlood, poisonCombat.damage);
  assert.strictEqual(poisonBlood.hp, 28, "Poison must deal its current stack as HP damage");
  assert.strictEqual(poisonBlood.poison, 2, "a Poison tick must not add another Poison stack");
  assert.deepStrictEqual(poisonDraws, [{ uid: poisonBlood.uid, count: 2 }], "Poison HP loss must trigger one two-card draw");
  assert(poisonState.battle.locked && poisonState.battle.kaiichiShare, "Poison HP loss must open one transfer picker");
  await resumeKaiichiPrompt(poisonState, poisonCombat);
  assert(!poisonState.battle.locked && !window.BattleReactionQueue.pending(poisonState.battle), "Poison settlement must clear its picker and queue");

  const burnDraws = [], burnCombat = trackedCombat(burnDraws);
  const burnBlood = kaiichi("burn-kaiichi");
  const burnHelper = unit("burn-helper", "ally", []);
  const burner = unit("burn-source", "enemy", []);
  const burningCard = card("蓄力", { burning: true, burningSourceUid: burner.uid });
  burnBlood.hand = [burningCard];
  const burnState = scenario([], []).state;
  Object.assign(burnState.battle, { allies: [burnBlood, burnHelper], enemies: [burner], activeUid: burnBlood.uid, phase: 1 });
  window.state = burnState;
  window.BakarSkills.tickBurning(burnState, burnBlood, burnCombat.directDamage, burnCombat.damage);
  assert.strictEqual(burnBlood.hp, 29, "one Burning card must deal one HP damage");
  assert.deepStrictEqual(burnDraws, [{ uid: burnBlood.uid, count: 2 }], "Burning HP loss must trigger one two-card draw");
  assert(burnState.battle.locked && burnState.battle.kaiichiShare, "Burning HP loss must open one transfer picker");
  await resumeKaiichiPrompt(burnState, burnCombat);
  assert(!burnState.battle.locked && !window.BattleReactionQueue.pending(burnState.battle), "Burning settlement must clear its picker and queue");

  const invasionDraws = [], invasionCombat = trackedCombat(invasionDraws);
  const invasion = card("魔王军入侵");
  const invader = unit("invasion-source", "enemy", [invasion]);
  const invasionBlood = kaiichi("invasion-kaiichi");
  const invasionLater = unit("invasion-later", "ally", []);
  Object.assign(invader, { stats: { attack: 1, magic: 0, speed: 2 }, intent: 2 });
  const invasionState = scenario([], []).state;
  Object.assign(invasionState.battle, { allies: [invasionBlood, invasionLater], enemies: [invader], activeUid: invader.uid, phase: 4 });
  window.state = invasionState;
  invasionCombat.useCard(invasionState, invader, invasionBlood, invasion);
  assert.strictEqual(invasionBlood.hp, 29, "Demon Army Invasion must damage its first target");
  assert.strictEqual(invasionLater.hp, 30, "later invasion targets must wait while the picker is open");
  assert.strictEqual(invasionState.battle.demonInvasionResume?.nextTargetIndex, 1, "Demon Army Invasion must preserve its next target before damage triggers");
  await resumeKaiichiPrompt(invasionState, invasionCombat);
  assert.strictEqual(invasionLater.hp, 29, "Demon Army Invasion must resume against later targets");
  assert.deepStrictEqual(invasionDraws, [{ uid: invasionBlood.uid, count: 2 }], "only Kaiichi's invasion hit must draw cards");
  assert(!invasionState.battle.demonInvasionResume && !invasionState.battle.locked, "Demon Army Invasion must finish without stale continuation state");

  const spikeDraws = [], spikeCombat = trackedCombat(spikeDraws);
  const striker = unit("spike-source", "enemy", []);
  const spikeBlood = kaiichi("spike-kaiichi");
  const spikeLater = unit("spike-later", "ally", []);
  Object.assign(striker, { stats: { attack: 0, magic: 0, speed: 2 } });
  spikeBlood.spikeShell = { ownerUid: striker.uid, attack: 0 };
  spikeBlood.statuses = ["刺弹"];
  const spikeState = scenario([], []).state;
  Object.assign(spikeState.battle, { allies: [spikeBlood, spikeLater], enemies: [striker], activeUid: striker.uid, phase: 4 });
  window.state = spikeState;
  spikeCombat.damage(spikeState, spikeBlood, 1, "测试伤害", striker, { name: "测试伤害", type: "skill", ignoreResponse: true });
  assert.strictEqual(spikeBlood.hp, 29, "the triggering hit must settle before the Spike explosion");
  assert.strictEqual(spikeLater.hp, 30, "Spike group damage must wait while the first picker is open");
  assert(!spikeBlood.spikeShell && !spikeBlood.statuses.includes("刺弹"), "Spike must be removed before queued explosion damage");
  await resumeKaiichiPrompt(spikeState, spikeCombat);
  assert.strictEqual(spikeBlood.hp, 24, "Spike explosion must damage Kaiichi after the triggering picker");
  assert.strictEqual(spikeLater.hp, 30, "later Spike targets must wait for Kaiichi's explosion picker");
  await resumeKaiichiPrompt(spikeState, spikeCombat);
  assert.strictEqual(spikeLater.hp, 25, "Spike explosion must continue to other living same-side targets");
  assert.deepStrictEqual(spikeDraws, [{ uid: spikeBlood.uid, count: 2 }, { uid: spikeBlood.uid, count: 2 }],
    "the triggering hit and Spike explosion must each draw two cards");
  assert(!spikeState.battle.locked && !window.BattleReactionQueue.pending(spikeState.battle), "Spike explosion must not recurse or leave stale reaction state");

  const queueActor = unit("queue-actor", "ally", []);
  const queueFirst = unit("queue-first", "enemy", []);
  const queueSecond = unit("queue-second", "enemy", []);
  const queueState = scenario([], []).state, queueHits = [];
  Object.assign(queueState.battle, { allies: [queueActor], enemies: [queueFirst, queueSecond], activeUid: queueActor.uid, phase: 4, locked: false });
  window.state = queueState;
  const queueDamage = () => {};
  queueDamage.hitWithoutDodge = (state, actor, target) => {
    queueHits.push(target.uid);
    if (target.uid === queueFirst.uid) state.battle.locked = true;
    return { dodged: false, hpLoss: 0 };
  };
  window.BattleReactionQueue.enqueue(queueState, [
    window.BattleReactionQueue.resolvedHitAction(queueActor, queueFirst, 1, "队列测试", {}),
    window.BattleReactionQueue.resolvedHitAction(queueActor, queueSecond, 1, "队列测试", {}),
  ]);
  window.BattleReactionQueue.flush(queueState, queueDamage);
  assert.deepStrictEqual(queueHits, [queueFirst.uid], "Reaction queue must pause while the battle stays locked");
  assert.strictEqual(queueState.battle.reactionQueue?.length, 1, "Reaction queue must retain every later action");
  queueState.battle.locked = false;
  window.BattleReactionQueue.flush(queueState, queueDamage);
  assert.deepStrictEqual(queueHits, [queueFirst.uid, queueSecond.uid], "Reaction queue must resume with the next action after unlock");
  assert(!window.BattleReactionQueue.pending(queueState.battle), "Reaction queue must clear after all actions run");
}

module.exports = { runKaiichiStatusDamage };
