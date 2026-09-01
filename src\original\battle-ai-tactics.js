window.BattleAITactics = (() => {
  const HEAL_THRESHOLD = .7;
  window.BattleAIConfig = { ...(window.BattleAIConfig || {}), HEAL_THRESHOLD };
  const statusHolder = (units, actor) => units.find(unit =>
    unit.uid !== actor.uid && unit.hp > 0
      && (unit.hand || []).some(card =>
        !card._pendingDraw && window.BattleStatusCards?.isStatus?.(card)));
  const statusTarget = (units, card) => units.find(unit =>
    unit.hp > 0 && !window.BattleStatusCards?.has?.(unit, card.statusKey));
  function tacticScore(ctx, actor, card, team, foes, aliveFoes, ensureSlash) {
    const { alive, hpPct, visible, handLimit, healTarget, lowHandAllies, withHand, hasDodge, keyCount, stat, slashScore, slashTarget, magicBulletTarget, borrowPartner, otherAlly, comboPartner } = ctx;
    if (!["tactic", "consume", "obstacle"].includes(card.type)) return 0;
    if (card.statusKey) return statusTarget(aliveFoes, card) ? 86 : 0;
    if (card.teamHealPct) { const hurt = alive(team).filter(u => hpPct(u) < HEAL_THRESHOLD); if (!hurt.length) return 0; const critical = hurt.some(u => hpPct(u) < .3), lowest = Math.min(...hurt.map(hpPct)); return hurt.length >= 2 || critical ? 88 + hurt.length * 8 + (critical ? 18 : 0) : lowest < .55 ? 72 : 0; }
    if (card.heal || card.healPct) { const low = healTarget(team); return low ? (low.uid === actor.uid ? 76 : 88) : 0; }
    if (card.drawTeam) { const low = lowHandAllies(team); return low.length ? 74 + low.length * 10 : 24; }
    if (card.discardTarget) { const own = statusHolder(team, actor), t = own || withHand(foes); return t ? (own ? 112 : 82 + (hasDodge(t) && ensureSlash?.() ? 18 : 0)) : 0; }
    if (card.stealCard) { const own = statusHolder(team, actor), t = own || withHand(foes); return t ? (own ? 108 : 78 + keyCount(t) * 5) : 0; }
    if (card.magicBullet) return magicBulletTarget(actor, foes, card) ? 84 : 0;
    if (card.magicDuel) return magicDuelTarget(ctx, foes) ? 76 : 0;
    if (card.duel) return duelTarget(ctx, actor, foes) ? 92 : 0;
    if (card.soulChain) { const slash = ensureSlash?.(true), fresh = aliveFoes.filter(u => !u.soulChain); return aliveFoes.length >= 2 && fresh.length && slash && (actor.intent || 0) >= 1 ? 82 + slashScore(actor, slash, slashTarget(actor, foes, actor.hand || [], true)) / 4 : 0; }
    if (card.borrowSlash) { const partner = borrowPartner(actor, team); return partner && aliveFoes.length ? (partner.hand.some(ctx.singleKill) ? 82 : 48) : 0; }
    if (card.demonInvasion) return aliveFoes.length >= 2 ? 118 : aliveFoes.length ? 72 : 0;
    if (card.comboAttack) { const partner = (comboPartner || otherAlly)(actor, team), t = ctx.targetByPolicy(foes, true); return partner && t ? 64 + Math.min(36, (stat(actor, "attack") + stat(partner, "attack")) * 3) + (hasDodge(t) ? 8 : 0) - (actor.intent > 0 && ensureSlash?.(true) ? 10 : 0) : 0; }
    if (card.charge) { const slash = ensureSlash?.(true); return (actor.intent || 0) >= 1 && slash ? 68 + slashScore(actor, slash, slashTarget(actor, foes, actor.hand || [], true)) / 3 : 0; }
    if (card.drawCards) return 66 + Math.max(0, handLimit(actor) - visible(actor));
    if (card.bloodletting) { const intentCap = Math.min(99, Math.max(1, (actor.stats?.bloodlust || 1) + (actor.intentMaxBonus || 0))), needsIntent = (actor.intent || 0) < intentCap && ((actor.intent || 0) <= 0 || actor.playedSlashThisTurn); return actor.hp > Math.max(1, Math.floor(actor.maxHp * .25)) && needsIntent ? 72 : 0; }
    if (card.armSelf) return (actor.block || 0) < stat(actor, "attack") ? 70 : 24;
    return 0;
  }
  function duelTarget(ctx, actor, foes) { return ctx.topBy(ctx.alive(foes).filter(u => !ctx.hasBasicKill(u) || ctx.hasBasicKill(actor)), u => (ctx.hasBasicKill(u) ? -20 : 20) - ctx.visible(u)); }
  function magicDuelTarget(ctx, foes) { return ctx.topBy(ctx.alive(foes).filter(u => !ctx.hasMagicKill(u)), u => -ctx.visible(u)); }
  function tacticMove(ctx, actor, team, foes, hand, ensureSlash, minScore = 1) {
    const aliveFoes = ctx.alive(foes);
    const best = hand.filter(c => ["tactic", "consume", "obstacle"].includes(c.type)).reduce((r, card) => { const score = tacticScore(ctx, actor, card, team, foes, aliveFoes, ensureSlash); return score > r.score ? { card, score } : r; }, { card: null, score: 0 });
    if (!best.card || best.score < minScore) return null;
    const card = best.card, target = tacticTarget(ctx, actor, card, team, foes);
    if (card.soulChain) { const fresh = aliveFoes.filter(u => !u.soulChain), first = ctx.targetByPolicy(fresh) || fresh[0], list = [first, ...fresh.filter(u => u.uid !== first?.uid)].filter(Boolean).slice(0, 2); card._targetUids = list.map(u => u.uid); return list.length ? { card, target: list[0] } : null; }
    if (card.borrowSlash) { const partner = ctx.borrowPartner(actor, team), t = ctx.targetByPolicy(foes); return partner && t ? { card, target: t, partnerUid: partner.uid } : null; }
    if (card.comboAttack) { const partner = (ctx.comboPartner || ctx.otherAlly)(actor, team), t = ctx.targetByPolicy(foes); return partner && t ? { card, target: t, partnerUid: partner.uid } : null; }
    return target ? { card, target, score: best.score } : null;
  }
  function tacticTarget(ctx, actor, card, team, foes) {
    if (card.heal || card.healPct || card.teamHealPct || card.drawTeam || card.drawCards || card.charge || card.bloodletting || card.armSelf || card.demonInvasion) return (card.heal || card.healPct) ? (ctx.healTarget(team) || actor) : actor;
    if (card.statusKey) return statusTarget(ctx.alive(foes), card);
    if (card.discardTarget || card.stealCard) return statusHolder(team, actor) || ctx.withHand(foes);
    if (card.magicBullet) return ctx.magicBulletTarget(actor, foes, card);
    if (card.magicDuel) return magicDuelTarget(ctx, foes);
    if (card.duel) return duelTarget(ctx, actor, foes);
    return ctx.targetByPolicy(foes) || actor;
  }
  return { tacticMove };
})();
