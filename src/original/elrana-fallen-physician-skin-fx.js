window.ElranaFallenPhysicianSkinFX = (() => {
  let activeBattle = null, idleBattle = null, idleTimer = null;
  const runtime = window.SkinFXRuntime.create("elrana-fallen-physician");
  const { active, hasDocument, later, mount } = runtime;

  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    if (!active(unit) || !hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `elrana-fallen-physician-fx ${className}`;
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

  function targetFx(state, unit, className, duration = 900, html = "") {
    if (!hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `elrana-fallen-physician-fx ${className}`;
    fx.innerHTML = html;
    if (!window.BattleEffectAnchors?.place(fx, unit, "battlefield")) return null;
    mount(state, fx, duration);
    return fx;
  }

  function line(state, from, to, className, duration = 820) {
    if (!hasDocument()) return null;
    const start = window.BattleEffectAnchors?.measure(from, "action-first");
    const end = window.BattleEffectAnchors?.measure(to, "battlefield");
    if (!start || !end) return null;
    const dx = end.center.x - start.center.x, dy = end.center.y - start.center.y;
    const fx = document.createElement("div");
    fx.className = `elrana-fallen-physician-line ${className}`;
    fx.style.cssText = `left:${start.center.x}px;top:${start.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i><i></i>";
    mount(state, fx, duration);
    return fx;
  }

  function entry(state, unit) {
    const item = anchored(state, unit, "elrana-fallen-physician-entry", 1250,
      "<b></b><i></i><i></i><i></i><span></span>", "battlefield");
    if (!item) return null;
    item.anchor.element.classList.add("elrana-fallen-physician-entering");
    later(() => {
      if (item.alive()) item.anchor.element.classList.remove("elrana-fallen-physician-entering");
    }, 1000);
    tone(210, .1, "triangle", 0, .025);
    tone(760, .12, "sine", 140, .03);
    return item;
  }

  function idleReview(state, unit) {
    const item = anchored(state, unit, "elrana-fallen-physician-idle", 980,
      "<b></b><i></i><i></i><span></span>", "battlefield");
    if (!item) return null;
    tone(640, .06, "sine", 0, .018);
    return item;
  }

  function heal(state, actor, target, group = false) {
    if (!active(actor)) return;
    anchored(state, actor, "elrana-fallen-physician-heal-source", 900,
      "<b></b><i></i><i></i><span></span>");
    if (group) {
      (state?.battle?.allies || []).filter(unit => unit.hp > 0).forEach(unit =>
        targetFx(state, unit, "elrana-fallen-physician-heal-target", 980, "<b></b><i></i><span></span>"));
    } else {
      line(state, actor, target, "elrana-fallen-physician-heal-line");
      targetFx(state, target, "elrana-fallen-physician-heal-target", 980, "<b></b><i></i><span></span>");
    }
    tone(520, .08, "sine", 0, .025);
    tone(group ? 1080 : 900, .1, "triangle", 100, .03);
  }

  function care(state, healer, target) {
    if (!active(healer)) return;
    line(state, healer, target, "elrana-fallen-physician-care-line", 760);
    targetFx(state, target, "elrana-fallen-physician-care", 940,
      "<b>+</b><i></i><span></span>");
    tone(1180, .07, "sine", 0, .02);
  }

  function regenerate(state, unit, drewCard = false) {
    if (!active(unit)) return;
    anchored(state, unit, drewCard
      ? "elrana-fallen-physician-draw-tank" : "elrana-fallen-physician-regenerate", 980,
      "<b></b><i></i><i></i><i></i><span></span>");
    tone(drewCard ? 980 : 440, .08, "triangle", 0, .025);
  }

  function ensureIdle(state, unit) {
    const battle = state?.battle;
    if (!battle || idleBattle === battle) return;
    clearTimeout(idleTimer);
    idleBattle = battle;
    const tick = () => {
      if (idleBattle !== battle || state?.battle !== battle
        || state.view !== "battle" || battle.victoryScreen) {
        idleTimer = null;
        return;
      }
      if (active(unit) && unit.hp > 0) idleReview(state, unit);
      idleTimer = setTimeout(tick, 6500);
    };
    idleTimer = setTimeout(tick, 4400);
  }

  function sync(state) {
    if (!hasDocument() || !state?.battle) return;
    const battle = state.battle;
    const units = (battle.allies || []).concat(battle.enemies || []);
    units.filter(unit => !active(unit)).forEach(unit => delete unit._elranaFallenEntryShown);
    const elrana = units.find(active);
    if (!elrana || battle.victoryScreen) {
      if (activeBattle) cancel();
      else {
        clearTimeout(idleTimer);
        idleTimer = null;
        idleBattle = null;
      }
      return;
    }
    activeBattle = battle;
    ensureIdle(state, elrana);
    if (elrana._elranaFallenEntryShown) return;
    const item = entry(state, elrana);
    if (item) elrana._elranaFallenEntryShown = true;
  }

  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    activeBattle = null;
    clearTimeout(idleTimer); idleTimer = null; idleBattle = null;
    if (!hasDocument()) return;
    document.querySelectorAll(".elrana-fallen-physician-fx,.elrana-fallen-physician-line").forEach(node => node.remove());
    document.querySelectorAll(".elrana-fallen-physician-entering").forEach(node =>
      node.classList.remove("elrana-fallen-physician-entering"));
  }

  return { active, entry, idleReview, heal, care, regenerate, sync, cancel };
})();
