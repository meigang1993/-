window.NanaliSkills = deps => {
  const { visible, takeVisible, singleKill, line } = deps;
  // 实体单体杀：由手牌里的实体牌打出（含转换杀），不含技能生成的虚拟杀
  const entitySingleKill = card => singleKill(card) && !card?.virtual;

  function beforeKillTargeted(state, actor, target, card, api) {
    if (actor?.ref === "nanali" && target?.side === "enemy"
      && entitySingleKill(card)) sealWithApollo(state, actor, target, api, card);
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
      });
    }
    const tactics = cards.filter(item => item.type === "tactic").length;
    const drawn = tactics ? api.draw?.(actor, tactics, state.battle) : [];
    line(state, actor, "魔刀阿波罗", target);
    window.BattleLog.add(state,
      `${actor.name} 触发魔刀阿波罗，扣置${target.name}${cards.length}张牌${tactics ? `，${window.BattleDrawFeedback.action(actor, tactics, drawn)}` : ""}。`);
  }

  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "nanali" || !entitySingleKill(card)
      || visible(target).length) return amount;
    line(state, actor, "虚弱斩杀", target);
    window.BattleLog.add(state,
      `${actor.name} 对无手牌目标触发虚弱斩杀，本次杀伤害翻倍。`);
    return amount * 2;
  }

  function endTurn(state) {
    window.NanaliSealed?.returnSealed?.(state);
  }

  return {
    beforeKillTargeted, endTurn, modifySlashDamage,
  };
};
