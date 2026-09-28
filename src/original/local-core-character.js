window.LocalCoreCharacterOps = (() => {
  const { outcomes } = window.LocalCoreUtils;
  function char(core, id) { return core.chars.find(c => c.id === id); }
  function unlockChar(core, args) {
    const id = args.id, c = char(core, id), cost = c?.unlockCost || GameData.characters?.find(x => x.id === id)?.unlockCost;
    if (!c?.locked || !cost || core.resources.essence < cost) return outcomes.rejected;
    if (id === "besta" && !core.flags.bestaNurseryUnlocked) return outcomes.rejected;
    if (id === "sonia" && !core.flags.soniaNurseryUnlocked) return outcomes.rejected;
    if (id === "gerda" && !core.flags.gerdaNurseryUnlocked) return outcomes.rejected;
    core.resources.essence -= cost;
    c.locked = false;
    c.hp = c.stats?.maxHp || c.hp;
    // 凯瑟琳无独立入口：曼妮解锁后自动加入，需在此即时同步（否则要等下次读档才生效）
    window.StoreUnlockMigrations?.syncCatherineUnlock?.(core);
    return outcomes.changed;
  }
  return { unlockChar };
})();
