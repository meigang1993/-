window.CardArt = (() => {
  const art = Object.freeze({
    "杀": "./assets/generated/cards/card-art-basic-slash.9b6ab50a.webp",
    "杀（普攻）": "./assets/generated/cards/card-art-basic-slash.9b6ab50a.webp",
    "魔杀": "./assets/generated/cards/card-art-magic-slash.2d2353e6.webp",
    "毒杀": "./assets/generated/cards/card-art-poison-slash.cd28909a.webp",
    "雷杀": "./assets/generated/cards/card-art-thunder-slash.9263b699.webp",
    "火杀": "./assets/generated/cards/card-art-fire-slash.ef14e210.webp",
    "圣杀": "./assets/generated/cards/card-art-holy-slash.be1aee92.webp",
    "机枪扫杀": "./assets/generated/cards/card-art-gatling-slash.295b69b7.webp",
    "咬杀": "./assets/generated/cards/card-art-bite-slash.dfedb10d.webp",
    "双重打杀": "./assets/generated/cards/card-art-double-slash.d35ca482.webp",
    "暴走杀": "./assets/generated/cards/card-art-berserk-slash.583b7fb8.webp",
    "仇杀": "./assets/generated/cards/card-art-revenge-slash.1d4ac914.webp",
    "撞杀": "./assets/generated/cards/card-art-armored-ram.861c5fef.webp",
    "追杀": "./assets/generated/cards/card-art-pursue-slash.755fc82a.webp",
    "刺杀": "./assets/generated/cards/card-art-assassinate.301115bf.webp",
    "勒杀": "./assets/generated/cards/card-art-strangle-slash.8eceb00c.webp",
    "怒杀": "./assets/generated/cards/card-art-rage-slash.197f7838.webp",
    "狼牙杀": "./assets/generated/cards/card-art-wolf-fang-slash.26e93535.webp",
    "闪": "./assets/generated/cards/card-art-dodge.d22afef8.webp",
    "看破": "./assets/generated/cards/card-art-see-through.4a555450.webp",
    "后空翻": "./assets/generated/cards/card-art-backflip.3d28ebcf.webp",
    "弹反": "./assets/generated/cards/card-art-deflect.0f1ce181.webp",
    "无谋冲拳": "./assets/generated/cards/card-art-reckless-punch.04233f97.webp",
    "佯攻": "./assets/generated/cards/card-art-feint.75a2b623.webp",
    "蓄力": "./assets/generated/cards/card-art-charge.bfb8fcb9.webp",
    "与我一战": "./assets/generated/cards/card-art-duel.1138c5e7.webp",
    "伤口处理": "./assets/generated/cards/card-art-wound-treatment.8b07ca7b.webp",
    "魔力提炼": "./assets/generated/cards/card-art-magic-refining.d40d78c6.webp",
    "拆解": "./assets/generated/cards/card-art-dismantle.2996df87.webp",
    "束缚陷阱": "./assets/generated/cards/card-art-binding-trap.338b9450.webp",
    "封印术": "./assets/generated/cards/card-art-seal-spell.124beeb0.webp",
    "借刀杀人": "./assets/generated/cards/card-art-borrowed-blade.de60cf28.webp",
    "魔王军入侵": "./assets/generated/cards/card-art-demon-invasion.82db049e.webp",
    "组合进攻": "./assets/generated/cards/card-art-combo-attack.ab59d9c0.webp",
    "灵魂锁链": "./assets/generated/cards/card-art-soul-chain.80890b9b.webp",
    "魔弹特攻": "./assets/generated/cards/card-art-magic-bullet.39bbad19.webp",
    "魔法对决": "./assets/generated/cards/card-art-magic-duel.521c2b95.webp",
    "战争号角": "./assets/generated/cards/card-art-war-horn.4727c9d2.webp",
    "放血": "./assets/generated/cards/card-art-bloodletting.f0182817.webp",
    "武装": "./assets/generated/cards/card-art-arm-self.887b5a75.webp",
    "偷窃": "./assets/generated/cards/card-art-steal.639a0455.webp",
    "愈魔瓶": "./assets/generated/cards/card-art-healing-mana-bottle.218ba846.webp",
    "物资补给": "./assets/generated/cards/card-art-supply-drop.4b31a930.webp",
    "生命之泉": "./assets/generated/cards/card-art-fountain-of-life.7458b046.webp",
    "眩晕": "./assets/generated/cards/card-art-stun-status-new.62b67f60.webp",
    "封魔": "./assets/generated/cards/card-art-magic-seal-status.d02d4678.webp",
    "粘液": "./assets/generated/cards/card-art-slime-status.7f86dfcc.webp",
    "混乱": "./assets/generated/cards/card-art-confusion-status.91da7313.webp",
    "冰冻": "./assets/generated/cards/card-art-freeze-status.89522a97.webp",
    "地雷": "./assets/generated/cards/card-art-mine-status.57ad08f3.webp",
    "拼杀": "./assets/generated/cards/card-art-clash.6898834c.webp",
    "魔之连杀": "./assets/generated/cards/card-art-magic-multi-kill.fc4aef40.webp",
    "魅惑术": "./assets/generated/cards/card-art-charm.b510209d.webp",
    "魅杀": "./assets/generated/cards/card-art-succubus-slash.3516d2f9.webp",
    "偷袭": "./assets/generated/cards/card-art-ambush.ae1a83e8.webp",
    "冰冻术": "./assets/generated/cards/card-art-freeze-spell.3821d462.webp",
    "流星杀": "./assets/generated/cards/card-art-meteor-slash.1581f246.webp",
    "吸魔杀": "./assets/generated/cards/card-art-mana-steal.8cec64c9.webp",
    "物资私分": "./assets/generated/cards/card-art-supply-sharing.b5524d4c.webp",
    "枪林弹雨": "./assets/generated/cards/card-art-bullet-storm.1f9c87b3.webp",
  });
  const fallback = Object.freeze({
    slash: "杀（普攻）",
    response: "闪",
    tactic: "蓄力",
    consume: "愈魔瓶",
    obstacle: "灵魂锁链",
    status: "眩晕",
  });
  const skillArt = Object.freeze({
    "热血契约": "./assets/generated/cards/skill-art-blood-pact.d333993a.webp",
    "狂风绝息斩": "./assets/generated/cards/skill-art-wind-execution.b663998e.webp",
    "榨取精华": "./assets/generated/cards/skill-art-essence-extract.ecb49b53.webp",
    "次元军火库": "./assets/generated/cards/skill-art-dimension-armory.98680273.webp",
    "贪玩老虎机": "./assets/generated/cards/skill-art-playful-slot.3104c35f.webp",
    "模仿之音": "./assets/generated/cards/skill-art-mimic-voice.ee17d220.webp",
    "偶像之吻": "./assets/generated/cards/skill-art-idol-kiss.03ce3e80.webp",
    "神速之袭": "./assets/generated/cards/skill-art-speed-assault.2df815af.webp",
    "解答迷惑": "./assets/generated/cards/skill-art-answer-confusion.4b87bb39.webp",
    "战场指挥官": "./assets/generated/cards/skill-art-battlefield-commander.7eb264a3.webp",
    "疯狂射击": "./assets/generated/cards/skill-art-crazy-shooting.cce6591a.webp",
    "苦肉鞭笞": "./assets/generated/cards/skill-art-self-punishing-whip.1afab66d.webp",
    "疯狂屠戮": "./assets/generated/cards/skill-art-crazy-slaughter.7dbbf054.webp",
    "狂战意志": "./assets/generated/cards/skill-art-berserker-will.51f36fec.webp",
    "猩红暴走": "./assets/generated/cards/skill-art-crimson-rampage.ba43cf6a.webp",
    "回春之手": "./assets/generated/cards/skill-art-rejuvenating-hand.08870ba4.webp",
    "贡献计划": "./assets/generated/cards/skill-art-contribution-plan.29b404d6.webp",
    "计算下注": "./assets/generated/cards/skill-art-calculated-bet.4054b9e6.webp",
    "终焉鬼影斩": "./assets/generated/cards/skill-art-phantom-final-slash.de39f1c5.webp",
    "半魅魔精华": "./assets/generated/cards/skill-art-half-succubus-essence.38f22194.webp",
    "杀欲窥视": "./assets/generated/cards/skill-art-killing-intent-gaze.96198fac.webp",
    "暴走与极速": "./assets/generated/cards/skill-art-berserk-speed-shift.aa36282b.webp",
    "充能精华": "./assets/generated/cards/skill-art-charged-essence.376fbb0d.webp",
    "取粮": "./assets/generated/cards/skill-art-take-rations.11d64493.webp",
    "巴特雷": "./assets/generated/cards/skill-art-barrett.9263336b.webp",
    "控神魔眼": "./assets/generated/cards/skill-art-control-eye.8765b0b1.webp",
    "无人机采精": "./assets/generated/cards/skill-art-drone-extract.a84f55e0.webp",
    "毒气手雷": "./assets/generated/cards/skill-art-poison-grenade.69277c14.webp",
    "猛龙断空斩": "./assets/generated/cards/skill-art-dragon-slash.64c65c7e.webp",
    "索敌雷达": "./assets/generated/cards/skill-art-targeting-radar.065fa2e0.webp",
    "震感闪光弹": "./assets/generated/cards/skill-art-shock-flashbang.1708cb72.webp",
    "魔法巡飞弹": "./assets/generated/cards/skill-art-magic-cruise-missile.e989e139.webp",
    "恐怖巨锤": "./assets/generated/cards/skill-art-terror-hammer.0c5ae580.webp",
    "鬼王扑克": "./assets/generated/cards/skill-art-demon-poker.e05b46de.webp",
    "1124号长舌头": "./assets/generated/cards/skill-art-long-tongue-1124.2cbb0cc8.webp",
    "军令状": "./assets/generated/cards/skill-art-military-order.794b2a24.webp",
    "放置地雷": "./assets/generated/cards/skill-art-mine-placement.06f31cda.webp",
    "狙击目标": "./assets/generated/cards/skill-art-sniper-target.f36526d7.webp",
    "坦克炮弹": "./assets/generated/cards/skill-art-tank-shell.cfe53029.webp",
    "电钻火花": "./assets/generated/cards/skill-art-drill-spark.73282249.webp",
    "机尾机枪": "./assets/generated/cards/skill-art-tail-machinegun.4d88dacf.webp",
    "死亡音波": "./assets/generated/cards/skill-art-death-wave.66c1eac9.webp",
    "百眼魅魔": "./assets/generated/cards/skill-art-many-eyes.8f373b74.webp",
    "潜影背刺": "./assets/generated/cards/skill-art-shadow-backstab.9f3e155f.webp",
    "影舞步": "./assets/generated/cards/skill-art-shadow-dance.eddbc5f2.webp",
    "战场扫射": "./assets/generated/cards/skill-art-battlefield-sweep.d9b5c850.webp",
    "增援部队": "./assets/generated/cards/skill-art-reinforcement.3a06f2c4.webp",
    "蓄力子弹": "./assets/generated/cards/skill-art-artina-sniper.b1dba20c.webp",
    "荣誉祝福": "./assets/generated/cards/skill-art-maria-honor-blessing.bb3f4b54.webp",
    "魅魔钢叉": "./assets/generated/cards/skill-art-succubus-fork.bdc0e56b.webp",
  });
  const skillFallback = "./assets/generated/cards/card-art-charge.bfb8fcb9.webp";
  const isSkill = card => !!card && !card.virtual && !card.convertedFrom
    && !!(card._skill || card.skillName);

  function url(cardOrName) {
    const card = typeof cardOrName === "string" ? { name: cardOrName } : cardOrName || {};
    if (art[card.name]) return art[card.name];
    const skillName = card.skillName || card.name;
    if (isSkill(card)) {
      return skillArt[skillName] || skillFallback;
    }
    return art[fallback[card.type] || "蓄力"];
  }
  function fallbackUrl(cardOrName) {
    const card = typeof cardOrName === "string" ? { name: cardOrName } : cardOrName || {};
    return isSkill(card) ? skillFallback : art[fallback[card.type] || "蓄力"];
  }

  function className(card = {}) {
    return [
      card.name === "狼牙杀" ? "colorless-card" : "",
      card.type === "status" ? "status-card" : "",
      card.void ? "void-status-card" : "",
    ].filter(Boolean).join(" ");
  }

  return { className, fallbackUrl, isSkill, url };
})();
