window.BattleCounterTriggers = (() => {
  function entry(payload, unit) {
    return {
      skill: payload.skill, unitUid: unit.uid, unitName: unit.name,
      sourceUid: payload.sourceUid,
      targetUid: payload.targetUid || payload.sourceUid,
      targetUids: Array.isArray(payload.targetUids)
        ? [...payload.targetUids] : null,
      mode: payload.mode || "single",
      count: Math.max(1, payload.count || 1),
    };
  }
  function activateNext(battle) {
    if (!battle || battle.counterTrigger) return false;
    const next = battle.counterTriggerQueue?.shift();
    if (!battle.counterTriggerQueue?.length) battle.counterTriggerQueue = null;
    if (!next) return false;
    battle.counterTrigger = next;
    battle.locked = true;
    return true;
  }
  function open(state, payload) {
    const battle = state?.battle;
    const unit = battle?.allies?.find(item => item.uid === payload?.unitUid);
    if (!battle || !unit || unit.hp <= 0
      || !payload?.skill || !payload?.sourceUid) return false;
    const prompt = entry(payload, unit);
    if (battle.counterTrigger || battle._counterTriggerResolving
      || battle._damageDepth > 0) {
      (battle.counterTriggerQueue ||= []).push(prompt);
    } else {
      battle.counterTrigger = prompt;
      battle.locked = true;
    }
    window.BattleLog?.add?.(state, `${unit.name} 可以发动${payload.skill}。`);
    return true;
  }
  function resolve(state, use, api = {}) {
    const battle = state?.battle, prompt = battle?.counterTrigger;
    if (!prompt) return false;
    battle.counterTrigger = null;
    battle.locked = false;
    battle._counterTriggerResolving = true;
    const units = battle.allies.concat(battle.enemies);
    const source = units.find(unit => unit.uid === prompt.unitUid);
    const target = units.find(unit => unit.uid === prompt.targetUid);
    const actor = units.find(unit => unit.uid === prompt.sourceUid);
    try {
      if (use && source?.hp > 0) {
        const resolvers = {
          "终焉回旋斩": () => window.GuestCharacterSkills?.resolveEndSpin?.(state, source, actor, api),
          "复仇反击": () => window.BertisGerlotSkills?.resolveRevengeTrigger?.(state, source, target, prompt.count, api, prompt.skill),
          "护母反击": () => window.BertisGerlotSkills?.resolveRevengeTrigger?.(state, source, target, prompt.count, api, prompt.skill),
          "贝尔蒂丝受伤反击": () => window.BertisGerlotSkills?.resolveRevengeTrigger?.(state, source, target, prompt.count, api, prompt.skill),
          "复仇之刃": () => window.NanaliSkills?.resolveRevengeTrigger?.(state, source, target, prompt.count, api),
          "罗卡尔受伤复仇": () => window.NanaliSkills?.resolveRevengeTrigger?.(state, source, target, prompt.count, api, prompt.targetUids),
          "刺刀AK47": () => window.MannySkills?.resolveCounterTrigger?.(state, source, target, api),
          "血色刺伞": () => window.SakuraRisaSkills?.resolveUmbrellaTrigger?.(state, source, api),
        };
        resolvers[prompt.skill]?.();
      } else {
        window.BattleLog?.add?.(state, `${source?.name || "角色"}跳过${prompt.skill}。`);
      }
    } catch (error) {
      delete battle._counterTriggerResolving;
      activateNext(battle);
      throw error;
    }
    delete battle._counterTriggerResolving;
    api.checkDefeat?.(state);
    api.checkEnd?.(state);
    const settling = battle.pendingVictory || battle.pendingDefeat
      || battle.victoryScreen || battle.defeat || battle.testComplete;
    if (settling) {
      battle.counterTrigger = null;
      battle.counterTriggerQueue = null;
    } else activateNext(battle);
    return true;
  }
  return {
    open, resolve, activatePending: activateNext,
    pending: battle => !!(battle?.counterTrigger
      || battle?.counterTriggerQueue?.length),
  };
})();
