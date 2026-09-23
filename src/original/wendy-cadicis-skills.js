window.WendyCadicisSkills = (() => {
  const wendy = window.WendySkills;
  const cadicis = window.CadicisSkills;

  function handleSpecialCard(state, actor, target, card, deps) {
    if (card.wendyTutor) return wendy.tutor(state, actor, deps);
    if (card.cadicisPlan) return cadicis.plan(state, actor, deps);
    return false;
  }

  function afterCardPlayed(state, actor, target, card, deps) {
    wendy.afterCardPlayed(state, actor, card, deps);
    cadicis.afterCardPlayed(state, actor, card, deps);
  }

  return {
    handleSpecialCard,
    afterCardPlayed,
    afterDiscard: wendy.afterDiscard,
    chooseTutorCard: wendy.chooseTutorCard,
    tutorPool: wendy.tutorPool,
    applyPlan: cadicis.applyPlan,
    beforeKillTargeted: cadicis.beforeKillTargeted,
    modifySlashDamage: cadicis.modifySlashDamage,
    modifyTacticDamage: cadicis.modifyTacticDamage,
    responsibilityVisible: cadicis.responsibilityVisible,
    resolveResponsibility: cadicis.resolveResponsibility,
  };
})();
