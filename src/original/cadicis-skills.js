window.CadicisSkills = (() => {
  const {
    plan, applyPlan, modifySlashDamage, modifyTacticDamage,
  } = window.CadicisCardPlan;
  const { afterCardPlayed } = window.CadicisHeavyFire;
  const {
    beforeKillTargeted, resolveResponsibility, responsibilityVisible,
  } = window.CadicisResponsibility;

  return {
    afterCardPlayed, applyPlan, beforeKillTargeted, modifySlashDamage,
    modifyTacticDamage, plan, responsibilityVisible, resolveResponsibility,
  };
})();
