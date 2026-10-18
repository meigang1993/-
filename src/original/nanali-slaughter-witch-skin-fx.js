window.NanaliSlaughterWitchSkinFX = (() => {
  const runtime = window.SkinFXRuntime.create("nanali-slaughter-witch");
  const { active, hasDocument, later, mount } = runtime;
  function anchored(state, unit, className, duration = 900, html = "", mode = "action-first") {
    if (!hasDocument()) return null;
    const fx = document.createElement("div");
    fx.className = `nanali-witch-fx ${className}`;
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
    if (!hasDocument()) return null;
    const from = window.BattleEffectAnchors?.measure(fromUnit, fromMode);
    const to = window.BattleEffectAnchors?.measure(toUnit, toMode);
    if (!from || !to) return null;
    const dx = to.center.x - from.center.x, dy = to.center.y - from.center.y;
    const fx = document.createElement("div");
    fx.className = `nanali-witch-line ${className}`;
    fx.style.cssText = `left:${from.center.x}px;top:${from.center.y}px;width:${Math.hypot(dx, dy)}px;--line-angle:${Math.atan2(dy, dx)}rad`;
    fx.innerHTML = "<i></i><i></i>";
    mount(state, fx, duration);
    return fx;
  }
  function setVars(item, vars) {
    [item?.fx].filter(Boolean).forEach(node =>
      Object.entries(vars).forEach(([name, value]) => node.style.setProperty(name, value)));
  }
  // 出场：巨刀砸入地面砸碎巨石 → 刀格独眼睁开爆出血光 → 从高空坠落、双翼展开震开尸体 → 单脚踩兽人尸首、单手拔刀
  function entry(state, unit) {
    if (!active(unit)) return;
    const item = anchored(state, unit, "nanali-witch-entry", 1560,
      "<b></b><i></i><i></i><i></i><span></span><span></span><em></em>", "battlefield");
    if (!item) return;
    item.anchor.element.classList.add("nanali-witch-entering");
    later(() => { if (item.alive()) item.anchor.element.classList.remove("nanali-witch-entering"); }, 1300);
    tone(96, .26, "sawtooth", 0, .05); tone(1180, .16, "square", 120, .024);
    later(() => { if (item.alive()) tone(300, .18, "triangle", 0, .035); }, 380);
    return item;
  }
  function queueEntry(state, unit, attempt = 0) {
    if (!active(unit)) return;
    later(() => {
      if (window.state !== state || !state?.battle || state.battle.victoryScreen) return;
      if (!entry(state, unit) && attempt < 5) queueEntry(state, unit, attempt + 1);
    }, attempt ? 90 : 50);
  }
  // 魔刀阿波罗：独眼锁定 → 双手抡起巨刀划出血色残月刀气 → 血链锁住目标扣置的牌，战术牌崩断回体
  function apolloSeal(state, actor, target, cards = []) {
    if (!active(actor)) return;
    const sealed = Math.min(6, cards.length || 1);
    const tactics = cards.filter(card => card?.type === "tactic").length;
    anchored(state, actor, "nanali-witch-eye", 900, "<b></b><i></i><em></em>");
    setVars(anchored(state, target, "nanali-witch-crescent", 760,
      "<b></b><i></i><i></i>", "battlefield"), { "--seal-count": `${sealed}` });
    line(state, actor, target, "nanali-witch-crescent-line", 620);
    tone(720, .12, "square", 0, .03); tone(240, .16, "sawtooth", 90, .04);
    if (!sealed) return;
    const chains = Array.from({ length: sealed }, (_, i) => `<i style="--i:${i};--n:${sealed}"></i>`).join("");
    later(() => {
      if (window.state !== state || !state?.battle) return;
      const item = anchored(state, target, "nanali-witch-chains", 1080, `${chains}<span></span><span></span>`, "battlefield");
      setVars(item, { "--seal-count": `${sealed}` });
      tone(420, .14, "triangle", 0, .032);
    }, 160);
    // 扣置牌中的战术牌：锁链崩断，化作血色能量飞回娜娜莉体内（对应摸牌）
    if (tactics) {
      later(() => {
        if (window.state !== state || !state?.battle) return;
        const item = anchored(state, target, "nanali-witch-chain-break", 940,
          "<i></i><i></i><span></span><span></span>", "battlefield");
        setVars(item, { "--tactic-count": `${Math.min(6, tactics)}` });
        line(state, target, actor, "nanali-witch-essence-line", 900, "battlefield", "action-first");
        tone(640, .16, "sine", 0, .034); tone(880, .12, "triangle", 110, .028);
      }, 420);
    }
  }
  // 虚弱斩杀：脚下浮现巨大血红恶魔阵 → 收翼化作红黑闪电跃至半空 → 刀刃爆发血色刀芒，以开山之势重重劈下 → 十字血色斩击
  function weaknessExecute(state, actor, target) {
    if (!active(actor)) return;
    anchored(state, target, "nanali-witch-circle", 1180, "<b></b><b></b><i></i><i></i><em></em>", "battlefield");
    tone(148, .22, "sawtooth", 0, .045); tone(360, .14, "triangle", 70, .032);
    // 收翼化作红黑闪电跃至半空
    later(() => {
      if (window.state !== state || !state?.battle) return;
      anchored(state, actor, "nanali-witch-leap", 560, "<b></b><i></i><i></i>");
      tone(260, .14, "square", 0, .03);
    }, 170);
    // 刀刃爆发血色刀芒，以开山之势重重劈下
    later(() => {
      if (window.state !== state || !state?.battle) return;
      anchored(state, target, "nanali-witch-cleave", 680, "<b></b><i></i><span></span><span></span>", "battlefield");
      anchored(state, target, "nanali-witch-cross", 1020,
        "<b></b><b></b><i></i><i></i><span></span><span></span><span></span><span></span>", "battlefield");
      tone(190, .2, "square", 0, .04); tone(960, .18, "triangle", 90, .035);
    }, 430);
  }
  // 待机：双翼扇动、刀上独眼转动、拄刀俯视，通过持久 class 由 CSS 驱动
  function sync(state) {
    if (!hasDocument()) return;
    const battle = state?.battle;
    if (!battle) return;
    document.querySelectorAll(".nanali-witch-idle").forEach(node => node.classList.remove("nanali-witch-idle"));
    battle.allies?.concat(battle.enemies || []).forEach(unit => {
      if (!active(unit)) return;
      const arts = [window.BattleEffectAnchors?.battlefield(unit), window.BattleEffectAnchors?.action(unit)].filter(Boolean);
      arts.forEach(art => art.classList.add("nanali-witch-idle"));
    });
  }
  function tone(...args) { window.BattleAudio?.tone?.(...args); }
  function cancel() {
    runtime.cancel();
    if (!hasDocument()) return;
    document.querySelectorAll(".nanali-witch-fx,.nanali-witch-line").forEach(node => node.remove());
    document.querySelectorAll(".nanali-witch-entering,.nanali-witch-idle").forEach(node =>
      node.classList.remove("nanali-witch-entering", "nanali-witch-idle"));
  }
  return { active, entry, queueEntry, apolloSeal, weaknessExecute, sync, cancel };
})();
