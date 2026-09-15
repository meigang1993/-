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
    anchored(state, actor, "angelica-berserker-might", 1120, "<b></b><i></i><i></i><i></i><span></span>");
    tone(300, .14, "sawtooth", 0, .04); tone(620, .1, "triangle", 90, .03);
  }
  function entry(state, unit) {
    if (!active(unit)) return;
    const item = anchored(state, unit, "angelica-berserker-entry", 1380,
      "<b></b><i></i><i></i><i></i><span></span>", "battlefield");
    if (!item) return;
    item.anchor.element.classList.add("angelica-berserker-entering");
    later(() => { if (item.alive()) item.anchor.element.classList.remove("angelica-berserker-entering"); }, 1120);
    tone(120, .2, "sawtooth", 0, .04); tone(480, .12, "triangle", 160, .035);
    return item;
  }
  function queueEntry(state, unit, attempt = 0) {
    if (!active(unit)) return;
    later(() => {
      if (window.state !== state || !state?.battle || state.battle.victoryScreen) return;
      if (!entry(state, unit) && attempt < 5) queueEntry(state, unit, attempt + 1);
    }, attempt ? 90 : 50);
  }
  function rageGain(state, unit, strong) {
    if (!active(unit)) return;
    anchored(state, unit, `angelica-berserker-rage-gain ${strong ? "strong" : ""}`, 980,
      "<b></b><i></i><span></span><span></span><span></span>", strong ? "battlefield" : "action-first");
    tone(strong ? 210 : 520, .12, strong ? "sawtooth" : "sine", 0, .035);
  }
  function rageSpend(state, actor, count) {
    if (!active(actor)) return;
    actor.skinRageTrailTurn = state?.battle?.turn;
    anchored(state, actor, `angelica-berserker-rage-slam ${(count || 0) >= 4 ? "grand" : ""}`, 1320,
      "<b></b><i></i><i></i><i></i><span></span><span></span><span></span><span></span><em></em>");
    tone(180, .18, "sawtooth", 0, .05); tone(760, .12, "triangle", 110, .035);
  }
  function rageTrail(state, actor, target) {
    if (!active(actor) || !target || actor.skinRageTrailTurn !== state?.battle?.turn) return;
    line(state, actor, target, "angelica-berserker-rage-trail", 560);
  }
  function setVars(item, vars) {
    if (!item?.fx) return;
    Object.entries(vars).forEach(([name, value]) => item.fx.style.setProperty(name, value));
  }
  function crimsonRampage(state, actor, count) {
    if (!active(actor)) return;
    const marks = Math.max(1, Math.min(10, count || 1));
    const burstEnd = 200 + marks * 90;
    const stage = (delay, task) => later(() => {
      if (window.state !== state || !state?.battle || state.battle.victoryScreen) return;
      task();
    }, delay);
    // 血甲收束：金属摩擦般的尖锐嗡鸣
    anchored(state, actor, "angelica-berserker-rampage-armor", 980,
      "<b></b><i></i><i></i><em></em>", "battlefield");
    tone(132, .3, "sawtooth", 0, .05); tone(1240, .2, "square", 40, .022);
    // 狂战标记逐枚炸裂，对应部位的血甲剥落
    for (let i = 0; i < marks; i += 1) {
      stage(200 + i * 90, () => {
        const item = anchored(state, actor, "angelica-berserker-rampage-burst", 780,
          "<b></b><i></i><span></span><span></span>", "battlefield");
        setVars(item, { "--burst-index": `${i}`, "--burst-total": `${marks}` });
        tone(460 + i * 36, .08, "square", 0, .028);
      });
    }
    // 最后一枚碎裂：双手握剑插地，血色冲击波自脚下炸开
    stage(burstEnd + 40, () => {
      anchored(state, actor, "angelica-berserker-rampage-shock", 1220,
        "<b></b><b></b><i></i><i></i><i></i><i></i><span></span><span></span><span></span><span></span>",
        "battlefield");
      tone(96, .34, "sawtooth", 0, .06); tone(240, .2, "triangle", 60, .035);
    });
    // 拔剑而起，血色雾气凝聚成猩红巨人虚影
    stage(burstEnd + 430, () => {
      anchored(state, actor, "angelica-berserker-rampage-giant", 1560,
        "<b></b><i></i><i></i><span></span><span></span><em></em>", "battlefield");
      tone(180, .28, "sawtooth", 0, .045); tone(540, .16, "triangle", 90, .03);
    });
    // 血雾自毛孔渗入，伤口闭合、皮肤泛起暗红光泽
    stage(burstEnd + 700, () => {
      anchored(state, actor, "angelica-berserker-rampage-heal", 1240,
        "<b></b><span></span><span></span><span></span><em></em>", "battlefield");
      tone(720, .14, "triangle", 0, .03); tone(1080, .18, "sine", 80, .03);
    });
    // 每弃置1枚标记触发一次脉冲光环，脚下向上扩散，颜色逐圈加深
    for (let i = 0; i < marks; i += 1) {
      stage(burstEnd + 620 + i * 120, () => {
        const item = anchored(state, actor, "angelica-berserker-rampage-pulse", 780,
          "<b></b><i></i><i></i><i></i>", "battlefield");
        setVars(item, { "--pulse-index": `${i}`, "--pulse-total": `${marks}` });
        tone(300 + i * 26, .09, "sine", 0, .026);
      });
    }
    // 巨人虚影碎裂，碎块化为漫天血色光点洒落
    stage(burstEnd + 780 + marks * 120, () => {
      anchored(state, actor, "angelica-berserker-rampage-rain", 1420,
        "<i></i><i></i><i></i><i></i><i></i><i></i><span></span>", "battlefield");
      tone(210, .2, "sine", 0, .03);
    });
    // 光环于胸口汇聚成猩红核心，稳定后沉入体内消失
    stage(burstEnd + 920 + marks * 120, () => {
      const item = anchored(state, actor, "angelica-berserker-rampage-core", 1100,
        "<b></b><em></em>", "battlefield");
      setVars(item, { "--pulse-total": `${marks}` });
      tone(160, .26, "sawtooth", 0, .04); tone(880, .2, "sine", 120, .03);
    });
  }
  function sync(state) {
    if (!hasDocument()) return;
    if (!state?.battle) return;
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    if (!hasDocument()) return;
    document.querySelectorAll(".angelica-berserker-fx,.angelica-berserker-line").forEach(node => node.remove());
    document.querySelectorAll(".angelica-berserker-entering").forEach(node =>
      node.classList.remove("angelica-berserker-entering"));
  }
  return { active, entry, queueEntry, might, rageGain, rageSpend, rageTrail, crimsonRampage, sync, cancel };
})();
