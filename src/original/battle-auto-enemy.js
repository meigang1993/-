window.BattleAutoEnemy = ({
  combat,
  record,
  wait,
  waitEffects,
  isCurrentState,
  reactionPending,
  visibleHand,
  isKillCard,
  nextAnim,
}) => {
  const ENEMY_AUTO_PLAY_LIMIT = 48;
  const enemyPlayGap = 450;
  const enemyIdleGap = 400;

  return async function autoEnemy(state, actor, onStep, actionCurrent = null) {
    const current = () => isCurrentState(state)
      && (!actionCurrent || actionCurrent());
    let played = false;
    let guard = 0;
    while (current() && state.battle && !state.battle.locked
      && !reactionPending(state.battle) && actor.hp > 0) {
      if (guard++ >= ENEMY_AUTO_PLAY_LIMIT) {
        record(state, `${actor.name} 的自动行动达到上限，已结束出牌阶段。`);
        break;
      }
      const move = window.BattleAI?.choose(state.battle, actor, combat.canPlay);
      if (!move?.target || !move.card
        || (!move.card._skill && visibleHand(actor) === 0)) break;
      if (played) await wait(enemyPlayGap);
      if (!current() || !state.battle || state.battle.locked
        || reactionPending(state.battle) || actor.hp <= 0) return;
      move.card._playedFlightDone = true;
      move.card._playedTargetUid = move.target.uid;
      if (move.partnerUid) state.battle.comboPartnerUid = move.partnerUid;
      if (move.costCard) move.card._costCard = move.costCard;
      state.battle.animQueue.push({
        id: `p${nextAnim()}`,
        type: "enemyPlay",
        uid: actor.uid,
        side: actor.side,
        targetUid: move.target.uid,
        targetUids: move.card._targetUids,
        card: move.card,
        slashText: isKillCard(move.card),
        commit: () => {
          if (!current()) return;
          try {
            actor._activeCostCard = move.costCard || null;
            if (actor.hp > 0) combat.useCard(state, actor, move.target, move.card);
            combat.checkEnd(state);
          } finally {
            delete actor._activeCostCard;
            if (state.battle) state.battle.comboPartnerUid = null;
          }
        },
      });
      played = true;
      if (onStep) {
        onStep();
        await waitEffects();
      } else await wait(enemyIdleGap);
      if (!current()) return;
    }
    if (!played) await wait(enemyIdleGap);
  };
};
