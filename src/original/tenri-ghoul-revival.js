// 无垢食尸鬼 · 快速复生（被动）
// 2026-11-25 按用户新稿对齐：文案「当你死亡后，下一个回合开始时若我方其他角色存活，
// 你复活并恢复所有生命值」——「死亡后」只进入待复活状态，队友存活条件**只在复活瞬间判**，
// 不在死亡瞬间再判一次。为避免队友全灭时待复活标记把胜利结算挂起，胜负链另由
// shouldHoldRevival 兜底（见 sakura-risa-skills.js 的 pendingRevival 包装）。
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
    // 按新稿：死亡瞬间不判队友存活，只判时停与重复触发。
    // 队友全灭时仍进入待复活，但 shouldHoldRevival 会让胜负链立即结算、不挂起。
    if (c.stopped(unit)) return false;
    unit.tenriRevivePending = true;
    unit.statuses ||= [];
    if (!unit.statuses.includes("待复活")) unit.statuses.push("待复活");
    c.lines(state, unit, "快速复生");
    c.log(state, `${unit.name} 死亡，快速复生使其等待下个回合开始时判定是否复活。`);
    return true;
  }

  // 胜负链兜底：待复活标记是否仍应阻挡「敌人全灭 → 胜利」。
  // 不是复活条件的二次判定，只是避免队友全灭时战斗被挂起（文案未规定胜负时机）。
  function shouldHoldRevival(unit) {
    if (!pendingRevival(unit)) return false;
    const b = window.state?.battle;
    if (!b) return true;
    const team = unit?.side === "enemy" ? b.enemies : b.allies;
    return (team || []).some(u => u !== unit && u.hp > 0);
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
    // 复活必须同步动画层血量：死亡伤害浮字会把 visualHp 写回 0，而单位卡渲染
    // 取 visualHp ?? hp。只改 hp 会出现「已经满血、单位卡仍是灰化的死亡态」，
    // 且 deathShown / deathAnimationPending 不会被 isDead=false 分支清掉。
    unit.visualHp = maxHp;
    unit.visualBlock = unit.block || 0;
    unit.visualDefense = unit.defenseSystem || 0;
    delete unit.deathShown;
    delete unit.deathAnimationPending;
    delete unit.deferredDeathVisual;
    delete unit.deathDiscarded;
    window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "heal", maxHp);
    window.EnemySkills?.onHeal?.(state, window.BattleSystem?.draw);
    c.lines(state, unit, "快速复生");
    c.log(state, `${unit.name} 的快速复生触发，恢复全部生命值（${maxHp}）。`);
    return true;
  }

  return { isGhoul, pendingRevival, shouldHoldRevival, preventDeath, beginTurn };
})();
