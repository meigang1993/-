window.GameDataCharactersExtra = [
  {
    id: "bertis", name: "贝尔蒂丝", gender: "female", face: "贝", art: "./assets/images/bertis-portrait.webp", avatar: "./assets/images/bertis-portrait.webp", role: "束缚公主", locked: true, unlockCost: 18,
    stats: { attack: 3, magic: 3, speed: 3, maxHp: 38, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
    evaluation: "满生命强化与团队资源核心。傲慢雌小鬼在满生命时强化多项属性，苦肉鞭笞以友方伤害换取手牌和杀意，快速生长持续积累共享“粮食”。",
    skills: [
      { name: "傲慢雌小鬼", type: "passive", icon: "⭐", text: "锁定技，当你的生命值为满时，你的攻击力和魔力变为基础值的1.5倍，杀意上限和手牌上限各翻倍。" },
      { name: "苦肉鞭笞", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以指定一名其他友方角色，对其造成等同于你攻击力的伤害，然后你摸2张牌并恢复1点杀意。若目标为杰洛特或诺诺卡，伤害、摸牌数和恢复的杀意均翻倍。", card: { name: "苦肉鞭笞", type: "tactic", bertisWhip: true, allyTarget: true, icon: "⚔️", text: "对一名其他友方角色造成攻击力伤害，然后摸2张牌并恢复1点杀意；对杰洛特或诺诺卡时全部效果翻倍。" } },
      { name: "快速生长", type: "passive", icon: "⭐", text: "锁定技，结束阶段，你获得1枚“粮食”标记；每当一名角色因伤害死亡后，你获得3枚“粮食”标记。其他友方角色获得临时技能【取粮】。", derivedSkills: [{ name: "取粮", text: "出牌阶段限一次，你可以移去1枚队伍共享的“粮食”标记，然后摸2张牌。" }] }
    ]
  },
  {
    id: "gerlot", name: "杰洛特", gender: "male", face: "杰", art: "./assets/images/gerlot-portrait.webp", avatar: "./assets/images/gerlot-portrait.webp", role: "雌小鬼之子", locked: true,
    stats: { attack: 3, magic: 1, speed: 4, maxHp: 34, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
    evaluation: "杀牌反击与判定爆发输出。复仇反击围绕自己和贝尔蒂丝遭受的单体杀牌展开反攻，爆头一击通过同色判定翻倍伤害，疯狂屠戮提供一次群体爆发。",
    skills: [
      { name: "复仇反击", type: "trigger", icon: "🔵", text: "当你成为实体单体【杀】的目标并使用【闪】后，你可以视为对伤害来源使用1张虚拟【杀（普攻）】；贝尔蒂丝以此法使用【闪】后也可以发动此效果。若贝尔蒂丝受到实体单体【杀】造成的伤害，你可以视为对伤害来源使用2张虚拟【杀（普攻）】。" },
      { name: "爆头一击", type: "passive", icon: "⭐", text: "锁定技，当你使用的【杀】未被【闪】抵消且即将造成伤害时，进行判定。若此【杀】与判定牌颜色相同，此伤害变为2倍。" },
      { name: "疯狂屠戮", type: "active", icon: "🔺", text: "限定技，出牌阶段，你视为使用X张虚拟【机枪扫杀】（X为你本场战斗已经行动过的回合数，至少为1）。", card: { name: "疯狂屠戮", type: "tactic", crazySlaughter: true, targetless: true, icon: "🔺", text: "视为使用等同于本场已行动回合数的虚拟【机枪扫杀】，至少使用1张。" } }
    ]
  },
  {
    id: "angelica", name: "安洁莉卡", gender: "female", face: "安", art: "./assets/images/angelica-portrait.webp", avatar: "./assets/images/angelica-portrait.webp", role: "红刃公主", locked: true, unlockCost: 14,
    stats: { attack: 3, magic: 1, speed: 3, maxHp: 45, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
    evaluation: "实体杀牌叠加倍率与承伤蓄力核心。力量爆发让本回合每张实体【杀】的伤害倍率递增，狂战意志在每次伤害后积累“狂战”标记并可代替杀意消耗，猩红暴走则把标记一次性转化为过牌与回复。",
    skills: [
      { name: "力量爆发", type: "passive", icon: "⭐", text: "锁定技，本回合内，你使用的实体【杀】牌造成的伤害×X，X为你本回合使用过的实体【杀】牌数+1。本回合结束后X重置。虚拟【杀】牌或转换【杀】牌不计入X。" },
      { name: "狂战意志", type: "passive", icon: "⭐", text: "锁定技，当你造成或受到伤害后，你获得1枚“狂战”标记。你使用实体【杀】牌时，可弃1枚“狂战”标记代替1点杀意消耗。“狂战”标记数量在头像旁以“狂战×N”显示，上限为10枚。" },
      { name: "猩红暴走", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以弃置所有“狂战”标记，摸等量的牌，然后回复X点生命值，X为你以此法弃置的“狂战”标记数×你生命值上限的10%。", card: { name: "猩红暴走", type: "tactic", crimsonRampage: true, targetless: true, icon: "⚔️", text: "弃置所有“狂战”标记，摸等量的牌，然后回复X点生命值，X为你以此法弃置的“狂战”标记数×你生命值上限的10%。" } }
    ]
  },
  {
    id: "luka", name: "鲁卡", gender: "male", face: "鲁", art: "./assets/images/luka-portrait.webp", avatar: "./assets/images/luka-portrait.webp", role: "军人之子", locked: true,
    stats: { attack: 3, magic: 1, speed: 4, maxHp: 38, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "自愈型杀牌输出。嗜血杀戮将杀牌生命值伤害转为恢复或满血补牌，狼牙回战让专属【狼牙杀】在战斗开始、使用战术牌后和回合开始时持续回到手牌。",
    skills: [
      { name: "嗜血杀戮", type: "passive", icon: "⭐", text: "锁定技，当你使用【杀】造成生命值伤害后，你恢复等同于此次生命值伤害的生命值；若你的生命值已满，改为摸1张牌。" },
      { name: "狼牙回战", type: "passive", icon: "⭐", text: "锁定技，战斗开始时，你获得1张无色【狼牙杀】。当你使用战术牌后，若【狼牙杀】位于弃牌堆，将其置入你的手牌；你的回合开始时，将【狼牙杀】置入你的手牌。" }
    ]
  },
  {
    id: "elrana", name: "艾尔拉娜", gender: "female", face: "艾", art: "./assets/images/elrana-new-portrait.webp", avatar: "./assets/images/elrana-new-portrait.webp", role: "科学公主", locked: true, unlockCost: 16,
    stats: { attack: 1, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "单体与群体治疗核心。回春之手根据弃牌后的手牌颜色切换治疗范围，再生肉体提供结束阶段自愈，疗后护理让实际恢复生命值的友方角色同步补牌。",
    skills: [
      { name: "回春之手", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以弃置1张手牌并指定一名友方角色，令其恢复X点生命值（X为你弃牌后的手牌数+你的魔力）。若弃牌后你的手牌均为红色，改为令所有友方角色各恢复X点生命值。", card: { name: "回春之手", type: "tactic", elranaHeal: true, allyTarget: true, icon: "⚔️", text: "弃置1张手牌并恢复一名友方角色；若剩余手牌均为红色，改为恢复所有友方角色。" } },
      { name: "再生肉体", type: "passive", icon: "⭐", text: "锁定技，结束阶段，你恢复X点生命值（X为你手牌中的红色牌数+你的魔力）；若你的生命值已满，改为摸1张牌。" },
      { name: "疗后护理", type: "passive", icon: "⭐", text: "锁定技，当一名友方角色实际恢复生命值后，该角色摸1张牌。" }
    ]
  },
  {
    id: "little_elrana", name: "小艾尔拉娜", gender: "female", face: "小", art: "./assets/images/elrana-clone.webp", avatar: "./assets/images/elrana-clone.webp", role: "艾尔拉娜的克隆女儿", locked: true,
    stats: { attack: 3, magic: 3, speed: 3, maxHp: 32, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
    evaluation: "持续毒伤与治疗联动辅助。毒针为杀牌附加可叠加的回合开始伤害，再生之躯提供自愈，协助母亲在艾尔拉娜完成有效治疗后为其补牌。",
    skills: [
      { name: "毒针", type: "passive", icon: "⭐", text: "锁定技，当你使用【杀】造成生命值伤害后，目标获得1枚“毒”标记。拥有“毒”标记的角色回合开始时，受到等同于其“毒”标记数的毒属性伤害。" },
      { name: "再生之躯", type: "passive", icon: "⭐", text: "锁定技，结束阶段，你恢复X点生命值（X为你手牌中的红色牌数+你的魔力）；若你的生命值已满，改为摸1张牌。" },
      { name: "协助母亲", type: "passive", icon: "⭐", text: "锁定技，当艾尔拉娜使用恢复类卡牌或技能并实际恢复生命值后，艾尔拉娜摸1张牌。" }
    ]
  },
  {
    id: "ace", name: "艾斯", gender: "male", face: "斯", art: "./assets/images/ace-portrait.webp", avatar: "./assets/images/ace-portrait.webp", role: "医生之子", locked: true,
    stats: { attack: 3, magic: 1, speed: 3, maxHp: 38, bloodlust: 1, handLimit: 5, drawPerTurn: 1, initialDraw: 2 },
    evaluation: "防守夺牌与手牌转移辅助。勾爪陷阱在成功响应敌方牌后夺取手牌，急逃为空手状态提供应急补牌，贡献计划将全部手牌和下回合杀意上限交给队友。",
    skills: [
      { name: "勾爪陷阱", type: "passive", icon: "⭐", text: "锁定技，当敌方角色使用牌指定你为目标后，若你因此使用【闪】或【看破】，你获得该角色1张手牌。" },
      { name: "急逃", type: "passive", icon: "⭐", text: "锁定技，每回合限一次，当敌方角色使用单体【杀】指定你为目标时，若你没有手牌，你摸X张牌（X为你的每回合摸牌数）。" },
      { name: "贡献计划", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以将所有手牌交给一名其他友方角色，令其下个回合的杀意上限+1。", card: { name: "贡献计划", type: "tactic", aceContribution: true, allyTarget: true, icon: "⚔️", text: "将所有手牌交给一名其他友方角色，令其下个回合的杀意上限+1。" } }
    ]
  },
  {
    id: "nanali", name: "娜娜莉", gender: "female", face: "娜", art: "./assets/images/nanali-portrait.webp", avatar: "./assets/images/nanali-portrait.webp", role: "纯血公主", locked: true, unlockCost: 30,
    stats: { attack: 3, magic: 3, speed: 3, maxHp: 32, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
    evaluation: "手牌封锁与反击终结核心。魔刀阿波罗暂时扣置目标手牌并补充自身资源，虚弱斩杀惩罚空手目标，复仇之刃在友方受伤后立即反攻。",
    skills: [
      { name: "魔刀阿波罗", type: "passive", icon: "⭐", text: "锁定技，当你使用单体【杀】指定一名敌方角色为目标时，你扣置其X张手牌（X为你使用此【杀】前的手牌数）；每扣置1张战术牌，你摸1张牌。任意角色回合结束时，以此法扣置的牌返回原角色手牌。" },
      { name: "虚弱斩杀", type: "passive", icon: "⭐", text: "锁定技，当你使用的单体【杀】对没有手牌的敌方角色造成伤害时，此伤害翻倍。" },
      { name: "复仇之刃", type: "trigger", icon: "🔵", text: "当一名友方角色受到敌方角色造成的伤害后，你可以视为对伤害来源使用1张虚拟【杀（普攻）】；若受伤角色为罗卡尔，改为对所有存活的敌方角色各使用1张虚拟【杀（普攻）】。" }
    ]
  },
  {
    id: "ophelia", name: "奥菲莉亚", gender: "female", face: "奥", art: "./assets/images/ophelia-portrait.webp", avatar: "./assets/images/ophelia-portrait.webp", role: "人鱼公主", locked: true,
    stats: { attack: 1, magic: 4, speed: 3, maxHp: 30, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
    evaluation: "物理单体杀牌转换与护驾防守核心。女王之尾将物理单体杀牌改为魔力结算，并在弃到杀牌时连续追击，为我护驾转移闪避或伤害责任，食人鱼公主通过死亡与击杀永久提高杀意上限。",
    skills: [
      { name: "女王之尾", type: "passive", icon: "⭐", text: "锁定技，你使用的物理单体【杀】视为魔法攻击并改为以魔力结算。若此牌造成生命值伤害，弃置目标1张牌；若弃置的是【杀】，你对同一个目标再次使用此【杀】。" },
      { name: "为我护驾", type: "passive", icon: "🔵", text: "当你成为【杀】的目标且没有【闪】时，你必须指定一名其他友方角色替你使用【闪】；若其没有【闪】，则改为替你承受此次伤害。若指定罗卡尔，其摸2张牌；若指定艾伦格，其摸4张牌。" },
      { name: "食人鱼公主", type: "passive", icon: "⭐", text: "锁定技，当一名角色因伤害死亡时，你于本场战斗获得1点杀意上限。若该角色由你击杀，你额外获得1点杀意上限并重置杀意；若死亡角色为罗卡尔或艾伦格，你摸3张牌。" }
    ]
  },
  {
    id: "aileng", name: "艾伦格", gender: "male", face: "艾", art: "./assets/images/aileng-portrait.webp", avatar: "./assets/images/aileng-portrait.webp", role: "充能王子", locked: true,
    stats: { attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "手牌循环与牌权转移角色。计算下注重整手牌并可重置杀意，战斗演练把已结算的牌交给队友，征服欲望根据伤害次数或角色死亡觉醒为不同的衍生能力。",
    skills: [
      { name: "计算下注", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以弃置至少1张手牌，然后摸等量牌。若你弃置了全部手牌，额外摸1张牌并重置杀意。", card: { name: "计算下注", type: "tactic", targetless: true, elranaBag: true, ailengBet: true, icon: "⚔️", text: "弃置至少1张手牌并摸等量牌；若弃置全部手牌，额外摸1张牌并重置杀意。" } },
      { name: "战斗演练", type: "passive", icon: "🔵", text: "当你使用的【杀】或战术牌结算完毕后，你可以将该牌交给一名其他友方角色。" },
      { name: "征服欲望", type: "passive", icon: "💰", text: "觉醒技，出牌阶段，若你本回合累计造成伤害超过7次，你获得【战斗之勇】；当场上有任意角色死亡后，你失去【计算下注】并获得【充能精华】。", derivedSkills: [
        { name: "战斗之勇", text: "锁定技，当你使用一张实体【杀】或【与我一战】时，你从摸牌堆摸1张牌。若摸到【杀】或【与我一战】，你恢复1点杀意。" },
        { name: "充能精华", text: "出牌阶段限一次，你可以指定一名友方女性角色，你弃置所有红桃牌，令其摸等量牌。若目标为贝丝妲，改为你弃置所有手牌，令贝丝妲摸等量牌，然后你受到等同于贝丝妲魔力的伤害；若你仍存活，你翻面并跳过下一个完整回合。若目标为七位姐姐之一且其对应儿子存活，该儿子获得1枚“绿帽”标记；若目标为娜娜莉或贝丝妲且罗卡尔存活，罗卡尔获得1枚“绿帽”标记。每名角色至多拥有5枚“绿帽”，每枚令手牌上限、杀意上限各+1，攻击力+30%。" }
      ] }
    ]
  },
  {
    id: "besta", name: "贝丝妲", gender: "female", face: "贝", art: "./assets/images/besta-portrait.webp", avatar: "./assets/images/besta-portrait.webp", role: "魅魔国长公主", locked: true, unlockCost: 40,
    stats: { attack: 2, magic: 4, speed: 2, maxHp: 28, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "黑色手牌驱动的暗属性魔力输出。黑暗之力扩充黑牌容量并转换部分杀牌结算，终焉鬼影斩批量释放黑牌，终焉回旋斩在闪避后按黑色【杀】数量反击。",
    skills: [
      { name: "终焉鬼影斩", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以依次将所有黑色手牌当【魔杀】使用，随机指定敌方角色为目标；这些【魔杀】不消耗杀意。", card: { name: "终焉鬼影斩", type: "tactic", targetless: true, bestaEndSlash: true, icon: "⚔️", text: "依次将所有黑色手牌当不消耗杀意的【魔杀】使用，并随机指定敌方目标。" } },
      { name: "黑暗之力", type: "passive", icon: "⭐", text: "锁定技，你的黑色牌不计入手牌上限。你使用的黑色且以攻击力结算的【杀】附加暗属性，并改为以魔力结算。" },
      { name: "终焉回旋斩", type: "trigger", icon: "🔵", text: "当你使用【闪】抵消【杀】后，你可以视为使用X张指定所有敌方角色为目标的虚拟【魔杀】（X为你手牌中的黑色【杀】数量）。" }
    ]
  }
];
