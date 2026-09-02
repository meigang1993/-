window.GameDataRuinsContent = {
  cards: [
    { name: "拼杀", price: 1200, type: "slash", scale: "attack", ignoreResponse: true, suits: { "♠": 1, "♥": 1 }, text: "指定一名敌方角色，造成等同于攻击力的伤害；此牌不可被响应。" },
    { name: "魔之连杀", price: 1400, type: "slash", scale: "magic", attackType: "magic", fixedRepeats: 2, suits: { "♣": 1, "♦": 1 }, text: "指定一名敌方角色，对其连续造成2次等同于魔力的魔法伤害。" },
    { name: "魅惑术", price: 1200, type: "obstacle", statusKey: "confusion", suits: { "♥": 1, "♦": 1 }, text: "令一名敌方角色生成一张【混乱】状态牌。" },
    { name: "魅杀", price: 1400, type: "slash", scale: "magic", attackType: "magic", suits: { "♠": 1, "♣": 1 }, text: "指定一名敌方角色，造成等同于魔力的魔法伤害。" },
    { name: "偷袭", price: 1100, type: "response", ambush: true, suits: { "♠": 1, "♣": 1 }, text: "敌方使用战术牌后，对其造成攻击力物理伤害。" },
    { name: "冰冻术", price: 1500, type: "obstacle", statusKey: "freeze", suits: { "♥": 1, "♦": 1 }, text: "指定敌方一名角色，使其手牌区生成一张【冰冻】状态牌；判定阶段进行判定，若结果为♦方块或♣梅花，本回合无法使用【杀】牌。" },
    { name: "流星杀", price: 1200, type: "slash", scale: "magic", attackType: "magic", sweep: true, targetless: true, suits: { "♥": 1, "♦": 1 }, text: "对所有敌方角色造成魔力魔法伤害。" },
    { name: "吸魔杀", price: 1600, type: "slash", scale: "magic", attackType: "magic", stealCard: true, suits: { "♣": 1, "♠": 1 }, text: "造成魔法伤害后获得目标一张牌。" },
    { name: "物资私分", price: 1700, type: "consume", allyTarget: true, drawCards: 3, suits: { "♥": 1, "♣": 1 }, text: "指定其他友方角色，双方各摸3张牌。" },
    { name: "枪林弹雨", price: 1400, type: "tactic", hybridAttack: true, sweep: true, targetless: true, suits: { "♠": 1, "♦": 1 }, text: "对所有敌方角色造成基础1点加攻击力与魔力的复合伤害。" },
  ],
  relics: {
    "推进器": { icon: "推", stats: {}, effect: "根据你使用牌指定的目标数摸等量牌。", lore: "世界贵族军的推进设备。", source: "废墟沙城普通怪物", enemy: "noble_soldier" },
    "智能大脑": { icon: "脑", stats: {}, effect: "战术牌造成的伤害翻倍。", lore: "机械AI龙的战术核心。", source: "废墟沙城机械AI龙", enemy: "mech_ai_dragon" },
    "魅魔钢叉": { icon: "叉", skillType: "active", stats: {}, effect: "出牌阶段限一次，将一张红桃牌当【魅杀】使用且不消耗杀意。", lore: "外神之眼的邪异武器。", source: "废墟沙城XX型凋零者1312号", enemy: "witherer_1312", activeCard: { name: "魅魔钢叉", type: "tactic", succubusFork: true } },
    "粉色魅魔装": { icon: "装", stats: {}, effect: "红色牌对你无效；你使用的红色牌不可响应。", lore: "1312号的魅魔血脉。", source: "废墟沙城XX型凋零者1312号", enemy: "witherer_1312" },
    "冰心双刺剑": { icon: "刺", stats: {}, effect: "你获得的单体【杀】牌转换为不消耗杀意的【刺杀】。", lore: "希尔德的双刃。", source: "废墟沙城内英组杀手希尔德", enemy: "hilde" },
    "刺客胶衣": { icon: "胶", skillType: "active", stats: {}, effect: "出牌阶段限一次，你可以将一张黑色牌当做【刺杀】使用，不消耗杀意。", lore: "希尔德的暗影修行成果。", source: "废墟沙城内英组杀手希尔德", enemy: "hilde", activeCard: { name: "刺客胶衣", type: "tactic", assassinLatex: true } },
    "螺旋桨": { icon: "旋", skillType: "trigger", stats: {}, effect: "出牌阶段，当你摸牌时，随机对敌方一名角色视为使用一张虚拟【杀（普攻）】。", lore: "贵族军武装直升机的旋翼。", source: "废墟沙城武装直升机", enemy: "attack_helicopter" },
    "导弹发射器": { icon: "弹", stats: {}, effect: "你使用的【杀】牌指定目标时，目标角色需要额外弃置1张【杀】牌才能响应【闪】。", lore: "贵族军对反抗军使用的不人道武器。", source: "废墟沙城武装直升机", enemy: "attack_helicopter" },
    "物资货物": { icon: "货", stats: {}, effect: "摸牌阶段，你摸牌时，其他角色根据你摸的牌数摸等量的牌。", lore: "贵族军长期作战的物资储备。", source: "废墟沙城装甲运输车", enemy: "armored_carrier" },
    "武器库": { icon: "库", skillType: "active", stats: {}, effect: "出牌阶段限一次，你可以让我方所有其他角色从摸牌堆里摸1张【杀】牌，此【杀】牌不消耗杀意。", lore: "装甲运输车的弹药储备。", source: "废墟沙城装甲运输车", enemy: "armored_carrier", activeCard: { name: "武器库", type: "tactic", arsenal: true } },
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
