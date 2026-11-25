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
  // 2026-11-25：按需求删除全部技能牌图（skill-art-*.webp）出牌区也不再显示技能牌。
  // 卡牌图案（card-art-*.webp）全部保留，只供实体牌 / 状态牌 / 战术牌使用。
  // 技能牌（_skill / skillName）不再解析任何卡图，url 与 fallbackUrl 一律返回空串，
  // UICommonCardArt.html 收到空串就不会渲染 <img>，避免出现空 <img src=""> 或破图。
  const isSkill = card => !!card && !card.virtual && !card.convertedFrom
    && !!(card._skill || card.skillName);

  function url(cardOrName) {
    const card = typeof cardOrName === "string" ? { name: cardOrName } : cardOrName || {};
    if (isSkill(card)) return "";
    if (art[card.name]) return art[card.name];
    return art[fallback[card.type] || "蓄力"];
  }
  function fallbackUrl(cardOrName) {
    const card = typeof cardOrName === "string" ? { name: cardOrName } : cardOrName || {};
    return isSkill(card) ? "" : art[fallback[card.type] || "蓄力"];
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
