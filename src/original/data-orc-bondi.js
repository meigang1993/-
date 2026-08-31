window.GameDataFutureEnemies = window.GameDataFutureEnemies || {};
window.GameDataFutureEnemies.orc_dungeon = window.GameDataFutureEnemies.orc_dungeon || [];
window.GameDataFutureEnemies.orc_dungeon.push({
  id: "orc_king_bondi",
  name: "兽人王邦迪",
  type: "elite",
  role: "夺牌复仇精英",
  evaluation: "群体弃牌与夺牌反击精英。当其【杀】数量多于非【杀】数量时，使用【杀】会令所有敌方角色各弃置1张牌；受到实体牌伤害后，他获得该牌，且以此法获得的牌造成双倍伤害。",
  gender: "male",
  face: "邦",
  art: "./assets/new-portraits/orc-king-bondi.webp",
    bgm: "./assets/new-bgm/orc-king-bondi.mp3",
  hp: 220,
  attack: 10,
  magic: 5,
  speed: 12,
  bloodlust: 1,
  handLimit: 4,
  drawPerTurn: 2,
  initialDraw: 1,
  entrance: "你们是魅魔女王派来的？魔王很强，想挑战魔王就在这里证明给我看看。如果你们能帮我夺回兽人城，我的孙女就交给你们照顾了。",
  skills: [
    { name: "兽王之吼", type: "passive", icon: "⭐", text: "锁定技，当你使用【杀】牌指定敌方角色时，若你的【杀】牌数量大于非【杀】牌数量，弃置所有敌方角色各一张牌。" },
    { name: "以牙还牙", type: "passive", icon: "⭐", text: "锁定技，当你受到实体牌伤害后，你获得对你造成伤害的牌。以此技能获得的牌造成的伤害×2。无法获得带有消耗或虚无属性的牌。" }
  ],
  ai: "orc_king_bondi"
});
