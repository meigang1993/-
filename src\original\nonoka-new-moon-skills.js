window.NonokaNewMoonSkills = (() => {
  const handSize = unit => (unit.hand || []).length;
  const allUnits = battle => battle.allies.concat(battle.enemies);
  const alive = unit => unit && unit.hp > 0;
  const findUnit = (battle, uid) => allUnits(battle).find(unit => unit.uid === uid);
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);

  function trackCard(state, actor, card, deps) {
    if (!alive(actor) || !actor.newMoonActive || !card.suit || actor.newMoonSuits?.includes(card.suit)) return;
    actor.newMoonSuits = [...new Set([...(actor.newMoonSuits || []), card.suit])];
    window.NonokaIdolSkinFX?.newMoon?.(state, actor, card.suit);
    const drawn = deps.draw(actor, 1, state.battle);
    window.BattleLog.add(state, `${actor.name} 使用${card.suit}花色牌，新月之歌${window.BattleDrawFeedback.action(actor, 1, drawn)}。`);
  }

  function beginTurn(state, unit) {
    if (!unit?.skills?.some(skill => skill.name === "新月之歌") || unit.hp <= 0) return;
    unit.newMoonActive = true; unit.newMoonSuits = [];
    line(state, unit, "新月之歌");
    window.BattleLog.add(state, `${unit.name} 的新月之歌生效，本回合自动记录打出的花色。`);
  }

  function endTurn(state, unit, deps) {
    const battle = state.battle;
    if (!alive(unit)) { if (unit) clearTurn(state, unit); return true; }
    unit.newMoonSuits = [...new Set(unit?.newMoonSuits || [])];
    const count = unit.newMoonSuits.length || 0;
    if (unit?.newMoonActive && count) {
      const drawn = deps.draw(unit, count, battle);
      window.BattleLog.add(state, `${unit.name} 新月之歌结束结算，按${count}种花色${window.BattleDrawFeedback.action(unit, count, drawn)}。`);
      const shareCount = Math.min(count, handSize(unit));
      if (unit.side === "ally" && battle.allies.some(ally => ally.uid !== unit.uid && ally.hp > 0) && shareCount) {
        battle.newMoonShare = { unitUid: unit.uid, count: shareCount, indexes: [] };
        clearTurn(state, unit);
        return false;
      }
    }
    clearTurn(state, unit);
    return true;
  }

  function resolveShare(state, targetUid) {
    const battle = state.battle, picker = battle?.newMoonShare;
    const unit = picker && findUnit(battle, picker.unitUid), target = targetUid && findUnit(battle, targetUid);
    if (!picker || !unit) return false;
    if (target && target.side === unit.side && target.uid !== unit.uid && alive(target)) {
      const indexes = [...new Set(picker.indexes || [])].filter(index => unit.hand[index] && !unit.hand[index]._pendingDraw).sort((a, z) => z - a);
      if (indexes.length !== picker.count) return false;
      const give = [], fromBefore = handSize(unit), toBefore = handSize(target);
      indexes.forEach(index => { const [card] = unit.hand.splice(index, 1); if (card) give.unshift(card); });
      give.forEach(card => { card._pendingDraw = true; target.hand.push(card); });
      if (give.length) window.BattleCards?.syncStatusCards?.(target);
      if (give.length) battle.animQueue?.push({ type: "giveCards", fromUid: unit.uid, fromSide: unit.side, toUid: target.uid, toSide: target.side, count: give.length, cards: give, fromBefore, toBefore });
      if (give.length) window.BattleCards?.afterHandLost?.(state.battle, unit);
      window.BattleLog.add(state, `${unit.name} 将${give.length}张手牌交给${target.name}。`);
    } else window.BattleLog.add(state, `${unit.name} 选择不交出新月之歌手牌。`);
    battle.newMoonShare = null; clearTurn(state, unit); return true;
  }

  function toggleCard(state, cardIndex) {
    const battle = state?.battle, picker = battle?.newMoonShare;
    const unit = picker && findUnit(battle, picker.unitUid), card = unit?.hand?.[cardIndex];
    if (!picker || !unit || !card || card._pendingDraw) return false;
    const indexes = picker.indexes || (picker.indexes = []), picked = indexes.includes(cardIndex);
    if (!picked && indexes.length >= picker.count) return false;
    picker.indexes = picked ? indexes.filter(index => index !== cardIndex) : [...indexes, cardIndex];
    return true;
  }

  function clearTurn(state, unit) {
    unit.newMoonActive = false; unit.newMoonSuits = [];
    unit.mimicUid = null; unit.mimicName = null;
    if (state.battle) state.battle.mimicLinks = (state.battle.mimicLinks || []).filter(link => link.ownerUid !== unit.uid);
  }

  return { trackCard, beginTurn, endTurn, resolveShare, toggleCard };
})();
