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
    // 三国杀「置于武将牌上」口径：扣出的牌放到目标自己的角色牌上（存储牌、
    // 移出游戏），不再挂在魔刀私有的 nanaliSealed 字段里。缺模块时显式抛错，
    // 避免静默退回到旧行为。
    if (!window.BattleCharacterCardStorage?.store) throw new Error(
      "[battle-character-card-storage] 未装配：battle-character-card-storage.js"
      + " 必须先于 nanali-skills.js 加载");
    window.BattleCharacterCardStorage.store(state, target, cards, {
      source: "魔刀阿波罗", ownerUid: actor.uid, release: "anyTurnEnd",
    });
    if (state.battle.animQueue) {
      if (target.visualHandCount == null) {
        target.visualHandCount = visualHandBefore;
      }
      state.battle.animQueue.push({
        type: "sealCards", uid: target.uid, side: target.side,
        count: cards.length, cards, visualHandBefore,
        visualHandCount: visible(target).length,
        // 与 BattleCards.queueResponse / battle-effect-handlers.response 同口径：
        // 动画按「当前持有显示值 + 相对增量」推进，而不是用绝对快照覆盖。
        // 否则队列中若夹着目标获得牌/摸牌事件，后播的 sealCards 会把已加上的
        // 增量抹掉，出现瞬时错误手牌数（连击不同扣牌数时尤其明显）。
        visualHandDelta: -cards.length,
        // 与「一次性摸等量牌」同口径：扣置张数取决于娜娜莉手牌数，
        // 逐张错峰（每张 +100ms）会让一次扣置拖出十几段飞行。
        // stagger:0 让整批同时起飞、一次落位。
        stagger: 0,
        // 落点改为目标自己的角色牌（存储牌区），不是消耗区。
        // placeOnce：整批牌一次性放到角色牌上（不再逐张并排飞）。
        toCharacterCard: true, placeOnce: true,
      });
    }
    window.NanaliSlaughterWitchSkinFX?.apolloSeal?.(state, actor, target, cards);
    const tactics = cards.filter(item => item.type === "tactic").length;
    const drawn = tactics ? api.draw?.(actor, tactics, state.battle) : [];
    line(state, actor, "魔刀阿波罗", target);
    window.BattleLog.add(state,
      `${actor.name} 触发魔刀阿波罗，将${target.name}${cards.length}张牌扣置于其角色牌上（存储牌）${tactics ? `，${window.BattleDrawFeedback.action(actor, tactics, drawn)}` : ""}。`);
  }

  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "nanali" || !entitySingleKill(card)
      || visible(target).length) return amount;
    window.NanaliSlaughterWitchSkinFX?.weaknessExecute?.(state, actor, target);
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
