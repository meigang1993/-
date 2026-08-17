window.WendyTeacherSkinFX = (() => {
  let activeBattle = null, idleBattle = null, idleTimer = null;
  const runtime = window.SkinFXRuntime.create("wendy-teacher");
  const { active, hasDocument, later, mount } = runtime;

  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    if (!active(unit) || !hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `wendy-teacher-fx ${className}`;
    fx.innerHTML = html;
    const anchor = window.BattleEffectAnchors?.place(fx, unit, mode);
    if (!anchor) return null;
    const alive = mount(state, fx, duration);
    let mirror = null;
    if (mode === "action-first" && anchor.element === window.BattleEffectAnchors?.action(unit)) {
      const mirrored = window.BattleEffectAnchors?.mirror(fx, unit);
      if (mirrored && mirrored.anchor.element !== anchor.element) {
        mirror = mirrored.node;
        mount(state, mirror, duration);
      }
    }
    return { fx, mirror, anchor, alive };
  }

  function targetFx(state, unit, className, duration = 900, html = "") {
    if (!hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `wendy-teacher-fx ${className}`;
    fx.innerHTML = html;
    if (!window.BattleEffectAnchors?.place(fx, unit, "battlefield")) return null;
    mount(state, fx, duration);
    return fx;
  }

  function ribbon(state, actor, target, className = "") {
    if (!active(actor) || !hasDocument()) return null;
    const from = window.BattleEffectAnchors?.measure(actor, "action-first");
    const to = window.BattleEffectAnchors?.measure(target, "battlefield");
    if (!from || !to) return null;
    const dx = to.center.x - from.center.x, dy = to.center.y - from.center.y;
    const fx = document.createElement("div");
    fx.className = `wendy-teacher-line ${className}`;
    fx.style.cssText = `left:${from.center.x}px;top:${from.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i><i></i>";
    mount(state, fx, 920);
    return fx;
  }

  function entry(state, unit) {
    const item = anchored(state, unit, "wendy-teacher-entry", 1250,
      "<b></b><i></i><i></i><i></i><span></span>", "battlefield");
    if (!item) return null;
    item.anchor.element.classList.add("wendy-teacher-entering");
    later(() => {
      if (item.alive()) item.anchor.element.classList.remove("wendy-teacher-entering");
    }, 980);
    tone(360, .12, "triangle", 0, .03); tone(980, .14, "sine", 150, .035);
    return item;
  }

  function idleReview(state, unit) {
    const item = anchored(state, unit, "wendy-teacher-idle", 980,
      "<b></b>", "battlefield");
    if (!item) return null;
    tone(720, .055, "sine", 0, .018);
    return item;
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
      idleTimer = setTimeout(tick, 6400);
    };
    idleTimer = setTimeout(tick, 4200);
  }

  function sync(state) {
    if (!hasDocument()) return;
    const battle = state?.battle;
    if (!battle) return;
    const units = battle.allies.concat(battle.enemies || []);
    units.filter(unit => !active(unit)).forEach(unit => delete unit._wendyTeacherEntryShown);
    const teacher = units.find(active);
    if (!teacher) {
      if (activeBattle === battle) cancel();
      else {
        clearTimeout(idleTimer); idleTimer = null; idleBattle = null;
      }
      return;
    }
    activeBattle = battle;
    if (battle.victoryScreen) {
      clearTimeout(idleTimer); idleTimer = null; idleBattle = null;
      if (teacher && document.querySelector(".victory-screen.wendy-teacher-victory")
        && !battle._wendyTeacherVictoryShown) {
        battle._wendyTeacherVictoryShown = true;
        tone(560, .12, "triangle", 0, .03); tone(920, .16, "sine", 120, .035);
      }
      return;
    }
    ensureIdle(state, teacher);
    units.filter(active).forEach(unit => {
      if (unit._wendyTeacherEntryShown) return;
      const item = entry(state, unit);
      if (item) unit._wendyTeacherEntryShown = true;
      else later(() => {
        if (state?.battle === battle && !unit._wendyTeacherEntryShown) {
          const retry = entry(state, unit);
          if (retry) unit._wendyTeacherEntryShown = true;
        }
      }, 120);
    });
  }

  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    clearTimeout(idleTimer); activeBattle = null; idleTimer = null; idleBattle = null;
    if (!hasDocument()) return;
    document.querySelectorAll(".wendy-teacher-fx,.wendy-teacher-line").forEach(node => node.remove());
    document.querySelectorAll(".wendy-teacher-entering").forEach(node =>
      node.classList.remove("wendy-teacher-entering"));
  }

  window.WendyTeacherSkinFXInternals = { anchored, targetFx, ribbon, tone };
  return { active, entry, idleReview, sync, cancel };
})();
