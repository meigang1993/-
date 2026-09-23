window.BattleActionTargetBindings = (() => {
  function queuedPrompt(battle) {
    if (battle?.dimensionTransfer
      && (window.MannySkills?.dimensionTransferVisible?.(battle) ?? true)) {
      return ["dimensionTransfer", battle.dimensionTransfer];
    }
    const key = ["millerShare", "newMoonShare", "kaiichiShare", "gerdaComfort"]
      .find(name => battle?.[name]);
    return key ? [key, battle[key]] : null;
  }

  function bindTargetActions() {
    document.querySelectorAll(".selectable-target .unit-art").forEach(art => {
      art.onpointerenter = () => previewTarget(art);
      art.onpointerleave = clearTargetPreview;
    });
    document.querySelectorAll("[data-target]").forEach(target => {
      target.onclick = event => {
        event.stopPropagation();
        const actionState = state;
        const battle = actionState.battle;
        const queued = queuedPrompt(battle);
        const targetUid = target.dataset.target;
        if (queued) {
          const [key, prompt] = queued;
          BattleActionGuard.runWhenIdle(
            "目标选择处理失败",
            () => selectBattleTarget(targetUid),
            {
              control: target,
              isCurrent: () => window.state === actionState
                && actionState.battle === battle && battle[key] === prompt,
            },
          );
          return;
        }
        if (!BattleEffects.animating) {
          BattleActionGuard.run(
            "目标选择处理失败",
            () => selectBattleTarget(targetUid),
            { control: target },
          );
        }
      };
    });
    document.querySelector("[data-confirm-target]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        confirmBattleCard();
      },
    );
    document.querySelector("[data-cancel-target]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        cancelBattleSelect();
      },
    );
  }

  function previewTarget(art) {
    const battle = state.battle;
    const actor = BattleSystem.active(battle);
    const selected = battle?.selectedSkillCard || actor?.hand[battle?.selectedCardIndex];
    const card = battleCardView(actor, selected);
    const choosingPartner = (card?.borrowSlash || card?.comboAttack)
      && !battle.comboPartnerUid;
    const choosingTarget = card?.borrowSlash && battle.comboPartnerUid
      && !battle.pendingTargetUid || card?.comboAttack && battle.comboPartnerUid
      && !battle.pendingTargetUid;
    if (battle?.locked || (battle?.selectedCardIndex == null && !battle?.selectedSkillCard)
      || BattleEffects.animating || card?.soulChain
      || choosingPartner || choosingTarget) return;
    BattleEffects.choose(state, art.closest("[data-target]").dataset.target);
  }

  function clearTargetPreview() {
    const battle = state.battle;
    const actor = BattleSystem.active(battle);
    const selected = battle?.selectedSkillCard || actor?.hand[battle?.selectedCardIndex];
    const card = battleCardView(actor, selected);
    const choosingBorrowTarget = card?.borrowSlash
      && battle.comboPartnerUid && !battle.pendingTargetUid;
    const choosingComboTarget = card?.comboAttack
      && battle.comboPartnerUid && !battle.pendingTargetUid;
    if ((battle?.selectedCardIndex != null || battle?.selectedSkillCard)
      && !BattleEffects.animating && !card?.soulChain
      && !choosingBorrowTarget && !choosingComboTarget
      && !(card?.comboAttack && battle.comboPartnerUid)) {
      BattleEffects.clearTarget(state);
    }
  }

  return { bindTargetActions, previewTarget, clearTargetPreview };
})();
