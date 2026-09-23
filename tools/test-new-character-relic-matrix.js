const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "battle-draw-feedback.js",
  "battle-discard-flow.js",
  "witherer-relic-skills.js",
  "witherer-skills.js",
  "battle-combat-card-effects.js", "battle-combat-attack-values.js",
  "battle-combat-attack-flow.js", "battle-combat-attack.js", "battle-combat-resolver.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

const characters = ["gerda", "hoshino_yi", "hoshino_kaiichi"]
  .map(id => GameData.characters.find(character => character.id === id));
const relics = Object.keys({ ...GameDataRelics, ...GameDataFutureRelics });

assert(characters.every(Boolean), "all three new characters must exist");
assert(relics.length === 30, "relic matrix must cover all 30 relics");

for (const character of characters) {
  for (const relic of relics) {
    const state = {
      chars: characters, resources: { relics: [relic] },
      equipment: {}, testEquipment: {}, relicCollection: [],
    };
    assert(RelicSystem.equip(state, character.id, relic), `${character.name} must equip ${relic}`);
    assert(!RelicSystem.equip(state, character.id, relic), `${character.name} repeated ${relic} equip must be a no-op`);
    assert(RelicSystem.hasEquipped(state, character.id, relic), `${character.name} must retain ${relic}`);
    assert(RelicSystem.statText(relic).includes(relic), `${relic} must expose valid UI data`);
    Object.values(RelicSystem.statsOf(state, character.id))
      .forEach(value => assert(Number.isFinite(value), `${character.name}/${relic} stats must stay finite`));
  }
}

function battleState(allies, enemies = []) {
  const state = {
    equipment: {}, testEquipment: {}, resources: { relics: [] }, log: [],
    battle: {
      allies, enemies, phase: 4, activeUid: allies[0]?.uid,
      locked: false, animQueue: [], played: [], shownPlayed: [],
    },
  };
  window.state = state;
  return state;
}

const yiData = characters[1];
const yi = unitFromCharacter(yiData, "yi-army");
yi.battleRelics = ["军令状"];
yi.hand = [
  card("军令费用甲", "response", { suit: "♦" }),
  card("军令费用乙", "response", { suit: "♦" }),
];
const yiState = battleState([yi], [{ uid: "army-target", side: "enemy", hp: 20 }]);
let invasion = null;
assert(BakarRelicSkills.useArmyOrder(yiState, yi, { _bagIndexes: [0, 1] }, (_state, actor, target, used) => {
  invasion = used;
  HoshinoSkills.afterCardPlayed(yiState, actor, target, used, { draw() {}, damage() {} });
}), "Yi must activate Army Order");
assert(invasion?.suit === "♦", "Army Order invasion must inherit its paid suit");
assert(yi.hoshinoMissionCards === 1 && yi.hoshinoLastSuit === "♦", "Army Order must count once and record one suit");

const repeated = unitFromCharacter(yiData, "yi-repeat");
const repeatedState = battleState([repeated]);
HoshinoSkills.afterCardPlayed(repeatedState, repeated, repeated, card("原战术", "tactic", { suit: "♥" }), { draw() {}, damage() {} });
HoshinoSkills.afterCardPlayed(repeatedState, repeated, repeated, card("重复战术", "tactic", { suit: "♠", _repeat: true }), { draw() {}, damage() {} });
assert(repeated.hoshinoMissionCards === 1 && repeated.hoshinoLastSuit === "♥", "Krow repeat must not double-count Yi's card or suit");

const tongueYi = unitFromCharacter(yiData, "yi-tongue");
tongueYi.battleRelics = ["1124号长舌头"];
tongueYi.intent = 0;
const tongueTarget = { uid: "tongue-target", side: "enemy", name: "目标", hp: 20 };
const tongueState = battleState([tongueYi], [tongueTarget]);
const tongueCard = { name: "1124号长舌头", type: "tactic", _skill: true, _relicSkill: true, withererTongueActive: true };
const resolver = BattleCombatResolver({
  deps: { isKillCard: CardUtils.isKillCard, draw() {}, intentMax: () => 2, tempAttack: () => 0 },
  specials: {}, damage() {}, selectedHand() {}, moveHand() {}, statOf: () => 0,
  pushFloat() {}, checkDefeat: () => false, checkEnd() {}, cardPower: () => 0,
  isSingleSlash: () => false, repeatIfDone() {}, hasNoIntentCost: () => true,
  useCard(state, actor, target, used) {
    HoshinoSkills.afterCardPlayed(state, actor, target, used, { draw() {}, damage() {} });
  },
});
resolver.continueAfterCounter(tongueState, tongueYi, tongueTarget, tongueCard);
if (!tongueCard.skipAfterCardPlayed) HoshinoSkills.afterCardPlayed(tongueState, tongueYi, tongueTarget, tongueCard, { draw() {}, damage() {} });
assert(tongueYi.hoshinoMissionCards === 1, "Witherer Tongue must count only its generated kill");
assert(tongueCard.skipAfterCardPlayed && tongueCard.skipMvpCardCount, "Witherer Tongue activation must suppress duplicate card-use hooks");

const kaiichi = unitFromCharacter(characters[2], "kaiichi-share");
const charmTarget = unitFromCharacter(characters[0], "charm-target");
charmTarget.battleRelics = ["盖亚妮丝护符"];
const status = card("粘液", "consume", { slime: true });
const normal = card("普通牌", "tactic", { suit: "♣" });
kaiichi.hand = [status, normal];
const shareState = battleState([kaiichi, charmTarget]);
shareState.battle.kaiichiShare = { unitUid: kaiichi.uid, maxCount: 2, indexes: [0, 1] };
shareState.battle.locked = true;
const originalCards = window.BattleCards;
window.BattleCards = {
  ...originalCards,
  put(_battle, owner, moved, pile) { (owner[pile] ||= []).push(moved); },
  afterHandLost() {},
  syncStatusCards() {},
};
try {
  assert(HoshinoSkills.resolveShare(shareState, charmTarget.uid).ok, "Kaiichi must resolve relic-aware sharing");
} finally {
  window.BattleCards = originalCards;
}
assert(charmTarget.consumed.includes(status) && !charmTarget.hand.includes(status), "Gaianys Charm must consume transferred status cards");
assert(charmTarget.hand.includes(normal), "Gaianys Charm must not consume normal transferred cards");

const gerda = unitFromCharacter(characters[0], "gerda-watch");
const comfortAlly = unitFromCharacter(characters[1], "comfort-ally");
gerda.battleRelics = ["母亲怀表"];
gerda.playedSlashThisTurn = false;
const gerdaState = battleState([gerda, comfortAlly]);
const flow = BattleDiscardFlow({
  active: () => gerda, visibleHand: unit => unit.hand.length,
  handLimit: unit => unit.stats.handLimit, canDiscardCard: () => true,
  canDiscardAny: () => true, discardNeed: () => 5, discardOverflow() {},
  enterEndPhase: (state, unit) => GerdaSkills.endTurn(state, unit),
  draw() {}, combat: { pushFloat() {} }, record() {}, advanceToInput() {}, manualFlow: {},
});
assert(flow.enterDiscardOrEnd(gerdaState, gerda) === false, "Mother Watch must still enter Gerda's end-phase prompt");
assert(gerdaState.battle.gerdaComfort?.unitUid === gerda.uid && gerdaState.battle.locked, "Gerda Comfort must remain available after skipped discard");

console.log(`New character relic matrix passed: ${characters.length * relics.length} combinations`);
