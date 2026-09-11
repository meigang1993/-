/* global AngelicaLukaSkills, BattleCombatResolver, MannySkills, UnderwaterTrainSkills */

module.exports = ({
  assert, card, unit, incoming, manny, plainTarget,
}) => {
  let state;
  const transferManny = unit("transfer-manny", "ally", {
    ref: "manny", hand: [card("Black Cost", "response", { suit: "♠" })],
  });
  const transferProtected = unit("transfer-protected", "ally");
  const transferAttacker = unit("transfer-attacker", "enemy");
  const transferEnemy = unit("transfer-enemy", "enemy");
  state = {
    battle: {
      allies: [transferManny, transferProtected],
      enemies: [transferAttacker, transferEnemy], animQueue: [], locked: false,
    },
  };
  assert(MannySkills.transferSlash(
    state, transferAttacker, transferProtected, 4, "虚拟杀", { ...incoming },
  ), "Dimension Transfer must accept virtual single Slashes");
  assert(state.battle.dimensionTransfer.costIndex == null,
    "Dimension Transfer must wait for the player to choose a black cost card");
  assert(MannySkills.selectDimensionTransferCard(state, 0),
    "Dimension Transfer must allow selecting a visible black hand card");
  let redirectedTarget = null;
  let redirectedHits = 0;
  state.battle.dimensionTransfer.card.gatlingRepeats = 3;
  assert(MannySkills.resolveDimensionTransfer(state, transferEnemy.uid, (_state, target) => {
    redirectedTarget = target;
    redirectedHits += 1;
  }), "Dimension Transfer must resolve after choosing both a black card and an enemy");
  assert(redirectedTarget === transferEnemy
    && transferManny.hand.length === 0 && redirectedHits === 1,
  "Dimension Transfer must discard the selected black card and redirect only the current damage segment");
  transferManny.hand = [card("Second Black Cost", "response", { suit: "♣" })];
  assert(MannySkills.transferSlash(
    state, transferAttacker, transferProtected, 4, "放弃测试", { ...incoming },
  ), "Dimension Transfer must open again when another black cost is available");
  let declinedTarget = null;
  let repeatedResponsePath = false;
  const declineDamage = () => { repeatedResponsePath = true; };
  declineDamage.hitWithoutDodge = (_state, _actor, target) => { declinedTarget = target; };
  assert(MannySkills.resolveDimensionTransfer(state, null, declineDamage),
    "Dimension Transfer must allow the player to decline");
  assert(declinedTarget === transferProtected
    && transferManny.hand.length === 1 && !repeatedResponsePath,
  "declining Dimension Transfer must preserve the black card and resume the original hit without a second response");
  state.battle.dimensionTransfer = null;
  state.battle.locked = false;
  assert(MannySkills.transferSlash(
    state, transferAttacker, transferProtected, 4, "转换杀",
    card("Converted Slash", "slash", { convertedFrom: "闪" }),
  ), "Dimension Transfer must accept converted single Slashes");
  ["sweep", "targetless", "allTargets", "aoeLineShown"].forEach(marker => {
    state.battle.dimensionTransfer = null;
    state.battle.locked = false;
    const groupCard = card(`Group ${marker}`, "slash", {
      [marker]: marker === "allTargets" ? ["x"] : true,
    });
    assert(!MannySkills.transferSlash(
      state, transferAttacker, transferProtected, 4, "全体杀", groupCard,
    ), `Dimension Transfer must reject ${marker} group Slashes`);
  });

  const taunter = unit("taunter", "ally", { ref: "angelica" });
  const taunted = unit("taunted", "enemy", { hand: [{ ...incoming }] });
  let tauntCard = null;
  state = { battle: { allies: [taunter], enemies: [taunted], animQueue: [], locked: false } };
  AngelicaLukaSkills.handleSpecialCard(
    state, taunter, taunter, { angelicaTaunt: true }, {},
    { useCard(_state, _actor, _target, used) { tauntCard = used; } },
  );
  assert(tauntCard?.virtual,
    "Taunt must force a virtual single Slash when one is in hand");

  const raider = unit("raider", "enemy", { ai: "shark_pirate_raider" });
  const lootTarget = unit("loot", "ally", { hand: [card("Loot")] });
  state = { battle: { allies: [lootTarget], enemies: [raider], animQueue: [] } };
  UnderwaterTrainSkills.beforeKillTargeted(state, raider, lootTarget, { ...incoming });
  assert(raider.hand.length === 1 && lootTarget.hand.length === 0,
    "Raider must steal on virtual single-slash targeting");
  const crew = unit("crew", "enemy", { ai: "shark_pirate_crew" });
  UnderwaterTrainSkills.afterDamage(state, crew, lootTarget, { ...incoming }, 4, () => {});
  assert(crew.anchorGun?.amount === 4,
    "Crew must record virtual single-slash damage");
  const mordio = unit("mordio", "enemy", { ai: "shark_captain_mordio" });
  lootTarget.hand = [card("Discard Me")];
  UnderwaterTrainSkills.afterDamage(state, mordio, lootTarget, { ...incoming }, 2, () => {});
  assert(lootTarget.hand.length === 0,
    "Mordio must crush the hand after virtual single-slash damage");

  const mona = unit("mona", "enemy", {
    ai: "mona_eagle_captain", monaPiercingReady: true,
  });
  const monaCard = { ...incoming };
  UnderwaterTrainSkills.prepareKill({
    battle: { allies: [plainTarget], enemies: [mona], animQueue: [] },
  }, mona, plainTarget, monaCard);
  assert(monaCard.sweep && monaCard.holy && monaCard.twoDodgesRequired,
    "Mona's prepared virtual single slash must become the holy group attack");

  const berserker = unit("berserker", "ally", {
    ref: "angelica", rageMarks: 2,
  });
  state = {
    battle: {
      allies: [berserker], enemies: [], animQueue: [], locked: false,
    },
  };
  const berserkerSlash = card("杀（普攻）", "slash", { power: 1, scale: "attack" });
  const berserkerHandBefore = berserker.hand.length;
  assert(AngelicaLukaSkills.canPayIntentWithRage(berserker, berserkerSlash) === true
    && AngelicaLukaSkills.beforeIntentCost(state, berserker, berserkerSlash) === true
    && berserker.rageMarks === 1
    && berserker.hand.length === berserkerHandBefore,
  "Berserker Will must spend one rage mark to cover an entity slash intent cost");
  berserker.rageMarks = 0;
  assert(!AngelicaLukaSkills.canPayIntentWithRage(berserker, berserkerSlash)
    && AngelicaLukaSkills.beforeIntentCost(state, berserker, berserkerSlash) === false,
  "Berserker Will must stop covering intent cost once rage marks are exhausted");

  let flamerSweep = null;
  manny.mannyWeapon = "flamer";
  state = {
    battle: {
      allies: [manny], enemies: [plainTarget], activeUid: manny.uid,
      combo: 0, locked: false, animQueue: [],
    },
  };
  const resolver = BattleCombatResolver({
    deps: {
      isKillCard: item => item?.type === "slash",
      tempAttack: actor => actor.stats.attack,
    },
    specials: {
      sweepDamage: (_state, _actor, _amount, used) => { flamerSweep = used; },
      healBySyringe() {},
      resolveGreenGatling() {},
      queueBattleCourage() {},
    },
    useCard() {},
    damage() {},
    selectedHand() {},
    moveHand() {},
    statOf: (actor, key) => actor.stats[key] || 0,
    pushFloat() {},
    checkDefeat: () => false,
    checkEnd() {},
    cardPower: item => item.power || 1,
    isSingleSlash: () => false,
    repeatIfDone() {},
    hasNoIntentCost: () => true,
  });
  resolver.continueAfterCounter(
    state, manny, plainTarget,
    card("Virtual Flame", "slash", { virtual: true, power: 1, scale: "attack" }),
  );
  assert(flamerSweep?.sweep && flamerSweep.fire && flamerSweep.gatlingRepeats === 2,
    "Focused Flamer must transform virtual single slashes");
};
