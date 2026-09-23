window.BertisGerlotSkills = (() => {
  const alive = u => u && u.hp > 0;
  const hasSkill = (u, name) => (u?.skills || []).some(s => s.name === name);
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);
  const allUnits = b => b?.allies.concat(b.enemies) || [];
  const intentMax = u => Math.min(99, Math.max(1, u.stats?.bloodlust || 1));
  const isKill = c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "");
  const hasTargetLine = c => isKill(c) && !c?.virtual && !c?.sweep && !c?.targetless && !c?.allTargets && !c?.aoeLineShown;
  const headshotCard = c => c?._entitySourceCard || c;
  const virtualCard = (name, extra = {}) => window.CardUtils.fromEntity(name, extra);
  function skills(u) {
    const b = window.state?.battle;
    if (!b || u?.side !== "ally" || u.ref === "bertis" || !alive(u) || u.usedTakeFood) return [];
    const bertis = b.allies.find(x => x.ref === "bertis" && alive(x) && hasSkill(x, "快速生长"));
    return bertis ? [{ name: "取粮", type: "active", source: "derived", showInSkillInfo: false, icon: "⚔️", text: "出牌阶段限一次，你可以移去1枚队伍共享的“粮食”标记，然后摸两张牌。", card: { name: "取粮", type: "tactic", bertisTakeFood: true, targetless: true, icon: "⚔️", text: "移去1枚“粮食”标记，然后摸两张牌。" } }] : [];
  }
  function refreshArrogance(state) {
    allUnits(state?.battle).filter(u => u.ref === "bertis" && hasSkill(u, "傲慢雌小鬼")).forEach(u => {
      u.bertisBaseStats ||= { attack: u.stats.attack, magic: u.stats.magic, bloodlust: u.stats.bloodlust, handLimit: u.stats.handLimit };
      const full = u.hp >= u.maxHp;
      const wasArrogant = !!u.bertisArrogant;
      if (u.bertisArrogant !== full) setArrogant(u, full);
      if (wasArrogant !== !!u.bertisArrogant) window.BertisQueenSkinFX?.arrogance?.(state, u, u.bertisArrogant);
    });
  }
  function setArrogant(u, active) {
    const b = u.bertisBaseStats;
    const multipliers = active
      ? { attack: 1.5, magic: 1.5, bloodlust: 2, handLimit: 2 }
      : { attack: 1, magic: 1, bloodlust: 1, handLimit: 1 };
    Object.keys(multipliers).forEach(k => u.stats[k] = b[k] * multipliers[k]);
    u.bertisArrogant = active;
    u.intent = Math.min(intentMax(u), u.intent || 0);
  }
  function beginTurn(state, unit) {
    if (unit?.ref !== "bertis" || !hasSkill(unit, "傲慢雌小鬼")) return;
    line(state, unit, unit.hp >= unit.maxHp ? "傲慢雌小鬼满血" : "傲慢雌小鬼受伤");
  }
  function endTurn(state, unit) {
    if (unit?.ref !== "bertis" || !hasSkill(unit, "快速生长") || unit.hp <= 0) return;
    unit.food = (unit.food || 0) + 1;
    line(state, unit, "快速生长");
    window.BertisQueenSkinFX?.growth?.(state, unit, 1);
    window.BattleLog.add(state, `${unit.name} 获得1枚粮食标记（${unit.food}）。`);
  }
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (card.bertisWhip) return whip(state, actor, target, deps, ctx);
    if (card.bertisTakeFood) return takeFood(state, actor, deps);
    if (card.crazySlaughter) return slaughter(state, actor, ctx);
    return false;
  }
  function whip(state, actor, target, deps, ctx) {
    if (actor.usedBertisWhip || !target || target.side !== actor.side || target.uid === actor.uid) return true;
    actor.usedBertisWhip = true;
    const mult = target.ref === "gerlot" || target.ref === "nonoka" ? 2 : 1;
    line(state, actor, "苦肉鞭笞", target);
    window.BertisQueenSkinFX?.whip?.(state, actor, target, mult > 1);
    ctx.damage(state, target, stat(actor, "attack") * mult, "苦肉鞭笞", actor, { name: "苦肉鞭笞", type: "skill", ignoreResponse: true, skipDamageModify: true });
    const count = 2 * mult, drawn = deps.draw(actor, count, state.battle);
    actor.intent = Math.min(intentMax(actor), (actor.intent || 0) + mult);
    window.BattleLog.add(state, `${actor.name} 发动苦肉鞭笞，${mult > 1 ? `${target.name}使效果翻倍，` : ""}${window.BattleDrawFeedback.action(actor, count, drawn)}并恢复${mult}点杀意。`);
    return true;
  }
  function takeFood(state, actor, deps) {
    const bertis = state.battle.allies.find(u => u.ref === "bertis" && alive(u) && (u.food || 0) > 0);
    if (!bertis || actor.usedTakeFood) return true;
    actor.usedTakeFood = true; bertis.food -= 1; const drawn = deps.draw(actor, 2, state.battle);
    line(state, bertis, "取粮", actor);
    window.BertisQueenSkinFX?.takeFood?.(state, bertis, actor);
    window.BattleLog.add(state, `${actor.name} 取粮，消耗1枚粮食标记并${window.BattleDrawFeedback.action(actor, 2, drawn)}。`);
    return true;
  }
  function slaughter(state, actor, ctx) {
    if (actor.usedCrazySlaughter) return true;
    actor.usedCrazySlaughter = true;
    const n = Math.max(1, actor.actionCount || 0);
    line(state, actor, "疯狂屠戮");
    for (let i = 0; i < n; i++) ctx.useCard(state, actor, actor, virtualCard("机枪扫杀", { _skipHandMove: true, skipAfterCardPlayed: true, skipMvpCardCount: true }));
    window.BattleLog.add(state, `${actor.name} 发动疯狂屠戮，视为使用${n}张虚拟机枪扫杀。`);
    return true;
  }
  function afterDodge(state, actor, target, card, api) {
    if (!hasTargetLine(card) || card?.revengeCounter || !alive(actor)) return;
    const gerlot = state.battle.allies.find(u => u.ref === "gerlot" && alive(u) && hasSkill(u, "复仇反击"));
    const source = target?.ref === "bertis" ? gerlot : target;
    if (!alive(source) || !hasSkill(source, "复仇反击")) return;
    const skill = target.ref === "bertis" ? "护母反击" : "复仇反击";
    if (window.BattleCounterTriggers?.open(state, { skill, unitUid: source.uid, sourceUid: actor.uid, targetUid: actor.uid, count: 1 })) return;
    resolveRevengeTrigger(state, source, actor, 1, api);
  }
  function afterDamage(state, actor, target, card, hpLoss, api) {
    if (hpLoss && target?.ref === "bertis") window.BertisQueenSkinFX?.hit?.(state, target, actor);
    if (!hpLoss || card?.revengeCounter || !hasTargetLine(card) || target?.ref !== "bertis" || !alive(actor)) return;
    const gerlot = state.battle.allies.find(u => u.ref === "gerlot" && alive(u) && hasSkill(u, "复仇反击"));
    if (!gerlot) return;
    if (window.BattleCounterTriggers?.open(state, { skill: "贝尔蒂丝受伤反击", unitUid: gerlot.uid, sourceUid: actor.uid, targetUid: actor.uid, count: 2 })) return;
    resolveRevengeTrigger(state, gerlot, actor, 2, api);
  }
  function revengeSlash(state, api, source, target, times) {
    for (let i = 0; i < times && alive(source) && alive(target); i++) api.damage(state, target, stat(source, "attack"), "复仇反击", source, virtualCard("杀（普攻）", { revengeCounter: true }));
  }
  function resolveRevengeTrigger(state, source, target, times, api, skill = "复仇反击") {
    line(state, source, skill, target);
    revengeSlash(state, api, source, target, times);
  }
  function queueHeadshot(state, actor, target, amount, source, card, resume) {
    const b = state.battle, root = headshotCard(card);
    if (actor?.ref !== "gerlot" || !isKill(card)
      || root?.headshotDone || root?.headshotQueued || !b?.animQueue) return false;
    const judge = drawJudge(state, actor), success = !!judge?.suit && sameColor(judge.suit, root.suit);
    root.headshotQueued = true;
    root.headshotDone = true; root.headshotMultiplier = success ? 2 : 1; b.locked = true;
    line(state, actor, success ? "爆头成功" : "爆头失败");
    window.BattleLog.add(state, `${actor.name} 爆头一击判定：${judge?.suit || "?"}${judge?.name || "无牌"}，${success ? "伤害翻倍" : "未触发"}。`);
    b.animQueue.push({ type: "judgement", id: window.GameRandom.id("gh"), skill: "爆头一击", suit: judge.suit, name: judge.name, card: judge, discardTo: actor.discard, success, uid: actor.uid, runtimeRecovery: "restart", commit: () => { if (state.battle) state.battle.locked = false; resume?.(); } });
    return true;
  }
  function modifyIncomingDamage(state, actor, amount, card) {
    if (actor?.ref !== "gerlot" || !isKill(card)) return amount;
    return amount * (headshotCard(card)?.headshotMultiplier || 1);
  }
  function drawJudge(state, unit) {
    window.BattlePileStats?.reshuffle(unit, cards => window.GameRandom.shuffle(cards, state));
    const card = unit.deck.pop() || { suit: "?", name: "无牌" };
    if (card.suit !== "?" && !card._pendingDraw) unit.discard.push(card);
    return card;
  }
  const sameColor = (a, b) => !!a && !!b && (["♥", "♦"].includes(a) === ["♥", "♦"].includes(b));
  function afterAnyDeath(state) {
    const b = state.battle; if (!b) return;
    b.bertisFoodDead ||= [];
    allUnits(b).filter(u => u.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(u) && !b.bertisFoodDead.includes(u.uid)).forEach(dead => {
      b.bertisFoodDead.push(dead.uid);
      b.allies.filter(u => u.ref === "bertis" && alive(u) && hasSkill(u, "快速生长")).forEach(u => {
        u.food = (u.food || 0) + 3;
        window.BertisQueenSkinFX?.growth?.(state, u, 3);
        window.BattleLog.add(state, `${dead.name}倒下，${u.name}获得3枚粮食标记（${u.food}）。`);
      });
    });
  }
  return { skills, refreshArrogance, beginTurn, endTurn, handleSpecialCard, afterDodge, afterDamage, resolveRevengeTrigger, queueHeadshot, modifyIncomingDamage, afterAnyDeath };
})();
