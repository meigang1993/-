window.BattleActionSpecialBindings = (() => {
  function bindSpecialPickerActions() {
    document.querySelectorAll("[data-manny-weapon]").forEach(button => {
      button.onpointerdown = event => {
        event.preventDefault();
        event.stopPropagation();
        chooseMannyWeapon(button.dataset.mannyWeapon);
      };
    });
    document.querySelectorAll("[data-wendy-tutor-card]").forEach(button => {
      button.onpointerdown = event => {
        event.preventDefault();
        event.stopPropagation();
        chooseWendyTutorCard(button.dataset.wendyTutorCard);
      };
    });
    // 解答迷惑选定牌名后的交人弹窗已删除：改为点击角色交出（见
    // battle-action-share-selection.js 的 resolveWendyTutor），
    // 故不再绑定 [data-wendy-tutor-target] 按钮。
    // 战斗演练的居中选人弹窗已删除：交牌改为提示条 + 点击队友（见
    // battle-action-share-selection.js 的 resolveAilengDrill），
    // 故不再绑定 [data-aileng-drill-target] 按钮。
    // 窃取的接收队友弹窗已删除：改为点击我方角色（见
    // battle-action-share-selection.js 的 resolveCatherineSteal），
    // 故不再绑定 [data-catherine-receiver] 按钮，仅保留「放弃」。
    document.querySelector("[data-catherine-receiver-skip]")?.addEventListener(
      "pointerdown",
      event => {
        event.preventDefault();
        event.stopPropagation();
        chooseCatherineReceiver(null);
      },
    );
    document.querySelector("[data-aileng-drill-skip]")?.addEventListener(
      "pointerdown",
      event => {
        event.preventDefault();
        event.stopPropagation();
        chooseAilengDrillTarget(null);
      },
    );
  }

  function bindBattleDismissActions() {
    document.querySelector(".battle-screen")?.addEventListener("click", event => {
      const testRetreat = state.battle?.test && event.target.closest(".battle-retreat");
      if ((state.battle?.selectedCardIndex != null || state.battle?.selectedSkillCard)
        && !testRetreat
        && !event.target.closest(
          ".play-card,.unit-art,.hand-head,.skill,.armory-popup,.dimension-prompt")) {
        cancelBattleSelect();
      }
    });
    document.oncontextmenu = event => {
      if (state.battle?.handReveal && !event.target.closest(".hand-reveal-panel")) {
        event.preventDefault();
        if (["magicBulletReveal", "borrowSlashChoice", "borrowGainChoice", "catherineSteal"]
          .includes(state.battle.handReveal.mode)) return;
        BattleActionGuard.run("关闭展示牌失败", async ({ state: actionState, isCurrent }) => {
          await BattleSystem.resolveHandReveal(actionState, null);
          if (!isCurrent()) return false;
          render();
          persist({ battleOperation: true });
        });
        return;
      }
      if (state.battle?.selectedCardIndex != null || state.battle?.selectedSkillCard) {
        event.preventDefault();
        cancelBattleSelect();
        return;
      }
      closeContextPanel(event);
    };
  }

  return { bindSpecialPickerActions, bindBattleDismissActions };
})();
