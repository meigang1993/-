const { assert, setup } = require("./witherer-test-fixtures");
const { runSplitAndRelicTests, runResponseTests } = require("./witherer-test-suites");

setup();

const state = { log: [], lines: [], battle: { allies: [], enemies: [], animQueue: [] } };
const actor = {
  id: "xx_witherer_1124", uid: "e0", side: "enemy", name: "XX型凋零者1124号", hp: 320,
  stats: { attack: 12, magic: 10, bloodlust: 1 }, statuses: [], skills: [{ name: "杀欲窥视" }],
  hand: [
    { name: "红牌A", type: "tactic", suit: "♥" },
    { name: "红牌B", type: "tactic", suit: "♦" },
    { name: "黑牌A", type: "tactic", suit: "♠" },
  ],
};

assert(window.WithererSkills.canShift(actor), "red-majority hand should allow first shift");
assert(window.WithererSkills.useShift(state, actor), "first shift should succeed");
assert(actor.withererMode === "暴走", "red-majority hand should enter berserk");
assert(actor.statuses.includes("暴走"), "berserk status marker should be present");
assert(window.WithererSkills.noIntentCost(actor, actor.hand[0]), "red card in berserk should cost no intent");
const redTactic = actor.hand[0], redResponse = { name: "闪", type: "response", suit: "♥", text: "抵消一张杀。" };
const tacticView = window.WithererSkills.displayCard(actor, redTactic);
assert(tacticView !== redTactic && tacticView.name === "杀（普攻）" && tacticView.type === "slash", "berserk red tactic should render as a normal kill");
assert(redTactic.name === "红牌A" && redTactic.type === "tactic", "berserk hand preview must not mutate the original card");
const specialFields = ["targetless", "allyTarget", "healPct", "healScale", "fire", "burnCard", "armSelf", "armoredRam", "backflip", "revengeKill"];
const specialRedCard = { name: "混合红牌", type: "consume", suit: "♥", noIntentCost: false, targetless: true, allyTarget: true, healPct: .3, healScale: "magic", fire: true, burnCard: true, armSelf: true, armoredRam: true, backflip: true, revengeKill: true };
const specialView = window.WithererSkills.displayCard(actor, specialRedCard);
assert(specialView.power === 0 && specialView.scale === "attack" && specialView.noIntentCost && specialView.convertedFrom === "混合红牌", "berserk preview should expose normal-kill damage and conversion metadata");
assert(specialFields.every(key => !specialView[key]), "berserk preview must clear every original target and special-effect field");
window.WithererSkills.convertBerserkCard(state, actor, specialRedCard);
assert(specialRedCard.type === "slash" && specialFields.every(key => !specialRedCard[key]), "real berserk conversion must clear every original target and special-effect field");
window.BattleCardCleanup.clearPlayFlags(specialRedCard);
assert(specialRedCard.type === "consume" && specialFields.every(key => specialRedCard[key]) && specialRedCard.noIntentCost === false, "berserk cleanup must restore all original card fields");
assert(window.WithererSkills.canUseBerserkCard(actor, redResponse), "berserk should allow a red response card to be used as a kill");
assert(window.WithererSkills.displayCard(actor, redResponse).type === "slash", "berserk red response should render as a kill");
const tacticHtml = window.UICommon.card(redTactic, false, { actor });
assert(tacticHtml.includes("杀（普攻）") && tacticHtml.includes("play-card slash"), "active hand UI should show berserk red cards with kill name and styling");
window.WithererSkills.convertBerserkCard(state, actor, redTactic);
assert(redTactic.name === "杀（普攻）" && redTactic.type === "slash" && redTactic.withererBerserkKill && redTactic.convertedFrom === "红牌A", "playing a berserk red card should perform the real kill conversion");
window.BattleCardCleanup.clearPlayFlags(redTactic);
assert(redTactic.name === "红牌A" && redTactic.type === "tactic" && !redTactic.withererBerserkKill && !redTactic.convertedFrom, "resolved berserk conversion should restore the original card fields");
const targeting = window.BattleCombatTargeting({ isKillCard: window.CardUtils.isKillCard }, {});
actor.hand.push(redResponse);
assert(targeting.canPlay(actor, redResponse), "red response card should be actively playable as a kill during berserk");
actor.hand.pop();
const redVariants = [...new Map(
  [...window.GameDataCards.protectedBaseDeck, ...window.GameDataCards.eliteCards]
    .filter(card => card.suit === "♥" || card.suit === "♦")
    .map(card => [`${card.name}|${card.suit}`, card])
).values()];
const safeConvertedKeys = new Set(["name", "type", "power", "scale", "suit", "price", "text", "noIntentCost", "withererBerserkKill", "convertedFrom"]);
const officialEffectKeys = [...new Set(redVariants.flatMap(card => Object.keys(card)))].filter(key => !safeConvertedKeys.has(key));
const cardSnapshot = card => JSON.stringify(Object.entries(card).sort(([a], [b]) => a.localeCompare(b)));
redVariants.forEach((template, index) => {
  const source = { ...template }, original = cardSnapshot(source), label = `${source.suit}${source.name}`;
  const player = { id: "xx_witherer_1124", uid: `player-red-${index}`, side: "ally", hp: 20, maxHp: 20, intent: 0, stats: { bloodlust: 1 }, withererMode: "暴走", hand: [source] };
  const ally = { uid: `ally-red-${index}`, side: "ally", hp: 20 }, enemy = { uid: `enemy-red-${index}`, side: "enemy", hp: 20 };
  const battleState = { battle: { allies: [player, ally], enemies: [enemy], activeUid: player.uid, phase: 4, locked: false, selectedCardIndex: null, selectedSkillCard: null } };
  const view = window.WithererSkills.displayCard(player, source);
  assert(view !== source && view.name === "杀（普攻）" && view.type === "slash" && view.power === 0 && view.scale === "attack", `${label} should display as a normal kill during berserk`);
  assert(view.noIntentCost && view.convertedFrom === source.name && officialEffectKeys.every(key => !view[key]), `${label} preview must clear all original effect fields`);
  assert(cardSnapshot(source) === original, `${label} preview must not mutate the source card`);
  assert(window.UICommon.card(source, false, { actor: player }).includes("play-card slash"), `${label} hand UI should use kill styling`);
  window.WithererSkills.convertBerserkCard(state, player, source);
  assert(source.name === "杀（普攻）" && source.type === "slash" && officialEffectKeys.every(key => !source[key]), `${label} real conversion must use only normal-kill effects`);
  window.BattleCardCleanup.clearPlayFlags(source);
  assert(cardSnapshot(source) === original, `${label} cleanup must restore every original field`);
  let used = null;
  const activeTargeting = window.BattleCombatTargeting({ active: b => b.allies.find(u => u.uid === b.activeUid), isKillCard: window.CardUtils.isKillCard }, { useCard: (_state, user, target, card) => { used = { user, target, card }; return true; }, checkEnd() {} });
  assert(activeTargeting.selectCard(battleState, 0), `${label} should be selectable at zero intent during berserk`);
  assert(!activeTargeting.playSelectedCard(battleState), `${label} converted to a kill must require an enemy target`);
  assert(!activeTargeting.chooseTarget(battleState, ally.uid), `${label} converted to a kill must reject ally targets`);
  assert(activeTargeting.chooseTarget(battleState, enemy.uid), `${label} converted to a kill should accept an enemy target`);
  assert(activeTargeting.playSelectedCard(battleState), `${label} converted to a kill should play after selecting an enemy`);
  assert(used?.user === player && used?.target === enemy && used?.card === source, `${label} targeting should preserve the source card while sending the enemy target`);
});
assert(redVariants.length > 0, "official red-card coverage must not be empty");

actor.hand = [
  { name: "红牌A", type: "tactic", suit: "♥" },
  { name: "黑牌A", type: "tactic", suit: "♠" },
  { name: "黑牌B", type: "tactic", suit: "♣" },
];
assert(window.WithererSkills.canShift(actor), "same turn should allow switching to the other mode");
assert(window.WithererSkills.useShift(state, actor), "second same-turn shift should succeed");
assert(actor.withererMode === "极速", "black-majority hand should enter speed mode");
assert(!actor.statuses.includes("暴走") && actor.statuses.includes("极速"), "status marker should switch modes");
assert(window.WithererSkills.displayCard(actor, actor.hand[0]) === actor.hand[0], "switching away from berserk should clear the red-card kill preview");
assert(actor.hand[1].withererSpeedResponse, "black cards should be marked as speed responses");
assert(window.WithererSkills.canCounterTacticCard(actor, actor.hand[1]), "black card should work as counter in speed mode");

const sonia = {
  ref: "sonia", uid: "a0", side: "ally", name: "索尼娅", hp: 43,
  stats: { attack: 4, magic: 3, bloodlust: 1 }, statuses: [],
  skills: [{ name: "杀欲窥视" }, { name: "鲜血之忆" }, { name: "暴走与极速" }],
  hand: [{ name: "红牌", type: "tactic", suit: "♥" }],
};
assert(window.WithererSkills.canShift(sonia), "playable Sonia should satisfy the explicit shift identity guard");
assert(window.WithererSkills.useShift(state, sonia) && sonia.withererMode === "暴走", "playable Sonia should use all XX Witherer shift mechanics");

const bondi = {
  id: "orc_king_bondi", ai: "orc_king_bondi", name: "兽人王邦迪",
  skills: [{ name: "杀欲窥视" }],
  hand: [{ name: "黑牌A", type: "tactic", suit: "♠" }, { name: "黑牌B", type: "tactic", suit: "♣" }],
};
assert(!window.WithererSkills.canShift(bondi), "Bondi must never satisfy the witherer shift identity guard");
assert(!window.WithererSkills.beforeEndMove(bondi), "Bondi must not generate 暴走与极速 before ending his turn");
assert(!window.WithererSkills.aiMove(state, bondi, [], [], bondi.hand, () => true, {}), "Bondi must not enter witherer AI");
assert(!window.WithererSkills.useShift(state, bondi), "Bondi must not execute 暴走与极速 even if a skill card leaks");
assert(!bondi.withererMode, "Bondi must not gain a witherer mode");

const peekActor = {
  id: "xx_witherer_1124", uid: "peek-owner", side: "enemy",
  name: "窥视者", hp: 20, hand: [], skills: [{ name: "杀欲窥视" }],
};
const peekTarget = {
  uid: "peek-target", side: "ally", name: "窥视目标", hp: 20,
  hand: [
    { name: "杀（普攻）", type: "slash", suit: "♠" },
    { name: "火杀", type: "slash", suit: "♥", fire: true },
    { name: "战术牌", type: "tactic", suit: "♣" },
    { name: "待摸杀", type: "slash", suit: "♦", _pendingDraw: true },
  ],
};
const peekState = {
  log: [],
  battle: { allies: [peekTarget], enemies: [peekActor], animQueue: [] },
};
assert(window.WithererSkills.usePeek(peekState, peekActor, peekTarget),
  "Killing Intent Peek should resolve on its first use");
assert(peekActor.hand.length === 2
  && peekActor.hand[0].name === "杀（普攻）" && peekActor.hand[0].suit === "♠"
  && peekActor.hand[1].name === "火杀" && peekActor.hand[1].suit === "♥",
  "Killing Intent Peek must copy each visible Slash with the same name and suit");
assert(peekActor.hand.every(card => card.temporary && card.void && card.noIntentCost
  && card.withererPeekSlash && card.generatedBySkill === "杀欲窥视"),
  "Killing Intent Peek copies must be temporary consumed cards that cost no intent");
assert(peekState.battle.animQueue.length === 1
  && peekState.battle.animQueue[0].type === "gainCards",
  "Killing Intent Peek must gain copied Slashes without revealing the target hand");
const peekHandAfterFirst = peekActor.hand.length;
const peekQueueAfterFirst = peekState.battle.animQueue.length;
assert(!window.WithererSkills.usePeek(peekState, peekActor, peekTarget),
  "Killing Intent Peek executor must reject a second same-turn use");
assert(peekActor.hand.length === peekHandAfterFirst,
  "Rejected repeated Killing Intent Peek must not generate more cards");
assert(peekState.battle.animQueue.length === peekQueueAfterFirst,
  "Rejected repeated Killing Intent Peek must not queue reveal or gain effects");
assert(!targeting.canPlay(peekActor, {
  name: "杀欲窥视", type: "tactic", _skill: true, withererPeek: true,
}), "Killing Intent Peek must become unplayable after its once-per-turn use");

runSplitAndRelicTests(assert);

const scytheBoss = { id: "xx_witherer_1124", uid: "scythe-boss", side: "enemy", hand: [], statuses: [], battleRelics: ["1124号镰刀"] };
const defeatedOnce = { uid: "test-ally-1", side: "ally", hp: 0, skills: [], stats: {}, hand: [] };
const defeatedTwice = { uid: "test-ally-2", side: "ally", hp: 0, skills: [], stats: {}, hand: [] };
const scytheState = { log: [], battle: { roundOrder: ["test-ally-1", scytheBoss.uid], roundIndex: 2, withererScytheDefeated: [] } };
window.WithererSkills.afterDamage(scytheState, scytheBoss, defeatedOnce, { type: "slash" }, 5);
assert(scytheBoss.withererExtraTurns === 1, "first defeated target should grant a scythe extra turn");
window.WithererSkills.endTurn(scytheState, scytheBoss);
assert(scytheState.battle.roundOrder.filter(uid => uid === scytheBoss.uid).length === 2, "scythe should enqueue exactly one extra turn");
defeatedOnce.hp = 10;
defeatedOnce.hp = 0;
window.WithererSkills.afterDamage(scytheState, scytheBoss, defeatedOnce, { type: "slash" }, 5);
assert(!scytheBoss.withererExtraTurns, "redefeating the same recovered target must not grant another extra turn");
window.WithererSkills.afterDamage(scytheState, scytheBoss, defeatedTwice, { type: "slash" }, 5);
assert(scytheBoss.withererExtraTurns === 1, "a different defeated target may grant another extra turn");

const pursuer = { pursueFreeThisTurn: false };
[
  [{ name: "虚拟杀", type: "slash", virtual: true }, "virtual kill"],
  [{ name: "技能杀", type: "slash", _skill: true }, "skill kill"],
  [{ name: "追杀", type: "slash", pursueKill: true }, "追杀"],
].forEach(([card, label]) => {
  window.WithererSkills.afterDodged(state, pursuer, {}, card);
  assert(!pursuer.pursueFreeThisTurn, `${label} must not enable 追杀`);
});
window.WithererSkills.afterDodged(state, pursuer, {}, { name: "杀（普攻）", type: "slash" });
assert(pursuer.pursueFreeThisTurn, "another entity kill that misses must enable 追杀");

const blackAttack = { name: "黑色战术", type: "tactic", suit: "♣" };
window.WithererSkills.prepareSpeedCard(state, actor, blackAttack);
assert(blackAttack.ignoreResponse && blackAttack._tempIgnoreResponse, "black card use should become temporarily unresponsive");
window.WithererSkills.endTurn(state, actor);
assert(actor.withererMode === "极速" && actor.statuses.includes("极速"), "mode must survive turn end");
window.BattleTurnState.resetBeginTurn(actor, { mimicLinks: [], played: [], shownPlayed: [] }, 1);
assert(actor.withererMode === null && !actor.statuses.includes("极速"), "mode must clear at the next turn start");
assert(window.WithererSkills.displayCard(actor, actor.hand[0]) === actor.hand[0], "next-turn mode expiry should leave cards in their original display form");

const groups = window.GameDataFutureEnemies.orc_dungeon;
const split = groups.find(enemy => enemy.id === "witherer_1124_split");
const boss = groups.find(enemy => enemy.id === "xx_witherer_1124");
assert(split.drawPerTurn === 1 && split.initialDraw === 1, "split draw bonuses must remain +1/+1");
assert(boss.drawPerTurn === 3 && boss.initialDraw === 2, "boss draw bonuses must remain +3/+2");

runResponseTests(assert);
console.log("Witherer rule regression tests passed");
