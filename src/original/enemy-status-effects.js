window.EnemyStatusEffects = ({ alive, markStatus }) => {
  function addPoison(state, target, count = 1, source = null) {
    if (!alive([target]).length) return;
    target.poison = (target.poison || 0) + count;
    target.poisonSourceUid = source?.uid || target.poisonSourceUid || null;
    markStatus(target, "毒");
    window.BattleLog.add(state, `${target.name} 获得${count}层毒（当前${target.poison}层）。`);
  }

  function addShock(state, target, count = 1) {
    if (!alive([target]).length) return;
    target.shock = (target.shock || 0) + count;
    markStatus(target, "感电");
    window.BattleLog.add(state, `${target.name} 获得${count}层感电（当前${target.shock}层）。`);
  }

  function addHolyScar(state, target) {
    if (!alive([target]).length || target.holyScar) return;
    target.holyScar = true;
    markStatus(target, "圣痕");
    window.BattleLog.add(state, `${target.name} 获得圣痕。`);
  }

  function clearHolyScar(state, unit) {
    if (!unit?.holyScar) return;
    unit.holyScar = false;
    unit.statuses = (unit.statuses || []).filter(status => status !== "圣痕");
    window.BattleLog.add(state, `${unit.name} 恢复生命，圣痕解除。`);
  }

  function onHeal(state, draw) {
    (state.battle?.allies || []).concat(state.battle?.enemies || [])
      .filter(unit => unit.hp > 0 && window.RelicSystem?.hasEquipped?.(state, unit, "母亲照片"))
      .forEach(unit => {
        const drawn = draw?.(unit, 1, state.battle);
        window.BattleLog.add(state, `${unit.name} 的母亲照片触发，${window.BattleDrawFeedback.action(unit, 1, drawn)}。`);
      });
  }

  function tickPoison(state, unit, damage) {
    if (!unit.poison || unit.hp <= 0) return;
    const source = state.battle.allies.concat(state.battle.enemies)
      .find(actor => actor.uid === unit.poisonSourceUid) || unit;
    damage(state, unit, unit.poison, "毒", source, {
      name: "毒", type: "skill", poison: true, poisonTick: true,
      ignoreResponse: true, ignoreBlock: true, skipDamageModify: true,
    });
  }

  return { addPoison, addShock, addHolyScar, clearHolyScar, onHeal, tickPoison };
};
