window.BertisQueenSkinFX = (() => {
  const runtime = window.SkinFXRuntime.create("bertis-queen");
  const { active, later, mount } = runtime;
  const arroganceVisible = unit =>
    window.SkinSystem?.bertisArroganceVisible?.(unit) ?? !!unit?.bertisArrogant;
  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    const fx = document.createElement("div");
    fx.className = `bertis-queen-fx ${className}`;
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
  function line(state, fromUnit, toUnit, className, duration = 780, fromMode = "action-first", toMode = "battlefield", html = "<i></i>") {
    const from = window.BattleEffectAnchors?.measure(fromUnit, fromMode);
    const to = window.BattleEffectAnchors?.measure(toUnit, toMode);
    if (!from || !to) return null;
    const dx = to.center.x - from.center.x, dy = to.center.y - from.center.y;
    const fx = document.createElement("div");
    fx.className = `bertis-queen-line ${className}`;
    fx.style.cssText = `left:${from.center.x}px;top:${from.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = html;
    mount(state, fx, duration);
    return fx;
  }
  function entry(state, unit) {
    if (!active(unit)) return;
    const item = anchored(state, unit, "bertis-queen-entry", 1200, "<b></b><i></i><i></i><i></i><span></span>", "action-first");
    if (!item) return;
    item.anchor.element.classList.add("bertis-queen-entering");
    later(() => { if (item.alive()) item.anchor.element.classList.remove("bertis-queen-entering"); }, 980);
    tone(170, .18, "triangle", 0, .035); tone(740, .08, "square", 180, .04);
  }
  function showArrogance(state, unit, enabled) {
    anchored(state, unit, `bertis-queen-arrogance ${enabled ? "enabled" : "disabled"}`, 900, "<b></b><i></i><i></i><i></i><span></span>");
    tone(enabled ? 620 : 250, .12, enabled ? "triangle" : "sawtooth", 0, .03);
  }
  function arrogance(state, unit, enabled) {
    if (!active(unit)) return;
    if (arroganceVisible(unit) !== enabled) {
      unit._bertisQueenPendingArrogance = enabled;
      sync(state);
      return;
    }
    delete unit._bertisQueenPendingArrogance;
    showArrogance(state, unit, enabled);
    sync(state);
  }
  function hit(state, unit, source) {
    if (!active(unit)) return;
    const item = anchored(state, unit, "bertis-queen-angry-fx", 720, "<b></b><i></i><i></i>", "battlefield");
    item?.anchor.element.classList.add("bertis-queen-angry");
    later(() => { if (item?.alive()) item.anchor.element.classList.remove("bertis-queen-angry"); }, 620);
    if (source) line(state, unit, source, "bertis-queen-angry-point", 620, "battlefield", "battlefield");
  }
  function whip(state, actor, target, doubled) {
    if (!active(actor)) return;
    line(state, actor, target, `bertis-queen-whip-line ${doubled ? "doubled" : ""}`, 820, "action-first", "battlefield", "<i></i><i></i>");
    anchored(state, target, `bertis-queen-whip-hit ${doubled ? "doubled" : ""}`, 1050, "<b></b><i></i><i></i><span></span>", "battlefield");
    const count = doubled ? 4 : 2;
    line(state, target, actor, `bertis-queen-card-flight cards-${count}`, 980, "battlefield", "action-first",
      Array.from({ length: count }, (_, i) => `<i style="--i:${i}"></i>`).join(""));
    tone(980, .055, "square", 0, .055); if (doubled) tone(860, .055, "square", 150, .05);
  }
  function growth(state, unit, count) {
    if (!active(unit)) return;
    const triple = count >= 3;
    anchored(state, unit, `bertis-queen-growth ${triple ? "growth-three" : "growth-one"}`, 1200,
      triple ? "<b></b><i></i><i></i><i></i><span></span>" : "<b></b><i></i><span></span>");
    tone(triple ? 210 : 520, .16, "triangle", 0, .03);
  }
  function takeFood(state, bertis, recipient) {
    if (!active(bertis)) return;
    anchored(state, bertis, "bertis-queen-take-food", 820, "<b></b><i></i><i></i>");
    line(state, bertis, recipient, "bertis-queen-food-flight", 980, "action-first", "battlefield", "<i></i><i></i>");
    tone(760, .1, "triangle", 0, .03); tone(1040, .1, "sine", 100, .025);
  }
  function sync(state) {
    document.querySelectorAll(".bertis-queen-arrogant").forEach(node => node.classList.remove("bertis-queen-arrogant"));
    const battle = state?.battle;
    if (!battle) return;
    const units = battle.allies.concat(battle.enemies || []);
    units.filter(unit => !active(unit)).forEach(unit => {
      delete unit._bertisQueenEntryShown;
      delete unit._bertisQueenPendingArrogance;
    });
    units.filter(active).forEach(unit => {
      if (!battle.victoryScreen && !unit._bertisQueenEntryShown) {
        unit._bertisQueenEntryShown = true; entry(state, unit);
      }
      const visibleArrogance = arroganceVisible(unit);
      if (unit._bertisQueenPendingArrogance === visibleArrogance) {
        delete unit._bertisQueenPendingArrogance;
        showArrogance(state, unit, visibleArrogance);
      }
      if (visibleArrogance) {
        [window.BattleEffectAnchors?.battlefield(unit), window.BattleEffectAnchors?.action(unit)].filter(Boolean)
          .forEach(node => node.classList.add("bertis-queen-arrogant"));
      }
    });
    if (battle.victoryScreen && document.querySelector(".victory-screen.bertis-queen-victory") &&
      !battle._bertisQueenVictoryShown && units.some(active)) {
      battle._bertisQueenVictoryShown = true;
      tone(480, .14, "triangle", 0, .035); tone(920, .1, "sine", 170, .035);
    }
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    document.querySelectorAll(".bertis-queen-fx,.bertis-queen-line").forEach(node => node.remove());
    document.querySelectorAll(".bertis-queen-entering,.bertis-queen-angry,.bertis-queen-arrogant").forEach(node =>
      node.classList.remove("bertis-queen-entering", "bertis-queen-angry", "bertis-queen-arrogant"));
  }
  return { active, entry, arrogance, hit, whip, growth, takeFood, sync, cancel };
})();
