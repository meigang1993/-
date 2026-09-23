window.LokarSkills = (() => {
  const isKill = c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "");
  const visibleKills = u => (u?.hand || []).filter(c => !c._pendingDraw && isKill(c));
  const aliveEnemies = (state, actor) => ((actor?.side === "enemy" ? state?.battle?.allies : state?.battle?.enemies) || []).filter(u => u.hp > 0);
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (!card.lokarWindSlash) return false;
    windSlash(state, actor, deps, ctx);
    return true;
  }
  function canWindSlash(state, actor) {
    return !!(actor && !actor.usedLokarWindSlash && visibleKills(actor).length && aliveEnemies(state, actor).length);
  }
  function windSlash(state, actor, deps, ctx) {
    if (!canWindSlash(state, actor)) return;
    actor.usedLokarWindSlash = true;
    window.BattleLines?.skill(state, actor, "狂风绝息斩");
    const slashes = visibleKills(actor).slice();
    window.CharacterSkinFX?.windSlashStart?.(state, actor, slashes.length);
    window.BattleLog.add(state, `${actor.name} 发动狂风绝息斩，连续使用${slashes.length}张杀牌。`);
    let cycle = [], defeatedAny = false, used = 0;
    for (const slash of slashes) {
      if (!state.battle || state.battle.locked || !actor.hand.includes(slash)) break;
      const enemies = aliveEnemies(state, actor);
      if (!enemies.length) break;
      cycle = cycle.filter(u => u.hp > 0);
      if (!cycle.length) cycle = shuffle(enemies, state);
      const target = cycle.pop();
      slash.noIntentCost = true;
      window.CharacterSkinFX?.windSlashHit?.(state, actor, target, used);
      ctx.useCard(state, actor, target, slash);
      used += 1; defeatedAny ||= target.hp <= 0;
    }
    window.CharacterSkinFX?.windSlashEnd?.(state, actor, defeatedAny, used);
  }
  function shuffle(list, state) {
    const out = list.slice();
    return window.GameRandom.shuffle(out, state);
  }
  return { handleSpecialCard, canWindSlash };
})();
