window.GameUIHand = (() => {
  function render(state, U) {
    const responseHand = window.BattleResponseUI.responseHand(state.battle);
    if (responseHand) return responseHand;
    const context = window.GameUIHandState.create(state, U);
    if (!context.actor) {
      return `<div class="hand-panel"><span class="muted">${context.battle.thinkingUid ? "敌方思考中。" : "等待我方回合。"}</span></div>`;
    }
    return window.GameUIHandView.render(context, U);
  }
  return { render };
})();
