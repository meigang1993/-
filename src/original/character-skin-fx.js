window.CharacterSkinFX = (() => {
  const runtime = window.SkinFXRuntime.create();
  const { active, hasDocument, later, mount } = runtime;
  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    if (!hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `character-skin-fx ${className}`;
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
    return { fx, mirror, art: anchor.element, rect: anchor.rect, alive };
  }
  const setEffectProperty = (item, name, value) =>
    [item?.fx, item?.mirror].filter(Boolean).forEach(node => node.style.setProperty(name, value));
  function line(state, fromUnit, toUnit, className, duration = 760, fromMode = "action-first", toMode = "battlefield") {
    if (!hasDocument()) return null;
    const from = window.BattleEffectAnchors?.measure(fromUnit, fromMode);
    const to = window.BattleEffectAnchors?.measure(toUnit, toMode);
    if (!from || !to) return null;
    const a = from.center, b = to.center, dx = b.x - a.x, dy = b.y - a.y, fx = document.createElement("div");
    fx.className = `character-skin-line ${className}`;
    fx.style.cssText = `left:${a.x}px;top:${a.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i><i></i>";
    mount(state, fx, duration);
    return fx;
  }
  function battleCourageStart(state, actor) {
    if (!active(actor, "lokar-motherbound")) return;
    anchored(state, actor, "skinfx-courage", 820, "<i></i><i></i><i></i><b></b>");
    tone(240, .12, "sawtooth", 0, .035); tone(520, .1, "triangle", 70, .025);
  }
  function battleCourageResult(state, actor, restored) {
    if (!active(actor, "lokar-motherbound") || !restored) return;
    anchored(state, actor, "skinfx-courage-restored", 720, "<i></i><i></i><i></i><i></i><i></i><span></span>");
    tone(780, .1, "triangle", 0, .03); tone(1120, .14, "sine", 75, .035);
  }
  function bloodPact(state, actor, power) {
    if (!active(actor, "lokar-motherbound")) return;
    actor.skinBloodPactActive = true; actor.skinBloodPactPower = Math.max(1, power || 1);
    const item = anchored(state, actor, "skinfx-blood-pact", 1100, "<b></b><i></i><span></span><span></span><span></span>");
    setEffectProperty(item, "--pact-power", `${Math.min(6, actor.skinBloodPactPower)}`);
    tone(190, .18, "sawtooth", 0, .045); tone(330, .16, "triangle", 90, .035);
    sync(state);
  }
  function attackTrail(state, actor, target) {
    if (!active(actor, "lokar-motherbound") || !actor.skinBloodPactActive) return;
    line(state, actor, target, "skinfx-pact-trail", 520);
  }
  function windSlashStart(state, actor, count) {
    if (!active(actor, "lokar-motherbound")) return;
    const cards = Array.from({ length: Math.min(8, count || 1) }, (_, i) => `<i style="--i:${i};--n:${Math.min(8, count || 1)}"></i>`).join("");
    anchored(state, actor, "skinfx-wind-start", 1250, `<b></b>${cards}<span></span><span></span><span></span>`);
    tone(160, .2, "sawtooth", 0, .04); tone(440, .18, "triangle", 100, .035);
  }
  function windSlashHit(state, actor, target, index) {
    if (!active(actor, "lokar-motherbound")) return;
    const fx = line(state, actor, target, "skinfx-wind-card", 640);
    fx?.style.setProperty("--hit-index", `${index || 0}`);
  }
  function windSlashEnd(state, actor, defeatedAny, count = 1) {
    if (!active(actor, "lokar-motherbound")) return;
    const delay = Math.min(720, Math.max(180, count * 90));
    later(() => {
      const item = anchored(state, actor, `skinfx-wind-land ${defeatedAny ? "defeated" : ""}`, 900, "<b></b><i></i><i></i><i></i><span></span>");
      if (item) tone(120, .18, "sawtooth", 0, .05);
    }, delay);
  }
  function soulBlade(state, actor, target) {
    if (!active(actor, "besta-mecha")) return;
    anchored(state, actor, "skinfx-soul-core", 780, "<b></b><i></i>");
    line(state, actor, target, "skinfx-soul-card", 760);
    anchored(state, target, "skinfx-soul-bind", 880, "<i></i><i></i><i></i>", "battlefield");
    tone(920, .1, "sine", 0, .035); tone(560, .14, "triangle", 80, .03);
  }
  function soulScythe(state, actor, targets, chainIndex = 0) {
    if (!active(actor, "besta-mecha") || !targets?.length) return;
    const item = anchored(state, actor, "skinfx-scythe", 1050, "<b></b><i></i>");
    setEffectProperty(item, "--chain-depth", `${Math.min(3, chainIndex)}`);
    targets.forEach((target, index) => {
      const hit = anchored(state, target, "skinfx-scythe-hit", 900, "<i></i><i></i>", "battlefield");
      hit?.fx.style.setProperty("--hit-delay", `${index * 70}ms`);
      hit?.fx.style.setProperty("--chain-depth", `${Math.min(3, chainIndex)}`);
    });
    tone(310 - chainIndex * 24, .18, "sawtooth", 0, .045); tone(720, .12, "triangle", 90, .03);
  }
  function extractEssence(state, actor, target, amount) {
    if (!active(actor, "besta-mecha")) return;
    actor.skinExtractActive = true; actor.skinExtractStrong = target?.ref !== "lokar";
    line(state, target, actor, `skinfx-extract-line ${actor.skinExtractStrong ? "strong" : ""}`, 1050, "battlefield", "action-first");
    anchored(state, target, `skinfx-extract-target ${actor.skinExtractStrong ? "strong" : ""}`, 1050, "<i></i><i></i><i></i><i></i>", "battlefield");
    const item = anchored(state, actor, "skinfx-extract-core", 1050, "<b></b><i></i><span></span>");
    setEffectProperty(item, "--extract-power", `${Math.min(6, amount || 1)}`);
    tone(actor.skinExtractStrong ? 260 : 380, .18, "sine", 0, .04); tone(760, .16, "triangle", 100, .035);
    sync(state);
  }
  function endTurn(state, unit) {
    const pact = !!unit?.skinBloodPactActive && active(unit, "lokar-motherbound");
    const extract = !!unit?.skinExtractActive && active(unit, "besta-mecha");
    if (pact) anchored(state, unit, "skinfx-pact-end", 850, "<i></i><i></i><i></i><i></i><i></i>");
    if (extract) anchored(state, unit, "skinfx-extract-end", 720, "<i></i><span></span>");
    delete unit.skinBloodPactActive; delete unit.skinBloodPactPower;
    delete unit.skinExtractActive; delete unit.skinExtractStrong;
    if (pact || extract) sync(state);
  }
  function sync(state) {
    if (!hasDocument()) return;
    document.querySelectorAll(".skin-blood-pact-active,.skin-extract-active,.skin-extract-strong").forEach(node =>
      node.classList.remove("skin-blood-pact-active", "skin-extract-active", "skin-extract-strong"));
    state?.battle?.allies?.concat(state.battle.enemies || []).forEach(unit => {
      const arts = [window.BattleEffectAnchors?.battlefield(unit), window.BattleEffectAnchors?.action(unit)].filter(Boolean);
      arts.forEach(art => {
        if (active(unit, "lokar-motherbound") && unit.skinBloodPactActive) art.classList.add("skin-blood-pact-active");
        if (active(unit, "besta-mecha") && unit.skinExtractActive) art.classList.add("skin-extract-active");
        if (active(unit, "besta-mecha") && unit.skinExtractStrong) art.classList.add("skin-extract-strong");
      });
    });
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    if (!hasDocument()) return;
    document.querySelectorAll(".character-skin-fx,.character-skin-line").forEach(node => node.remove());
    document.querySelectorAll(".skin-blood-pact-active,.skin-extract-active,.skin-extract-strong").forEach(node =>
      node.classList.remove("skin-blood-pact-active", "skin-extract-active", "skin-extract-strong"));
  }
  return { active, battleCourageStart, battleCourageResult, bloodPact, attackTrail, windSlashStart, windSlashHit, windSlashEnd, soulBlade, soulScythe, extractEssence, endTurn, sync, cancel };
})();
