window.NonokaLokiSkills = (() => {
  const visibleHand = unit => (unit.hand || []).filter(card => !card._pendingDraw);
  const allUnits = battle => battle.allies.concat(battle.enemies);
  const isKillCard = card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const alive = unit => unit && unit.hp > 0;
  const findUnit = (battle, uid) => allUnits(battle).find(unit => unit.uid === uid);
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);
  const leastAlly = battle => battle.allies.filter(alive).sort((a, z) => visibleHand(a).length - visibleHand(z).length || a.uid.localeCompare(z.uid))[0];

  function afterCardPlayed(state, actor, target, card, deps) {
    if (!state.battle || !actor || !card) return;
    window.NonokaNewMoonSkills.trackCard(state, actor, card, deps);
    triggerMimic(state, actor, deps);
  }
  function afterCardResponded(state, actor, target, card, deps) {
    if (!state.battle || !actor || !card) return;
    window.BattleStats?.responded?.(state.battle, actor);
    window.SakuraRisaSkills?.afterResponse?.(state, actor, card, deps);
    triggerMimic(state, actor, deps);
  }
  function triggerMimic(state, actor, deps) {
    const battle = state.battle;
    mimicOwners(battle, actor).forEach(owner => {
      const receiver = leastAlly(battle);
      if (!receiver) return;
      const drawn = deps.draw(receiver, 1, battle);
      window.BattleLog.add(state, `${owner.name} 模仿的${actor.name}行动，${receiver.name}${window.BattleDrawFeedback.action(receiver, 1, drawn)}。`);
    });
  }
  function mimicOwners(battle, actor) {
    return (battle.mimicLinks || []).filter(link => link.targetUid === actor.uid).map(link => findUnit(battle, link.ownerUid)).filter(alive);
  }
  function handleSpecialCard(state, actor, target, card, deps) {
    if (card.mimicVoice) return mimicVoice(state, actor, target);
    if (card.idolKiss) return idolKiss(state, actor, target, deps, card);
    return false;
  }
  function mimicVoice(state, actor, target) {
    if (actor.usedMimic || !target || target.uid === actor.uid) return true;
    actor.usedMimic = true; actor.mimicUid = target.uid; actor.mimicName = target.name;
    state.battle.mimicLinks = (state.battle.mimicLinks || []).filter(link => link.ownerUid !== actor.uid);
    state.battle.mimicLinks.push({ ownerUid: actor.uid, targetUid: target.uid });
    window.NonokaIdolSkinFX?.mimic?.(state, actor, target);
    line(state, actor, "模仿之音");
    window.BattleLog.add(state, `${actor.name} 模仿${target.name}，本回合伤害来源视为${target.name}。`);
    return true;
  }
  function idolKiss(state, actor, target, deps, card) {
    const index = card?._costCard ? actor.hand.indexOf(card._costCard) : state.battle.selectedCardIndex, heart = actor.hand[index];
    if (actor.usedIdolKiss || !target || target.uid === actor.uid || target.side !== actor.side || !heart || heart._pendingDraw || heart.suit !== "♥") return true;
    actor.usedIdolKiss = true; actor.hand.splice(index, 1); window.BattleCards?.put(state.battle, actor, heart, "discard", { showDiscard: true }); card.suit = heart.suit;
    const amount = visibleHand(actor).length + deps.statOf(actor, "magic");
    line(state, actor, "偶像之吻", target);
    window.NonokaIdolSkinFX?.kiss?.(state, actor, target);
    heal(state, actor, amount, actor, deps);
    if (target.uid !== actor.uid) heal(state, target, amount, actor, deps);
    window.BattleLog.add(state, `${actor.name} 弃置♥${heart.name}发动偶像之吻，双方各恢复${amount}点生命。`);
    if (target.gender === "male" && target.ref !== "loki") triggerGreenHat(state, target);
    return true;
  }
  function heal(state, target, amount, actor, deps) {
    const healed = window.EnemySkills?.beforeHeal?.(state, target, amount, actor, { name: "偶像之吻" }, deps.damage) ?? Math.min(target.maxHp - target.hp, Math.max(0, amount));
    if (healed > 0) {
      target.hp = Math.min(target.maxHp, target.hp + healed);
      window.BattleStats?.heal?.(state.battle, actor, healed);
      deps.pushFloat(state.battle, target.uid, "heal", healed);
      window.EnemySkills?.clearHolyScar?.(state, target);
      window.EnemySkills?.onHeal?.(state, deps.draw);
      window.ElranaAceNanaliSkills?.afterHeal?.(state, target, deps);
      window.BertisGerlotSkills?.refreshArrogance?.(state);
    }
  }
  function triggerGreenHat(state, kissed) {
    state.battle.allies.filter(unit => unit.ref === "loki" && unit.hp > 0).forEach(loki => {
      if (!window.GreenHat.grant(loki)) return;
      line(state, loki, "青春草原");
      window.BattleLog.add(state, `${loki.name} 因${kissed.name}获得绿帽标记${loki.greenHat}/${window.GreenHat.MAX}，手牌上限、杀意上限各+1，攻击力+30%。`);
    });
  }
  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "loki" || !isKillCard(card)) return amount;
    const own = visibleHand(actor).filter(isKillCard).length + 1, other = visibleHand(target).filter(isKillCard).length;
    if (own <= other) return amount;
    line(state, actor, "智障力大");
    window.BattleLog.add(state, `${actor.name} 的杀牌数${own}大于${target.name}的${other}，智障力大使本次杀伤害翻倍。`);
    return amount * 2;
  }
  function protectNonoka(state, actor, target, card, deps) {
    if (!isKillCard(card) || card?.lokiProtectDone || target?.ref !== "nonoka") return target;
    const loki = state.battle.allies.find(unit => unit.ref === "loki" && unit.hp > 0);
    if (!loki) return target;
    card.lokiProtectDone = true;
    const dodge = card?.ignoreResponse ? null : loki.hand.find(item => item.name === "闪" && item.type === "response" && !item._pendingDraw && (!card?.blackDodgeOnly || item.suit === "♠" || item.suit === "♣"));
    line(state, loki, "护母心切");
    if (dodge) {
      const visualHandBefore = window.BattleCards.visibleHandCount(loki);
      loki.hand.splice(loki.hand.indexOf(dodge), 1); window.BattleCards?.put(state.battle, loki, dodge, "discard", { skipAnim: true });
      window.BattleCards?.queueResponse?.(state.battle, loki,
        { type: "response", id: `lp${deps.nextAnim()}`, uid: loki.uid, side: loki.side, card: dodge },
        visualHandBefore);
      window.BattleLog.add(state, `${loki.name} 触发护母心切，代替${target.name}使用闪抵消本次杀。`);
      afterCardResponded(state, loki, actor, dodge, deps);
      return null;
    }
    window.BattleLog.add(state, `${loki.name} 触发护母心切，${card?.ignoreResponse ? "但本次杀不可响应，" : "没有闪，"}代替${target.name}承受本次杀。`);
    return loki;
  }
  function sourceLabel(battle, actor, source) {
    const mimic = sourceActor(battle, actor);
    return mimic ? `${mimic.name}（${source}）` : source;
  }
  function sourceActor(battle, actor) {
    const mimic = actor?.mimicUid && findUnit(battle, actor.mimicUid);
    return alive(mimic) ? mimic : null;
  }
  return {
    afterCardPlayed, afterCardResponded, handleSpecialCard,
    beginTurn: window.NonokaNewMoonSkills.beginTurn,
    endTurn: window.NonokaNewMoonSkills.endTurn,
    toggleNewMoonCard: window.NonokaNewMoonSkills.toggleCard,
    resolveNewMoonShare: window.NonokaNewMoonSkills.resolveShare,
    modifySlashDamage, protectNonoka, sourceLabel, sourceActor,
  };
})();
