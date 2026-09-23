window.EnemyCombatHooks = ({
  black, hasSkill, drawJudge, machine, discardOne, status,
}) => {
  return {
    ...window.EnemyKillHooks({ black, hasSkill, drawJudge }),
    ...window.EnemyDamageHooks({ hasSkill, machine, discardOne, status }),
  };
};
