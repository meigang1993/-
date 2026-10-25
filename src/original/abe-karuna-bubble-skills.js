// 安倍卡露娜【记忆泡泡】：已结算的牌可存入泡泡手牌区（最多3张），
// 出牌阶段可取回使用，取回的【杀】不消耗杀意；回合结束后该区域清空进弃牌堆。
window.AbeKarunaBubbleSkills = (() => {
  const MAX = 3;
  const alive = unit => !!unit && unit.hp > 0;
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const pileOf = unit => unit?.pileStats?.discard || unit?.discard || [];
  const bubbleOf = unit => unit.bubbleCards || (unit.bubbleCards = []);

  function afterCardPlayed(state, actor, card) {
    const battle = state?.battle;
    if (!battle || !alive(actor) || actor.ref !== "abe_karuna" || !card) return;
    if (card._repeat || card._skill || card._skipHandMove || card.type === "status") return;
    if (!hasSkill(actor, "记忆泡泡")) return;
    if (battle.pendingVictory || battle.pendingDefeat || battle.defeat || battle.locked) return;
    if (bubbleOf(actor).length >= MAX) return;
    battle.karunaBubble = { actorUid: actor.uid, card };
    battle.locked = true;
    window.BattleLog.add(state,
      `${actor.name} 的记忆泡泡可发动：将刚使用的${card.suit || ""}${card.name}放入泡泡手牌区？`);
  }

  // 入堆时可能存的是还原副本（转换牌），故先按对象精确匹配，再按牌名花色回退。
  function removeFromPile(pile, card) {
    let index = pile.lastIndexOf(card);
    if (index < 0) {
      index = pile.findIndex(item => !!item && item.name === card.name
        && (item.suit || "") === (card.suit || ""));
    }
    if (index < 0) return false;
    pile.splice(index, 1);
    return true;
  }

  function store(state) {
    const battle = state?.battle, pick = battle?.karunaBubble;
    if (!pick) return false;
    const actor = battle.allies.concat(battle.enemies)
      .find(unit => unit.uid === pick.actorUid);
    battle.karunaBubble = null;
    battle.locked = false;
    if (!actor) return false;
    const card = pick.card;
    removeFromPile(pileOf(actor), card);
    const bubble = bubbleOf(actor);
    bubble.push(card);
    window.BattleLines?.skill(state, actor, "记忆泡泡");
    window.BattleLog.add(state, `${actor.name} 将${card.suit || ""}${card.name}`
      + `存入泡泡手牌区（${bubble.length}/${MAX}）。`);
    return true;
  }

  function skip(state) {
    const battle = state?.battle;
    if (!battle?.karunaBubble) return false;
    const actor = battle.allies.concat(battle.enemies)
      .find(unit => unit.uid === battle.karunaBubble.actorUid);
    battle.karunaBubble = null;
    battle.locked = false;
    if (actor) {
      window.BattleLog.add(state, `${actor.name} 放弃发动记忆泡泡。`);
    }
    return true;
  }

  // 出牌阶段取回：牌回到手牌并自动选中，走正常出牌流程；取回的牌标记免杀意。
  function take(state, index) {
    const battle = state?.battle;
    const actor = window.BattleSystem?.active?.(battle);
    if (!battle || !actor || battle.locked || actor.ref !== "abe_karuna") return false;
    // 技能描述限定「出牌阶段」才能使用泡泡手牌区（phase 4）。
    // 此前只判 locked，导致弃牌阶段（phase 5）乃至其他阶段也能取回——
    // 等于凭空多一次免费出牌机会，且取回的牌不受弃牌阶段约束。
    if (battle.phase !== 4) return false;
    const bubble = bubbleOf(actor);
    const card = bubble[index];
    if (!card) return false;
    bubble.splice(index, 1);
    card._bubbleFree = true;
    actor.hand.push(card);
    battle.selectedCardIndex = actor.hand.length - 1;
    window.BattleLog.add(state, `${actor.name} 从泡泡手牌区取回${card.suit || ""}${card.name}。`);
    return true;
  }

  const isIntentFree = card => !!card?._bubbleFree;

  function endTurn(state, unit) {
    const battle = state?.battle;
    if (!battle || unit?.ref !== "abe_karuna") return;
    // 取回后未打出的牌不属"区域内"，只需清掉免杀意标记，避免跨回合残留。
    (unit.hand || []).forEach(card => { delete card._bubbleFree; });
    const bubble = unit.bubbleCards;
    if (!bubble?.length) return;
    const cards = bubble.splice(0, bubble.length);
    cards.forEach(card => window.BattleCards?.put(
      battle, unit, card, "discard", { skipAnim: true }));
    window.BattleLog.add(state,
      `${unit.name} 回合结束，泡泡手牌区的${cards.map(card => card.name).join("、")}进入弃牌堆。`);
  }

  function render(unit, U) {
    const bubble = unit?.bubbleCards || [];
    // 非出牌阶段（phase≠4）不可取回：置灰并禁用点击，避免玩家点了没反应。
    const usable = window.state?.battle?.phase === 4;
    const slots = bubble.map((card, index) => `<span class="karuna-bubble-slot${usable ? "" : " karuna-bubble-slot-idle"}" data-bubble-index="${index}">${U.card(card, false, {
      index: null, selected: false, actor: unit, disabled: false,
    })}</span>`).join("");
    return `<div class="karuna-bubble-zone" title="记忆泡泡：泡泡手牌区${bubble.length}/${MAX}张，出牌阶段可点击取回使用；回合结束后全部进入弃牌堆"><span class="karuna-bubble-label">泡泡手牌区 ${bubble.length}/${MAX}</span><div class="karuna-bubble-cards">${slots || '<span class="karuna-bubble-empty">空</span>'}</div></div>`;
  }

  return { MAX, afterCardPlayed, store, skip, take, isIntentFree, endTurn, render };
})();
