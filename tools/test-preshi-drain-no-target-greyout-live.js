// 女王榨取「无有效目标时是否置灰」实机检查
//
// 背景：窃取（凯瑟琳）此前是「按钮能点、点了静默无反应」——blockedByBattle 里
// 没有为 catherineSteal 判「有牌可偷的敌人 + 另一名存活同阵营接收者」。
// 本文件用同一把尺子量女王榨取：
//   ① 有男性队友            → 可点且生效
//   ② 队伍无男性            → 置灰
//   ③ 男性队友已阵亡        → 置灰（旧覆盖只测了「无男性」，没测「有但死了」）
//   ④ 男性队友存活但无手牌  → 可点，掉血、摸 0 张，且不卡界面
//   ⑤ 本回合已用过          → 置灰
//   ⑥ 非普雷希角色持有该技能（模拟未来「复制别人技能」的角色）→ 探针，记录实际行为
//
// 全程走真实 DOM：button.skill 置灰时不带 data-skill-index 且带 .disabled。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory, openTestBattle,
  collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// mode: normal | noMale | maleDead | maleNoHand | holderNotPreshi
const setupTpl = mode => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  b.phase = 4;
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({
      uid: "fill" + n, name: "补位" + n, ref: "fill" + n, id: "fill" + n,
      gender: "female", side: "ally", hp: 50, maxHp: 50, block: 0,
      hand: [], skills: [], stats: { attack: 4, magic: 4, speed: 4 },
    });
  }
  const drainCard = () => ({ name: "女王榨取", type: "tactic",
    preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" });
  const drainSkill = () => ({ name: "女王榨取", type: "active", icon: "⚔️",
    text: "出牌阶段限一次，指定我方一名男性角色。", card: drainCard() });

  const p = b.allies[0], m = b.allies[1], f = b.allies[2];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0;
  p.usedPreshiDrain = false;
  p.skills = [
    { name: "女王威压", type: "passive" },
    ${mode === "holderNotPreshi" ? "" : "drainSkill(),"}
  ];
  p.hand = [];
  for (let i = 0; i < 3; i++)
    p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });

  m.name = "罗卡尔"; m.ref = "lokar"; m.id = "lokar";
  m.gender = ${mode === "noMale" ? '"female"' : '"male"'};
  m.hp = ${mode === "maleDead" ? "0" : "62"}; m.maxHp = 62; m.block = 0;
  m.hand = ${mode === "maleNoHand" ? "[]" : `[
    { name: "闪", type: "basic", suit: "♥", uid: "mh0" },
    { name: "闪", type: "basic", suit: "♠", uid: "mh1" },
  ]`};

  f.name = "贝尔蒂丝"; f.ref = "bertis"; f.id = "bertis"; f.gender = "female";
  f.hp = f.maxHp = 60; f.block = 0;
  f.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "fh0" }];
  f.skills = ${mode === "holderNotPreshi" ? "[drainSkill()]" : "[]"};

  b.enemies.forEach((e, i) => {
    e.gender = "male"; e.hp = e.maxHp = 60; e.block = 0;
    e.hand = [{ name: "闪", type: "basic", suit: "♣", uid: "eh" + i }];
  });
  // 动画期临时字段必须清掉：recover() 会把 visualHp 写回 unit.hp，
  // 否则「男性已阵亡」的布置会被还原成满血，测出来的就是假红。
  b.allies.concat(b.enemies).forEach(u => {
    u.hand.forEach(c => { delete c._pendingDraw; });
    u.visualHp = u.hp; u.visualBlock = u.block || 0;
    delete u.deferredDeathVisual;
  });

  const holder = ${mode === "holderNotPreshi" ? "f" : "p"};
  b.activeUid = holder.uid;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  window.render();
  // 同步读按钮：引擎会在若干毫秒后推进回合并重新同步单位（阵亡布置会被还原），
  // 分两次 evaluate 读到的就是被还原后的状态，故布置与读值必须同一次完成。
  var btnRead = (function () {
    var nodes = [].slice.call(document.querySelectorAll("button.skill"))
      .filter(function (n) { return (n.getAttribute("title") || "").indexOf("女王榨取") >= 0; });
    if (!nodes.length) return { found: false };
    var n = nodes[0];
    return { found: true, disabledClass: n.classList.contains("disabled"),
      hasIndex: n.hasAttribute("data-skill-index"),
      title: (n.getAttribute("title") || "").trim().replace(/\s+/g, " ") };
  })();
  return { holder: holder.uid, male: m.uid, female: f.uid, preshi: p.uid,
    btn: btnRead, hpSnapshot: b.allies.map(function (a) { return { n: a.name, g: a.gender, hp: a.hp }; }) };
})()`;

const btnTpl = `(() => {
  const nodes = [...document.querySelectorAll("button.skill")]
    .filter(n => (n.getAttribute("title") || "").includes("女王榨取"));
  if (!nodes.length) return { found: false };
  const n = nodes[0];
  return {
    found: true,
    disabledClass: n.classList.contains("disabled"),
    ariaDisabled: n.getAttribute("aria-disabled"),
    hasIndex: n.hasAttribute("data-skill-index"),
    title: (n.getAttribute("title") || "").trim().replace(/\\s+/g, " "),
    dump: (function () {
      var b = window.state.battle;
      return { activeUid: b.activeUid, phase: b.phase,
        allies: b.allies.map(function (a) {
          return { n: a.name, g: a.gender, hp: a.hp, vhp: a.visualHp };
        }) };
    })(),
  };
})()`;


// 引擎会在若干毫秒后推进回合并重新同步单位（阵亡布置会被还原），
// 且 render 后的 DOM 需要等下一帧才稳定。故：重新施加关键状态 → render →
// 等两帧 → 同步读按钮与逻辑层 canPlay。
const readTpl = (mode, holderUid) => `(() => {
  const b = window.state.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  const m = b.allies[1];
  m.gender = ${mode === "noMale" ? '"female"' : '"male"'};
  m.hp = ${mode === "maleDead" ? "0" : "62"};
  b.allies.concat(b.enemies).forEach(function (u) {
    u.visualHp = u.hp; u.visualBlock = u.block || 0; delete u.deferredDeathVisual;
  });
  b.activeUid = "${holderUid}";
  const hpAtRender = b.allies.map(function (a) { return { n: a.name, g: a.gender, hp: a.hp }; });
  // 动画期 renderFrozen 为 true 时 window.render() 会被跳过，读到的是上一帧的
  // 旧按钮（假绿/假红都由此而来），故先 recover 解冻再重绘。
  window.BattleEffects.recover(window.state);
  window.render();
  // 同步读：引擎会在下一个宏任务把阵亡单位重新同步回满血，
  // 一旦 await，读到的就是被还原后的状态（假红）。
  const nodes = [].slice.call(document.querySelectorAll("button.skill"))
    .filter(function (n) { return (n.getAttribute("title") || "").indexOf("女王榨取") >= 0; });
  let btn = { found: false };
  if (nodes.length) {
    const n = nodes[0];
    btn = { found: true, disabledClass: n.classList.contains("disabled"),
      hasIndex: n.hasAttribute("data-skill-index"),
      title: (n.getAttribute("title") || "").trim().replace(/\\s+/g, " ") };
  }
  let canPlay = null;
  const holder = b.allies.concat(b.enemies).find(function (u) { return u.uid === "${holderUid}"; });
  const card = (holder && (holder.skills || []).find(function (sk) { return sk.name === "女王榨取"; })) ? holder.skills.find(function (sk) { return sk.name === "女王榨取"; }).card : null;
  if (card && window.BattleCardPlayability && window.BattleCardPlayability.canPlay)
    canPlay = !!window.BattleCardPlayability.canPlay(holder, card, b);
  const hpNow = b.allies.map(function (a) { return { n: a.name, g: a.gender, hp: a.hp }; });
  return { btn: btn, hpAtRender: hpAtRender, hpNow: hpNow,
    snapshot: b.allies.map(function (a) { return { n: a.name, g: a.gender, hp: a.hp }; }) };
})()`;

const clickSkill = `(() => {
  const n = [...document.querySelectorAll("button.skill[data-skill-index]")]
    .find(el => (el.getAttribute("title") || "").includes("女王榨取"));
  if (!n) return { clicked: false };
  n.click();
  return { clicked: true };
})()`;

const clickUnit = uid => `(() => {
  const el = document.querySelector('[data-target="${uid}"] .unit-art');
  if (!el) return { ok: false, reason: "no-dom" };
  el.click();
  return { ok: true };
})()`;

const readResult = `(() => {
  const b = window.state.battle;
  const p = b.allies[0], m = b.allies[1];
  const cnt = x => (x.hand || []).filter(c => !c._pendingDraw).length;
  return { hpLoss: 62 - m.hp, maleLeft: cnt(m),
    drew: (p.hand || []).filter(c => c._pendingDraw).length,
    usedPreshi: !!p.usedPreshiDrain, locked: !!b.locked };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const b = window.state.battle;
    window.state.settings.battleSpeed = 1;
    b.animQueue = []; b.locked = false; b.phase = 4;
    b.activeUid = b.allies[0].uid;
    b.allies.concat(b.enemies)
      .forEach(u => u.hand.forEach(c => { delete c._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
  });

  const reset = async (mode, rerender = true) => {
    const info = await page.evaluate(setupTpl(mode));
    await page.waitForTimeout(200);
    if (!rerender) return info;   // 只读按钮：避免重绘把「阵亡」布置还原
    // 引擎可能已经把回合推给敌方，点击前重新把行动者指回持牌者
    await page.evaluate(uid => {
      const b = window.state.battle;
      b.animQueue = []; b.locked = false; b.phase = 4; b.activeUid = uid;
      window.render();
    }, info.holder);
    await page.waitForTimeout(250);
    return info;
  };

  // ── ① 有男性队友：可点且生效 ──
  let u = await reset("normal");
  let btn = await page.evaluate(btnTpl);
  T("① 有男性队友：技能可点（带 data-skill-index）",
    btn.found && btn.hasIndex && !btn.disabledClass, btn);
  let clk = await page.evaluate(clickSkill);
  T("① 点击技能进入选目标", clk.clicked === true, clk);
  await page.waitForTimeout(150);
  await page.locator(`[data-target="${u.male}"] .unit-art`).first()
    .click({ timeout: 4000 }).catch(() => {});
  // 目标持 2 张手牌时需弃 2 张 + 摸 2 张，动画队列比「无手牌」场景长得多，
  // 只等 500ms 会读到尚未结算完成的状态（假红）。
  await page.waitForTimeout(1200);
  let r = await page.evaluate(readResult);
  T("① 造成等同于魔力值的伤害", r.hpLoss === 5, r);
  T("① 弃置其所有手牌", r.maleLeft === 0, r);
  T("① 摸等量牌", r.drew === 2, r);
  T("① 次数已消耗", r.usedPreshi === true, r);

  // ── ② 队伍无男性：置灰 ──
  u = await reset("noMale", false);
  let rd = await page.evaluate(readTpl("noMale", u.holder));
  btn = rd.btn;
  T("② 队伍无男性：技能置灰", btn.found && !btn.hasIndex && btn.disabledClass, rd);
  T("② 队伍无男性：置灰文案说明目标条件不足",
    /目标条件不足/.test(btn.title || ""), btn);

  // ── ③ 男性队友已阵亡：走逻辑层 canPlay ──
  // 实机里引擎会在下一帧把阵亡单位重新同步回满血，DOM 读到的必然是被还原后的
  // 状态，无法稳定断言；改用逻辑层判据，判据本身与界面共用同一条
  // blockedByBattle（card.preshiDrain && !livingMale()）。
  const logic = await page.evaluate(`(() => {
    const b = window.state.battle;
    b.animQueue = []; b.locked = false; b.phase = 4;
    const p = b.allies[0], m = b.allies[1];
    p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
    p.hp = p.maxHp = 56; p.usedPreshiDrain = false;
    p.skills = [{ name: "女王榨取", type: "active", icon: "⚔️", text: "t",
      card: { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true } }];
    p.hand = [];
    b.activeUid = p.uid;
    const deps = { isKillCard: c => c && c.type === "slash",
      isSingleKillCard: c => c && c.type === "slash" && !c.sweep,
      active: bb => bb.enemies[0] };
    const card = { name: "女王榨取", type: "tactic", preshiDrain: true,
      allyTarget: true, _skill: true };
    m.gender = "male"; m.hp = 62;
    const aliveMale = !!window.BattleCardPlayability(deps).canPlay(p, card, b);
    m.hp = 0;
    const deadMale = !!window.BattleCardPlayability(deps).canPlay(p, card, b);
    m.hp = 62; m.gender = "female";
    const noMale = !!window.BattleCardPlayability(deps).canPlay(p, card, b);
    return { aliveMale: aliveMale, deadMale: deadMale, noMale: noMale };
  })()`);
  T("③ 逻辑层 · 有存活男性时可发动", logic.aliveMale === true, logic);
  T("③ 逻辑层 · 男性已阵亡(hp=0)时不可发动", logic.deadMale === false, logic);
  T("③ 逻辑层 · 队伍无男性时不可发动", logic.noMale === false, logic);

  // ── ④ 男性队友存活但无手牌：可点，掉血、摸 0，不卡界面 ──
  u = await reset("maleNoHand");
  btn = await page.evaluate(btnTpl);
  T("④ 男性无手牌：技能可点（伤害成立，摸 0 张）",
    btn.found && btn.hasIndex && !btn.disabledClass, btn);
  clk = await page.evaluate(clickSkill);
  T("④ 可进入选目标", clk.clicked === true, clk);
  await page.locator(`[data-target="${u.male}"] .unit-art`).first()
    .click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  r = await page.evaluate(readResult);
  T("④ 仍造成伤害", r.hpLoss === 5, r);
  T("④ 摸 0 张（无牌可弃）", r.drew === 0, r);
  T("④ 界面未卡死", r.locked === false, r);

  // ── ⑤ 本回合已用过：置灰 ──
  await page.evaluate(() => {
    const b = window.state.battle;
    b.animQueue = []; b.locked = false; b.phase = 4;
    const p = b.allies[0];
    p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
    p.usedPreshiDrain = true;
    b.allies[1].gender = "male"; b.allies[1].hp = 62;
    b.activeUid = p.uid;
    b.allies.concat(b.enemies).forEach(x => {
      x.hand.forEach(c => { delete c._pendingDraw; });
      x.visualHp = x.hp;
    });
    window.render();
  });
  await page.waitForTimeout(300);
  btn = await page.evaluate(btnTpl);
  T("⑤ 本回合已用过：技能置灰", btn.found && !btn.hasIndex && btn.disabledClass, btn);

  // ── ⑥ 探针：非普雷希角色持有该技能（模拟未来「复制别人技能」的角色）──
  u = await reset("holderNotPreshi", false);
  rd = await page.evaluate(readTpl("holderNotPreshi", u.holder));
  btn = rd.btn;
  console.log("⑥ 探针 · 非普雷希持有时按钮状态:", JSON.stringify(btn));
  if (btn.found && btn.hasIndex && !btn.disabledClass) {
    const before = await page.evaluate(`(() => {
      const b = window.state.battle, m = b.allies[1];
      const cnt = x => (x.hand || []).filter(c => !c._pendingDraw).length;
      return { maleHp: m.hp, maleLeft: cnt(m) };
    })()`);
    const c6 = await page.evaluate(clickSkill);
    await page.waitForTimeout(200);
    if (c6.clicked) {
      await page.locator(`[data-target="${u.male}"] .unit-art`).first()
        .click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    const after = await page.evaluate(`(() => {
      const b = window.state.battle, m = b.allies[1];
      const cnt = x => (x.hand || []).filter(c => !c._pendingDraw).length;
      return { maleHp: m.hp, maleLeft: cnt(m), locked: !!b.locked };
    })()`);
    const silent = after.maleHp === before.maleHp
      && after.maleLeft === before.maleLeft;
    console.log("⑥ 探针 · 点击前后:", JSON.stringify({ before, after, silent }));
    T("⑥ 非普雷希持有：按钮可点时必须真的生效（不得静默无反应）",
      !silent, { before, after });
  } else {
    T("⑥ 非普雷希持有：技能按钮不渲染或已置灰（不会静默无反应）",
      !btn.found || !btn.hasIndex, btn);
  }

  const bad = relevantErrors(errors);
  T("页面无运行时错误", bad.length === 0, bad.slice(0, 3));
  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
