/* global FloraCarlosSkills, NonokaLokiSkills, WendyCadicisSkills */

module.exports = ({ assert, card, unit, incoming }) => {
  const loki = unit("loki", "ally", {
    ref: "loki", hand: [card("Held Slash", "slash")],
  });
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
  let state = {
    battle: {
      allies: [cadicis, planActor], enemies: [plainTarget], animQueue: [],
    },
  };
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

  const flora = unit("flora", "ally", {
    ref: "flora", skills: [{ name: "神速飞剑" }],
  });
  const carlos = unit("carlos", "ally", {
    ref: "carlos", hand: [card("Held Slash", "slash")],
  });
  let bayonetHits = 0;
  let bladeHits = 0;
  state = { battle: { allies: [carlos, flora], enemies: [plainTarget], animQueue: [] } };
  const slashDamageApi = {
    directDamage: () => { bayonetHits += 1; },
    damage: () => { bladeHits += 1; },
  };
  FloraCarlosSkills.afterSlashDamage(
    state, carlos, plainTarget, { ...incoming }, 1, slashDamageApi);
  assert(bayonetHits === 1 && bladeHits === 1,
    "Carlos and Flora must react to virtual single slashes");
  FloraCarlosSkills.afterSlashDamage(
    state, carlos, plainTarget, { ...incoming }, 1, slashDamageApi);
  assert(bladeHits === 1,
    "Flora Speed Blade must trigger at most once per target in the same turn");
  state.battle.turn = 1;
  FloraCarlosSkills.afterSlashDamage(
    state, carlos, plainTarget, { ...incoming }, 1, slashDamageApi);
  assert(bladeHits === 2,
    "Flora Speed Blade must become available for the same target next turn");
  flora.skills = [];
  state.battle.turn = 2;
  FloraCarlosSkills.afterSlashDamage(
    state, carlos, plainTarget, { ...incoming }, 1, slashDamageApi);
  assert(bladeHits === 2,
    "Flora Speed Blade must not trigger after the skill is removed");
  flora.skills = [{ name: "神速飞剑" }];
  const friendlyTarget = unit("friendly-target", "ally");
  state.battle.allies.push(friendlyTarget);
  FloraCarlosSkills.afterSlashDamage(
    state, carlos, friendlyTarget, { ...incoming }, 1, slashDamageApi);
  FloraCarlosSkills.afterSlashDamage(
    state, flora, plainTarget, { ...incoming }, 1, slashDamageApi);
  assert(bladeHits === 2,
    "Flora Speed Blade must reject friendly fire and Flora's own Slash");

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
  assert(!assaultFlora.faceDown,
    "End-phase Speed Assault must wait for its animation settlement before turning face-down");
  state.battle.animQueue
    .filter(event => event.type === "battleCommit")
    .forEach(event => event.commit());
  assert(assaultFlora.faceDown && assaultFlora.statuses.includes("翻面"),
    "End-phase Speed Assault must turn Flora face-down");
  require("./skill-audit-speed-assault-tests")({ assert, unit });
};
