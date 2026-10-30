// 战报条目快照：把刚打出的牌记成一条「谁、以什么方式、用了哪张牌」的记录。
// 从 battle-combat.js 拆出，保持对外行为完全一致。
window.BattleCombatTrail = ({ allUnits }) => {
  const trailSkillName = (card, actor) =>
    window.UICommon?.activeSkillName?.(actor, card) || "";

  function trailDestination(card, actor, battle) {
    const owner = card?.stolenFromUid
      && allUnits(battle).find(unit => unit.uid === card.stolenFromUid);
    return {
      pile: card?.type === "consume" || card?.copiedByEdis || card?.void
        ? "consumed" : "discard",
      side: owner?.side || actor?.side || "ally",
    };
  }

  function snapshot(card, actor, battle) {
    const base = { ...(window.CardUtils?.clean?.(card) || card) };
    const skillName = trailSkillName(card, actor);
    const destination = trailDestination(card, actor, battle);
    if (skillName) base.skillName = skillName;
    else delete base.skillName;
    base._destinationPile = destination.pile;
    base._destinationSide = destination.side;
    if (card?._cardResolutionId) {
      base._cardAnimationId = card._cardResolutionId;
    }
    return {
      ...base,
      _playedByName: actor.name,
      _playedAction: window.CardUtils?.playVerb?.(card)
        || (card?._skill ? "发动了" : "使用了"),
    };
  }

  return { snapshot };
};
