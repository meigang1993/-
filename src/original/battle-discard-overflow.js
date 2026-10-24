window.BattleDiscardOverflow = ({ visibleHand, handLimit }) => {
  const countsForLimit = (unit, card) => window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true;
  // 弃牌会减少手牌里的战术牌数量，必须重算凯瑟琳的 tempMagic，
  // 否则「魔力增幅」会按弃牌前的旧值参与「魔力是否为全场最多」的判定。
  function syncCatherineMagic(state, unit) { window.CatherineSkills?.syncMagic?.(state, unit); }
  // 【飘浮掩体】只认弃牌阶段的主动弃牌：手牌超上限的溢出弃牌不触发，
  // 否则玩家不进弃牌阶段也会白拿护甲，与技能描述「弃牌阶段」不符。
  function discardOverflow(state, unit) { const b = state?.battle, cards = []; while (visibleHand(unit) > handLimit(unit)) { let i = unit.hand.length - 1; while (i >= 0 && (unit.hand[i]._pendingDraw || !countsForLimit(unit, unit.hand[i]) || !window.UnderwaterTrainSkills?.canDiscard?.(unit, unit.hand[i]))) i--; if (i < 0) break; cards.push(unit.hand.splice(i, 1)[0]); } const normal = cards.filter(c => !c.void), voids = cards.filter(c => c.void); window.BattleCards.putMany(b, unit, normal, "discard"); voids.forEach(card => window.BattleCards.put(b, unit, card, "consumed")); syncCatherineMagic(state, unit); }
  return { discardOverflow };
};
