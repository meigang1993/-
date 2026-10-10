window.CadicisSkills = (() => {
  const { afterCardPlayed } = window.CadicisHeavyFire;
  const {
    beforeKillTargeted, resolveResponsibility, responsibilityVisible,
    skipResponsibility,
  } = window.CadicisResponsibility;

  return {
    afterCardPlayed, beforeKillTargeted,
    responsibilityVisible, resolveResponsibility,
    skipResponsibility,
  };
})();
