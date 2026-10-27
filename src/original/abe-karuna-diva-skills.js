// 安倍卡露娜【同频歌姬】（锁定技）：连续使用同色牌时摸一张牌，并在头像上显示上一张牌的花色。
// 花色显示与【偶像之星】同构（idol-suit-badge），便于玩家一眼判断当前"同频"进度。
window.AbeKarunaDivaSkills = (() => {
  const SUITS = ["♥", "♦", "♠", "♣"];
  const alive = unit => !!unit && unit.hp > 0;
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const colorOf = suit => ["♥", "♦"].includes(suit) ? "red"
    : ["♠", "♣"].includes(suit) ? "black" : "";

  // 实体牌判定统一走 CardUtils.isEntityCard（单一来源），与记忆泡泡同口径。
  const isEntityCard = card => !!window.CardUtils?.isEntityCard?.(card);

  function afterCardPlayed(state, actor, card, deps) {
    if (!alive(actor) || actor.ref !== "abe_karuna" || !card) return;
    if (card._repeat || !hasSkill(actor, "同频歌姬")) return;
    // 仅实体牌参与同频判定：技能牌/虚拟牌既不记录花色，也不触发摸牌。
    if (!isEntityCard(card)) return;
    // 标准花色才参与记录：无花色牌（如部分技能牌/虚拟牌）不打断同色连唱，
    // 也不进入头像显示，避免玩家误以为下次出无花色牌能接续。
    if (SUITS.includes(card.suit)) actor.karunaLastSuit = card.suit;
    const current = colorOf(card.suit);
    if (!current) return;
    const previous = actor.karunaLastColor;
    actor.karunaLastColor = current;
    if (!previous || previous !== current) return;
    const cards = deps.draw(actor, 1, state.battle);
    window.BattleLines?.skill(state, actor, "同频歌姬");
    const label = current === "red" ? "红色" : "黑色";
    window.BattleLog.add(state, `${actor.name}连续使用${label}牌，同频歌姬令其`
      + `${window.BattleDrawFeedback.action(actor, 1, cards)}。`);
  }

  function endTurn(state, unit) {
    if (unit?.ref !== "abe_karuna") return;
    // 颜色记忆与头像花色标记必须一并清除：此前只删 karunaLastColor，
    // 头像上的「同频 ♦」残留到下回合，玩家会误以为再出红色牌还能摸牌，
    // 而 karunaLastColor 已为空、实际不会触发。
    delete unit.karunaLastColor;
    delete unit.karunaLastSuit;
  }

  function suitMark(u) {
    if (u?.ref !== "abe_karuna") return "";
    const suit = SUITS.includes(u?.karunaLastSuit) ? u.karunaLastSuit : "";
    return suit
      ? `<span class="green-hat-badge idol-suit-badge" title="同频歌姬：上一张标准花色牌为${suit}，再使用${["♥", "♦"].includes(suit) ? "红色" : "黑色"}牌时摸一张牌">同频 ${suit}</span>`
      : "";
  }

  return { afterCardPlayed, endTurn, suitMark };
})();
