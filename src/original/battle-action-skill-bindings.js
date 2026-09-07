window.BattleActionSkillBindings = ({
  needsHandChoice, confirmMannyArmory, confirmBattleCard, render,
}) => {
  function bindSkills() {
    document.querySelectorAll("[data-skill-index]").forEach(skill => {
      skill.onclick = event => {
        event.stopPropagation();
        if (state.battle?.locked || BattleEffects.animating) return;
        if (!BattleSystem.selectSkill(state, Number(skill.dataset.skillIndex))) {
          BattleSystem.cancelSelection(state);
          return render();
        }
        if (state.battle?.selectedSkillCard?.mannyArmory) {
          return confirmMannyArmory();
        }
        if (state.battle?.selectedSkillCard?.targetless
          && !needsHandChoice(state.battle.selectedSkillCard)) {
          return confirmBattleCard();
        }
        render();
      };
    });
  }

  return { bindSkills };
};
