window.BattleSpeechController = ({ duration, splitLimit }) => {
  let timer = null;
  function splitText(text) {
    const raw = String(text || "").trim();
    if (raw.length <= splitLimit) return [raw];
    const chunks = raw.match(/[^，。！？；]+[，。！？；]?/g) || [raw];
    const parts = [];
    let line = "";
    chunks.forEach(chunk => {
      if (line && (line + chunk).length > splitLimit) {
        parts.push(line);
        line = chunk;
      } else line += chunk;
      while (line.length > splitLimit) {
        parts.push(line.slice(0, splitLimit));
        line = line.slice(splitLimit);
      }
    });
    if (line) parts.push(line);
    return parts;
  }
  function pagesFrom(items) {
    const split = items.filter(item => item?.unit && item.text)
      .map(item => ({ unit: item.unit, parts: splitText(item.text) }));
    const max = Math.max(0, ...split.map(item => item.parts.length));
    return Array.from({ length: max }, (_, index) =>
      split.map(item => item.parts[index]
        ? { unit: item.unit, text: item.parts[index] } : null)
        .filter(Boolean));
  }
  function sameSpeech(left, right) {
    if (!left || !right || left.uid !== right.uid
      || left.global !== right.global
      || left.dismissible !== right.dismissible
      || (left.text || "") !== (right.text || "")) return false;
    const first = left.lines || [];
    const second = right.lines || [];
    return first.length === second.length && first.every((line, index) =>
      line.uid === second[index].uid && line.name === second[index].name
      && line.text === second[index].text);
  }
  function setSpeech(state, speech, timeout) {
    if (sameSpeech(state.battle.speech, speech)) return;
    const id = window.GameRandom.id("sp");
    state.battle.speech = { id, ...speech };
    window.render?.();
    clearTimeout(timer);
    if (timeout === Infinity) return;
    timer = setTimeout(() => {
      if (state.battle?.speech?.id === id) {
        state.battle.speech = null;
        window.render?.();
      }
    }, timeout);
  }
  function show(state, unit, text, timeout = duration, extra = {}) {
    if (!state?.battle || !unit || !text) return;
    setSpeech(state, { uid: unit.uid, text, ...extra }, timeout);
  }
  function showMany(state, items, timeout = duration, extra = {}) {
    const lines = items.filter(item => item?.unit && item.text)
      .map(item => ({
        uid: item.unit.uid,
        name: item.unit.name,
        text: item.text,
      }));
    if (!state?.battle || !lines.length) return;
    setSpeech(state, { uid: lines[0].uid, lines, ...extra }, timeout);
  }
  function showPages(state, pages, timeout = duration, extra = {}) {
    if (!state?.battle || !pages.length) return 0;
    const sequence = window.GameRandom.id("pg");
    const renderPage = index => {
      const lines = pages[index].map(item => ({
        uid: item.unit.uid,
        name: item.unit.name,
        text: item.text,
      }));
      if (!state.battle || !lines.length) return;
      const id = `${sequence}-${index}`;
      state.battle.speech = { id, uid: lines[0].uid, lines, ...extra };
      window.render?.();
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!state.battle?.speech?.id?.startsWith(sequence)) return;
        if (index + 1 < pages.length) renderPage(index + 1);
        else {
          state.battle.speech = null;
          window.render?.();
        }
      }, timeout);
    };
    renderPage(0);
    return pages.length * timeout;
  }
  const showSkillPages = (state, items) =>
    showPages(state, pagesFrom(items), duration);
  function dismiss(state, onIntroDismiss) {
    if (!state?.battle?.speech?.dismissible) return;
    const introPause = !!state.battle.speech.introPause;
    state.battle.speech = null;
    clearTimeout(timer);
    if (introPause) onIntroDismiss?.();
  }
  function cancel(state) {
    clearTimeout(timer);
    timer = null;
    if (state?.battle) state.battle.speech = null;
  }
  return {
    show, showMany, showPages, showSkillPages, dismiss, cancel,
  };
};
