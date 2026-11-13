// 怪面诺亚【淫气改造】溢出弃牌执行块（从 noa-charm-skills.js 拆出，逐行搬迁）。
// 手牌多于上限时：与弃牌阶段同款由玩家点选，或走自动弃兜底。
// 依赖：limitOf 由主文件在装配时注入（避免两处各自计算手牌上限）。
window.NoaCharmDiscard = ({ limitOf }) => {
  // 与 BattleRuntimeHelpers.canDiscardCard 同口径：排除 _pendingDraw、状态牌、
  // 水下列车限制牌。need 必须夹到可弃牌数，否则挂起无法完成。
  const discardableCards = unit => (unit?.hand || []).filter(card =>
    !card._pendingDraw
    && (window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true)
    && (window.UnderwaterTrainSkills?.canDiscard?.(unit, card) ?? true));

  // 手牌多于上限：不弹专用选牌窗，改为与弃牌阶段一样的弃牌。
  // 只挂一个 noaCharmDiscard 标记；UI 打开标准弃牌选择（b.discardPick + 手牌区点选 +
  // 确认弃置），确认时走 battle-discard-flow.js 的 discardCards 一次性结算。
  // 玩家可任意挑 need 张；不设 locked。已有挂起 / 可见牌不足时走自动弃兜底，避免卡死。
  // 已有其它玩家提示（锤子/米勒/交牌/半魅魔血等）时绝不叠加第二个弃牌选择，否则抢手牌卡死。
  function startCharmDiscard(state, b, owner, need) {
    if (b.locked || b.handReveal || b.noaCharmDiscard
      || window.AppRuntimeRecovery?.hasBlockingBattlePrompt?.(b) || discardableCards(owner).length < need) return false;
    b.noaCharmDiscard = { unitUid: owner.uid, need };
    b.discardPick = null;
    window.BattleLog?.add?.(state,
      `${owner.name}的淫气改造发动，需弃置${need}张手牌至手牌上限${limitOf(owner)}（与弃牌阶段相同）。`);
    return true;
  }

  // 自动弃兜底：优先弃已落位的可弃牌（状态牌一律不动）；不足时补 _pendingDraw
  // 的普通牌（摸牌动画未落位，不涉及玩家点选，不会卡死）。归属是诺亚自己。
  // 结算与 battle-discard-flow.js 的 discardCards 同款：void 分流、弃牌触发、
  // 魔力同步、战报；逐张 put 与 putMany 等价，且兼容既有调用方。
  function autoDiscard(state, b, owner, need) {
    const pool = discardableCards(owner);
    const extra = pool.slice(-need);
    if (extra.length < need) {
      const pending = (owner.hand || []).filter(card => card._pendingDraw
        && (window.GuestCharacterSkills?.countsForLimit?.(owner, card) ?? true));
      extra.push(...pending.slice(0, need - extra.length));
    }
    // 一张都弃不了时静默降级：不写「一次性弃置 。」空战报，也不触发
    // 弃牌/魔力同步钩子。balanceHand 每次出牌后都会重判，空战报会反复刷屏。
    if (!extra.length) return 0;
    extra.forEach(card => {
      const i = owner.hand.indexOf(card);
      if (i >= 0) owner.hand.splice(i, 1);
      window.BattleCards?.put?.(b, owner, card,
        card.void || card.type === "consume" ? "consumed" : "discard");
    });
    // 【飘浮掩体】只在弃牌阶段触发，出牌阶段内的溢出弃牌不结算护甲。
    window.CatherineSkills?.syncMagic?.(state, owner);
    window.BattleLog?.add?.(state,
      `${owner.name} 一次性弃置 ${extra.map(card => card.name).join("、")}。`);
    return -extra.length;
  }

  return { discardableCards, startCharmDiscard, autoDiscard };
};
