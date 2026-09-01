/* global BattleDamageResponses, BattleDamageTriggers, DungeonEnemyGroups, GameData, NonokaLokiSkills, RelicSystem, SakuraRisaSkills */
const { assert, unit } = require("./sakura-risa-test-harness");

function runSakuraRisaCoreContracts() {
  const template = GameData.enemies.orc_dungeon.find(enemy => enemy.id === "assassin_sakura_risa");
  assert(template?.name === "内英组杀手樱羽丽莎" && template.type === "elite", "Risa elite data missing");
  assert(template.gender === "female", "Risa gender data mismatch");
  assert(template.bloodlust === 2 && template.handLimit === 3, "Risa intent or hand limit mismatch");
  assert(2 + template.drawPerTurn === 4 && 4 + template.initialDraw === 7, "Risa draw totals must be 4/7");
  assert(template.skills.find(skill => skill.name === "轻身飞翼")?.text.includes("目标角色的响应牌数量"), "Light Wing description must state both response-card counts");
  assert(template.skills.find(skill => skill.name === "吸魔邪眼")?.text.includes("你可以与该角色进行猜拳"), "Magic Eye description must use optional wording");
  assert(GameData.eliteUnlocks.assassin_sakura_risa.join("|") === "后空翻|仇杀", "Risa shop unlocks mismatch");

  const backflipDef = GameData.cardCodex.find(card => card.name === "后空翻");
  const revengeDef = GameData.cardCodex.find(card => card.name === "仇杀");
  assert(backflipDef?.type === "response" && backflipDef.backflip && backflipDef.price === 1100, "Backflip data mismatch");
  assert(revengeDef?.type === "slash" && revengeDef.revengeKill && revengeDef.price === 800, "Revenge Kill data mismatch");
  assert(RelicSystem.data("写给艾尔拉娜的情书").enemy === template.id, "Love Letter drop relation mismatch");
  assert(RelicSystem.data("血色刺伞").enemy === template.id, "Blood Umbrella drop relation mismatch");

  const group = DungeonEnemyGroups.fromIds({ missionId: "orc_dungeon", difficultyId: "normal" }, "elite", ["demon_witch", template.id, "demon_witch"]);
  assert(group.map(enemy => enemy.id).join("|") === `demon_witch|${template.id}|demon_witch`, "Risa elite encounter group mismatch");



  const risa = unit({ hand: [{ type: "response" }, { type: "response" }, { type: "slash" }] });
  const target = unit({ uid: "ally", id: "ally", ai: "ally", name: "目标", side: "ally", hand: [{ type: "response" }] });
  const state = { resources: { relics: [] }, equipment: {}, battle: { allies: [target], enemies: [risa], animQueue: [], phase: 4, activeUid: target.uid } };
  window.state = state;
  const slash = { name: "杀（普攻）", type: "slash" };
  SakuraRisaSkills.beforeKillTargeted(state, risa, target, slash);
  assert(slash.ignoreResponse && slash._tempIgnoreResponse, "Light Wing should make slash unresponsive when response count is greater");
  target.hand.push({ type: "response" });
  const tiedSlash = { name: "杀（普攻）", type: "slash" };
  SakuraRisaSkills.beforeKillTargeted(state, risa, target, tiedSlash);
  assert(!tiedSlash.ignoreResponse, "Light Wing must not trigger on equal response counts");
  const sweep = { name: "机枪扫杀", type: "slash", sweep: true, targetless: true };
  target.hand = [{ type: "response" }];
  SakuraRisaSkills.beforeKillTargeted(state, risa, target, sweep);
  assert(!sweep.ignoreResponse, "Light Wing must not apply one sweep target's response count to every target");
  const weakTargetHit = { ...sweep, _risaTargetedHit: true };
  SakuraRisaSkills.beforeKillTargeted(state, risa, target, weakTargetHit);
  assert(weakTargetHit.ignoreResponse, "Light Wing should evaluate each sweep target independently");
  const guardedTarget = unit({ uid: "guarded", side: "ally", hand: [{ type: "response" }, { type: "response" }, { type: "response" }] });
  const guardedTargetHit = { ...sweep, _risaTargetedHit: true };
  SakuraRisaSkills.beforeKillTargeted(state, risa, guardedTarget, guardedTargetHit);
  assert(!guardedTargetHit.ignoreResponse, "A sweep target with enough responses must remain able to respond");

  let draws = 0;
  const draw = (owner, count) => { draws += count; owner.hand.push(...Array.from({ length: count }, () => ({ name: "摸牌", type: "tactic" }))); };
  SakuraRisaSkills.afterResponse(state, risa, { name: "闪", type: "response" }, { draw });
  assert(draws === 1, "Light Wing should draw one after a response");
  const responseMatrix = ["看破", "后空翻", "佯攻", "无谋冲拳", "转换响应", "护驾闪"];
  risa.battleRelics = [];
  responseMatrix.forEach(name => NonokaLokiSkills.afterCardResponded(state, risa, target, { name, type: "response" }, { draw }));
  assert(draws === 1 + responseMatrix.length, "Every response route should grant exactly one Light Wing draw");
  const outsider = unit({ uid: "outsider", id: "outsider", ai: "ally", side: "ally" });
  SakuraRisaSkills.afterResponse(state, outsider, { name: "闪", type: "response" }, { draw });
  assert(draws === 1 + responseMatrix.length, "Non-Risa responses must not trigger Light Wing");
  const nonKill = { name: "拆解", type: "tactic" };
  SakuraRisaSkills.beforeKillTargeted(state, risa, target, nonKill);
  assert(!nonKill.ignoreResponse, "Light Wing must not make non-kill cards unresponsive");
  const hiddenResponseRisa = unit({ uid: "hidden-response", hand: [{ type: "response" }, { type: "response", _pendingDraw: true }] });
  const equalVisibleTarget = unit({ uid: "equal-visible", side: "ally", hand: [{ type: "response" }] });
  const hiddenCountSlash = { name: "杀（普攻）", type: "slash" };
  SakuraRisaSkills.beforeKillTargeted(state, hiddenResponseRisa, equalVisibleTarget, hiddenCountSlash);
  assert(!hiddenCountSlash.ignoreResponse, "Pending draw cards must not count toward Light Wing response totals");

  risa.battleRelics = ["血色刺伞"];
  target.battleRelics = ["血色刺伞"];
  let umbrellaUses = 0;
  const useCard = (current, actor, currentTarget, card) => {
  umbrellaUses += 1;
  assert(card.virtual && card.name === "机枪扫杀" && card.forceAutoResponse, "Blood Umbrella must use a guarded virtual sweep");
  const responder = actor.uid === risa.uid ? target : risa;
  SakuraRisaSkills.afterResponse(current, responder, { name: "递归响应", type: "response" }, { draw, useCard });
  };
  SakuraRisaSkills.afterResponse(state, risa, { name: "看破", type: "response" }, { draw, useCard });
  assert(umbrellaUses === 2, "Blood Umbrella should allow another holder once while blocking same-holder recursion");
  assert(!state.battle.risaUmbrellaResolvingUids, "Blood Umbrella recursion guard must clean up after resolution");
  target.battleRelics = [];
  SakuraRisaSkills.afterResponse(state, target, { name: "闪", type: "response" }, { draw, useCard });
  assert(!state.battle.risaUmbrellaResolvingUids, "Responses without Blood Umbrella must not leave recursion state");
  let umbrellaThrew = false;
  try {
  SakuraRisaSkills.afterResponse(state, risa, { name: "闪", type: "response" }, { draw, useCard() { throw new Error("controlled umbrella failure"); } });
  } catch (error) {
  umbrellaThrew = error.message === "controlled umbrella failure";
  }
  assert(umbrellaThrew && !state.battle.risaUmbrellaResolvingUids, "Blood Umbrella must release its recursion guard after an interrupted sweep");

  function assertUmbrellaSettlementLock(flag) {
  const response = { name: "闪", type: "response" };
  const holder = unit({ uid: `settle-${flag}`, side: "ally", hand: [response], battleRelics: ["血色刺伞"] });
  const hammerCost = { name: "霹雳之锤代价", type: "tactic" };
  const foe = unit({ uid: `foe-${flag}`, side: "enemy", hand: [hammerCost], battleRelics: ["霹雳之锤"] });
  const settleState = {
  resources: { relics: [] }, equipment: {},
  settings: { manualResponse: true },
  battle: {
  allies: [holder], enemies: [foe], animQueue: [], locked: true, pendingTargetUid: holder.uid,
  manualDodge: { actorUid: foe.uid, targetUid: holder.uid, amount: 5, source: "杀", card: { name: "杀（普攻）", type: "slash" } },
  },
  };
  const responses = BattleDamageResponses({
  deps: {
  isKillCard: card => card.type === "slash", nextAnim: () => 1, draw() {},
  useCard(current) { foe.hp = 0; current.battle[flag] = true; current.battle.locked = true; },
  },
  ctx: { allUnits: battle => battle.allies.concat(battle.enemies), hasSkill: () => false, checkEnd() {}, clearSelection() {} },
  canDodge: (card, candidate) => candidate?.name === "闪",
  damage() {}, hitWithoutDodge() {}, finalizeDamage() {},
  triggers: { afterDodged() {} },
  });
  assert(responses.resolveManualDodge(settleState, true), `Blood Umbrella ${flag} response should resolve`);
  assert(settleState.battle[flag] && settleState.battle.locked, `Blood Umbrella must preserve the ${flag} settlement lock`);
  assert(!settleState.battle.manualDodge && !settleState.battle.pendingTargetUid, `Blood Umbrella must clear stale manual response state after ${flag}`);
  assert(foe.hand.includes(hammerCost) && !settleState.battle.thunderHammer, `Blood Umbrella ${flag} must not trigger a defeated attacker's Thunder Hammer`);
  }
  assertUmbrellaSettlementLock("pendingVictory");
  assertUmbrellaSettlementLock("pendingDefeat");

  return {
    risa,
    target,
    state,
    outsider,
    draw,
    useCard,
    getDraws: () => draws,
    resetDraws: () => { draws = 0; },
  };
}

module.exports = { runSakuraRisaCoreContracts };
