window.NanaliSkills = deps => {
  const { alive, visible, takeVisible, singleKill, stat, line } = deps;

  function beforeKillTargeted(state, actor, target, card, api) {
    if (actor?.ref === "nanali" && target?.side === "enemy"
      && singleKill(card)) sealWithApollo(state, actor, target, api, card);
  }

  function sealWithApollo(state, actor, target, api, card = null) {
    const tracked = card ? (card._nanaliApolloTargetUids ||= []) : [];
    if (target?.uid && tracked.includes(target.uid)) return;
    if (target?.uid) tracked.push(target.uid);
    const sourceLeftHand = card?._entitySourceCard
      && !actor.hand.includes(card._entitySourceCard);
    const playedFromHand = card && !card.virtual && !card._skill
      && !actor.hand.includes(card) && (!card._skipHandMove || sourceLeftHand)
      ? 1 : 0;
    const visualHandBefore = visible(target).length;
    const count = visible(actor).length + playedFromHand;
    const cards = count ? takeVisible(target, count) : [];
    if (cards.length) window.BattleCards?.afterHandLost?.(state.battle, target);
    if (!cards.length) return;
    target.nanaliSealed = [...(target.nanaliSealed || []), ...cards];
    if (state.battle.animQueue) {
      if (target.visualHandCount == null) {
        target.visualHandCount = visualHandBefore;
      }
      state.battle.animQueue.push({
        type: "sealCards", uid: target.uid, side: target.side,
        count: cards.length, cards, visualHandBefore,
        visualHandCount: visible(target).length,
        clearTargetLine: !!card?.nanaliRevenge,
      });
    }
    if (card?.nanaliRevenge) {
      state.battle.targetLineHold = {
        actorUid: actor.uid, targetUid: target.uid,
        enemyLine: actor.side === "enemy",
      };
    }
    const tactics = cards.filter(item => item.type === "tactic").length;
    const drawn = tactics ? api.draw?.(actor, tactics, state.battle) : [];
    line(state, actor, "魔刀阿波罗", target);
    window.BattleLog.add(state,
      `${actor.name} 触发魔刀阿波罗，扣置${target.name}${cards.length}张牌${tactics ? `，${window.BattleDrawFeedback.action(actor, tactics, drawn)}` : ""}。`);
  }

  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "nanali" || !singleKill(card)
      || visible(target).length) return amount;
    line(state, actor, "虚弱斩杀", target);
    window.BattleLog.add(state,
      `${actor.name} 对无手牌目标触发虚弱斩杀，本次杀伤害翻倍。`);
    return amount * 2;
  }

  function afterDamage(state, actor, target, card, hpLoss, api) {
    if (!hpLoss || target?.side !== "ally" || actor?.side !== "enemy"
      || card?.nanaliRevenge) return;
    const nanali = state.battle?.allies
      .find(unit => unit.ref === "nanali" && alive(unit));
    if (!nanali || !alive(actor)) return;
    const foes = target.ref === "lokar"
      ? state.battle.enemies.filter(alive) : [actor];
    const skill = target.ref === "lokar" ? "罗卡尔受伤复仇" : "复仇之刃";
    const actions = foes.map(foe => ({
      kind: "nanaliRevenge", actorUid: nanali.uid, targetUid: foe.uid,
    }));
    if (actions.length === 1 && window.BattleCounterTriggers?.open(state, {
      skill, unitUid: nanali.uid, sourceUid: actor.uid,
      targetUid: actions[0].targetUid, count: 1,
    })) return;
    if (actions.length > 1 && window.BattleCounterTriggers?.open(state, {
      skill, unitUid: nanali.uid, sourceUid: actor.uid,
      targetUid: actions[0].targetUid, targetUids: actions.map(action => action.targetUid),
      count: 1,
    })) return;
    line(state, nanali, skill, actor);
    if (state.battle?._damageDepth
      && window.BattleReactionQueue?.enqueue?.(state, actions)) return;
    actions.forEach(action => resolveRevenge(state, action, api.damage, api.draw));
  }

  function resolveRevenge(state, action, damage,
    draw = window.BattleSystem?.draw) {
    const units = state.battle?.allies.concat(state.battle.enemies) || [];
    const nanali = units.find(unit => unit.uid === action?.actorUid);
    const foe = units.find(unit => unit.uid === action?.targetUid);
    if (!alive(nanali) || !alive(foe) || !damage) return false;
    const revenge = CardUtils.fromEntity("杀（普攻）", { nanaliRevenge: true });
    window.BattleAttackAnimations?.ensureInitialFlight?.(
      state, nanali, foe, revenge);
    const flight = state.battle?.animQueue?.find(event =>
      event.type === "virtualPlay" && event.card === revenge
      && event.targetUid === foe.uid);
    if (flight) flight.preserveTargetLine = true;
    sealWithApollo(state, nanali, foe, { draw }, revenge);
    const amount = modifySlashDamage(
      state, nanali, foe, stat(nanali, "attack"), revenge
    );
    revenge._nanaliDamagePrepared = true;
    damage(state, foe, amount, "复仇之刃", nanali, revenge);
    return true;
  }
  function resolveRevengeTrigger(state, nanali, foe, count, api, targetUids = null) {
    const foes = (targetUids || [foe?.uid]).map(uid =>
      state.battle.allies.concat(state.battle.enemies).find(unit => unit.uid === uid)
    ).filter(Boolean);
    line(state, nanali, targetUids ? "罗卡尔受伤复仇" : "复仇之刃", foe);
    const actions = [];
    for (const enemy of foes) {
      for (let i = 0; i < count && alive(nanali) && alive(enemy); i++) {
        actions.push({
          kind: "nanaliRevenge", actorUid: nanali.uid, targetUid: enemy.uid,
        });
      }
    }
    if (actions.length && window.BattleReactionQueue?.prepend?.(state, actions)) {
      window.BattleReactionQueue.flush(state, api.damage);
      return;
    }
    actions.forEach(action =>
      resolveRevenge(state, action, api.damage, api.draw));
  }

  function endTurn(state) {
    window.NanaliSealed?.returnSealed?.(state);
  }

  return {
    afterDamage, beforeKillTargeted, endTurn, modifySlashDamage, resolveRevenge, resolveRevengeTrigger,
  };
};
