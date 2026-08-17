window.BattleActionPromptBindings = (() => {
  function bindGerdaComfortActions() {
    const skip = document.querySelector("[data-gerda-comfort-skip]");
    if (skip) {
      skip.onpointerdown = event => {
        event.preventDefault();
        event.stopPropagation();
        const actionState = state;
        const prompt = actionState.battle?.gerdaComfort;
        BattleActionGuard.runWhenIdle(
          "萌虎慰劳处理失败",
          () => resolveGerdaComfort(null),
          {
            control: event.currentTarget,
            isCurrent: () => window.state === actionState
              && actionState.battle?.gerdaComfort === prompt,
          },
        );
      };
    }
    if (!state.battle?.gerdaComfort) return;
    document.querySelectorAll(".ally-row .selectable-target[data-target]")
      .forEach(target => {
        target.onpointerdown = event => {
          event.preventDefault();
          event.stopPropagation();
          const actionState = state;
          const prompt = actionState.battle?.gerdaComfort;
          BattleActionGuard.runWhenIdle(
            "目标选择处理失败",
            () => selectBattleTarget(target.dataset.target),
            {
              control: target,
              isCurrent: () => window.state === actionState
                && actionState.battle?.gerdaComfort === prompt,
            },
          );
        };
      });
  }

  function bindPromptActions() {
    document.querySelector("[data-dimension-transfer-skip]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        const actionState = state;
        const prompt = actionState.battle?.dimensionTransfer;
        BattleActionGuard.runWhenIdle(
          "次元转移处理失败",
          () => tryDimensionTransfer(null),
          {
            control: event.currentTarget,
            isCurrent: () => window.state === actionState
              && actionState.battle?.dimensionTransfer === prompt,
          },
        );
      },
    );
    document.querySelector("[data-new-moon-skip]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        if (!BattleEffects.animating) {
          BattleActionGuard.run(
            "新月之力处理失败",
            () => resolveNewMoonShare(null),
            { control: event.currentTarget },
          );
        }
      },
    );
    bindGerdaComfortActions();
    document.querySelector("[data-kaiichi-share-skip]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        BattleActionGuard.run(
          "半魅魔血分牌失败",
          () => resolveKaiichiShare(null),
          { control: event.currentTarget },
        );
      },
    );
    document.querySelector("[data-miller-discard]")?.addEventListener(
      "click",
      event => {
        event.stopPropagation();
        if (!BattleEffects.animating) {
          BattleActionGuard.run(
            "米勒分牌处理失败",
            () => resolveMillerShare(null),
            { control: event.currentTarget },
          );
        }
      },
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
