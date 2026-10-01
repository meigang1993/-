window.CatherineSkills = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isTactic = card => card?.type === "tactic";
  const hasSkill = (unit, name) =>
    (unit?.skills || []).some(skill => skill.name === name);
  const isCatherine = unit => unit?.ref === "catherine" || unit?.id === "catherine";
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);
  const magicOf = unit => (unit?.stats?.magic || 0) + (unit?.tempMagic || 0);
  const line = (state, unit, name) => window.BattleLines?.skill(state, unit, name);
  // 飞行中的牌（_pendingDraw）已经 push 进 hand，归属已确定，应计入魔力。
  // 若用 visible() 过滤，知识吸收 / 窃取转移拿到的战术牌在落位前不会被计入，
  // 导致 tempMagic 少算，直到下次同步才补上。
  const tacticCount = unit => (unit?.hand || []).filter(isTactic).length;
  const sideOf = (battle, unit, same) => {
    const allies = battle?.allies || [], foes = battle?.enemies || [];
    return (unit?.side === "ally" ? (same ? allies : foes)
      : (same ? foes : allies));
  };

  function syncMagic(state, unit) {
    if (!isCatherine(unit) || !alive(unit)) return;
    if (!hasSkill(unit, "魔力增幅")) return;
    unit.tempMagic = tacticCount(unit);
  }
  function syncAll(state) {
    allUnits(state?.battle).forEach(unit => syncMagic(state, unit));
  }
  function isTopMagic(state, unit) {
    const others = allUnits(state?.battle)
      .filter(item => alive(item) && item.uid !== unit?.uid);
    if (!others.length) return true;
    return magicOf(unit) >= Math.max(...others.map(magicOf));
  }
  function beforeCardPlayed(state, actor, card) {
    if (!isCatherine(actor) || !alive(actor) || !isTactic(card)) return;
    syncMagic(state, actor);
    if (!hasSkill(actor, "魔力增幅") || !isTopMagic(state, actor)) return;
    card.ignoreResponse = true;
    line(state, actor, "魔力增幅");
  }

  function takeUsedCard(actor, card) {
    if (card.virtual || card._skipHandMove || card.void
      || card.copiedByEdis || card.temporary) return null;
    const entity = card._entitySourceCard || card;
    const zone = actor.pileStats || actor;
    for (const pile of ["discard", "consumed"]) {
      const index = zone?.[pile]?.indexOf(entity) ?? -1;
      if (index >= 0) return zone[pile].splice(index, 1)[0];
    }
    return null;
  }
  function afterCardPlayed(state, actor, card) {
    const battle = state?.battle;
    if (!battle || !actor || !card || !isTactic(card)) return;
    // 排除 actor 本人：否则凯瑟琳自己使用战术牌后，会把该牌从弃牌堆取回自己手上，
    // 等于同一张战术牌可无限重复使用（手牌数不变、魔力恒定），直接破坏牌库循环。
    allUnits(battle)
      .filter(unit => isCatherine(unit) && alive(unit) && hasSkill(unit, "知识吸收")
        && unit?.uid !== actor?.uid)
      .forEach(unit => {
        const gained = takeUsedCard(actor, card);
        if (!gained) return;
        // 回收的是队友用过的牌，弃置时须回到该队友牌堆，否则等于把队友的牌转成自己的。
        gained.stolenFromUid = actor.uid;
        if (battle.animQueue) gained._pendingDraw = true;
        unit.hand.push(gained);
        window.BattleCards?.syncStatusCards?.(unit);
        battle.animQueue?.push({
          type: "gainCards", uid: unit.uid, side: unit.side,
          cards: [gained], count: 1,
        });
        line(state, unit, "知识吸收");
        window.BattleLog.add(state,
          `${unit.name} 的知识吸收触发，获得${actor.name}使用过的实体【${gained.name}】。`);
        syncMagic(state, unit);
      });
  }

  function transferCard(state, actor, victim, receiver, card) {
    const battle = state.battle;
    victim.hand.splice(victim.hand.indexOf(card), 1);
    if (window.BattleStatusCards?.isStatus?.(card)) {
      window.BattleCards?.put?.(battle, victim, card, "consumed",
        { forcedDiscard: true });
      window.BattleLog.add(state,
        `${actor.name} 使用窃取，移除并消耗${victim.name}的${card.name}状态牌。`);
      return true;
    }
    card.stolenFromUid = victim.uid;
    if (battle.animQueue) card._pendingDraw = true;
    receiver.hand.push(card);
    window.BattleCards?.syncStatusCards?.(receiver);
    battle.animQueue?.push({
      type: "stealCard", fromUid: victim.uid, fromSide: victim.side,
      toUid: receiver.uid, toSide: receiver.side, count: 1, cards: [card],
    });
    window.BattleCards?.afterHandLost?.(battle, victim);
    window.BattleLog.add(state,
      `${actor.name} 使用窃取，将${victim.name}一张${card.suit || ""}${card.name}转移给${receiver.name}。`);
    syncMagic(state, receiver);
    return true;
  }

  function handleSpecialCard(state, actor, target, card) {
    if (!card?.catherineSteal || !isCatherine(actor) || !alive(actor)) return false;
    if (actor.usedCatherineSteal) return false;
    const battle = state?.battle;
    if (!battle) return false;
    const foes = sideOf(battle, actor, false)
      .filter(unit => alive(unit) && visible(unit).length);
    if (!foes.length) return false;
    const mates = (actor.side === "ally" ? battle.allies : battle.enemies)
      .filter(unit => alive(unit) && unit.uid !== actor.uid);
    if (!mates.length) return false;
    const victim = target && target.side !== actor.side && alive(target)
      ? target : window.GameRandom.sample(foes, state);
    if (!victim || !visible(victim).length) return false;
    actor.usedCatherineSteal = true;
    line(state, actor, "窃取");
    if (actor.side !== "ally") {
      return transferCard(state, actor, victim,
        window.GameRandom.sample(mates, state),
        window.GameRandom.sample(visible(victim), state));
    }
    battle.catherineStealPicker = { actorUid: actor.uid, targetUid: victim.uid };
    battle.locked = true;
    return true;
  }

  function chooseReceiver(state, uid) {
    const battle = state?.battle, picker = battle?.catherineStealPicker;
    if (!picker) return false;
    const units = allUnits(battle);
    const actor = units.find(unit => unit.uid === picker.actorUid);
    const victim = units.find(unit => unit.uid === picker.targetUid);
    const receiver = uid
      ? battle.allies.find(unit => unit.uid === uid
        && unit.uid !== picker.actorUid && alive(unit))
      : null;
    battle.catherineStealPicker = null;
    battle.locked = false;
    if (!actor || !victim || !receiver) {
      window.BattleLog.add(state, `${actor?.name || "凯瑟琳"} 放弃发动窃取。`);
      return true;
    }
    if (!visible(victim).length) {
      window.BattleLog.add(state, `${victim.name}没有可窃取的手牌。`);
      return true;
    }
    // window.BattleCardHandInteractions 是依赖注入的工厂函数（非实例对象），
    // 直接 ?.openHandReveal?.() 会静默返回 undefined，导致面板永不打开。
    // 这里按 orc-drone-skills.js 的写法直接构造 handReveal，
    // mode 为 "catherineSteal"，由 battle-combat-responses 分发回 resolveSteal。
    battle.handReveal = {
      actorUid: actor.uid,
      targetUid: victim.uid,
      cardName: "窃取",
      card: { name: "窃取", type: "tactic", catherineSteal: true },
      mode: "catherineSteal",
      repeatAfter: true,
      receiverUid: receiver.uid,
    };
    battle.locked = true;
    return true;
  }

  function resolveSteal(state, actor, victim, prompt, card) {
    const battle = state?.battle;
    if (!battle || !actor || !victim || !card) return false;
    const receiver = allUnits(battle).find(unit =>
      unit.uid === prompt?.receiverUid && alive(unit));
    if (!receiver) return false;
    return transferCard(state, actor, victim, receiver, card);
  }

  return {
    syncMagic, syncAll, isTopMagic, beforeCardPlayed, afterCardPlayed,
    handleSpecialCard, chooseReceiver, resolveSteal,
  };
})();
