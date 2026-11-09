// 怪面诺亚【魅力改造】（锁定技）
//   1. 手牌数始终等于手牌上限：少于摸至上限，多于弃至上限
//   2. 使用【杀】牌不消耗杀意
//   3. 使用杀台词
// 手牌上限本身由【改造副作用】按存活男性队友数动态给出，本文件只消费它的结果。
window.NoaCharmSkills = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const isNoa = unit => alive(unit) && unit.ref === "noa";
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill?.name === name);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isKill = card => !!window.CardUtils?.isKillCard?.(card)
    || card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const limitOf = unit => Math.max(0,
    window.NoaSideEffectSkills?.handLimit?.(unit) ?? unit?.stats?.handLimit ?? 0);

  // 供 battle-card-playability.js 的 hasNoIntentCost 消费；只认角色本人打出的杀牌。
  function noIntentCost(actor, card) {
    return isNoa(actor) && hasSkill(actor, "魅力改造") && isKill(card);
  }

  // 使用杀台词：由 battle-combat.js 在「使用X」日志之后立即调用。
  function playKillLine(state, actor, card) {
    if (!isNoa(actor) || !hasSkill(actor, "魅力改造") || !isKill(card)) return;
    window.BattleLines?.skill?.(state, actor, "使用杀");
  }

  // 手牌恒等：摸牌阶段结束、出牌结算后、回合结束时各调用一次。
  // 手牌数按 owner.hand 总数计：draw() 新摸的牌带 _pendingDraw（仅动画未落位），
  // 牌本身已在手里；若按「可见牌」计数，会在动画期间反复判定不足并重复摸牌，
  // 动画结算后手牌远超上限、触发标准弃牌阶段卡住回合。
  function balanceHand(state, unit, draw) {
    const b = state?.battle;
    if (!b) return 0;
    // 任意出牌都可能改变诺亚的手牌（偷牌、交牌、群体效果），故不局限于出牌者本人。
    const owner = isNoa(unit) && hasSkill(unit, "魅力改造")
      ? unit : (b.allies || []).find(u => isNoa(u) && hasSkill(u, "魅力改造"));
    if (!owner) return 0;
    const limit = limitOf(owner);
    const hand = owner.hand || [];
    const diff = limit - hand.length;
    if (diff > 0 && typeof draw === "function") {
      draw(owner, diff, b);
      window.BattleLog?.add?.(state,
        `${owner.name}的魅力改造发动，摸${diff}张牌至手牌上限${limit}。`);
      return diff;
    }
    if (diff < 0) {
      // 优先弃已落位的牌，避免动到还在摸牌动画队列里的对象；
      // 归属一律是诺亚自己，不能用出牌者 unit（他人出牌也会走到这里）。
      const need = -diff;
      const extra = visible(owner).slice(-need);
      if (extra.length < need) {
        extra.push(...(owner.hand || []).filter(c => c._pendingDraw)
          .slice(0, need - extra.length));
      }
      extra.forEach(card => {
        const i = owner.hand.indexOf(card);
        if (i >= 0) owner.hand.splice(i, 1);
        window.BattleCards?.put?.(b, owner, card,
          card.void || card.type === "consume" ? "consumed" : "discard");
      });
      window.BattleLog?.add?.(state,
        `${owner.name}的魅力改造发动，弃${extra.length}张牌至手牌上限${limit}。`);
      return -extra.length;
    }
    return 0;
  }

  return { noIntentCost, playKillLine, balanceHand };
})();
