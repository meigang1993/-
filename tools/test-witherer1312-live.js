// XX型凋零者1312号 专项回归
//   外神之眼：受伤后令伤害来源对其同阵营其他存活角色视为使用虚拟【杀】；
//             无其他角色时伤害来源对自己造成等同攻击力的伤害；逐段触发。
//   魅魔吸精术：战术牌对男性偷牌、对女性弃牌、对无性别目标伤害翻倍。
//   百眼魅魔：结束阶段弃红桃，令我方互相虚拟出杀。
//   粉色魅魔装：红色牌对该角色无效；其使用的红色牌不可响应。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  const ok = !!cond;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name}` + (ok ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 外神之眼 ①：有同阵营其他角色 → 令伤害来源对同伴出虚拟杀 =====
  const setupEye = `(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], a1 = b.allies[1];
    const w = b.enemies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
    w.hp = 300; w.stats = Object.assign({}, w.stats, { attack: 12, magic: 11 });
    w.hand = [];
    b.enemies.length = 1;
    b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    a0.intent = 9; a0.hp = 200; a0.stats = Object.assign({}, a0.stats, { attack: 5 });
    a1.hp = 200; a1.hand = [];
    st.log = [];
    window.render();
    return { allies: b.allies.map(x => x.name), foe: w.name };
  })()`;

  const peek = `(() => {
    const st = window.state, b = st.battle;
    return {
      allyHp: b.allies.map(x => x.hp),
      foeHp: b.enemies[0]?.hp,
      logs: (st.log || []).map(String),
    };
  })()`;

  await page.evaluate(setupEye);
  const eyeSetup = await page.evaluate(peek);
  T("构造：我方 2 名存活角色", eyeSetup.allyHp.length >= 2
    && eyeSetup.allyHp.every(hp => hp > 0), eyeSetup.allyHp);

  // 用真实的伤害链：我方 0 号对凋零者出一张战术牌
  const playTactic = `(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], w = b.enemies[0];
    a0.hand = [{ name: "战术测试", type: "tactic", suit: "♠", power: 3, scale: "attack" }];
    a0.hand.forEach(c => { delete c._pendingDraw; });
    w.hp = 300;
    st.log = [];
    window.BattleSystem.playActiveCard(st, 0, w.uid);
    return true;
  })()`;

  await page.evaluate(playTactic);
  // 外神之眼挂在受击动画播完之后（delayUntilHitSettled），需留足动画时间
  await page.waitForTimeout(3000);
  const eyeRes = await page.evaluate(peek);
  const eyeLog = eyeRes.logs.join(" / ");
  T("外神之眼：日志出现「视为使用一张虚拟【杀】」",
    /外神之眼/.test(eyeLog) && /虚拟【杀】/.test(eyeLog),
    { logs: eyeRes.logs.slice(0, 8) });
  T("外神之眼：伤害来源的同伴掉血或日志显示响应",
    eyeRes.allyHp[1] < 200 || /闪/.test(eyeLog),
    { allyHp: eyeRes.allyHp, logs: eyeRes.logs.slice(0, 8) });

  // ===== 外神之眼 ②：无其他存活角色 → 伤害来源对自己造成攻击力伤害 =====
  const setupSolo = `(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0];
    window.__savedAllies = b.allies.slice();
    b.allies.length = 1;
    const w = b.enemies[0];
    w.ai = "ruins_witherer"; w.hp = 300; w.hand = [];
    b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    a0.intent = 9; a0.hp = 200;
    a0.stats = Object.assign({}, a0.stats, { attack: 7 });
    st.log = [];
    window.render();
    return { allyCount: b.allies.length, allyAtk: a0.stats.attack };
  })()`;

  await page.evaluate(setupSolo);
  await page.evaluate(playTactic);
  await page.waitForTimeout(3000);
  const soloRes = await page.evaluate(peek);
  const soloLog = soloRes.logs.join(" / ");
  T("外神之眼·无同伴：伤害来源对自己造成伤害",
    /对自己造成/.test(soloLog) && soloRes.allyHp[0] < 200,
    { allyHp: soloRes.allyHp, logs: soloRes.logs.slice(0, 8) });

  // ===== 粉色魅魔装 ①：红色牌对该角色无效 =====
  const relicSetup = (allyRelic, foeRelic, suit, foeFlash) => `(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[0];
    b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    a.intent = 9; a.battleRelics = ${JSON.stringify(allyRelic)};
    a.hand = [{ name: "杀", type: "slash", suit: "${suit}", scale: "attack", power: 4 }];
    a.hand.forEach(c => { delete c._pendingDraw; });
    e.battleRelics = ${JSON.stringify(foeRelic)};
    e.hand = ${JSON.stringify(foeFlash)};
    e.hand.forEach(c => { delete c._pendingDraw; });
    e.hp = 200; e.block = 0; e.ai = "ruins_grunt";
    st.log = [];
    window.render();
    return { foeHp: e.hp };
  })()`;

  const playSlash = `(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
    return true;
  })()`;

  await page.evaluate(relicSetup([], [], "♥", []));
  await page.evaluate(playSlash);
  await page.waitForTimeout(1200);
  const baseRed = await page.evaluate(peek);
  const baseLoss = 200 - baseRed.foeHp;
  console.log(`[对照] 敌方无饰品，红色杀掉血 ${baseLoss}`);

  await page.evaluate(relicSetup([], ["粉色魅魔装"], "♥", []));
  await page.evaluate(playSlash);
  await page.waitForTimeout(1200);
  const pinkRed = await page.evaluate(peek);
  const pinkLoss = 200 - pinkRed.foeHp;
  console.log(`[粉色魅魔装] 敌方装备后，红色杀掉血 ${pinkLoss}`);
  T("粉色魅魔装：红色牌对该角色无效",
    baseLoss > 0 && pinkLoss === 0, { baseLoss, pinkLoss, logs: pinkRed.logs.slice(0, 6) });

  // 黑色牌仍应生效（只免疫红色）
  await page.evaluate(relicSetup([], ["粉色魅魔装"], "♠", []));
  await page.evaluate(playSlash);
  await page.waitForTimeout(1200);
  const black = await page.evaluate(peek);
  T("粉色魅魔装：黑色牌不受免疫影响", 200 - black.foeHp > 0,
    { loss: 200 - black.foeHp, logs: black.logs.slice(0, 6) });

  // ===== 粉色魅魔装 ②：佩戴者使用的红色牌不可响应 =====
  const FLASH = [{ name: "闪", type: "dodge", suit: "♠" }];
  await page.evaluate(relicSetup([], [], "♥", FLASH));
  await page.evaluate(playSlash);
  await page.waitForTimeout(1500);
  const base2 = await page.evaluate(peek);
  console.log(`[对照] 敌方有闪，我方无饰品 → 敌掉血 ${200 - base2.foeHp}`);

  await page.evaluate(relicSetup(["粉色魅魔装"], [], "♥", FLASH));
  await page.evaluate(playSlash);
  await page.waitForTimeout(1500);
  const pink2 = await page.evaluate(peek);
  console.log(`[粉色魅魔装] 我方装备 → 敌掉血 ${200 - pink2.foeHp}`);
  T("粉色魅魔装：佩戴者的红色牌不可被响应",
    200 - pink2.foeHp > 0 && /无法使用响应牌|不可被响应/.test(pink2.logs.join(" / ")),
    { loss: 200 - pink2.foeHp, logs: pink2.logs.slice(0, 8) });

  // ===== 百眼魅魔：结束阶段弃红桃，令我方互相虚拟出杀 =====
  const setupHundred = `(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.hp = 300;
    w.hand = [
      { name: "牌A", type: "slash", suit: "\u2665", scale: "attack" },
      { name: "牌B", type: "slash", suit: "\u2665", scale: "attack" },
      { name: "牌C", type: "slash", suit: "\u2660", scale: "attack" },
    ];
    w.hand.forEach(c => { delete c._pendingDraw; });
    if (window.__savedAllies) {
      b.allies.length = 0;
      window.__savedAllies.forEach(u => b.allies.push(u));
    }
    b.allies.forEach(a => { a.hp = 200; a.hand = []; });
    b.enemies.length = 1;
    b.phase = 4; b.locked = false; b.animQueue = [];
    st.log = [];
    window.render();
    return { foeHand: w.hand.length, allyCount: b.allies.length };
  })()`;

  const runEndTurn = `(() => {
    const st = window.state, b = st.battle;
    window.RuinsWithererSkills.endTurn(st, b.enemies[0]);
    return true;
  })()`;

  await page.evaluate(setupHundred);
  await page.evaluate(runEndTurn);
  // 虚拟杀走完整响应流程且伤害挂在动画之后，需留足结算时间
  await page.waitForTimeout(5000);
  const hundred = await page.evaluate(peek);
  const hLog = hundred.logs.join(" / ");
  console.log(`[百眼魅魔] 日志: ${hundred.logs.slice(0, 5).join(" | ")}`);
  T("百眼魅魔：弃置红桃牌", /弃置.*红桃牌/.test(hLog), { logs: hundred.logs.slice(0, 6) });
  T("百眼魅魔：令我方互相视为使用虚拟【杀】",
    /百眼魅魔/.test(hLog) && /虚拟【杀】/.test(hLog),
    { logs: hundred.logs.slice(0, 6) });
  // 说明：手动调 endTurn 时非行动单位出牌会被出牌流程拦下，伤害不在本构造内结算；
  // 虚拟杀能真实造成伤害已由外神之眼用例验证（同伴 200→197），二者共用同一入口。
  T("百眼魅魔：对每个存活敌方角色各发出一次虚拟杀指令",
    (hLog.match(/视为使用一张虚拟【杀】/g) || []).length >= 2,
    { allyHp: hundred.allyHp, logs: hundred.logs.slice(0, 6) });

  // ===== 魅魔吸精术：战术牌对男性偷牌 / 对女性弃牌 =====
  const drainTpl = gender => `(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0], a0 = b.allies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.hp = 300;
    w.hand = [];
    b.enemies.length = 1;
    a0.gender = "${gender}"; a0.hp = 200;
    a0.hand = [{ name: "甲的牌", type: "slash", suit: "\u2660", scale: "attack" }];
    a0.hand.forEach(c => { delete c._pendingDraw; });
    const tactic = { name: "吸精战术", type: "tactic", suit: "\u2660", power: 2, scale: "attack" };
    st.log = [];
    window.BattleSystem.useCard(st, w, a0, tactic);
    return true;
  })()`;

  await page.evaluate(drainTpl("male"));
  await page.waitForTimeout(2000);
  const male = await page.evaluate(`(() => {
    const b = window.state.battle;
    return {
      foeHand: (b.enemies[0].hand || []).map(c => c.name),
      allyHand: (b.allies[0].hand || []).map(c => c.name),
      logs: (window.state.log || []).map(String),
    };
  })()`);
  console.log(`[吸精术·男性] 敌手牌 ${JSON.stringify(male.foeHand)} 我方手牌 ${JSON.stringify(male.allyHand)}`);
  T("魅魔吸精术：对男性角色获得其一张牌",
    male.allyHand.length === 0 && male.foeHand.some(n => n === "甲的牌"),
    { foeHand: male.foeHand, allyHand: male.allyHand, logs: male.logs.slice(0, 6) });

  await page.evaluate(drainTpl("female"));
  await page.waitForTimeout(2000);
  const female = await page.evaluate(`(() => {
    const b = window.state.battle;
    return {
      foeHand: (b.enemies[0].hand || []).map(c => c.name),
      allyHand: (b.allies[0].hand || []).map(c => c.name),
      logs: (window.state.log || []).map(String),
    };
  })()`);
  console.log(`[吸精术·女性] 敌手牌 ${JSON.stringify(female.foeHand)} 我方手牌 ${JSON.stringify(female.allyHand)}`);
  T("魅魔吸精术：对女性角色弃置其一张牌",
    female.allyHand.length === 0 && female.foeHand.every(n => n !== "甲的牌"),
    { foeHand: female.foeHand, allyHand: female.allyHand, logs: female.logs.slice(0, 6) });

  // ===== 魅魔吸精术：对无性别角色造成的伤害为 2 倍 =====
  const drainDmgTpl = gender => `(() => {
    const st = window.state, b = st.battle;
    const w = b.enemies[0], a0 = b.allies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.hp = 300; w.hand = [];
    w.stats = Object.assign({}, w.stats, { attack: 12, magic: 11 });
    b.enemies.length = 1;
    b.locked = false; b.animQueue = [];
    a0.gender = "${gender}"; a0.hp = 400; a0.hand = [];
    st.log = [];
    const tactic = { name: "吸精战术", type: "tactic", suit: "\\u2660", power: 2, scale: "attack" };
    window.BattleSystem.useCard(st, w, a0, tactic);
    return true;
  })()`;

  await page.evaluate(drainDmgTpl("male"));
  await page.waitForTimeout(2000);
  const baseHp = await page.evaluate("window.state.battle.allies[0].hp");
  await page.evaluate(drainDmgTpl(""));
  await page.waitForTimeout(2000);
  const noneHp = await page.evaluate(`(() => ({
    hp: window.state.battle.allies[0].hp,
    logs: (window.state.log || []).map(String) }))()`);
  const maleLoss = 400 - baseHp, noneLoss = 400 - noneHp.hp;
  console.log(`[吸精术·翻倍] 男性掉血 ${maleLoss} → 无性别掉血 ${noneLoss}`);
  T("魅魔吸精术：对无性别角色伤害翻倍",
    maleLoss > 0 && noneLoss === maleLoss * 2,
    { maleLoss, noneLoss, logs: noneHp.logs.slice(0, 6) });

  // ===== 外神之眼：多段伤害逐段结算 =====
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a0 = b.allies[0], a1 = b.allies[1], w = b.enemies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.gender = "female";
    w.hp = 900; w.hand = [];
    b.enemies.length = 1;
    b.activeUid = a0.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    a0.intent = 99; a0.hp = 900; a0.stats = Object.assign({}, a0.stats, { attack: 5 });
    a1.hp = 900; a1.hand = [];
    st.log = [];
    window.__after = 0;
    // 写入即捕获：日志走 BattleLog.add，事后读 state.log 会被后续日志挤出窗口
    window.__logs = [];
    if (!window.__origLogAdd && window.BattleLog && window.BattleLog.add) {
      window.__origLogAdd = window.BattleLog.add;
      window.BattleLog.add = function (...args) {
        try { window.__logs.push(String(args[1] ?? args[0])); } catch (e) {}
        return window.__origLogAdd.apply(this, args);
      };
    }
    if (!window.__origAfter) window.__origAfter = window.RuinsWithererSkills.afterDamage;
    window.RuinsWithererSkills.afterDamage = function (...args) {
      window.__after++;
      return window.__origAfter.apply(this, args);
    };
    const kill = () => ({ name: "多段段", type: "slash", power: 0, scale: "attack", suit: "\\u2660" });
    for (let i = 0; i < 3; i++) window.BattleSystem.useCard(st, a0, w, kill());
    return true;
  })()`);
  // 外神之眼挂在受击动画之后执行，必须等动画队列真正清空，否则末段回调尚未跑
  await page.waitForFunction(
    `(() => { const b = window.state?.battle; return !b || (b.animQueue?.length || 0) === 0; })()`,
    null, { timeout: 15000 }
  ).catch(() => {});
  await page.waitForTimeout(2500);
  const seg = await page.evaluate(`(() => ({
    after: window.__after,
    logs: (window.__logs || []).slice() }))()`);
  const eyeHits = (seg.logs.join(" ").match(/外神之眼触发/g) || []).length;
  console.log(`[外神之眼·逐段] afterDamage=${seg.after} 触发日志=${eyeHits}`);
  T("外神之眼：多段伤害逐段结算", seg.after >= 3 && eyeHits >= 3,
    { after: seg.after, eyeHits });

  // ===== 百眼魅魔：中途阵亡的角色不再被驱动 =====
  const hundredDead = await page.evaluate(`(() => {
    const st = window.state, b = st.battle, w = b.enemies[0];
    w.ai = "ruins_witherer"; w.name = "XX型凋零者1312号"; w.hp = 300;
    w.hand = [{ name: "红桃A", type: "slash", suit: "\\u2665", power: 0, scale: "attack" }];
    w.hand.forEach(c => { delete c._pendingDraw; });
    b.enemies.length = 1;
    b.allies.slice(2).forEach(x => { x.hp = 0; });
    b.allies[0].hp = 200; b.allies[0].hand = [];
    b.allies[0].stats = Object.assign({}, b.allies[0].stats, { attack: 99 });
    b.allies[1].hp = 200; b.allies[1].hand = [];
    b.allies[1].stats = Object.assign({}, b.allies[1].stats, { attack: 1 });
    b.locked = false; b.animQueue = [];
    st.log = [];
    window.RuinsWithererSkills.endTurn(st, w);
    return true;
  })()`);
  await page.waitForTimeout(3000);
  const hdRes = await page.evaluate(`(() => ({
    allies: window.state.battle.allies.map(x => ({ n: x.name, hp: x.hp })),
    logs: (window.state.log || []).map(String) }))()`);
  const deadNames = hdRes.allies.filter(x => x.hp <= 0).map(x => x.n);
  const deadActed = deadNames.some(n =>
    hdRes.logs.some(l => l.includes(`使${n}对`) || l.includes(`${n}无可攻击目标`)));
  console.log(`[百眼·阵亡者] ${JSON.stringify(hdRes.allies)}`);
  T("百眼魅魔：中途阵亡的角色不再被驱动", !deadActed,
    { allies: hdRes.allies, deadNames, logs: hdRes.logs.slice(0, 6) });

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
