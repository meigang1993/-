// 希特威 全技能 · 严格实战回归
//   ⭐ 天使血愈：锁定技，当你恢复生命值后，其他友方角色也恢复等量生命值。
//   ⭐ 心血之咒：锁定技，当你受到伤害后，伤害来源须交给你一张♥红桃牌。
//                若其未交牌，你对其造成等同于你攻击力的伤害。
//   ⭐ 神心自愈：锁定技，当你使用或打出♥红桃牌时，你恢复等同于你魔力值的生命值。
//                台词：不用担心我，我伤口恢复很快。
//
// 断言的是「实际效果」：血量真的变化、手牌真的转移、日志真的产生、台词真的播出，
// 而不是只检查技能名是否在列表里。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把我方 0 号改造成希特威
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const c = b.allies[0];
  c.name = "希特威"; c.ref = "hitwell"; c.id = "hitwell";
  c.stats = { attack: 3, magic: 3, speed: 4 };
  c.tempMagic = 0; c.tempAttack = 0; c.block = 0;
  c.skills = [
    { name: "天使血愈", type: "passive" },
    { name: "心血之咒", type: "passive" },
    { name: "神心自愈", type: "passive" },
  ];
  st.log = [];
  window.__hwApi = { pushFloat: () => {}, damage: () => {} };
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// ── 神心自愈 ──────────────────────────────────────────────
const regenTpl = (suit, hp, tempMagic) => `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.hp = ${hp}; c.maxHp = 34; c.tempMagic = ${tempMagic};
  b.allies.forEach((u, i) => { if (i !== 0) { u.hp = 50; u.maxHp = 100; u.hand = []; } });
  b.enemies.forEach(u => { u.hp = 60; u.maxHp = 100; });
  st.log = [];
  const card = { name: "测试牌", type: "slash", suit: "${suit}", scale: "attack" };
  window.HitwellSkills.afterCardPlayed(st, c, card, window.__hwApi);
  return {
    hp: c.hp,
    allyHp: b.allies[1] ? b.allies[1].hp : null,
    logs: st.log.slice(0, 8),
  };
})()`;

// ── 天使血愈 ──────────────────────────────────────────────
// 只测天使血愈本身：直接调 afterHeal，避免混入神心自愈的回血
const angelTpl = (healed, allyHp, foeHp) => `(() => {
  const st = window.state, b = st.battle;
  const c = b.allies[0];
  c.hp = 20; c.maxHp = 34;
  b.allies.forEach((u, i) => { if (i !== 0) { u.hp = ${allyHp}; u.maxHp = 100; } });
  b.enemies.forEach(u => { u.hp = ${foeHp}; u.maxHp = 100; });
  st.log = [];
  window.HitwellSkills.afterHeal(st, c, ${healed}, window.__hwApi);
  return {
    allyHp: b.allies[1] ? b.allies[1].hp : null,
    foeHp: b.enemies[0] ? b.enemies[0].hp : null,
    selfHp: c.hp,
    logs: st.log.slice(0, 8),
  };
})()`;

// ── 心血之咒 ──────────────────────────────────────────────
const curseTpl = (srcSuit) => `(() => {
  const st = window.state, b = st.battle;
  const t = b.allies[0];
  const src = b.enemies[0];
  t.hp = 30; t.maxHp = 34; t.tempAttack = 0;
  t.stats = { attack: 3, magic: 3, speed: 4 };
  t.hand = [];
  src.hp = 60; src.maxHp = 100;
  src.hand = [{ name: "来源手牌", type: "slash", suit: "${srcSuit}" }];
  st.log = [];
  let direct = 0, directTarget = null;
  const damage = () => {};
  damage.directDamage = (s, unit, amount, srcName, from, flag, payload) => {
    direct = amount; directTarget = unit ? unit.uid : null;
    if (unit) unit.hp -= amount;
  };
  const deps = {
    damage,
    directDamage: damage.directDamage,
  };
  window.HitwellSkills.afterDamage(st, src, t, { name: "攻击", type: "slash" }, 4, deps);
  return {
    srcHand: src.hand.length, tHand: t.hand.length,
    srcHp: src.hp, direct, directTarget, srcUid: src.uid,
    logs: st.log.slice(0, 8),
  };
})()`;

// 自伤：actor === target 时不应触发
const selfDamageTpl = `(() => {
  const st = window.state, b = st.battle;
  const t = b.allies[0];
  t.hp = 30; t.maxHp = 34; t.hand = [];
  b.enemies[0].hand = [{ name: "牌", type: "slash", suit: "♥" }];
  st.log = [];
  let direct = 0;
  window.HitwellSkills.afterDamage(st, t, t, { name: "攻击" }, 4,
    { damage: () => {}, directDamage: (s, u, a) => { direct = a; } });
  return { direct, logs: st.log.slice(0, 5), tHand: t.hand.length };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("战斗已构造（我方≥2、敌方≥1）", setup.ok && setup.allies >= 2 && setup.foes >= 1, setup);

  // ═══ 神心自愈 ═══
  console.log("\n── 神心自愈 ──");
  const r1 = await page.evaluate(regenTpl("♥", 20, 0));
  T("打出♥红桃牌恢复 3 点（= 魔力 3）", r1.hp === 23, r1);
  T("产生神心自愈日志", r1.logs.some(l => String(l).includes("神心自愈")), r1.logs);

  const r2 = await page.evaluate(regenTpl("♠", 20, 0));
  T("打出♠黑桃牌不恢复", r2.hp === 20, r2);
  T("非红桃牌不产生神心自愈日志",
    !r2.logs.some(l => String(l).includes("神心自愈")), r2.logs);
  const r2b = await page.evaluate(regenTpl("♣", 20, 0));
  T("打出♣梅花牌不恢复", r2b.hp === 20, r2b);
  const r2c = await page.evaluate(regenTpl("♦", 20, 0));
  T("打出♦方块牌不恢复", r2c.hp === 20, r2c);

  const r3 = await page.evaluate(regenTpl("♥", 34, 0));
  T("满血时不恢复（无溢出）", r3.hp === 34, r3);

  const r4 = await page.evaluate(regenTpl("♥", 20, 2));
  T("临时魔力计入（3+2 → 恢复 5）", r4.hp === 25, r4);

  const r5 = await page.evaluate(regenTpl("♥", 32, 0));
  T("恢复量不超过上限（32+3 → 34 而非 35）", r5.hp === 34, r5);

  // 台词：BattleLines.skill 无返回值，台词先进 pendingSkills、下一个事件循环
  // 才写入 battle.speech。因此必须「触发→等待→读 speech」，
  // 读返回值或读 skillCaptions 都只能拿到「发动了 X」兜底字幕（假断言陷阱）。
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.speech = null; b.animQueue = [];
    const c = b.allies[0];
    c.hp = 20; c.maxHp = 34; c.tempMagic = 0;
    window.HitwellSkills.afterCardPlayed(st, c,
      { name: "测试牌", type: "slash", suit: "♥" }, window.__hwApi);
  })()`);
  await page.waitForTimeout(250);
  const line1 = await page.evaluate(
    `(() => { const s = window.state?.battle?.speech; return s ? (s.lines ? (s.lines.map(l => l.text).join("")) : (s.text || null)) : null; })()`);
  // 神心自愈会联动天使血愈，同一页字幕含两句台词，故用 includes
  T("神心自愈台词播出：「不用担心我，我伤口恢复很快。」",
    String(line1).includes("不用担心我，我伤口恢复很快。"), { line1 });
  T("神心自愈联动天使血愈，两句台词同页播出",
    String(line1).includes("我健康，大家也能被治愈。"), { line1 });

  // ═══ 天使血愈 ═══
  console.log("\n── 天使血愈 ──");
  const a1 = await page.evaluate(angelTpl(5, 50, 60));
  T("希特威恢复后队友等量恢复（50→55）", a1.allyHp === 55, a1);
  T("敌方不恢复（60→60，描述为「其他友方角色」）", a1.foeHp === 60, a1);
  T("天使血愈日志写明「其他友方角色」",
    a1.logs.some(l => String(l).includes("其他友方角色")), a1.logs);
  T("产生天使血愈日志", a1.logs.some(l => String(l).includes("天使血愈")), a1.logs);

  const a2 = await page.evaluate(angelTpl(5, 98, 60));
  T("队友恢复不溢出（98 → 100 而非 103）", a2.allyHp === 100, a2);

  const a3 = await page.evaluate(angelTpl(0, 50, 60));
  T("恢复量为 0 时不触发", a3.allyHp === 50 && a3.foeHp === 60, a3);

  // 连锁防护：其他角色因天使血愈恢复时不再回调（否则无限递归）
  const a4 = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const c = b.allies[0];
    c.hp = 20; c.maxHp = 34;
    b.allies.forEach((u, i) => { if (i !== 0) { u.hp = 50; u.maxHp = 100; } });
    b.enemies.forEach(u => { u.hp = 60; u.maxHp = 100; });
    st.log = [];
    let calls = 0;
    // 直接改 hp 不走恢复函数 → 本技能不会被再次触发
    window.HitwellSkills.afterHeal(st, c, 5, window.__hwApi);
    calls = st.log.filter(l => String(l).includes("天使血愈")).length;
    return { calls, allyHp: b.allies[1].hp };
  })()`);
  T("无无限连锁（天使血愈日志仅 1 条）", a4.calls === 1, a4);

  // 阵营判定：按 side 取同阵营，而不是写死 allies。
  // 把希特威放到敌方阵营时，恢复的是敌方同伴、我方不恢复。
  const a5 = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const c = b.enemies[0];
    c.name = "希特威"; c.ref = "hitwell"; c.id = "hitwell"; c.side = "enemy";
    c.hp = 20; c.maxHp = 34;
    c.skills = [{ name: "天使血愈", type: "passive" }];
    b.allies.forEach(u => { u.hp = 50; u.maxHp = 100; });
    b.enemies.forEach((u, i) => { if (i !== 0) { u.hp = 60; u.maxHp = 100; } });
    st.log = [];
    window.HitwellSkills.afterHeal(st, c, 5, window.__hwApi);
    return {
      foeAllyHp: b.enemies[1] ? b.enemies[1].hp : null,
      ourHp: b.allies.map(u => u.hp),
      logs: st.log.slice(0, 8),
    };
  })()`);
  T("敌方阵营希特威：敌方同伴恢复（60→65）", a5.foeAllyHp === 65, a5);
  T("敌方阵营希特威：我方全部不恢复（50 不变）",
    Array.isArray(a5.ourHp) && a5.ourHp.every(h => h === 50), a5);

  // 复原：把希特威放回我方 0 号，后续台词与心血之咒用例依赖此布局
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const c = b.allies[0];
    c.side = "ally";
    c.skills = [
      { name: "天使血愈", type: "passive" },
      { name: "心血之咒", type: "passive" },
      { name: "神心自愈", type: "passive" },
    ];
    b.enemies.forEach(u => { if (u.ref === "hitwell") { u.ref = "foe"; u.id = "foe"; u.side = "enemy"; } });
    window.render();
  })()`);

  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.speech = null; b.animQueue = [];
    const c = b.allies[0];
    c.hp = 20; c.maxHp = 34;
    b.allies.forEach((u, i) => { if (i !== 0) { u.hp = 50; u.maxHp = 100; } });
    b.enemies.forEach(u => { u.hp = 60; u.maxHp = 100; });
    window.HitwellSkills.afterHeal(st, c, 5, window.__hwApi);
  })()`);
  await page.waitForTimeout(250);
  const line2 = await page.evaluate(
    `(() => { const s = window.state?.battle?.speech; return s ? (s.lines ? (s.lines.map(l => l.text).join("")) : (s.text || null)) : null; })()`);
  T("天使血愈台词播出：「我健康，大家也能被治愈。」",
    line2 === "我健康，大家也能被治愈。", { line2 });

  // ═══ 心血之咒 ═══
  console.log("\n── 心血之咒 ──");
  const c1 = await page.evaluate(curseTpl("♥"));
  T("来源有♥牌时交牌：来源手牌 1→0", c1.srcHand === 0, c1);
  T("希特威获得该♥牌：手牌 0→1", c1.tHand === 1, c1);
  T("交牌时不造成反击伤害", c1.direct === 0 && c1.srcHp === 60, c1);
  T("产生交牌日志", c1.logs.some(l => String(l).includes("心血之咒")), c1.logs);

  const c2 = await page.evaluate(curseTpl("♠"));
  T("来源无♥牌时不交牌：手牌仍为 1", c2.srcHand === 1, c2);
  T("改为造成等同攻击力伤害（3 点）", c2.direct === 3, c2);
  T("反击目标为伤害来源", c2.directTarget === c2.srcUid, c2);
  T("来源生命真的减少（60→57）", c2.srcHp === 57, c2);
  T("产生未交牌反击日志",
    c2.logs.some(l => String(l).includes("未能交出")), c2.logs);

  const c3 = await page.evaluate(selfDamageTpl);
  T("自己伤害自己不触发心血之咒", c3.direct === 0 && c3.tHand === 0, c3);

  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.speech = null; b.animQueue = [];
    const t = b.allies[0], src = b.enemies[0];
    t.hp = 30; t.maxHp = 34; t.stats = { attack: 3, magic: 3, speed: 4 };
    src.hp = 60; src.maxHp = 100;
    src.hand = [{ name: "来源手牌", type: "slash", suit: "♥" }];
    window.HitwellSkills.afterDamage(st, src, t, { name: "攻击" }, 4,
      { damage: () => {}, directDamage: () => {} });
  })()`);
  await page.waitForTimeout(250);
  const line3 = await page.evaluate(
    `(() => { const s = window.state?.battle?.speech; return s ? (s.lines ? (s.lines.map(l => l.text).join("")) : (s.text || null)) : null; })()`);
  T("心血之咒台词播出：「为了贝丝妲姐姐，我不会倒下，给我诅咒吧！」",
    line3 === "为了贝丝妲姐姐，我不会倒下，给我诅咒吧！", { line3 });

  // ═══ 技能描述与定义 ═══
  console.log("\n── 定义与描述 ──");
  const def = await page.evaluate(`(() => {
    const c = (window.GameData?.characters || []).find(x => x.id === "hitwell");
    if (!c) return null;
    const names = (c.skills || []).map(s => s.name);
    const texts = {};
    (c.skills || []).forEach(s => { texts[s.name] = s.text || ""; });
    return { names, texts, art: c.art || "", locked: !!c.locked };
  })()`);
  T("角色定义含三个技能", def && def.names.length === 3, def);
  T("天使血愈描述为设定原文（其他友方角色，敌方不参与）",
    def && def.texts["天使血愈"]
      === "锁定技，当你恢复生命值后，其他友方角色也恢复等量生命值。", def);
  T("心血之咒描述为设定原文",
    def && def.texts["心血之咒"]
      === "锁定技，当你受到伤害后，伤害来源须交给你一张♥红桃牌。若其未交牌，你对其造成等同于你攻击力的伤害。", def);
  T("神心自愈描述为设定原文",
    def && def.texts["神心自愈"]
      === "锁定技，当你使用或打出♥红桃牌时，你恢复等同于你魔力值的生命值。", def);

  // 结算钩子已导出（源码层确认，防止只改模块忘了接线）
  const hooked = await page.evaluate(`(() => ({
    regen: typeof window.HitwellSkills?.afterCardPlayed === "function",
    heal: typeof window.HitwellSkills?.afterHeal === "function",
    dmg: typeof window.HitwellSkills?.afterDamage === "function",
  }))()`);
  T("三个钩子均已导出为函数",
    hooked.regen && hooked.heal && hooked.dmg, hooked);

  const art = await page.evaluate(`(async () => {
    const c = (window.GameData?.characters || []).find(x => x.id === "hitwell");
    if (!c || !c.art) return { ok: false, why: "no-art" };
    const img = new Image();
    const ok = await new Promise(res => {
      img.onload = () => res(true); img.onerror = () => res(false);
      img.src = c.art;
    });
    return { ok, w: img.naturalWidth, h: img.naturalHeight, art: c.art };
  })()`);
  T("希特威立绘加载成功", art.ok && art.w > 0, art);

  // ═══ 三处同步：羁绊任务 / 培养目标 / 管家手册魅魔目标 ═══
  console.log("\n── 三处同步 ──");
  const sync = await page.evaluate(`(() => {
    const st = window.state;
    const tpl = (window.GameData?.characters || []).find(x => x.id === "hitwell");
    // 1) 培养目标：成长表是否含希特威
    const growth = window.CharacterProgression?.growth || {};
    const growHitwell = !!growth.hitwell;
    const growCount = Object.keys(growth).length;
    const tplCount = (window.GameData?.characters || []).length;
    // 2) 羁绊任务池：解锁后采样，是否会出现希特威
    //    注意入口是 window.BountyTasks.generate（BountyTaskGenerator 是工厂函数，
    //    直接调 window.BountyTaskGenerator.generate 会是 undefined —— 属假通过陷阱）
    const before = (() => {
      const c = st.chars.find(x => x.id === "hitwell");
      if (c) c.locked = true;
      const ids = new Set();
      for (let i = 0; i < 300; i++) {
        const t = window.BountyTasks?.generate?.(st);
        if (t && t.type === "bond") ids.add(t.charId);
      }
      return { ids: [...ids], n: ids.size };
    })();
    const after = (() => {
      const c = st.chars.find(x => x.id === "hitwell");
      if (c) c.locked = false;
      const ids = new Set();
      for (let i = 0; i < 300; i++) {
        const t = window.BountyTasks?.generate?.(st);
        if (t && t.type === "bond") ids.add(t.charId);
      }
      return { ids: [...ids], n: ids.size };
    })();
    // 3) 管家手册魅魔目标
    const heroes = window.ButlerManualProgress?.heroList?.(st) || [];
    const hw = heroes.find(h => h.id === "hitwell");
    return {
      growHitwell, growCount, tplCount,
      bondBeforeHasHitwell: before.ids.includes("hitwell"),
      bondAfterHasHitwell: after.ids.includes("hitwell"),
      bondSampled: after.n,
      heroCount: heroes.length,
      heroHasHitwell: !!hw, heroName: hw ? hw.name : null,
      tpl: !!tpl,
    };
  })()`);

  T("① 培养目标含希特威", sync.growHitwell, sync);
  T("① 培养目标覆盖全部角色模板（%s/%s）".replace("%s", sync.growCount).replace("%s", sync.tplCount),
    sync.growCount === sync.tplCount, sync);
  T("② 羁绊任务池：未解锁时不出现希特威", sync.bondBeforeHasHitwell === false, sync);
  T("② 羁绊任务池：解锁后纳入希特威", sync.bondAfterHasHitwell === true, sync);
  T("③ 管家手册魅魔目标含希特威", sync.heroHasHitwell, sync);
  T("③ 魅魔目标总数为 30（分母恒定）", sync.heroCount === 30, sync);

  // 界面实际渲染：另开一页走真实点击路径（战斗页没有大厅入口）
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors2 = collectErrors(page2);
  await openGame(page2);
  await startFreshGame(page2);
  await dismissOpeningStory(page2);
  await page2.evaluate(`(() => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "hitwell");
    if (c) { c.locked = false; c.level = 20; }
    window.render();
  })()`);
  await page2.locator("[data-open-butler]").click();
  await page2.locator(".butler-page").waitFor({ state: "visible" });
  await page2.locator("[data-butler-tab='hero']").click();
  await page2.locator(".butler-hero-grid").waitFor({ state: "visible" });
  const cells = await page2.locator(".butler-hero").count();
  const maxed = await page2.locator(".butler-hero.maxed").count();
  const imgs = await page2.locator(".butler-hero img").count();
  const sum = (await page2.locator(".butler-sum").textContent()) || "";
  const m = String(sum).match(/已满级：(\d+)\s*\/\s*(\d+)/);
  const gridText = (await page2.locator(".butler-hero-grid").textContent()) || "";
  const ui = {
    cells, maxed, imgs, sum: String(sum).trim(),
    done: m ? +m[1] : null, all: m ? +m[2] : null,
    hasName: gridText.includes("希特威"),
  };
  T("③ 魅魔目标页渲染 30 个条目", ui.cells === 30, ui);
  T("③ 魅魔目标页列出希特威", ui.hasName, ui);
  T("③ 希特威满级后计入已完成（已满级 1 / 30）",
    ui.done === 1 && ui.all === 30, ui);
  T("③ 未解锁角色以占位显示（头像数 < 条目数）", ui.imgs < ui.cells, ui);
  const bad2 = relevantErrors(errors2);
  T("手册页面无 JS 错误", bad2.length === 0, bad2.slice(0, 3));

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("FATAL", err); process.exit(1); });
