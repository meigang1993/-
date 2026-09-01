window.BattleSaveCheckpointValidation = (() => {
  const blockingKeys = [
    "selectedCardIndex", "selectedCostCardIndex", "selectedSkillCard",
    "selectedBagIndexes", "pendingTargetUid", "pendingTargetUids",
    "comboPartnerUid", "discardPick", "handReveal", "mannyArmoryPicker",
    "wendyTutorPicker", "ailengDrillPicker", "cadicisResponsibility",
    "cadicisResponsibilityResume", "manualDodge", "manualDodgeResume",
    "manualCounter", "counterTrigger", "counterTriggerQueue",
    "recklessPrompt", "risaEyePrompt", "thunderHammer",
    "greenGatlingResume", "demonInvasionResume", "groupHealResume",
    "comboAttackResume", "dimensionTransfer", "newMoonShare", "gerdaComfort",
    "millerShare", "kaiichiShare", "kaiichiShareQueue", "reactionQueue",
    "cardResumeQueue", "awaitingExtractUid", "awaitingMimicUid",
    "awaitingSpeedAssaultUid", "prepareUnitUid", "endPhaseUnitUid",
    "pendingVictory", "pendingDefeat", "victoryScreen",
  ];
  const record = value => !!value && typeof value === "object"
    && !Array.isArray(value);

  function activeUnit(battle) {
    return battle?.allies?.concat(battle.enemies || [])
      .find(unit => unit?.uid === battle.activeUid);
  }

  function validUnits(units, side) {
    return Array.isArray(units) && units.length > 0 && units.length <= 8
      && units.every(unit => record(unit) && unit.side === side
        && typeof unit.uid === "string" && unit.uid.length > 0
        && Number.isFinite(unit.hp) && Array.isArray(unit.hand));
  }

  function validOrder(battle) {
    if (!Array.isArray(battle.roundOrder)
      || !Number.isSafeInteger(battle.roundIndex)
      || battle.roundIndex < 0 || battle.roundIndex > battle.roundOrder.length) {
      return false;
    }
    const units = battle.allies.concat(battle.enemies);
    const known = new Set(units.map(unit => unit.uid));
    return known.size === units.length
      && battle.roundOrder.length === new Set(battle.roundOrder).size
      && battle.roundOrder.every(uid => known.has(uid))
      && battle.roundOrder.includes(battle.activeUid);
  }

  function hasPendingCards(battle) {
    return battle.allies.concat(battle.enemies)
      .some(unit => (unit.hand || []).some(card => card?._pendingDraw));
  }

  function hasBlockingValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    return value != null && value !== false;
  }

  function stable(state) {
    const battle = state?.battle;
    const active = battle && activeUnit(battle);
    return state?.view === "battle"
      && !!battle && !battle.test && battle.phase === 4
      && Number.isSafeInteger(battle.turn) && battle.turn >= 0
      && active?.side === "ally" && active.hp > 0
      && !battle.locked && !battle.defeat && !battle.testComplete
      && !battle.thinkingUid && !battle.kaiichiShareScheduled
      && validUnits(battle.allies, "ally") && validUnits(battle.enemies, "enemy")
      && validOrder(battle)
      && Array.isArray(battle.played) && Array.isArray(battle.shownPlayed)
      && Array.isArray(battle.animQueue) && battle.animQueue.length === 0
      && !blockingKeys.some(key => hasBlockingValue(battle[key]))
      && !hasPendingCards(battle);
  }

  function validPile(pile) {
    return record(pile)
      && ["deck", "discard", "consumed"].every(key => Array.isArray(pile[key]))
      && (pile.shuffleCount == null
        || Number.isSafeInteger(pile.shuffleCount) && pile.shuffleCount >= 0);
  }

  function sidePile(units) {
    const pile = units[0]?.pileStats;
    return validPile(pile) && units.every(unit => validPile(unit.pileStats))
      ? pile : null;
  }

  return { record, sidePile, stable, validPile, validUnits };
})();
