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
    document.querySelectorAll("[data-wendy-tutor-target]").forEach(button => {
      button.onpointerdown = event => {
        event.preventDefault();
        event.stopPropagation();
        chooseWendyTutorTarget(button.dataset.wendyTutorTarget);
      };
    });
    document.querySelectorAll("[data-aileng-drill-target]").forEach(button => {
      button.onpointerdown = event => {
        event.preventDefault();
        event.stopPropagation();
        chooseAilengDrillTarget(button.dataset.ailengDrillTarget);
      };
    });
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
        if (["magicBulletReveal", "borrowSlashChoice", "borrowGainChoice"]
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
