// 出牌可用性判定依赖的三张登记表：缺表即显式抛错，绝不静默放行。
// 从 battle-card-playability.js 拆出，逐行搬迁、对外行为完全一致。
window.BattlePlayabilityRegistries = () => {
  // 缺登记表时直接抛错，而不是静默放行：静默会让「出牌阶段限一次」的技能
  // 用过后仍可点、仍可再次结算，且无任何报错，排查成本极高。
  const oncePerTurnRegistry = () => {
    const registry = window.SkillOncePerTurn;
    if (!registry?.blocked) {
      throw new Error("[skill-once-per-turn] 登记表未装配："
        + "skill-once-per-turn.js 必须先于 battle-card-playability.js 加载");
    }
    return registry;
  };

  // 时停标记表同样不允许静默放行：缺了它，被时停的角色仍能用技能、仍能响应。
  const timeStopTable = () => {
    const table = window.MieryulaTimeStop;
    if (!table?.isSkillDisabled) {
      throw new Error("[mieryula-time-stop] 时停模块未装配："
        + "mieryula-time-stop.js 必须先于 battle-card-playability.js 加载");
    }
    return table;
  };

  // 无谋霸姬（战术牌封锁）同样不允许静默放行：缺了它，战术牌不会被置灰。
  const mieryulaSkillsRegistry = () => {
    const skills = window.MieryulaSkills;
    if (!skills?.blocksTactic) {
      throw new Error("[mieryula-skills] 米尔尤拉技能模块未装配："
        + "mieryula-skills.js 必须先于 battle-card-playability.js 加载");
    }
    return skills;
  };

  return { oncePerTurnRegistry, timeStopTable, mieryulaSkillsRegistry };
};
