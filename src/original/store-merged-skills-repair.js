// 技能合并后的旧档迁移：从 store-repairs.js 拆出，保持对外行为完全一致。
// 零加载期依赖（只运行时读 GameData 模板），缺文件时主文件显式抛错。
window.StoreMergedSkillsRepair = (() => {
  // 战斗单位里的 skills / 技能卡是存档快照，不会随 state.chars 的模板重建
  // （migrateCharacter 只处理名册）。不清理会留下已删除技能的幽灵条目、
  // 旧被动型【狂战意志】（没有主动按钮）与「能打出但无效果」的死卡；
  // checkpoint 的 played 与共享牌堆同样是完整牌对象。
  const MERGED_REMOVED = new Set(["改造副作用", "猩红暴走"]);
  function normalizeMergedSkills(state) {
    const b = state?.battle;
    if (!b) return false;
    const templates = window.GameData?.characters || [];
    let changed = false;
    const units = [...(Array.isArray(b.allies) ? b.allies : []),
      ...(Array.isArray(b.enemies) ? b.enemies : [])];
    const cardLists = [b.played];
    units.forEach(unit => {
      if (!unit || typeof unit !== "object") return;
      const tpl = templates.find(c => c?.id === (unit.ref || unit.id));
      if (Array.isArray(tpl?.skills)) {
        const current = Array.isArray(unit.skills) ? unit.skills : [];
        const stale = !Array.isArray(unit.skills)
          || current.some(s => MERGED_REMOVED.has(s?.name)
            || (s?.name === "狂战意志" && s.type !== "active")
            || (s?.name === "淫气改造" && !/结束阶段/.test(s.text || "")))
          || !tpl.skills.every(t => current.some(s => s?.name === t?.name));
        if (stale) {
          const merged = tpl.skills.map(s => ({
            ...s, ...(s.card ? { card: { ...s.card } } : {}),
          }));
          const dynamic = current.filter(s => !merged.some(m => m.name === s?.name)
            && !MERGED_REMOVED.has(s?.name));
          unit.skills = merged.concat(dynamic);
          changed = true;
        }
      }
      if (unit.skipPlayReason === "改造副作用") {
        unit.skipPlayReason = "淫气改造";
        changed = true;
      }
      ["hand", "deck", "discard", "consumed"].forEach(key => cardLists.push(unit[key]));
      const pile = unit.pileStats;
      if (pile) ["deck", "discard", "consumed"].forEach(key => cardLists.push(pile[key]));
    });
    cardLists.forEach(list => {
      if (!Array.isArray(list)) return;
      list.forEach(card => {
        if (!card || typeof card !== "object") return;
        let hit = false;
        if (card.crimsonRampage || card.name === "猩红暴走") {
          delete card.crimsonRampage;
          card.berserkWill = true;
          card.name = "狂战意志";
          if (card.text) card.text = card.text.replace(/猩红暴走/g, "狂战意志");
          hit = true;
        }
        ["generatedBySkill", "sourceSkill", "skillName"].forEach(key => {
          if (card[key] !== "猩红暴走" && card[key] !== "改造副作用") return;
          card[key] = card[key] === "猩红暴走" ? "狂战意志" : "淫气改造";
          hit = true;
        });
        if (hit) changed = true;
      });
    });
    return changed;
  }
  return { normalizeMergedSkills };
})();
