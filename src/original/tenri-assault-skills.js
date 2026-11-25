// 机械警卫突击队 · 不可挡突袭（被动）
// 实体单体【杀】指定目标时比双方手牌【杀】牌数：多出 n 张 → 不可响应 + 伤害 ×(1+n)。
// 下划线字段让 CardUtils.clean 剥除，复制/重放牌不会继承加成。
window.TenriAssaultSkills = (() => {
  const C = () => window.TenriInstituteCommon;

  function beforeKillTargeted(state, actor, target, card) {
    const c = C();
    if (!c || !c.isAi(actor, "tenri_assault") || c.stopped(actor)) return;
    if (!window.CardUtils?.isEntitySingleKill?.(card)) return;
    const mine = c.slashCount(actor), theirs = c.slashCount(target);
    const extra = mine - theirs;
    if (extra <= 0) return;
    card._tenriAssaultBonus = extra;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    c.lines(state, actor, "不可挡突袭", target);
    c.log(state, `${actor.name} 的不可挡突袭触发：手牌【杀】${mine} 对 ${target.name} 的 ${theirs}，`
      + `此【杀】不可响应且伤害+${extra * 100}%（×${1 + extra}）。`);
  }

  function modifyAttackAmount(state, actor, target, card, amount) {
    const c = C();
    // 双保险：即使牌上因旧档/异常路径残留标记，也只对突击队本家且在非时停时生效。
    const bonus = c?.isAi(actor, "tenri_assault") && !c.stopped(actor)
      ? card?._tenriAssaultBonus : 0;
    return bonus > 0 ? amount * (1 + bonus) : amount;
  }

  return { beforeKillTargeted, modifyAttackAmount };
})();
