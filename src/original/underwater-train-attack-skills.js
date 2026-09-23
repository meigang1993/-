window.UnderwaterTrainAttackSkills = deps => {
  const target = window.UnderwaterTrainTargetSkills(deps);
  const damage = window.UnderwaterTrainDamageSkills(deps);
  return { ...target, ...damage };
};
