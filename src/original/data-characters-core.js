window.GameDataCharactersCore = [
  {
    id: "lokar", name: "罗卡尔", gender: "male", face: "洛", art: "./assets/images/lokar-portrait.webp", avatar: "./assets/images/lokar-portrait.webp", role: "恋母勇者",
    stats: { attack: 3, magic: 1, speed: 3, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
    evaluation: "持续进攻型物理核心。使用实体【杀】与【与我一战】可补充手牌和杀意，热血契约提供回合内攻击成长，狂风绝息斩负责集中释放手中的全部【杀】。",
    skills: [
      { name: "战斗之勇", type: "passive", text: "锁定技，当你使用一张实体【杀】或【与我一战】时，你从摸牌堆摸1张牌。若摸到【杀】或【与我一战】，你恢复1点杀意。" },
      { name: "热血契约", type: "active", text: "出牌阶段限一次，你可以将1张手牌置入消耗牌堆，然后摸3张牌，并于本回合获得X点攻击力（X为你消耗牌堆中的牌数）。", card: { name: "热血契约", type: "tactic", bloodPact: true, targetless: true, icon: "⚔️", text: "将1张手牌置入消耗牌堆，摸3张牌，并于本回合获得等同于消耗牌堆牌数的攻击力。" } },
      { name: "狂风绝息斩", type: "active", icon: "🔺", text: "限定技，出牌阶段，你依次使用手牌中的所有【杀】，并随机循环指定存活的敌方角色为目标；这些【杀】不消耗杀意。", card: { name: "狂风绝息斩", type: "tactic", lokarWindSlash: true, targetless: true, icon: "🔺", text: "依次使用手牌中的所有【杀】，随机循环指定敌方目标，且不消耗杀意。" } }
    ]
  },
  {
    id: "besta_doll", name: "贝丝妲魔偶", gender: "female", face: "偶", art: "./assets/images/besta-doll-portrait.webp", avatar: "./assets/images/besta-doll-portrait.webp", role: "机器魔偶",
    stats: { attack: 2, magic: 3, speed: 3, maxHp: 28, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "红桃爆发与魔法收割核心。榨取精华以友方男性的生命值换取摸牌，每张红桃令本回合魔力增加50%，并将物理攻击牌转换为魔法攻击；追魂之刃会在实体【杀】被闪后重用原牌，锁魂镰刀负责群体连锁收割。",
    skills: [
      { name: "追魂之刃", type: "passive", text: "锁定技，当你使用的实体【杀】被【闪】抵消后，你额外再次使用此牌1次。此次使用不消耗手牌和杀意，且不能再次触发此技能。" },
      { name: "锁魂镰刀", type: "passive", text: "锁定技，当你使用单体【杀】造成生命值伤害后，你对所有存活的敌方角色各造成等同于你魔力的无视护甲伤害。若有角色因此死亡，重复此效果，至多重复4次。" },
      { name: "榨取精华", type: "active", icon: "🔵", text: "准备阶段限一次，你可以令一名友方男性角色失去X点生命值，然后你摸X张牌；每张红桃牌令你本回合魔力增加50%（按发动时的基础魔力加算，X为你手牌中的红桃牌数）。本回合内，你使用的所有物理攻击牌均转换为魔法攻击。", card: { name: "榨取精华", type: "tactic", extract: true, icon: "🔵", text: "令一名友方男性角色失去等同于你红桃手牌数的生命值并摸等量牌；每张红桃牌令你本回合魔力增加50%，且本回合使用的所有物理攻击牌均转换为魔法攻击。" } }
    ]
  },
  {
    id: "manny", name: "曼妮", gender: "female", face: "曼", art: "./assets/images/manny-portrait.webp", avatar: "./assets/images/manny-portrait.webp", role: "异次元公主", locked: true, unlockCost: 10,
    stats: { attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 3 },
    evaluation: "伤害转移与重火器支援角色。次元转移可用黑色手牌改写友方受到的杀牌伤害目标，次元军火库则按战况选择单体、群体或属性火力。",
    skills: [
      { name: "次元转移", type: "trigger", icon: "⭐", text: "当一名友方角色即将受到单体【杀】的伤害时，你可以选择并弃置1张黑色手牌，再指定一名敌方角色，将此次伤害转移给该角色。转移后的伤害不能再次触发此技能。" },
      { name: "次元军火库", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以从刺刀AK47、巴特雷、反坦克炮和聚焦喷火器中选择1种重火器，并立即获得所选效果。", card: { name: "次元军火库", type: "tactic", mannyArmory: true, targetless: true, icon: "⚔️", text: "从4种重火器中选择1种，并立即获得所选效果。" } }
    ]
  },
  {
    id: "miller", name: "米勒", gender: "male", face: "米", art: "./assets/images/miller-portrait.webp", avatar: "./assets/images/miller-portrait.webp", role: "女仆之子", locked: true,
    stats: { attack: 3, magic: 3, speed: 3, maxHp: 40, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "随机摸牌与手牌转移辅助。贪玩老虎机提供波动较大的补牌量，收获分享可将弃牌阶段需要弃置的手牌转交给其他友方角色。",
    skills: [
      { name: "贪玩老虎机", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以随机转动3格老虎机：3格均不同时摸1张牌，2格相同时摸4张牌，3格均相同时摸8张牌。", card: { name: "贪玩老虎机", type: "tactic", millerSlot: true, targetless: true, icon: "⚔️", text: "转动3格老虎机，并根据图标组合摸1张、4张或8张牌。" } },
      { name: "收获分享", type: "trigger", icon: "⭐", text: "弃牌阶段，当你因手牌上限需要弃置手牌时，你可以改为将这些牌交给一名其他友方角色。" }
    ]
  },
  {
    id: "nonoka", name: "诺诺卡", gender: "female", face: "诺", art: "./assets/images/nonoka-portrait.webp", avatar: "./assets/images/nonoka-portrait.webp", role: "乐星公主", locked: true, unlockCost: 12,
    stats: { attack: 1, magic: 3, speed: 3, maxHp: 34, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "花色循环、伤害来源替换与治疗辅助。新月之歌持续补牌并分配手牌，模仿之音联动指定角色的出牌，偶像之吻同时恢复自己与一名队友。",
    skills: [
      { name: "新月之歌", type: "passive", icon: "⭐", text: "锁定技，你的回合内，每当你首次使用一种花色的牌时，记录该花色并摸1张牌。结束阶段，你摸X张牌，然后可以将X张手牌交给一名其他友方角色；若手牌不足X张则全部交出（X为本回合记录的花色数）。" },
      { name: "模仿之音", type: "active", icon: "⚔️", text: "准备阶段，你可以指定一名其他角色。直到回合结束，你造成伤害时的伤害来源视为该角色；该角色每使用或打出1张牌后，友方手牌数最少的角色摸1张牌。", card: { name: "模仿之音", type: "tactic", mimicVoice: true, icon: "⚔️", text: "指定一名其他角色，直到回合结束，你造成伤害时的伤害来源视为该角色。" } },
      { name: "偶像之吻", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以弃置1张红桃牌并指定一名其他友方角色，你与其各恢复X点生命值（X为你弃牌后的手牌数+你的魔力）。", card: { name: "偶像之吻", type: "tactic", idolKiss: true, allyTarget: true, icon: "⚔️", text: "弃置1张红桃牌，你与一名其他友方角色各恢复等同于你剩余手牌数+魔力的生命值。" } }
    ]
  },
  {
    id: "loki", name: "洛基", gender: "male", face: "洛", art: "./assets/images/loki-portrait.webp", avatar: "./assets/images/loki-portrait.webp", role: "偶像之子", locked: true,
    stats: { attack: 3, magic: 1, speed: 3, maxHp: 42, bloodlust: 2, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "禁用战术牌的纯杀牌输出。手中可见【杀】数量占优时可使杀牌伤害翻倍，并能替诺诺卡响应或承受杀牌伤害；青春草原提供永久成长。",
    skills: [
      { name: "智障力大", type: "passive", icon: "⭐", text: "锁定技，你不能使用战术牌。当你使用【杀】造成伤害时，若你手牌中的可见【杀】数加上此次使用的【杀】多于目标手牌中的可见【杀】数，此伤害翻倍。" },
      { name: "护母心切", type: "passive", icon: "⭐", text: "锁定技，当诺诺卡成为【杀】的目标时，你代替她使用1张【闪】；若你未能以此法使用【闪】，你代替她承受此次伤害。" },
      { name: "青春草原", type: "passive", icon: "⭐", text: "锁定技，当诺诺卡对其他男性角色发动【偶像之吻】后，你获得1枚“绿帽”标记，至多5枚。每枚标记令你的手牌上限、杀意上限各+1，攻击力+30%。" }
    ]
  },
  {
    id: "flora", name: "芙萝娅", gender: "female", face: "芙", art: "./assets/images/flora-portrait.71c5d516.webp", avatar: "./assets/images/flora-portrait.71c5d516.webp", role: "音速公主", locked: true, unlockCost: 8,
    twinWith: "wendy",
    stats: { attack: 3, magic: 1, speed: 5, maxHp: 28, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 3 },
    evaluation: "高速刺杀与协同追击角色。神速之袭可在准备和结束阶段各突袭一次，准备阶段发动时跳过判定和摸牌，结束阶段发动后自身翻面；神速之翼提供稳定闪避，神速飞剑每回合对同一目标最多追加一次弃牌与刺杀。",
    skills: [
      { name: "神速之袭", type: "active", icon: "⚔️", text: "准备阶段和结束阶段各限一次，你可以指定一名敌方角色，视为对其使用1张虚拟【刺杀】；准备阶段发动时跳过本回合的判定阶段和摸牌阶段，结束阶段发动后你翻面。若这张虚拟【刺杀】的直接伤害令实际受伤目标死亡且目标不处于待复活状态，你摸X张牌（X为你的初始摸牌数）。", card: { name: "神速之袭", type: "tactic", speedAssault: true, icon: "⚔️", text: "准备阶段和结束阶段各限一次，指定一名敌方角色并视为对其使用虚拟【刺杀】；准备阶段发动时跳过判定和摸牌，结束阶段发动后你翻面。" } },
      { name: "神速之翼", type: "passive", icon: "⭐", text: "锁定技，当你成为【杀】的目标时，你将1张手牌当【闪】使用。" },
      { name: "神速飞剑", type: "passive", icon: "⭐", text: "锁定技，每回合对同一目标最多触发一次。当其他友方角色使用的单体【杀】未被【闪】抵消后，你弃置目标1张手牌，然后视为对其使用1张虚拟【刺杀】。" }
    ]
  },
  {
    id: "wendy", name: "温蒂", gender: "female", face: "温", art: "./assets/images/wendy-portrait.f262b034.webp", avatar: "./assets/images/wendy-portrait.f262b034.webp", role: "智慧公主", locked: true, unlockCost: 8,
    twinWith: "flora",
    stats: { attack: 1, magic: 3, speed: 4, maxHp: 34, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
    evaluation: "战术牌生成与团队护甲辅助。读书的智慧从友方战术牌中补牌，解答迷惑定向制造临时战术牌，飘浮掩体把弃牌转化为全队护甲。",
    skills: [
      { name: "飘浮掩体", type: "passive", icon: "⭐", text: "锁定技，弃牌阶段，你每弃置2张手牌，所有友方角色各获得1点护甲；芙萝娅改为获得2点护甲。" },
      { name: "读书的智慧", type: "passive", icon: "⭐", text: "锁定技，当一名友方角色使用一张非技能战术牌时，你摸1张牌。" },
      { name: "解答迷惑", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以选择1张战术牌并获得1张同名临时牌，然后可以将其交给一名其他友方角色。此牌离开手牌后进入消耗牌堆。若交给芙萝娅，此技能本回合可额外发动1次。", card: { name: "解答迷惑", type: "tactic", wendyTutor: true, targetless: true, icon: "⚔️", text: "获得1张所选战术牌的同名临时牌，并可将其交给一名其他友方角色；此牌离开手牌后进入消耗牌堆。" } }
    ]
  },
  {
    id: "cadicis", name: "卡迪西斯", gender: "male", face: "卡", art: "./assets/images/cadicis-portrait.webp", avatar: "./assets/images/cadicis-portrait.webp", role: "教师之子", locked: true,
    stats: { attack: 3, magic: 3, speed: 3, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
    evaluation: "牌名强化与群体火力支援角色。战场指挥官强化友方同名杀牌与战术牌，指挥官责任在队友受击前调配手牌，重火力支援使实体杀牌附带继承其伤害属性的全体直伤。",
    skills: [
      { name: "战场指挥官", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以展示1张【杀】或战术牌并记录其牌名。其他友方角色使用同名【杀】或战术牌时，该牌造成的伤害翻倍且不可响应。", card: { name: "战场指挥官", type: "tactic", cadicisPlan: true, targetless: true, icon: "⚔️", text: "展示1张【杀】或战术牌并记录牌名，强化其他友方角色使用的同名【杀】或战术牌。" } },
      { name: "指挥官责任", type: "trigger", icon: "🔵", text: "当一名其他友方角色成为单体【杀】的目标时，你可以摸1张牌，然后交给其1张手牌。若该角色为温蒂，改为摸2张牌并交给其2张手牌。" },
      { name: "重火力支援", type: "passive", icon: "⭐", text: "锁定技，当你使用一张实体【杀】后，你对所有存活的敌方角色各造成等同于你攻击力的无视护甲伤害；该伤害继承此【杀】的伤害属性与物理/魔法类别。" }
    ]
  },
  {
    id: "carlos", name: "卡洛斯", gender: "male", face: "卡", art: "./assets/images/carlos-portrait.webp", avatar: "./assets/images/carlos-portrait.webp", role: "风女之子", locked: true,
    stats: { attack: 3, magic: 1, speed: 4, maxHp: 32, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 4 },
    evaluation: "红牌转化与单体追加伤害输出。疯狂射击把红色手牌转为群体杀牌，疯狂刺刀根据命中后仍持有的【杀】数量追加多段无视护甲伤害。",
    skills: [
      { name: "疯狂射击", type: "active", icon: "⚔️", text: "出牌阶段限一次，你可以将1张红色手牌当【机枪扫杀】使用，并保留该牌原有花色。", card: { name: "疯狂射击", type: "tactic", crazyShooting: true, targetless: true, icon: "⚔️", text: "将1张红色手牌当【机枪扫杀】使用，并保留原花色。" } },
      { name: "疯狂刺刀", type: "passive", icon: "⭐", text: "锁定技，当你使用的单体【杀】未被【闪】抵消并造成生命值伤害后，你对目标追加X次等同于你攻击力的无视护甲伤害（X为你当前手牌中的【杀】数）。" }
    ]
  }
];
