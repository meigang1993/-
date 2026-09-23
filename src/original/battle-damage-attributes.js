window.BattleDamageAttributes = (() => {
  const order = ["physical", "poison", "thunder", "fire", "holy", "dark", "ice"];
  const attackNames = { physical: "物理攻击", magic: "魔法攻击" };
  const names = {
    physical: "物理",
    poison: "毒",
    thunder: "雷",
    fire: "火",
    holy: "圣",
    dark: "暗",
    ice: "冰",
  };
  const isSlash = card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const hasSkill = (actor, name) => (actor?.skills || []).some(skill => skill.name === name);
  function attackType(card = {}, source = "", actor = null) {
    const label = `${card.name || ""} ${source || ""}`;
    if (card.attackType === "magic" || card.magicDamage || card.scale === "magic" || card.magicBullet || card.magicDuel || card.demonInvasion) return "magic";
    if (/(?:锁魂镰刀|鬼牌狂欢|爱之鞭挞|充能精华|自爆倒计时)/.test(label)) return "magic";
    if (actor?.extractMagicAttack && (card.type === "slash" || card.type === "tactic")) return "magic";
    if (actor?.ref === "besta" && card.dark && isSlash(card)) return "magic";
    if (actor?.ref === "ophelia" && !card?._skipUseKillTriggers
      && (card?._queenTailConverted
        || window.CardUtils?.isPhysicalSingleKill?.(actor, card))) return "magic";
    if (actor?.ai === "mona_eagle_captain" && card.holy && isSlash(card)) return "magic";
    return "physical";
  }
  const isMagic = (...args) => attackType(...args) === "magic";
  function resolve(card = {}, source = "", actor = null) {
    const label = `${card.name || ""} ${source || ""}`;
    const found = new Set();
    (card.damageTypes || []).forEach(type => {
      if (order.includes(type)) found.add(type);
    });
    if (card.poison || /(?:毒杀|毒针|毒气手雷|中毒|^毒$)/.test(label) || hasSkill(actor, "毒针") && isSlash(card)) found.add("poison");
    if (card.shock || card.shockBonus || /(?:雷杀|感电|电磁反制装置)/.test(label)) found.add("thunder");
    if (card.fire || /聚焦喷火器/.test(label)) found.add("fire");
    if (card.holy || /(?:圣杀|圣剑无双|圣天破军剑|圣痕)/.test(label)) found.add("holy");
    if (card.dark || /终焉鬼影斩/.test(label)) found.add("dark");
    if (card.ice || /(?:冰杀|冰晶|寒冰)/.test(label)) found.add("ice");
    if (!found.size) found.add("physical");
    return order.filter(type => found.has(type));
  }
  const primary = (...args) => resolve(...args)[0];
  return { order, names, attackNames, resolve, primary, attackType, isMagic };
})();
