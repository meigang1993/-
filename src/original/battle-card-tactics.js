window.BattleCardTactics = ({ log, ctx, deps, reveal, openHandReveal }) => {
  const visible = unit => (unit?.hand || []).filter(c => !c._pendingDraw);
  const damageCopy = (card, extra = {}) => ({ ...card, ...extra, _entitySourceCard: card._entitySourceCard || card });
  function soulChain(state, actor, target, card) { if (!target || target.side === actor.side) return; const foes = (actor.side === "enemy" ? state.battle.allies : state.battle.enemies).filter(u => u.hp > 0), selected = card._targetUids || state.battle.pendingTargetUids || [target.uid], picked = selected.map(uid => foes.find(u => u.uid === uid)).filter(Boolean).slice(0, 2); window.EdisSkills?.copyTargetedCards?.(state, actor, picked, card); picked.forEach(u => { u.soulChain = 2; if (!u.statuses.includes("锁魂")) u.statuses.push("锁魂"); }); log(state, `${actor.name} 使用${card.name}，${picked.map(u => u.name).join("、")}陷入锁魂状态。`); }
  function magicDuel(state, actor, target, card) {
    if (!target.hand.some(c => c.name === "魔杀" && !c._pendingDraw)) { ctx.damage(state, target, ctx.statOf(actor, "magic"), card.name, actor, damageCopy(card, { ignoreResponse: true, duelUserUid: actor.uid })); log(state, `${actor.name} 使用魔法对决，${target.name}没有魔杀。`); return; }
    let holder = target, other = actor, last = actor;
    while (true) { const i = holder.hand.findIndex(c => c.name === "魔杀" && !c._pendingDraw); if (i < 0) break; const slash = holder.hand.splice(i, 1)[0]; ctx.putCard(state, holder, slash, "discard", { skipAnim: true }); showDuelSlash(state, holder, other, slash, "魔法对决"); last = holder; [holder, other] = [other, holder]; }
    ctx.damage(state, holder, ctx.statOf(last, "magic"), card.name, last, damageCopy(card, { ignoreResponse: true, duelUserUid: actor.uid }));
    log(state, `${actor.name} 发起魔法对决，${holder.name}无法继续打出魔杀。`);
  }
  function magicBullet(state, actor, target, card) {
    if (actor.side === "ally") return openHandReveal(state, actor, target, card, "magicBullet");
    if (target?.side === "ally") return openHandReveal(state, actor, target, card, "magicBulletReveal");
    const options = window.CardUtils.magicBulletCards(target), shown = window.GameRandom.sample(options, state), i = shown && actor.hand.findIndex(c => c !== card && c.suit === shown.suit && !c._pendingDraw);
    if (!shown) { log(state, `${actor.name} 使用魔弹特攻失败：${target.name}没有可展示手牌。`); return false; }
    reveal(state, "魔弹特攻", [shown]);
    if (i < 0) { log(state, `${actor.name} 使用魔弹特攻，${target.name}随机展示${shown.suit}${shown.name}，但${actor.name}没有同花色牌可弃置，魔弹特攻无效。`); return false; }
    const [cost] = actor.hand.splice(i, 1); ctx.putCard(state, actor, cost, "discard", { showDiscard: true });
    ctx.damage(state, target, ctx.statOf(actor, "magic"), card.name, actor, damageCopy(card, { ignoreResponse: true }));
    log(state, `${actor.name} 使用魔弹特攻，${target.name}随机展示${shown.suit}${shown.name}，弃置${cost.suit}${cost.name}发动魔弹特攻。`);
    return true;
  }
  function duel(state, actor, target, card) {
    const amount = unit => ctx.statOf(unit, window.CardUtils?.damageStatKey?.(unit, card) === "magic" ? "magic" : "attack");
    if (!target.hand.some(c => c.name === "杀（普攻）" && !c._pendingDraw)) { ctx.damage(state, target, amount(actor), card.name, actor, damageCopy(card, { type: "tactic", ignoreResponse: true, duelUserUid: actor.uid })); log(state, `${actor.name} 使用与我一战，${target.name}没有杀（普攻）。`); return; }
    let holder = target, other = actor, last = actor;
    while (true) { const i = holder.hand.findIndex(c => c.name === "杀（普攻）" && !c._pendingDraw); if (i < 0) break; const slash = holder.hand.splice(i, 1)[0]; ctx.putCard(state, holder, slash, "discard", { skipAnim: true }); showDuelSlash(state, holder, other, slash, "与我一战"); last = holder; [holder, other] = [other, holder]; }
    const sourceCard = damageCopy(card, { type: "tactic", ignoreResponse: true, duelUserUid: actor.uid });
    ctx.damage(state, holder, amount(last), card.name, last, sourceCard);
    log(state, `${actor.name} 发起与我一战，${holder.name}无法继续出杀。`);
  }
  function showDuelSlash(state, holder, target, slash, sourceName) { slash._playedByName = holder.name; slash._playedAction = "打出了"; state.battle.animQueue?.push({ type: "virtualPlay", id: `du${deps.nextAnim()}`, uid: holder.uid, side: holder.side, targetUid: target.uid, card: slash, enemyLine: holder.side === "enemy", slashText: true }); state.battle.played.unshift({ ...slash }); log(state, `${holder.name} 在${sourceName}中打出${slash.suit || ""}${slash.name}。`); }
  function comboAttack(state, actor, target, card) { const partner = ctx.comboPartner(state.battle, actor); if (!partner || !target) return; card.comboPartnerUid = partner.uid; log(state, `${actor.name} 发动组合进攻，指定${target.name}为目标，并选择${partner.name}协同攻击。`); useComboSlash(state, actor, target, card, partner.uid); if (state.battle?.locked) { state.battle.comboAttackResume = { actorUid: actor.uid, partnerUid: partner.uid, targetUid: target.uid, card: { ...card } }; return; } if (target.hp > 0 && partner.hp > 0) useComboSlash(state, partner, target, card); }
  function resumeComboAttack(state) { const b = state.battle, p = b?.comboAttackResume; if (!p || b.locked) return false; b.comboAttackResume = null; const units = b.allies.concat(b.enemies), partner = units.find(u => u.uid === p.partnerUid), target = units.find(u => u.uid === p.targetUid); if (!partner || !target || partner.hp <= 0 || target.hp <= 0) return true; useComboSlash(state, partner, target, p.card); return true; }
  function useComboSlash(state, user, target, sourceCard, partnerLineUid = null) { const slash = { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", virtual: true, noIntentCost: true, _skipHandMove: true, skipAfterCardPlayed: true, skipMvpCardCount: true, comboAttackVirtual: true, comboPartnerUid: sourceCard.comboPartnerUid, sourceName: sourceCard.name }; if (partnerLineUid) { slash._playedFlightDone = true; slash._playedTargetUid = target.uid; state.battle.animQueue?.push({ type: "virtualPlay", id: `ca${deps.nextAnim()}`, uid: user.uid, side: user.side, targetUid: target.uid, comboPartnerUid: partnerLineUid, card: slash, enemyLine: user.side === "enemy", slashText: true }); } log(state, `${user.name} 对${target.name}发动组合进攻的攻击。`); ctx.useCard(state, user, target, slash); }
  function borrowSlash(state, actor, target, card) {
    const partner = ctx.sameSideUnits(state.battle, actor).find(u => u.uid === state.battle.comboPartnerUid && u.hp > 0);
    if (!partner || !target) return;
    const cards = visible(partner);
    const slashIndexes = cards.map((candidate, index) =>
      window.CardUtils.isSingleKillCard(candidate) ? index : -1)
      .filter(index => index >= 0);
    if (actor.side === "ally" && slashIndexes.length) {
      openBorrowPrompt(state, actor, partner, target, card,
        "borrowSlashChoice", slashIndexes);
      return;
    }
    const slash = slashIndexes.length ? cards[slashIndexes[0]] : null;
    if (slash) {
      slash.noIntentCost = true; slash.skipAfterCardPlayed = true;
      slash._skipUseKillTriggers = true;
      log(state, `${actor.name} 使用借刀杀人，令${partner.name}对${target.name}使用${slash.suit || ""}${slash.name}（不触发“使用杀”技能）。`);
      ctx.useCard(state, partner, target, slash);
      return;
    }
    const validIndexes = cards.map((candidate, index) =>
      window.BattleStatusCards?.canReceive?.(actor, candidate) === false
        ? -1 : index).filter(index => index >= 0);
    if (!validIndexes.length) {
      log(state, `${actor.name} 使用借刀杀人，但${partner.name}没有可获得的手牌。`);
      return;
    }
    if (actor.side === "ally") {
      openBorrowPrompt(state, actor, partner, target, card,
        "borrowGainChoice", validIndexes);
      return;
    }
    gainBorrowedCard(state, actor, partner, cards[validIndexes[0]]);
  }
  function openBorrowPrompt(state, actor, partner, target, card, mode, validIndexes) {
    if (!openHandReveal(state, actor, partner, card, mode)) return false;
    Object.assign(state.battle.handReveal, {
      attackTargetUid: target.uid, validIndexes, repeatAfter: true,
    });
    return true;
  }
  function gainBorrowedCard(state, actor, partner, gained) {
    partner.hand.splice(partner.hand.indexOf(gained), 1);
    if (state.battle.animQueue) gained._pendingDraw = true;
    actor.hand.push(gained);
    window.BattleCards?.syncStatusCards?.(actor);
    window.BattleCards?.afterHandLost?.(state.battle, partner);
    state.battle.animQueue?.push({
      type: "stealCard", fromUid: partner.uid, fromSide: partner.side,
      toUid: actor.uid, toSide: actor.side, count: 1, cards: [gained],
    });
    log(state,
      `${actor.name} 使用借刀杀人，${partner.name}没有单体杀牌，获得其${gained.suit || ""}${gained.name}。`);
  }
  function demonInvasion(state, actor, card) {
    const foes = window.BakarSkills?.invasionTargets?.(state, actor, card)
      || (actor.side === "enemy" ? state.battle.allies : state.battle.enemies).filter(u => u.hp > 0);
    const targetUids = foes.map(u => u.uid), amount = ctx.statOf(actor, "attack") + ctx.statOf(actor, "magic"), base = damageCopy(card, { type: "tactic", responseKind: "slash" });
    window.EdisSkills?.copyTargetedCards?.(state, actor, foes, card);
    if (!card._playedFlightDone && !state.battle._manualGroupFlightShown) state.battle.animQueue?.push({ type: "virtualPlay", id: `di${deps.nextAnim()}`, uid: actor.uid, side: actor.side, targetUids, card: base, enemyLine: actor.side === "enemy", show: false });
    for (let i = 0; i < foes.length && !state.battle.locked; i++) {
      state.battle.demonInvasionResume = i + 1 < foes.length
        ? { actorUid: actor.uid, targetUid: foes[i].uid, amount, source: card.name, card: base, targetUids, nextTargetIndex: i + 1 }
        : null;
      ctx.damage(state, foes[i], amount, card.name, actor, { ...base, targetUids, nextTargetIndex: i + 1 });
    }
    if (!state.battle.locked) state.battle.demonInvasionResume = null;
    log(state, `${actor.name} 使用魔王军入侵，敌方全体受到魔王军压制。`);
  }
  return { soulChain, magicDuel, magicBullet, duel, comboAttack, resumeComboAttack, borrowSlash, demonInvasion };
};
