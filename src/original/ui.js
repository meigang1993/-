window.GameUI = (() => {
  const U = window.UICommon;
  const I = window.GameUIInfo(U);
  const LivingRoom = window.GameUILivingRoom(U);
  let battleScene;

  function scene() {
    battleScene ||= window.GameUIBattleScene?.(U, I);
    if (!battleScene) throw new Error("Battle UI bundle unavailable");
    return battleScene;
  }
  function hall(state) {
    return VillaUI.hall(state);
  }
  function livingRoom(state) {
    return LivingRoom.render(state);
  }
  function battle(state) {
    return scene().render(state);
  }
  function syncPlayedTrail(currentBattle) {
    return scene().syncPlayedTrail(currentBattle);
  }

  return {
    hall, livingRoom, battle, syncPlayedTrail,
    statHtml: U.statHtml, infoPanel: I.infoPanelForState,
  };
})();
