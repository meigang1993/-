window.BattleLines = (() => {
  let timer = null;
  let skillTimer = null;
  let skillCaptionTimer = null;
  let relicCaptionTimer = null;
  let pendingSkills = [];
  const { skillLines, followLines } = window.BattleLineData;
  const LINE_DURATION = 6000, SPLIT_LIMIT = 34;
  const refsOf = u => [u?.ref, u?.id, u?.ai].filter(Boolean);
  const lineKeyOf = (lines, unit, name) => refsOf(unit).find(ref => lines[ref]?.[name]);
  const lineOf = (lines, unit, name, target) => {
    const key = lineKeyOf(lines, unit, name);
    return pick(lines[key]?.[name], target);
  };
  const hasSkill = (unit, name) => (unit.skills || []).some(s => s?.name === name) || (window.MannySkills?.skills?.(unit) || []).some(s => s?.name === name) || window.RelicSystem?.isKnown?.(name);
  function pick(v, target) { return typeof v === "function" ? v(target) : Array.isArray(v) ? window.GameRandom.transientSample(v) : v; }
  function splitText(text) {
    const raw = String(text || "").trim();
    if (raw.length <= SPLIT_LIMIT) return [raw];
    const chunks = raw.match(/[^，。！？；]+[，。！？；]?/g) || [raw], parts = [];
    let line = "";
    chunks.forEach(chunk => {
      if (line && (line + chunk).length > SPLIT_LIMIT) { parts.push(line); line = chunk; } else line += chunk;
      while (line.length > SPLIT_LIMIT) { parts.push(line.slice(0, SPLIT_LIMIT)); line = line.slice(SPLIT_LIMIT); }
    });
    if (line) parts.push(line);
    return parts;
  }
  function pagesFrom(items) {
    const split = items.filter(x => x?.unit && x.text).map(x => ({ unit: x.unit, parts: splitText(x.text) })), max = Math.max(0, ...split.map(x => x.parts.length));
    return Array.from({ length: max }, (_, i) => split.map(x => x.parts[i] ? { unit: x.unit, text: x.parts[i] } : null).filter(Boolean));
  }
  function sameSpeech(a, b) {
    if (!a || !b || a.uid !== b.uid || a.global !== b.global || a.dismissible !== b.dismissible) return false;
    if ((a.text || "") !== (b.text || "")) return false;
    const x = a.lines || [], y = b.lines || [];
    return x.length === y.length && x.every((v, i) => v.uid === y[i].uid && v.name === y[i].name && v.text === y[i].text);
  }
  function setSpeech(state, speech, duration) {
    if (sameSpeech(state.battle.speech, speech)) return;
    const id = window.GameRandom.id("sp");
    state.battle.speech = { id, ...speech };
    window.render?.();
    clearTimeout(timer);
    if (duration === Infinity) return;
    timer = setTimeout(() => { if (state.battle?.speech?.id === id) { state.battle.speech = null; window.render?.(); } }, duration);
  }
  function show(state, unit, text, duration = LINE_DURATION, extra = {}) {
    if (!state?.battle || !unit || !text) return;
    setSpeech(state, { uid: unit.uid, text, ...extra }, duration);
  }
  function showMany(state, items, duration = LINE_DURATION, extra = {}) {
    const lines = items.filter(x => x?.unit && x.text).map(x => ({ uid: x.unit.uid, name: x.unit.name, text: x.text }));
    if (!state?.battle || !lines.length) return;
    setSpeech(state, { uid: lines[0].uid, lines, ...extra }, duration);
  }
  function showSkillPages(state, items) {
    showPages(state, pagesFrom(items), LINE_DURATION);
  }
  function showPages(state, pages, duration = LINE_DURATION, extra = {}) {
    if (!state?.battle || !pages.length) return 0;
    const seq = window.GameRandom.id("pg");
    const renderPage = (i) => {
      const lines = pages[i].map(x => ({ uid: x.unit.uid, name: x.unit.name, text: x.text }));
      if (!state.battle || !lines.length) return;
      const id = `${seq}-${i}`;
      state.battle.speech = { id, uid: lines[0].uid, lines, ...extra };
      window.render?.();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!state.battle?.speech?.id?.startsWith(seq)) return;
        if (i + 1 < pages.length) renderPage(i + 1);
        else { state.battle.speech = null; window.render?.(); }
      }, duration);
    };
    renderPage(0);
    return pages.length * duration;
  }
  function showRelicCaption(state, unit, name, duration = LINE_DURATION, renderNow = true) {
    if (!state?.battle || !unit || !name) return;
    const action = window.RelicSystem?.isActive?.(name) ? "使用了" : "触发了";
    const text = `${unit.name} ${action} ${name}`, current = state.battle.relicCaption;
    if (current?.uid === unit.uid && current.name === name && current.text === text) return;
    const id = window.GameRandom.id("rl");
    state.battle.relicCaption = { id, side: unit.side, text, uid: unit.uid, name };
    if (renderNow) window.render?.();
    clearTimeout(relicCaptionTimer);
    relicCaptionTimer = setTimeout(() => { if (state.battle?.relicCaption?.id === id) { state.battle.relicCaption = null; window.render?.(); } }, duration);
  }
  function showSkillCaption(state, unit, name, duration = LINE_DURATION, renderNow = true) {
    if (!state?.battle || !unit || !name) return;
    if (window.RelicSystem?.isKnown?.(name)) return showRelicCaption(state, unit, name, duration, renderNow);
    const text = `${unit.name} 发动了 ${name}`, current = state.battle.skillCaption;
    if (current?.uid === unit.uid && current.name === name && current.text === text) return;
    const id = window.GameRandom.id("sk");
    state.battle.skillCaption = { id, side: unit.side, text, uid: unit.uid, name };
    if (renderNow) window.render?.();
    clearTimeout(skillCaptionTimer);
    skillCaptionTimer = setTimeout(() => { if (state.battle?.skillCaption?.id === id) { state.battle.skillCaption = null; window.render?.(); } }, duration);
  }
  function clearSkillCaption(state, unit, name, renderNow = true) {
    const current = state?.battle?.skillCaption;
    if (!current || current.uid !== unit?.uid || current.name !== name) return false;
    clearTimeout(skillCaptionTimer);
    skillCaptionTimer = null;
    state.battle.skillCaption = null;
    if (renderNow) window.render?.();
    return true;
  }
  function skill(state, unit, name, target) {
    if (!state?.battle || !unit || !name) return;
    const text = lineOf(skillLines, unit, name, target), known = !!text || hasSkill(unit, name);
    if (!known) return;
    window.BattleLog?.skill?.(state, unit, name, target);
    showSkillCaption(state, unit, name, LINE_DURATION, !text);
    if (!text) return;
    if (!pendingSkills.some(x => x.unit?.uid === unit.uid && x.name === name && x.text === text)) pendingSkills.push({ state, unit, name, text });
    const follow = lineOf(followLines, unit, name, target);
    if (follow?.unit && follow.text && !pendingSkills.some(x => x.unit?.uid === follow.unit.uid && x.name === name && x.text === follow.text)) pendingSkills.push({ state, unit: follow.unit, name, text: follow.text });
    clearTimeout(skillTimer);
    skillTimer = setTimeout(() => {
      const items = pendingSkills;
      pendingSkills = [];
      showSkillPages(items[0]?.state, items);
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
      if (battle[key] === prompt && promptVisible(battle, key)) skill(state, unit, name, target);
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
  const introFlow = window.BattleLineIntro({ showMany, showPages, lineOf, lineKeyOf, refsOf });
  const intro = state => introFlow.start(state);
  function dismiss(state) {
    if (!state?.battle?.speech?.dismissible) return;
    const introPause = !!state.battle.speech.introPause;
    state.battle.speech = null;
    clearTimeout(timer);
    if (introPause) introFlow.resolve();
  }
  function cancel(state) {
    [timer, skillTimer, skillCaptionTimer, relicCaptionTimer].forEach(clearTimeout);
    timer = null; skillTimer = null; skillCaptionTimer = null; relicCaptionTimer = null;
    pendingSkills = [];
    if (state?.battle) {
      state.battle.speech = null;
      state.battle.skillCaption = null;
      state.battle.relicCaption = null;
    }
    introFlow.cancel();
  }
  return {
    show, skill, skillWhenPromptVisible, promptVisible,
    clearSkillCaption, intro, dismiss, cancel,
  };
})();
