window.MannyGunSkinActions = ({
  active,
  guns,
  weaponFan,
  later,
  anchored,
  targetFx,
  ray,
  line,
  tone,
}) => {
  function entry(state, unit) {
    const item = anchored(state, unit, "manny-gun-entry", 1250,
      `<b>${weaponFan()}</b><span></span><em></em>`, "battlefield");
    if (!item) return;
    item.anchor.element.classList.add("manny-gun-entering");
    later(() => {
      if (item.alive()) item.anchor.element.classList.remove("manny-gun-entering");
    }, 980);
    tone(120, .18, "sawtooth", 0, .045);
    tone(760, .08, "square", 120, .025);
  }

  function armory(state, actor, weapon) {
    const item = anchored(state, actor,
      `manny-gun-armory weapon-${weapon}`, 1150,
      `<b>${weaponFan()}</b><span></span>`);
    if (!item) return;
    tone(180, .16, "sawtooth", 0, .04);
    tone(weapon === "barrett" ? 460 : 280, .14, "triangle", 130, .03);
  }

  function barrettJudge(state, actor) {
    anchored(state, actor, "manny-gun-judge", 1000, "<b></b><i></i><span></span>");
    tone(980, .08, "sine", 0, .03);
  }

  function weaponAttack(state, actor, target, weapon) {
    if (!active(actor)) return;
    if (weapon === "flamer") {
      const foes = actor.side === "ally" ? state.battle?.enemies : state.battle?.allies;
      (foes || []).filter(unit => unit.hp > 0).forEach(unit => {
        line(state, actor, unit, "manny-flame-line", 980);
        targetFx(state, unit, "manny-flame-hit", 1100, "<i></i><span></span>");
      });
      tone(95, .35, "sawtooth", 0, .05);
      return;
    }
    line(state, actor, target,
      `manny-${weapon}-shot`, weapon === "barrett" ? 1150 : 760);
    targetFx(state, target,
      `manny-${weapon}-hit`, 900, "<b></b><i></i><span></span>");
    if (weapon === "barrett") {
      anchored(state, actor, "manny-barrett-rifle", 1100, "<b></b>");
    }
    tone(weapon === "cannon" ? 82 : weapon === "barrett" ? 105 : 210,
      .14, "square", 0, .05);
  }

  function ak47Burst(state, actor, target) {
    if (!active(actor)) return;
    for (let index = 0; index < 5; index += 1) {
      const effect = line(state, actor, target, "manny-ak47-burst", 720);
      effect?.style.setProperty("--burst-delay", `${index * 45}ms`);
    }
    tone(260, .06, "square", 0, .035);
    tone(220, .06, "square", 80, .035);
  }

  function dimensionTransfer(state, manny, from, target) {
    if (!active(manny)) return;
    const source = from || manny;
    targetFx(state, source, "manny-portal source", 1150,
      `<b>${guns()}</b><span></span><em></em>`);
    targetFx(state, target, "manny-portal target", 1150,
      `<b>${guns()}</b><span></span><em></em>`);
    ray(state, source, target, "manny-portal-shot", 980, "battlefield");
    tone(330, .18, "sine", 0, .04);
    tone(120, .16, "sawtooth", 180, .04);
  }

  function spikeMark(state, actor, target) {
    if (!active(actor)) return;
    targetFx(state, target, "manny-spike-attach", 880, "<b></b><i></i>");
    tone(720, .08, "square", 0, .025);
  }

  function spikeBurst(state, actor, target, group) {
    if (!active(actor)) return;
    targetFx(state, target,
      "manny-spike-burst", 1050, "<b></b><i></i><span></span>");
    (group || []).filter(unit => unit.hp > 0 && unit.uid !== target.uid)
      .forEach(unit =>
        ray(state, target, unit, "manny-spike-ray", 780, "battlefield"));
    tone(72, .28, "sawtooth", 0, .06);
  }

  return {
    entry, armory, barrettJudge, weaponAttack, ak47Burst,
    dimensionTransfer, spikeMark, spikeBurst,
  };
};
