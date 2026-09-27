// 装甲运输车【坚硬装甲】相关判定，自 ruins-elite-skills.js 拆出（该文件超 200 行硬约束）。
window.RuinsCarrierArmor = (() => {
  // 坚硬装甲（锁定技）：不会受到任何伤害。
  // 原实现只挂在 EnemySkills.modifyDamage 上，而该链被两个口子绕过：
  //   1) battle-damage-resolution.js 用 `if (!skipDamageModify)` 包住整条链，
  //      燃烧/毒/勒脖/潜影背刺/苦肉鞭笞等约 25 处技能伤害载荷都带该标记，直接穿甲；
  //   2) 直伤 BattleDamageUtils.directDamage 直接改写 target.hp，压根不走修正链。
  // 故免疫必须在这两处各自独立判定，不能只靠 modifyDamage。
  const immuneIncoming = (state, target, card) =>
    target?.ai === "ruins_carrier" && !card?.realDamage;

  function modifyDamage(state, target, amount, card) {
    if (immuneIncoming(state, target, card)) return 0;
    return amount;
  }

  // 坚硬装甲（锁定技）：无法恢复自身生命值。
  // 增援部队的 10% 生命损失是直接改写 unit.hp（不走治疗链），故不受本条影响。
  function beforeHeal(state, target, amount) {
    return target?.ai === "ruins_carrier" ? 0 : amount;
  }

  return { immuneIncoming, modifyDamage, beforeHeal };
})();
