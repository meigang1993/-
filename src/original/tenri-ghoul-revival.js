// 无垢食尸鬼 · 快速复生（被动）
// 死亡后进入待复活，于自己下个回合开始时满血复活；条件「其他我方角色存活」在
// 死亡瞬间与复活瞬间各判一次，避免队友全灭时战斗被挂起。
// 复用全项目的 pendingRevival 结算链（死亡判定 / 弃牌 / 胜负 / 回合流转都认它）。
window.TenriGhoulRevival = (() => {
  const C = () => window.TenriInstituteCommon;
  const isGhoul = unit => !!C()?.isAi(unit, "tenri_ghoul");
  const pendingRevival = unit => !!unit?.tenriRevivePending;

  function teamAlive(state, unit) {
    const team = unit?.side === "enemy" ? state?.battle?.enemies : state?.battle?.allies;
    return (team || []).some(u => u !== unit && u.hp > 0);
  }

  function preventDeath(state, unit) {
    const c = C();
    if (!c || !isGhoul(unit) || unit.hp > 0 || pendingRevival(unit)) return false;
    if (c.stopped(unit) || !teamAlive(state, unit)) return false;
    unit.tenriRevivePending = true;
    unit.statuses ||= [];
    if (!unit.statuses.includes("待复活")) unit.statuses.push("待复活");
    c.lines(state, unit, "快速复生");
    c.log(state, `${unit.name} 死亡，但仍有队友存活，快速复生使其等待下个回合复活。`);
    return true;
  }

  function beginTurn(state, unit) {
    const c = C();
    if (!c || !pendingRevival(unit)) return false;
    unit.tenriRevivePending = false;
    unit.statuses = (unit.statuses || []).filter(s => s !== "待复活");
    // 复活瞬间队友已全灭 / 被时停 → 不再复活，标记清掉让死亡结算正常收口。
    if (c.stopped(unit) || !teamAlive(state, unit)) {
      c.log(state, `${unit.name} 的快速复生未能发动：没有其他存活的队友，单位保持阵亡。`);
      return true;
    }
    const H = window.BattleHpValue;
    const maxHp = H?.maxHp?.(unit) ?? unit.maxHp ?? unit.stats?.maxHp ?? unit.hp;
    unit.hp = maxHp;
    delete unit.deathDiscarded;
    window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "heal", maxHp);
    window.EnemySkills?.onHeal?.(state, window.BattleSystem?.draw);
    c.lines(state, unit, "快速复生");
    c.log(state, `${unit.name} 的快速复生触发，恢复全部生命值（${maxHp}）。`);
    return true;
  }

  return { isGhoul, pendingRevival, preventDeath, beginTurn };
})();
