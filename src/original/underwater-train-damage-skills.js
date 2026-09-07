window.UnderwaterTrainDamageSkills = ({ alive, singleSlash, visible }) => {
  function afterDamageBeforeBite(state, actor, target, card, hpLoss, damage) {
    if (actor?.ai === "mona_eagle_captain" && hpLoss && singleSlash(card)
      && target?.side === "ally" && !actor.monaPiercingUsed) {
      actor.monaPiercingUsed = true;
      actor.monaPiercingReady = true;
      window.BattleLines?.skill(state, actor, "圣天破军剑");
      window.BattleLog.add(state,
        `${actor.name} 的圣天破军剑蓄势完成，本回合下一张单体杀将攻击我方全体。`);
    }
    if (actor?.ai === "shark_pirate_crew" && hpLoss
      && singleSlash(card) && target?.side === "ally") {
      actor.anchorGun = { uid: target.uid, amount: hpLoss };
    }
    if (actor?.ai === "shark_pirate_submarine" && hpLoss
      && card?.sharkTorpedo && !card._torpedoSplash) {
      splash(state, actor, hpLoss, damage);
    }
    if (actor?.ai === "shark_captain_mordio" && hpLoss
      && singleSlash(card) && target?.side === "ally") crushHand(state, actor, target);
  }

  function afterDamageAfterBite(state, actor, target, hpLoss) {
    if (target?.ai === "shark_captain_mordio" && hpLoss && actor?.side === "ally") {
      sharkRage(state, target, actor);
    }
  }

  function crushHand(state, actor, target) {
    const cards = visible(target);
    if (!cards.length) return;
    for (let index = target.hand.length - 1; index >= 0; index -= 1) {
      if (!target.hand[index]._pendingDraw) target.hand.splice(index, 1);
    }
    window.BattleCards?.putMany?.(
      state.battle, target, cards, "discard", { forcedDiscard: true });
    window.BattleLines?.skill(state, actor, "粉碎破坏者", target);
    window.BattleLog.add(state,
      `${actor.name} 的粉碎破坏者触发，弃置${target.name}所有手牌。`);
  }

  function sharkRage(state, mordio, actor) {
    const round = state.battle?.roundNo || 1;
    if (mordio.rageRound !== round) {
      mordio.rageRound = round;
      mordio.rageSources = {};
    }
    if (mordio.rageSources[actor.uid]) return;
    mordio.rageSources[actor.uid] = true;
    mordio.intentMaxBonus = (mordio.intentMaxBonus || 0) + 1;
    mordio.rageExpireTurn = (mordio.actionCount || 0) + 1;
    window.BattleLines?.skill(state, mordio, "狂鲨之怒", actor);
    window.BattleLog.add(state,
      `${mordio.name} 的狂鲨之怒触发，杀意上限+1。`);
  }

  function splash(state, actor, amount, damage) {
    const targets = alive(state.battle.allies);
    const card = {
      name: "鲨影鱼雷",
      type: "slash",
      virtual: true,
      ignoreResponse: true,
      _torpedoSplash: true,
      allTargets: targets.map(unit => unit.uid),
      aoeLineShown: true,
    };
    window.BattleLog.add(state,
      `${actor.name} 的鲨影鱼雷扩散，对我方全体造成${amount}点伤害。`);
    window.EnemySkills?.beforeKillUsed?.(state, actor, card);
    const actions = targets.map(target => ({
      kind: "damage",
      actorUid: actor.uid,
      targetUid: target.uid,
      amount,
      source: "鲨影鱼雷",
      card: { ...card },
      prepareGroupKill: true,
    }));
    if (window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, damage);
      return;
    }
    targets.forEach(target => damage(
      state,
      target,
      amount,
      "鲨影鱼雷",
      actor,
      window.EnemySkills?.prepareGroupKillTarget?.(state, actor, target, card) || card,
    ));
  }

  return { afterDamageBeforeBite, afterDamageAfterBite };
};
