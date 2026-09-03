window.BattleCaptionController = ({
  duration, lineOf, hasSkill, speech,
}) => {
  let skillTimer = null;
  let skillCaptionTimer = null;
  let relicCaptionTimer = null;
  let pendingSkills = [];
  function skillCaptionsOf(battle) {
    return battle?.skillCaptions || (battle?.skillCaption ? [battle.skillCaption] : []);
  }
  function syncSkillCaption(battle, captions) {
    if (!battle) return;
    battle.skillCaptions = captions;
    battle.skillCaption = captions[captions.length - 1] || null;
  }
  function showRelicCaption(state, unit, name, timeout = duration,
    renderNow = true) {
    if (!state?.battle || !unit || !name) return;
    const action = window.RelicSystem?.isActive?.(name)
      ? "使用了" : "触发了";
    const text = `${unit.name} ${action} ${name}`;
    const current = state.battle.relicCaption;
    if (current?.uid === unit.uid && current.name === name
      && current.text === text) return;
    const id = window.GameRandom.id("rl");
    state.battle.relicCaption = {
      id, side: unit.side, text, uid: unit.uid, name,
    };
    if (renderNow) window.render?.();
    clearTimeout(relicCaptionTimer);
    relicCaptionTimer = setTimeout(() => {
      if (state.battle?.relicCaption?.id === id) {
        state.battle.relicCaption = null;
        window.render?.();
      }
    }, timeout);
  }
  function showSkillCaption(state, unit, name, timeout = duration,
    renderNow = true) {
    if (!state?.battle || !unit || !name) return;
    if (window.RelicSystem?.isKnown?.(name)) {
      showRelicCaption(state, unit, name, timeout, renderNow);
      return;
    }
    const text = `${unit.name} 发动了 ${name}`;
    const current = state.battle.skillCaption;
    if (current?.uid === unit.uid && current.name === name
      && current.text === text) return;
    const id = window.GameRandom.id("sk");
    const caption = {
      id, side: unit.side, text, uid: unit.uid, name,
    };
    const captions = skillCaptionsOf(state.battle)
      .filter(item => item.id !== id);
    captions.push(caption);
    syncSkillCaption(state.battle, captions);
    if (renderNow) window.render?.();
    skillCaptionTimer = setTimeout(() => {
      const current = skillCaptionsOf(state.battle);
      if (current.some(item => item.id === id)) {
        syncSkillCaption(state.battle, current.filter(item => item.id !== id));
        window.render?.();
      }
    }, timeout);
  }
  function clearSkillCaption(state, unit, name, renderNow = true) {
    const current = skillCaptionsOf(state?.battle);
    const kept = current.filter(item => item.uid !== unit?.uid || item.name !== name);
    if (kept.length === current.length) {
      return false;
    }
    clearTimeout(skillCaptionTimer);
    skillCaptionTimer = null;
    syncSkillCaption(state.battle, kept);
    if (renderNow) window.render?.();
    return true;
  }
  function skill(state, unit, name, target) {
    if (!state?.battle || !unit || !name) return;
    const text = lineOf(unit, name, target);
    if (!text && !hasSkill(unit, name)) return;
    window.BattleLog?.skill?.(state, unit, name, target);
    showSkillCaption(state, unit, name, duration, !text);
    if (!text) return;
    if (!pendingSkills.some(item => item.unit?.uid === unit.uid
      && item.name === name && item.text === text)) {
      pendingSkills.push({ state, unit, name, text });
    }
    const follow = lineOf(unit, name, target, true);
    if (follow?.unit && follow.text
      && !pendingSkills.some(item => item.unit?.uid === follow.unit.uid
        && item.name === name && item.text === follow.text)) {
      pendingSkills.push({
        state, unit: follow.unit, name, text: follow.text,
      });
    }
    clearTimeout(skillTimer);
    skillTimer = setTimeout(() => {
      const items = pendingSkills;
      pendingSkills = [];
      speech.showSkillPages(items[0]?.state, items);
    }, 0);
  }
  function promptVisible(battle, key) {
    return !!(battle?.[key] && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);
  }
  function skillWhenPromptVisible(state, unit, name, target, key, prompt) {
    const battle = state?.battle;
    if (!battle || !prompt) return;
    const frame = window.requestAnimationFrame;
    if (typeof frame !== "function") {
      if (battle[key] === prompt && promptVisible(battle, key)) {
        skill(state, unit, name, target);
      }
      return;
    }
    const deadline = (window.performance?.now?.() || Date.now()) + 10000;
    const show = () => {
      if (state.battle !== battle || battle[key] !== prompt) return;
      if (!promptVisible(battle, key)) {
        if ((window.performance?.now?.() || Date.now()) < deadline) frame(show);
        else console.warn(`${name}提示等待动画超时`);
        return;
      }
      if (prompt.captionShown) return;
      prompt.captionShown = true;
      skill(state, unit, name, target);
    };
    frame(show);
  }
  function cancel(state) {
    [skillTimer, skillCaptionTimer, relicCaptionTimer].forEach(clearTimeout);
    skillTimer = null;
    skillCaptionTimer = null;
    relicCaptionTimer = null;
    pendingSkills = [];
    if (state?.battle) {
      state.battle.skillCaptions = [];
      state.battle.skillCaption = null;
      state.battle.relicCaption = null;
    }
  }
  return {
    skill, skillWhenPromptVisible, promptVisible, clearSkillCaption, cancel,
  };
};
