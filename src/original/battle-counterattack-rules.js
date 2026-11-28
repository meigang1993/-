// 【反击类技能触发口径】唯一真相源（306 版）。
//
// 规则：纳入统一口径的「受击 / 被指定为目标后反制」类技能，触发源必须是【杀】牌，
// 且是「实体杀 或 虚拟杀」——战术牌、纯技能伤害载荷（type:"skill"）、状态 DOT
// （燃烧 / 毒 / 感电 / 锁魂镰刀等）、以及「名字带杀但实质是技能」的载荷一律不触发。
//
// 此前各技能各写一份判据：复仇反击 / 剑盾反攻只认「实体单体杀」（虚拟杀打过来
// 不反击），刺刀AK47 / 电磁反制装置却能被任意伤害触发。本模块统一后，各调用点
// 只保留自己的「单体」等结构性约束。【心血之咒】【以牙还牙】按需求保留原版口径
// （前者任意实体牌/虚拟牌伤害、后者实体牌伤害），不接本模块。
//
// 防连锁：反击执行体产生的虚拟杀统一打 counterattack:true（并保留原有的
// revengeCounter / mannyCounter 标记），isTriggerCard 会拒绝这类「反击生成的杀」
// 再次触发其它反击，避免纳入虚拟杀后 A→B→A 无限放大。血色刺伞 / 疯狂屠戮等
// 走 useCard 完整使用的虚拟【杀】不在此列，仍按正常杀牌参与结算。
window.BattleCounterattackRules = (() => {
  const C = () => window.CardUtils;
  // 触发源判据：必须是杀牌，且为实体牌或虚拟牌。
  //  · isKillCard 认 type:"slash" 或名字以「杀」结尾；
  //  · 再排除 type:"skill" 的纯技能伤害载荷（含 virtual 的也排除）；
  //  · isEntityOrVirtualCard 排除 type:"skill"、generatedBySkill 且非 virtual 的载荷；
  //  · counterattack / revengeCounter / mannyCounter 是反击自身生成的杀，不二次触发。
  function isTriggerCard(card) {
    const U = C();
    // 只排除 type:"skill" 的纯技能伤害载荷（即便名字带「杀」）。
    // 不能强制 type === "slash"：真实链路里的实体杀 / 转换杀 / 部分虚拟杀
    // 会带 type:"kill" 等其它值，靠 CardUtils.isKillCard（权威判据）识别即可；
    // 强制 slash 会让复仇反击 / 刺刀AK47 在真实多段战斗中整段静默。
    if (!U || !card || card.type === "skill") return false;
    if (card.counterattack || card.revengeCounter || card.mannyCounter) return false;
    return !!U.isKillCard?.(card) && !!U.isEntityOrVirtualCard?.(card);
  }
  // 单体杀版本：供复仇反击 / 贝尔蒂丝受伤反击 / 刺刀AK47 / 剑盾反攻使用。
  function isSingleTriggerCard(card) {
    const U = C();
    return isTriggerCard(card) && !!U?.isSingleTargetCard?.(card);
  }
  // 给反击产生的虚拟杀打统一标记（同时保留各技能原有标记，旧存档兼容）。
  function markCounterCard(card, extra = {}) {
    return Object.assign(card || {}, { counterattack: true }, extra);
  }
  return { isTriggerCard, isSingleTriggerCard, markCounterCard };
})();
