window.CadicisResponsibility = (() => {
  const {
    alive, isSingleKill, visible,
  } = window.CadicisSkillUtils;

  const responsibilityVisible = battle =>
    window.BattleLines?.promptVisible?.(battle, "cadicisResponsibility")
    ?? !!(battle?.cadicisResponsibility && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);

  function beforeKillTargeted(state, actor, target, card, deps) {
    if (!isSingleKill(card) || target.side !== "ally"
      || card.cadicisResponsibilityDone) return;
    const cadicis = state.battle.allies.find(unit =>
      unit.ref === "cadicis" && unit.uid !== target.uid && alive(unit));
    if (!cadicis) return;
    card.cadicisResponsibilityDone = true;
    const count = target.ref === "wendy" ? 2 : 1;
    const drawn = deps.draw(cadicis, count, state.battle);
    state.battle.cadicisResponsibility = {
      cadicisUid: cadicis.uid, targetUid: target.uid, count, remaining: count,
      actorUid: actor.uid, card: { ...card },
      comboPartnerUid: state.battle.comboPartnerUid || null,
    };
    state.battle.locked = true;
    window.BattleLines?.skillWhenPromptVisible?.(
      state, cadicis, "指挥官责任", target,
      "cadicisResponsibility", state.battle.cadicisResponsibility);
    const drawText = window.BattleDrawFeedback.action(cadicis, count, drawn);
    const separator = window.BattleDrawFeedback.count(count, drawn) ? "后" : "；";
    window.BattleLog.add(state,
      `${cadicis.name} 触发指挥官责任，${drawText}${separator}请选择${count}张手牌交给${target.name}。`);
  }

  function resolveResponsibility(state, cardIndex) {
    const battle = state.battle;
    const prompt = battle?.cadicisResponsibility;
    if (!prompt || !responsibilityVisible(battle)) return false;
    const cadicis = battle.allies.find(unit => unit.uid === prompt.cadicisUid);
    const target = battle.allies.find(unit =>
      unit.uid === prompt.targetUid && alive(unit));
    const card = cadicis?.hand?.[cardIndex];
    if (!cadicis || !target || !card || card._pendingDraw) return false;
    const fromBefore = visible(cadicis).length;
    const toBefore = visible(target).length;
    cadicis.hand.splice(cardIndex, 1);
    card._pendingDraw = true;
    target.hand.push(card);
    window.BattleCards?.syncStatusCards?.(target);
    battle.animQueue?.push({
      type: "giveCards", fromUid: cadicis.uid, fromSide: cadicis.side,
      toUid: target.uid, toSide: target.side, count: 1, cards: [card],
      fromBefore, toBefore,
    });
    window.BattleCards?.afterHandLost?.(battle, cadicis);
    prompt.remaining = Math.max(0,
      (prompt.remaining || prompt.count || 1) - 1);
    window.BattleLog.add(state,
      `${cadicis.name} 将${card.name}交给${target.name}。`);
    if (prompt.remaining > 0 && visible(cadicis).length) return true;
    battle.cadicisResponsibilityResume = {
      actorUid: prompt.actorUid, targetUid: prompt.targetUid, card: prompt.card,
      comboPartnerUid: prompt.comboPartnerUid || null,
    };
    battle.cadicisResponsibility = null;
    battle.locked = false;
    return true;
  }

  // 玩家选择不发动：描述写的是「你可以摸1张牌，然后交给其1张手牌」，
  // 所以交不交应由玩家决定。此前只有手牌点击一条路径、没有任何放弃入口，
  // 而 beforeKillTargeted 会把 battle.locked 置 true，玩家被强制交牌、无法拒绝。
  // 跳过时同样要写入 cadicisResponsibilityResume，否则后续杀的结算不会继续。
  function skipResponsibility(state) {
    const battle = state?.battle;
    const prompt = battle?.cadicisResponsibility;
    if (!prompt || !responsibilityVisible(battle)) return false;
    const cadicis = battle.allies.find(unit => unit.uid === prompt.cadicisUid);
    battle.cadicisResponsibilityResume = {
      actorUid: prompt.actorUid, targetUid: prompt.targetUid, card: prompt.card,
      comboPartnerUid: prompt.comboPartnerUid || null,
    };
    battle.cadicisResponsibility = null;
    battle.locked = false;
    window.BattleLog?.add?.(state,
      `${cadicis?.name || "卡迪西斯"}不交牌，指挥官责任本次不发动。`);
    return true;
  }

  return {
    beforeKillTargeted, resolveResponsibility, responsibilityVisible,
    skipResponsibility,
  };
})();
