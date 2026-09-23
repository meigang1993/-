/* global BattleCardCleanup, BattleCardSpecials, CardUtils, EnemySkills */

module.exports = ({ assert, card, unit }) => {
  const minotaur = unit("minotaur", "enemy", {
    ai: "minotaur", block: 6,
    deck: [card("Black Judge", "tactic", { suit: "♠" })],
  });
  const minotaurAttacker = unit("minotaur-attacker", "ally");
  const minotaurOther = unit("minotaur-other", "enemy");
  const minotaurSlash = card("Iron Test Slash", "slash");
  let state = {
    battle: {
      activeUid: minotaurAttacker.uid, allies: [minotaurAttacker],
      enemies: [minotaur, minotaurOther], animQueue: [],
    },
  };
  EnemySkills.beforeKillTargeted(state, minotaurAttacker, minotaur, minotaurSlash);
  assert(minotaur.block === 6, "Minotaur black judgement must not grant armor");
  assert(minotaurSlash.ignoreResponse,
    "Minotaur black Iron Armor judgement must skip Dodge for its prevented Slash");
  assert(EnemySkills.modifyDamage(state, minotaur, 7, minotaurSlash) === 0,
    "Minotaur black judgement must prevent this Slash's damage");
  assert(EnemySkills.modifyDamage(state, minotaurOther, 7, minotaurSlash) === 7,
    "Minotaur prevention must remain target-specific");
  BattleCardCleanup.clearPlayFlags(minotaurSlash);
  assert(!minotaurSlash._minotaurPreventUids,
    "Minotaur prevention must clear after the Slash resolves");
  assert(!minotaurSlash.ignoreResponse,
    "Minotaur Iron Armor response suppression must clear after the Slash resolves");

  const sweepMinotaur = unit("sweep-minotaur", "enemy", {
    ai: "minotaur",
    deck: [
      card("Black Red-Fury Judge", "tactic", { suit: "♠" }),
      card("Red Red-Fury Judge", "tactic", { suit: "♥" }),
    ],
  });
  const sweepIronTarget = unit("sweep-iron-target", "ally", {
    ai: "minotaur", deck: [card("Black Iron Judge", "tactic", { suit: "♣" })],
  });
  const sweepPlainTarget = unit("sweep-plain-target", "ally");
  const machineGunSweep = card("机枪扫杀", "slash", {
    power: 1, sweep: true, targetless: true,
  });
  state = {
    battle: {
      activeUid: sweepMinotaur.uid, allies: [sweepIronTarget, sweepPlainTarget],
      enemies: [sweepMinotaur], animQueue: [],
    },
  };
  const sweepHits = [];
  const sweepSpecials = BattleCardSpecials({
    nextAnim: () => 1,
    isKillCard: item => CardUtils.isKillCard(item),
  }, {
    damage(current, target, amount, source, actor, usedCard) {
      sweepHits.push({
        targetUid: target.uid,
        amount: EnemySkills.modifyDamage(current, target, amount, usedCard),
        ignoreResponse: !!usedCard.ignoreResponse,
      });
      return { hpLoss: 0 };
    },
  });
  EnemySkills.beforeKillUsed(state, sweepMinotaur, machineGunSweep);
  sweepSpecials.sweepDamage(state, sweepMinotaur, 5, machineGunSweep);
  assert(state.battle.animQueue.filter(event => event.type === "judgement").length === 3,
    "Group Slash must judge Iron Armor once for its real minotaur target and Red Fury once per real target");
  assert(!(state.log || []).some(line => line.includes(`${sweepMinotaur.name} 铁甲判定`)),
    "Group Slash must not run Iron Armor against the attacker sentinel");
  assert(sweepHits[0].targetUid === sweepIronTarget.uid && sweepHits[0].amount === 0,
    "Iron Armor must prevent only the matching group-target damage");
  assert(sweepHits[0].ignoreResponse,
    "A successful Red Fury judgement must make that target's group hit unresponsive");
  assert(sweepHits[1].targetUid === sweepPlainTarget.uid && sweepHits[1].amount === 5,
    "Iron Armor prevention must not leak to another group target");
  assert(!sweepHits[1].ignoreResponse,
    "A failed Red Fury judgement must not inherit another target's unresponsive result");

  const rearMinotaur = unit("rear-minotaur", "enemy", {
    ai: "minotaur",
    deck: [card("Rear Iron Judge", "tactic", { suit: "♠" })],
  });
  const frontTarget = unit("front-target", "enemy");
  const groupActor = unit("group-actor", "ally");
  const rearSweep = card("Rear Minotaur Sweep", "slash", {
    power: 1, sweep: true, targetless: true,
  });
  state = {
    battle: {
      activeUid: groupActor.uid, allies: [groupActor],
      enemies: [frontTarget, rearMinotaur], animQueue: [],
    },
  };
  BattleCardSpecials({
    nextAnim: () => 3,
    isKillCard: item => CardUtils.isKillCard(item),
  }, {
    damage(current, target) {
      current.battle.animQueue.push({
        type: "float", kind: "damage", uid: target.uid,
      });
      return { hpLoss: 1 };
    },
  }).sweepDamage(state, groupActor, 3, rearSweep);
  const rearJudgeIndex = state.battle.animQueue.findIndex(event =>
    event.type === "judgement" && event.uid === rearMinotaur.uid);
  const firstDamageIndex = state.battle.animQueue.findIndex(event =>
    event.type === "float" && event.kind === "damage");
  assert(rearJudgeIndex >= 0 && rearJudgeIndex < firstDamageIndex,
    "A rear Minotaur must show Iron Armor judgement before any group Slash damage");

  const sourceTarget = unit("source-target", "enemy");
  const sourceActor = unit("source-actor", "ally");
  const settledSources = [];
  const sourceSpecials = BattleCardSpecials({
    nextAnim: () => 4,
    isKillCard: item => CardUtils.isKillCard(item),
  }, {
    damage(_current, _target, _amount, _source, _actor, usedCard) {
      settledSources.push(usedCard);
      return { hpLoss: 0 };
    },
  });
  const sourceState = {
    battle: {
      allies: [sourceActor], enemies: [sourceTarget], animQueue: [],
    },
  };
  const entitySweep = card("Entity Sweep", "slash", {
    sweep: true, targetless: true,
  });
  const virtualSweep = card("Virtual Sweep", "slash", {
    sweep: true, targetless: true, virtual: true,
  });
  const convertedCost = card("Converted Cost", "tactic", { suit: "♥" });
  const convertedSweep = card("Converted Sweep", "slash", {
    sweep: true, targetless: true, convertedFrom: convertedCost.name,
    _entitySourceCard: convertedCost,
  });
  [entitySweep, virtualSweep, convertedSweep].forEach(item =>
    sourceSpecials.sweepDamage(sourceState, sourceActor, 3, item));
  assert(!settledSources[0].virtual && !settledSources[0].convertedFrom,
    "Entity group Slashes must remain entity cards during target settlement");
  assert(settledSources[1].virtual && !settledSources[1].convertedFrom,
    "Virtual group Slashes must remain exclusively virtual during target settlement");
  assert(!settledSources[2].virtual
    && settledSources[2].convertedFrom === convertedCost.name,
  "Converted group Slashes must not also become virtual during target settlement");
};
