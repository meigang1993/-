window.GuestOpheliaGuard = (deps) => {
  const { alive, visible, isSlash, line } = deps;
  const guardVisible = battle =>
    window.BattleLines?.promptVisible?.(battle, "opheliaGuard")
    ?? !!(battle?.opheliaGuard && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);
  function guardOphelia(state, actor, target, amount, source, card, api) {
    if (target?.ref !== "ophelia" || actor?.side !== "enemy" || !isSlash(card) || (!card?.ignoreResponse && visible(target).some(c => api.canDodge(card, c)))) return null;
    const allies = state.battle.allies.filter(u => u.uid !== target.uid && alive(u));
    if (!allies.length) return null;
    const guard = target.side === "ally" && !card?.forceAutoResponse ? pickManualGuard(state, target, allies, actor, amount, source, card) : autoGuard(allies, amount, card, api);
    if (!guard) return null;
    line(state, target, "为我护驾", guard); if (guard.ref === "lokar") api.draw(guard, 2, state.battle); if (guard.ref === "aileng") api.draw(guard, 4, state.battle);
    if (window.BondiSkills?.cancelKillCard?.(state, guard, card)) return { dodged: false, hpLoss: 0 };
    // 需两张闪的杀（莫娜·圣剑无双 / 克罗·肉欲之欢 / 坦克炮弹）护驾也要出两张，
    // 否则护驾者只出 1 张闪就把双闪杀完全抵消，绕过了双闪要求。
    const needTwo = !!(card?.krowFemaleTarget || card?.twoDodgesRequired);
    const dodges = visible(guard).filter(c => api.canDodge(card, c));
    const dodge = needTwo ? (dodges.length >= 2 ? dodges.slice(0, 2) : [])
      : dodges.slice(0, 1);
    if (dodge.length === (needTwo ? 2 : 1)) {
      const visualHandBefore = window.BattleCards.visibleHandCount(guard);
      dodge.forEach(item => {
        guard.hand.splice(guard.hand.indexOf(item), 1);
        window.BattleCards?.put(
          state.battle, guard, item, "discard", { skipAnim: true });
      });
      window.BattleCards?.queueResponse?.(state.battle, guard, {
        type: "response", id: window.GameRandom.id("og"),
        uid: guard.uid, side: guard.side,
        // 出牌区按实际张数记录（cards 供 recordResponse 展开）
        cards: dodge.length > 1 ? dodge : null,
        card: dodge.length > 1 ? { ...dodge[0], name: "闪×2" } : dodge[0],
      }, visualHandBefore, window.BattleCards.visibleHandCount(guard));
      window.NonokaLokiSkills?.afterCardResponded?.(
        state, guard, actor, dodge[0], api);
      api.afterDodged?.(state, actor, guard, card);
      window.BattleLog.add(
        state, `${guard.name} 为${target.name}护驾，使用`
        + `${dodge.length > 1 ? "两张闪" : dodge[0].name}抵消杀。`);
      return { dodged: true, hpLoss: 0 };
    }
    window.BattleLog.add(state, `${guard.name} 为${target.name}护驾，改为承受本次伤害。`); return api.hitWithoutDodge(state, actor, guard, amount, source, card);
  }
  function autoGuard(allies, amount, card, api) {
    // 双闪杀：只有凑得出 2 张闪的友方才算"能护驾"，否则会选一个
    // 只出得起 1 张闪的人白白替奥菲莉亚承受伤害
    const required = card?.krowFemaleTarget || card?.twoDodgesRequired ? 2 : 1;
    return allies.reduce((best, u) => {
      const canDodge = visible(u).filter(c => api.canDodge(card, c)).length >= required, favorite = u.ref === "aileng" ? 18 : u.ref === "lokar" ? 12 : 0, survives = u.hp > amount ? 8 : -18;
      const score = (canDodge ? 100 : 0) + favorite + survives + u.hp / 4;
      return !best || score > best.score ? { u, score } : best;
    }, null)?.u;
  }
  function pickManualGuard(state, target, allies, actor, amount, source, card) {
    const b = state.battle, current = b.opheliaGuardUid && allies.find(u => u.uid === b.opheliaGuardUid);
    if (current) { b.opheliaGuardUid = null; return current; }
    b.opheliaGuard = { actorUid: actor.uid, targetUid: target.uid, amount, source, card: { ...card } };
    b.opheliaGuardUid = null; b.locked = true; b.selectedCardIndex = null; b.selectedCostCardIndex = null; b.selectedSkillCard = null;
    const prompt = allies.map(u => u.name).join("、");
    window.BattleLog.add(state, `${target.name} 可发动为我护驾，请先点击我方角色选择护驾者：${prompt}。`);
    return null;
  }
  function resolveOpheliaGuard(state, uid, api) {
    const b = state.battle, p = b?.opheliaGuard, valid = b?.allies.filter(u => u.ref !== "ophelia" && alive(u)) || [], unit = valid.find(u => u.uid === uid) || valid[0];
    if (!p || !guardVisible(b)) return false;
    b.opheliaGuard = null; b.opheliaGuardUid = unit?.uid || null; b.locked = false;
    const units = b.allies.concat(b.enemies), actor = units.find(u => u.uid === p.actorUid), target = units.find(u => u.uid === p.targetUid);
    const rootDamage = !b._damageDepth;
    b._damageDepth = (b._damageDepth || 0) + 1;
    try {
      if (unit && actor && target) guardOphelia(state, actor, target, p.amount, p.source, p.card, api);
      else if (actor && target) { window.BattleLog.add(state, `${target.name} 的护驾没有有效角色，攻击继续结算。`); api.hitWithoutDodge(state, actor, target, p.amount, p.source, p.card); }
      else window.BattleLog.add(state, `护驾没有有效角色，攻击结算中断。`);
    } finally {
      b._damageDepth -= 1;
      if (rootDamage) api.finalizeDamage?.(state);
    }
    window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, p.card);
    const groupCard = p.groupCard || p.card;
    const settling = b.pendingVictory || b.pendingDefeat || b.victoryScreen
      || b.defeat || b.testComplete;
    if (!settling && p.remainingHits > 0) b.manualDodgeResume = { ...p, remainingHits: p.remainingHits };
    if (!settling && groupCard?.targetUids?.length && groupCard.nextTargetIndex != null) b.demonInvasionResume = { ...p, card: groupCard, targetUids: groupCard.targetUids, nextTargetIndex: groupCard.nextTargetIndex };
    delete b.opheliaGuardUid;
    return true;
  }
  return { guardOphelia, guardVisible, resolveOpheliaGuard };
};
