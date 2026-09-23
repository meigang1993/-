window.EdisSkills = (() => {
  const isSlash = c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "");
  const visible = u => (u.hand || []).filter(c => !c._pendingDraw).length;
  const handLimit = u => u.stats?.handLimit || 5;
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const cleanCopy = c => window.CardUtils.copyPlayable(c, { copiedByEdis: true, temporary: true, void: true, generatedBySkill: "拷贝魔眼" });
  const virtualSlash = c => window.CardUtils.copyPlayable(c, { virtual: true, edisChain: false, _edisVirtualSlash: true, ignoreBlock: c.ignoreBlock });
  const damageAction = (actor, target, amount, source, card) => window.BattleReactionQueue?.damageAction?.(actor, target, amount, source, card)
    || { kind: "damage", actorUid: actor?.uid, targetUid: target?.uid, amount, source, card };
  function rememberPrePlayHand(actor, card) {
    if (actor?.ai === "pursuer_edis" && window.CardUtils.isEntitySingleKill(card)) card._edisPrePlayHand = visible(actor);
  }
  function beforeSlash(state, actor, target, card) {
    if (actor.ai !== "pursuer_edis" || !window.CardUtils.isEntitySingleKill(card) || card.edisChain) return;
    card.edisChain = true;
    card._edisPrePlayHand ??= visible(actor);
  }
  function afterDamage(state, actor, target, card, hpLoss, damage) {
    const hit = hpLoss && card?.edisChain && !card?._edisSwordExtra;
    const actions = [
      ...chainActions(state, actor, target, card, hit),
      ...repeatActions(state, actor, target, card, hit),
      ...soulChainActions(state, actor, target, card, hpLoss),
    ];
    if (!actions.length || !damage) return;
    if (window.BattleReactionQueue?.enqueue?.(state, actions)) return;
    actions.forEach(action => runDamageAction(state, action, damage));
  }
  const groupTargeted = card => card?.sweep || card?.targetless || card?.allTargets || card?.aoeLineShown;
  function canCopyTarget(target, card) {
    return target?.ai === "pursuer_edis" && target.hp > 0 && card && !card.virtual && !card._skill && card.type !== "skill";
  }
  function queueTargetCopy(state, actor, target, card) {
    if (!canCopyTarget(target, card)) return false;
    const queue = state.battle.edisCopyQueue ||= [];
    if (queue.some(job => job.targetUid === target.uid && job.sourceCard === card)) return false;
    queue.push({ targetUid: target.uid, actorUid: actor?.uid, sourceCard: card, card: cleanCopy(card) });
    return true;
  }
  function copyTargetedCard(state, actor, target, card) {
    if (groupTargeted(card)) return;
    if (queueTargetCopy(state, actor, target, card)) flushCopies(state);
  }
  function copyEarlySingleTarget(state, actor, target, card) {
    if (card?.soulChain || card?.demonInvasion) return;
    copyTargetedCard(state, actor, target, card);
  }
  function copyTargetedCards(state, actor, targets, card) {
    let queued = false;
    (targets || []).forEach(target => { queued = queueTargetCopy(state, actor, target, card) || queued; });
    if (queued) flushCopies(state);
  }
  function flushCopies(state) {
    const b = state.battle, queue = b?.edisCopyQueue || [];
    if (!queue.length) return;
    b.edisCopyQueue = [];
    queue.forEach(job => {
      const units = b.allies.concat(b.enemies), target = units.find(u => u.uid === job.targetUid), actor = units.find(u => u.uid === job.actorUid);
      if (!target || target.hp <= 0) return;
      const before = visible(target);
      if (b.animQueue) job.card._pendingDraw = true;
      target.hand.push(job.card);
      b.animQueue?.push({ type: "gainCards", uid: target.uid, side: target.side, fromUid: actor?.uid, count: 1, cards: [job.card] });
      window.BattleLines?.skill(state, target, "拷贝魔眼", actor);
      window.BattleLog.add(state, `${target.name} 的拷贝魔眼复制了${job.card.name}（手牌${before}→${before + 1}）。`);
    });
  }
  function repeatActions(state, actor, target, card, hpLoss) {
    if (actor?.ai !== "pursuer_edis" || card?.virtual || !hpLoss || !card?.edisChain || card._edisRepeating) return [];
    const extra = Math.max(0, (card._edisPrePlayHand ?? visible(actor)) - handLimit(actor));
    if (!extra || target.hp <= 0) return [];
    const amount = stat(actor, card.scale === "magic" ? "magic" : "attack");
    return Array.from({ length: extra }, (_, index) => {
      const repeatCard = { ...card, _edisHit: new Set(), _edisResolving: false, _edisRepeating: true, _extraSlashResolution: true };
      return {
        ...damageAction(actor, target, amount, card.name, repeatCard),
        skillName: index === 0 ? "狂暴链锯" : null,
        logText: index === 0 ? `${actor.name} 的狂暴链锯因手牌超上限，本次【${card.name}】对${target.name}额外结算${extra}次。` : null,
      };
    });
  }
  function chainActions(state, actor, target, card, hpLoss) {
    if (actor?.ai !== "pursuer_edis" || card?.virtual || !hpLoss || !card?.edisChain || card._edisResolving) return [];
    const hit = card._edisHit ||= new Set(); hit.add(target.uid);
    const amount = stat(actor, card.scale === "magic" ? "magic" : "attack"),
      chainCard = virtualSlash(card);
    return (actor.side === "enemy" ? state.battle.allies : state.battle.enemies).filter(unit => unit.hp > 0 && !hit.has(unit.uid)).map(next => {
      hit.add(next.uid);
      return {
        ...damageAction(actor, next, amount, "狂暴链锯", { ...chainCard }),
        logText: `${actor.name} 的狂暴链锯追加虚拟杀追击${next.name}。`,
      };
    });
  }
  function soulChainActions(state, actor, target, card, hpLoss) {
    if (!hpLoss || !isSlash(card) || card._soulChain || !target.soulChain) return [];
    const others = (target.side === "enemy" ? state.battle.enemies : state.battle.allies).filter(u => u.hp > 0 && u.uid !== target.uid && u.soulChain);
    const text = others.length ? `${target.name} 的锁魂将伤害传导给${others.map(u => u.name).join("、")}。` : null;
    const damageTypes = window.BattleDamageAttributes?.resolve?.(
      card, card.name || "", actor) || ["physical"];
    const attackType = window.BattleDamageAttributes?.attackType?.(
      card, card.name || "", actor) || "physical";
    return others.map((other, index) => ({
      ...damageAction(actor, other, hpLoss, "灵魂锁链", {
        name: "灵魂锁链", type: "skill", ignoreResponse: true,
        _soulChain: true,
        damageTypes, attackType, magicDamage: attackType === "magic",
        poison: damageTypes.includes("poison"),
        shock: damageTypes.includes("thunder"),
        fire: damageTypes.includes("fire"),
        holy: damageTypes.includes("holy"),
        dark: damageTypes.includes("dark"),
        ice: damageTypes.includes("ice"),
      }),
      logText: index === 0 ? text : null,
    }));
  }
  function runDamageAction(state, action, damage) {
    const units = state.battle.allies.concat(state.battle.enemies), actor = units.find(unit => unit.uid === action.actorUid), target = units.find(unit => unit.uid === action.targetUid);
    if (!actor || !target || target.hp <= 0) return;
    if (action.skillName) window.BattleLines?.skill(state, actor, action.skillName, target);
    if (action.logText) window.BattleLog.add(state, action.logText);
    damage(state, target, action.amount, action.source, actor, action.card);
  }
  function beforeHeal(state, target, amount, actor, card, damage) {
    const edis = state.battle?.enemies?.find(e => e.ai === "pursuer_edis" && e.hp > 0);
    if (!edis || target.side !== "ally") return null;
    const groupHeal = card?.teamHealPct || card?._groupHeal;
    if (groupHeal && card._edisDarkDone) return card._edisDarkBlocked?.has(target.uid) ? null : 0;
    window.BattleLines?.skill(state, edis, "无限暗刃", target);
    const targets = state.battle.allies.filter(u => u.hp > 0);
    const sweep = CardUtils.fromEntity("机枪扫杀", { allTargets: targets.map(u => u.uid), aoeLineShown: true, responseKind: "dodge" });
    state.battle.edisDarkSeq = (state.battle.edisDarkSeq || 0) + 1;
    state.battle.animQueue?.push({ type: "virtualPlay", id: `dark${state.battle.edisDarkSeq}`, uid: edis.uid, targetUids: sweep.allTargets, card: sweep, enemyLine: edis.side === "enemy", show: true });
    const blockedSet = new Set();
    const damageAmount = stat(edis, "attack");
    for (let i = 0; i < targets.length; i++) {
      const unit = targets[i];
      if (damage?.(state, unit, damageAmount, "无限暗刃", edis, sweep)?.dodged) blockedSet.add(unit.uid);
      if (!state.battle?.locked) continue;
      const remaining = targets.slice(i + 1).map(next => ({
        kind: "damage", actorUid: edis.uid, targetUid: next.uid,
        amount: damageAmount, source: "无限暗刃", card: { ...sweep },
        edisGroupHealCard: groupHeal ? card : null,
      }));
      window.BattleReactionQueue?.enqueue?.(state, remaining);
      break;
    }
    if (groupHeal) { card._edisDarkDone = true; card._edisDarkBlocked = blockedSet; }
    if (blockedSet.has(target.uid)) { window.BattleLog.add(state, `${target.name} 闪避无限暗刃，恢复没有被压制。`); return null; }
    window.BattleLog.add(state, `${edis.name} 发动无限暗刃，压制${target.name}的恢复。`);
    return 0;
  }
  function onTurnEnd(state, unit) {
    if (unit.soulChain) unit.soulChain -= 1;
    if (unit.soulChain <= 0) { delete unit.soulChain; unit.statuses = (unit.statuses || []).filter(s => s !== "锁魂"); }
  }
  return { rememberPrePlayHand, beforeSlash, copyEarlySingleTarget, copyTargetedCard, copyTargetedCards, flushCopies, afterDamage, beforeHeal, onTurnEnd };
})();
