window.MachineFactorySkills = deps => {
  const { alive, stat, black, hpPct, markStatus, drawJudge } = deps;
  function prepare(state, unit, damage, nextAnim) {
    if (unit.ai !== "mechanical_bull_king" || !unit.annihilationMode) return false;
    const targets = alive(state.battle.allies);
    const amount = stat(unit, "attack");
    const card = CardUtils.fromEntity("机枪扫杀", {
      allTargets: targets.map(target => target.uid),
      aoeLineShown: true,
    });
    state.battle.animQueue?.push({
      type: "virtualPlay",
      id: `frenzy${nextAnim?.() || Date.now()}`,
      uid: unit.uid,
      targetUids: card.allTargets,
      card,
      enemyLine: unit.side === "enemy",
      show: true,
    });
    window.EnemySkills?.beforeKillUsed?.(state, unit, card);
    const actions = targets.map(target => ({
      kind: "damage", actorUid: unit.uid, targetUid: target.uid, amount,
      source: "歼灭模式·狂热机枪", card: { ...card }, prepareGroupKill: true,
    }));
    if (window.BattleReactionQueue?.enqueue?.(state, actions)) window.BattleReactionQueue.flush(state, damage);
    else targets.forEach(target => damage(state, target, amount, "歼灭模式·狂热机枪", unit, window.EnemySkills?.prepareGroupKillTarget?.(state, unit, target, card) || card));
    window.BattleLines?.skill(state, unit, "狂热机枪");
    window.BattleLog.add(state, `${unit.name} 发动狂热机枪，我方全体遭到扫射。`);
    return true;
  }
  function hammerMove(actor) {
    if (actor.ai !== "mechanical_bull_king" || !actor.annihilationMode || actor.hammerUsed || hpPct(actor) >= .8) return null;
    return { card: { name: "恐怖巨锤", _skill: true, bullHammer: true, targetless: true }, target: actor };
  }
  function useHammer(state, actor, damage) {
    actor.hammerUsed = true;
    window.BattleLines?.skill(state, actor, "恐怖巨锤");
    window.BattleLog.add(state, `${actor.name} 发动恐怖巨锤，我方全体进行拼花。`);
    const targets = alive(state.battle.allies);
    const actions = targets.map(target => ({ kind: "machineHammer", actorUid: actor.uid, targetUid: target.uid }));
    if (window.BattleReactionQueue?.enqueue?.(state, actions)) window.BattleReactionQueue.flush(state, damage);
    else targets.forEach(target => resolveHammerTarget(state, actor, target, damage));
    return true;
  }
  function resolveHammerTarget(state, actor, target, damage) {
    const { actorCard, targetCard, success: hit } = window.BattlePileStats.clash(actor, target);
    const event = { type: "clash", ...window.BattlePileStats.clashSnapshot({ actorCard, targetCard }), a: actorCard?.suit || "无", t: targetCard?.suit || "无", result: hit ? "成功" : "抵抗", targetUid: hit ? target.uid : null, id: window.GameRandom.id("cl"), uid: target.uid };
    state.battle.lastClash = event; state.battle.animQueue?.push(event);
    if (hit) damage(state, target, stat(actor, "attack"), "歼灭模式·恐怖巨锤", actor, { name: "恐怖巨锤", type: "skill", ignoreResponse: true });
    return true;
  }
  function absorbDefense(state, target, amount, effectMeta = null) {
    if (target.ai !== "mechanical_bull_king" || !target.defenseSystem) return { absorbed: 0, rest: amount };
    const absorbed = Math.min(target.defenseSystem, amount);
    const rest = amount - absorbed;
    target.defenseSystem -= absorbed;
    const annihilationCommit = !target.defenseSystem && !target.annihilationMode
      ? activateAnnihilation(state, target) : null;
    window.BattleSystem?.pushFloat?.(
      state.battle,
      target.uid,
      target.defenseSystem ? "defense" : "defense-break",
      absorbed,
      false,
      0,
      null,
      null,
      { ...(rest ? null : effectMeta), ...(annihilationCommit ? { commit: annihilationCommit } : null) },
    );
    if (!target.defenseSystem) state.battle.lastArmorBreakUid = target.uid;
    if (annihilationCommit && !state.battle.animQueue) annihilationCommit();
    return { absorbed, rest };
  }
  function activateAnnihilation(state, target) {
    target.annihilationMode = true;
    return () => {
      if (!state.battle || target._annihilationPresented) return;
      target._annihilationPresented = true;
      markStatus(target, "歼灭");
      state.battle.bgmOverride = target.annihilationBgm;
      window.BattleLines?.skill(state, target, "歼灭模式");
      window.BattleLog.add(state, `${target.name} 防御系统崩溃，歼灭模式启动！`);
    };
  }
  function afterDamage(state, actor, target, hpLoss, damage) {
    if (!hpLoss || target.ai !== "mechanical_bull_king" || !target.annihilationMode
      || hpPct(target) >= .6 || actor?.hp <= 0 || actor.uid === target.uid) return;
    window.BattleLines?.skill(state, target, "电磁反制装置");
    const { card, success } = drawJudge(state.battle, target, "电磁反制装置", black);
    window.BattleLog.add(state, `${target.name} 电磁反制判定：${card.suit}${card.name}，${success ? "反制成功" : "未触发"}。`);
    if (success) {
      damage?.(state, actor, 3 + stat(target, "attack"), "电磁反制装置", target, {
        name: "电磁反制装置",
        type: "skill",
        ignoreResponse: true,
        skipDamageModify: true,
        shock: true,
      });
    }
  }
  function endTurn(unit) {
    if (unit.ai === "mechanical_bull_king") unit.hammerUsed = false;
  }
  return { prepare, hammerMove, useHammer, resolveHammerTarget, absorbDefense, afterDamage, endTurn };
};
