window.GameUIBattleTrail = U => {
  function same(first, second) {
    const firstId = first?._cardResolutionId || first?._cardAnimationId;
    const secondId = second?._cardResolutionId || second?._cardAnimationId;
    const comboMirror = first?.comboAttackVirtual && second?.comboAttackVirtual;
    const firstSource = window.CardUtils?.generatedSource?.(first);
    const generatedMirror = firstSource
      && firstSource === window.CardUtils?.generatedSource?.(second);
    if (firstId && secondId && firstId === secondId) return true;
    if (firstId && secondId && !comboMirror && !generatedMirror) return false;
    const keys = [
      "name", "suit", "type", "_playedByName",
      ...(comboMirror || generatedMirror ? [] : ["_playedAction"]),
      "virtual", "convertedFrom", "sourceName", "skillName",
    ];
    return first === second || keys.every(key => first?.[key] === second?.[key]);
  }

  function cards(battle) {
    const played = battle.played || [];
    const matched = new Set();
    const transient = (battle.shownPlayed || []).filter(card => {
      const index = played.findIndex((entry, position) =>
        !matched.has(position) && same(card, entry));
      if (index < 0) return true;
      matched.add(index);
      return false;
    });
    return [...transient, ...played].slice().reverse();
  }

  function sync(battle) {
    const trail = document.querySelector(".public-cards");
    if (!trail || !battle) return false;
    const html = cards(battle).map(U.trailCard).join("");
    if (trail.innerHTML === html) return false;
    trail.innerHTML = html;
    trail.scrollLeft = trail.scrollWidth;
    return true;
  }

  return { cards, sync };
};
