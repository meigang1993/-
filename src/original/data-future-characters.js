window.GameDataFutureCharacters = [
  {
    id: "sonia",
    name: "索尼娅",
    gender: "female",
    face: "索",
    art: "./assets/new-portraits/sonia.webp",
    avatar: "./assets/new-portraits/sonia.webp",
    role: "XX型凋零者",
    locked: true,
    unlockCost: 50,
    unlockFlag: "soniaNurseryUnlocked",
    mother: "混沌女神",
    sourceDungeon: "兽人地下城",
    entrance: "父亲大人，小心我们其他姐妹找你麻烦，嘿嘿",
    stats: { attack: 2, magic: 2, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
    evaluation: "复制杀牌与双形态转换核心。杀欲窥视复制目标手中的【杀】且不消耗杀意；暴走将红色牌转为不消耗杀意的【杀（普攻）】，极速使黑色牌不可响应并可当【闪】或【看破】使用或打出。出牌阶段满足另一形态条件时可再次切换，当前形态持续至其下回合开始。",
    skills: [
      { name: "杀欲窥视", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以指定敌方一名角色。若该角色有【杀】牌，你获得等量张临时同名同花色【杀】牌，带有消耗属性。以此技能获得的【杀】牌不消耗杀意。", card: { name: "杀欲窥视", type: "tactic", withererPeek: true, icon: "⚔️", text: "指定一名敌方角色，复制其持有的【杀】牌；复制牌为临时消耗牌且不消耗杀意。" } },
      { name: "鲜血之忆", type: "passive", icon: "⭐", text: "锁定技，你生命值每减少20%，你的杀意上限和每回合摸牌数各+1。" },
      { name: "暴走与极速", type: "active", icon: "🔄", text: "转换技，出牌阶段，根据你手牌中颜色最多的牌切换对应效果；满足另一形态条件时可以随时再次发动切换。红色牌不少于黑色牌则进入暴走，黑色牌更多则进入极速。暴走：你的红色牌视为【杀（普攻）】使用，以此技能使用的【杀】牌不消耗杀意。极速：你使用的黑色牌不可响应，且你的黑色牌可视为【闪】或【看破】使用或打出。暴走与极速状态只会在下一个回合开始时清空，状态标记显示当前效果。", card: { name: "暴走与极速", type: "tactic", withererShift: true, targetless: true, icon: "🔄", text: "根据当前手牌颜色数量切换为暴走或极速。" } }
    ]
  },
  {
    id: "chiyo",
    name: "橘千樱",
    gender: "female",
    face: "樱",
    art: "./assets/images/invader-chiyo.webp",
    avatar: "./assets/images/invader-chiyo.webp",
    role: "革命复仇者",
    locked: true,
    mother: "陈莲樱（已过世）",
    sourceDungeon: "魔国机械工厂",
    entrance: "为了复仇，我要继续前进",
    stats: { attack: 2, magic: 1, speed: 5, maxHp: 30, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 1 },
    evaluation: "无限判定连斩与红桃封闪输出。使用单体【杀】时连续判定且不设次数上限，红色结果增加该【杀】的结算次数，直到判定为黑色；目标持有红桃手牌时，该【杀】不能被【闪】响应。",
    skills: [
      { name: "红缨连鬼斩", type: "passive", icon: "⭐", text: "锁定技，当你使用单体【杀】指定目标时，连续进行判定；若结果为红色则继续判定，直到结果为黑色，不设判定次数上限。此【杀】结算X+1次（X为以此法判定出红色牌的数量）。" },
      { name: "心眼拔刀术", type: "passive", icon: "⭐", text: "锁定技，当你使用【杀】指定目标时，若目标有红桃手牌，此【杀】不可被【闪】响应。" }
    ]
  }
];
