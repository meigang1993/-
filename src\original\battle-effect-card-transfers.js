window.BattleEffectCardTransfers = U => {
  const {
    publicZone, drawOrigin, pileZone, unitArt, handSpot, hideLine,
  } = U;
  const flight = window.BattleEffectCardMotion(U);

  function gainOrigin(event) {
    if (event.fromZone === "public" || !event.fromUid || event.fromUid === event.uid) {
      return publicZone() || drawOrigin(event.side);
    }
    return unitArt(event.fromUid) || publicZone() || drawOrigin(event.side);
  }
  function syncIncomingHand(event, uid = event.uid) {
    const battle = window.state?.battle;
    const unit = battle?.allies?.concat(battle.enemies || [])
      .find(item => item.uid === uid);
    if (!unit || unit.visualHandCount == null) return;
    const added = (event.cards || []).filter(card => unit.hand?.includes(card)
      && (window.BattleCards?.countsForHand?.(unit, card)
        ?? (!!card && !card._pendingDraw))).length;
    unit.visualHandCount += added;
  }

  async function finishDraw(event, renderStep, active) {
    await flight.transfer(event, drawOrigin(event.side),
      handSpot(event.uid, event.side) || unitArt(event.uid),
      "draw-card-fly", renderStep, true, active, {
        revealFace: event.side !== "enemy",
        onArrive: () => syncIncomingHand(event),
      });
  }
  async function giveCards(event, renderStep, active) {
    await flight.transfer(event,
      handSpot(event.fromUid, event.fromSide) || unitArt(event.fromUid),
      handSpot(event.toUid, event.toSide) || unitArt(event.toUid),
      "draw-card-fly give-card-fly", renderStep, true, active, {
        revealFace: event.toSide !== "enemy",
        enemy: event.toSide === "enemy",
        onArrive: () => syncIncomingHand(event, event.toUid),
      });
  }
  async function stealCard(event, renderStep, active) {
    await flight.transfer(event,
      handSpot(event.fromUid, event.fromSide) || unitArt(event.fromUid),
      handSpot(event.toUid, event.toSide) || unitArt(event.toUid),
      "draw-card-fly steal-card-fly", renderStep, true, active, {
        revealFace: event.toSide !== "enemy",
        enemy: event.toSide === "enemy",
        onArrive: () => syncIncomingHand(event, event.toUid),
      });
  }
  async function gainCards(event, renderStep, active) {
    await flight.transfer(event, gainOrigin(event),
      handSpot(event.uid, event.side) || unitArt(event.uid),
      "draw-card-fly gain-card-fly", renderStep, true, active, {
        revealFace: event.side !== "enemy",
        onArrive: () => syncIncomingHand(event),
      });
  }
  async function discardBatch(event, renderStep, active) {
    await flight.transfer(event,
      handSpot(event.uid, event.side) || unitArt(event.uid),
      event.toPublic
        ? publicZone()
        : pileZone(event.side, "discard") || publicZone(),
      "discard-card-fly", renderStep, false, active, {
        face: "front", fadeOut: !event.toPublic,
      });
  }

  async function sealCards(event, renderStep, active) {
    const from = handSpot(event.uid, event.side) || unitArt(event.uid);
    const destination = pileZone(event.side, "consumed")
      || publicZone() || drawOrigin(event.side);
    if (!active()) return;
    const moving = !!(from && destination && event.count);
    const battle = window.state?.battle;
    const unit = battle?.allies?.concat(battle.enemies || [])
      .find(item => item.uid === event.uid);
    if (unit && event.visualHandCount != null) {
      unit.visualHandCount = event.visualHandCount;
    }
    renderStep();
    if (!active()) return;
    await flight.flyFrontCards({
      cards: event.cards || [], count: event.count || 0,
      from, to: destination, className: "seal-card-fly",
      enemy: event.side === "enemy", active,
    });
    if (!active()) return;
    if (moving) renderStep();
    if (event.clearTargetLine && battle?.targetLineHold) {
      delete battle.targetLineHold;
      hideLine();
      renderStep();
    }
  }

  async function burnCard(state, event, renderStep, active = () => true) {
    const origin = event.fromPublic ? publicZone() : handSpot(event.uid, event.side)
      || unitArt(event.uid) || publicZone() || drawOrigin(event.side);
    const zone = pileZone(event.side, "consumed")
      || publicZone() || drawOrigin(event.side);
    if (!event.card || !origin || !zone) {
      renderStep();
      return;
    }
    await window.BattleEffectCardMotion(U).flyFrontCards({
      cards: [event.card], from: origin, to: zone,
      className: "consume-card-fly", enemy: event.side === "enemy",
      burn: true, active,
    });
    if (!active()) return;
    if (event.trailId) {
      const trail = state?.battle?.played;
      const index = trail?.findIndex(card =>
        card?._cardAnimationId === event.trailId);
      if (index >= 0) {
        const legacyWendyTactic = event.card.type === "tactic"
          && event.card.temporary && event.card.void
          && !event.card.copiedByEdis;
        const keepTrail = !!window.CardUtils?.generatedSource?.(event.card)
          || legacyWendyTactic;
        if (keepTrail) trail[index]._destinationSettled = true;
        else trail.splice(index, 1);
      }
    }
    renderStep();
  }

  async function trailExit(event, renderStep, active = () => true) {
    const origin = publicZone();
    if (!origin || !event.entries?.length) return;
    const groups = new Map();
    event.entries.forEach(entry => {
      const key = `${entry.side}:${entry.pile}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    await Promise.all([...groups.values()].map(entries => {
      const first = entries[0];
      const destination = pileZone(first.side, first.pile)
        || pileZone(first.side, "discard") || drawOrigin(first.side);
      return flight.flyFrontCards({
        cards: entries.map(entry => entry.card),
        from: origin, to: destination,
        className: "trail-exit-fly",
        enemy: first.side === "enemy",
        burn: first.pile === "consumed", active,
      });
    }));
    if (active()) renderStep();
  }

  return {
    finishDraw, giveCards, stealCard, gainCards, discardBatch,
    sealCards, burnCard, trailExit, gainOrigin,
  };
};
