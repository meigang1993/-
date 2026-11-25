// 机械警卫防爆队 · 守护后方（被动）
// 2026-11-25 按用户新稿对齐：文案写「单体【杀】牌」，不再限定「实体」，
// 虚拟单体【杀】（反击 / 技能视为使用杀 / 组合进攻的虚拟杀）同样转移。
// 挂点放在攻击流程 resolve 的最前面：日志、飞行、响应、伤害、状态全部按新目标结算。
window.TenriGuardSkills = (() => {
  const C = () => window.TenriInstituteCommon;

  // 纯判定、无副作用：供出牌动画在 commit 之前预测「飞行线该画给谁」，
  // 避免把线画到原目标、commit 里才转移，造成双份飞行与目标错位。
  function plannedTarget(state, actor, target, card) {
    const c = C();
    const U = window.CardUtils;
    if (!c || !U || !target || target.side !== "enemy") return null;
    // isSingleKillCard = isKillCard && 单体 && 非待摸牌，天然含 virtual / 转换杀。
    // 显式排除 type:"skill" 的伤害载荷：它不是「牌」，即便名字以【杀】结尾。
    if (!U.isSingleKillCard?.(card) || card?.type === "skill") return null;
    // 原目标自身有守护后方 → 不再转移；多个防爆队时取第一个未被时停的。
    if (c.hasSkill(target, "守护后方") || c.isAi(target, "tenri_guard")) return null;
    const guards = (state?.battle?.enemies || []).filter(u =>
      u !== target && u.hp > 0 && c.isAi(u, "tenri_guard") && !c.stopped(u));
    return guards[0] || null;
  }

  function redirectTarget(state, actor, target, card) {
    const c = C();
    const guard = plannedTarget(state, actor, target, card);
    if (!c || !guard) return null;
    c.lines(state, guard, "守护后方", target);
    c.log(state, `${guard.name} 发动守护后方，${card.name}的目标由${target.name}转移给自己。`);
    return guard;
  }

  return { plannedTarget, redirectTarget };
})();
