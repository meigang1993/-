window.BattleActionHandBindings = (() => {
  const {
    kaiichiShareVisible, dimensionTransferVisible, responsibilityVisible,
    cardMatchesHandOwner, queuePromptCard,
  } = window.BattleActionHandVisibility;

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
      || skillCard?.crazyShooting || skillCard?.demonPoker
      || skillCard?.succubusFork || skillCard?.assassinLatex
      || skillCard?.mariaHonorBlessing;
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
      && !skillCard?.demonPoker
      && !skillCard?.succubusFork && !skillCard?.assassinLatex
      && !skillCard?.mariaHonorBlessing) quickPlayTargetless(index);
  }

  function bindSkills() {
    document.querySelectorAll("[data-skill-index]").forEach(skill => {
      skill.onclick = event => {
        event.stopPropagation();
        if (state.battle?.locked || BattleEffects.animating) return;
        if (!BattleSystem.selectSkill(state, Number(skill.dataset.skillIndex))) {
          BattleSystem.cancelSelection(state);
          return render();
        }
        if (state.battle?.selectedSkillCard?.mannyArmory) return confirmMannyArmory();
        if (state.battle?.selectedSkillCard?.targetless && !needsHandChoice(state.battle.selectedSkillCard)) {
          return confirmBattleCard();
        }
        render();
      };
    });
  }

  return { bindCards, bindSkills, kaiichiShareVisible };
})();
