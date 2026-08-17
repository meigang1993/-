window.BattleAISkillPlanner = (() => {
  const {
    magicBulletTarget, costCard, otherAlly,
    comboPartner, borrowPartner,
  } = window.BattleAISkillHelpers;

  return {
    magicBulletTarget,
    costCard,
    otherAlly,
    comboPartner,
    borrowPartner,
    skillMove: window.BattleAISkillMoves.skillMove,
  };
})();
