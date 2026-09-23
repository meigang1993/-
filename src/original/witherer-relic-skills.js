window.WithererRelicSkills = (() => {
  const isSlash = c => window.CardUtils?.isKillCard?.(c) || c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "");
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const sameSide = (b, u) => u?.side === "enemy" ? b.enemies : b.allies;
  const hasSkill = (u, name) => (u?.skills || []).some(s => s.name === name);
  const teamOf = (battle, unit) => {
    if (battle?.allies?.includes(unit)) return battle.allies;
    if (battle?.enemies?.includes(unit)) return battle.enemies;
    return null;
  };
  const validRelicActor = (state, actor, relic) => actor?.hp > 0
    && !!teamOf(state?.battle, actor)
    && !!window.RelicSystem?.hasEquipped?.(state, actor, relic);
  const livingOpponent = (battle, actor, target) => {
    const team = teamOf(battle, actor), targetTeam = teamOf(battle, target);
    return target?.hp > 0 && !!team && !!targetTeam && team !== targetTeam;
  };
  function canUseTongueActive(state, actor, target, useCard) {
    return validRelicActor(state, actor, "1124号长舌头")
      && livingOpponent(state?.battle, actor, target)
      && !actor.usedWithererTongue && (actor.intent || 0) <= 0
      && typeof useCard === "function";
  }
  function useWarHorn(state, actor, draw, intentMax) {
    actor.intent = intentMax?.(actor) || actor.stats?.bloodlust || 1;
    const team = sameSide(state.battle, actor).filter(u => u.hp > 0);
    const blocked = team.filter(u => u.drawLockedThisTurn).length;
    team.forEach(u => drawRandomSlash(state, u));
    window.BattleLog.add(state,
      `${actor.name} 使用战争号角，杀意重置并令我方角色随机获得杀牌${blocked ? `；${blocked}名封魔角色无法摸牌` : ""}。`);
    return true;
  }
  function drawRandomSlash(state, unit) {
    if (unit?.drawLockedThisTurn) return false;
    window.BattlePileStats?.reshuffle(unit);
    const indexes = unit.deck.map((c, i) => isSlash(c) ? i : -1).filter(i => i >= 0);
    if (!indexes.length) return false;
    const [card] = unit.deck.splice(window.GameRandom.sample(indexes, state), 1);
    const recipient = window.SakuraRisaSkills?.drawRecipient?.(unit, state.battle) || unit;
    if (state.battle.animQueue) card._pendingDraw = true;
    recipient.hand.push(card);
    state.battle.animQueue?.push({ type: "drawBatch", uid: recipient.uid, side: recipient.side, count: 1, cards: [card] });
    window.SakuraRisaSkills?.onDrawRedirected?.(state.battle, unit, recipient, 1);
    return true;
  }
  function useTongueActive(state, actor, target, sourceCard, useCard) {
    if (typeof sourceCard === "function") {
      useCard = sourceCard;
      sourceCard = null;
    }
    if (!canUseTongueActive(state, actor, target, useCard)) return false;
    actor.usedWithererTongue = true;
    const slash = window.CardUtils.cloneEntity("勒杀", {
      virtual: true, _skill: true, noIntentCost: true,
      _entitySourceCard: sourceCard,
    });
    window.BattleLog.add(state, `${actor.name} 发动1124号长舌头，视为使用勒杀。`);
    useCard(state, actor, target, slash);
    return true;
  }
  function applyBloodMemory(state, unit) {
    if (!hasSkill(unit, "鲜血之忆")) return;
    const level = Math.min(5, Math.floor(((unit.maxHp - unit.hp) / Math.max(1, unit.maxHp)) * 5 + 1e-6));
    const old = unit.withererBloodMemory || 0, gain = Math.max(0, level - old);
    if (!gain) return;
    unit.withererBloodMemory = level;
    unit.stats.bloodlust = Math.min(99, (unit.stats.bloodlust || 1) + gain);
    unit.stats.drawPerTurn = (unit.stats.drawPerTurn || 0) + gain;
    window.BattleLines?.skill(state, unit, "鲜血之忆");
    window.BattleLog.add(state, `${unit.name} 的鲜血之忆触发，杀意上限和每回合摸牌各+${gain}。`);
  }
  function prepare(state, unit, damage) {
    applyBloodMemory(state, unit);
    if (!unit.withererChoke || unit.hp <= 0) return;
    const source = state.battle.allies.concat(state.battle.enemies).find(u => u.uid === unit.withererChoke.sourceUid) || unit;
    damage?.(state, unit, unit.withererChoke.amount, "勒脖", source, { name: "勒脖", type: "skill", ignoreResponse: true, skipDamageModify: true });
  }
  function afterDamage(state, actor, target, card, hpLoss, damage, draw, pushFloat) {
    applyBloodMemory(state, target);
    if (!hpLoss) { afterKillFailed(state, actor, card); return; }
    if (card?.strangleKill) {
      const choke = () => markChoke(state, actor, target);
      if (!(damage?.delayUntilHitSettled?.(state, choke)
        || window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, choke))) choke();
    }
    if (isSlash(card)) drainHandLimit(state, actor, target);
    healOtherByChest(state, target, damage, draw, pushFloat);
    grantScytheTurn(state, actor, target);
  }
  function grantScytheTurn(state, actor, target) {
    if (actor.side === target.side || target.hp > 0 || window.SakuraRisaSkills?.pendingRevival?.(target) || !window.RelicSystem?.hasEquipped?.(state, actor, "1124号镰刀")) return;
    const key = `${actor.uid || actor.id}:${target.uid || target.id}`, defeated = state.battle.withererScytheDefeated ||= [];
    if (defeated.includes(key)) return;
    defeated.push(key); actor.withererExtraTurns = (actor.withererExtraTurns || 0) + 1;
  }
  function markChoke(state, actor, target) {
    if (target.withererChoke) return;
    target.withererChoke = { sourceUid: actor.uid, amount: Math.max(1, Math.floor(stat(actor, "attack") / 2)) };
    target.statuses ||= []; target.statuses.push("勒脖");
    window.BattleLog.add(state, `${target.name} 获得勒脖标记。`);
  }
  function drainHandLimit(state, actor, target) {
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "凋零者长舌头")) return;
    if ((target.stats.handLimit || 0) <= 0) return;
    target.stats.handLimit -= 1; actor.stats.handLimit = (actor.stats.handLimit || 0) + 1;
    window.BattleLog.add(state, `${actor.name} 的长舌头吸取${target.name}1点手牌上限。`);
  }
  function healOtherByChest(state, target, damage, draw, pushFloat) {
    if (target.hp <= 0 || state.battle.withererChestHealing || !window.RelicSystem?.hasEquipped?.(state, target, "凋零者胸部")) return;
    const mate = sameSide(state.battle, target).filter(u => u.uid !== target.uid && u.hp > 0 && u.hp < u.maxHp).sort((a, b) => a.hp - b.hp)[0];
    if (!mate) return;
    const amount = Math.min(mate.maxHp - mate.hp, Math.max(0, stat(target, "magic"))), card = { name: "凋零者胸部" };
    if (!amount) return;
    state.battle.withererChestHealing = true;
    let allowed; try { allowed = window.EnemySkills?.beforeHeal?.(state, mate, amount, target, card, damage); } finally { state.battle.withererChestHealing = false; }
    const v = target.hp > 0 && mate.hp > 0 ? Math.min(mate.maxHp - mate.hp, Math.max(0, allowed ?? amount)) : 0;
    if (v > 0) {
      mate.hp += v; window.BattleStats?.heal?.(state.battle, target, v);
      pushFloat?.(state.battle, mate.uid, "heal", v);
      window.EnemySkills?.clearHolyScar?.(state, mate); window.EnemySkills?.onHeal?.(state, draw);
      window.ElranaAceNanaliSkills?.afterHeal?.(state, mate, { damage, draw, pushFloat }, target, card);
      window.BertisGerlotSkills?.refreshArrogance?.(state);
    }
    window.BattleLog.add(state, `${target.name} 的凋零者胸部触发，${mate.name}恢复${v}点生命。`);
  }
  function afterDodged(state, actor, target, card) {
    afterKillFailed(state, actor, card);
  }
  function afterKillFailed(state, actor, card) { if (isSlash(card) && !card?.virtual && !card?._skill && !card?.pursueKill) actor.pursueFreeThisTurn = true; }
  function endTurn(state, unit) {
    const count = unit.withererExtraTurns || 0;
    if (!count || !state.battle?.roundOrder) return;
    unit.withererExtraTurns = 0;
    state.battle.roundOrder.splice(state.battle.roundIndex, 0, ...Array(count).fill(unit.uid));
    window.BattleLog.add(state, `${unit.name} 的1124号镰刀触发，结束后追加${count}个回合。`);
  }
  function deflect(state, defender, actor, amount, source, card, damage, defenderChoice, options = {}) {
    const opts = ["石头", "剪刀", "布"], manual = opts.includes(defenderChoice);
    while (true) {
      const d = manual ? defenderChoice : window.GameRandom.sample(opts, state), a = window.GameRandom.sample(opts, state);
      if (d === a) { window.BattleLog.add(state, `${defender.name} 弹反猜拳：${d} 对 ${a}，平局，重新猜拳。`); options.onReveal?.({ defenderChoice: d, actorChoice: a, outcome: "tie" }); if (manual) return null; continue; }
      const win = (d === "石头" && a === "剪刀") || (d === "剪刀" && a === "布") || (d === "布" && a === "石头");
      window.BattleLog.add(state, `${defender.name} 弹反猜拳：${d} 对 ${a}，${win ? "成功反弹" : "弹反失败"}。`);
      options.onReveal?.({ defenderChoice: d, actorChoice: a, outcome: win ? "defender" : "actor" });
      if (win && !options.defer) damage(state, actor, amount, "弹反", defender, { ...card, name: "弹反", type: "skill", ignoreResponse: true, skipDamageModify: true });
      return win;
    }
  }
  return { useWarHorn, canUseTongueActive, useTongueActive, prepare, afterDamage, afterDodged, afterKillFailed, endTurn, deflect };
})();
