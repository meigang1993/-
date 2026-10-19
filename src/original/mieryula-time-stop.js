// 米尔尤拉【神奇怀表】的时停标记：独立成文件，避免技能模块超过行数硬约束。
// 标记挂在 unit.statuses 上（与「翻面」同一载体，UI 自动显示）；
// 生效期间目标跳过回合、技能失效、不可响应，且战斗 BGM 暂停。
window.MieryulaTimeStop = (() => {
  const KEY = "时停";
  const alive = unit => !!unit && unit.hp > 0;
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);
  const isStopped = unit => (unit?.statuses || []).includes(KEY);

  function mark(state, actor) {
    const battle = state?.battle;
    if (!battle) return 0;
    let count = 0;
    (battle.enemies || []).filter(alive).forEach(enemy => {
      enemy.statuses ||= [];
      if (enemy.statuses.includes(KEY)) return;
      enemy.statuses.push(KEY);
      count += 1;
    });
    if (count) {
      battle.mieryulaTimeStopOwner = actor?.uid ?? null;
      // 发动后 BGM 停止，标记全部解除后恢复（技能描述里不加这段文案）。
      window.GameBGM?.suspend?.("mieryula-time-stop");
    }
    return count;
  }

  function clear(state) {
    const battle = state?.battle;
    if (!battle) return 0;
    let count = 0;
    allUnits(battle).forEach(unit => {
      if (!isStopped(unit)) return;
      unit.statuses = unit.statuses.filter(item => item !== KEY);
      count += 1;
    });
    if (count || battle.mieryulaTimeStopOwner) {
      battle.mieryulaTimeStopOwner = null;
      window.GameBGM?.resume?.("mieryula-time-stop");
    }
    return count;
  }

  return {
    KEY, isStopped, mark, clear,
    shouldSkipTurn: isStopped,
    isSkillDisabled: isStopped,
    suppressesResponse: isStopped,
  };
})();
