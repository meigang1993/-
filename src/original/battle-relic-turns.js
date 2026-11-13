window.BattleRelicTurns = (() => {
  function prepare(state, unit, useCard, record) {
    (unit.battleStartRelicCaptions || []).forEach(name => window.BattleLines?.skill(state, unit, name));
    unit.battleStartRelicCaptions = [];
    if (!window.RelicSystem?.hasEquipped?.(state, unit, "妖刀村雨")) return false;
    const foes = unit.side === "enemy" ? state.battle.allies : state.battle.enemies;
    // 自动斩走与手动指定同一套目标限制。妖刀村雨生成的是虚拟【杀】，按新口径
    // 可指定隐身中的希尔德；仍保留统一判定源，以便其它「不可指定」机制生效。
    const slash = window.CardUtils.fromEntity("杀（普攻）", {
      noIntentCost: true,
      sourceName: "妖刀村雨",
      _skipUseKillTriggers: true,
    });
    const target = foes.filter(enemy => enemy.hp > 0)
      .filter(enemy => !window.RuinsEnemySkills?.blocksKillTarget?.(enemy, slash))
      .sort((a, b) => a.hp - b.hp)[0];
    if (!target) return false;
    record(state, `${unit.name} 的妖刀村雨自动斩向${target.name}。`);
    useCard(state, unit, target, slash);
    return true;
  }

  function finishPlay(state, unit, record) {
    if (unit.shockHandCannonExpiresThisTurn) {
      unit.shockHandCannonReady = false;
      unit.shockHandCannonExpiresThisTurn = false;
    }
    if (unit.playedSlashThisTurn || !window.RelicSystem?.hasEquipped?.(state, unit, "震感手炮")) return false;
    unit.shockHandCannonReady = true;
    record(state, `${unit.name} 的震感手炮蓄能，下回合杀牌伤害翻倍。`);
    return true;
  }

  return { prepare, finishPlay };
})();
