// 角色强化：每次消耗 5000 莉莉丝元，只永久提升玩家选择的一项属性。
// 加成不写进 stats 累加，而是由「各项次数 × 单次加成」在每次属性重算时覆盖式叠加，
// 因此升级、读档、迁移、ServerCore 回写等所有重算路径都幂等，不会重复加。
window.CharacterEnhance = (() => {
  const COST = 5000;
  const MAX_LEVEL = 50; // 每项属性各自的上限；旧档超限次数不保留，读档/落盘一律收敛到此值
  const BONUS = Object.freeze({ maxHp: 3, attack: 1, magic: 1, speed: 1 });
  const statKeys = Object.freeze(["maxHp", "attack", "magic", "speed"]);
  const NAMES = Object.freeze({ maxHp: "生命值", attack: "攻击力", magic: "魔力", speed: "速度" });

  // 旧存档（含 enhanceLevel 旧字段）里超过 50 次的部分一律不保留：
  // 读档与 compactSaveData 落盘都走这里，写回的四元组每项最多 50 次。
  function cleanLevel(value) {
    const raw = Math.floor(Number(value) || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(MAX_LEVEL, raw);
  }

  // 旧档 enhanceLevel 是「花 1000 一次加四项」的旧次数；缺 enhance 时按四项各 n 次还原，
  // 保证旧存档加成一点不少，也不会被新字段重复叠加。enhance 存在时一律以它为准。
  function levelsOf(character) {
    const raw = character?.enhance;
    const hasNew = !!raw && typeof raw === "object" && !Array.isArray(raw);
    const legacy = hasNew ? 0 : cleanLevel(character?.enhanceLevel);
    const out = {};
    statKeys.forEach(key => { out[key] = hasNew ? cleanLevel(raw[key]) : legacy; });
    return out;
  }
  function normalize(character) { return levelsOf(character); }
  function levelOf(character, key) { return levelsOf(character)[key] || 0; }
  function totalOf(character) {
    const lv = levelsOf(character);
    return statKeys.reduce((sum, key) => sum + lv[key], 0);
  }
  function bonusOf(character) {
    const lv = levelsOf(character);
    const out = {};
    statKeys.forEach(key => { out[key] = BONUS[key] * lv[key]; });
    return out;
  }
  function withBonus(stats, character) {
    const out = { ...(stats || {}) };
    const bonus = bonusOf(character);
    statKeys.forEach(key => {
      const raw = Number(out[key]);
      // 属性统一为整数：NaN/Infinity 归零，其余四舍五入收敛浮点长尾后叠加整数加成。
      const value = Number.isFinite(raw) ? Math.round(raw) : 0;
      out[key] = Math.round(value + bonus[key]);
    });
    return out;
  }
  // 结算写回：展开成新四元组并删除旧字段，避免存档里两个口径并存。
  function step(character, key) {
    const next = levelsOf(character);
    next[key] = Math.min(MAX_LEVEL, next[key] + 1);
    character.enhance = next;
    delete character.enhanceLevel;
    return next[key];
  }
  // 不可强化场景统一判定源：面板置灰与动作层守卫都读这里，避免两处口径不一致时
  // 「按钮灰了、绕过按钮却仍能扣费」。副本以 state.explore 为准（出征写入、结算或
  // 回据点时清空），它同时覆盖副本内战斗、节点结算、仓库与远征确认；视图前缀兜住
  // run 已清空但视图尚未切换的残留态。副本内战斗优先显示「副本中不可强化」。
  function blockedReason(state) {
    const view = String(state?.view || "");
    if (state?.explore || view.startsWith("dungeon")) return "副本中不可强化";
    if (view === "battle" || view === "battleLoading") return "战斗中不可强化";
    return "";
  }
  return {
    COST, MAX_LEVEL, BONUS, NAMES, statKeys,
    cleanLevel, levelsOf, normalize, levelOf, totalOf, bonusOf, withBonus, step, blockedReason,
  };
})();
