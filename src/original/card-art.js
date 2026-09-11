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
    "束缚陷阱": "./assets/generated/cards/card-art-binding-trap.5bb236e6.webp",
    "封印术": "./assets/generated/cards/card-art-seal-spell.4649c897.webp",
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
    "眩晕": "./assets/generated/cards/card-art-stun-status-new.58f54da8.webp",
    "封魔": "./assets/generated/cards/card-art-magic-seal-status.222ffb29.webp",
    "粘液": "./assets/generated/cards/card-art-slime-status.7f86dfcc.webp",
    "拼杀": "./assets/generated/cards/card-art-clash.edb75a11.webp",
    "魔之连杀": "./assets/generated/cards/card-art-magic-multi-kill.4112441b.webp",
    "魅惑术": "./assets/generated/cards/card-art-charm.21f8b4cd.webp",
    "魅杀": "./assets/generated/cards/card-art-succubus-slash.ac0bd910.webp",
    "偷袭": "./assets/generated/cards/card-art-ambush.5272e61c.webp",
    "冰冻术": "./assets/generated/cards/card-art-freeze-spell.b95d3886.webp",
    "流星杀": "./assets/generated/cards/card-art-meteor-slash.fe12b0fe.webp",
    "吸魔杀": "./assets/generated/cards/card-art-mana-steal.dc54839a.webp",
    "物资私分": "./assets/generated/cards/card-art-supply-sharing.3aafdb52.webp",
    "枪林弹雨": "./assets/generated/cards/card-art-bullet-storm.09c53e6c.webp",
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
    "热血契约": "./assets/generated/cards/skill-art-blood-pact.86515b89.webp",
    "狂风绝息斩": "./assets/generated/cards/skill-art-wind-execution.21c85fb4.webp",
    "榨取精华": "./assets/generated/cards/skill-art-essence-extract.b7145c8f.webp",
    "次元军火库": "./assets/generated/cards/skill-art-dimension-armory.b4b47e50.webp",
    "贪玩老虎机": "./assets/generated/cards/skill-art-playful-slot.e25dd2eb.webp",
    "模仿之音": "./assets/generated/cards/skill-art-mimic-voice.7656649e.webp",
    "偶像之吻": "./assets/generated/cards/skill-art-idol-kiss.b87d956c.webp",
    "神速之袭": "./assets/generated/cards/skill-art-speed-assault.94f48bb5.webp",
    "解答迷惑": "./assets/generated/cards/skill-art-answer-confusion.37cdaa5e.webp",
    "战场指挥官": "./assets/generated/cards/skill-art-battlefield-commander.8854b38c.webp",
    "疯狂射击": "./assets/generated/cards/skill-art-crazy-shooting.735324eb.webp",
    "苦肉鞭笞": "./assets/generated/cards/skill-art-self-punishing-whip.316e7796.webp",
    "疯狂屠戮": "./assets/generated/cards/skill-art-crazy-slaughter.70187f58.webp",
    "狂战意志": "./assets/generated/cards/skill-art-berserker-will.74c92ecb.webp",
    "猩红暴走": "./assets/generated/cards/skill-art-crimson-rampage.2d2468c6.webp",
    "回春之手": "./assets/generated/cards/skill-art-rejuvenating-hand.53d2b069.webp",
    "贡献计划": "./assets/generated/cards/skill-art-contribution-plan.5c201347.webp",
    "计算下注": "./assets/generated/cards/skill-art-calculated-bet.29ef1ee1.webp",
    "终焉鬼影斩": "./assets/generated/cards/skill-art-phantom-final-slash.a652ca00.webp",
    "半魅魔精华": "./assets/generated/cards/skill-art-half-succubus-essence.c71c3abc.webp",
    "杀欲窥视": "./assets/generated/cards/skill-art-killing-intent-gaze.9eed1604.webp",
    "暴走与极速": "./assets/generated/cards/skill-art-berserk-speed-shift.f6e7cca1.webp",
    "充能精华": "./assets/generated/cards/skill-art-charged-essence.fd83f56b.webp",
    "取粮": "./assets/generated/cards/skill-art-take-rations.74a8e30c.webp",
    "巴特雷": "./assets/generated/cards/skill-art-barrett.f98fc824.webp",
    "控神魔眼": "./assets/generated/cards/skill-art-control-eye.1291a4db.webp",
    "无人机采精": "./assets/generated/cards/skill-art-drone-extract.7c3a0b92.webp",
    "毒气手雷": "./assets/generated/cards/skill-art-poison-grenade.fe4bfefd.webp",
    "猛龙断空斩": "./assets/generated/cards/skill-art-dragon-slash.481f3a15.webp",
    "索敌雷达": "./assets/generated/cards/skill-art-targeting-radar.6e237707.webp",
    "震感闪光弹": "./assets/generated/cards/skill-art-shock-flashbang.a78b4b66.webp",
    "魔法巡飞弹": "./assets/generated/cards/skill-art-magic-cruise-missile.8dd004f3.webp",
    "恐怖巨锤": "./assets/generated/cards/skill-art-terror-hammer.92642403.webp",
    "鬼王扑克": "./assets/generated/cards/skill-art-demon-poker.22d93d33.webp",
    "1124号长舌头": "./assets/generated/cards/skill-art-long-tongue-1124.166aa9bd.webp",
    "军令状": "./assets/generated/cards/skill-art-military-order.3c919eca.webp",
    "放置地雷": "./assets/generated/cards/skill-art-mine-placement.c22c12c6.webp",
    "狙击目标": "./assets/generated/cards/skill-art-sniper-target.077d96a9.webp",
    "坦克炮弹": "./assets/generated/cards/skill-art-tank-shell.b7bcc54e.webp",
    "电钻火花": "./assets/generated/cards/skill-art-drill-spark.236e0585.webp",
    "机尾机枪": "./assets/generated/cards/skill-art-tail-machinegun.a8d29ad7.webp",
    "死亡音波": "./assets/generated/cards/skill-art-death-wave.689e0965.webp",
    "百眼魅魔": "./assets/generated/cards/skill-art-many-eyes.ed9c837d.webp",
    "潜影背刺": "./assets/generated/cards/skill-art-shadow-backstab.a5f14213.webp",
    "影舞步": "./assets/generated/cards/skill-art-shadow-dance.4f8cfc79.webp",
    "战场扫射": "./assets/generated/cards/skill-art-battlefield-sweep.dc08c5e1.webp",
    "增援部队": "./assets/generated/cards/skill-art-reinforcement.7a694f5c.webp",
    "蓄力子弹": "./assets/generated/cards/skill-art-artina-sniper.d751a4ee.webp",
    "荣誉祝福": "./assets/generated/cards/skill-art-maria-honor-blessing.14392afa.webp",
    "魅魔钢叉": "./assets/generated/cards/skill-art-succubus-fork.20768ad5.webp",
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
