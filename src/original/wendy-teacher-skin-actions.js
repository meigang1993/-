(() => {
  const api = window.WendyTeacherSkinFX;
  const fx = window.WendyTeacherSkinFXInternals;
  if (!api || !fx) return;

  function wisdom(state, unit) {
    if (!api.active(unit)) return;
    fx.anchored(state, unit, "wendy-teacher-wisdom", 980,
      "<b></b><i></i><i></i><span></span>");
    fx.tone(840, .08, "triangle", 0, .025);
    fx.tone(1180, .1, "sine", 90, .025);
  }

  function cover(state, actor, gains) {
    if (!api.active(actor)) return;
    fx.anchored(state, actor, "wendy-teacher-cover-source", 940,
      "<b></b><i></i><i></i><span></span>");
    gains.forEach(({ unit, gain, reinforced }, index) => {
      const item = fx.targetFx(state, unit,
        `wendy-teacher-cover ${reinforced ? "reinforced" : ""}`, 1100,
        `<b></b><i></i><span>${gain}</span>`);
      item?.style.setProperty("--slab-index", `${index}`);
    });
    fx.tone(260, .14, "triangle", 0, .035);
    fx.tone(520, .12, "sine", 110, .03);
  }

  function answer(state, actor, target) {
    if (!api.active(actor)) return;
    fx.anchored(state, actor, "wendy-teacher-answer", 1250,
      "<b></b><i></i><i></i><i></i><i></i><i></i><span></span>");
    if (target && target.uid !== actor.uid) {
      const favored = target.ref === "cadicis" || target.ref === "flora";
      fx.ribbon(state, actor, target, favored ? "favored" : "");
    }
    fx.tone(430, .12, "triangle", 0, .03);
    fx.tone(1320, .14, "sine", 150, .04);
  }

  Object.assign(api, { wisdom, cover, answer });
})();
