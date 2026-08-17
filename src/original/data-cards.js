const shoup4Defs = [
  { name: "杀（普攻）", type: "slash", scale: "attack", suits: { "♠": 4, "♥": 4, "♣": 4, "♦": 4 }, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。使用此牌需消耗1点杀意。" },
  { name: "魔杀", type: "slash", scale: "magic", attackType: "magic", suits: { "♠": 4, "♥": 4, "♣": 4, "♦": 4 }, text: "指定一名敌方角色为目标，对其发动魔法攻击，造成等同于你的魔力的物理伤害。使用此牌需消耗1点杀意。" },
  { name: "闪", type: "response", suits: { "♥": 8, "♦": 8 }, text: "当你成为【杀】的目标时，你可以使用此牌，抵消该【杀】对你造成的此次伤害。" },
  { name: "蓄力", type: "tactic", charge: 1, targetless: true, suits: { "♠": 3, "♣": 3 }, text: "本回合内，你使用的下一张【杀】造成的伤害×1.5。此效果可叠加。" },
  { name: "愈魔瓶", type: "consume", healPct: .3, healScale: "magic", allyTarget: true, suits: { "♥": 3, "♦": 3 }, text: "指定一名友方角色为目标，其恢复（其最大生命值的30%+你的魔力）点生命值。双击或拖出手牌区时，默认对自己使用。" },
];
const initialShopCardNames = ["魔力提炼", "拆解", "束缚陷阱", "封印术", "与我一战", "机枪扫杀", "物资补给", "看破", "生命之泉", "偷窃", "灵魂锁链", "魔弹特攻", "借刀杀人", "魔王军入侵"];
const starterSuits = { "♥": 1, "♦": 1, "♣": 1, "♠": 1 };
const eliteCardDefs = [
  { name: "毒杀", price: 700, type: "slash", scale: "attack", poison: true, suits: { "♠": 1, "♣": 1 }, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的毒属性伤害。若此牌造成生命值伤害，目标获得1层“毒”。" },
  { name: "伤口处理", price: 400, type: "tactic", healPct: .1, healScale: "attack", allyTarget: true, suits: { "♥": 1, "♦": 1 }, text: "指定一名友方角色为目标，其恢复（其最大生命值的10%+你的攻击力）点生命值。双击或拖出手牌区时，默认对自己使用。" },
  { name: "与我一战", price: 600, type: "tactic", duel: true, scale: "attack", suits: starterSuits, text: "指定一名敌方角色为目标。目标先打出1张【杀（普攻）】，然后你与其轮流打出1张【杀（普攻）】，直至任一方未打出。未打出的角色受到最后打出牌的角色造成的等同于其攻击力的物理伤害。" },
  { name: "魔力提炼", price: 1000, type: "tactic", drawCards: 2, targetless: true, suits: starterSuits, text: "你摸2张牌。" },
  { name: "拆解", price: 800, type: "tactic", discardTarget: true, suits: starterSuits, text: "指定一名有手牌的其他角色为目标，弃置其1张手牌；状态牌被拆除后立即进入消耗牌堆。" },
  { name: "束缚陷阱", price: 1500, type: "obstacle", statusKey: "stun", suits: { "♥": 1, "♦": 1 }, text: "指定1名敌方角色为目标，令其生成1张【眩晕】状态牌。同一角色不能持有多张【眩晕】。【眩晕】带有虚无属性；持有者在判定阶段进行判定，若结果为黑色，跳过本回合出牌阶段；持有者回合结束后消耗该状态牌。" },
  { name: "封印术", price: 1500, type: "obstacle", statusKey: "seal", suits: { "♣": 1, "♠": 1 }, text: "指定1名敌方角色为目标，令其生成1张【封魔】状态牌。同一角色不能持有多张【封魔】。【封魔】带有虚无属性；持有者在判定阶段进行判定，若结果为红色，跳过摸牌阶段，且本回合无法摸牌；持有者回合结束后消耗该状态牌。" },
  { name: "雷杀", price: 900, type: "slash", scale: "attack", shock: true, suits: { "♠": 1, "♦": 1 }, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的雷属性伤害。若此牌造成生命值伤害，目标获得1层“感电”。" },
  { name: "机枪扫杀", price: 1000, type: "slash", scale: "attack", sweep: true, targetless: true, suits: starterSuits, text: "指定所有敌方角色为目标，对其各造成等同于你的攻击力的物理伤害。" },
  { name: "无谋冲拳", price: 300, type: "response", reckless: true, suits: { "♠": 1, "♥": 1 }, text: "准备阶段，你可以打出此牌，随机指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。此牌视为响应牌，不触发“使用牌”类技能。" },
  { name: "物资补给", price: 400, type: "consume", drawTeam: 2, targetless: true, suits: starterSuits, text: "所有友方角色各摸2张牌。" },
  { name: "刺杀", price: 500, type: "slash", scale: "attack", assassinate: true, suits: { "♠": 1, "♣": 1 }, text: "指定一名敌方角色为目标，弃置其1张手牌，然后对其造成等同于你的攻击力的物理伤害。" },
  { name: "看破", price: 1000, type: "response", counterTactic: true, suits: starterSuits, text: "当敌方角色使用战术牌时，你可以使用此牌，令该战术牌无效；虚拟战术牌和转换战术牌也可以被此牌无效化。" },
  { name: "组合进攻", price: 800, type: "tactic", comboAttack: true, suits: { "♥": 1, "♣": 1 }, text: "指定一名敌方角色为目标，并选择一名其他友方角色。你与该友方角色依次对目标使用1张虚拟【杀（普攻）】；这2次攻击分别结算，目标可分别响应。此牌本身不造成伤害。" },
  { name: "生命之泉", price: 900, type: "consume", teamHealPct: .3, healScale: "magic", targetless: true, suits: starterSuits, text: "所有友方角色各恢复（其最大生命值的30%+你的魔力）点生命值。" },
  { name: "偷窃", price: 700, type: "tactic", stealCard: true, suits: starterSuits, text: "指定一名有手牌的其他角色为目标，获得其1张手牌；状态牌被偷走后立即进入消耗牌堆，不会转移。" },
  { name: "灵魂锁链", price: 1000, type: "tactic", soulChain: true, suits: starterSuits, text: "指定2名敌方角色为目标；若敌方仅剩1名角色，则指定该角色。目标获得“锁魂”标记，持续1轮。当一名带有“锁魂”标记的角色受到【杀】造成的生命值伤害后，同阵营其他带有“锁魂”标记的角色受到等量同属性伤害。" },
  { name: "魔法对决", price: 600, type: "tactic", attackType: "magic", magicDuel: true, suits: { "♠": 1, "♥": 1 }, text: "指定一名敌方角色为目标。目标先打出1张【魔杀】，然后你与其轮流打出1张【魔杀】，直至任一方未打出。未打出的角色受到最后打出牌的角色发动的魔法攻击，受到等同于该角色魔力的物理伤害。" },
  { name: "魔弹特攻", price: 700, type: "tactic", attackType: "magic", magicBullet: true, suits: starterSuits, text: "指定一名敌方角色为目标，目标随机展示1张手牌。你可以弃置1张与展示牌花色相同的手牌；若你如此做，对目标发动魔法攻击，造成等同于你的魔力的物理伤害，否则此牌无效。此伤害不可被响应。" },
  { name: "借刀杀人", price: 1000, type: "tactic", borrowSlash: true, suits: starterSuits, text: "选择一名其他友方角色，再指定一名敌方角色为目标，选择前者1张单体【杀】对后者使用；此次使用不触发“使用【杀】”类技能。若前者没有单体【杀】，选择其1张手牌交给你。" },
  { name: "魔王军入侵", price: 1200, type: "tactic", attackType: "magic", hybridAttack: true, demonInvasion: true, targetless: true, suits: starterSuits, text: "指定所有敌方角色为目标，对其各发动兼具物理与魔法属性的复合攻击，造成等同于你的攻击力与魔力之和的伤害。每名目标可打出1张单体【杀】，抵消其受到的此次伤害；开启手动响应时，由玩家选择是否打出。" },
  { name: "双重打杀", price: 1000, type: "slash", scale: "attack", fixedRepeats: 2, suits: { "♥": 1, "♦": 1 }, text: "指定一名敌方角色为目标，连续对其造成2次物理伤害，每次伤害等同于你的攻击力。" },
  { name: "暴走杀", price: 1000, type: "slash", scale: "attack", berserkKill: true, suits: { "♠": 1, "♥": 1 }, text: "每使用1次此牌，你本场战斗的攻击力+1。指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。" },
  { name: "咬杀", price: 1000, type: "slash", scale: "attack", biteKill: true, suits: { "♠": 1, "♥": 1 }, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。若此牌造成生命值伤害，你恢复等量生命值。" },
  { name: "放血", price: 1200, type: "tactic", bloodletting: true, targetless: true, suits: { "♣": 1, "♦": 1 }, text: "你失去相当于最大生命值10%的生命值（向下取整，至少1点，且不会因此低于1点生命值），然后摸1张牌并恢复1点杀意。" },
  { name: "圣杀", price: 1300, type: "slash", scale: "attack", holy: true, suits: { "♠": 1, "♦": 1 }, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的圣属性伤害。若此牌造成生命值伤害，目标获得“圣痕”标记。带有“圣痕”标记的角色受到圣属性伤害时，该伤害×2；其恢复生命值后移去“圣痕”标记。" },
  { name: "怒杀", price: 1200, type: "slash", scale: "attack", rageKill: true, suits: { "♠": 1, "♥": 1 }, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。若你的生命值未满，使用此牌不消耗杀意。" },
  { name: "佯攻", price: 700, type: "response", feint: true, suits: starterSuits, text: "当一名其他友方角色使用单体【杀】指定有手牌的敌方角色为目标时，你打出此牌，先弃置目标1张手牌。" },
  { name: "勒杀", price: 1200, type: "slash", scale: "attack", strangleKill: true, suits: starterSuits, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。若此牌造成生命值伤害，目标获得不可叠加的“勒脖”标记。目标每个准备阶段受到X点物理伤害（X为你施加标记时攻击力的一半，向下取整且至少1点）。" },
  { name: "战争号角", price: 800, type: "tactic", warHorn: true, targetless: true, suits: starterSuits, text: "你的杀意重置至上限，然后所有友方角色各从牌堆随机摸1张【杀】。" },
  { name: "追杀", price: 1100, type: "slash", scale: "attack", pursueKill: true, suits: starterSuits, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。当你使用的其他实体【杀】未造成生命值伤害时，本回合使用此牌不消耗杀意。" },
  { name: "弹反", price: 1400, type: "response", deflect: true, suits: starterSuits, text: "当你成为单体【杀】的目标时，你可以打出此牌并与伤害来源进行猜拳。平局则重新猜拳，直至分出胜负；若你获胜，将该【杀】的伤害反弹给伤害来源，否则该【杀】正常结算。" },
  { name: "武装", price: 1400, type: "tactic", armSelf: true, targetless: true, suits: starterSuits, text: "你获得X点护甲（X为你的攻击力）。" },
  { name: "撞杀", price: 1100, type: "slash", power: 0, scale: "attack", armoredRam: true, suits: starterSuits, text: "指定一名敌方角色为目标，对其造成（你的攻击力+你的当前护甲）点物理伤害。若伤害结算时你仍有护甲，且目标存活，令目标翻面。" },
  { name: "后空翻", price: 1100, type: "response", backflip: true, drawCards: 2, suits: starterSuits, text: "当你成为战术牌的目标时，你可以打出此牌，令该战术牌对你无效，然后摸2张牌。" },
  { name: "仇杀", price: 800, type: "slash", scale: "attack", revengeKill: true, suits: starterSuits, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的物理伤害。每有1名其他友方角色死亡，此牌造成的伤害翻倍1次。" },
  { name: "火杀", price: 600, type: "slash", scale: "attack", fire: true, burnCard: true, suits: starterSuits, text: "指定一名敌方角色为目标，对其造成等同于你的攻击力的火属性伤害，然后随机令目标1张手牌获得“燃烧”属性。持有“燃烧”牌的角色每个准备阶段失去1点生命值，且受到的火属性伤害翻倍。“燃烧”属性持续至战斗结束。" },
];
const cardFields = d => ({ name: d.name, type: d.type, power: d.power || 0, scale: d.scale || null, ...(d.attackType ? { attackType: d.attackType } : {}), magicDamage: !!d.magicDamage, hybridAttack: !!d.hybridAttack, charge: d.charge || 0, heal: d.heal || 0, healPct: d.healPct || 0, healScale: d.healScale || null, targetless: !!d.targetless, allyTarget: !!d.allyTarget, poison: !!d.poison, shock: !!d.shock, fire: !!d.fire, burnCard: !!d.burnCard, holy: !!d.holy, rageKill: !!d.rageKill, feint: !!d.feint, backflip: !!d.backflip, revengeKill: !!d.revengeKill, sweep: !!d.sweep, reckless: !!d.reckless, teamHealPct: d.teamHealPct || 0, drawTeam: d.drawTeam || 0, duel: !!d.duel, drawCards: d.drawCards || 0, discardTarget: !!d.discardTarget, stealCard: !!d.stealCard, statusKey: d.statusKey || "", soulChain: !!d.soulChain, assassinate: !!d.assassinate, counterTactic: !!d.counterTactic, comboAttack: !!d.comboAttack, magicDuel: !!d.magicDuel, magicBullet: !!d.magicBullet, borrowSlash: !!d.borrowSlash, demonInvasion: !!d.demonInvasion, ignoreResponse: !!d.ignoreResponse, fixedRepeats: d.fixedRepeats || 0, berserkKill: !!d.berserkKill, biteKill: !!d.biteKill, bloodletting: !!d.bloodletting, strangleKill: !!d.strangleKill, warHorn: !!d.warHorn, pursueKill: !!d.pursueKill, deflect: !!d.deflect, armSelf: !!d.armSelf, armoredRam: !!d.armoredRam, price: d.price || GameEconomy.shop.defaultCardPrice, text: d.text });
const makeDeck = defs => defs.flatMap(d => Object.entries(d.suits).flatMap(([suit, n]) => Array.from({ length: n }, () => ({ ...cardFields(d), suit }))));
const protectedBaseDeck = makeDeck(shoup4Defs), eliteCards = makeDeck(eliteCardDefs);
const initialShopDeck = makeDeck(eliteCardDefs.filter(d => initialShopCardNames.includes(d.name)));
const shoup4Deck = [...protectedBaseDeck, ...initialShopDeck];
const cardSources = {
  "毒杀": "魔国机械工厂·艾尔拉娜克隆体", "伤口处理": "魔国机械工厂·艾尔拉娜克隆体",
  "与我一战": "魔国机械工厂·克罗博士", "魔力提炼": "魔国机械工厂·克罗博士", "拆解": "魔国机械工厂·克罗博士",
  "雷杀": "魔国机械工厂·机械牛头王", "机枪扫杀": "魔国机械工厂·机械牛头王", "无谋冲拳": "魔国机械工厂·机械牛头王", "物资补给": "魔国机械工厂·机械牛头王",
  "刺杀": "魔国机械工厂·入侵者橘千樱", "看破": "魔国机械工厂·入侵者橘千樱", "组合进攻": "魔国机械工厂·入侵者橘千樱",
  "生命之泉": "魔国机械工厂·内英组杀手伊迪斯", "偷窃": "魔国机械工厂·内英组杀手伊迪斯", "灵魂锁链": "魔国机械工厂·内英组杀手伊迪斯",
  "魔法对决": "水下列车·内英组杀手拉芙", "魔弹特攻": "水下列车·内英组杀手拉芙",
  "双重打杀": "水下列车·鱼人武士", "暴走杀": "水下列车·鱼人武士",
  "咬杀": "水下列车·狂鲨海盗团船长莫迪奥", "放血": "水下列车·狂鲨海盗团船长莫迪奥",
  "圣杀": "水下列车·天鹰突击队队长莫娜", "怒杀": "水下列车·天鹰突击队队长莫娜",
  "佯攻": "兽人地下城·兽人王邦迪",
  "勒杀": "兽人地下城·凋零者1124号分裂体", "战争号角": "兽人地下城·凋零者1124号分裂体",
  "追杀": "兽人地下城·XX型凋零者1124号", "弹反": "兽人地下城·XX型凋零者1124号",
  "武装": "兽人地下城·特坚组护卫凯丽", "撞杀": "兽人地下城·特坚组护卫凯丽",
  "后空翻": "兽人地下城·内英组杀手樱羽丽莎", "仇杀": "兽人地下城·内英组杀手樱羽丽莎",
  "火杀": "兽人地下城·魔王巴卡尔",
};
const codexOf = d => ({ ...cardFields(d), suitsText: Object.entries(d.suits).map(([s, n]) => `${s}×${n}`).join(" "), source: cardSources[d.name] || "初始拥有" });
const cardCodex = [...shoup4Defs, ...eliteCardDefs].map(codexOf);
const baseCardNames = [...new Set(shoup4Deck.map(c => c.name))];
window.GameDataCards = {
  deckVersion: "shoup4-v15",
  baseDeck: shoup4Deck,
  protectedBaseDeck,
  baseCardNames,
  initialShopCardNames,
  repeatableDropCardNames: initialShopCardNames.filter(n => n !== "魔王军入侵"),
  marketCards: shoup4Deck.map(c => ({ ...c })),
  eliteCards,
  cardCodex,
  eliteUnlocks: { elrana_clone: ["毒杀", "伤口处理"], krow_doctor: ["与我一战", "魔力提炼", "拆解"], invader_chiyo: ["刺杀", "看破", "组合进攻"], mechanical_bull_king: ["雷杀", "机枪扫杀", "无谋冲拳", "物资补给"], pursuer_edis: ["生命之泉", "偷窃", "灵魂锁链"], raff_assassin: ["魔法对决", "魔弹特攻"], abe_mike: ["双重打杀", "暴走杀"], shark_captain_mordio: ["咬杀", "放血"], mona_eagle_captain: ["圣杀", "怒杀"], orc_king_bondi: ["佯攻"], guard_kelly: ["武装", "撞杀"], assassin_sakura_risa: ["后空翻", "仇杀"], witherer_1124_split: ["勒杀", "战争号角"], xx_witherer_1124: ["追杀", "弹反"], demon_king_bakaar: ["火杀"] },
};
