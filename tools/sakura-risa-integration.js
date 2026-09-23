/* global BattleCardSpecials, BattleCards, BattleCombatResolver, BattleCombatResponses, BattleEnemyTurn, BattleManualFlow, BattleSystem, BertisGerlotSkills, WithererRelicSkills */
const { fs, load, assert, unit } = require("./sakura-risa-test-harness");

async function runSakuraRisaIntegration(context) {
  const { target, armyOrderInvasion } = context;
  const turnUnit = unit({ uid: "turn-risa", hp: 20 });
    const turnState = { battle: { allies: [target], enemies: [turnUnit], activeUid: turnUnit.uid, phase: 4, locked: false } };
    window.state = turnState;
    const enemyTurn = BattleEnemyTurn({
      wait: async () => {},
      waitEffects: async () => {},
      autoEnemy: async () => { turnUnit.hp = 0; turnUnit.risaRevivePending = true; },
    });
    assert(await enemyTurn.runEnemyPlayPhase(turnState, turnUnit), "Risa entering pending revival during her play phase must still finish the turn");

    const resumeRisa = unit({ uid: "resume-risa", hand: [{ type: "response" }, { type: "response" }] });
    const resumeTarget = unit({ uid: "resume-target", side: "ally", hand: [{ type: "response" }, { type: "response" }, { type: "response" }] });
    const resumeState = { battle: { allies: [resumeTarget], enemies: [resumeRisa], locked: false, demonInvasionResume: { actorUid: resumeRisa.uid, amount: 5, source: "机枪扫杀", targetUids: [resumeTarget.uid], nextTargetIndex: 0, card: { name: "机枪扫杀", type: "slash", sweep: true, _risaTargetedHit: true, ignoreResponse: true, _tempIgnoreResponse: true } } } };
    let resumedCard = null;
    window.state = resumeState;
    const manualFlow = BattleManualFlow({ active: () => null, allUnits: battle => battle.allies.concat(battle.enemies), combat: { damage(current, currentTarget, amount, source, actor, card) { resumedCard = card; }, checkEnd() {} }, finishTurn() {}, advanceToInput: async () => {}, runEnemyPlayPhase: async () => false, waitEffects: async () => {} });
    await manualFlow.resumeAfterManualResponse(resumeState);
    assert(resumedCard && !resumedCard.ignoreResponse, "Resumed Risa sweep must recalculate Light Wing for the new target");

    const counterCard = { name: "看破", type: "response", counterTactic: true };
    const counterUnit = unit({ uid: "counter-unit", side: "ally", hand: [counterCard] });
    const counterState = { battle: { allies: [counterUnit], enemies: [resumeRisa], animQueue: [], locked: true, comboPartnerUid: "stale-partner", manualCounter: { actorUid: resumeRisa.uid, targetUid: counterUnit.uid, card: { ...armyOrderInvasion }, comboPartnerUid: "stale-partner" } } };
    const responses = BattleCombatResponses({ allUnits: battle => battle.allies.concat(battle.enemies), putCard() {}, afterHandLost() {}, damage() {}, statOf() { return 0; }, specials: {}, checkDefeat() {}, checkEnd() {}, continueAfterCounter() {}, deps: { nextAnim: () => 1 }, pushFloat() {}, cardPower() { return 0; }, slashTargetAmount() { return 0; } });
    responses.resolveManualCounter(counterState, true);
    assert(!counterUnit.hand.length, "Manual Insight must be consumed when countering Army Order's virtual invasion");
    assert(counterState.battle.comboPartnerUid === null, "A completed manual counter must clear stale combo-partner state");

    const convertedBackflip = { name: "后空翻", type: "response", suit: "♠", backflip: true };
    const speedResponder = unit({ uid: "speed-responder", side: "ally", hand: [convertedBackflip], withererMode: "极速" });
    const otherTarget = unit({ uid: "other-target", side: "ally", hand: [] });
    const convertedState = { battle: { allies: [otherTarget, speedResponder], enemies: [resumeRisa], animQueue: [], locked: true, manualCounter: { actorUid: resumeRisa.uid, targetUid: otherTarget.uid, card: { ...armyOrderInvasion } } } };
    const originalWitherer = window.WithererSkills;
    window.WithererSkills = { canCounterTacticCard: (owner, card) => owner === speedResponder && card === convertedBackflip };
    responses.resolveManualCounter(convertedState, true);
    window.WithererSkills = originalWitherer;
    assert(!speedResponder.hand.length && speedResponder.discard[0] === convertedBackflip,
      "a black Backflip used through Speed mode must resolve as Insight instead of an ineligible Backflip");

    window.BattleTurnState = { cleanupPrompts() {}, cleanupTurn() {}, resetBeginTurn() {} };
    window.BattleSetup = () => ({ shuffle() {}, async create() { return { allies: [], enemies: [] }; } });
    window.BattleCombat = () => ({ checkDefeat() {}, checkEnd() {}, canPlay() {}, useCard() {}, pushFloat() {}, damage() {} });
    window.BattleOutcomes = () => ({});
    window.BattlePreparePrompts = () => ({ skipExtract() {}, resolveReckless() {}, resolveJudgement() {}, queueRecklessPrompt() {}, autoReckless() {} });
    window.BattleEnemyTurn = () => ({ runEnemyPlayPhase: async () => false });
    window.BattleManualFlow = () => ({});
    window.BattleDiscardOverflow = () => ({ discardOverflow() {} });
    window.BattleDiscardFlow = () => ({ enterDiscardOrEnd: () => false });
    window.BattleEndPhase = () => ({ run: () => false });
    window.BattlePileStats = { reshuffle() {} };
    window.BattleCards = null;
    load("battle-cards-system.js");
    load("battle-runtime-helpers.js");
    load("battle-relic-turns.js");
    load("battle-share-flow.js");
    load("battle-prepare-sequence.js");
    load("battle-session-settlement.js");
    load("battle-session.js");
    load("battle-auto-enemy.js");
    load("battle-turn-start.js");
    load("battle-turn-input.js");
    load("battle-turn-preparation.js");
    load("battle-turn-completion.js");
    load("battle-turn-flow.js");
    load("battle-resolution-actions.js");
    load("battle.js");

    const eyeRisa = unit({ uid: "eye-risa", hand: [], deck: [] });
    const marked = unit({
      uid: "marked", id: "marked", ai: "ally", name: "被标记者", side: "ally", ref: "bertis",
      hand: [], deck: Array.from({ length: 12 }, (_, i) => ({ name: `牌${i}`, type: i % 2 ? "slash" : "tactic" })),
      stats: { attack: 10, magic: 7, bloodlust: 2, handLimit: 4 },
    });
    const teammate = unit({
      uid: "teammate", id: "teammate", ai: "ally", name: "队友", side: "ally",
      hand: [], deck: [{ name: "队友杀", type: "slash" }], stats: { attack: 5, magic: 5, bloodlust: 1, handLimit: 4 },
    });
    const drawState = {
      resources: { relics: [] }, equipment: {},
      battle: { allies: [marked, teammate], enemies: [eyeRisa], animQueue: [], phase: 4, activeUid: marked.uid, locked: false, risaEye: { ownerUid: eyeRisa.uid, targetUid: marked.uid } },
    };
    window.state = drawState;
    const cardSpecials = BattleCardSpecials(
      { draw: BattleSystem.draw, nextAnim: () => 1, isKillCard: card => card.type === "slash" },
      { sameSideUnits: battle => battle.allies, selectedHand() { return { ok: false }; }, putCard() {}, putMany() {}, moveHand() {}, holdVisual() {}, pushFloat() {}, visualOf() {}, statOf() { return 0; }, hasSkill() { return false; }, useCard() {} },
    );
    cardSpecials.drawTeam(drawState, marked, { name: "物资补给", drawTeam: 1 });
    assert(marked.hand.length === 0 && eyeRisa.hand.length === 1, "A marked target's draw card must transfer its own drawn card to Risa");
    assert(teammate.hand.length === 1, "A team draw must not transfer an unmarked teammate's card");

    const resolver = BattleCombatResolver({
      deps: { draw: BattleSystem.draw, isKillCard: card => card.type === "slash" },
      specials: { repeatTactic() {} }, useCard() {}, damage() {}, selectedHand() {}, moveHand() {},
      statOf() { return 0; }, pushFloat() {}, checkDefeat() {}, checkEnd() {}, cardPower() { return 0; },
      isSingleSlash() { return false; }, repeatIfDone() {}, hasNoIntentCost() { return false; },
    });
    resolver.continueAfterCounter(drawState, marked, marked, { name: "魔力提炼", type: "tactic", drawCards: 2 });
    assert(marked.hand.length === 0 && eyeRisa.hand.length === 3, "Magic Refinement must transfer both cards drawn by the marked target to Risa");

    const pendingEye = unit({
      uid: "pending-eye-risa", hp: 0, risaRevivePending: true,
      hand: [{ name: "待复活手牌", type: "response" }],
    });
    const pendingMarked = unit({
      uid: "pending-marked", side: "ally", hand: [],
      deck: [{ name: "待复活提炼A" }, { name: "待复活提炼B" }],
    });
    const pendingState = {
      battle: {
        allies: [pendingMarked], enemies: [pendingEye], animQueue: [],
        phase: 4, activeUid: pendingMarked.uid,
        risaEye: { ownerUid: pendingEye.uid, targetUid: pendingMarked.uid },
      },
    };
    window.state = pendingState;
    resolver.continueAfterCounter(
      pendingState, pendingMarked, pendingMarked,
      { name: "魔力提炼", type: "tactic", drawCards: 2 },
    );
    assert(pendingMarked.hand.length === 0 && pendingEye.hand.length === 3,
      "Magic Refinement draws must still transfer to a Risa waiting to revive");
    window.state = drawState;

    const skillTarget = unit({ uid: "whip-target", id: "whip-target", side: "ally", name: "鞭笞目标", hp: 30, stats: {} });
    drawState.battle.allies.push(skillTarget);
    BertisGerlotSkills.handleSpecialCard(drawState, marked, skillTarget, { bertisWhip: true }, { draw: BattleSystem.draw }, { damage() {} });
    assert(marked.hand.length === 0 && eyeRisa.hand.length === 5, "A marked target's character draw skill must transfer all drawn cards to Risa");

    marked.deck = [{ name: "标记者杀", type: "slash" }];
    teammate.deck = [{ name: "队友另一杀", type: "slash" }];
    WithererRelicSkills.useWarHorn(drawState, marked, null, () => 2);
    assert(marked.hand.length === 0 && eyeRisa.hand.some(card => card.name === "标记者杀"), "War Horn's filtered draw must transfer the marked target's slash to Risa");
    assert(teammate.hand.some(card => card.name === "队友另一杀"), "War Horn must leave an unmarked teammate's slash with that teammate");

    await BattleSystem.endPlay(drawState);
    assert(drawState.battle.phase === 5 && !drawState.battle.risaEye, "Evil Eye must clear as soon as the marked play phase ends");
    const risaCardsAfterPhase = eyeRisa.hand.length;
    marked.deck = [{ name: "阶段外摸牌", type: "tactic" }];
    BattleSystem.draw(marked, 1, drawState.battle);
    assert(marked.hand.some(card => card.name === "阶段外摸牌") && eyeRisa.hand.length === risaCardsAfterPhase, "Draws after the play phase must stay with the original unit");
    console.log("Sakura Risa regression tests passed");
}

module.exports = { runSakuraRisaIntegration };
