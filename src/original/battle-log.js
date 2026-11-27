window.BattleLog = (() => {
  function push(state, text) {
    state.battleLog = [text, ...(state.battleLog || [])];
    state.log = [text, ...(state.log || [])].slice(0, 30);
  }
  function unitRelics(state, unit) {
    return [...(unit?.battleRelics || []), ...((state?.equipment || {})[unit?.ref] || []), ...((state?.testEquipment || {})[unit?.ref] || [])];
  }
  // 只给「饰品已实际发动/触发」的战报自动配字幕。
  // 非锁定技/饰品的「可发动」「放弃发动」「发动失败」只是提示或失败回执，
  // 玩家并没有发动，绝不能显示「触发了 XX」字幕、也不能写「触发饰品」战报。
  // 注意不能一刀切排除所有「失败/跳过/无效」：如「剪刀刃拼花失败」
  // 「母亲怀表触发，跳过弃牌阶段」「粉色魅魔装触发，红牌对其无效」
  // 都是饰品真的触发了，字幕应当保留。故只排除「尚未发动」的措辞。
  const NOT_ACTIVATED = /可发动|可以发动|放弃发动|不发动|跳过（不发动）|请选择|发动[^，。]*失败|未能发动|不再额外结算前的提示/;
  // 通用反击面板点「跳过」写的是「<角色>跳过<技能>。」（无逗号短句），
  // 这同样属于「玩家没有发动」，饰品不得因此弹「触发了 XX」字幕。
  // 只匹配无逗号短句：「母亲怀表触发，跳过弃牌阶段」「…将跳过其回合」等
  // 饰品真触发的描述含逗号，不会被误杀。
  const SKIPPED_SKILL = /^[^，。]{1,30}跳过[^，。]{1,30}。$/;
  function maybeRelicCaption(state, text) {
    if (NOT_ACTIVATED.test(text) || SKIPPED_SKILL.test(text)) return;
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
