window.GameDataBakarEnemy = {
  id: "demon_king_bakaar",
  name: "魔王巴卡尔",
  type: "boss",
  role: "入侵夺牌·炎拳成长Boss",
  evaluation: "入侵夺取与炎拳成长首领。【魔王军入侵】对巴卡尔无效；其他角色使用实体【魔王军入侵】后，他获得那张使用过的牌，自己使用的入侵不会被回收，虚拟入侵也不会被夺取。发动角色技能时摸1张牌；杀牌附加火属性，并在造成生命值伤害后从下回合起永久叠加30%杀牌伤害。",
  gender: "male",
  face: "王",
  art: "./assets/new-portraits/demon-king-bakaar.webp",
  bgm: "./assets/new-bgm/demon-king-bakaar.m4a",
  hp: 330,
  attack: 11,
  magic: 7,
  speed: 13,
  bloodlust: 2,
  handLimit: 4,
  drawPerTurn: 2,
  initialDraw: 2,
  entrance: "你就是帮人鱼女王夺回列车的勇者？本王有所耳闻。魅魔女王想跟本王谈判撤军？哼，那就用力量来谈吧！",
  skills: [
    { name: "魔王军统领", type: "passive", icon: "⭐", text: "锁定技，【魔王军入侵】对你无效。其他角色使用实体【魔王军入侵】结算完毕后，你获得该使用过的牌。" },
    { name: "天赋异能", type: "passive", icon: "⭐", text: "锁定技，当你发动技能时，你摸1张牌。" },
    { name: "炎拳", type: "passive", icon: "⭐", text: "锁定技，你使用的【杀】牌附加火属性。你使用【杀】对角色造成生命值伤害后，你下一回合起使用的所有【杀】牌伤害倍率+30%，可叠加，持续至战斗结束。" }
  ],
  ai: "demon_king_bakaar"
};
