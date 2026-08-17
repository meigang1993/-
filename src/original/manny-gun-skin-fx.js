window.MannyGunSkinFX = (() => {
  const runtime = window.SkinFXRuntime.create("manny-gun");
  const { active, later, mount } = runtime;
  const guns = () => Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  const weaponFan = () => Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    if (!active(unit)) return null;
    const fx = document.createElement("div");
    fx.className = `manny-gun-fx ${className}`;
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
    const fx = document.createElement("div");
    fx.className = `manny-gun-fx ${className}`;
    fx.innerHTML = html;
    const anchor = window.BattleEffectAnchors?.place(fx, unit, "battlefield");
    if (!anchor) return null;
    mount(state, fx, duration);
    return fx;
  }
  function ray(state, fromUnit, target, className, duration = 760, fromMode = "action-first") {
    const from = window.BattleEffectAnchors?.measure(fromUnit, fromMode);
    const to = window.BattleEffectAnchors?.measure(target, "battlefield");
    if (!from || !to) return null;
    const dx = to.center.x - from.center.x, dy = to.center.y - from.center.y;
    const fx = document.createElement("div");
    fx.className = `manny-gun-line ${className}`;
    fx.style.cssText = `left:${from.center.x}px;top:${from.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i><i></i>";
    mount(state, fx, duration);
    return fx;
  }
  function line(state, actor, target, className, duration = 760) {
    return active(actor) ? ray(state, actor, target, className, duration) : null;
  }
  const actions = window.MannyGunSkinActions({
    active, guns, weaponFan, later, anchored, targetFx, ray, line, tone,
  });
  function sync(state) {
    document.querySelectorAll(".manny-spike-active").forEach(node => node.classList.remove("manny-spike-active"));
    const battle = state?.battle;
    if (!battle) return;
    const units = battle.allies.concat(battle.enemies || []);
    units.filter(unit => !active(unit)).forEach(unit => delete unit._mannyGunEntryShown);
    const gunner = units.find(active);
    if (battle.victoryScreen) {
      if (gunner && document.querySelector(".victory-screen.manny-gun-victory") && !battle._mannyGunVictoryShown) {
        battle._mannyGunVictoryShown = true;
        tone(110, .12, "square", 0, .045); tone(160, .1, "square", 120, .04); tone(220, .08, "square", 230, .035);
      }
      return;
    }
    units.filter(active).forEach(unit => {
      if (unit._mannyGunEntryShown) return;
      unit._mannyGunEntryShown = true;
      actions.entry(state, unit);
    });
    units.filter(unit => unit.spikeShell).forEach(unit => {
      const owner = units.find(candidate => candidate.uid === unit.spikeShell?.ownerUid);
      if (active(owner)) window.BattleEffectAnchors?.battlefield(unit)?.classList.add("manny-spike-active");
    });
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    document.querySelectorAll(".manny-gun-fx,.manny-gun-line").forEach(node => node.remove());
    document.querySelectorAll(".manny-gun-entering,.manny-spike-active").forEach(node =>
      node.classList.remove("manny-gun-entering", "manny-spike-active"));
  }
  return { active, ...actions, sync, cancel };
})();
