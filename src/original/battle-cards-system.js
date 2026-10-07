window.BattleCards = window.BattleCards || (() => {
  let moveSequence = 0;
  const moveId = card => card?._cardResolutionId
    || `move-${Date.now()}-${++moveSequence}`;
  function syncStatusCards(unit) {
    if (!unit) return;
    if (window.BattleStatusCards?.sync) {
      window.BattleStatusCards.sync(unit);
      return;
    }
    const hasStun = (unit.hand || []).some(c => c.stun);
    unit.statuses = (unit.statuses || []).filter(s => s !== "眩晕");
    if (hasStun) unit.statuses.push("眩晕");
  }
  function afterHandLost(_battle, unit) { syncStatusCards(unit); }
  function countsForHand(unit, card) {
    return !!card && !card._pendingDraw
      && (window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true);
  }
  function visibleHandCount(unit) {
    return (unit?.hand || []).filter(card => countsForHand(unit, card)).length;
  }
  function queueResponse(b, holder, event, visualHandBefore = visibleHandCount(holder),
    visualHandAfter = visibleHandCount(holder)) {
    if (!b?.animQueue || !event) return null;
    if (visualHandBefore !== visualHandAfter) {
      if (holder && holder.visualHandCount == null) {
        holder.visualHandCount = visualHandBefore;
      }
      Object.assign(event, {
        visualHandBefore,
        visualHandCount: visualHandAfter,
        visualHandDelta: visualHandAfter - visualHandBefore,
      });
    }
    b.animQueue.push(event);
    return event;
  }
  function trailDestination(holder, pile, destination) {
    return {
      _destinationPile: pile,
      _destinationSide: destination?.side || holder?.side || "ally",
    };
  }
  function showForcedDiscard(b, holder, card, pile = "discard", destination = holder, trailId = "") {
    if (!b || !card) return;
    const snapshot = { ...(window.CardUtils?.clean?.(card) || card), dismantled: true, _playedByName: holder?.name || "", _playedAction: "被弃置", ...trailDestination(holder, pile, destination) };
    if (trailId) snapshot._cardAnimationId = trailId;
    b.played = [snapshot, ...(b.played || [])];
  }
  function showDiscard(b, holder, card, pile = "discard", destination = holder, trailId = "") {
    if (!b || !card) return;
    const snapshot = { ...(window.CardUtils?.clean?.(card) || card), _playedByName: holder?.name || "", _playedAction: "弃置了", ...trailDestination(holder, pile, destination) };
    if (trailId) snapshot._cardAnimationId = trailId;
    delete snapshot.dismantled;
    b.played = [snapshot, ...(b.played || [])];
  }
  // 弃牌动画去重：逐张 put() 会为每张牌推一条 discardBatch，队列是串行的，
  // 于是"弃 8 张"要连播 8 段飞行（实测 4565ms，随张数线性变长）。
  // 这里把紧邻的、同一名角色、同一去向的弃牌并进队尾那条事件，
  // 使整批只用一段飞行（实测 475ms）。去向不同则不合并，避免
  // 明弃（toPublic）与暗弃混在一起导致展示错乱。
  function pushDiscardBatch(b, holder, cards, toPublic) {
    const queue = b.animQueue;
    const last = queue[queue.length - 1];
    if (last && last.type === "discardBatch" && last.uid === holder?.uid
      && last.side === holder?.side && !!last.toPublic === !!toPublic) {
      last.count = (last.count || 0) + cards.length;
      last.cards = (last.cards || []).concat(cards);
      return;
    }
    queue.push({
      type: "discardBatch", uid: holder?.uid, side: holder?.side,
      count: cards.length, cards, toPublic: !!toPublic,
    });
  }
  function put(b, holder, card, pile = "discard", opts = {}) {
    if (pile === "discard" && (card?.void || card?.copiedByEdis)) pile = "consumed";
    const owner = card?.stolenFromUid && b?.allies.concat(b.enemies).find(u => u.uid === card.stolenFromUid), dest = owner || holder, zone = dest?.pileStats || dest;
    if (!zone || !card) return;
    const trailId = opts.showDiscard || opts.forcedDiscard
      || pile === "consumed" && card._playedFlightDone ? moveId(card) : "";
    if (!opts.skipAnim && pile === "discard" && b?.animQueue) pushDiscardBatch(
      b, holder, [card], !!(opts.showDiscard || opts.forcedDiscard));
    if (!opts.skipAnim && pile === "consumed" && b?.animQueue) b.animQueue.push({
      type: "burnCard", card, uid: holder?.uid, side: holder?.side,
      fromPublic: !!card._playedFlightDone, trailId,
    });
    if (opts.forcedDiscard) showForcedDiscard(b, holder, card, pile, dest, trailId);
    else if (opts.showDiscard) showDiscard(b, holder, card, pile, dest, trailId);
    // 入堆存还原后的副本，原对象保持转换态：
    // 弃牌堆/消耗区得到原牌（洗牌后牌库不会被凭空换成刺杀），
    // 而出牌区在动画阶段引用的是原对象，玩家看到的仍是打出的【刺杀】。
    (zone[pile] ||= []).push(window.CardUtils?.revertConvertedCopy?.(card) ?? card);
    if (!opts.skipAfterHandLost) afterHandLost(b, holder);
  }
  function putMany(b, holder, cards, pile = "discard", opts = {}) {
    const list = (cards || []).filter(Boolean);
    // 返回已处理张数（真值）：调用方若写 `putMany(...) || 逐张 put(...)`，
    // undefined 会让兜底分支再跑一遍，导致弃置的牌被重复入弃牌堆、
    // 出牌区重复显示（坦克炮弹弃2张杀曾显示4张）。
    if (!list.length) return 0;
    const discardCards = pile === "discard"
      ? list.filter(card => !card.void && !card.copiedByEdis) : list;
    if (!opts.skipAnim && pile === "discard" && discardCards.length && b?.animQueue) pushDiscardBatch(
      b, holder, discardCards, !!(opts.showDiscard || opts.forcedDiscard));
    list.forEach(card => {
      const redirected = pile === "discard" && (card.void || card.copiedByEdis);
      put(b, holder, card, pile, {
        ...opts,
        skipAnim: opts.skipAnim || pile === "discard" && !redirected,
        skipAfterHandLost: true,
      });
    });
    if (!opts.skipAfterHandLost) afterHandLost(b, holder);
    return list.length;
  }
  return {
    afterHandLost, countsForHand, visibleHandCount, queueResponse, syncStatusCards,
    showDiscard, showForcedDiscard, put, putMany,
  };
})();
