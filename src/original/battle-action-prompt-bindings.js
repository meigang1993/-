window.BattleActionPromptBindings = (() => {
  function queuePrompt(event, label, key, task) {
    event.preventDefault();
    event.stopPropagation();
    const actionState = state;
    const battle = actionState.battle;
    const prompt = battle?.[key];
    if (!prompt) return false;
    return BattleActionGuard.runWhenIdle(label, task, {
      control: event.currentTarget,
      isCurrent: () => window.state === actionState
        && actionState.battle === battle && battle[key] === prompt,
    });
  }

  function bindGerdaComfortActions() {
    const skip = document.querySelector("[data-gerda-comfort-skip]");
    if (skip) {
      skip.onpointerdown = event => queuePrompt(
        event, "萌虎慰劳处理失败", "gerdaComfort",
        () => resolveGerdaComfort(null),
      );
    }
    if (!state.battle?.gerdaComfort) return;
    document.querySelectorAll(".ally-row .selectable-target[data-target]")
      .forEach(target => {
        target.onpointerdown = event => queuePrompt(
          event, "目标选择处理失败", "gerdaComfort",
          () => selectBattleTarget(target.dataset.target),
        );
      });
  }

  function bindPromptActions() {
    document.querySelector("[data-dimension-transfer-skip]")?.addEventListener(
      "click",
      event => queuePrompt(
        event, "次元转移处理失败", "dimensionTransfer",
        () => tryDimensionTransfer(null),
      ),
    );
    document.querySelector("[data-new-moon-skip]")?.addEventListener(
      "click",
      event => queuePrompt(
        event, "新月之力处理失败", "newMoonShare",
        () => resolveNewMoonShare(null),
      ),
    );
    bindGerdaComfortActions();
    document.querySelector("[data-kaiichi-share-skip]")?.addEventListener(
      "click",
      event => queuePrompt(
        event, "半魅魔血分牌失败", "kaiichiShare",
        () => resolveKaiichiShare(null),
      ),
    );
    document.querySelector("[data-miller-discard]")?.addEventListener(
      "click",
      event => queuePrompt(
        event, "米勒分牌处理失败", "millerShare",
        () => resolveMillerShare(null),
      ),
    );
    document.querySelector("[data-confirm-discard]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        if (BattleEffects.animating) return;
        BattleActionGuard.run("弃牌结算失败", async ({ state: actionState, isCurrent }) => {
          const confirmed = await BattleSystem.confirmDiscard(actionState, render);
          if (!isCurrent()) return false;
          if (confirmed !== false) persist({ battleOperation: true });
        }, { control: event.currentTarget });
      },
    );
    document.querySelector("[data-skip-extract]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        if (state.battle?.locked || BattleEffects.animating) return;
        BattleActionGuard.run("跳过阶段技能失败", async ({ state: actionState, isCurrent }) => {
          await BattleSystem.skipPrepareSkill(actionState, render);
          if (!isCurrent()) return false;
          render();
          persist({ battleOperation: true });
        }, { control: event.currentTarget });
      },
    );
  }

  return { bindGerdaComfortActions, bindPromptActions };
})();
