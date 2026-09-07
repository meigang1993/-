window.BattleDodgeResume = ({ hitWithoutDodge, finalizeDamage }) => {
  function queue(battle, pending) {
    const groupCard = pending.groupCard || pending.card;
    if (pending.remainingHits > 0) {
      battle.manualDodgeResume = { ...pending };
    } else if (groupCard?.targetUids?.length
      && groupCard.nextTargetIndex != null) {
      battle.demonInvasionResume = {
        ...pending,
        card: groupCard,
        targetUids: groupCard.targetUids,
        nextTargetIndex: groupCard.nextTargetIndex,
      };
    }
  }
  function hit(state, actor, target, pending) {
    const battle = state.battle;
    const rootDamage = !battle._damageDepth;
    battle._damageDepth = (battle._damageDepth || 0) + 1;
    try {
      hitWithoutDodge(
        state, actor, target, pending.amount, pending.source, pending.card);
      queue(battle, pending);
    } finally {
      battle._damageDepth -= 1;
      if (rootDamage) finalizeDamage(state);
    }
  }
  return { queue, hit };
};
