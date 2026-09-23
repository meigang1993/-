window.BattleAIHelpers = (() => {
  const HEAL_THRESHOLD = window.BattleAIConfig?.HEAL_THRESHOLD || .7;
  const TARGET_POLICY_FOCUS = .4;
  const alive = (units) => units.filter(u => u.hp > 0);
  const isKill = c => window.CardUtils.isKillCard(c);
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const hpPct = (u) => u.hp / Math.max(1, u.maxHp || u.stats?.maxHp || 1);
  const visible = (u) => window.GuestCharacterSkills?.visibleHandCount?.(u) ?? (u.hand || []).filter(c => !c._pendingDraw).length;
  const handLimit = (u) => u.stats?.handLimit || 5;
  const hasDodge = (u) => (u?.hand || []).some(c => c.name === "闪" && !c._pendingDraw);
  const hasKill = (u) => (u?.hand || []).some(c => isKill(c) && !c._pendingDraw);
  const singleKill = c => window.CardUtils.isSingleKillCard(c);
  const hearts = u => (u?.hand || []).filter(c => c.suit === "♥" && !c._pendingDraw).length;
  const hasBasicKill = (u) => (u?.hand || []).some(c => c.name === "杀（普攻）" && !c._pendingDraw);
  const hasMagicKill = (u) => (u?.hand || []).some(c => c.name === "魔杀" && !c._pendingDraw);
  const pick = arr => window.GameRandom.sample(arr);
  const topBy = (items, score) => items.reduce((best, x) => { const s = score(x); return !best || s > best.s ? { x, s } : best; }, null)?.x;
  const keepValue = c => c?.name === "闪" ? 34 : c?.counterTactic ? 32 : c?.teamHealPct ? 28 : c?.heal || c?.healPct ? 24 : c?.ignoreResponse || c?.fixedRepeats || c?.berserkKill || c?.biteKill || c?.holy || c?.rageKill ? 20 : isKill(c) ? 14 : c?.drawTeam || c?.drawCards ? 10 : 6;
  const keyCount = u => (u.hand || []).filter(c => !c._pendingDraw && keepValue(c) >= 14).length;
  const targetByPolicy = (units, focusOnly = false) => {
    const list = alive(units); if (!list.length) return null;
    const favored = topBy(list, u => (hpPct(u) < .3 ? 45 : 0) + (visible(u) === 0 ? 24 : 0) + keyCount(u) * 6 + stat(u, "attack") * 3 + stat(u, "magic") * 2 - u.hp);
    if (focusOnly || list.length === 1) return favored;
    const roll = window.GameRandom.value();
    if (roll < TARGET_POLICY_FOCUS) return favored;
    const index = Math.min(list.length - 1,
      Math.floor((roll - TARGET_POLICY_FOCUS) / (1 - TARGET_POLICY_FOCUS) * list.length));
    return list[index];
  };
  const healTarget = units => {
    const list = alive(units).filter(u => hpPct(u) < HEAL_THRESHOLD); if (!list.length) return null;
    const min = Math.min(...list.map(hpPct)); return pick(list.filter(u => hpPct(u) === min));
  };
  const lowHandAllies = units => alive(units).filter(u => visible(u) <= Math.floor(handLimit(u) / 2));
  const withHand = units => alive(units).reduce((best, u) => { const cur = { u, hand: visible(u), key: keyCount(u) }; return cur.hand > 0 && (!best || cur.key > best.key || cur.key === best.key && (cur.hand < best.hand || cur.hand === best.hand && cur.u.hp < best.u.hp)) ? cur : best; }, null)?.u;
  const marked = (units, hand) => alive(units).find(u => u.lockSuit && hand.some(c => isKill(c) && c.suit === u.lockSuit));
  const weakest = units => alive(units).reduce((best, u) => !best || u.hp < best.hp ? u : best, null);
  const hasRelic = (actor, name) => window.RelicSystem?.hasEquipped?.(window.state, actor, name);
  const heroic = actor => actor.side === "enemy" && !!actor.battleRelics?.length;
  return { HEAL_THRESHOLD, TARGET_POLICY_FOCUS, alive, isKill, stat, hpPct, visible, handLimit, hasDodge, hasKill, singleKill, hearts, hasBasicKill, hasMagicKill, pick, targetByPolicy, healTarget, lowHandAllies, keepValue, keyCount, withHand, marked, topBy, weakest, hasRelic, heroic };
})();
