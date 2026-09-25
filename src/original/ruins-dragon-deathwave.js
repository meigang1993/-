// 废墟沙城机械龙 · 死亡音波
// 拆分自 ruins-dragon-skills.js：死亡音波的记录与判定独立成文件，
// 以免主文件在追加电钻火花、机尾机枪后超过 200 行硬约束。
window.RuinsDragonDeathWave = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const suits = ["♥", "♦", "♠", "♣"];

  // 兼容旧存档字段 ruinsDeathWaveSuit（单花色）
  const recordedSuits = unit => (Array.isArray(unit?.ruinsDeathWaveSuits)
    ? unit.ruinsDeathWaveSuits.filter(suit => suits.includes(suit))
    : (suits.includes(unit?.ruinsDeathWaveSuit) ? [unit.ruinsDeathWaveSuit] : []));

  function recordDeathWave(state, dragon) {
    const counts = { "♥": 0, "♦": 0, "♠": 0, "♣": 0 };
    visible(dragon).forEach(card => { if (counts[card.suit] != null) counts[card.suit] += 1; });
    // 「记录手中1-3张牌的花色」：按手中张数从多到少取前3种花色，去重后不足3种则按实际数量。
    const picked = suits
      .filter(suit => counts[suit] > 0)
      .sort((left, right) => counts[right] - counts[left]
        || suits.indexOf(left) - suits.indexOf(right))
      .slice(0, 3);
    dragon.ruinsDeathWaveSuits = picked;
    dragon.ruinsDeathWaveSuit = null;
    if (!picked.length) return;
    window.BattleLines?.skill?.(state, dragon, "死亡音波");
    log(state, `${dragon.name} 发动死亡音波，记录${picked.join("、")}花色。`);
    state.battle?.animQueue?.push({
      type: "statusMark", id: window.GameRandom?.id?.("dw") || "dw",
      uid: dragon.uid, mark: picked.join(""), skill: "死亡音波",
    });
  }

  function checkDeathWave(state, unit) {
    if (!unit || unit.side !== "ally") return;
    const dragon = (state.battle?.enemies || []).find(enemy =>
      enemy.ai === "ruins_dragon" && enemy.hp > 0 && recordedSuits(enemy).length);
    if (!dragon) return;
    const recorded = recordedSuits(dragon);
    const used = unit.suitsUsedThisTurn || {};
    // 「未能使用你记录的花色」：记录的花色里只要有没用上的，回合结束就受伤一次。
    const missing = recorded.filter(suit => !used[suit]);
    // 用上记录的任一花色即视为已使用，不触发伤害；仅当记录的花色全部未使用时才受伤。
    // 此前实现为「任一未使用即受伤」，记录 1-3 种花色时，用掉其中一种仍会挨打，
    // 与描述不符（实战用例 C 复现）。
    if (missing.length < recorded.length) return;
    const amount = stat(dragon, "attack");
    const before = unit.hp;
    unit.hp = Math.max(0, unit.hp - amount);
    const loss = before - unit.hp;
    if (loss > 0) {
      window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "hp-loss", loss);
      window.BattleLines?.skill?.(state, dragon, "死亡音波", unit);
      log(state, `${unit.name} 未使用${missing.join("、")}花色，受到死亡音波${amount}点伤害。`);
    }
  }

  return { recordedSuits, recordDeathWave, checkDeathWave };
})();
