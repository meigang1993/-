window.OrcDroneSkills = deps => {
  const { alive, visible, lowValueIndex, stat } = deps;

  function droneMove(state, actor) {
    if (actor.ai !== "suicide_drone" || actor.usedDroneExtract) return null;
    const target = alive(state.battle.allies)
      .filter(unit => unit.gender === "male" && visible(unit).length)
      .sort((left, right) => visible(right).length - visible(left).length || left.hp - right.hp)[0];
    return target ? { card: { name: "无人机采精", _skill: true, droneExtract: true }, target } : null;
  }

  function useDroneExtract(state, actor, target) {
    actor.usedDroneExtract = true;
    window.BattlePileStats?.reshuffle(actor);
    const shown = actor.deck.pop() || null;
    if (shown) actor.discard.push(shown);
    if (shown) {
      state.battle.animQueue?.push({
        type: "revealCards", id: window.GameRandom.id("od"),
        title: "无人机采精", cards: [{ ...shown }],
      });
    }
    const suit = shown?.suit;
    const discardIndex = suit ? lowValueIndex(target, suit) : -1;
    window.BattleLines?.skill(state, actor, "无人机采精", target);
    if (target.side === "ally" && discardIndex >= 0) {
      const validIndexes = visible(target)
        .map((card, index) => card.suit === suit ? index : -1)
        .filter(index => index >= 0);
      state.battle.handReveal = {
        actorUid: actor.uid, targetUid: target.uid, cardName: "无人机采精",
        mode: "droneExtract", shownCard: shown ? { ...shown } : null,
        shownSuit: suit, validIndexes,
      };
      state.battle.locked = true;
      return true;
    }
    if (discardIndex >= 0) {
      const [card] = target.hand.splice(discardIndex, 1);
      window.BattleCards?.put(state.battle, target, card, "discard", { forcedDiscard: true });
      window.BattleLog.add(state,
        `${actor.name} 亮出${suit}${shown.name}，${target.name}弃置同花色${card.name}抵抗无人机采精。`);
      return true;
    }
    return stealForDrone(state, actor, target, shown, "没有同花色牌");
  }

  function stealForDrone(state, actor, target, shown, reason = "没有弃置同花色牌") {
    const stolen = [], consumed = [];
    for (let i = 0; i < 2; i++) {
      const index = lowValueIndex(target);
      if (index < 0) break;
      const [card] = target.hand.splice(index, 1);
      if (window.BattleStatusCards?.isStatus?.(card)) {
        window.BattleCards?.put(state.battle, target, card, "consumed",
          { forcedDiscard: true });
        consumed.push(card);
        continue;
      }
      card.stolenFromUid = target.uid;
      if (state.battle.animQueue) card._pendingDraw = true;
      actor.hand.push(card);
      stolen.push(card);
    }
    if (stolen.length) {
      state.battle.animQueue?.push({
        type: "stealCard", fromUid: target.uid, fromSide: target.side,
        toUid: actor.uid, toSide: actor.side, count: stolen.length, cards: stolen,
      });
    }
    window.BattleCards?.afterHandLost?.(state.battle, target);
    window.BattleLog.add(state,
      `${actor.name} 亮出${shown?.suit || ""}${shown?.name || "无牌"}，${target.name}${reason}，${actor.name}获得其${stolen.length}张牌${consumed.length ? `，并消耗${consumed.length}张状态牌` : ""}。`);
    return true;
  }

  function resolveDroneExtract(state, actor, target, card, picked) {
    if (!actor || !target || actor.ai !== "suicide_drone") return false;
    if (picked) {
      target.hand.splice(target.hand.indexOf(picked), 1);
      window.BattleCards?.put(state.battle, target, picked, "discard", { forcedDiscard: true });
      window.BattleLog.add(state, `${target.name} 弃置${picked.suit}${picked.name}抵抗无人机采精。`);
      return true;
    }
    return stealForDrone(state, actor, target, card?.shownCard || card || null);
  }

  function prepare(state, unit) {
    if (unit.ai !== "suicide_drone" || unit.droneCountdown != null) return;
    unit.droneCountdown = 2;
    unit.statuses ||= [];
    unit.statuses.push("计时2");
    window.BattleLines?.skill(state, unit, "自爆倒计时");
    window.BattleLog.add(state, `${unit.name} 获得2枚自爆计时标记。`);
  }

  function battleStart(state) {
    (state.battle?.enemies || []).filter(unit => unit.ai === "suicide_drone")
      .forEach(unit => prepare(state, unit));
  }

  function endTurn(state, unit, damage) {
    if (unit.ai !== "suicide_drone" || unit.hp <= 0 || unit.droneCountdown == null) return;
    unit.droneCountdown -= 1;
    unit.statuses = (unit.statuses || []).filter(status => !/^计时/.test(status));
    if (unit.droneCountdown > 0) {
      unit.statuses.push(`计时${unit.droneCountdown}`);
      window.BattleLog.add(state, `${unit.name} 的自爆倒计时减少至${unit.droneCountdown}。`);
      return;
    }
    const amount = stat(unit, "attack") + stat(unit, "magic");
    const targets = alive(state.battle.allies);
    window.BattleLines?.skill(state, unit, "自爆倒计时");
    window.BattleLog.add(state, `${unit.name} 自爆，对我方全体造成${amount}点伤害。`);
    const card = {
      name: "自爆倒计时", type: "skill", magicDamage: true,
      ignoreResponse: true, skipDamageModify: true,
    };
    const actions = targets.map(target => ({
      kind: "damage", actorUid: unit.uid, targetUid: target.uid,
      amount, source: "自爆倒计时", card: { ...card },
    }));
    actions.push({ kind: "orcSelfDestruct", actorUid: unit.uid });
    if (window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, damage);
    } else {
      targets.forEach(target => damage(state, target, amount, "自爆倒计时", unit, card));
      finishSelfDestruct(state, unit);
    }
  }

  function finishSelfDestruct(state, unit) {
    const before = unit.hp;
    unit.hp = 0;
    const ids = state.battle.defeatedEnemyIds ||= [];
    if (unit.id && !ids.includes(unit.id)) ids.push(unit.id);
    window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "hp-loss", before || unit.maxHp || 1);
    return true;
  }

  function resolveReactionAction(state, action) {
    if (action?.kind !== "orcSelfDestruct") return false;
    const unit = state.battle?.enemies.concat(state.battle.allies)
      .find(item => item.uid === action.actorUid);
    return unit ? finishSelfDestruct(state, unit) : true;
  }

  return {
    droneMove, useDroneExtract, resolveDroneExtract,
    prepare, battleStart, endTurn, resolveReactionAction,
  };
};
