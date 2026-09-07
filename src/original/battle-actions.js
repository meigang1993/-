function bindBattleSelect() {
  window.BattleActionPromptBindings.bindPromptActions();
  window.BattleActionHandBindings.bindCards();
  window.BattleActionHandBindings.bindSkills();
  window.BattleActionTargetBindings.bindTargetActions();
  window.BattleActionSpecialBindings.bindSpecialPickerActions();
  window.BattleActionSpecialBindings.bindBattleDismissActions();
  BattleEffects.sync(state);
}

window.bindGerdaComfortActions =
  window.BattleActionPromptBindings.bindGerdaComfortActions;
window.bindBattleSelect = bindBattleSelect;
