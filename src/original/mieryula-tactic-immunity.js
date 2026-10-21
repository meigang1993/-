// 米尔尤拉【无谋霸姬】（锁定技）：
//   1. 战术牌对她无效 —— 指定她的战术牌不产生任何效果
//   2. 她无法使用战术牌 —— 手牌区的战术牌一律置灰
//   3. 手牌中没有战术牌时，其实体牌与虚拟牌造成的伤害翻倍
//
// 独立成文件的原因：消费方分散在出牌判定、战术牌结算、伤害结算三条链上
// （battle-card-playability / battle-card-tactics / battle-damage-lifecycle /
//  battle-damage-resolution），全部挤在 mieryula-skills.js 里会让它突破 190 行。
window.MieryulaTacticImmunity = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isMieryula = unit => unit?.ref === "mieryula" || unit?.id === "mieryula";
  const hasSkill = (unit, name) =>
    (unit?.skills || []).some(skill => skill.name === name);
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);
  const isTactic = card => !!card && card.type === "tactic";

  // 战术牌对她无效：指定她的战术牌不产生效果。
  // _skill 豁免只针对「角色技能牌本身」—— 她自己的渴血杀戮/神奇怀表是 tactic 类型，
  // 靠 _skill 标记区分。虚拟牌与转换牌本质是真正的战术牌（军令状的虚拟【魔王军入侵】、
  // 魔法巡飞弹的虚拟【魔弹特攻】、鬼王扑克转换出的【魔弹特攻】），必须照常免疫，
  // 否则「战术牌对你无效」会被这些牌整段绕过。口径与 card-utils.js 的
  // isCounterableTactic（响应判定）一致：(!card._skill || card.virtual || card.convertedFrom)。
  function immunizesTactic(state, target, card) {
    if (!isMieryula(target) || !alive(target)) return false;
    if (!hasSkill(target, "无谋霸姬") || !isTactic(card)) return false;
    if (card._skill && !card.virtual && !card.convertedFrom) return false;
    return true;
  }
  // 她无法使用战术牌：手牌区的战术牌一律不可打出。
  function blocksTactic(actor, card) {
    if (!isMieryula(actor) || !alive(actor)) return false;
    // 技能牌（渴血杀戮/神奇怀表）本身是战术牌类型，不受「无法使用战术牌」限制。
    if (!hasSkill(actor, "无谋霸姬") || !isTactic(card) || card._skill) return false;
    return true;
  }
  // 战术牌指定她时的统一拦截入口：返回 true 表示这张牌对她完全不产生效果。
  // 此前源码里没有任何地方调用 immunizesTactic —— 只有测试直接调它，
  // 于是「战术牌对你无效」这条锁定技实际完全不生效（手牌照样被弃、伤害照常结算）。
  function interceptTactic(state, actor, target, card) {
    if (!immunizesTactic(state, target, card)) return false;
    line(state, target, "无谋霸姬", actor);
    window.BattleLog?.add(state, `${actor?.name || "对方"} 对${target.name}使用${card?.name || "战术牌"}，`
      + `但${target.name}免疫战术牌，此牌没有任何效果。`);
    return true;
  }
  // AOE 战术牌（如【魔王军入侵】）是 targetless 的：resolveCard 的拦截只认单体
  // target，AOE 在内部循环里直接对每个目标调 damage，因此会完全绕过拦截，
  // 米尔尤拉照样被战术牌打掉血。这里提供伤害入口的统一兜底。
  // 幂等：同一张牌多段伤害会多次进到这里，台词与日志只播一次。
  function blockTacticDamage(state, target, card, actor) {
    if (!immunizesTactic(state, target, card)) return false;
    if (!card._mieryulaImmuneLogged) {
      card._mieryulaImmuneLogged = true;
      interceptTactic(state, actor, target, card);
    }
    return true;
  }
  const hasTacticInHand = unit => visible(unit).some(isTactic);
  // 手牌中没有战术牌时，实体牌与虚拟牌造成的伤害翻倍。
  function modifyOutgoingDamage(state, actor, amount, card) {
    if (!isMieryula(actor) || !alive(actor) || !(amount > 0)) return amount;
    if (!hasSkill(actor, "无谋霸姬") || hasTacticInHand(actor)) return amount;
    if (!card) return amount;
    // 技能伤害（type:"skill"）不属于「实体牌或虚拟牌」，不翻倍。
    if (card.type === "skill") return amount;
    line(state, actor, "无谋霸姬造成伤害");
    return amount * 2;
  }

  return {
    immunizesTactic, interceptTactic, blockTacticDamage, blocksTactic,
    hasTacticInHand, modifyOutgoingDamage,
  };
})();
