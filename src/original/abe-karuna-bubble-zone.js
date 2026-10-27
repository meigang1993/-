// 安倍卡露娜【记忆泡泡】·泡泡手牌区：容量、牌堆摘取、消耗牌判定、
// 回合结束清空与界面渲染。
// 从 abe-karuna-bubble-skills.js 拆出，由它委托调用；两者同属 battle-skills，
// 装配顺序由 tools/publish-bundle-shared.js 的 ORDER_DEPENDENCIES 校验。
window.AbeKarunaBubbleZone = (() => {
  const MAX = 2;
  const alive = unit => !!unit && unit.hp > 0;
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const pileOf = unit => unit?.pileStats?.discard || unit?.discard || [];
  const consumedOf = unit => unit?.pileStats?.consumed || unit?.consumed || [];
  const bubbleOf = unit => unit.bubbleCards || (unit.bubbleCards = []);
  // 与出牌入堆口径一致（battle-combat / battle-cards-system）：这三类牌结算后
  // 进**消耗区**并播放烧牌，不在弃牌堆里。
  // 设计上消耗牌**允许**存入泡泡区（"用时才被消耗"），故存入时需同时从
  // 弃牌堆与消耗区两处摘牌；回合结束清空时消耗牌回到消耗区、其余进弃牌堆。
  const burnOnPlay = card => !!card
    && (card.type === "consume" || !!card.copiedByEdis || !!card.void);
  // 实体牌判定统一走 CardUtils.isEntityCard（单一来源），此处不再各写一份。
  const isEntityCard = card => !!window.CardUtils?.isEntityCard?.(card);
  // 归属：与入堆口径 battle-cards-system.put 同源——偷来的牌（带 stolenFromUid）
  // 结算后进**原主**的牌堆，而不是使用者的。摘牌必须与入堆同口径，否则
  // 「放入」会在自己牌堆里找不到该牌而静默失败（点了「放入」牌却没进区）。
  const ownerOf = (battle, card) => !!card?.stolenFromUid
    && (battle?.allies || []).concat(battle?.enemies || [])
      .find(unit => unit.uid === card.stolenFromUid);
  // 原主可能已阵亡离场，此时回落使用者自己（put 的 dest = owner || holder）。
  const destOf = (battle, actor, card) => ownerOf(battle, card) || actor;

  // 入堆时可能存的是还原副本（转换牌），故先按对象精确匹配，再按牌名花色回退。
  function removeFromPile(pile, card) {
    let index = pile.lastIndexOf(card);
    if (index < 0) {
      index = pile.findIndex(item => !!item && item.name === card.name
        && (item.suit || "") === (card.suit || ""));
    }
    if (index < 0) return false;
    pile.splice(index, 1);
    return true;
  }

  function endTurn(state, unit) {
    const battle = state?.battle;
    if (!battle || unit?.ref !== "abe_karuna") return;
    const bubble = unit.bubbleCards;
    if (!bubble?.length) return;
    // 标记随清空一并抹掉，否则免杀意会跟着牌进弃牌堆、被回收后错误生效。
    bubble.forEach(card => { delete card._bubbleFree; delete card._bubbleCast; });
    const cards = bubble.splice(0, bubble.length);
    // 消耗牌回消耗区：若随清空落进弃牌堆等于洗回牌库、凭空多发一张。
    const burned = cards.filter(card => burnOnPlay(card));
    const dumped = cards.filter(card => !burnOnPlay(card));
    dumped.forEach(card => window.BattleCards?.put(
      battle, unit, card, "discard", { skipAnim: true }));
    burned.forEach(card => window.BattleCards?.put(
      battle, unit, card, "consumed", { skipAnim: true }));
    const parts = [];
    if (dumped.length) {
      parts.push(`${dumped.map(card => card.name).join("、")}进入弃牌堆`);
    }
    if (burned.length) {
      parts.push(`${burned.map(card => card.name).join("、")}被消耗`);
    }
    window.BattleLog.add(state, `${unit.name} 回合结束，泡泡手牌区的${parts.join("，")}。`);
  }

  function render(unit, U) {
    const bubble = unit?.bubbleCards || [];
    // 非出牌阶段（phase≠4）不可使用：置灰并禁用点击，避免玩家点了没反应。
    const usable = window.state?.battle?.phase === 4;
    const picked = window.state?.battle?.selectedSkillCard;
    const slots = bubble.map((card, index) => `<span class="karuna-bubble-slot${usable ? "" : " karuna-bubble-slot-idle"}" data-bubble-index="${index}">${U.card(card, false, {
      index: null, selected: card === picked, actor: unit, disabled: false,
    })}</span>`).join("");
    return `<div class="karuna-bubble-zone" title="记忆泡泡：泡泡手牌区${bubble.length}/${MAX}张，出牌阶段可点击直接使用；回合结束后普通牌进入弃牌堆、消耗牌被消耗"><span class="karuna-bubble-label">泡泡手牌区 ${bubble.length}/${MAX}</span><div class="karuna-bubble-cards">${slots || '<span class="karuna-bubble-empty">空</span>'}</div></div>`;
  }

  return {
    MAX, alive, hasSkill, pileOf, consumedOf, bubbleOf, burnOnPlay,
    isEntityCard, ownerOf, destOf, removeFromPile, endTurn, render,
  };
})();
