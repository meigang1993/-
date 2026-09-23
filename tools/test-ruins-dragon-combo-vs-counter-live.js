// 专项：机械AI龙【电钻火花】连击 vs 反击类/受击类技能的交互
// 覆盖：1) 连击每次命中是否重复触发受击方的反击入队
//       2) 【机尾机枪】跨回合能否再次发动（每回合限一次 vs 整场一次）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const DRAGON = 1;
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// 场景1：龙打出单体杀 → 电钻火花追加次数 → 统计实际命中次数
const comboTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${DRAGON}];
  e.ai = "ruins_dragon"; e.name = "机械AI龙";
  e.stats = e.stats || {}; e.stats.attack = 13;
  e.hp = 342; e.intent = 1; e.block = 0;
  e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
  b.allies.forEach(u => { u.hand = []; u.hp = 3000; u.stats = u.stats || {}; u.stats.handLimit = 99; });
  b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
  // 记录初始血量：内部伤害不走 window.BattleSystem.damage 引用，改用掉血总量判定结算次数
  window.__hp0 = (b.allies[0] || {}).hp || 0;
  window.__log = [];
  if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
  const orig = window.__origChoose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null;
    if (actor?.ai === "ruins_dragon" && !window.__dkDone) {
      let kill = (actor.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c))
        || { name: "杀", type: "kill", suit: "♠" };
      if (!actor.hand.includes(kill)) actor.hand.push(kill);
      r = { card: kill, target: (bb.allies || [])[0], score: 999 };
      window.__dkDone = true;
    }
    if (!r) { try { r = orig(bb, actor, canPlay); } catch (err) {} }
    return r;
  };
  window.render();
  return { enemy: e.name };
})()`;

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", err => errors.push(String(err)));
  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(500);

    // ---------- 场景1：连击次数 ----------
    await page.evaluate(comboTpl);
    // 推进到敌方回合：现有回归均靠点击「结束出牌」驱动，直接改 activeUid 不会触发出牌流程
    try { await page.locator("button", { hasText: "结束出牌" }).first().click(); } catch (e) {}
    await page.waitForTimeout(4000);
    let r1 = await page.evaluate(`(() => ({
      hp0: window.__hp0 || 0,
      hpNow: (window.state.battle.allies[0] || {}).hp || 0,
      drill: (window.state.log || []).filter(l => String(l.text || l).includes("电钻火花")).length,
      roll: (() => { const m = (window.state.log || []).map(l => String(l.text || l))
        .find(t => t.includes("骰子点数")); const mm = m && m.match(/骰子点数(\\d)/); return mm ? +mm[1] : null; })(),
    }))()`);
    check("1.1 电钻火花已发动", r1.drill > 0, `日志=${r1.drill}`);
    const loss = r1.hp0 - r1.hpNow;
    check("1.2 连击实际结算次数 = 1 + 骰子点数（掉血=攻击力×次数）",
      r1.roll != null && loss === 13 * (1 + r1.roll),
      `掉血=${loss} 骰子=${r1.roll} 期望=${r1.roll != null ? 13 * (1 + r1.roll) : "?"}`);

    // ---------- 场景2：机尾机枪跨回合 ----------
    const gunTpl = `(() => {
      const b = window.state.battle;
      const e = b.enemies[${DRAGON}];
      e.ai = "ruins_dragon"; e.name = "机械AI龙";
      e.stats = e.stats || {}; e.stats.attack = 13;
      e.hp = 342; e.block = 0; e.ruinsHitsThisTurn = 0; e.ruinsGunFired = false;
      e.hand = [{ name: "杀", type: "slash", suit: "♦" }];  // 手牌1 → 阈值1
      b.allies.forEach(u => { u.hp = 3000; u.stats = u.stats || {}; u.stats.handLimit = 99;
        u.hand = [{ name: "杀", type: "kill", suit: "♠" }]; });
      b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
      window.render();
      return true;
    })()`;
    async function allyHit() {
      await page.evaluate(`(() => { const st = window.state, b = st.battle;
        b.activeUid = b.allies[0].uid; b.phase = 4; b.locked = false;
        b.allies.forEach(u => { u.intent = 3; });
        b.allies[0].hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
        window.render(); return true; })()`);
      const uid = await page.evaluate(`(() => window.state.battle.enemies[${DRAGON}]?.uid ?? null)()`);
      await page.evaluate(`(() => window.BattleSystem.playActiveCard(window.state, 0, "${uid}"))()`);
      await page.waitForTimeout(700);
      return page.evaluate(`(() => { const e = window.state.battle.enemies[${DRAGON}];
        return { block: e.block || 0, hits: e.ruinsHitsThisTurn || 0, gunFired: !!e.ruinsGunFired }; })()`);
    }
    await page.evaluate(gunTpl);
    await page.waitForTimeout(300);
    const g1 = await allyHit();
    check("2.1 第1次达阈值 → 机尾机枪发动（获得护甲）", g1.block > 0,
      `护甲=${g1.block} hits=${g1.hits}`);

    // 模拟进入下一个我方角色回合：按「每名角色回合限一次」，allyTurnStart 应同时重置
    // 受击计数与开火标记。（此处原断言为过时的「每场战斗限一次」口径，已按设定更正）
    await page.evaluate(`(() => {
      const b = window.state.battle;
      const e = b.enemies[${DRAGON}];
      e.block = 0;
      window.RuinsDragonSkills?.allyTurnStart?.(window.state, b.allies[0]);
      return true; })()`);
    const after = await page.evaluate(`(() => { const e = window.state.battle.enemies[${DRAGON}];
      return { hits: e.ruinsHitsThisTurn || 0, gunFired: !!e.ruinsGunFired }; })()`);
    check("2.2 我方角色回合开始重置受击计数与开火标记",
      after.hits === 0 && after.gunFired === false,
      `hits=${after.hits} gunFired=${after.gunFired}`);
    const g2 = await allyHit();
    // 按设定：机尾机枪为「每名角色回合限一次」，新的我方角色回合再达阈值应可再次发动
    check("2.3 机尾机枪为每名角色回合限一次（新角色回合可再发动）",
      g2.block > 0, `护甲=${g2.block}`);
    const dragonText = fs.readFileSync(path.join(__dirname, "..", "src", "original",
      "data-ruins-sand-city-enemies.js"), "utf8");
    check("2.4 描述已同步「每名角色回合限一次」",
      /机尾机枪[\s\S]{0,400}?每名角色回合限一次/.test(dragonText),
      "见 data-ruins-sand-city-enemies.js 机尾机枪 text");

    // ---------- 场景3：连击 N 次是否各自触发受击方反击入队 ----------
    const counterTpl = `(() => {
      const b = window.state.battle;
      const e = b.enemies[${DRAGON}];
      e.ai = "ruins_dragon"; e.name = "机械AI龙";
      e.stats = e.stats || {}; e.stats.attack = 13;
      e.hp = 342; e.intent = 1; e.block = 0;
      e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
      // 把我方 0 号设为贝尔蒂丝、1 号为 gerlot（复仇反击持有者），构造受伤反击链路
      const a0 = b.allies[0], a1 = b.allies[1];
      if (a0) { a0.ref = "bertis"; a0.name = "贝尔蒂丝"; a0.hp = 3000; }
      if (a1) { a1.ref = "gerlot"; a1.name = "格洛特"; a1.hp = 3000;
        a1.skills = [{ name: "复仇反击" }]; }
      b.allies.forEach(u => { u.hand = []; u.stats = u.stats || {}; u.stats.handLimit = 99; });
      b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
      // 统计反击入队次数
      window.__counterOpens = 0;
      if (window.BattleCounterTriggers && !window.__origOpen) {
        window.__origOpen = window.BattleCounterTriggers.open;
        window.BattleCounterTriggers.open = function (...a) {
          const r = window.__origOpen.apply(this, a);
          if (r) window.__counterOpens += 1;
          return r;
        };
      }
      window.__log = [];
      if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
      const orig = window.__origChoose;
      window.BattleAI.choose = function (bb, actor, canPlay) {
        let r = null;
        if (actor?.ai === "ruins_dragon" && !window.__dk2) {
          let kill = (actor.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c))
            || { name: "杀", type: "kill", suit: "♠" };
          if (!actor.hand.includes(kill)) actor.hand.push(kill);
          r = { card: kill, target: (bb.allies || [])[0], score: 999 };
          window.__dk2 = true;
        }
        if (!r) { try { r = orig(bb, actor, canPlay); } catch (err) {} }
        return r;
      };
      window.render();
      return { a0: a0?.ref, a1: a1?.ref };
    })()`;
    const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p3.on("pageerror", e => errors.push(String(e)));
    await openGame(p3); await startRegressionBattle(p3); await p3.waitForTimeout(400);
    const cr = await p3.evaluate(counterTpl);
    console.log("场景3 角色构造:", JSON.stringify(cr));
    try { await p3.locator("button", { hasText: "结束出牌" }).first().click(); } catch (e) {}
    await p3.waitForTimeout(4000);
    const r3 = await p3.evaluate(`(() => ({
      opens: window.__counterOpens || 0,
      drill: (window.state.log || []).filter(l => String(l.text || l).includes("发动电钻火花")).length,
      roll: (() => { const m = (window.state.log || []).map(l => String(l.text || l))
        .find(t => t.includes("骰子点数")); const mm = m && m.match(/骰子点数(\\d)/); return mm ? +mm[1] : null; })(),
    }))()`);
    // 一次杀（1+roll 段伤害）若每段都触发反击，open 次数会等于段数；期望为 1 次
    const seg = r3.roll != null ? 1 + r3.roll : null;
    check("3.1 连击多段伤害只触发一次反击（而非每段各一次）",
      r3.drill > 0 && seg > 1 && r3.opens === 1,
      `反击入队=${r3.opens} 连击段数=${seg}（修复前为 ${seg}）`);
    check("3.2 对照：反击链路确实可用（非构造失效）", r3.opens > 0,
      `反击入队=${r3.opens}`);

    check("页面无 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  } catch (err) {
    fail += 1; console.log("❌ 异常:", String(err));
  } finally {
    await browser.close();
  }
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
