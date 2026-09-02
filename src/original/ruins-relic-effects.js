window.RuinsRelicEffects = (() => {
  const alive = units => (units || []).filter(u => u.hp > 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const isKillOwned = (target, index) => isSlash((target?.hand || [])[index])
    && !(target?.hand || [])[index]?._pendingDraw;

  function missileLauncherBlock(state, actor, target, card, responseCards, response) {
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "导弹发射器")) return true;
    if (!isSlash(card)) return true;
    const slashIndex = (target.hand || []).findIndex((_, i) => i !== responseCards.indexOf(response) && isKillOwned(target, i));
    if (slashIndex < 0) {
      log(state, `${actor.name} 的导弹发射器触发：${target.name}需额外弃1张杀才能响应闪，响应失败。`);
      return false;
    }
    const extra = target.hand.splice(slashIndex, 1)[0];
    window.BattleCards?.put?.(state.battle, target, extra, "discard", { showDiscard: true });
    log(state, `${actor.name} 的导弹发射器触发：${target.name}额外弃1张${extra.suit || ""}${extra.name}作为响应代价。`);
    return true;
  }

  function afterDraw(state, unit, cards, draw, ctx) {
    if (!cards || !cards.length) return;
    const battle = state?.battle;
    if (!battle) return;
    if (battle.phase === 4 && window.RelicSystem?.hasEquipped?.(state, unit, "螺旋桨")) {
      triggerPropeller(state, unit, ctx);
    }
    if (battle.phase === 2 && window.RelicSystem?.hasEquipped?.(state, unit, "物资货物")) {
      triggerSupplyCargo(state, unit, cards.length, draw);
    }
  }

  function triggerSupplyCargo(state, unit, count, draw) {
    if (typeof draw !== "function" || count <= 0) return;
    const battle = state.battle;
    const team = (unit.side === "ally" ? battle.allies : battle.enemies) || [];
    const others = team.filter(m => m !== unit && m.hp > 0);
    if (!others.length) return;
    others.forEach(ally => {
      const cards = draw(ally, count, battle);
      if (!cards.length) return;
      battle.animQueue?.push({
        id: window.GameRandom?.id?.("sc"),
        type: "drawBatch",
        uid: ally.uid,
        side: ally.side,
        count: cards.length,
        cards,
      });
    });
    window.BattleLines?.skill?.(state, unit, "物资货物");
    log(state, `${unit.name} 的物资货物触发：友方${others.length}名角色各摸${count}张牌。`);
  }

  function triggerPropeller(state, unit, ctx) {
    const foes = (unit?.side === "ally" ? state.battle.allies : state.battle.enemies) || [];
    const pool = alive((unit.side === "ally" ? state.battle.enemies : state.battle.allies) || []);
    if (!pool.length) return;
    const target = window.GameRandom?.sample?.(pool, state) || pool[0];
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "螺旋桨" });
    if (!virtual) return;
    window.BattleLines?.skill?.(state, unit, "螺旋桨", target);
    log(state, `${unit.name} 的螺旋桨触发，对${target.name}视为使用一张虚拟【杀】。`);
    const combat = ctx?.getCombat && ctx.getCombat();
    if (combat?.useVirtualKill) combat.useVirtualKill(state, unit, target, virtual);
    else window.BattleCombat?.useVirtualKill?.(state, unit, target, virtual);
  }

  return {
    missileLauncherBlock, afterDraw,
  };
})();
