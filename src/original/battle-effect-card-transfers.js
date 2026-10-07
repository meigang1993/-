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
  // 角色间移牌（交牌/偷牌/从他人处获得）统一走角色头像：背面牌从一个角色
  // 头像飞到另一个角色头像。此前起点终点取手牌区（友方）或头像（敌方），
  // 两侧不一致，且牌会在落位时翻开——移牌属于手牌流转，不该在动画里摊牌面。
  function avatarEnd(uid, side) {
    return unitArt(uid) || publicZone() || drawOrigin(side);
  }
  // 带 fromUid 且来源不是获得者本人时，才是真正的角色间移牌。
  function isUnitTransfer(event) {
    return !!event.fromUid && event.fromUid !== event.uid;
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
        // 一次性起飞：摸牌张数可多至十余张，逐张错峰（每张 +100ms）会让
        // 整手补给明显拖长。stagger:0 让整批同时起飞、一次落位。
        stagger: 0,
      });
  }
  async function giveCards(event, renderStep, active) {
    await flight.transfer(event,
      avatarEnd(event.fromUid, event.fromSide),
      avatarEnd(event.toUid, event.toSide),
      "draw-card-fly give-card-fly", renderStep, true, active, {
        revealFace: false,
        enemy: event.toSide === "enemy",
        onArrive: () => syncIncomingHand(event, event.toUid),
      });
  }
  async function stealCard(event, renderStep, active) {
    await flight.transfer(event,
      avatarEnd(event.fromUid, event.fromSide),
      avatarEnd(event.toUid, event.toSide),
      "draw-card-fly steal-card-fly", renderStep, true, active, {
        revealFace: false,
        enemy: event.toSide === "enemy",
        onArrive: () => syncIncomingHand(event, event.toUid),
      });
  }
  async function gainCards(event, renderStep, active) {
    // 从公共区/判定区获得的牌不是角色间移牌，保留原起点与翻面行为；
    // 从其他角色处获得（伊迪斯拷贝、知识吸收等）则与交牌/偷牌同口径。
    const fromUnit = isUnitTransfer(event);
    await flight.transfer(event, fromUnit ? avatarEnd(event.fromUid, event.side)
      : gainOrigin(event),
    fromUnit ? avatarEnd(event.uid, event.side)
      : (handSpot(event.uid, event.side) || unitArt(event.uid)),
    "draw-card-fly gain-card-fly", renderStep, true, active, {
      revealFace: !fromUnit && event.side !== "enemy",
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
        // 同摸牌：整批同时起飞，弃得再多也只有一段飞行时长。
        stagger: 0,
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
