// 退场 / 消耗类卡牌动画：封印（sealCards）、燃烧（burnCard）、公共区回收（trailExit）。
// 从 battle-effect-card-transfers.js 拆出，避免该文件超过 200 行硬约束。
// 与转移类动画共用同一个 U 与 flight，通过 window.BattleEffectCardTransfersExit 组装。
window.BattleEffectCardTransfersExit = U => {
  const {
    publicZone, drawOrigin, pileZone, unitArt, handSpot, hideLine,
  } = U;
  const flight = window.BattleEffectCardMotion(U);

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

  return { sealCards, burnCard, trailExit };
};
