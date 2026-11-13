window.WendySkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const alive = unit => unit && unit.hp > 0;
  const isKill = card => card?.type === "slash"
    || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);

  const sameSideUnits = (battle, actor) => battle?.allies.concat(battle.enemies || [])
    .filter(unit => unit.side === actor.side) || [];

  function tutor(state, actor) {
    if (actor.usedWendyTutor) return true;
    actor.usedWendyTutor = true;
    // 阵营保护：只有我方（玩家侧）才开选牌弹窗，敌方拿到该技能时自动完成，
    // 否则界面会锁定并等待玩家替敌人选牌（与战斗演练、窃取同一口径）。
    if (actor.side === "ally") {
      state.battle.wendyTutorPicker = { uid: actor.uid };
      state.battle.locked = true;
      line(state, actor, "解答迷惑");
      window.BattleLog.add(state,
        `${actor.name} 打开战术牌图鉴，等待选择临时战术牌。`);
      return true;
    }
    return autoTutor(state, actor);
  }

  function autoTutor(state, actor) {
    const picked = tutorPool(state)[0];
    if (!picked) {
      actor.usedWendyTutor = false;   // 无可用的战术牌时退回，不浪费本回合次数
      return false;
    }
    return grantTutorCard(state, actor, picked, actor);   // 台词由 grantTutorCard 统一播
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
      ? sameSideUnits(battle, actor)
        .find(unit => unit.uid === targetUid && alive(unit)) : actor;
    if (!picked || !target || target.side !== actor.side) return false;
    return grantTutorCard(state, actor, picked, target);
  }

  function grantTutorCard(state, actor, picked, target) {
    const battle = state.battle;
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

  // 【飘浮掩体】锁定技，弃牌阶段触发：我方全体获得等同于温蒂魔力值的护甲，
  // 卡迪西斯在队伍中时获得 2 倍。与「本次弃了几张牌」完全解耦——
  // 旧实现挂在 afterDiscard 上，温蒂手牌不超上限（无需弃牌）时整段不触发，
  // 且芙萝娅/卡迪西斯按弃牌数双倍，属性加点毫无收益。
  function floatingCover(state, unit, deps = {}) {
    const battle = state?.battle;
    if (!battle || unit?.ref !== "wendy" || !alive(unit)) return false;
    // 弃牌阶段每回合只结算一次：enterDiscardOrEnd 在手动确认/自动推进链路里
    // 可能被重复调用，用回合号挡住重复加甲。
    if (unit._floatingCoverTurn === battle.turn) return false;
    unit._floatingCoverTurn = battle.turn;
    const rawMagic = (unit.stats?.magic || 0) + (unit.tempMagic || 0);
    // 魔力可能是小数（装备/祝福加成），护甲按点收敛，避免出现 4.800000000001。
    const magic = Math.max(0, Math.round(
      window.BattleHpValue?.clean?.(rawMagic) ?? rawMagic));
    // 按持有者阵营取同阵营角色：当前温蒂只作为我方角色，按 side 取值是防御性对齐，
    // 避免技能被复制 / 战斗演练到敌方单位时把护甲加到玩家头上。
    const team = (unit.side === "enemy" ? battle.enemies : battle.allies) || [];
    const allies = team.filter(alive);
    if (!allies.length) return false;
    const cadicis = allies.find(ally => ally.ref === "cadicis") || null;
    line(state, unit, "飘浮掩体", cadicis);
    const gains = [];
    allies.forEach(ally => {
      const gain = magic * (ally === cadicis ? 2 : 1);
      ally.block = (ally.block || 0) + gain;
      gains.push({ unit: ally, gain, reinforced: gain > magic });
      deps.pushFloat?.(battle, ally.uid, "armor-gain", gain);
    });
    unit.skinTeacherArmor = (unit.skinTeacherArmor || 0)
      + gains.reduce((sum, item) => sum + item.gain, 0);
    window.WendyTeacherSkinFX?.cover?.(state, unit, gains);
    window.BattleLog.add(state,
      `${unit.name} 弃牌阶段触发飘浮掩体，我方全体获得${magic}点护甲`
      + `${cadicis ? `，${cadicis.name}获得2倍护甲` : ""}。`);
    return true;
  }

  return { afterCardPlayed, floatingCover, chooseTutorCard, isKill, tutor, tutorPool };
})();
