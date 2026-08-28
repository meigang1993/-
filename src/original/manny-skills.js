window.MannySkills = (() => {
  const weapons = [
    { id: "ak47", name: "刺刀AK47", type: "trigger", icon: "🔵", text: "当你使用实体单体【杀】指定唯一目标时，此【杀】结算两次。当你受到伤害后，若伤害来源存活，你可以视为对其使用一张虚拟【杀（普攻）】。" },
    { id: "barrett", name: "巴特雷", type: "active", icon: "⚔️", text: "出牌阶段限一次，你进行判定并记录判定牌花色。本回合，你使用与记录花色相同的单体【杀】造成的伤害翻倍，且不可被响应。", card: { name: "巴特雷", type: "tactic", mannyBarrett: true, targetless: true, icon: "⚔️", text: "进行判定并记录判定牌花色；本回合，与记录花色相同的单体【杀】造成的伤害翻倍，且不可被响应。" } },
    { id: "cannon", name: "反坦克炮", type: "passive", icon: "⭐", text: "锁定技，你使用的单体【杀】无视护甲；此【杀】造成生命伤害后，目标获得“刺弹”标记。拥有“刺弹”标记的角色受到伤害时，移去该标记，然后对其同阵营所有角色造成5+你攻击力点无视护甲伤害。" },
    { id: "flamer", name: "聚焦喷火器", type: "passive", icon: "⭐", text: "锁定技，你使用的单体【杀】附加火属性并改为指定所有敌方角色为目标；每名未倒下的目标连续受到2次不可被响应的伤害。" },
  ];
  const black = c => c?.suit === "♠" || c?.suit === "♣";
  const singleSlash = c => window.CardUtils.isSingleKill(c);
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const alive = u => u && u.hp > 0;
  const markStatus = (target, status) => { target.statuses ||= []; if (!target.statuses.includes(status)) target.statuses.push(status); };
  const virtualCard = (name, extra = {}) => window.CardUtils.fromEntity(name, extra);
  const dimensionTransferVisible = battle =>
    window.BattleLines?.promptVisible?.(battle, "dimensionTransfer")
    ?? !!(battle?.dimensionTransfer && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);
  function activeWeapon(actor) { return weapons.find(w => w.id === actor?.mannyWeapon); }
  function skills(unit) { const w = activeWeapon(unit); return w ? [{ ...w, source: "derived", showInSkillInfo: true }] : []; }
  function chooseArmory(state, actor) { if (!state?.battle || !actor || actor.usedMannyArmory) return; state.battle.mannyArmoryPicker = { uid: actor.uid }; }
  function activateArmory(state, actor, weaponId) {
    const i = Math.max(0, weapons.findIndex(w => w.id === weaponId));
    actor.usedMannyArmory = true; actor.mannyWeaponIndex = i; actor.mannyWeapon = weapons[i].id; actor.usedBarrett = false; actor.mannyBarrettSuit = null; state.battle.mannyArmoryPicker = null;
    window.BattleLines?.skill(state, actor, "次元军火库");
    window.MannyGunSkinFX?.armory?.(state, actor, weapons[i].id);
    window.BattleLog.add(state, `${actor.name} 激活重火器：${weapons[i].name}。`);
  }
  function barrett(state, actor) {
    if (actor.usedBarrett) return;
    actor.usedBarrett = true;
    window.BattleLines?.skill(state, actor, "巴特雷");
    window.MannyGunSkinFX?.barrettJudge?.(state, actor);
    window.BattlePileStats?.reshuffle(actor);
    const card = actor.deck.pop() || { suit: "♠", name: "判定" };
    actor.discard.push(card); actor.mannyBarrettSuit = card.suit;
    state.battle.animQueue?.push({ type: "judgement", id: `mb${Date.now()}`, skill: "巴特雷", suit: card.suit, name: card.name, card, discardTo: actor.discard, success: true });
    window.BattleLog.add(state, `${actor.name} 架起巴特雷，记录花色${card.suit}。`);
  }
  function beforeSlash(state, actor, target, card) {
    if (actor?.ref !== "manny") return;
    const single = singleSlash(card), weapon = activeWeapon(actor)?.id;
    const flamer = weapon === "flamer" && card?._tempSweep;
    const weaponFx = weapon && (weapon !== "barrett" || (actor.mannyBarrettSuit && card.suit === actor.mannyBarrettSuit));
    if ((single && weaponFx) || (flamer && !card._mannyFlamerFxShown)) {
      if (flamer) card._mannyFlamerFxShown = true;
      window.MannyGunSkinFX?.weaponAttack?.(state, actor, target, weapon);
    }
    if (!single) return;
    if (actor.mannyWeapon === "barrett" && actor.mannyBarrettSuit && card.suit === actor.mannyBarrettSuit) { card.mannyDouble = true; if (!card.ignoreResponse) card._tempIgnoreResponse = true; card.ignoreResponse = true; window.BattleLines?.skill(state, actor, "巴特雷"); }
    if (actor.mannyWeapon === "cannon") { if (!card.ignoreBlock) card._tempIgnoreBlock = true; card.ignoreBlock = true; window.BattleLines?.skill(state, actor, "反坦克炮"); }
  }
  function transferSlash(state, actor, target, amount, source, card) {
    const b = state.battle, manny = b?.allies.find(u => u.ref === "manny" && u.hp > 0);
    if (target?.side !== "ally" || !manny || !singleSlash(card) || card.dimensionTransferred) return false;
    const hasCost = manny.hand.some(c => black(c) && !c._pendingDraw), foes = b.enemies.filter(e => e.hp > 0);
    if (!hasCost || !foes.length) return false;
    const transferCard = { ...card, dimensionTransferred: true, skipDamageModify: true, _entitySourceCard: card._entitySourceCard || card };
    if (card.lockSuitResponse) { delete transferCard.ignoreResponse; delete transferCard.lockSuitResponse; }
    b.dimensionTransfer = { actorUid: actor?.uid, targetUid: target.uid, mannyUid: manny.uid, amount, source, costIndex: null, card: transferCard };
    b.locked = true;
    window.BattleLines?.skillWhenPromptVisible?.(
      state, manny, "次元转移", target, "dimensionTransfer", b.dimensionTransfer);
    window.BattleLog.add(state, `${manny.name} 可发动次元转移保护${target.name}：请选择1张黑色手牌，再指定一名敌人承受${source}。`);
    return true;
  }
  function selectDimensionTransferCard(state, index) {
    const b = state?.battle, p = b?.dimensionTransfer, manny = b?.allies.find(u => u.uid === p?.mannyUid);
    const card = manny?.hand?.[index];
    if (!p || !dimensionTransferVisible(b) || !manny
      || !black(card) || card._pendingDraw) return false;
    p.costIndex = p.costIndex === index ? null : index;
    return true;
  }
  function resolveDimensionTransfer(state, targetUid, damage) {
    const b = state.battle, p = b?.dimensionTransfer, units = b?.allies.concat(b.enemies) || [];
    const manny = units.find(u => u.uid === p?.mannyUid), actor = units.find(u => u.uid === p?.actorUid), originalTarget = units.find(u => u.uid === p?.targetUid);
    const target = targetUid ? b?.enemies.find(e => e.uid === targetUid && e.hp > 0) : originalTarget;
    if (!b || !p || !dimensionTransferVisible(b)
      || !manny || !originalTarget || !target) return false;
    let cost = null;
    if (targetUid) {
      const i = p.costIndex, selected = manny.hand[i];
      if (!black(selected) || selected._pendingDraw) return false;
      cost = manny.hand.splice(i, 1)[0];
      window.BattleCards?.put(b, manny, cost, "discard", { showDiscard: true });
    }
    b.dimensionTransfer = null; b.locked = false;
    if (cost) {
      window.BattleLog.add(state, `${manny.name} 弃置${cost.suit}${cost.name}发动次元转移，将${p.source}转移给${target.name}。`);
      window.MannyGunSkinFX?.dimensionTransfer?.(state, manny, originalTarget, target);
    } else window.BattleLog.add(state, `${manny.name} 放弃发动次元转移，${originalTarget.name}继续承受${p.source}。`);
    if (targetUid) damage(state, target, p.amount, p.source, actor, p.card);
    else {
      const rootDamage = !b._damageDepth;
      b._damageDepth = (b._damageDepth || 0) + 1;
      try {
        (damage.hitWithoutDodge || damage)(
          state, actor, target, p.amount, p.source, p.card);
      } finally {
        b._damageDepth -= 1;
        if (rootDamage) damage.finalizeDamage?.(state);
      }
    }
    window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, p.card);
    if (actor?.hp <= 0 && b.manualDodgeResume?.actorUid === actor.uid) {
      b.manualDodgeResume = null;
    }
    return true;
  }
  function afterDamage(state, actor, target, card, hpLoss, damage, directDamage) {
    if (!hpLoss) return;
    if (target?.spikeShell && !card?.spikeExplosion) { explodeSpike(state, target, damage, directDamage); return; }
    if (!alive(target)) return;
    if (actor?.ref === "manny" && singleSlash(card) && actor.mannyWeapon === "cannon") markSpike(state, actor, target);
    if (target?.ref === "manny" && target.hp > 0 && target.mannyWeapon === "ak47" && actor?.hp > 0 && !card?.mannyCounter) {
      if (window.BattleCounterTriggers?.open(state, {
        skill: "刺刀AK47", unitUid: target.uid, sourceUid: actor.uid, targetUid: actor.uid,
      })) return;
      resolveCounterTrigger(state, target, actor, { damage });
    }
  }
  function resolveCounterTrigger(state, target, actor, api) {
    window.BattleLines?.skill(state, target, "刺刀AK47");
    window.MannyGunSkinFX?.weaponAttack?.(state, target, actor, "ak47");
    const counter = virtualCard("杀（普攻）", { mannyCounter: true });
    if (window.MannyGunSkinFX?.active?.(target)) {
      counter._playedFlightDone = true;
      counter._playedTargetUid = actor.uid;
    }
    api.damage(state, actor, stat(target, "attack"), "刺刀AK47", target, counter);
  }
  function markSpike(state, actor, target) { if (!alive(target) || target.spikeShell) return; target.spikeShell = { ownerUid: actor.uid, attack: stat(actor, "attack") }; markStatus(target, "刺弹"); window.MannyGunSkinFX?.spikeMark?.(state, actor, target); window.BattleLog.add(state, `${target.name} 被施加刺弹标记。`); }
  function explodeSpike(state, target, damage, directDamage) {
    const spike = target.spikeShell, owner = state.battle.allies.concat(state.battle.enemies).find(u => u.uid === spike?.ownerUid);
    target.spikeShell = false; target.statuses = (target.statuses || []).filter(s => s !== "刺弹");
    const amount = 5 + (spike?.attack || 0), group = target.side === "enemy" ? state.battle.enemies : state.battle.allies;
    window.MannyGunSkinFX?.spikeBurst?.(state, owner, target, group);
    const source = owner || target, card = { name: "刺弹爆炸", type: "skill", spikeExplosion: true };
    const actions = group.filter(alive).map(unit =>
      window.BattleReactionQueue?.directDamageAction?.(source, unit, amount, "刺弹爆炸", { ...card }, 120)).filter(Boolean);
    if (actions.length && window.BattleReactionQueue?.enqueue?.(state, actions)) return;
    group.filter(alive).forEach(unit => directDamage(state, unit, amount, "刺弹爆炸", source, 120, card));
  }
  return {
    weapons, skills, chooseArmory, activateArmory, barrett, beforeSlash,
    transferSlash, dimensionTransferVisible, selectDimensionTransferCard,
    resolveDimensionTransfer, afterDamage, resolveCounterTrigger,
  };
})();
