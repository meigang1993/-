window.BattleRelicTurns = (() => {
  function prepare(state, unit, useCard, record) {
    (unit.battleStartRelicCaptions || []).forEach(name => window.BattleLines?.skill(state, unit, name));
    unit.battleStartRelicCaptions = [];
    if (!window.RelicSystem?.hasEquipped?.(state, unit, "妖刀村雨")) return false;
    const foes = unit.side === "enemy" ? state.battle.allies : state.battle.enemies;
    // 自动斩必须走与手动指定同一套目标限制：隐身中的希尔德不可被单体【杀】
    // 指定，否则饰品会绕过锁定技。按血量升序取第一个「可被指定」的目标。
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
