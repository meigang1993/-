// 【魔王军枪炮师杰明】掉落内容：2 张战术牌 + 2 件饰品（2026-11-28）。
// 自建注册 IIFE，仿 data-ruins-content.js：展开进 eliteCards / cardCodex / eliteUnlocks，
// 饰品由 data-future-relics.js 末尾并入 GameDataFutureRelics，使 hasHuntDrop /
// 讨伐任务 / 管家手册自动纳入该精英。
// BGM 与立绘取自并行提交的「研究所素材」压缩包，纯字节复制未做任何压缩或转码。
window.GameDataTenriJaminContent = {
  cards: [
    { name: "嘲讽", enemy: "tenri_jamin", price: 2000, type: "tactic", taunt: true, suits: { "♠": 1, "♥": 1, "♣": 1, "♦": 1 }, text: "指定敌方一名角色，令其对你使用一张实体单体【杀】。若其没有【杀】牌，则改为你弃置该角色1张手牌。" },
    { name: "支援", enemy: "tenri_jamin", price: 1400, type: "tactic", support: true, allyTarget: true, excludeSelf: true, suits: { "♠": 1, "♥": 1, "♣": 1, "♦": 1 }, text: "使用后，你可以将任意1张手牌交给我方一名角色。" },
  ],
  relics: {
    "火龙火箭筒": {
      icon: "筒", skillType: "trigger", stats: {},
      effect: "非锁定技，结束阶段，你可以将所有【杀】牌置于你的角色牌上（存储牌）。下一个回合准备阶段，你弃置所有以此法存储的【杀】牌，对所有敌方角色造成等同于你攻击力的火属性伤害。",
      lore: "伊迪斯为了躲避天使追杀，和儿子杰明生活在对魔物友好的人类村庄，但某人背叛她们母子俩，惨遭魔物猎人抓捕，将其高价出售。",
      source: "【天日国鹰7研究所】魔王军枪炮师杰明 (精英)", enemy: "tenri_jamin",
      aiLogic: "存储的【杀】牌达到3张及以上时，才选择发动此技能。",
    },
    "战地功勋": {
      icon: "勋", stats: {},
      effect: "锁定技，当你使用实体牌杀死敌方角色后，本场战斗你的基础攻击力和魔力各+100%（可叠加）。",
      lore: "杰明为了协助帕琦琦解救食尸鬼女王无零而潜入研究所，帕琦琦信任杰明的能力。",
      source: "【天日国鹰7研究所】魔王军枪炮师杰明 (精英)", enemy: "tenri_jamin",
    },
  },
};
(() => {
  const G = window.GameDataCards;
  if (!G) return;
  const cardFields = G.cardFields;
  const cardEntry = item => ({ ...(cardFields ? cardFields(item) : {}), ...item });
  const expand = item => {
    const { suits, ...fields } = cardEntry(item);
    return Object.entries(suits || {}).flatMap(([suit, n]) =>
      Array.from({ length: n }, () => ({ ...fields, suit })));
  };
  const cards = window.GameDataTenriJaminContent.cards.flatMap(expand);
  G.eliteCards.push(...cards);
  G.cardCodex.push(...window.GameDataTenriJaminContent.cards.map(card => ({
    ...cardEntry(card), suitsText: Object.entries(card.suits).map(([s, n]) => `${s}×${n}`).join(" "),
    source: "天日国鹰7研究所·魔王军枪炮师杰明",
  })));
  G.eliteUnlocks ||= {};
  const list = G.eliteUnlocks.tenri_jamin ||= [];
  cards.forEach(card => { if (!list.includes(card.name)) list.push(card.name); });
  // 饰品在 data-future-relics.js 末尾合并（GameDataFutureRelics 在 startup-app 才定义），
  // 与 GameDataRuinsContent.relics 同一口径，避免被后续赋值覆盖。
})();
