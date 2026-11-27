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
    // toCharacterCard：扣置牌改放到该角色的角色牌上（存储牌区），
    // 动画落点必须是该角色头像/角色牌，而不是消耗牌堆。
    const destination = event.toCharacterCard
      ? (unitArt(event.uid) || publicZone() || drawOrigin(event.side))
      : pileZone(event.side, "consumed") || publicZone() || drawOrigin(event.side);
    if (!active()) return;
    const moving = !!(from && destination && event.count);
    const battle = window.state?.battle;
    const unit = battle?.allies?.concat(battle.enemies || [])
      .find(item => item.uid === event.uid);
    // 相对增量是「一次性消耗」的：同一事件若因动画恢复 / 预览夹具重播两次，
    // 不能把同一批扣牌再减一遍（实测预览 spec 的后台 drain 会先消费队首事件）。
    // 绝对快照分支天然幂等，无需标记。
    if (unit && event.visualHandCount != null
      && !(event.visualHandDelta != null && event._handDeltaApplied)) {
      // 与响应事件完全相同的相对增量口径：当前持有显示值 + delta。
      // 绝对快照覆盖会在「两次扣置之间夹了获得牌」时抹掉那次 +1，
      // 显示短暂跳到错误值（实测 6→4→3→1 而真值应为 4）。
      // 旧事件若没有 visualHandDelta，仍退回绝对快照，保持兼容。
      const current = unit.visualHandCount ?? event.visualHandBefore
        ?? event.visualHandCount - event.visualHandDelta;
      unit.visualHandCount = event.visualHandDelta == null
        ? event.visualHandCount
        : Math.max(0, current + event.visualHandDelta);
      if (event.visualHandDelta != null) event._handDeltaApplied = true;
    }
    renderStep();
    if (!active()) return;
    if (event.toCharacterCard) {
      // 角色牌存储牌：整批一次性放到角色牌上（1 个 DOM / 1 段动画 / 1 次落位）。
      await flight.placeStoredCards({
        cards: event.cards || [], count: event.count || 0,
        from, to: destination, enemy: event.side === "enemy", active,
      });
    } else {
      await flight.flyFrontCards({
        cards: event.cards || [], count: event.count || 0,
        from, to: destination, className: "seal-card-fly",
        enemy: event.side === "enemy", active,
        // 未指定则沿用默认逐张错峰，不改其他调用方的既有表现。
        stagger: event.stagger,
      });
    }
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
        // 与「一次性摸等量牌」同理：出牌区回收是回合结束的清理动画，
        // 一回合可能打出多张，逐张错峰（默认每张 +100ms）会把回合流转
        // 拖得很长。stagger:0 让整批同时起飞、一次落位。
        stagger: 0,
      });
    }));
    if (active()) renderStep();
  }

  return { sealCards, burnCard, trailExit };
};
