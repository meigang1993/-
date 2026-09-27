// 装甲运输车【无脑冲撞】相关判定，自 ruins-elite-skills.js 拆出（该文件超 200 行硬约束）。
window.RuinsCarrierRam = (() => {
  // 以下四个辅助函数与 ruins-elite-skills.js 内同名函数逐字一致，拆分后各持一份，
  // 不可单方面修改语义（含 tempAttack 加成）。
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const singleKill = card => window.CardUtils?.isSingleKill?.(card) || (isSlash(card) && !card?.sweep && !card?.allTargets);
  const log = (state, text) => window.BattleLog?.add?.(state, text);

  // 无脑冲撞（锁定技）：出牌阶段，摸到或获得的实体单体【杀】转换为【撞杀】并自动使用，
  // 随机指定敌方一名角色，不消耗杀意。
  // 原实现只在原牌上打 ramKill 标记，而 ramKill 全库无任何消费点——打出的仍是原【杀】牌，
  // 撞杀的「攻击力+当前护甲」与「命中时有护甲则令目标翻面」全部未生效。
  // 采用与直升机【战场扫射】相同的「代价牌入弃牌堆 + 另建产物打出」模式，而非就地改写：
  // 就地改写会让弃牌堆里留下【撞杀】，洗牌堆重洗后牌库会凭空累积撞杀、原【杀】永久消失
  // （与冰心双刺剑同一类污染，该处靠 _revertSnapshot 离手还原解决）。
  function carrierRamMove(state, actor) {
    if (actor?.ai !== "ruins_carrier") return null;
    const card = visible(actor).find(item => singleKill(item) && !item.virtual && !item._skill);
    if (!card) return null;
    const targets = alive(state.battle.allies);
    const target = window.GameRandom?.sample?.(targets, state) || targets[0];
    if (!target) return null;
    const index = (actor.hand || []).indexOf(card);
    if (index < 0) return null;
    actor.hand.splice(index, 1);
    window.BattleCards?.put?.(state.battle, actor, card, "discard", { skipAnim: true });
    const ram = window.CardUtils?.convertAs?.("撞杀", card,
      { noIntentCost: true, convertedFrom: card.name, ramKill: true });
    if (!ram) return null;
    window.BattleLines?.skill?.(state, actor, "无脑冲撞", target);
    log(state, `${actor.name} 的无脑冲撞触发，${card.name}转换为【撞杀】并自动使用。`);
    return { card: ram, target };
  }

  return { carrierRamMove };
})();
