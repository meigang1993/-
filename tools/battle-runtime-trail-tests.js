const { assert, combat } = require("./battle-runtime-test-harness");

function testSpecialCardTrails() {
  window.NonokaLokiSkills = { handleSpecialCard: () => true };
  const specialActor = { uid: "s0", name: "专属角色", side: "ally", hand: [], skills: [] };
  const specialTarget = { uid: "s1", name: "目标", side: "enemy", hand: [], skills: [] };
  const specialCard = { name: "专属技能牌", type: "tactic", _skill: true, skillName: "专属技能牌" };
  const specialState = { battle: { locked: false, played: [], allies: [specialActor], enemies: [specialTarget] } };
  combat.useCard(specialState, specialActor, specialTarget, specialCard);
  const secondSpecialActor = { uid: "s2", name: "第二角色", side: "ally", hand: [], skills: [] };
  specialState.battle.allies.push(secondSpecialActor);
  combat.useCard(specialState, secondSpecialActor, specialTarget, specialCard);
  assert(specialState.battle.played.length === 2, "successful special cards must retain every use in the turn trail");
  assert(specialState.battle.played[0]._playedByName === secondSpecialActor.name, "the latest special-card trail entry must identify its actor");
  assert(specialState.battle.played[1]._playedByName === specialActor.name, "reusing one card must not rewrite its earlier trail entry");
  assert(specialState.battle.played.every(card => card.skillName === specialCard.name), "skill-card trail snapshots must retain the displayed skill name");
  assert(specialState.battle.played[0] !== specialCard && specialState.battle.played[1] !== specialCard, "turn trails must store snapshots instead of mutable card objects");
  specialState.battle.locked = true;
  combat.useCard(specialState, specialActor, specialTarget, specialCard);
  assert(specialState.battle.played.length === 2, "a blocked special-card attempt must not create a trail entry");

  specialState.battle.locked = false;
  specialState.battle.played = [];
  const outerCard = { name: "外层技能", type: "tactic", _skill: true };
  const innerCard = { name: "内层攻击", type: "slash", _skill: true };
  window.NonokaLokiSkills.handleSpecialCard = (state, actor, target, card) => {
    if (card === outerCard) combat.useCard(state, actor, target, innerCard);
    return true;
  };
  combat.useCard(specialState, specialActor, specialTarget, outerCard);
  assert(specialState.battle.played[0].name === innerCard.name && specialState.battle.played[1].name === outerCard.name, "nested card trails must preserve chronological display order");
  assert(specialState.battle.played.every(card => !card.skillName), "internal skill-resolution flags must not mislabel ordinary trail entries as skill cards");

  specialState.battle.played = [];
  const hookErrorCard = { name: "后处理异常牌", type: "tactic", _skill: true };
  window.GuestCharacterSkills.afterCardPlayed = () => { throw new Error("controlled after-card failure"); };
  let hookFailed = false;
  try { combat.useCard(specialState, specialActor, specialTarget, hookErrorCard); } catch (_) { hookFailed = true; }
  assert(hookFailed, "the controlled after-card hook must fail");
  assert(specialState.battle.played[0]?.name === hookErrorCard.name, "a resolved card must keep a valid trail snapshot when a later hook fails");
  assert(!("_countAsPlayed" in hookErrorCard), "runtime play flags must be cleaned after a later hook fails");
  delete window.GuestCharacterSkills.afterCardPlayed;
  delete window.NonokaLokiSkills;
}

module.exports = { testSpecialCardTrails };
