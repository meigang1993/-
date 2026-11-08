// 白色哥特洛丽塔：被【杀】指定时摸 1 张牌，同一张牌对同一目标只触发一次。
// 从 battle-damage-resolution.js 拆出，逐行搬迁、对外行为完全一致。
window.BattleWhiteLolita = ({ deps }) => {
  function triggerWhiteLolita(state, actor, target, card) {
    if (!deps.isKillCard(card) || actor.side === target.side
      || !window.RelicSystem?.hasEquipped?.(
        state, target, "白色哥特洛丽塔")) return;
    const root = card._entitySourceCard || card;
    const targets =
      card._whiteLolitaTargetUids || root._whiteLolitaTargetUids || [];
    card._whiteLolitaTargetUids = targets;
    root._whiteLolitaTargetUids = targets;
    if (targets.includes(target.uid)) return;
    targets.push(target.uid);
    const drawn = deps.draw(target, 1, state.battle);
    window.BattleLog.add(state,
      `${target.name} 的白色哥特洛丽塔触发，${window.BattleDrawFeedback.action(target, 1, drawn)}。`);
  }

  return { triggerWhiteLolita };
};
