window.BattleActionHandBindings = (() => {
  const kaiichiShareVisible = battle =>
    !!battle?.kaiichiShare && (window.HoshinoSkills?.shareVisible?.(battle) ?? true);
  const dimensionTransferVisible = battle =>
    !!battle?.dimensionTransfer
    && (window.MannySkills?.dimensionTransferVisible?.(battle) ?? true);
  const responsibilityVisible = battle =>
    !!battle?.cadicisResponsibility
    && (window.WendyCadicisSkills?.responsibilityVisible?.(battle) ?? true);
  const skillBindings = window.BattleActionSkillBindings({
    needsHandChoice, confirmMannyArmory, confirmBattleCard, render,
  });

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

  function bindCards() {
    document.querySelectorAll("[data-card-index]").forEach(card => {
      card.onclick = event => handleCardClick(event, card);
      card.ondblclick = event => handleCardDoubleClick(event, card);
      bindCardDrag(card);
    });
  }

  async function handleCardClick(event, cardNode) {
    event.stopPropagation();
    const index = Number(cardNode.dataset.cardIndex);
    const battle = state.battle;
    if (!cardMatchesHandOwner(cardNode, battle)) {
      render();
      return;
    }
    if (["borrowSlashChoice", "borrowGainChoice"].includes(battle?.handReveal?.mode)) {
      return BattleActionGuard.run("借刀杀人选牌失败", async ({ state: actionState, isCurrent }) => {
        await BattleSystem.resolveHandReveal(actionState, index, render);
        if (!isCurrent()) return false;
        render();
        await BattleEffects.whenIdle?.();
        if (!isCurrent()) return false;
        render();
        persist({ battleOperation: true });
      }, { control: cardNode });
    }
    if (dimensionTransferVisible(battle)) {
      return queuePromptCard(
        "次元转移选牌失败", "dimensionTransfer", cardNode,
        () => { if (MannySkills.selectDimensionTransferCard(state, index)) render(); },
      );
    }
    if (battle?.kaiichiShare) {
      return queuePromptCard(
        "半魅魔血选牌失败", "kaiichiShare", cardNode,
        () => {
          if (kaiichiShareVisible(state.battle)
            && BattleSystem.toggleKaiichiShareCard(state, index)) render();
        },
      );
    }
    if (responsibilityVisible(battle)) {
      const actionState = state;
      const prompt = battle.cadicisResponsibility;
      return BattleActionGuard.runWhenIdle(
        "责任担当处理失败",
        () => chooseCadicisGive(index),
        {
          control: cardNode,
          isCurrent: () => window.state === actionState
            && actionState.battle?.cadicisResponsibility === prompt,
        },
      );
    }
    if (battle?.millerShare) {
      const owner = battle.allies.find(unit => unit.uid === battle.millerShare.unitUid);
      const pickedCard = owner?.hand[index];
      return queuePromptCard(
        "米勒收获分享选牌失败", "millerShare", cardNode,
        () => {
          const currentIndex = owner?.hand.indexOf(pickedCard) ?? -1;
          if (BattleSystem.toggleMillerShareCard(
            state, currentIndex, pickedCard)) render();
        },
      );
    }
    if (battle?.locked || cardNode.dataset.dragged === "1") return;
    if (battle?.newMoonShare) {
      return queuePromptCard(
        "新月之歌选牌失败", "newMoonShare", cardNode,
        () => { if (BattleSystem.toggleNewMoonCard(state, index)) render(); },
      );
    }
    const actor = BattleSystem.active(battle);
    const picked = battleCardView(actor, actor?.hand[index]);
    const wasHammer = !!battle?.thunderHammer;
    if (battle?.phase === 5 || wasHammer) {
      return BattleActionGuard.run("战斗弃牌失败", async ({ state: actionState, isCurrent }) => {
        const ok = await BattleSystem.discardCard(actionState, index, render);
        if (!isCurrent()) return false;
        if (ok && (wasHammer || actionState.battle?.phase !== 5)) {
          persist({ battleOperation: true });
        }
      }, { control: cardNode });
    }
    if (BattleEffects.animating) return;
    if (battle?.selectedCardIndex === index && !battle.selectedSkillCard
      && (picked?.targetless || picked?.allyTarget)) return quickPlayTargetless(index);
    const wasCrazyReady = battle?.selectedSkillCard?.crazyShooting && battle.selectedCardIndex === index;
    BattleSystem.selectCard(state, index);
    if (wasCrazyReady) {
      render();
      persist({ battleOperation: true });
      return;
    }
    const skillCard = state.battle.selectedSkillCard;
    const waitsForTarget = skillCard?.elranaBag || skillCard?.armyOrder || skillCard?.elranaHeal
      || skillCard?.idolKiss
      || skillCard?.crazyShooting || skillCard?.demonPoker;
    if (needsHandChoice(skillCard) && !waitsForTarget && state.battle.selectedCardIndex != null) {
      return playSelectedCard();
    }
    render();
  }

  function handleCardDoubleClick(event, cardNode) {
    event.stopPropagation();
    const battle = state.battle;
    if (!cardMatchesHandOwner(cardNode, battle) || battle?.dimensionTransfer || battle?.kaiichiShare
      || battle?.cadicisResponsibility || battle?.newMoonShare || battle?.millerShare
      || ["borrowSlashChoice", "borrowGainChoice"].includes(battle?.handReveal?.mode)) return;
    const index = Number(cardNode.dataset.cardIndex);
    const skillCard = battle?.selectedSkillCard;
    if (!skillCard?.elranaBag && !skillCard?.armyOrder && !skillCard?.elranaHeal
      && !skillCard?.crazyShooting
      && !skillCard?.demonPoker) quickPlayTargetless(index);
  }

  return { bindCards, bindSkills: skillBindings.bindSkills, kaiichiShareVisible };
})();
