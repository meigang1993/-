const {
  assert, battleState, card, combat, makeEdis, unit,
} = require("./heroic-edis-test-harness");

function testAiSequenceAndPursuits() {
  const slash = card("杀（普攻）");
  const charge = card("蓄力");
  const hand = [slash, charge, ...Array.from({ length: 6 }, (_, index) =>
    card(index % 2 ? "闪" : "看破"))];
  const edis = makeEdis(hand);
  const primary = unit("hero-1", "ally", []);
  const secondaryA = unit("hero-2", "ally", []);
  const secondaryB = unit("hero-3", "ally", []);
  [primary, secondaryA, secondaryB].forEach(target => {
    target.hp = 200;
    target.maxHp = 200;
  });
  const state = battleState(edis, [primary, secondaryA, secondaryB]);

  const chargeMove = window.BattleAI.choose(state.battle, edis, combat.canPlay);
  assert.strictEqual(chargeMove?.card?.charge, 1,
    "heroic Edis AI must charge before its planned entity Slash");
  combat.useCard(state, edis, chargeMove.target, chargeMove.card);

  const slashMove = window.BattleAI.choose(state.battle, edis, combat.canPlay);
  assert.strictEqual(slashMove?.card, slash,
    "heroic Edis AI must follow the charge with its entity Slash");
  const primaryTarget = slashMove.target;
  const pursuitTargets = [primary, secondaryA, secondaryB]
    .filter(target => target.uid !== primaryTarget.uid);
  combat.useCard(state, edis, slashMove.target, slashMove.card);
  const baseSlashDamage = edis.stats.attack;
  // 蓄力按卡面描述为伤害×2（battle-combat-attack-values.js 用 Math.pow(2, charge)）。
  const chargedSlashDamage = Math.ceil(baseSlashDamage * 2);
  const extraResolutions = Math.max(0, 7 - edis.stats.handLimit);
  assert.strictEqual(primaryTarget.maxHp - primaryTarget.hp,
    chargedSlashDamage * 2 + baseSlashDamage * 2 * extraResolutions,
    "charged Slash and every extra entity resolution must receive the chainsaw sword's second hit");
  pursuitTargets.forEach(target => {
    assert.strictEqual(target.maxHp - target.hp,
      baseSlashDamage * (1 + extraResolutions),
      "the original Slash and every entity resolution must chain once to other targets");
  });
  assert.deepStrictEqual(
    state.battle.animQueue
      .filter(event => event.type === "virtualPlay" && event.card?.virtual)
      .map(event => event.targetUid),
    Array.from({ length: 1 + extraResolutions }, () =>
      pursuitTargets.map(target => target.uid)).flat(),
    "each Chainsaw pursuit must keep its own single target in resolution order",
  );
  const extraSlashEvents = state.battle.animQueue.filter(event =>
    event.type === "virtualPlay" && event.extraSlashReplay);
  assert.strictEqual(extraSlashEvents.length, 1 + extraResolutions * 2,
    "every Chainsaw extra resolution and Chainsaw Sword extra hit must replay the Slash");
  assert(extraSlashEvents.every(event =>
    event.targetUid === primaryTarget.uid && event.enemyLine === true
      && event.show === false && event.slashText === true),
  "every extra entity Slash settlement must repeat its full red-line flight without adding a public card");
  const extraResolutionLogs = state.log.filter(text => text.includes("因手牌超上限"));
  assert.strictEqual(extraResolutionLogs.length, 1,
    "the pre-play count must produce one summarized extra-resolution log");
  assert(extraResolutionLogs[0].includes("本次【杀（普攻）】")
    && extraResolutionLogs[0].includes(`额外结算${extraResolutions}次`),
    "Raging Chainsaw must describe the entity Slash as an extra resolution of the original card");
}

function testSetupCardPriority() {
  const cases = [
    {
      cardName: "魔力提炼",
      expected: card => card.drawCards === 2,
      label: "draw cards",
    },
    {
      cardName: "偷窃",
      expected: card => card.stealCard === true,
      label: "steal cards",
      targetHand: [card("闪")],
    },
    {
      cardName: "灵魂锁链",
      expected: card => card.soulChain === true,
      label: "Soul Chain",
      extraTarget: true,
    },
  ];
  cases.forEach(item => {
    const slash = card("杀（普攻）");
    const setup = card(item.cardName);
    const edis = makeEdis([slash, card("蓄力"), setup], []);
    const primary = unit(`setup-${item.cardName}-1`, "ally", item.targetHand || []);
    const allies = item.extraTarget
      ? [primary, unit(`setup-${item.cardName}-2`, "ally", [])]
      : [primary];
    battleState(edis, allies);
    const move = window.BattleAI.choose(window.state.battle, edis, combat.canPlay);
    assert(item.expected(move?.card),
      `heroic Edis must prioritize ${item.label} at the draw-card tier`);
  });
}

function testReturnedSlashRecalculation() {
  const slash = card("杀（普攻）");
  const edis = makeEdis([
    slash,
    ...Array.from({ length: 6 }, (_, index) => card(index % 2 ? "闪" : "看破")),
  ], []);
  edis.stats.attack = 1;
  const primary = unit("reuse-1", "ally", []);
  const secondary = unit("reuse-2", "ally", []);
  [primary, secondary].forEach(target => {
    target.hp = 100;
    target.maxHp = 100;
  });
  const state = battleState(edis, [primary, secondary]);

  combat.useCard(state, edis, primary, slash);
  const firstExtra = Math.max(0, 7 - edis.stats.handLimit);
  assert.strictEqual(secondary.maxHp - secondary.hp, 1 + firstExtra,
    "a seven-card first use must create the original and all repeated virtual pursuits");
  ["edisChain", "_edisPrePlayHand", "_edisHit", "_edisResolving", "_edisRepeating"].forEach(key => {
    assert.strictEqual(key in slash, false, `${key} must be cleared after the first card use`);
  });

  edis.discard.splice(edis.discard.indexOf(slash), 1);
  edis.hand.unshift(slash);
  edis.hand.push(card("闪"));
  edis.intent = 1;
  const before = secondary.hp;
  combat.useCard(state, edis, primary, slash);
  const secondExtra = Math.max(0, 8 - edis.stats.handLimit);
  assert.strictEqual(before - secondary.hp, 1 + secondExtra,
    "the same returned Slash must recalculate eight cards and chain for fresh pursuits");
}

module.exports = {
  testAiSequenceAndPursuits, testReturnedSlashRecalculation,
  testSetupCardPriority,
};
