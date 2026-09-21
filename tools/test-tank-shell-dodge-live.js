// 专项实战：梅尔卡坦克·坦克炮弹 —— 验证"每名角色需要打出2张【闪】才能抵消"是否真实生效
// 真实浏览器 + 真实回合：装填（出牌阶段弃2张单体杀）→ 下回合准备阶段发射
// 隔离构造：除坦克外其他敌人每轮清空手牌（避免消耗我方闪），
// 且每轮强制我方手牌 = FLASH_N 张闪，确保发射瞬间闪数可控
// 同时验证装填后坦克头像显示"炮弹"标记
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FLASH_N = Number(process.env.FLASH_N || "2");
const MANUAL = process.env.MANUAL === "1";

// 构造：enemies[1] = 梅尔卡坦克，手牌2张单体杀；玩家方每人 FLASH_N 张闪
const setupTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_tank";
  e.name = "梅尔卡坦克";
  e.stats = e.stats || {}; e.stats.attack = 16;
  e.hp = 85;
  e.usedRuinsTankShell = false;
  e.ruinsTankShellReady = false;
  e.hand = [
    { name: "杀", type: "kill", suit: "♠" },
    { name: "杀", type: "kill", suit: "♥" },
  ];
  const n = ${FLASH_N};
  b.allies.forEach(u => {
    u.hand = Array.from({ length: n },
      () => ({ name: "闪", type: "response", suit: "♥" }));
    u.hp = 200;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  if (${MANUAL} ? true : false) window.state.settings.manualResponse = true;
  window.__seen = [];
  window.__origAdd = window.__origAdd || window.BattleLog.add;
  window.BattleLog.add = function (st, text) {
    try { window.__seen.push(String(text)); } catch (err) {}
    return window.__origAdd.call(this, st, text);
  };
  if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
  const origChoose = window.__origChoose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null; try { r = origChoose(bb, actor, canPlay); } catch (err) {}
    if (actor?.ai === "ruins_tank" && !actor.usedRuinsTankShell) {
      const singles = (actor.hand || []).filter(c =>
        c && !c._pendingDraw && window.CardUtils?.isEntitySingleKill?.(c));
      if (singles.length >= 2) {
        r = { card: { name: "坦克炮弹", _skill: true, ruinsTankShell: true, targetless: true },
              target: actor, score: 999 };
      }
    }
    return r;
  };
  window.render();
  return { enemy: e.name, attack: e.stats.attack,
    allyHand: b.allies.map(u => (u.hand || []).length),
    allyHp: b.allies.map(u => u.hp) };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  return {
    tankReady: !!e.ruinsTankShellReady,
    tankUsed: !!e.usedRuinsTankShell,
    allyHp: b.allies.map(u => u.hp),
    allyHand: b.allies.map(u => (u.hand || []).length),
    shellBadges: document.querySelectorAll(".tank-shell-badge").length,
    locked: !!b.locked,
    phase: b.phase,
    activeUid: b.activeUid || null,
    pendingTargetUid: b.pendingTargetUid || null,
    manualDodge: b.manualDodge ? {
      actorUid: b.manualDodge.actorUid, targetUid: b.manualDodge.targetUid,
      deflectStarted: !!b.manualDodge.deflectStarted,
    } : null,
    seen: (window.__seen || []).slice(-40),
  };
})()`;

// 每轮：隔离其他敌人 + 固定我方闪数 + 坦克出牌阶段补齐 2 张单体杀
const tankForce = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  // 隔离：除坦克外所有敌人清空手牌，避免其出牌消耗我方闪
  b.enemies.forEach(u => { if (u !== e) u.hand = []; });
  // 固定我方手牌为 FLASH_N 张闪，保证发射瞬间闪数可控
  b.allies.forEach(u => {
    u.hand = Array.from({ length: ${FLASH_N} },
      () => ({ name: "闪", type: "response", suit: "♥" }));
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  if (e && e.hp > 0 && e.ai === "ruins_tank" && !e.usedRuinsTankShell && !e.ruinsTankShellReady &&
      window.state.battle.phase === 4 && window.state.battle.activeUid === e.uid) {
    const n = (e.hand || []).filter(c => c && !c._pendingDraw
      && window.CardUtils?.isEntitySingleKill?.(c)).length;
    if (n < 2) e.hand = [{ name: "杀", type: "kill", suit: "♠" },
                         { name: "杀", type: "kill", suit: "♥" }];
  }
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const setup = await page.evaluate(setupTpl);
  console.log(`构造: ${setup.enemy} 攻击=${setup.attack}`);
  console.log(`玩家方手牌=${JSON.stringify(setup.allyHand)} HP=${JSON.stringify(setup.allyHp)}`);
  console.log(`手动响应=${MANUAL ? "ON" : "OFF"}`);

  await page.locator("button", { hasText: "结束出牌" }).first().click();
  let last = null, loaded = false, fired = false, maxBadges = 0;
  let badgeWhileReady = 0, readySeen = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    await page.evaluate(tankForce);
    const st = await page.evaluate(peekTpl);
    last = st;
    // 记录装填成立（ruinsTankShellReady）期间的炮弹标记数量峰值
    if (st.tankReady) { readySeen = true; badgeWhileReady = Math.max(badgeWhileReady, st.shellBadges); }
    maxBadges = Math.max(maxBadges, st.shellBadges);
    const seen = (st.seen || []).join(" | ");
    if (seen.includes("装填坦克炮弹")) loaded = true;
    if (seen.includes("发射坦克炮弹")) fired = true;
    if (loaded && fired) {
      // 手动响应模式下需玩家确认弹窗才会真正打出闪完成抵消
      let clicks = 0;
      for (let k = 0; k < 6; k++) {
        const useBtn = page.locator("[data-manual-dodge-use]").first();
        if (await useBtn.count() && await useBtn.isVisible()) {
          await useBtn.click(); clicks++; await page.waitForTimeout(1200); continue;
        }
        break;
      }
      if (clicks) {
        await page.waitForTimeout(1500);
        last = await page.evaluate(peekTpl);
        maxBadges = Math.max(maxBadges, last.shellBadges || 0);
      }
      break;
    }
    try {
      const use = page.locator("[data-manual-dodge-use]").first();
      if (await use.count() && await use.isVisible()) { await use.click(); continue; }
    } catch (e) { /* 忽略 */ }
    try {
      const skip = page.locator("button", { hasText: "跳过榨取" }).first();
      if (await skip.count() && await skip.isVisible()) await skip.click();
    } catch (e) { /* 忽略 */ }
    try {
      const btn = page.locator("button", { hasText: "结束出牌" }).first();
      if (await btn.count() && await btn.isVisible()) await btn.click();
    } catch (e) { /* 非玩家回合，忽略 */ }
  }

  const seenText = ((last && last.seen) || []).join(" | ");
  console.log(`装填=${loaded} 发射=${fired}`);
  console.log(`发射后 HP=${JSON.stringify(last && last.allyHp)} 手牌=${JSON.stringify(last && last.allyHand)}`);
  console.log(`炮弹标记: 装填期峰值=${badgeWhileReady} 全场峰值=${maxBadges}`);
  if (!fired) {
    console.log(`[诊断] 未检测到发射 → locked=${last && last.locked}`
      + ` phase=${last && last.phase} activeUid=${last && last.activeUid}`
      + ` pendingTargetUid=${last && last.pendingTargetUid}`
      + ` manualDodge=${JSON.stringify(last && last.manualDodge)}`);
  }
  console.log(`战报尾部: ${seenText.slice(-400)}`);

  const checks = [];
  const check = (name, ok, extra) => {
    checks.push({ name, ok });
    console.log(`  ${ok ? "✅" : "❌"} ${name}${extra ? "  " + extra : ""}`);
  };
  const hp0 = (last && last.allyHp) || [];
  const firedLog = seenText.includes("发射坦克炮弹");
  check("装填成功", loaded);
  check("发射成功", fired && firedLog);
  const damaged = hp0.some(hp => hp < 200);
  const allFull = hp0.every(hp => hp === 200);

  const expectDodge = FLASH_N >= 2;
  console.log(`\n判定：闪=${FLASH_N} 张 → 期望${expectDodge ? "抵消（不掉血）" : "掉血"}`);
  check(`闪=${FLASH_N} 张时结果符合预期`, damageMatched(expectDodge, damaged, allFull),
    `HP=${JSON.stringify(hp0)}`);
  check("发射日志声明需2张闪", seenText.includes("需打出2张【闪】"), seenText.slice(-120));
  if (FLASH_N === 1) {
    check("1张闪时提示需要两张闪", seenText.includes("需要两张闪"));
  }
  if (FLASH_N >= 2) {
    check("2张闪时打出两张闪抵消", seenText.includes("两张闪"), seenText.slice(-160));
  }
  // 炮弹标记：装填成立后头像应显示，发射后消失
  check("装填期头像显示炮弹标记", readySeen && badgeWhileReady > 0,
    `ready=${readySeen} badges=${badgeWhileReady}`);
  check("无页面错误", errors.length === 0, errors[0] || "");

  const pass = checks.filter(c => c.ok).length;
  console.log(`\n汇总：${pass} 通过 / ${checks.length - pass} 失败`);
  await browser.close();
  process.exit(pass === checks.length ? 0 : 1);
})();

function damageMatched(expectDodge, damaged, allFull) {
  return expectDodge ? allFull : damaged;
}
