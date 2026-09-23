/* global BattleCardSpecials, BattleCombatVisuals, GuestOpheliaGuard, SakuraRisaSkills */
const { fs, load, assert, unit } = require("./sakura-risa-test-harness");

function runSakuraRisaAdvancedContracts(context) {
  const {
    risa,
    target,
    state,
    outsider,
    draw,
    useCard,
    getDraws,
    resetDraws,
  } = context;
  SakuraRisaSkills.playPhaseStart(state, target);
  assert(state.battle.locked && state.battle.risaEyePrompt?.risaUids[0] === risa.uid, "Evil Eye should lock the play phase and open a player prompt");
  SakuraRisaSkills.resolveEyeChoice(state, "石头", () => 0);
  assert(state.battle.risaEyePrompt?.result?.outcome === "tie" && state.battle.locked, "Evil Eye tie should show a locked result");
  SakuraRisaSkills.confirmEyeResult(state);
  assert(state.battle.risaEyePrompt?.tied && !state.battle.risaEyePrompt.result, "Evil Eye tie confirmation should return to gesture selection");
  SakuraRisaSkills.resolveEyeChoice(state, "剪刀", () => 0);
  assert(state.battle.risaEyePrompt?.result?.outcome === "risa" && !state.battle.risaEye, "Evil Eye win must wait for result confirmation");
  SakuraRisaSkills.confirmEyeResult(state);
  assert(state.battle.risaEye?.ownerUid === risa.uid && !state.battle.locked, "Evil Eye result confirmation should mark Risa and unlock the play phase");
  assert(SakuraRisaSkills.drawRecipient(target, state.battle) === risa, "Evil Eye should redirect play-phase draws to Risa");
  state.battle.risaEye = null;
  SakuraRisaSkills.playPhaseStart(state, target);
  SakuraRisaSkills.resolveEyeChoice(state, "石头", () => 0.34);
  assert(state.battle.risaEyePrompt?.result?.outcome === "target" && state.battle.locked, "Evil Eye loss should remain visible before confirmation");
  SakuraRisaSkills.confirmEyeResult(state);
  assert(!state.battle.risaEye && !state.battle.risaEyePrompt && !state.battle.locked, "Evil Eye loss must not redirect draws and must unlock the phase");
  state.battle.risaEye = null;
  SakuraRisaSkills.playPhaseStart(state, target);
  for (let i = 0; i < 32; i += 1) {
  SakuraRisaSkills.resolveEyeChoice(state, "石头", () => 0);
  SakuraRisaSkills.confirmEyeResult(state);
  }
  assert(!state.battle.risaEyePrompt && !state.battle.locked, "Evil Eye must resolve after the bounded tie guard");
  state.battle.phase = 3;
  assert(SakuraRisaSkills.drawRecipient(target, state.battle) === target, "Evil Eye must not redirect draw-phase cards");
  state.battle.phase = 4;
  state.battle.activeUid = outsider.uid;
  assert(SakuraRisaSkills.drawRecipient(target, state.battle) === target, "Evil Eye must not redirect another unit's cards");
  state.battle.activeUid = target.uid;
  SakuraRisaSkills.playPhaseEnd(state, target);
  assert(!state.battle.risaEye, "Evil Eye must clear when the marked unit's play phase ends");
  const secondRisa = unit({ uid: "risa-2" });
  state.battle.enemies = [risa, secondRisa];
  SakuraRisaSkills.playPhaseStart(state, target);
  SakuraRisaSkills.resolveEyeChoice(state, "石头", () => 0.34);
  SakuraRisaSkills.confirmEyeResult(state);
  assert(state.battle.risaEyePrompt?.risaUids[state.battle.risaEyePrompt.index] === secondRisa.uid, "Later Risa should prompt after an earlier Risa loses");
  SakuraRisaSkills.resolveEyeChoice(state, "剪刀", () => 0);
  SakuraRisaSkills.confirmEyeResult(state);
  assert(state.battle.risaEye?.ownerUid === secondRisa.uid, "Later Risa should be able to win Evil Eye");
  state.battle.enemies = [risa];
  state.battle.risaEye = null;
  const alliedRisa = unit({ uid: "allied-risa", side: "ally" });
  const enemyTarget = unit({ uid: "enemy-target", side: "enemy" });
  state.battle.allies = [alliedRisa];
  state.battle.enemies = [enemyTarget];
  state.battle.activeUid = enemyTarget.uid;
  SakuraRisaSkills.playPhaseStart(state, enemyTarget, (() => { const values = [0, 0.34]; return () => values.shift(); })());
  assert(state.battle.risaEye?.ownerUid === alliedRisa.uid && !state.battle.risaEyePrompt, "Non-player Evil Eye turns should continue to resolve automatically");

  risa.hp = 0;
  assert(SakuraRisaSkills.preventDeath(state, risa), "Risa should survive lethal damage with a hand");
  assert(SakuraRisaSkills.pendingRevival(risa) && risa.statuses.includes("待复活"), "Risa pending revival state missing");
  assert(SakuraRisaSkills.aliveForBattle(risa) && !SakuraRisaSkills.preventDeath(state, risa), "Pending revival must count as alive and remain idempotent");
  SakuraRisaSkills.beginTurn(state, risa);
  assert(risa.hp === risa.maxHp && !SakuraRisaSkills.pendingRevival(risa), "Risa should heal fully at her next turn");
  const emptyRisa = unit({ uid: "empty", hp: 0, hand: [] });
  assert(!SakuraRisaSkills.preventDeath(state, emptyRisa), "Risa without hand cards must die normally");
  const pendingCardRisa = unit({ uid: "pending-card", hp: 0, hand: [{ name: "摸牌", _pendingDraw: true }] });
  assert(SakuraRisaSkills.preventDeath(state, pendingCardRisa), "A drawn card waiting for animation must still enable Risa revival");

  const loveHolder = unit({ uid: "love", id: "ally-love", ai: "ally", side: "ally", battleRelics: ["写给艾尔拉娜的情书"] });
  const pendingLoveHolder = unit({ uid: "pending-love", side: "ally", hp: 0, risaRevivePending: true, battleRelics: ["写给艾尔拉娜的情书"] });
  const female = unit({ uid: "female", id: "female", ai: "ally", side: "ally" });
  const pendingFemale = unit({ uid: "pending-female", side: "ally", hp: 0, risaRevivePending: true });
  const deadFemale = unit({ uid: "dead-female", id: "dead-female", ai: "ally", side: "ally", hp: 0, hand: [] });
  const male = unit({ uid: "male", id: "male", ai: "ally", side: "ally", gender: "male" });
  state.battle.allies = [loveHolder, pendingLoveHolder, female, pendingFemale, deadFemale, male];
  state.battle.enemies = [risa];
  const loveDraws = [];
  SakuraRisaSkills.afterDamage(state, female, 3, (owner, count) => loveDraws.push([owner.uid, count]));
  const loveCounts = loveDraws.reduce((counts, [uid, count]) => counts.set(uid, (counts.get(uid) || 0) + count), new Map());
  assert(["love", "pending-love", "female", "pending-female"].every(uid => loveCounts.get(uid) === 2), "Two Love Letters should stack for every living or pending-revival friendly female");
  assert(!loveCounts.has("dead-female") && !loveCounts.has("male"), "Love Letter must exclude truly dead and male units");
  const loveDrawCount = loveDraws.length;
  SakuraRisaSkills.afterDamage(state, male, 3, (owner, count) => loveDraws.push([owner.uid, count]));
  SakuraRisaSkills.afterDamage(state, female, 0, (owner, count) => loveDraws.push([owner.uid, count]));
  assert(loveDraws.length === loveDrawCount, "Love Letter must require positive HP damage to a female target");

  const attacker = unit({ uid: "attacker", id: "attacker", ai: "ally", side: "ally" });
  const dead = unit({ uid: "dead", id: "dead", ai: "ally", side: "ally", hp: 0, hand: [] });
  const deadTwo = unit({ uid: "dead-two", id: "dead-two", ai: "ally", side: "ally", hp: 0, hand: [] });
  const waiting = unit({ uid: "waiting", side: "ally", hp: 0, hand: [{}], risaRevivePending: true });
  state.battle.allies = [attacker, dead, deadTwo, waiting];
  assert(SakuraRisaSkills.modifyRevengeDamage(state, attacker, 12, { revengeKill: true }) === 48, "Revenge Kill must double independently for each truly dead ally");
  assert(SakuraRisaSkills.modifyRevengeDamage(state, attacker, 12, { type: "slash" }) === 12, "Ordinary kill cards must not gain Revenge Kill scaling");

  const responder = unit({ uid: "responder", id: "responder", ai: "ally", side: "ally", hand: [{ name: "后空翻", type: "response", backflip: true }] });
  state.battle.allies = [responder];
  const tactic = { name: "拆解", type: "tactic" };
  assert(!SakuraRisaSkills.canBackflip(responder, risa, responder, { ...tactic, _skill: true }, responder.hand[0]), "Backflip must not counter skill cards");
  assert(!SakuraRisaSkills.canBackflip(responder, risa, responder, { ...tactic, targetless: true }, responder.hand[0]), "Backflip must not counter targetless tactics");
  assert(!SakuraRisaSkills.canBackflip(responder, risa, responder, tactic, { ...responder.hand[0], _pendingDraw: true }), "Pending draw Backflip must not be usable");
  resetDraws();
  assert(SakuraRisaSkills.resolveBackflip(state, responder, risa, responder, tactic, responder.hand[0], { draw, useCard }) === true, "Single-target Backflip should cancel the tactic");
  assert(getDraws() === 2 && responder.discard[0]?.name === "后空翻", "Backflip should discard itself and draw two");
  const backflipEvent = [...state.battle.animQueue].reverse()
    .find(event => event.type === "response");
  assert(backflipEvent?.type === "response"
    && backflipEvent.visualHandBefore === 1
    && backflipEvent.visualHandCount === 0,
  "Backflip must animate its hand count before the follow-up draw");
  const allyRisa = unit({ uid: "ally-risa", side: "ally", hand: [{ name: "后空翻", type: "response", backflip: true }], battleRelics: [] });
  state.battle.allies = [allyRisa];
  state.battle.enemies = [risa];
  resetDraws();
  assert(SakuraRisaSkills.resolveBackflip(state, allyRisa, risa, allyRisa, tactic, allyRisa.hand[0], { draw, useCard }) === true, "Risa should be able to use Backflip");
  assert(getDraws() === 3, "Risa using Backflip should draw two from the card and one from Light Wing");
  responder.hand = [{ name: "后空翻", type: "response", backflip: true }];
  const multi = { name: "灵魂锁链", type: "tactic", _targetUids: [responder.uid, female.uid] };
  assert(SakuraRisaSkills.resolveBackflip(state, responder, risa, responder, multi, responder.hand[0], { draw, useCard }) === false, "Multi-target Backflip should not cancel other targets");
  assert(multi._targetUids.join("|") === female.uid, "Backflip should remove only its holder from multi-target tactics");
  const secondary = unit({ uid: "secondary", id: "secondary", ai: "ally", side: "ally", hand: [{ name: "后空翻", type: "response", backflip: true }] });
  responder.hand = [];
  state.battle.allies = [responder, secondary];
  state.battle.enemies = [risa];
  const multiSecondary = { name: "灵魂锁链", type: "tactic", _targetUids: [responder.uid, secondary.uid] };
  const specials = BattleCardSpecials({ draw, nextAnim: () => 1 }, { useCard, damage() {}, holdVisual() {}, pushFloat() {}, visualOf: owner => ({ visualHp: owner.hp }) });
  assert(specials.counterTactic(state, risa, responder, multiSecondary) === false, "A secondary tactic target should be able to Backflip without cancelling other targets");
  assert(multiSecondary._targetUids.join("|") === responder.uid && secondary.discard[0]?.name === "后空翻", "Secondary-target Backflip should remove only that target");
  secondary.hand = [{ name: "看破", type: "response", counterTactic: true }];
  const armyOrderInvasion = { name: "魔王军入侵", type: "tactic", _skill: true, _relicSkill: true };
  armyOrderInvasion.virtual = true;
  armyOrderInvasion.generatedBySkill = "军令状";
  assert(specials.counterTactic(state, risa, secondary, armyOrderInvasion) === true, "Insight must counter Army Order's virtual invasion");
  assert(!secondary.hand.length && secondary.discard.at(-1)?.name === "看破", "Insight must be consumed when countering Army Order's invasion");

  const ophelia = unit({ uid: "ophelia", id: "ophelia", ref: "ophelia", ai: "ally", side: "ally", hand: [] });
  const guard = unit({ uid: "guard", id: "guard", ref: "guard", ai: "ally", side: "ally", hand: [] });
  const umbrellaEnemy = unit({ uid: "umbrella-enemy", side: "enemy" });
  const guardState = { battle: { allies: [ophelia, guard], enemies: [umbrellaEnemy], animQueue: [], locked: false } };
  const opheliaGuard = GuestOpheliaGuard({ alive: owner => owner?.hp > 0, visible: owner => owner.hand, isSlash: card => card?.type === "slash", line() {} });
  const guardResult = opheliaGuard.guardOphelia(guardState, umbrellaEnemy, ophelia, 5, "血色刺伞", { type: "slash", forceAutoResponse: true, ignoreResponse: true }, { canDodge: () => false, draw() {}, hitWithoutDodge: () => ({ hpLoss: 5 }) });
  assert(guardResult?.hpLoss === 5 && !guardState.battle.locked && !guardState.battle.opheliaGuard, "Forced umbrella responses must resolve Ophelia guard automatically");

  const charge = { name: "蓄力", type: "tactic", charge: 1 };
  const kill = { name: "杀（普攻）", type: "slash" };
  const move = SakuraRisaSkills.aiMove(state, risa, [risa], [target], [kill, charge], () => true, { slashTarget: () => target, topBy: list => list[0], slashScore: () => 1 });
  assert(move?.card === charge, "Risa AI should prioritize Charge before slash");

  const battleSource = fs.readFileSync("./src/original/battle.js", "utf8");
  const turnPreparationSource =
    fs.readFileSync("./src/original/battle-turn-start.js", "utf8");
  const battleRuntimeSource = fs.readFileSync("./src/original/battle-runtime-helpers.js", "utf8");
  const combatSource = fs.readFileSync("./src/original/battle-combat.js", "utf8");
  const damageSource = [
    "battle-damage-lifecycle.js", "battle-damage-resolution.js",
    "battle-damage-hit.js",
  ].map(file => fs.readFileSync(`./src/original/${file}`, "utf8")).join("\n");
  load("battle-combat-visuals.js");
  const visuals = BattleCombatVisuals({ nextAnim: () => 1 }, battle => battle.allies.concat(battle.enemies));
  const pendingVisual = unit({ uid: "pending-visual", hp: 0, risaRevivePending: true });
  assert(!visuals.pendingFatalAnim({ allies: [], enemies: [pendingVisual], animQueue: [{ type: "float", kind: "damage", uid: pendingVisual.uid }] }), "Pending Risa revival must not block battle flow as a fatal animation");
  const uiSource = fs.readFileSync("./src/original/ui-battle-units.js", "utf8");
  const effectSource = fs.readFileSync("./src/original/battle-effect-handlers.js", "utf8");
  assert(battleRuntimeSource.includes("turnEligible")
    && turnPreparationSource.includes("SakuraRisaSkills?.beginTurn"),
  "Battle order must include pending Risa revival turns");
  assert(combatSource.includes("pendingRevival") && damageSource.includes("preventDeath"), "Battle end and lethal damage must respect Risa revival");
  assert(uiSource.includes("isDead = shownHp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(unitData)"), "Pending Risa revival must not render as truly dead");
  assert(effectSource.includes("const fatal = unit =>") && effectSource.includes("pendingRevival"), "Pending Risa revival must not wait for a death animation");

  return { risa, target, state, armyOrderInvasion };
}

module.exports = { runSakuraRisaAdvancedContracts };
