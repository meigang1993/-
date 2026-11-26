// 螺旋桨（锁定技）独立模块。
// 从 ruins-relic-effects.js 拆出：该文件加入「同一次伤害链内只触发一次」后超过 200 行硬约束。
// 效果：锁定技，出牌阶段，当你摸牌时，你随机对敌方一名角色视为使用一张虚拟【杀（普攻）】。
// 290 起由非锁定技改为锁定技：不再弹「发动 / 跳过」面板，满足条件即自动触发；
// 玩家侧与敌方侧统一走同一条 triggerPropeller，消除原实现「时停导致 open 失败
// 反而自动发动」的不一致。
window.RuinsRelicPropeller = (() => {
  const alive = units => (units || []).filter(u => u.hp > 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  function propellerTargets(state, unit) {
    const battle = state?.battle;
    if (!battle) return [];
    return alive((unit?.side === "ally" ? battle.enemies : battle.allies) || []);
  }

  // 锁定技：满足条件即自动触发，玩家侧与敌方侧同一条路径，不再询问玩家。
  // 保留「同一伤害链内只触发一次」的去重（原为「只弹一次面板」），避免半魅魔血
  // 逐段交牌 / 电钻火花追加段把一次摸牌放大成连锁虚拟杀。
  function openPropeller(state, unit, ctx) {
    if (!unit || unit.hp <= 0 || !propellerTargets(state, unit).length) return false;
    // 时停（米尔尤拉【神奇怀表】）：技能归属方被标记时一律失效。锁定技同样
    // 是技能，跟随 damage-triggers / turn-start / end-phase 各中枢的口径。
    // 原实现把判断放在通用面板 open 里，改为自动触发后必须在此补上，否则
    // 被时停的敌方直升机仍能照常甩虚拟杀。
    if (window.MieryulaTimeStop?.isSkillDisabled?.(unit)) return false;
    const battle = state.battle;
    if (battle._damageDepth > 0) {
      // 注意不能用「伤害链」本身判定：实测电钻火花追加段的 _damageDepth 恒为 1，
      // 每段都是独立的根伤害；追加段牌也是各自新构造的对象，拿不到同一张牌作锚点。
      // 故按「同一回合 + 同一行动者 + 同一佩戴者」去重。
      // 回合数必须用 roundNo：battle.round 全库无人赋值（恒为 undefined），
      // 用它会让键退化成「0|行动者|佩戴者」，若佩戴者某回合未摸牌使键未被清零，
      // 下一轮同名行动者再攻击时会被误判为「已触发过」而吞掉。
      const key = `${battle.roundNo || 0}|${battle.activeUid || ""}|${unit.uid}`;
      if (battle._propellerHitKey === key) return false;
      battle._propellerHitKey = key;
    } else {
      // 非受击摸牌（出牌阶段）视为新的一次，允许再次触发。
      battle._propellerHitKey = null;
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

  // 兼容入口：290 前是玩家可选的非锁定技，旧存档可能残留「螺旋桨」触发面板，
  // 通用面板仍可能回调到这里。锁定技下不再新建面板，此执行器只用于消化残留提示，
  // 与自动触发走同一个 triggerPropeller，不会重复发动（面板本身只会被消费一次）。
  function resolvePropeller(state, unit) {
    if (!window.RelicSystem?.hasEquipped?.(state, unit, "螺旋桨")) return;
    triggerPropeller(state, unit, null);
  }

  return { propellerTargets, openPropeller, resolvePropeller };
})();
