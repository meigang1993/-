// 清理机器人 · 极速射线（被动）
// 全体类实体牌不可响应 + 伤害翻倍。分组两处：
//   beforeCardPlayed 在 useCard 入口标记（覆盖绕过攻击流程的实体战术牌）；
//   modifyIncomingDamage 在统一命中出口翻倍（避免攻击流程里再乘一次）。
window.TenriRailgunSkills = (() => {
  const C = () => window.TenriInstituteCommon;

  function beforeCardPlayed(state, actor, card) {
    const c = C();
    if (!c || !c.isAi(actor, "tenri_railgun") || c.stopped(actor)) return;
    const U = window.CardUtils;
    if (!U?.isEntityCard?.(card)) return;
    // 【魔王军入侵】是全项目唯一「逐目标结算全体伤害、却没有 sweep/allTargets
    // 标记」的实体战术牌：CardUtils.isGroupTargetCard 认不出它，极速射线会整段
    // 漏判（基础牌堆里就有这张牌，清理机器人抽到时完全不生效）。这里按牌自身的
    // AOE 语义补齐，不动全局 isGroupTargetCard，避免影响 sweepDamage / groupHit /
    // 莫娜单体杀等既有链路。
    if (!U?.isGroupTargetCard?.(card) && !card.demonInvasion) return;
    card._tenriRailgun = true;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    c.lines(state, actor, "极速射线");
    c.log(state, `${actor.name} 的极速射线触发：${card.name}不可响应且伤害翻倍。`);
  }

  function modifyIncomingDamage(state, actor, target, amount, card) {
    const c = C();
    // 双保险：即使牌上因旧档/异常路径残留标记，也只对清理机器人本家且在非时停时生效。
    return c?.isAi(actor, "tenri_railgun") && !c.stopped(actor)
      && card?._tenriRailgun ? amount * 2 : amount;
  }

  return { beforeCardPlayed, modifyIncomingDamage };
})();
