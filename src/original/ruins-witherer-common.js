window.RuinsWithererCommon = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const isTactic = card => card?.type === "tactic";
  // 实体牌：非技能伤害、非技能生成、非虚拟牌。
  // 判定必须与 CardUtils.isEntityKillCard（isKillCard && !card.virtual）保持一致：
  // 只要带 virtual 就不是实体牌，没有任何例外。
  // 转换杀走 CardUtils.convertAs 生成，带 convertedFrom 且不带 virtual，天然算实体牌；
  // 而 CardUtils.fromEntity 生成的虚拟牌一律带 virtual:true——即便它额外挂了
  // _entitySourceCard（如芙萝娅【神速之袭】的虚拟【刺杀】），也仍是虚拟牌，不能算实体。
  // 注意：燃烧/毒/感电/勒脖/锁魂镰刀/机尾机枪等技能伤害传的是 type:"skill" 的
  // 伤害载荷，既不带 _skill 也不带 virtual，必须按 type 排除，否则会被误判成实体牌。
  // "skill" 不在卡牌类型（slash/response/tactic/consume/obstacle）之内，可安全排除。
  // 饰品主动技把「实体手牌」转换而成的牌走 CardUtils.convertAs：带 convertedFrom、
  // 不带 virtual，本质是实体牌，因此额外标了 _entityConversion，此处视为实体牌。
  // 不能靠删掉 _skill 来实现：_skill 同时被伤害加成计算（battle-combat-attack-values.js）
  // 等多个位置依赖，删除会改变伤害值。
  // 已标注：魅魔钢叉、鬼王扑克、刺客胶衣（三件 convertAs 饰品口径统一）。
  // 实体牌判定统一走 CardUtils.isEntityCard（单一来源），此处不再各写一份。
  const isEntityCard = card => !!window.CardUtils?.isEntityCard?.(card);

  // 时停（米尔尤拉【神奇怀表】）：被动技与结束阶段技不走 canPlay，须在此拦截。
  const timeStopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);

  return { alive, visible, stat, log, isTactic, isEntityCard, timeStopped };
})();
