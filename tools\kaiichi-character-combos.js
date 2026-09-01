const {
  assert,
  combat,
  card,
  unit,
  scenario,
  resumeKaiichiPrompt,
  trackedCombat,
} = require("./kaiichi-reaction-harness");

async function runKaiichiCharacterCombos() {
  const edisDraws = [], edisCombat = trackedCombat(edisDraws);
  const edisSlash = card("杀（普攻）");
  const directEdis = unit("direct-edis", "enemy", [edisSlash]);
  const edisBlood = unit("edis-kaiichi", "ally", [card("蓄力")]);
  const edisHelper = unit("edis-helper", "ally", []);
  Object.assign(directEdis, {
  name: "内英组杀手伊迪斯", ai: "pursuer_edis", intent: 2,
  stats: { attack: 1, magic: 0, speed: 4, handLimit: 5 },
  battleRelics: ["伊迪斯电锯剑"],
  });
  Object.assign(edisBlood, {
  name: "星野海一", ref: "hoshino_kaiichi",
  skills: [{ name: "半魅魔血" }],
  lockSuit: edisSlash.suit,
  });
  const edisState = scenario([], []).state;
  Object.assign(edisState.battle, {
  allies: [edisBlood, edisHelper], enemies: [directEdis],
  activeUid: directEdis.uid, phase: 4,
  });
  const baseRelicSystem = window.RelicSystem;
  window.RelicSystem = {
  ...baseRelicSystem,
  hasEquipped: (_state, owner, name) =>
  owner === directEdis && directEdis.battleRelics.includes(name),
  };
  const originalBeforeTargeted = window.ElranaAceNanaliSkills.beforeKillTargeted;
  let directTargetingHooks = 0;
  window.ElranaAceNanaliSkills.beforeKillTargeted = (...args) => {
  if (args[2] === edisBlood) directTargetingHooks += 1;
  return originalBeforeTargeted?.(...args);
  };
  try {
  window.state = edisState;
  edisCombat.useCard(edisState, directEdis, edisBlood, edisSlash);
  assert.strictEqual(edisBlood.hp, 28, "Edis must pause after the first modified direct hit on Kaiichi");
  const targetingHooksAfterFirstHit = directTargetingHooks;
  assert.strictEqual(edisHelper.hp, 30, "Edis's pursuit must wait behind Kaiichi's first picker");
  assert(edisState.battle.kaiichiShare, "Edis's first direct hit must open Half-Succubus Blood");
  await resumeKaiichiPrompt(edisState, edisCombat);
  assert.strictEqual(edisBlood.hp, 26,
  "Edis Chainsaw Sword's queued second hit must not apply the suit modifier twice");
  assert.strictEqual(edisHelper.hp, 30, "Edis's pursuit must still wait behind the second picker");
  assert(edisState.battle.kaiichiShare, "Edis Chainsaw Sword's second hit must open another picker");
  await resumeKaiichiPrompt(edisState, edisCombat);
  assert.strictEqual(edisHelper.hp, 29, "Edis's queued Berserk Chainsaw pursuit must resume after both direct hits");
  assert.strictEqual(edisDraws.length, 2, "Edis's two direct HP-loss hits must each draw two cards");
  assert.strictEqual(edisState.log.filter(text => text.includes("半魅魔血令其未摸到牌")).length, 2,
  "Edis's two direct HP-loss hits must create two independent skill logs");
  assert(!edisState.battle.locked && !window.BattleReactionQueue.pending(edisState.battle),
  "Edis's full combo must leave no stale picker or reaction");
  assert(edisState.battle.activeUid === directEdis.uid && edisState.battle.phase === 4,
  "Edis's full combo must return to the same enemy play phase");
  assert.strictEqual(directTargetingHooks, targetingHooksAfterFirstHit,
  "Edis Chainsaw Sword's queued second hit must not repeat target-selection hooks");
  } finally {
  window.RelicSystem = baseRelicSystem;
  window.ElranaAceNanaliSkills.beforeKillTargeted = originalBeforeTargeted;
  }

  const chiyoDraws = [], chiyoCombat = trackedCombat(chiyoDraws);
  const chiyoSlash = card("杀（普攻）");
  const chiyo = unit("chiyo", "enemy", [chiyoSlash]);
  const chiyoBlood = unit("chiyo-kaiichi", "ally", [card("蓄力")]);
  const chiyoHelper = unit("chiyo-helper", "ally", []);
  Object.assign(chiyo, {
  name: "橘千樱", ref: "chiyo", intent: 2,
  stats: { attack: 1, magic: 0, speed: 2 },
  skills: [{ name: "红缨连鬼斩" }, { name: "心眼拔刀术" }],
  deck: [
  { suit: "♠", name: "黑色判定" },
  { suit: "♦", name: "红色判定2" },
  { suit: "♥", name: "红色判定1" },
  ],
  });
  Object.assign(chiyoBlood, {
  name: "星野海一", ref: "hoshino_kaiichi",
  skills: [{ name: "半魅魔血" }],
  });
  const chiyoState = scenario([], []).state;
  Object.assign(chiyoState.battle, {
  allies: [chiyoBlood, chiyoHelper], enemies: [chiyo],
  activeUid: chiyo.uid, phase: 4,
  });
  window.state = chiyoState;
  chiyoCombat.useCard(chiyoState, chiyo, chiyoBlood, chiyoSlash);
  assert.strictEqual(chiyoSlash.gatlingRepeats, 3, "two red judgements must make Chiyo's Slash resolve three times");
  assert.strictEqual(chiyoBlood.hp, 29, "Chiyo must pause after the first Red Cherry Chain Slash hit");
  assert.strictEqual(chiyoState.battle.manualDodgeResume?.remainingHits, 2,
  "Chiyo's first picker must preserve two remaining hits");
  await resumeKaiichiPrompt(chiyoState, chiyoCombat);
  assert.strictEqual(chiyoBlood.hp, 28, "Chiyo's second hit must resume after the first picker");
  assert.strictEqual(chiyoState.battle.manualDodgeResume?.remainingHits, 1,
  "Chiyo's second picker must preserve the final hit");
  await resumeKaiichiPrompt(chiyoState, chiyoCombat);
  assert.strictEqual(chiyoBlood.hp, 27, "Chiyo's final hit must resume after the second picker");
  assert(chiyoState.battle.kaiichiShare, "Chiyo's final HP-loss hit must open its own picker");
  await resumeKaiichiPrompt(chiyoState, chiyoCombat);
  assert.strictEqual(chiyoDraws.length, 3, "Chiyo's three HP-loss hits must each draw two cards");
  assert(chiyoDraws.every(event => event.uid === chiyoBlood.uid && event.count === 2),
  "every Chiyo hit must give Kaiichi exactly two cards");
  assert.strictEqual(chiyoState.log.filter(text => text.includes("半魅魔血令其未摸到牌")).length, 3,
  "Chiyo's three HP-loss hits must create three independent skill logs");
  assert.strictEqual(chiyoState.log.filter(text => text.includes("红缨连鬼斩判定")).length, 3,
  "Chiyo must stop judging only after the black result");
  assert(!chiyoState.battle.locked && !window.BattleReactionQueue.pending(chiyoState.battle),
  "Chiyo's full combo must leave no stale picker or reaction");
  assert(chiyoState.battle.activeUid === chiyo.uid && chiyoState.battle.phase === 4,
  "Chiyo's full combo must return to the same enemy play phase");

  const tripleDraws = [], tripleCombat = trackedCombat(tripleDraws);
  const tripleSlash = card("双重打杀");
  tripleSlash.gatlingRepeats = 3;
  const tripleAttacker = unit("triple-attacker", "enemy", [tripleSlash]);
  const tripleBlood = unit("triple-kaiichi", "ally", [card("蓄力")]);
  const tripleHelper = unit("triple-helper", "ally", []);
  Object.assign(tripleAttacker, { name: "三连击敌人", stats: { attack: 2, magic: 0, speed: 2 }, intent: 3 });
  Object.assign(tripleBlood, { name: "星野海一", ref: "hoshino_kaiichi", skills: [{ name: "半魅魔血" }] });
  const tripleState = scenario([], []).state;
  Object.assign(tripleState.battle, { allies: [tripleBlood, tripleHelper], enemies: [tripleAttacker], activeUid: tripleAttacker.uid, phase: 4 });
  window.state = tripleState;
  tripleCombat.useCard(tripleState, tripleAttacker, tripleBlood, tripleSlash);
  assert.strictEqual(tripleBlood.hp, 28, "a three-hit Slash must pause after the first HP-loss event");
  assert.strictEqual(tripleState.battle.manualDodgeResume?.remainingHits, 2, "the first picker must preserve two remaining hits");
  assert.deepStrictEqual(tripleDraws, [{ uid: tripleBlood.uid, count: 2 }], "the first hit must trigger exactly one two-card draw");
  await resumeKaiichiPrompt(tripleState, tripleCombat);
  assert.strictEqual(tripleBlood.hp, 26, "the second hit must resume after the first picker");
  assert.strictEqual(tripleState.battle.manualDodgeResume?.remainingHits, 1, "the second picker must preserve one remaining hit");
  assert.strictEqual(tripleDraws.length, 2, "the second HP-loss event must trigger a second draw");
  await resumeKaiichiPrompt(tripleState, tripleCombat);
  assert.strictEqual(tripleBlood.hp, 24, "the third hit must resume after the second picker");
  assert(!tripleState.battle.manualDodgeResume, "the final hit must consume the remaining continuation");
  assert.strictEqual(tripleDraws.length, 3, "three HP-loss events must trigger exactly three draws");
  assert(tripleDraws.every(event => event.uid === tripleBlood.uid && event.count === 2), "every Half-Succubus Blood draw must give Kaiichi exactly two cards");
  assert.strictEqual(tripleState.log.filter(text => text.includes("半魅魔血令其未摸到牌")).length, 3, "three HP-loss events must create three independent skill logs");
  await resumeKaiichiPrompt(tripleState, tripleCombat);
  assert(!tripleState.battle.locked && !window.BattleReactionQueue.pending(tripleState.battle), "the three-hit chain must leave no stale picker or reaction");
  assert(!tripleState.battle.cardResumeQueue && tripleState.battle.activeUid === tripleAttacker.uid && tripleState.battle.phase === 4, "the three-hit chain must finish without changing the interrupted enemy turn");
}

module.exports = { runKaiichiCharacterCombos };
