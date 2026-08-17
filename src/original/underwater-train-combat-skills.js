window.UnderwaterTrainCombatSkills = deps => {
  const bite = window.UnderwaterTrainBiteSkills(deps);
  const prepare = window.UnderwaterTrainPrepareSkills(deps);
  const attack = window.UnderwaterTrainAttackSkills(deps);

  function afterDamage(state, actor, target, card, hpLoss, damage) {
    attack.afterDamageBeforeBite(state, actor, target, card, hpLoss, damage);
    bite.afterDamage(state, actor, card, hpLoss);
    attack.afterDamageAfterBite(state, actor, target, hpLoss);
  }

  return {
    prepare: prepare.prepare,
    prepareKill: attack.prepareKill,
    prepareBite: bite.prepareBite,
    displayBiteCard: bite.displayBiteCard,
    beforeKillTargeted: attack.beforeKillTargeted,
    afterDamage,
    afterCardPlayed: prepare.afterCardPlayed,
  };
};
