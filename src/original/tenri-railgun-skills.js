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
    if (!U?.isEntityCard?.(card) || !U?.isGroupTargetCard?.(card)) return;
    card._tenriRailgun = true;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    c.lines(state, actor, "极速射线");
    c.log(state, `${actor.name} 的极速射线触发：${card.name}不可响应且伤害翻倍。`);
  }

  function modifyIncomingDamage(state, actor, target, amount, card) {
    return card?._tenriRailgun ? amount * 2 : amount;
  }

  return { beforeCardPlayed, modifyIncomingDamage };
})();
