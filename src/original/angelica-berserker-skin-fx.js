window.AngelicaBerserkerSkinFX = (() => {
  const runtime = window.SkinFXRuntime.create("angelica-berserker");
  const { active, hasDocument, later, mount } = runtime;
  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    const fx = document.createElement("div");
    fx.className = `angelica-berserker-fx ${className}`;
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
  function line(state, fromUnit, toUnit, className, duration = 760, fromMode = "action-first", toMode = "battlefield") {
    const from = window.BattleEffectAnchors?.measure(fromUnit, fromMode);
    const to = window.BattleEffectAnchors?.measure(toUnit, toMode);
    if (!from || !to) return null;
    const dx = to.center.x - from.center.x, dy = to.center.y - from.center.y;
    const fx = document.createElement("div");
    fx.className = `angelica-berserker-line ${className}`;
    fx.style.cssText = `left:${from.center.x}px;top:${from.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i>";
    mount(state, fx, duration);
    return fx;
  }
  function might(state, actor, card) {
    if (!active(actor) || !card) return;
    anchored(state, actor, "angelica-berserker-might", 980, "<b></b><i></i><i></i><span></span>");
    tone(300, .14, "sawtooth", 0, .04); tone(620, .1, "triangle", 90, .03);
  }
  function rageGain(state, unit, strong) {
    if (!active(unit)) return;
    anchored(state, unit, `angelica-berserker-rage-gain ${strong ? "strong" : ""}`, 880,
      "<i></i><span></span><span></span><span></span>", strong ? "battlefield" : "action-first");
    tone(strong ? 210 : 520, .12, strong ? "sawtooth" : "sine", 0, .035);
  }
  function rageSpend(state, actor, count) {
    if (!active(actor)) return;
    actor.skinRageTrailTurn = state?.battle?.turn;
    anchored(state, actor, `angelica-berserker-rage-slam ${(count || 0) >= 4 ? "grand" : ""}`, 1150,
      "<b></b><i></i><i></i><i></i><span></span><span></span><span></span><span></span>");
    tone(180, .18, "sawtooth", 0, .05); tone(760, .12, "triangle", 110, .035);
  }
  function rageTrail(state, actor, target) {
    if (!active(actor) || !target || actor.skinRageTrailTurn !== state?.battle?.turn) return;
    line(state, actor, target, "angelica-berserker-rage-trail", 560);
  }
  function taunt(state, actor) {
    if (!active(actor)) return;
    anchored(state, actor, "angelica-berserker-taunt", 1250, "<b></b><span></span><span></span>", "battlefield");
    anchored(state, actor, "angelica-berserker-warweb", 2600, "<i></i><i></i><i></i>", "battlefield");
    tone(240, .16, "square", 0, .03); tone(660, .12, "sine", 100, .025);
  }
  function sync(state) {
    if (!hasDocument()) return;
    document.querySelectorAll(".angelica-berserker-entry").forEach(node => node.remove());
    document.querySelectorAll(".angelica-berserker-entering").forEach(node =>
      node.classList.remove("angelica-berserker-entering"));
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    if (!hasDocument()) return;
    document.querySelectorAll(".angelica-berserker-fx,.angelica-berserker-line").forEach(node => node.remove());
    document.querySelectorAll(".angelica-berserker-entering").forEach(node =>
      node.classList.remove("angelica-berserker-entering"));
  }
  return { active, might, rageGain, rageSpend, rageTrail, taunt, sync, cancel };
})();
