window.FloraSonicSkinFX = (() => {
  let idleBattle = null, idleTimer = null;
  const runtime = window.SkinFXRuntime.create("flora-sonic");
  const { active, hasDocument, later, mount } = runtime;
  function anchored(state, unit, className, duration, html = "", mode = "action-first") {
    if (!active(unit) || !hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `flora-sonic-fx ${className}`;
    fx.innerHTML = html;
    const anchor = window.BattleEffectAnchors?.place(fx, unit, mode);
    if (!anchor) return null;
    const alive = mount(state, fx, duration);
    if (mode === "action-first" && anchor.element === window.BattleEffectAnchors?.action(unit)) {
      const mirror = window.BattleEffectAnchors?.mirror(fx, unit);
      if (mirror && mirror.anchor.element !== anchor.element) mount(state, mirror.node, duration);
    }
    return { fx, anchor, alive };
  }
  function targetFx(state, unit, className, duration, html = "") {
    if (!hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `flora-sonic-fx ${className}`;
    fx.innerHTML = html;
    if (!window.BattleEffectAnchors?.place(fx, unit, "battlefield")) return null;
    mount(state, fx, duration);
    return fx;
  }
  function ray(state, from, to, className, duration, fromMode = "action-first") {
    if (!hasDocument()) return null;
    const start = window.BattleEffectAnchors?.measure(from, fromMode);
    const end = window.BattleEffectAnchors?.measure(to, "battlefield");
    if (!start || !end) return null;
    const dx = end.center.x - start.center.x, dy = end.center.y - start.center.y;
    const fx = document.createElement("div");
    fx.className = `flora-sonic-line ${className}`;
    fx.style.cssText = `left:${start.center.x}px;top:${start.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i><i></i>";
    mount(state, fx, duration);
    return fx;
  }
  function entry(state, unit) {
    const item = anchored(state, unit, "flora-sonic-entry", 1150,
      "<b></b><i></i><i></i><i></i><span></span>", "battlefield");
    if (!item) return;
    item.anchor.element.classList.add("flora-sonic-entering");
    later(() => { if (item.alive()) item.anchor.element.classList.remove("flora-sonic-entering"); }, 930);
    tone(180, .12, "sawtooth", 0, .025); tone(920, .08, "sine", 140, .035);
  }
  function idleShift(state, unit) {
    const item = anchored(state, unit, "flora-sonic-idle-shift", 760,
      "<b></b><i></i><i></i><span></span>", "battlefield");
    if (!item) return;
    item.anchor.element.classList.add("flora-sonic-shifting");
    later(() => { if (item.alive()) item.anchor.element.classList.remove("flora-sonic-shifting"); }, 620);
    tone(680, .055, "triangle", 0, .02);
  }
  function assault(state, actor, target) {
    if (!active(actor) || !hasDocument()) return 0;
    anchored(state, actor, "flora-sonic-assault-launch", 920, "<b></b><i></i><span></span>");
    ray(state, actor, target, "flora-sonic-assault-line", 820);
    targetFx(state, target, "flora-sonic-assault-hit", 980, "<b></b><i></i><i></i><span></span>");
    tone(240, .08, "sawtooth", 0, .035); tone(1320, .06, "square", 120, .04);
    return window.BattleEffectAnimation?.scaleMs?.(980) || 980;
  }
  function assaultDefeat(state, actor) {
    if (!active(actor)) return;
    anchored(state, actor, "flora-sonic-assault-return", 1100,
      "<b></b><i></i><i></i><i></i><span></span>");
    tone(760, .08, "triangle", 0, .03); tone(1080, .1, "sine", 100, .03);
  }
  function wing(state, unit, source) {
    if (!active(unit)) return;
    targetFx(state, unit, "flora-sonic-wing-shield", 980,
      "<b></b><i></i><i></i><i></i><span></span>");
    ray(state, unit, source, "flora-sonic-wing-shards", 780, "battlefield");
    anchored(state, unit, "flora-sonic-wing-shift", 760, "<b></b><i></i>", "battlefield");
    tone(1540, .065, "square", 0, .035); tone(420, .09, "sawtooth", 90, .025);
  }
  function flyingBlade(state, actor, target) {
    if (!active(actor)) return;
    ray(state, actor, target, "flora-sonic-blade-dash", 720);
    targetFx(state, target, "flora-sonic-blade-x", 960, "<i></i><i></i><b></b><span></span>");
    tone(980, .055, "square", 0, .035); tone(1160, .055, "square", 85, .035);
  }
  function ensureIdle(state, unit) {
    const battle = state?.battle;
    if (!battle || idleBattle === battle) return;
    clearTimeout(idleTimer); idleBattle = battle;
    const tick = () => {
      if (idleBattle !== battle || state?.battle !== battle || state.view !== "battle" || battle.victoryScreen) {
        idleTimer = null; return;
      }
      if (active(unit) && unit.hp > 0) idleShift(state, unit);
      idleTimer = setTimeout(tick, 6200);
    };
    idleTimer = setTimeout(tick, 4800);
  }
  function sync(state) {
    if (!hasDocument()) return;
    const battle = state?.battle;
    if (!battle) return;
    const units = battle.allies.concat(battle.enemies || []);
    units.filter(unit => !active(unit)).forEach(unit => delete unit._floraSonicEntryShown);
    const sonic = units.find(active);
    if (battle.victoryScreen) {
      clearTimeout(idleTimer); idleTimer = null; idleBattle = null;
      if (sonic && document.querySelector(".victory-screen.flora-sonic-victory") &&
        !battle._floraSonicVictoryShown) {
        battle._floraSonicVictoryShown = true;
        tone(440, .1, "triangle", 0, .03); tone(1180, .12, "sine", 120, .035);
      }
      return;
    }
    if (!sonic) { clearTimeout(idleTimer); idleTimer = null; idleBattle = null; return; }
    ensureIdle(state, sonic);
    units.filter(active).forEach(unit => {
      if (unit._floraSonicEntryShown) return;
      unit._floraSonicEntryShown = true; entry(state, unit);
    });
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    clearTimeout(idleTimer); idleTimer = null; idleBattle = null;
    if (!hasDocument()) return;
    document.querySelectorAll(".flora-sonic-fx,.flora-sonic-line").forEach(node => node.remove());
    document.querySelectorAll(".flora-sonic-entering,.flora-sonic-shifting").forEach(node =>
      node.classList.remove("flora-sonic-entering", "flora-sonic-shifting"));
  }
  return { active, entry, idleShift, assault, assaultDefeat, wing, flyingBlade, sync, cancel };
})();
