window.GuestCharacterSkills = (() => {
  const alive = unit => unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const black = card => card?.suit === "♠" || card?.suit === "♣";
  const isSlash = card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const countsForLimit = (unit, card) => !(unit?.ref === "besta" && hasSkill(unit, "黑暗之力") && black(card));
  const visibleHandCount = unit => visible(unit).filter(card => countsForLimit(unit, card)).length;
  const stat = (unit, key) => (unit.stats?.[key] || 0) + (key === "attack" ? (unit.tempAttack || 0) : key === "magic" ? (unit.tempMagic || 0) : 0);
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);
  const guard = window.GuestOpheliaGuard({ alive, visible, isSlash, line });
  const virtualCard = (name, extra = {}) => window.CardUtils.fromEntity(name, extra);
  const queenTailCard = (actor, card) =>
    actor?.ref === "ophelia" && !card?._skipUseKillTriggers
    && (card?._queenTailConverted
      || window.CardUtils?.isPhysicalSingleKill?.(actor, card));

  function prepareQueenTail(actor, card) {
    if (!queenTailCard(actor, card)) return false;
    if (!card._queenTailConverted) {
      card._tempQueenTailBase = ["scale", "attackType"].map(key => ({
        key, present: Object.hasOwn(card, key), value: card[key],
      }));
      card._queenTailConverted = true;
    }
    card.scale = "magic";
    card.attackType = "magic";
    return true;
  }

  function beginTurn(state, unit) {
    if (unit?.ref === "besta" && hasSkill(unit, "黑暗之力")) line(state, unit, "黑暗之力");
  }
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    const aileng = window.GuestAilengSkills.handleSpecialCard(state, actor, target, card, deps, ctx);
    if (aileng) return aileng;
    if (card.bestaEndSlash) return bestaEndSlash(state, actor, deps);
    return false;
  }
  function bestaEndSlash(state, actor, deps) {
    if (actor.usedBestaEndSlash) return false;
    const cards = visible(actor).filter(black);
    if (!cards.length) { window.BattleLog.add(state, `${actor.name} 发动终焉鬼影斩失败：没有可转化的黑色牌。`); return false; }
    if (!state.battle.enemies.some(alive)) { window.BattleLog.add(state, `${actor.name} 发动终焉鬼影斩失败：没有可攻击目标。`); return false; }
    actor.usedBestaEndSlash = true; line(state, actor, "终焉鬼影斩");
    cards.forEach(card => {
      actor.hand.splice(actor.hand.indexOf(card), 1); window.BattleCards?.put(state.battle, actor, card, "discard");
      const foes = state.battle.enemies.filter(alive), target = window.GameRandom.sample(foes, state); if (!target) return;
      const slash = window.CardUtils.convertAs("魔杀", card, { dark: true, _entitySourceCard: card });
      state.battle.animQueue?.push({ type: "virtualPlay", id: window.GameRandom.id("be"), uid: actor.uid, side: actor.side, targetUid: target.uid, card: slash, slashText: true });
      deps.damage(state, target, stat(actor, "magic"), "终焉鬼影斩", actor, slash);
    });
    window.BattleLog.add(state, `${actor.name} 发动终焉鬼影斩，将${cards.length}张黑色手牌转化为魔杀。`); return true;
  }
  function modifySlashDamage(state, actor, target, amount, card) {
    if (actor?.ref !== "ophelia" && actor?.ref !== "besta") return amount;
    if (queenTailCard(actor, card)) {
      card._queenTailSpoken = true; line(state, actor, "女王之尾", target);
      return amount;
    }
    if (!isSlash(card) || card.scale !== "attack" || actor.ref === "ophelia") return amount;
    const replaceAttackWithMagic = () => Math.max(0, amount - stat(actor, "attack") + stat(actor, "magic"));
    const converted = window.CardUtils?.damageStatKey?.(actor, card) === "magic";
    if (actor.ref === "besta" && black(card)) { card.dark = true; line(state, actor, "黑暗之力", target); return converted ? amount : replaceAttackWithMagic(); }
    return amount;
  }
  function afterDamage(state, actor, target, card, hpLoss, api) {
    window.GuestAilengSkills.afterDamage(state, actor, hpLoss);
    if (target?.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(target)) onDeath(state, target, actor, api);
  }
  function afterCardPlayed(state, actor, target, card, deps) {
    window.GuestAilengSkills.afterCardPlayed(state, actor, card);
  }
  function afterCardResolved(state, actor, target, card, deps) {
    if ((card?.totalHpLoss || 0) <= 0 || card?._skipUseKillTriggers
      || !queenTailCard(actor, card)) return;
    queenTailDiscard(state, actor, target, card, deps?.useCard);
  }
  function queenTailDiscard(state, actor, target, card, useCard) {
    if (!card?._queenTailSpoken) line(state, actor, "女王之尾", target);
    const discarded = visible(target)[0]; if (!discarded) return;
    target.hand.splice(target.hand.indexOf(discarded), 1);
    const status = window.BattleStatusCards?.isStatus?.(discarded);
    window.BattleCards?.put(state.battle, target, discarded, status ? "consumed" : "discard", { forcedDiscard: true });
    const repeat = isSlash(discarded) && actor.hp > 0 && target.hp > 0
      && !state.battle?.locked && typeof useCard === "function";
    const action = status ? "移除并消耗" : "弃置";
    window.BattleLog.add(state, `${actor.name} 的女王之尾${action}${target.name}一张${discarded.name}${repeat ? "，对同一目标再次使用此杀" : ""}。`);
    if (!repeat) return;
    const source = card._entitySourceCard || card;
    const replay = window.CardUtils.clean(card, {
      _skipHandMove: true, noIntentCost: true,
      skipMvpCardCount: true, _queenTailSpoken: true,
      _queenTailConverted: true,
      _entitySourceCard: source,
    });
    useCard(state, actor, target, replay);
  }
  function onDeath(state, dead, killer, api) {
    const battle = state.battle; battle.guestDeathUids ||= []; if (battle.guestDeathUids.includes(dead.uid)) return; battle.guestDeathUids.push(dead.uid);
    window.GuestAilengSkills.onDeath(state);
    battle.allies.filter(unit => unit.ref === "ophelia" && alive(unit)).forEach(unit => {
      unit.opheliaIntentBonus = (unit.opheliaIntentBonus || 0) + 1; unit.intentMaxBonus = (unit.intentMaxBonus || 0) + 1;
      if (killer?.uid === unit.uid) { unit.opheliaIntentBonus += 1; unit.intentMaxBonus += 1; unit.intent = (unit.stats.bloodlust || 1) + unit.intentMaxBonus; }
      if (["lokar", "aileng"].includes(dead.ref)) api?.draw?.(unit, 3, battle);
      line(state, unit, dead.ref === "lokar" ? "食人鱼公主罗卡尔" : dead.ref === "aileng" ? "食人鱼公主艾伦格" : "食人鱼公主", dead);
    });
  }
  function afterDodge(state, actor, target, card, api) {
    if (target?.ref !== "besta" || !alive(target)) return;
    const count = visible(target).filter(item => black(item) && isSlash(item)).length, foes = state.battle.enemies.filter(alive); if (!count || !foes.length) return;
    line(state, target, "终焉回旋斩", actor);
    for (let i = 0; i < count; i++) {
      const targets = foes.filter(alive), slash = virtualCard("魔杀", { allTargets: targets.map(enemy => enemy.uid), aoeLineShown: true });
      if (!targets.length) break;
      state.battle.animQueue?.push({ type: "virtualPlay", id: window.GameRandom.id("br"), uid: target.uid, side: target.side, targetUids: slash.allTargets, card: slash, slashText: true });
      window.EnemySkills?.beforeKillUsed?.(state, target, slash);
      targets.forEach(enemy => api.damage(state, enemy, stat(target, "magic"), "终焉回旋斩", target, window.EnemySkills?.prepareGroupKillTarget?.(state, target, enemy, slash) || slash));
    }
    window.BattleLog.add(state, `${target.name} 触发终焉回旋斩，使用${count}张指定所有敌方角色为目标的虚拟魔杀。`);
  }
  return {
    skills: window.GuestAilengSkills.skills,
    chargeSkill: window.GuestAilengSkills.chargeSkill,
    normalizeSkills: window.GuestAilengSkills.normalizeSkills,
    beginTurn,
    endTurn: window.GuestAilengSkills.endTurn,
    handleSpecialCard, prepareQueenTail, modifySlashDamage,
    guardOphelia: guard.guardOphelia,
    guardVisible: guard.guardVisible,
    resolveOpheliaGuard: guard.resolveOpheliaGuard,
    afterCardPlayed, afterCardResolved,
    afterDamage, afterDodge,
    resolveBattleDrill: window.GuestAilengSkills.resolveBattleDrill,
    visibleHandCount, countsForLimit,
  };
})();
