// 螺旋桨（触发）独立模块。
// 从 ruins-relic-effects.js 拆出：该文件加入「同一次伤害链内只弹一次」后超过 200 行硬约束。
// 效果：出牌阶段，当你摸牌时，你可以随机对敌方一名角色视为使用一张虚拟【杀（普攻）】。
window.RuinsRelicPropeller = (() => {
  const alive = units => (units || []).filter(u => u.hp > 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  function propellerTargets(state, unit) {
    const battle = state?.battle;
    if (!battle) return [];
    return alive((unit?.side === "ally" ? battle.enemies : battle.allies) || []);
  }

  // 上一枚螺旋桨还在等玩家处理（面板显示中或仍在待处理队列）时不再排队。
  function propellerPending(battle, uid) {
    return [battle?.counterTrigger, ...(battle?.counterTriggerQueue || [])]
      .filter(Boolean).some(p => p.skill === "螺旋桨" && p.unitUid === uid);
  }

  // 描述写的是「你可以……」，玩家佩戴时应由玩家决定发动，不能自动生效。
  // 玩家侧走通用触发面板（battle-counter-triggers，统一渲染「发动 / 跳过」），
  // 敌方没有可点击的玩家，AI 直接自动发动，保持原有行为。
  function openPropeller(state, unit, ctx) {
    if (!unit || unit.hp <= 0 || !propellerTargets(state, unit).length) return false;
    if (unit.side === "ally") {
      const battle = state.battle;
      // 同一次伤害链内只弹一次。注意不能用「伤害链」本身判定：实测电钻火花追加段的
      // _damageDepth 恒为 1，每段都是独立的根伤害；追加段的牌也是各自新构造的对象，
      // 拿不到「同一张杀牌」可用作锚点（已验证无效）。故按「同一回合 + 同一行动者 +
      // 同一佩戴者」去重：一次电钻火花的 7 段都发生在敌方行动者的同一回合内，
      // 半魅魔血逐段摸牌只会弹出一次选择，不再与 7 次交牌窗交替刷屏。
      if (battle._damageDepth > 0) {
        // 回合数必须用 roundNo：battle.round 全库无人赋值（恒为 undefined），
        // 用它会让键退化成「0|行动者|佩戴者」，若佩戴者某回合未摸牌（跳过摸牌阶段）
        // 使键未被清零，下一轮同名行动者再攻击时螺旋桨会被误判为「已弹过」而吞掉。
        const key = `${battle.roundNo || 0}|${battle.activeUid || ""}|${unit.uid}`;
        if (battle._propellerHitKey === key) return false;
        battle._propellerHitKey = key;
      } else {
        // 非受击摸牌（出牌阶段）视为新的一次，允许再次触发。
        battle._propellerHitKey = null;
        if (propellerPending(battle, unit.uid)) return false;
      }
      if (window.BattleCounterTriggers?.open?.(state, {
        skill: "螺旋桨", unitUid: unit.uid, sourceUid: unit.uid, count: 1,
      })) return true;
    }
    triggerPropeller(state, unit, ctx);
    return true;
  }

  function triggerPropeller(state, unit, ctx) {
    const pool = propellerTargets(state, unit);
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
    else window.BattleSystem?.useVirtualKill?.(state, unit, target, virtual);
  }

  // 通用触发面板「发动」时的执行器（跳过由面板统一记为「跳过螺旋桨」）。
  function resolvePropeller(state, unit) {
    if (!window.RelicSystem?.hasEquipped?.(state, unit, "螺旋桨")) return;
    triggerPropeller(state, unit, null);
  }

  return { propellerTargets, openPropeller, resolvePropeller };
})();
