window.WendyCadicisSkills = (() => {
  const wendy = window.WendySkills;
  const cadicis = window.CadicisSkills;

  function handleSpecialCard(state, actor, target, card, deps) {
    if (card.wendyTutor) return wendy.tutor(state, actor, deps);
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
    beforeKillTargeted: cadicis.beforeKillTargeted,
    responsibilityVisible: cadicis.responsibilityVisible,
    resolveResponsibility: cadicis.resolveResponsibility,
    skipResponsibility: cadicis.skipResponsibility,
  };
})();
