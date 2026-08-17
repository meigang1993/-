/* global BattleAIHelpers, BattleCardCleanup, BattleCardSpecials, CardUtils */
/* global BertisGerlotSkills, BondiSkills, EnemySkills, FloraCarlosSkills, GuardKellySkills, MannySkills */
/* global NonokaLokiSkills, WendyCadicisSkills */

module.exports = ({
  assert, card, unit, incoming,
}) => {
  let state;
  const minotaur = unit("minotaur", "enemy", {
    ai: "minotaur", block: 6,
    deck: [card("Black Judge", "tactic", { suit: "♠" })],
  });
  const minotaurAttacker = unit("minotaur-attacker", "ally");
  const minotaurOther = unit("minotaur-other", "enemy");
  const minotaurSlash = card("Iron Test Slash", "slash");
  state = {
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

  const feintActor = unit("feint-actor", "enemy");
  const feintHolder = unit("feint-holder", "enemy", {
    hand: [card("佯攻", "response", { feint: true })],
  });
  const feintTarget = unit("feint-target", "ally", {
    hand: [card("被弃置牌", "tactic")],
  });
  const feintState = {
    battle: {
      allies: [feintTarget], enemies: [feintActor, feintHolder],
      animQueue: [],
    },
  };
  BondiSkills.beforeKillTargeted(
    feintState, feintActor, feintTarget,
    card("佯攻触发杀", "slash"));
  const feintEvent = feintState.battle.animQueue
    .find(event => event.type === "response");
  assert(feintHolder.hand.length === 0
    && feintEvent?.visualHandBefore === 1
    && feintEvent?.visualHandCount === 0,
  "Feint must animate its holder's hand count from one to zero");

  const repeatedSweepHits = [];
  const repeatedSweep = BattleCardSpecials({
    nextAnim: () => 2,
    isKillCard: item => CardUtils.isKillCard(item),
  }, {
    damage(_state, target, _amount, _source, _actor, usedCard) {
      repeatedSweepHits.push({
        targetUid: target.uid,
        extraResolution: !!usedCard._extraSlashResolution,
      });
      return { hpLoss: 0 };
    },
  });
  const sweepActor = unit("repeat-sweep-actor", "ally");
  const sweepTarget = unit("repeat-sweep-target", "enemy");
  repeatedSweep.sweepDamage({
    battle: {
      allies: [sweepActor], enemies: [sweepTarget], animQueue: [],
    },
  }, sweepActor, 3, card("Repeated Sweep", "slash", {
    sweep: true, targetless: true, gatlingRepeats: 2,
  }));
  assert(repeatedSweepHits.length === 2
    && !repeatedSweepHits[0].extraResolution
    && repeatedSweepHits[1].extraResolution,
  "a repeated group Slash must mark only the later hit as an extra settlement");

  const succubus = unit("succubus", "enemy", {
    ai: "succubus",
    stats: { attack: 3, magic: 4 },
    hand: [
      card("Whip Cost", "tactic", { suit: "♥" }),
      card("Heart Count", "tactic", { suit: "♥" }),
    ],
    deck: [card("Whip Top", "tactic", { suit: "♥" })],
  });
  const whipFirst = unit("whip-first", "ally", {
    hp: 30, hand: [card("First Suit", "tactic", { suit: "♦" })],
    deck: [card("First Top", "tactic", { suit: "♥" })],
  });
  const whipSecond = unit("whip-second", "ally", {
    hp: 5, hand: [card("Second Suit", "tactic", { suit: "♠" })],
    deck: [card("Second Top", "tactic", { suit: "♠" })],
  });
  state = { battle: { allies: [whipFirst, whipSecond], enemies: [succubus], animQueue: [] } };
  let whipTarget = null;
  const originalRandom = Math.random;
  Math.random = () => .99;
  try {
    EnemySkills.prepare(state, succubus, (_state, target) => { whipTarget = target; });
  } finally {
    Math.random = originalRandom;
  }
  assert(whipTarget === whipSecond,
    "Love Whip must choose from living opponents by random index instead of HP priority");
  assert(succubus.hand.length === 2 && whipSecond.hand.length === 1,
    "Love Whip clash must not consume either participant's hand");
  assert(succubus.discard.at(-1).name === "Whip Top"
    && whipSecond.discard.at(-1).name === "Second Top",
  "Love Whip must discard both revealed top cards");

  const loki = unit("loki", "ally", { ref: "loki", hand: [card("Held Slash", "slash")] });
  const plainTarget = unit("plain-target", "enemy");
  assert(NonokaLokiSkills.modifySlashDamage({
    battle: {},
  }, loki, plainTarget, 4, incoming) === 8,
  "Loki's slash damage skill must accept virtual slashes");

  const cadicis = unit("cadicis-plan", "ally", {
    ref: "cadicis", name: "卡迪西斯", cadicisPlanName: "魔弹特攻",
  });
  const planActor = unit("cadicis-plan-user", "ally");
  const planTactic = card("魔弹特攻", "tactic");
  state = { battle: { allies: [cadicis, planActor], enemies: [plainTarget], animQueue: [] } };
  assert(WendyCadicisSkills.applyPlan(state, planActor, plainTarget, planTactic) === cadicis
    && planTactic.ignoreResponse && planTactic.cadicisPlanApplied,
  "Battlefield Commander must make a recorded tactic unresponsive");
  assert(WendyCadicisSkills.modifyTacticDamage(
    state, planActor, plainTarget, 5, planTactic) === 10,
  "Battlefield Commander must double damage from the recorded tactic");
  const unmatchedTactic = card("魔法对决", "tactic");
  assert(!WendyCadicisSkills.applyPlan(state, planActor, plainTarget, unmatchedTactic)
    && WendyCadicisSkills.modifyTacticDamage(
      state, planActor, plainTarget, 5, unmatchedTactic) === 5,
  "Battlefield Commander must not affect an unrecorded tactic");

  const heavyCadicis = unit("cadicis-heavy", "ally", {
    ref: "cadicis", stats: { attack: 4, magic: 2 },
  });
  const heavyTargets = [unit("heavy-target-a", "enemy"), unit("heavy-target-b", "enemy")];
  const heavyHits = [];
  state = { battle: { allies: [heavyCadicis], enemies: heavyTargets, animQueue: [] } };
  WendyCadicisSkills.afterCardPlayed(
    state, heavyCadicis, heavyTargets[0],
    card("雷杀", "slash", { shock: true }),
    {
      draw() {},
      damage(_state, target, amount, source, actor, damageCard) {
        heavyHits.push({ target, amount, source, actor, damageCard });
      },
    },
  );
  assert(heavyHits.length === 2 && heavyHits.every(hit =>
    hit.amount === 4 && hit.source === "重火力支援"
      && hit.damageCard.damageTypes.join(",") === "thunder"
      && hit.damageCard.attackType === "physical" && !hit.damageCard.shock),
  "Heavy Fire Support must inherit the entity Slash damage attribute without duplicating its status effect");

  const flora = unit("flora", "ally", { ref: "flora" });
  const carlos = unit("carlos", "ally", {
    ref: "carlos", hand: [card("Held Slash", "slash")],
  });
  let bayonetHits = 0;
  let bladeHits = 0;
  state = { battle: { allies: [carlos, flora], enemies: [plainTarget], animQueue: [] } };
  FloraCarlosSkills.afterSlashDamage(state, carlos, plainTarget, { ...incoming }, 1, {
    directDamage: () => { bayonetHits += 1; },
    damage: () => { bladeHits += 1; },
  });
  assert(bayonetHits === 1 && bladeHits === 1,
    "Carlos and Flora must react to virtual single slashes");
  FloraCarlosSkills.afterSlashDamage(state, carlos, plainTarget, { ...incoming }, 1, {
    directDamage: () => { bayonetHits += 1; },
    damage: () => { bladeHits += 1; },
  });
  assert(bladeHits === 1,
    "Flora Speed Blade must trigger at most once per target in the same turn");
  state.battle.turn = 1;
  FloraCarlosSkills.afterSlashDamage(state, carlos, plainTarget, { ...incoming }, 1, {
    directDamage: () => { bayonetHits += 1; },
    damage: () => { bladeHits += 1; },
  });
  assert(bladeHits === 2,
    "Flora Speed Blade must become available for the same target next turn");

  const assaultFlora = unit("speed-assault-flora", "ally", {
    ref: "flora", stats: { attack: 3, magic: 1 },
  });
  const assaultTarget = unit("speed-assault-target", "enemy", {
    hand: [card("Discard A"), card("Discard B")],
  });
  let assaultHits = 0;
  state = {
    battle: {
      phase: 1, allies: [assaultFlora], enemies: [assaultTarget], animQueue: [],
    },
    log: [],
  };
  const useAssault = () => FloraCarlosSkills.handleSpecialCard(
    state, assaultFlora, assaultTarget, { speedAssault: true },
    { draw: () => [] },
    { damage(_state, target, amount) { assaultHits += 1; target.hp -= amount; } },
  );
  assert(useAssault() && assaultFlora.usedSpeedAssaultPrepare
    && !assaultFlora.usedSpeedAssaultEnd && !assaultFlora.faceDown,
  "Preparation Speed Assault must consume only its preparation window");
  state.battle.phase = 6;
  assert(useAssault() && assaultHits === 2 && assaultFlora.usedSpeedAssaultEnd,
    "End-phase Speed Assault must remain available after preparation use");
  assert(assaultFlora.faceDown && assaultFlora.statuses.includes("翻面"),
    "End-phase Speed Assault must turn Flora face-down");

  const bertis = unit("bertis", "ally", {
    ref: "bertis", hp: 38, maxHp: 38,
    stats: { attack: 3, magic: 3, bloodlust: 2, handLimit: 3 },
    skills: [{ name: "傲慢雌小鬼" }],
  });
  state = { battle: { allies: [bertis], enemies: [] } };
  BertisGerlotSkills.refreshArrogance(state);
  assert(bertis.stats.attack === 4.5 && bertis.stats.magic === 4.5,
    "Bertis full-health attack and magic must be 1.5 times their base values");
  assert(bertis.stats.bloodlust === 4 && bertis.stats.handLimit === 6,
    "Bertis full-health bloodlust and hand limits must remain doubled");
  bertis.hp = 37;
  BertisGerlotSkills.refreshArrogance(state);
  assert(bertis.stats.attack === 3 && bertis.stats.magic === 3
    && bertis.stats.bloodlust === 2 && bertis.stats.handLimit === 3,
  "Bertis arrogance stats must return to base values after losing full health");
  require("./skill-audit-headshot-tests")({ assert, card, unit });

  const manny = unit("manny", "ally", { ref: "manny", mannyWeapon: "cannon" });
  const virtualSingle = { ...incoming };
  MannySkills.beforeSlash({ battle: {} }, manny, plainTarget, virtualSingle);
  assert(virtualSingle.ignoreBlock,
    "Anti-tank Cannon must apply to virtual single slashes");
  const virtualGroup = { ...incoming, allTargets: ["x"] };
  MannySkills.beforeSlash({ battle: {} }, manny, plainTarget, virtualGroup);
  assert(!virtualGroup.ignoreBlock,
    "Single-target weapon effects must not apply to group slashes");
  assert(BattleAIHelpers.singleKill({ ...incoming }),
    "AI single-Slash selection must accept virtual cards");
  assert(BattleAIHelpers.singleKill(card("Converted Slash", "slash", {
    convertedFrom: "闪",
  })), "AI single-Slash selection must accept converted cards");
  assert(!BattleAIHelpers.singleKill(card("Group Slash", "slash", {
    allTargets: ["x"],
  })), "AI single-Slash selection must reject group cards");

  require("./skill-audit-transfer-tests")({
    assert, card, unit, incoming, manny, plainTarget,
  });
};
