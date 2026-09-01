window.GameDataFutureEnemies = window.GameDataFutureEnemies || {};
window.GameDataFutureEnemies.orc_dungeon = window.GameDataFutureEnemies.orc_dungeon || [];
window.GameDataFutureEnemies.orc_dungeon.push({
  id: "guard_kelly",
  name: "特坚组护卫凯丽",
  type: "elite",
  role: "翻面补牌与团队护甲精英",
  evaluation: "翻面补牌与团队护甲精英。结束阶段翻面并按本回合用牌数摸牌，因此跳过下一个完整回合；翻面期间仍可将黑色牌当【看破】、红色牌当【佯攻】使用或打出。其他友方角色受到生命值伤害后，若其存活，获得等同于凯丽魔力的护甲。",
  gender: "female",
  face: "凯",
  art: "./assets/new-portraits/guard-kelly.webp",
  bgm: "./assets/sounds/guard-kelly.ogg",
  hp: 210,
  attack: 8,
  magic: 8,
  speed: 14,
  bloodlust: 1,
  handLimit: 4,
  drawPerTurn: 3,
  initialDraw: 2,
  entrance: "有刺客！不会让你们接近魔王大人的。",
  skills: [
    { name: "坚守阵地", type: "passive", icon: "⭐", text: "锁定技，结束阶段，你将武将牌翻面，然后摸X张牌（X为你本回合使用过的牌数）。" },
    { name: "突破重围", type: "passive", icon: "🔵", text: "你可以将一张黑色牌当【看破】使用或打出；你可以将一张红色牌当【佯攻】使用或打出。" },
    { name: "精灵守护", type: "passive", icon: "⭐", text: "锁定技，当一名其他友方角色受到生命值伤害后，若其存活，你令其获得X点护甲（X为你的魔力值）。" }
  ],
  ai: "guard_kelly"
});
