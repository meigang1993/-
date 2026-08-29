window.GameDataRuinsContent = {
  cards: [
    { name: "拼杀", price: 1200, type: "slash", scale: "attack", ignoreResponse: true, suits: { "♠": 1, "♥": 1 }, text: "指定一名敌方角色，造成等同于攻击力的伤害；若你的【杀】数量更多则不可响应。" },
    { name: "魔之连杀", price: 1400, type: "slash", scale: "magic", attackType: "magic", fixedRepeats: 2, suits: { "♣": 1, "♦": 1 }, text: "造成等同于魔力的魔法伤害，并按手牌中的【杀】数量追加目标。" },
    { name: "魅惑术", price: 1200, type: "obstacle", statusKey: "confusion", suits: { "♥": 1, "♦": 1 }, text: "令一名敌方角色生成一张【混乱】状态牌。" },
    { name: "魅杀", price: 1400, type: "slash", scale: "magic", attackType: "magic", vulnerable: true, suits: { "♠": 1, "♣": 1 }, text: "造成魔法伤害并施加脆弱标记，带有脆弱的角色受到伤害+50%。" },
    { name: "偷袭", price: 1100, type: "response", ambush: true, suits: { "♠": 1, "♣": 1 }, text: "敌方使用战术牌后，对其造成攻击力物理伤害。" },
    { name: "冰冻术", price: 1500, type: "obstacle", statusKey: "freeze", suits: { "♥": 1, "♦": 1 }, text: "令一名敌方角色生成【冰冻】状态牌。" },
    { name: "流星杀", price: 1200, type: "slash", scale: "magic", attackType: "magic", sweep: true, targetless: true, suits: { "♥": 1, "♦": 1 }, text: "对所有敌方角色造成魔力魔法伤害。" },
    { name: "吸魔杀", price: 1600, type: "slash", scale: "magic", attackType: "magic", stealCard: true, suits: { "♣": 1, "♠": 1 }, text: "造成魔法伤害后获得目标一张牌。" },
    { name: "物资私分", price: 1700, type: "consume", allyTarget: true, drawCards: 3, suits: { "♥": 1, "♣": 1 }, text: "指定其他友方角色，双方各摸3张牌。" },
    { name: "枪林弹雨", price: 1400, type: "tactic", hybridAttack: true, sweep: true, targetless: true, suits: { "♠": 1, "♦": 1 }, text: "对所有敌方角色造成基础1点加攻击力与魔力的复合伤害。" },
  ],
  relics: {
    "推进器": { icon: "推", stats: {}, effect: "根据你使用牌指定的目标数摸等量牌。", lore: "世界贵族军的推进设备。", source: "废墟沙城普通怪物", enemy: "noble_soldier" },
    "智能大脑": { icon: "脑", stats: {}, effect: "战术牌造成的伤害翻倍。", lore: "机械AI龙的战术核心。", source: "废墟沙城机械AI龙", enemy: "mech_ai_dragon" },
    "魅魔钢叉": { icon: "叉", stats: {}, effect: "出牌阶段限一次，将一张红桃牌当【魅杀】使用且不消耗杀意。", lore: "外神之眼的邪异武器。", source: "废墟沙城XX型凋零者1312号", enemy: "witherer_1312" },
    "粉色魅魔装": { icon: "装", stats: {}, effect: "红色牌对你无效；你使用的红色牌不可响应。", lore: "1312号的魅魔血脉。", source: "废墟沙城XX型凋零者1312号", enemy: "witherer_1312" },
    "冰心双刺剑": { icon: "刺", stats: {}, effect: "你获得的单体【杀】转换为不消耗杀意的【刺杀】。", lore: "希尔德的双刃。", source: "废墟沙城内英组杀手希尔德", enemy: "hilde" },
  },
};
if (window.GameDataCards) {
  const cardEntry = item => ({
    ...item, power: item.power || 0, scale: item.scale || null,
    attackType: item.attackType || null, magicDamage: item.attackType === "magic",
    targetless: !!item.targetless, sweep: !!item.sweep, fixedRepeats: item.fixedRepeats || 0,
    statusKey: item.statusKey || "", ignoreResponse: !!item.ignoreResponse,
    price: item.price, suits: item.suits,
  });
  const cards = window.GameDataRuinsContent.cards.map(cardEntry);
  window.GameDataCards.eliteCards.push(...cards);
  window.GameDataCards.cardCodex.push(...cards.map(card => ({
    ...card, suitsText: Object.entries(card.suits).map(([s, n]) => `${s}×${n}`).join(" "),
    source: `废墟沙城·${card.name}`,
  })));
  window.GameDataCards.eliteUnlocks ||= {};
  window.GameDataCards.eliteUnlocks.ruins_sand_city = cards.map(card => card.name);
}
