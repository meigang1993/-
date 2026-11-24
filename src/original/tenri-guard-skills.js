// 机械警卫防爆队 · 守护后方（被动）
// 其他我方角色（同阵营）成为实体单体【杀】目标、且该角色没有此技能时，目标转移给防爆队。
// 挂点放在攻击流程 resolve 的最前面：日志、飞行、响应、伤害、状态全部按新目标结算。
window.TenriGuardSkills = (() => {
  const C = () => window.TenriInstituteCommon;

  function redirectTarget(state, actor, target, card) {
    const c = C();
    if (!c || !target || target.side !== "enemy") return null;
    if (!window.CardUtils?.isEntitySingleKill?.(card)) return null;
    // 原目标自身有守护后方 → 不再转移；多个防爆队时取第一个未被时停的。
    if (c.hasSkill(target, "守护后方") || c.isAi(target, "tenri_guard")) return null;
    const guards = (state?.battle?.enemies || []).filter(u =>
      u !== target && u.hp > 0 && c.isAi(u, "tenri_guard") && !c.stopped(u));
    const guard = guards[0];
    if (!guard) return null;
    c.lines(state, guard, "守护后方", target);
    c.log(state, `${guard.name} 发动守护后方，${card.name}的目标由${target.name}转移给自己。`);
    return guard;
  }

  return { redirectTarget };
})();
