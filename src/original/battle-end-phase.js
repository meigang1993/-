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
      () => window.ArtinaMariaSkills?.endTurn?.(state, unit),
      () => window.AbeKarunaDivaSkills?.endTurn?.(state, unit),
      () => window.AbeKarunaBubbleSkills?.endTurn?.(state, unit),
      () => window.AngelicaLukaSkills?.endTurn?.(state, unit),
      // 【飘浮掩体】改在温蒂自己的结束阶段触发；必须吞掉返回值：steps 里
      // 任何一步返回 false 都会挂起后续步骤，而 floatingCover 在不满足条件时返回 false。
      () => { if (unit?.ref === "wendy") window.WendyCadicisSkills?.floatingCover?.(state, unit, { pushFloat: combat.pushFloat }); return true; },
      () => window.NoaSideEffectSkills?.endTurn?.(state, unit, { damage: combat.damage, pushFloat: combat.pushFloat }),
      // 【淫气改造】只在出牌阶段（phase 4）生效，结束阶段不补牌/不弃牌。
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
    // 角色牌上的存储牌「回合结束回归」是牌临时移出游戏后的规则清算，不是
    // 技能发动：时停会清空上面整个 steps，若挂在 steps 里会漏返还，牌会滞留
    // 到下个非时停回合甚至战斗结束。故放在所有结束步骤成功跑完之后、
    // cleanupTurn 之前无条件执行（挂起返回 false 时不会走到这里）。
    // ElranaAceNanaliSkills.endTurn / NanaliSealed.returnSealed 转发层保留，
    // 供预览 spec 与既有调用方直接使用。
    window.BattleCharacterCardStorage?.endTurn?.(state);
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
