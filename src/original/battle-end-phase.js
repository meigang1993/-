window.BattleEndPhase = deps => {
  const { allUnits, combat, draw } = deps;
  function run(state, unit) {
    const b = state?.battle;
    if (!b || !unit) return true;
    if (b.endPhaseUnitUid && b.endPhaseUnitUid !== unit.uid) return false;
    b.phase = 6;
    b.endPhaseUnitUid = unit.uid;
    // 时停：结束阶段技（如【百眼魅魔】）归属该单位，被时停时不发动；
    // 但回合清理仍需照常执行，故只清空步骤列表而不提前 return。
    const timeStopped = !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);
    const steps = [
      () => window.NonokaLokiSkills?.endTurn?.(state, unit, { draw }),
      () => window.GuestCharacterSkills?.endTurn?.(state, unit, { draw }),
      () => window.HoshinoSkills?.endTurn?.(state, unit),
      () => window.GerdaSkills?.endTurn?.(state, unit),
      () => window.BertisGerlotSkills?.endTurn?.(state, unit),
      () => window.CharacterSkinFX?.endTurn?.(state, unit),
      () => window.EnemySkills?.endTurn?.(state, unit, draw, combat.damage),
      () => window.UnderwaterTrainSkills?.endTurn?.(state, unit),
      () => window.ElranaAceNanaliSkills?.endTurn?.(state, unit, { draw, damage: combat.damage, pushFloat: combat.pushFloat }),
      () => window.ArtinaMariaSkills?.endTurn?.(state, unit),
      () => window.AngelicaLukaSkills?.endTurn?.(state, unit),
      () => window.RuinsCardSkills?.clearVulnerable?.(state, unit),
      () => promptSpeedAssault(state, unit),
    ];
    if (timeStopped) steps.length = 0;
    let index = Number.isInteger(b.endPhaseStep) ? b.endPhaseStep : 0;
    while (index < steps.length) {
      b.endPhaseStep = index + 1;
      if (steps[index++]() === false) return false;
      if (state.battle !== b) return false;
    }
    delete b.endPhaseStep;
    delete b.endPhaseUnitUid;
    window.BattleTurnState.cleanupTurn(b, unit, true, allUnits(b));
    return true;
  }
  function promptSpeedAssault(state, unit) {
    const b = state?.battle;
    const ready = unit.side === "ally" && unit.hp > 0 && !unit.usedSpeedAssaultEnd
      && (unit.skills || []).some(skill => skill.name === "神速之袭")
      && b.enemies.some(enemy => enemy.hp > 0);
    if (!ready) return true;
    b.awaitingSpeedAssaultUid = unit.uid;
    window.BattleLog?.add?.(state, `${unit.name} 可以在结束阶段发动神速之袭。`);
    return false;
  }
  return { run };
};
