window.WendySkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const alive = unit => unit && unit.hp > 0;
  const isKill = card => card?.type === "slash"
    || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);

  function tutor(state, actor) {
    if (actor.usedWendyTutor) return true;
    actor.usedWendyTutor = true;
    state.battle.wendyTutorPicker = { uid: actor.uid };
    state.battle.locked = true;
    line(state, actor, "解答迷惑");
    window.BattleLog.add(state,
      `${actor.name} 打开战术牌图鉴，等待选择临时战术牌。`);
    return true;
  }

  function tutorPool(state) {
    const byName = new Map();
    const codex = GameData.cardCodex || [];
    const sources = codex.length
      ? codex : [...(state?.deck || []), ...(state?.explore?.earned?.cards || [])];
    sources.filter(card => card.type === "tactic" && !card._skill
      && !card.virtual && !card.temporary).forEach(card => {
      if (!byName.has(card.name)) byName.set(card.name, card);
    });
    return [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }

  function tempCard(source) {
    const card = {
      ...source, suit: source.suit || "♦", temporary: true, void: true,
      wendyTutorGenerated: true, generatedBySkill: "解答迷惑",
    };
    delete card.suitsText;
    delete card.source;
    return card;
  }

  function chooseTutorCard(state, name, targetUid = null) {
    const battle = state.battle;
    const picker = battle?.wendyTutorPicker;
    const actor = battle?.allies.concat(battle.enemies)
      .find(unit => unit.uid === picker?.uid);
    if (!picker || !actor) return false;
    if (!picker.cardName) {
      const picked = tutorPool(state).find(card => card.name === name);
      if (!picked) return false;
      picker.cardName = picked.name;
      return true;
    }
    const picked = tutorPool(state).find(card => card.name === picker.cardName);
    const target = targetUid
      ? battle.allies.find(unit => unit.uid === targetUid && alive(unit)) : actor;
    if (!picked || !target || target.side !== actor.side) return false;
    const card = tempCard(picked);
    const self = target.uid === actor.uid;
    battle.wendyTutorPicker = null;
    battle.locked = false;
    line(state, actor, "解答迷惑", self ? null : target);
    if (battle.animQueue) card._pendingDraw = true;
    target.hand.push(card);
    if (self) {
      battle.animQueue?.push({
        type: "gainCards", uid: target.uid, side: target.side,
        fromUid: actor.uid, count: 1, cards: [card],
      });
    } else {
      battle.animQueue?.push({
        type: "giveCards", fromUid: actor.uid, fromSide: actor.side,
        toUid: target.uid, toSide: target.side, count: 1, cards: [card],
        fromBefore: visible(actor).length, toBefore: visible(target).length,
      });
    }
    window.WendyTeacherSkinFX?.answer?.(state, actor, target);
    if (!self && target.ref === "flora" && !actor.wendyTutorResetDone) {
      actor.usedWendyTutor = false;
      actor.wendyTutorResetDone = true;
    }
    window.BattleLog.add(state, self
      ? `${actor.name} 生成临时战术牌${picked.name}加入手牌。`
      : `${actor.name} 生成临时战术牌${picked.name}并交给${target.name}。`);
    return true;
  }

  function afterCardPlayed(state, actor, card, deps) {
    if (actor?.side !== "ally" || card?.type !== "tactic" || card._skill) return;
    state.battle?.allies.filter(unit => unit.ref === "wendy" && alive(unit))
      .forEach(wendy => {
        const drawn = deps.draw(wendy, 1, state.battle);
        wendy.skinTeacherDrawn = (wendy.skinTeacherDrawn || 0) + drawn.length;
        line(state, wendy, "读书的智慧");
        window.WendyTeacherSkinFX?.wisdom?.(state, wendy);
        window.BattleLog.add(state,
          `${wendy.name} 因${actor.name}使用战术牌，读书的智慧${window.BattleDrawFeedback.action(wendy, 1, drawn)}。`);
      });
  }

  function afterDiscard(state, unit, cards, deps) {
    if (unit?.ref !== "wendy" || !cards?.length) return;
    unit.wendyDiscardShieldCount = (unit.wendyDiscardShieldCount || 0)
      + cards.length;
    const gainBase = Math.floor(unit.wendyDiscardShieldCount / 2);
    unit.wendyDiscardShieldCount %= 2;
    if (!gainBase) return;
    const flora = state.battle.allies
      .find(ally => ally.ref === "flora" && alive(ally));
    line(state, unit, "飘浮掩体", flora);
    const gains = [];
    state.battle.allies.filter(alive).forEach(ally => {
      const gain = gainBase * (ally.ref === "flora" ? 2 : 1);
      ally.block = (ally.block || 0) + gain;
      gains.push({
        unit: ally, gain,
        reinforced: ally.ref === "cadicis" || gain > gainBase,
      });
      deps.pushFloat?.(state.battle, ally.uid, "armor-gain", gain);
    });
    unit.skinTeacherArmor = (unit.skinTeacherArmor || 0)
      + gains.reduce((sum, item) => sum + item.gain, 0);
    window.WendyTeacherSkinFX?.cover?.(state, unit, gains);
    window.BattleLog.add(state,
      `${unit.name} 弃牌触发飘浮掩体，每弃2张牌我方全体获得${gainBase}点护甲${flora ? `，${flora.name}获得双倍` : ""}。`);
  }

  return { afterCardPlayed, afterDiscard, chooseTutorCard, isKill, tutor, tutorPool };
})();
