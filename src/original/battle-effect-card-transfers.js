// 转移 / 摸牌 / 弃牌类卡牌动画。
// 退场与消耗类（封印 / 燃烧 / 公共区回收）已拆到
// battle-effect-card-transfers-exit.js，由本文件在返回前组装回来。
window.BattleEffectCardTransfers = U => {
  const {
    publicZone, drawOrigin, pileZone, unitArt, handSpot,
  } = U;
  const flight = window.BattleEffectCardMotion(U);
  // 缺失时显式抛错而非 || {} 兜底：兜底会让封印/燃烧/公共区回收动画
  // 静默失效（牌不飞但也不报错），排查成本极高。
  const exit = window.BattleEffectCardTransfersExit;
  if (typeof exit !== "function") {
    throw new Error("battle-effect-card-transfers: 缺少子模块 BattleEffectCardTransfersExit");
  }
  const { sealCards, burnCard, trailExit } = exit(U);

  // 最小起飞距离：牌堆起点与手牌区落点在某些布局下只差几十像素，360ms
  // 的飞行在屏幕上几乎看不出位移，玩家会以为牌是「凭空出现」的。
  // 实测队友摸牌的位移仅 73px，而其他人 205~630px —— 这正是「使用者
  // 自己没有飞入动画」的由来。不足 MIN_DRAW 时把起点沿反方向推远，
  // 保证每张牌都飞得看得见；方向不变、终点不变。
  const MIN_DRAW = 130;
  function withMinDistance(from, to) {
    if (!from || !to) return from;
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (!dist || dist >= MIN_DRAW) return from;
    const k = MIN_DRAW / dist;
    return { x: to.x - dx * k, y: to.y - dy * k };
  }

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
    const destination = handSpot(event.uid, event.side) || unitArt(event.uid);
    await flight.transfer(event, withMinDistance(drawOrigin(event.side), destination),
      destination, "draw-card-fly", renderStep, true, active, {
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

  return {
    finishDraw, giveCards, stealCard, gainCards, discardBatch,
    sealCards, burnCard, trailExit, gainOrigin,
  };
};
