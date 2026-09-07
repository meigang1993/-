window.BattleDrawTransaction = (() => {
  const own = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);

  function property(object, key, clone = value => value) {
    return {
      object, key, existed: own(object, key),
      value: clone(object[key]),
    };
  }

  function restoreProperty(entry) {
    if (entry.existed) entry.object[entry.key] = entry.value;
    else delete entry.object[entry.key];
  }

  function array(owner, key) {
    const existed = Array.isArray(owner?.[key]);
    const value = existed ? owner[key] : null;
    return { owner, key, existed, value, items: value?.slice() || [] };
  }

  function restoreArray(entry) {
    if (!entry.existed) {
      delete entry.owner[entry.key];
      return;
    }
    entry.owner[entry.key] = entry.value;
    entry.value.splice(0, entry.value.length, ...entry.items);
  }

  function snapshot(state, battle) {
    const units = battle.allies.concat(battle.enemies || []);
    const piles = [...new Set(units.map(unit => unit.pileStats || unit))];
    const arrays = [
      ...piles.flatMap(pile =>
        ["deck", "discard", "consumed"].map(key => array(pile, key))),
      ...units.map(unit => array(unit, "hand")),
      array(battle, "animQueue"),
    ];
    const cards = [...new Set(arrays.flatMap(entry => entry.items)
      .filter(card => card && typeof card === "object"))];
    return {
      arrays,
      pending: cards.map(card => property(card, "_pendingDraw")),
      properties: [
        ...piles.map(pile => property(pile, "shuffleCount")),
        property(state, "log"),
        property(state, "battleLog"),
        property(battle, "_pendingBattleSkillLog"),
        property(battle, "_skipNextBattleSkillLog"),
        property(state, "random", value => value && { ...value }),
      ],
    };
  }

  function restore(saved) {
    saved.arrays.forEach(restoreArray);
    saved.pending.forEach(restoreProperty);
    saved.properties.forEach(restoreProperty);
  }

  function run(state, battle, action) {
    const saved = snapshot(state, battle);
    try {
      return action();
    } catch (error) {
      restore(saved);
      throw error;
    }
  }

  return { run };
})();
