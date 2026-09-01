window.BondiSkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const singleSlash = card => window.CardUtils?.isSingleKill?.(card);
  const sameSide = (battle, unit) => unit.side === "enemy" ? battle.enemies : battle.allies;
  const foesOf = (battle, unit) => unit.side === "enemy" ? battle.allies : battle.enemies;
  const hasRelic = (state, unit, name) => window.RelicSystem?.hasEquipped?.(state, unit, name);

  function discardRandom(state, unit) {
    const cards = visible(unit);
    if (!cards.length) return null;
    const card = window.GameRandom.sample(cards, state);
    unit.hand.splice(unit.hand.indexOf(card), 1);
    window.BattleCards?.put(state.battle, unit, card, "discard", { forcedDiscard: true });
    return card;
  }

  function beforeKillTargeted(state, actor, target, card) {
    if (!state.battle || !actor || !target || !isSlash(card)) return;
    if (singleSlash(card) && target.side !== actor.side) triggerFeint(state, actor, target, card);
    if (target.side !== actor.side || card.sweep || card.targetless || card.allTargets) triggerRoar(state, actor, card);
  }

  function triggerRoar(state, actor, card) {
    if (actor.ai !== "orc_king_bondi" || card._bondiRoarApplied) return;
    const hand = visible(actor);
    const slashCount = hand.filter(isSlash).length + (actor.hand.includes(card) ? 0 : 1);
    const otherCount = hand.filter(item => !isSlash(item)).length;
    if (slashCount <= otherCount) return;
    card._bondiRoarApplied = true;
    const discarded = foesOf(state.battle, actor).filter(unit => unit.hp > 0).map(unit => [unit, discardRandom(state, unit)]).filter(([, item]) => item);
    window.BattleLines?.skill(state, actor, "兽王之吼", discarded[0]?.[0]);
    window.BattleLog.add(state, `${actor.name} 触发兽王之吼，令所有敌方角色各弃置一张牌。`);
  }

  function triggerFeint(state, actor, target, card) {
    if (card._feintTriggered || !visible(target).length) return;
    const holder = sameSide(state.battle, actor).find(unit => unit.uid !== actor.uid && unit.hp > 0 && visible(unit).some(item => item.feint || window.GuardKellySkills?.canFeintCard?.(unit, item)));
    if (!holder) return;
    const feint = visible(holder).find(item => item.feint || window.GuardKellySkills?.canFeintCard?.(holder, item));
    const visualHandBefore = window.BattleCards.visibleHandCount(holder);
    holder.hand.splice(holder.hand.indexOf(feint), 1);
    window.BattleCards?.put(state.battle, holder, feint, "discard", { skipAnim: true });
    const response = window.GuardKellySkills?.responseCard?.(holder, feint, "佯攻") || feint;
    window.BattleCards?.queueResponse?.(state.battle, holder,
      { type: "response", id: window.GameRandom.id("feint"), uid: holder.uid, side: holder.side, card: response },
      visualHandBefore);
    window.NonokaLokiSkills?.afterCardResponded?.(state, holder, actor, response, window.BattleSystem);
    const discarded = discardRandom(state, target);
    card._feintTriggered = true;
    if (holder.ai === "guard_kelly") window.BattleLines?.skill(state, holder, "突破重围", target);
    window.BattleLog.add(state, `${holder.name} 打出佯攻，优先弃置${target.name}的${discarded?.name || "一张牌"}。`);
  }

  function cancelKillCard(state, target, card) {
    return singleSlash(card) && invalidateKillCard(state, target, card);
  }

  function invalidateKillCard(state, target, card) {
    if (!target || !isSlash(card) || !hasRelic(state, target, "黑曜石铠甲")) return false;
    if (!card._obsidianLogged) window.BattleLog.add(state, `${target.name} 的黑曜石铠甲令${card.name}无效。`);
    card._obsidianLogged = true;
    return true;
  }

  function afterDamage(state, actor, target, card, hpLoss) {
    const sourceCard = card?._entitySourceCard || card;
    if (!hpLoss || target?.ai !== "orc_king_bondi" || !actor || !card || card.virtual && !card._entitySourceCard || sourceCard?._skill || sourceCard?.type === "consume" || sourceCard?.void || sourceCard?.copiedByEdis || sourceCard?._bondiClaimed) return;
    const units = state.battle.allies.concat(state.battle.enemies);
    const owner = sourceCard.stolenFromUid && units.find(unit => unit.uid === sourceCard.stolenFromUid);
    const ordered = [owner, actor, ...units].filter(Boolean).map(unit => unit.pileStats || unit);
    const piles = [...new Set(ordered)];
    let pile = piles.find(item => (item.discard || []).includes(sourceCard));
    let entity = sourceCard;
    if (!pile) {
      pile = piles.find(item => {
        entity = [...(item.discard || [])].reverse().find(candidate => sameEntity(candidate, sourceCard));
        return !!entity;
      });
    }
    const index = pile ? pile.discard.indexOf(entity) : -1;
    if (index < 0) return;
    pile.discard.splice(index, 1);
    entity._bondiClaimed = true;
    entity.bondiRevenge = true;
    entity.stolenFromUid = sourceUserUid(units, actor, sourceCard);
    if (state.battle.animQueue) entity._pendingDraw = true;
    target.hand.push(entity);
    state.battle.animQueue?.push({ type: "gainCards", fromZone: "public", uid: target.uid, side: target.side, count: 1, cards: [entity] });
    window.BattleLines?.skill(state, target, "以牙还牙", actor);
    window.BattleLog.add(state, `${target.name} 发动以牙还牙，获得${actor.name}造成伤害的${entity.name}；此牌下次造成伤害翻倍。`);
  }

  function sameEntity(candidate, card) {
    return candidate && candidate.name === card.name && candidate.type === card.type && (candidate.suit || "") === (card.suit || "") && candidate.type !== "consume" && !candidate.void && !candidate.copiedByEdis;
  }

  function sourceUserUid(units, actor, card) {
    return units.find(unit => unit.name === card._playedByName)?.uid || card.duelUserUid || actor.uid;
  }

  function modifyOutgoingDamage(state, actor, amount, card) {
    let result = amount;
    if (card?.bondiRevenge) {
      result *= 2;
      if (!card._bondiDoubleLogged) window.BattleLog.add(state, `${actor.name} 以牙还牙获得的${card.name}伤害翻倍。`);
      card._bondiDoubleLogged = true;
    }
    if (isSlash(card) && ["♠", "♣"].includes(card?.suit) && hasRelic(state, actor, "影王斧")) {
      result *= 2;
      if (!card._shadowAxeLogged) window.BattleLog.add(state, `${actor.name} 的影王斧触发，黑色杀牌伤害翻倍。`);
      card._shadowAxeLogged = true;
    }
    return result;
  }

  function modifyIncomingDamage(state, target, amount, card) {
    if (!hasRelic(state, target, "黑曜石铠甲")) return amount;
    if (isSlash(card)) {
      invalidateKillCard(state, target, card);
      return 0;
    }
    if (card?.type === "tactic") {
      if (!card._obsidianLogged) window.BattleLog.add(state, `${target.name} 的黑曜石铠甲令战术牌伤害翻倍。`);
      card._obsidianLogged = true;
      return amount * 2;
    }
    return amount;
  }

  function aiMove(state, actor, team, foes, hand, canPlay, ctx) {
    if (actor.ai !== "orc_king_bondi") return null;
    const revenge = hand.find(item => item.bondiRevenge && canPlay(actor, item));
    if (revenge) {
      const target = revenge.targetless && !revenge.allyTarget ? actor : revenge.magicBullet ? ctx.magicBulletTarget(actor, foes, revenge) : ctx.targetByPolicy(foes);
      if (target) return { card: revenge, target };
    }
    const slashes = hand.filter(item => isSlash(item) && canPlay(actor, item));
    const charge = hand.find(item => item.charge && canPlay(actor, item));
    if (charge && slashes.length) return { card: charge, target: actor };
    const target = ctx.slashTarget(actor, foes, slashes);
    const slash = target && ctx.topBy(slashes, item => ctx.slashScore(actor, item, target));
    return slash ? { card: slash, target } : null;
  }

  return { beforeKillTargeted, cancelKillCard, invalidateKillCard, afterDamage, modifyOutgoingDamage, modifyIncomingDamage, aiMove };
})();
