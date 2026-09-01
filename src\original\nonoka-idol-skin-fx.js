window.NonokaIdolSkinFX = (() => {
  const runtime = window.SkinFXRuntime.create("nonoka-idol");
  const { active, later, mount } = runtime;
  function anchored(state, unit, className, duration, mode = "action-first") {
    if (!active(unit)) return null;
    const fx = document.createElement("div");
    fx.className = className;
    const anchor = window.BattleEffectAnchors?.place(fx, unit, mode);
    if (!anchor) return null;
    const alive = mount(state, fx, duration);
    let mirrored = null;
    if (mode === "action-first" && anchor.element === window.BattleEffectAnchors?.action(unit)) {
      mirrored = window.BattleEffectAnchors?.mirror(fx, unit);
      if (mirrored && mirrored.anchor.element !== anchor.element) {
        mount(state, mirrored.node, duration);
      }
    }
    return {
      fx, mirror: mirrored?.node || null,
      art: anchor.element, rect: anchor.rect, alive,
    };
  }
  function entry(state, unit) {
    const item = anchored(state, unit, "nonoka-idol-entry-fx", 1050, "battlefield");
    if (!item) return;
    item.fx.innerHTML = "<i></i><i></i><i></i><span></span>";
    item.art.classList.add("nonoka-idol-entering");
    later(() => { if (item.alive()) item.art.classList.remove("nonoka-idol-entering"); }, 920);
    window.BattleAudio?.tone?.(620, .12, "triangle", 0, .035);
    window.BattleAudio?.tone?.(930, .14, "sine", 110, .04);
  }
  function newMoon(state, unit, suit) {
    const item = anchored(state, unit, `nonoka-idol-note-fx suit-${suitCode(suit)}`, 820);
    if (!item) return;
    item.fx.innerHTML = "<i>♪</i><i>♫</i><i>♪</i>";
    if (item.mirror) item.mirror.innerHTML = item.fx.innerHTML;
    window.BattleAudio?.tone?.(noteFrequency(suit), .1, "sine", 0, .025);
  }
  function mimic(state, unit, target) {
    const item = anchored(state, unit, "nonoka-idol-mimic-fx", 920);
    const src = target?.avatar || target?.art;
    if (!item || !safeMedia(src)) return;
    [item.fx, item.mirror].filter(Boolean).forEach(node => {
      const image = document.createElement("img");
      image.src = src;
      image.alt = "";
      image.draggable = false;
      node.append(image, document.createElement("i"), document.createElement("i"));
    });
    item.fx.style.setProperty("--mimic-hue", `${hueFor(target?.ref || target?.id || target?.name)}deg`);
    item.mirror?.style.setProperty("--mimic-hue", item.fx.style.getPropertyValue("--mimic-hue"));
    window.BattleAudio?.tone?.(510, .16, "sine", 0, .03);
    window.BattleAudio?.tone?.(760, .12, "triangle", 140, .03);
  }
  function kiss(state, unit, target) {
    if (!active(unit)) return;
    const from = window.BattleEffectAnchors?.measure(unit, "action-first");
    const to = window.BattleEffectAnchors?.measure(target, "battlefield");
    if (!from || !to) return;
    const start = from.center, end = to.center, fx = document.createElement("div");
    fx.className = "nonoka-idol-kiss-fx";
    fx.style.left = `${start.x}px`; fx.style.top = `${start.y}px`;
    fx.style.setProperty("--kiss-x", `${end.x - start.x}px`);
    fx.style.setProperty("--kiss-y", `${end.y - start.y}px`);
    fx.innerHTML = Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}">♥</i>`).join("");
    mount(state, fx, 980);
    const burst = document.createElement("div");
    burst.className = "nonoka-idol-kiss-burst";
    burst.style.left = `${end.x}px`; burst.style.top = `${end.y}px`;
    burst.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
    mount(state, burst, 980);
    window.BattleAudio?.tone?.(1180, .08, "sine", 0, .045);
    window.BattleAudio?.tone?.(1540, .12, "sine", 75, .04);
  }
  function sync(state) {
    const battle = state?.battle;
    if (!battle) return;
    battle.allies.filter(unit => !active(unit)).forEach(unit => delete unit._idolEntryShown);
    if (!battle.victoryScreen) battle.allies.filter(active).forEach(unit => {
      if (unit._idolEntryShown) return;
      unit._idolEntryShown = true; entry(state, unit);
    });
    if (battle.victoryScreen && document.querySelector(".victory-screen.idol-victory") &&
      !battle._idolVictoryShown && battle.allies.some(active)) {
      battle._idolVictoryShown = true;
      window.BattleAudio?.tone?.(740, .16, "triangle", 0, .035);
      window.BattleAudio?.tone?.(1110, .18, "sine", 150, .04);
    }
  }
  function safeMedia(src) {
    return typeof src === "string" && /^(?:\.\/assets\/|https?:|data:image\/|blob:)/.test(src);
  }
  function suitCode(suit) { return ({ "♥": "heart", "♦": "diamond", "♠": "spade", "♣": "club" })[suit] || "heart"; }
  function noteFrequency(suit) { return ({ "♥": 880, "♦": 1040, "♠": 660, "♣": 780 })[suit] || 880; }
  function hueFor(value) {
    return [...String(value || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  }
  function cancel() {
    runtime.cancel();
    document.querySelectorAll(".nonoka-idol-entry-fx,.nonoka-idol-note-fx,.nonoka-idol-mimic-fx,.nonoka-idol-kiss-fx,.nonoka-idol-kiss-burst").forEach(node => node.remove());
    document.querySelectorAll(".nonoka-idol-entering").forEach(node => node.classList.remove("nonoka-idol-entering"));
  }
  return { active, entry, newMoon, mimic, kiss, sync, cancel };
})();
