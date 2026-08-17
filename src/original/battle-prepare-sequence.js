window.BattlePrepareSequence = deps => {
  const {
    combat, draw, intentMax, nextAnim, record, relicPrepare,
  } = deps;

  function resolve(state, unit) {
    const battle = state.battle;
    if (!battle || battle.prepareUnitUid !== unit.uid) return true;
    while (!battle.locked && battle.prepareStep < 8) {
      const step = battle.prepareStep;
      if (step === 0) {
        battle.prepareStep += 1;
        record(state, `${unit.name} 准备阶段，杀意重置为${unit.intent}/${intentMax(unit)}。`);
        window.BattleStatusCards?.resolveResistance?.(state, unit);
        window.BakarSkills?.tickBurning?.(state, unit, combat.directDamage, combat.damage);
      } else if (step === 1) {
        battle.prepareStep += 1;
        window.EnemySkills?.tickPoison?.(state, unit, combat.damage);
      } else if (step === 2) {
        if (window.EnemySkills?.prepare?.(state, unit, combat.damage, nextAnim) === false) return false;
        battle.prepareStep += 1;
      } else if (step === 3) {
        battle.prepareStep += 1;
        if (unit.hp > 0) relicPrepare(state, unit);
      } else if (step === 4) {
        battle.prepareStep += 1;
        window.AngelicaLukaSkills?.beginTurn?.(state, unit);
      } else if (step === 5) {
        battle.prepareStep += 1;
        window.NonokaLokiSkills?.beginTurn?.(state, unit);
      } else if (step === 6) {
        battle.prepareStep += 1;
        window.GuestCharacterSkills?.beginTurn?.(state, unit, { draw, damage: combat.damage });
      } else if (step === 7) {
        battle.prepareStep += 1;
        window.BertisGerlotSkills?.beginTurn?.(state, unit);
      }
      if (unit.hp <= 0 || battle.locked) break;
    }
    combat.checkDefeat(state);
    combat.checkEnd(state);
    if (battle.locked) return false;
    delete battle.prepareUnitUid;
    delete battle.prepareStep;
    return true;
  }

  return { resolve };
};
