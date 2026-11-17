window.LocalCoreCharacterOps = (() => {
  const { outcomes, cleanGold } = window.LocalCoreUtils;
  function char(core, id) { return core.chars.find(c => c.id === id); }
  function unlockChar(core, args) {
    const id = args.id, c = char(core, id), cost = c?.unlockCost || GameData.characters?.find(x => x.id === id)?.unlockCost;
    if (!c?.locked || !cost || core.resources.essence < cost) return outcomes.rejected;
    if (id === "besta" && !core.flags.bestaNurseryUnlocked) return outcomes.rejected;
    if (id === "sonia" && !core.flags.soniaNurseryUnlocked) return outcomes.rejected;
    if (id === "gerda" && !core.flags.gerdaNurseryUnlocked) return outcomes.rejected;
    if (id === "noa" && !core.flags.noaNurseryUnlocked) return outcomes.rejected;
    core.resources.essence -= cost;
    c.locked = false;
    c.hp = c.stats?.maxHp || c.hp;
    // 凯瑟琳无独立入口：曼妮解锁后自动加入，需在此即时同步（否则要等下次读档才生效）
    window.StoreUnlockMigrations?.syncCatherineUnlock?.(core);
    return outcomes.changed;
  }
  function enhanceChar(core, args) {
    const enhance = window.CharacterEnhance;
    if (!enhance) return outcomes.rejected;
    const id = String(args?.id || ""), key = String(args?.stat || "");
    const c = char(core, id);
    const cost = enhance.COST, gold = cleanGold(core.resources?.gold);
    // 单次只加一项：属性键必须合法，缺参/伪造参数一律拒绝且不扣费。
    if (!enhance.statKeys.includes(key)) return outcomes.rejected;
    // 未解锁角色、金币不足或该项已达上限：一律拒绝且不扣费。
    if (!c || c.locked || gold < cost) return outcomes.rejected;
    const levels = enhance.levelsOf(c);
    if (levels[key] >= enhance.MAX_LEVEL) return outcomes.rejected;
    const level = enhance.step(c, key);
    // stats 不在此处累加：applyChars 会按各项次数覆盖式重算（见 withBonus 注释）。
    core.resources.gold = gold - cost;
    core.lastEnhance = { id, stat: key, level, cost };
    return outcomes.changed;
  }
  return { unlockChar, enhanceChar };
})();
