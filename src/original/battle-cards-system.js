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
  function put(b, holder, card, pile = "discard", opts = {}) {
    if (pile === "discard" && (card?.void || card?.copiedByEdis)) pile = "consumed";
    const owner = card?.stolenFromUid && b?.allies.concat(b.enemies).find(u => u.uid === card.stolenFromUid), dest = owner || holder, zone = dest?.pileStats || dest;
    if (!zone || !card) return;
    const trailId = opts.showDiscard || opts.forcedDiscard
      || pile === "consumed" && card._playedFlightDone ? moveId(card) : "";
    if (!opts.skipAnim && pile === "discard" && b?.animQueue) b.animQueue.push({
      type: "discardBatch", uid: holder?.uid, side: holder?.side,
      count: 1, cards: [card],
      toPublic: !!(opts.showDiscard || opts.forcedDiscard),
    });
    if (!opts.skipAnim && pile === "consumed" && b?.animQueue) b.animQueue.push({
      type: "burnCard", card, uid: holder?.uid, side: holder?.side,
      fromPublic: !!card._playedFlightDone, trailId,
    });
    if (opts.forcedDiscard) showForcedDiscard(b, holder, card, pile, dest, trailId);
    else if (opts.showDiscard) showDiscard(b, holder, card, pile, dest, trailId);
    (zone[pile] ||= []).push(card);
    if (!opts.skipAfterHandLost) afterHandLost(b, holder);
  }
  function putMany(b, holder, cards, pile = "discard", opts = {}) {
    const list = (cards || []).filter(Boolean);
    if (!list.length) return;
    const discardCards = pile === "discard"
      ? list.filter(card => !card.void && !card.copiedByEdis) : list;
    if (!opts.skipAnim && pile === "discard" && discardCards.length && b?.animQueue) b.animQueue.push({
      type: "discardBatch", uid: holder?.uid, side: holder?.side,
      count: discardCards.length, cards: discardCards,
      toPublic: !!(opts.showDiscard || opts.forcedDiscard),
    });
    list.forEach(card => {
      const redirected = pile === "discard" && (card.void || card.copiedByEdis);
      put(b, holder, card, pile, {
        ...opts,
        skipAnim: opts.skipAnim || pile === "discard" && !redirected,
        skipAfterHandLost: true,
      });
    });
    if (!opts.skipAfterHandLost) afterHandLost(b, holder);
  }
  return {
    afterHandLost, countsForHand, visibleHandCount, queueResponse, syncStatusCards,
    showDiscard, showForcedDiscard, put, putMany,
  };
})();
