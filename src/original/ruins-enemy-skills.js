window.RuinsEnemySkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  function prepare(state, unit, damage) {
    const targets = alive(state.battle?.allies);
    if (!unit || !targets.length) return false;
    if (unit.ai === "ruins_drone") unit.ruinsLockedTarget ||= targets[0].uid;
    if (unit.ai === "ruins_carrier" && unit.ruinsReinforced) {
      const dead = (state.battle.enemies || []).filter(x => x.hp <= 0 && x !== unit);
      dead.forEach(x => { x.hp = Math.max(1, Math.ceil(x.maxHp * .4)); });
      unit.hp = Math.max(0, unit.hp - dead.length * Math.ceil(unit.maxHp * .1));
      unit.ruinsReinforced = false;
      log(state, `${unit.name} 发动增援部队，复活${dead.length}名友军。`);
    }
    if (unit.ai === "ruins_tank" && unit.ruinsShell) {
      unit.ruinsShell = false;
      targets.forEach(target => damage(state, target, stat(unit, "attack") * 2,
        "坦克炮弹", unit, { name: "坦克炮弹", type: "skill", ignoreResponse: true }));
    }
    if (unit.ai === "ruins_hilde") {
      unit.ruinsStealth = (unit.hand || []).some(card => ["♠", "♣"].includes(card.suit));
    }
    return false;
  }
  function beforeKillTargeted(_state, _actor, target, card) {
    if (target?.ai === "ruins_hilde" && target.ruinsStealth && !card?.ignoreResponse) {
      card._tempIgnoreResponse = true;
      card.ignoreResponse = true;
    }
  }
  function modifyDamage(_state, target, amount, card) {
    if (target?.ai === "ruins_carrier" && !card?.realDamage) return 0;
    return amount;
  }
  function afterDamage(state, actor, target, card, hpLoss) {
    if (!hpLoss || !actor) return;
    if (actor.ai === "ruins_drone" && card?.type === "slash") {
      window.BattleStatusCards?.add(state, target,
        window.BattleStatusCardRegistry?.create("paralysis"), actor.name);
    }
    if (actor.ai === "ruins_carrier" && target.hp <= 0) actor.ruinsReinforced = true;
  }
  function endTurn(_state, unit) {
    if (unit?.ai === "ruins_drone") unit.ruinsLockedTarget = null;
    if (unit?.ai === "ruins_hilde") unit.ruinsStealth = false;
  }
  return { prepare, beforeKillTargeted, modifyDamage, afterDamage, endTurn };
})();
