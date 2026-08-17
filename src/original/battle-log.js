window.BattleLog = (() => {
  function push(state, text) {
    state.battleLog = [text, ...(state.battleLog || [])];
    state.log = [text, ...(state.log || [])].slice(0, 30);
  }
  function unitRelics(state, unit) {
    return [...(unit?.battleRelics || []), ...((state?.equipment || {})[unit?.ref] || []), ...((state?.testEquipment || {})[unit?.ref] || [])];
  }
  function maybeRelicCaption(state, text) {
    const b = state?.battle, units = b?.allies?.concat(b.enemies || []) || [];
    const unit = units.find(u => text.startsWith(u.name));
    if (!unit) return;
    const relic = unitRelics(state, unit).find(name => text.includes(name));
    if (relic) window.BattleLines?.skill?.(state, unit, relic);
  }
  function add(state, text) {
    if (!text) return;
    maybeRelicCaption(state, text);
    const pending = state.battle?._pendingBattleSkillLog;
    if (pending && state.battleLog?.[0] === pending.text && text.includes(pending.unitName) && text.includes(pending.name)) {
      state.battleLog[0] = text;
      if (state.log?.[0] === pending.text) state.log[0] = text;
      state.battle._skipNextBattleSkillLog = pending.key;
      queueMicrotask(() => {
        if (state.battle?._skipNextBattleSkillLog === pending.key) delete state.battle._skipNextBattleSkillLog;
      });
    } else push(state, text);
    if (state.battle) delete state.battle._pendingBattleSkillLog;
  }
  function skill(state, unit, name, target) {
    if (!state?.battle || !unit?.name || !name) return;
    const key = `${unit.uid || unit.name}:${name}`;
    if (state.battle._skipNextBattleSkillLog === key) {
      delete state.battle._skipNextBattleSkillLog;
      return;
    }
    const relic = window.RelicSystem?.isKnown?.(name);
    const action = relic ? (window.RelicSystem?.isActive?.(name) ? "使用饰品" : "触发饰品") : "发动技能";
    const text = `${unit.name}${action}【${name}】${target?.name ? `，目标为${target.name}` : ""}。`;
    push(state, text);
    state.battle._pendingBattleSkillLog = { text, unitName: unit.name, name, key };
  }
  function clear(state) {
    state.battleLog = [];
    if (state.battle) {
      delete state.battle._pendingBattleSkillLog;
      delete state.battle._skipNextBattleSkillLog;
    }
  }
  return { add, skill, clear };
})();
