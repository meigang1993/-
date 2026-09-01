window.GameDataFutureEnemies = window.GameDataFutureEnemies || {};
window.GameDataFutureEnemies.orc_dungeon = window.GameDataFutureEnemies.orc_dungeon || [];
window.GameDataFutureEnemies.orc_dungeon.push({
  id: "assassin_sakura_risa",
  name: "内英组杀手樱羽丽莎",
  type: "elite",
  role: "响应掠牌与不死复生精英",
  evaluation: "响应补牌、摸牌转移与待复活精英。每次使用或打出响应牌后摸1张牌，响应牌数量高于目标时其【杀】不可响应；吸魔邪眼可通过猜拳夺取目标本次出牌阶段实际摸到的牌。生命值降至0且仍有手牌时进入“待复活”，于其下个回合开始时恢复全部生命值。",
  gender: "female",
  face: "丽",
  art: "./assets/new-portraits/assassin-sakura-risa.webp",
  bgm: "./assets/new-bgm/assassin-sakura-risa.ogg",
  hp: 190,
  attack: 9,
  magic: 7,
  speed: 17,
  bloodlust: 2,
  handLimit: 3,
  drawPerTurn: 2,
  initialDraw: 3,
  entrance: "兽人的肉难吃死了……来了呀，长得挺好看，怪不得魔后想抓你，让吾辈尝尝你味道怎么样？",
  skills: [
    { name: "轻身飞翼", type: "passive", icon: "⭐", text: "锁定技，当你使用或打出响应牌时，你摸一张牌。当你使用【杀】牌指定目标时，若你的响应牌数量大于目标角色的响应牌数量，此【杀】不可响应。" },
    { name: "吸魔邪眼", type: "passive", icon: "🔵", text: "敌方一名角色出牌阶段开始时，你可以与该角色进行猜拳。若你赢，该角色出牌阶段摸到的牌全部归你；平局则继续猜拳。" },
    { name: "不死食尸鬼", type: "passive", icon: "⭐", text: "锁定技，当你生命值降至0时，若你有手牌，你不会死亡。你的下一个回合开始时，恢复所有生命值。" }
  ],
  ai: "assassin_sakura_risa"
});
