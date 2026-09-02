window.BattleActionHandVisibility = (() => {
  const kaiichiShareVisible = battle =>
    !!battle?.kaiichiShare && (window.HoshinoSkills?.shareVisible?.(battle) ?? true);
  const dimensionTransferVisible = battle =>
    !!battle?.dimensionTransfer
    && (window.MannySkills?.dimensionTransferVisible?.(battle) ?? true);
  const responsibilityVisible = battle =>
    !!battle?.cadicisResponsibility
    && (window.WendyCadicisSkills?.responsibilityVisible?.(battle) ?? true);

  function expectedHandOwner(battle) {
    const borrowChoice = ["borrowSlashChoice", "borrowGainChoice"]
      .includes(battle?.handReveal?.mode);
    return (borrowChoice ? battle.handReveal.targetUid : null)
      || (dimensionTransferVisible(battle) ? battle.dimensionTransfer.mannyUid : null)
      || (kaiichiShareVisible(battle) ? battle.kaiichiShare.unitUid : null)
      || (responsibilityVisible(battle) ? battle.cadicisResponsibility.cadicisUid : null)
      || battle?.newMoonShare?.unitUid
      || battle?.millerShare?.unitUid
      || BattleSystem.active(battle)?.uid
      || "";
  }

  function cardMatchesHandOwner(card, battle) {
    const renderedUid = card.closest(".active-hand")?.dataset.handOwner || "";
    return renderedUid && renderedUid === String(expectedHandOwner(battle));
  }

  function queuePromptCard(label, key, cardNode, task) {
    const actionState = state;
    const battle = actionState.battle;
    const prompt = battle?.[key];
    if (!prompt) return false;
    return BattleActionGuard.runWhenIdle(label, task, {
      control: cardNode,
      isCurrent: () => window.state === actionState
        && actionState.battle === battle && battle[key] === prompt,
    });
  }

  return {
    kaiichiShareVisible, dimensionTransferVisible, responsibilityVisible,
    expectedHandOwner, cardMatchesHandOwner, queuePromptCard,
  };
})();
