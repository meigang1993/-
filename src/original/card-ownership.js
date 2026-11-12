// 卡牌阵营归属：把「靠 stolenFromUid 反查角色」升级成不可变的阵营级字段。
// 牌堆按阵营共享（battle-setup.teamPile），因此归属只需记录 ally / enemy。
// 现状里 stolenFromUid 是运行时标记：入堆不清、重洗复用同一对象、clean 也不剥除，
// 牌会永久带着旧 uid；一旦该 uid 在 allies/enemies 里找不到，put 就回落 holder，
// 敌方牌会落进我方堆（我方永久占有 / 敌方永久失去），战报阵营也随之分叉。
// 本模块在牌首次结算时固化 originSide，之后即便原主离场也能归还到正确阵营堆。
window.CardOwnership = (() => {
  const unitsOf = battle => [...(battle?.allies || []), ...(battle?.enemies || [])];
  const valid = side => side === "ally" || side === "enemy" ? side : null;

  function sideOf(battle, card) {
    const fixed = valid(card?.originSide);
    if (fixed) return fixed;
    const owner = card?.stolenFromUid
      && unitsOf(battle).find(unit => unit.uid === card.stolenFromUid);
    return valid(owner?.side);
  }

  // 结算时固化：只写一次，之后不可变。原主不在场时不臆测阵营。
  function fix(battle, card) {
    if (!card || card.originSide || !card.stolenFromUid) return sideOf(battle, card);
    const owner = unitsOf(battle).find(unit => unit.uid === card.stolenFromUid);
    if (owner && valid(owner.side)) card.originSide = owner.side;
    return sideOf(battle, card);
  }

  // 入堆去向：owner 在场用原逻辑；否则按已固化的阵营找同阵营共享牌堆；最后回落 holder。
  function destination(battle, holder, card) {
    const owner = card?.stolenFromUid
      && unitsOf(battle).find(unit => unit.uid === card.stolenFromUid);
    if (owner) return owner;
    const side = sideOf(battle, card);
    if (side) {
      const list = side === "enemy" ? battle?.enemies : battle?.allies;
      const mate = (list || []).find(unit => unit.side === side) || (list || [])[0];
      if (mate) return mate;
    }
    return holder;
  }

  // 战报阵营必须与 destination 同源：原主在场时按原主，否则才用固化阵营。
  // 否则「读档后 stolenFromUid 丢失、又被重新转交」会出现入堆在我方、
  // 战报却写敌方的分叉（sideOf 无条件优先 originSide 会盖掉在场 owner）。
  function trailSide(battle, card, actor) {
    const owner = card?.stolenFromUid
      && unitsOf(battle).find(unit => unit.uid === card.stolenFromUid);
    return valid(owner?.side) || sideOf(battle, card)
      || valid(actor?.side) || "ally";
  }

  return { sideOf, fix, destination, trailSide };
})();
