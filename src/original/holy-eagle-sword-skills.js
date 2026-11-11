/* 【圣鹰剑】锁定技：当你本回合使用单体【杀】牌对目标角色造成过伤害，
   下一张单体【杀】牌对同一个目标造成的伤害翻倍。
   标记按「持有者 + 战斗实例 + 战斗回合 + 目标 uid」记录，跨回合/跨战斗自然失效。 */
window.HolyEagleSwordSkills = (() => {
  const NAME = "圣鹰剑";
  let battleSeq = 0;

  const holds = (state, unit) => !!(unit
    && window.RelicSystem?.hasEquipped?.(state, unit, NAME));

  // 战斗标识用非枚举字符串挂在 battle 上：既能区分「同 turn 的新战斗」，
  // 又不会因为把 battle 对象引用写进 unit 标记而造成存档序列化循环引用。
  function battleId(battle) {
    if (!battle) return "";
    if (!battle._holyEagleBattleId) {
      Object.defineProperty(battle, "_holyEagleBattleId", {
        value: `b${++battleSeq}`, enumerable: false, configurable: true, writable: true,
      });
    }
    return battle._holyEagleBattleId;
  }

  // 只认单体【杀】：群体杀、非杀牌、摸牌动画占位牌都不算。
  const isSingleKill = card => !!card && !!window.CardUtils?.isSingleKill?.(card)
    && !card._pendingDraw;

  function markOf(state, actor) {
    const battle = state?.battle;
    const turn = battle?.turn;
    const mark = actor?._holyEagleSword;
    // 存档快照会把 targets 的 Set 序列化成普通对象；页面刷新后 battleSeq 归零，
    // 新的 battle 甚至可能拿到与旧标记相同的 battleId。此时必须判定为「无标记」
    // 并重建，否则 recordHit 里的 targets.add() 会抛 TypeError 崩掉战斗。
    const usable = mark && mark.battleId === battleId(battle) && mark.turn === turn
      && typeof mark.targets?.has === "function"
      && typeof mark.targets?.add === "function";
    return usable ? mark : null;
  }

  function marked(state, actor, target) {
    if (!holds(state, actor) || !target) return false;
    const mark = markOf(state, actor);
    return !!(mark && mark.targets?.has?.(target.uid));
  }

  // 只有伤害真正造成（hpLoss > 0）才记录，被【闪】抵消、护甲吃满都不算。
  function recordHit(state, actor, target, card, hpLoss) {
    if (!holds(state, actor) || !target || !(hpLoss > 0) || !isSingleKill(card)) return false;
    const battle = state?.battle;
    const turn = battle?.turn;
    let mark = markOf(state, actor);
    if (!mark) {
      mark = { turn, battleId: battleId(battle), targets: new Set() };
      actor._holyEagleSword = mark;
    }
    mark.targets.add(target.uid);
    return true;
  }

  function modifyDamage(state, actor, target, card, amount) {
    if (!holds(state, actor) || !isSingleKill(card)
      || !marked(state, actor, target)) return amount;
    window.BattleLog?.add?.(state,
      `${actor.name} 的${NAME}触发，对${target.name}的下一张单体【杀】伤害翻倍。`);
    // 伤害管线是 Math.round(amount) 后才扣血；攻击力可为小数（如 9.6），
    // 直接 amount*2 会得到 19.2→19，玩家看到的「翻倍」比首击 10 少 1 点。
    // 先按同一口径取整再翻倍，保证严格 2 倍，且与名刀鬼切叠加时仍是整数。
    return Math.round(amount) * 2;
  }

  return { NAME, holds, isSingleKill, marked, recordHit, modifyDamage };
})();
