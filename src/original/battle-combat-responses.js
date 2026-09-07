window.BattleCombatResponses = (api) => {
  const { allUnits, putCard, afterHandLost, damage, statOf, specials, checkDefeat, checkEnd, continueAfterCounter, deps, attackValues, deferDamageTail } = api;
  function resolveHandReveal(state, index = null) {
    const b = state.battle, p = b?.handReveal;
    if (!p) return false;
    const mandatory = ["magicBulletReveal", "borrowSlashChoice", "borrowGainChoice"];
    if (mandatory.includes(p.mode) && index == null) return true;
    const units = b ? allUnits(b) : [], actor = units.find(u => u.uid === p.actorUid), target = units.find(u => u.uid === p.targetUid), source = p.mode === "magicBullet" ? actor : target, cards = p.mode === "magicBulletReveal" ? window.CardUtils.magicBulletCards(source) : (source?.hand || []).filter(c => !c._pendingDraw), shown = index == null ? null : cards[index];
    if (index != null && p.validIndexes && !p.validIndexes.includes(index)) {
      window.BattleLog.add(state, p.mode === "borrowSlashChoice"
        ? "请选择一张单体杀牌。" : p.mode === "borrowGainChoice"
          ? "请选择一张可获得的手牌。" : "请选择一张与展示牌相同花色的手牌弃置。");
      return true;
    }
    if (p.mode === "borrowSlashChoice") {
      const attackTarget = units.find(unit =>
        unit.uid === p.attackTargetUid && unit.hp > 0 && unit.side !== target?.side);
      if (!actor || !target || !shown
        || !attackTarget || !window.CardUtils.isSingleKillCard(shown)) return true;
    }
    if (p.mode === "borrowGainChoice"
      && (!actor || !target || !shown
        || window.BattleStatusCards?.canReceive?.(actor, shown) === false)) return true;
    if (p.mode === "magicBulletReveal"
      && !window.CardUtils.canMagicBulletDisplay(shown)) return true;
    b.handReveal = null; b.locked = false;
    if (p.mode === "droneExtract") { window.OrcDungeonSkills?.resolveDroneExtract?.(state, actor, target, p, shown); checkDefeat(state); checkEnd(state); return true; }
    if (!actor || !target || p.mode === "view" || index == null) return true;
    if (!shown) { window.BattleLog.add(state, `${target.name}没有可选择的手牌。`); return true; }
    let resolved = false;
    let repeatTarget = target;
    if (p.mode === "discard") {
      target.hand.splice(target.hand.indexOf(shown), 1);
      const status = window.BattleStatusCards?.isStatus?.(shown);
      putCard(state, target, shown, status ? "consumed" : "discard",
        { forcedDiscard: true }); resolved = true;
      window.BattleLog.add(state, `${actor.name} 使用${p.cardName}，${status ? "移除并消耗" : "弃置"}${target.name}一张${shown.suit || ""}${shown.name}。`);
    } else if (p.mode === "steal") {
      target.hand.splice(target.hand.indexOf(shown), 1);
      if (window.BattleStatusCards?.isStatus?.(shown)) {
        putCard(state, target, shown, "consumed", { forcedDiscard: true });
        window.BattleLog.add(state,
          `${actor.name} 使用${p.cardName}，偷走并消耗${target.name}的${shown.name}状态牌。`);
      } else {
        shown.stolenFromUid = target.uid; if (b.animQueue) shown._pendingDraw = true; actor.hand.push(shown); window.BattleCards?.syncStatusCards?.(actor);
        b.animQueue?.push({ type: "stealCard", fromUid: target.uid, fromSide: target.side, toUid: actor.uid, toSide: actor.side, count: 1, cards: [shown] }); afterHandLost(state, target);
        window.BattleLog.add(state, `${actor.name} 使用${p.cardName}，获得${target.name}一张${shown.suit || ""}${shown.name}。`);
      }
      resolved = true;
    } else if (p.mode === "borrowSlashChoice") {
      const attackTarget = units.find(unit =>
        unit.uid === p.attackTargetUid && unit.hp > 0 && unit.side !== target.side);
      shown.noIntentCost = true; shown.skipAfterCardPlayed = true;
      shown._skipUseKillTriggers = true; repeatTarget = attackTarget;
      window.BattleLog.add(state,
        `${actor.name} 使用借刀杀人，令${target.name}对${attackTarget.name}使用${shown.suit || ""}${shown.name}（不触发“使用杀”技能）。`);
      deps.useCard(state, target, attackTarget, shown); resolved = true;
    } else if (p.mode === "borrowGainChoice") {
      target.hand.splice(target.hand.indexOf(shown), 1);
      if (b.animQueue) shown._pendingDraw = true;
      actor.hand.push(shown); window.BattleCards?.syncStatusCards?.(actor);
      afterHandLost(state, target);
      b.animQueue?.push({ type: "stealCard", fromUid: target.uid, fromSide: target.side, toUid: actor.uid, toSide: actor.side, count: 1, cards: [shown] });
      window.BattleLog.add(state,
        `${actor.name} 使用借刀杀人，${target.name}没有单体杀牌，获得其${shown.suit || ""}${shown.name}。`);
      resolved = true;
    } else if (p.mode === "magicBullet") {
      const i = actor.hand.indexOf(shown), [cost] = i >= 0 ? actor.hand.splice(i, 1) : [];
      if (cost) { const damageCard = { ...p.card, ignoreResponse: true }; putCard(state, actor, cost, "discard", { showDiscard: true }); damage(state, target, statOf(actor, "magic"), p.cardName, actor, damageCard); p.card.totalHpLoss = (p.card.totalHpLoss || 0) + (damageCard.totalHpLoss || 0); resolved = true; window.BattleLog.add(state, `${target.name} 随机展示${p.shownSuit || ""}${p.shownCard?.name || "手牌"}，${actor.name}弃置${cost.suit}${cost.name}发动魔弹特攻。`); }
    } else if (p.mode === "magicBulletReveal") {
      const costIndex = actor.hand.findIndex(c => c !== p.card && c.suit === shown.suit && !c._pendingDraw), cost = costIndex >= 0 ? actor.hand.splice(costIndex, 1)[0] : null;
      b.animQueue?.push({ type: "revealCards", id: window.GameRandom.id("mb"), title: "魔弹特攻", cards: [{ ...shown }] });
      if (cost) { const damageCard = { ...p.card, ignoreResponse: true }; putCard(state, actor, cost, "discard", { showDiscard: true }); damage(state, target, statOf(actor, "magic"), p.cardName, actor, damageCard); p.card.totalHpLoss = (p.card.totalHpLoss || 0) + (damageCard.totalHpLoss || 0); resolved = true; window.BattleLog.add(state, `${target.name} 展示${shown.suit}${shown.name}，${actor.name}弃置${cost.suit}${cost.name}发动魔弹特攻。`); }
      else window.BattleLog.add(state, `${target.name} 展示${shown.suit}${shown.name}，但${actor.name}没有同花色牌可弃置，魔弹特攻无效。`);
    }
    window.OrcDungeonSkills?.afterMagicMissile?.(state, actor, target, p.card);
    if (resolved && p.repeatAfter) {
      b.comboPartnerUid = target.uid;
      specials.repeatTactic(state, actor, repeatTarget, p.card);
      b.comboPartnerUid = null;
    }
    checkDefeat(state); checkEnd(state); return true;
  }
  function continueAfterCadicisResponsibility(state) {
    const b = state.battle, p = b?.cadicisResponsibilityResume;
    if (!p || b.locked) return false;
    const actor = allUnits(b).find(u => u.uid === p.actorUid), target = allUnits(b).find(u => u.uid === p.targetUid);
    b.cadicisResponsibilityResume = null;
    if (!actor || !target || actor.hp <= 0 || target.hp <= 0) return true;
    b.comboPartnerUid = p.comboPartnerUid || null;
    const card = p.card;
    if (!deps.isKillCard(card)) window.EdisSkills?.copyEarlySingleTarget?.(state, actor, target, card);
    const clashOk = card.clash ? specials.resolveClash(state, actor, target) : true; if (checkDefeat(state) || b.locked) return true;
    if (clashOk && card.charm) window.BattleStatus?.mark(target, "魅惑"); if (checkDefeat(state) || b.locked) return true;
    if (clashOk && card.block) { actor.block += card.block; pushFloat(b, actor.uid, "armor-gain", card.block); }
    const base = attackValues.cardPower(card);
    const attacks = deps.isKillCard(card) || base > 0;
    let amount = attackValues.attackAmount(state, actor, card, base, clashOk);
    amount = attackValues.modifyAttackAmount(state, actor, target, card, amount);
    attackValues.applyAttackRelics(state, actor, target, card);
    let hit = false;
    if (attacks && card.sweep) { specials.sweepDamage(state, actor, amount, card, unit => attackValues.slashTargetAmount(state, actor, unit, card, amount)); hit = (card.totalHpLoss || 0) > 0; }
    else if (attacks) { window.EdisSkills?.copyTargetedCard?.(state, actor, target, card); hit = attackValues.hitTarget(state, actor, target, card, attackValues.slashTargetAmount(state, actor, target, card, amount)); }
    if (deferDamageTail?.(state, actor, target, card, hit)) return true;
    specials.healBySyringe(state, actor, card); specials.resolveGreenGatling(state, actor, target, card); specials.resumeComboAttack?.(state); checkDefeat(state); b.comboPartnerUid = null; return true;
  }
  function resolveManualCounter(state, useCounter, index = 0) {
    const b = state.battle, p = b?.manualCounter;
    if (!p) return false;
    const actor = allUnits(b).find(u => u.uid === p.actorUid), target = allUnits(b).find(u => u.uid === p.targetUid), counterable = window.CardUtils.isCounterableTactic(p.card), backflips = counterable ? (window.SakuraRisaSkills?.backflipCandidates?.(b.allies, actor, target, p.card) || []).map(choice => ({ ...choice, responseKind: "backflip" })) : [], counters = counterable ? [...backflips, ...b.allies.flatMap(u => u.hp > 0 ? u.hand.filter(c => (c.counterTactic || window.WithererSkills?.canCounterTacticCard?.(u, c) || window.GuardKellySkills?.canCounterTacticCard?.(u, c)) && !c._pendingDraw).map(c => ({ unit: u, card: c, responseKind: "counter" })) : [])] : [];
    b.manualCounter = null; b.pendingTargetUid = null; b.locked = false;
    if (!actor) { b.comboPartnerUid = null; return true; }
    const picked = counters[Math.max(0, Math.min(index || 0, counters.length - 1))];
    if (useCounter && picked) {
      if (picked.responseKind === "backflip") {
        const cancelled = window.SakuraRisaSkills?.resolveBackflip?.(state, picked.unit, actor, target, p.card, picked.card, { ...deps, useCard: deps.useCard });
        window.ElranaAceNanaliSkills?.afterResponse?.(state, picked.unit, actor, { damage });
        if (cancelled !== false) { b.comboPartnerUid = null; return true; }
        b.comboPartnerUid = p.comboPartnerUid || null;
        const nextTarget = allUnits(b).find(unit => p.card._targetUids?.includes(unit.uid) && unit.hp > 0);
        if (specials.counterTactic(state, actor, nextTarget, p.card)) return true;
        continueAfterCounter(state, actor, nextTarget, p.card); b.comboPartnerUid = null; checkDefeat(state); checkEnd(state); return true;
      }
      const visualHandBefore = window.BattleCards.visibleHandCount(picked.unit);
      picked.unit.hand.splice(picked.unit.hand.indexOf(picked.card), 1); window.BattleCards?.put(b, picked.unit, picked.card, "discard", { skipAnim: true });
      const witherer = window.WithererSkills?.responseCard?.(picked.unit, picked.card, "看破") || picked.card;
      const response = window.GuardKellySkills?.responseCard?.(picked.unit, witherer, "看破") || witherer;
      window.BattleCards?.queueResponse?.(b, picked.unit,
        { type: "response", id: `ct${deps.nextAnim()}`, uid: picked.unit.uid, side: picked.unit.side, card: response },
        visualHandBefore);
      window.NonokaLokiSkills?.afterCardResponded?.(state, picked.unit, actor, response, deps);
      window.BattleLog.add(state, `${picked.unit.name} 使用看破，使${actor.name}的${p.card.name}失效。`);
      if (picked.unit.ai === "guard_kelly") window.BattleLines?.skill(state, picked.unit, "突破重围", actor);
      if (target?.uid === picked.unit.uid) window.ElranaAceNanaliSkills?.afterResponse?.(state, picked.unit, actor, { damage });
      b.comboPartnerUid = null;
      return true;
    }
    window.BattleLog.add(state, `没有使用看破，${actor.name}的${p.card.name}继续生效。`);
    b.comboPartnerUid = p.comboPartnerUid || null;
    continueAfterCounter(state, actor, target, p.card);
    b.comboPartnerUid = null;
    checkDefeat(state); checkEnd(state);
    return true;
  }
  return { resolveHandReveal, continueAfterCadicisResponsibility, resolveManualCounter };
};
