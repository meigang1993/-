window.BattleCardSpecials = (deps, ctx) => {
  const log = (state, text) => window.BattleLog.add(state, text);
  const reveal = (state, title, cards) => state.battle.animQueue?.push({ type: "revealCards", id: window.GameRandom.id("rv"), title, cards: cards.map(c => ({ ...c })) });
  const allUnits = battle => ctx.allUnits ? ctx.allUnits(battle) : (battle?.allies || []).concat(battle?.enemies || []);
  const activeRelics = window.BattleCardActiveRelics(deps, ctx);
  const visible = unit => (unit?.hand || []).filter(c => !c._pendingDraw);
  const interactions = window.BattleCardInteractions(deps, ctx, { log, reveal, visible });
  function extractEssence(state, actor, target) {
    if (actor.usedExtract) return;
    const n = actor.hand.filter(c => c.suit === "♥" && !c._pendingDraw).length;
    actor.usedExtract = true;
    window.BattleLines?.skill(state, actor, "榨取精华", target);
    const magicBonus = Math.max(0, Number(actor.stats?.magic) || 0) * .5 * n;
    actor.tempMagic = (actor.tempMagic || 0) + magicBonus; actor.extractMagicAttack = true;
    window.CharacterSkinFX?.extractEssence?.(state, actor, target, n);
    if (!n) { log(state, `${actor.name} 发动榨取精华：当前没有可见红桃，魔力不变，本回合物理攻击牌仍转换为魔法攻击。`); return; }
    const hpBefore = target.hp; ctx.holdVisual(target); target.hp = Math.max(0, target.hp - n); window.SakuraRisaSkills?.preventDeath?.(state, target); window.BattleStats?.damage?.(state.battle, actor, target, Math.min(hpBefore, n), hpBefore); ctx.pushFloat(state.battle, target.uid, "hp-loss", n, false, 0, ctx.visualOf(target)); if (target.side === "enemy" && target.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(target) && target.id && !state.battle.defeatedEnemyIds.includes(target.id)) state.battle.defeatedEnemyIds.push(target.id);
    const drawn = deps.draw(actor, n, state.battle);
    const drawText = window.BattleDrawFeedback.action(actor, n, drawn);
    log(state, `${actor.name} 榨取${target.name}精华：目标损失${n}生命，${drawText}，本回合魔力+${n * 50}%（+${magicBonus}），所有物理攻击牌转换为魔法攻击。`);
  }
  function bloodPact(state, actor) {
    if (actor.usedBloodPact) return;
    const { i, ok } = ctx.selectedHand(state, actor);
    if (!ok) { log(state, `${actor.name} 发动热血契约失败：没有选择可消耗手牌。`); return; }
    actor.usedBloodPact = true; const consumed = ctx.moveHand(state, actor, i, "consumed"); const drawn = deps.draw(actor, 3, state.battle);
    const bonus = actor.consumed.length; actor.tempAttack = (actor.tempAttack || 0) + bonus;
    window.CharacterSkinFX?.bloodPact?.(state, actor, bonus);
    window.BattleLines?.skill(state, actor, "热血契约");
    log(state, `${actor.name} 消耗${consumed.name}发动热血契约：${window.BattleDrawFeedback.action(actor, 3, drawn)}，本回合攻击力+${bonus}。`);
  }
  function healUnit(state, actor, target, card) { const pct = card.name === "愈魔瓶" ? .3 : card.name === "伤口处理" ? .1 : (card.healPct || 0), flat = card.name === "愈魔瓶" || card.name === "伤口处理" ? 0 : (card.heal || 0), statHeal = card.healScale ? ctx.statOf(actor, card.healScale) : 0, v = Math.ceil((target.maxHp || 0) * pct) + flat + statHeal, healed = window.EnemySkills?.beforeHeal?.(state, target, v, actor, card, ctx.damage) ?? Math.min(target.maxHp - target.hp, v); if (healed > 0) { target.hp = Math.min(target.maxHp, target.hp + healed); window.BattleStats?.heal?.(state.battle, actor, healed); } ctx.pushFloat(state.battle, target.uid, "heal", healed); if (healed) { clearHolyScar(state, target); window.EnemySkills?.onHeal?.(state, deps.draw); window.ElranaAceNanaliSkills?.afterHeal?.(state, target, deps, actor); window.BertisGerlotSkills?.refreshArrogance?.(state); } log(state, `${actor.name} 对${target.name}使用${card.name}，恢复${healed}点生命。`); }
  function healTeam(state, actor, card, repeatTarget = null) {
    const statHeal = card.healScale ? ctx.statOf(actor, card.healScale) : 0;
    const targets = ctx.sameSideUnits(state.battle, actor).filter(u => u.hp > 0).map(u => ({ uid: u.uid, amount: Math.ceil(u.maxHp * card.teamHealPct) + statHeal }));
    return continueTeamHeal(state, { actorUid: actor.uid, targetUid: repeatTarget?.uid, card, targets, index: 0, any: false });
  }
  function continueTeamHeal(state, prompt) {
    const b = state.battle, units = allUnits(b), actor = units.find(u => u.uid === prompt.actorUid);
    if (!actor) return true;
    for (let i = prompt.index || 0; i < prompt.targets.length; i++) {
      const entry = prompt.targets[i], unit = units.find(u => u.uid === entry.uid && u.hp > 0);
      if (!unit) continue;
      const cap = Math.min(unit.maxHp - unit.hp, entry.amount);
      const blocked = cap > 0 && window.EnemySkills?.beforeHeal?.(state, unit, entry.amount, actor, prompt.card, ctx.damage) === 0;
      const healed = blocked ? 0 : cap;
      if (healed > 0) {
        unit.hp = Math.min(unit.maxHp, unit.hp + healed);
        window.BattleStats?.heal?.(b, actor, healed); clearHolyScar(state, unit); prompt.any = true;
        window.EnemySkills?.onHeal?.(state, deps.draw);
        window.ElranaAceNanaliSkills?.afterHeal?.(state, unit, deps, actor, { name: prompt.card.name });
      }
      ctx.pushFloat(b, unit.uid, "heal", healed);
      if (b.locked) { prompt.index = i + 1; b.groupHealResume = prompt; return false; }
    }
    b.groupHealResume = null;
    if (prompt.any) window.BertisGerlotSkills?.refreshArrogance?.(state);
    log(state, `${actor.name} 使用${prompt.card.name}，己方全体恢复生命。`);
    const target = units.find(u => u.uid === prompt.targetUid);
    repeatTactic(state, actor, target, prompt.card);
    return true;
  }
  function resumeTeamHeal(state) {
    const prompt = state.battle?.groupHealResume;
    if (!prompt || state.battle.locked) return false;
    state.battle.groupHealResume = null;
    return continueTeamHeal(state, prompt);
  }
  function clearHolyScar(state, unit) { if (!unit?.holyScar) return; unit.holyScar = false; unit.statuses = (unit.statuses || []).filter(s => s !== "圣痕"); log(state, `${unit.name} 恢复生命，圣痕解除。`); }
  function drawTeam(state, actor, card) { const entries = ctx.sameSideUnits(state.battle, actor).filter(u => u.hp > 0).map(unit => ({ unit, cards: deps.draw(unit, card.drawTeam, state.battle) })); log(state, `${actor.name} 使用${card.name}，${window.BattleDrawFeedback.team(entries, card.drawTeam, "己方全体")}。`); }
  function sweepDamage(state, actor, amount, card, adjustDamage = null) {
    const foes = actor.side === "enemy" ? state.battle.allies : state.battle.enemies, alive = foes.filter(u => u.hp > 0), targetUids = alive.map(u => u.uid), sweepCard = { ...card, targetless: true, allTargets: targetUids, targetUids, aoeLineShown: true, _entitySourceCard: card }, times = card.gatlingRepeats || 1;
    delete sweepCard.lastHpLoss; delete sweepCard.totalHpLoss; window.EdisSkills?.copyTargetedCards?.(state, actor, alive, card);
    if (!card._playedFlightDone && !state.battle._manualGroupFlightShown) state.battle.animQueue?.push({ type: "virtualPlay", id: `aoe${deps.nextAnim()}`, uid: actor.uid, side: actor.side, targetUids, card: sweepCard, enemyLine: actor.side === "enemy", show: false, slashText: true });
    log(state, `${actor.name} 使用${card.name}，敌方全体受到扫射。`);
    for (let ti = 0; ti < alive.length; ti++) {
      const u = alive[ti], targetAmount = adjustDamage ? adjustDamage(u, amount) : amount, targetCard = window.EnemySkills?.prepareGroupKillTarget?.(state, actor, u, { ...sweepCard, targetUids, nextTargetIndex: ti + 1 }) || { ...sweepCard, targetUids, nextTargetIndex: ti + 1, _risaTargetedHit: true };
      for (let i = 0; i < times && u.hp > 0; i++) {
        const hitCard = { ...targetCard };
        if (i > 0) hitCard._extraSlashResolution = true;
        ctx.damage(state, u, targetAmount, card.name, actor, hitCard);
        if (hitCard.totalHpLoss) { card.totalHpLoss = (card.totalHpLoss || 0) + hitCard.totalHpLoss; card.lastHpLoss = hitCard.lastHpLoss; }
        const group = { card: sweepCard, targetUids, nextTargetIndex: ti + 1 };
        if (window.BattleReactionQueue?.captureHitContinuation?.(state.battle, actor, u, targetAmount, card.name, targetCard, times - i - 1, group)) return;
      }
    }
  }
  function prepareGreenGatling(state, actor, target, card) { if (!target || !card._playedFromHand || !window.CardUtils?.isEntitySingleKill?.(card) || actor.usedGreenGatling || !window.RelicSystem?.hasEquipped?.(state, actor, "格林机枪")) return; const queue = visible(actor).filter(c => deps.isKillCard(c)); if (!queue.length) return; actor.usedGreenGatling = true; card.greenGatlingQueue = queue; window.BattleLines?.skill(state, actor, "格林机枪", target); reveal(state, "格林机枪", queue); log(state, `${actor.name} 的格林机枪触发，展示手牌中的杀，后续追加杀不消耗杀意并集中攻击${target.name}。`); }
  function runGreenGatling(state, actor, target, card, queue) { card.greenGatlingQueue = null; for (let i = 0; i < queue.length; i++) { const slash = queue[i]; if (!state.battle || actor.hp <= 0 || target.hp <= 0) break; if (!actor.hand.includes(slash)) continue; slash.noIntentCost = true; ctx.useCard(state, actor, target, slash); if (state.battle?.locked) { card.greenGatlingQueue = queue.slice(i + 1); state.battle.greenGatlingResume = { actorUid: actor.uid, targetUid: target.uid, card }; break; } } }
  function resolveGreenGatling(state, actor, target, card) { if (!card.greenGatlingQueue?.length || state.battle?.locked) return; runGreenGatling(state, actor, target, card, card.greenGatlingQueue.slice()); }
  function resumeGreenGatling(state, actor, target, card) { const queue = card?.greenGatlingQueue; if (!queue?.length || state.battle?.locked) return; runGreenGatling(state, actor, target, card, queue.slice()); }
  const tactics = window.BattleCardTactics({
    log,
    ctx,
    deps,
    reveal,
    openHandReveal: interactions.openHandReveal,
  });
  function healBySyringe(state, actor, card) { const hpLoss = card.totalHpLoss || card.lastHpLoss || 0; if (!deps.isKillCard(card) || !hpLoss || !window.RelicSystem?.hasEquipped?.(state, actor, "艾尔拉娜大型注射器")) return; const team = ctx.sameSideUnits(state.battle, actor), target = team.filter(u => u.hp > 0 && u.hp < u.maxHp).sort((a, b) => a.hp - b.hp)[0]; if (!target) return; const v = window.EnemySkills?.beforeHeal?.(state, target, hpLoss, actor, card, ctx.damage) ?? Math.min(target.maxHp - target.hp, hpLoss); if (v > 0) { target.hp += v; window.BattleStats?.heal?.(state.battle, actor, v); ctx.pushFloat(state.battle, target.uid, "heal", v); clearHolyScar(state, target); window.EnemySkills?.onHeal?.(state, deps.draw); window.ElranaAceNanaliSkills?.afterHeal?.(state, target, deps, actor); window.BertisGerlotSkills?.refreshArrogance?.(state); } log(state, `${actor.name} 的艾尔拉娜大型注射器触发，${target.name}恢复${v}点生命。`); }
  function repeatTactic(state, actor, target, card) { if (state.battle?.locked || !card._playedFromHand || card._repeat || card._skill || card.type !== "tactic" || actor.usedKrowRecord || !window.RelicSystem?.hasEquipped?.(state, actor, "克罗研究记录")) return false; actor.usedKrowRecord = true; if (target?.hp <= 0) { log(state, `${actor.name} 的克罗研究记录触发，但目标已倒下，${card.name}不再额外结算。`); return false; } log(state, `${actor.name} 的克罗研究记录触发，${card.name}额外结算一次。`); ctx.useCard(state, actor, target, { ...card, _entitySourceCard: card._entitySourceCard || card, _skill: true, _repeat: true }); return true; }
  function queueBattleCourage(state, actor, target, card) { if (!actor || !target || !ctx.hasSkill(actor, "战斗之勇") || card.battleCourageDone || card.virtual) return; if (!deps.isKillCard(card) && card.name !== "与我一战") return; card.battleCourageDone = true; window.BattleLines?.skill(state, actor, "战斗之勇"); state.battle.animQueue?.push({ type: "battleCourage", uid: actor.uid, targetUid: target.uid, card }); }
  function triggerBattleCourage(state, evt) { const b = state.battle, owner = b?.allies.concat(b.enemies).find(u => u.uid === evt.uid), card = evt.card; if (!owner || !card) return null; const drawn = deps.draw(owner, 1, b) || [], hit = drawn.some(c => deps.isKillCard(c) || c.name === "与我一战"), before = owner.intent || 0; if (hit) owner.intent = Math.min(deps.intentMax(owner), before + 1); const restored = hit && owner.intent > before, result = drawn[0] ? `摸到${drawn[0].suit}${drawn[0].name}` : window.BattleDrawFeedback.action(owner, 1, drawn); log(state, `${owner.name} 触发战斗之勇，${result}${restored ? "，恢复1点杀意" : ""}。`); return { owner, restored }; }
  return {
    extractEssence, bloodPact,
    demonPoker: activeRelics.demonPoker,
    exchangeSelectedCards: activeRelics.exchangeSelectedCards,
    succubusFork: activeRelics.succubusFork,
    assassinLatex: activeRelics.assassinLatex,
    arsenal: activeRelics.arsenal,
    healUnit, healTeam, resumeTeamHeal, drawTeam, sweepDamage, prepareGreenGatling,
    resolveGreenGatling, resumeGreenGatling,
    discardTarget: interactions.discardTarget,
    stealCard: interactions.stealCard,
    soulChain: tactics.soulChain, magicDuel: tactics.magicDuel,
    magicBullet: tactics.magicBullet,
    duel: tactics.duel, comboAttack: tactics.comboAttack,
    resumeComboAttack: tactics.resumeComboAttack, borrowSlash: tactics.borrowSlash,
    demonInvasion: tactics.demonInvasion,
    counterTactic: interactions.counterTactic,
    healBySyringe, repeatTactic,
    resolveClash: interactions.resolveClash,
    queueBattleCourage, triggerBattleCourage,
  };
};
