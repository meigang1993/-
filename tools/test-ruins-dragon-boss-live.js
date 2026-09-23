// 专项实战：废墟沙城领主 机械AI龙（真实浏览器 + 真实回合）
// 覆盖：电钻火花（骰子追加攻击次数 + 骰子弹窗）/ 机尾机枪（受击次数达手牌数 → 虚拟机枪扫杀 + 等量护甲）
//       / 死亡音波（结束阶段记录花色 + 头像显示 + 未使用该花色受伤）/ AI 出牌阶段优先单体杀
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const DRAGON = 1; // enemies[1]

// ---------- 场景1：电钻火花 ----------
const drillTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${DRAGON}];
  e.ai = "ruins_dragon"; e.name = "机械AI龙";
  e.stats = e.stats || {}; e.stats.attack = 13; e.stats.magic = 8; e.stats.speed = 15;
  e.hp = 342; e.intent = 1;
  e.hand = [{ name: "杀", type: "kill", suit: "♠" }, { name: "杀", type: "kill", suit: "♥" }];
  b.allies.forEach(u => { u.hand = []; u.hp = 300; u.stats = u.stats || {}; u.stats.handLimit = 99; });
  b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
  window.__log = []; window.__diceSeen = null; window.__diceDomSeen = false;
  if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
  const orig = window.__origChoose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null;
    // 确定性注入：强制先打一张实体单体杀，确保电钻火花必然触发
    if (actor?.ai === "ruins_dragon" && !window.__dragonKillDone) {
      let kill = (actor.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c));
      if (!kill) { kill = { name: "杀", type: "kill", suit: "♠" }; actor.hand.push(kill); }
      r = { card: kill, target: (bb.allies || [])[0], score: 999 };
      window.__dragonKillDone = true;
    }
    if (!r) { try { r = orig(bb, actor, canPlay); } catch (err) {} }
    window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
    return r;
  };
  window.render();
  return { enemy: e.name, hp: e.hp };
})()`;

// ---------- 场景1b：杀被【闪】抵消时不应发动电钻火花 ----------
// 描述为「造成伤害时」，被响应抵消（未造成生命值伤害）就不得摇骰追加次数。
const drillBlockTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${DRAGON}];
  e.ai = "ruins_dragon"; e.name = "机械AI龙";
  e.stats = e.stats || {}; e.stats.attack = 13;
  e.hp = 342; e.intent = 1;
  e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
  // 我方手牌全部为【闪】→ 龙的杀必定被自动响应抵消，hpLoss 恒为 0
  b.allies.forEach(u => { u.hp = 300; u.stats = u.stats || {}; u.stats.handLimit = 99;
    u.hand = [1, 2, 3, 4].map(() => ({ name: "闪", type: "response", suit: "♥" })); });
  b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
  window.__log = [];
  if (!window.__origChoose) window.__origChoose = window.BattleAI.choose;
  const orig = window.__origChoose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null;
    if (actor?.ai === "ruins_dragon" && !window.__dragonKillDone2) {
      let kill = (actor.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c));
      if (!kill) { kill = { name: "杀", type: "kill", suit: "♠" }; actor.hand.push(kill); }
      r = { card: kill, target: (bb.allies || [])[0], score: 999 };
      window.__dragonKillDone2 = true;
    }
    if (!r) { try { r = orig(bb, actor, canPlay); } catch (err) {} }
    return r;
  };
  window.state.log = [];
  window.render();
  return { enemy: e.name };
})()`;

// ---------- 场景2：机尾机枪 ----------
const gunTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${DRAGON}];
  e.ai = "ruins_dragon"; e.name = "机械AI龙";
  e.stats = e.stats || {}; e.stats.attack = 13;
  e.hp = 342; e.block = 0; e.ruinsHitsThisTurn = 0; e.ruinsGunFired = false;
  // 手牌 1 张 → 阈值 1，被【杀】命中 1 次即发动
  // 手牌给非响应牌：否则龙自动用闪抵消，hpLoss=0 不会计受击次数
  e.hand = [{ name: "杀", type: "slash", suit: "♦" }];
  b.allies.forEach(u => {
    u.hp = 300; u.stats = u.stats || {}; u.stats.handLimit = 99;
    u.hand = [{ name: "杀", type: "kill", suit: "♠" }];
  });
  b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
  window.__log = [];
  window.render();
  return { enemy: e.name, dragonHand: e.hand.length };
})()`;

// 我方真实打出一张单体杀命中龙：点手牌 → 点龙作为目标（走真实出牌与伤害链路）
async function allyHitDragon(page) {
  await page.evaluate(`(() => { const st = window.state, b = st.battle;
    b.activeUid = b.allies[0].uid; b.phase = 4; b.locked = false;
    b.allies.forEach(u => { u.intent = 3; });
    b.allies[0].hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
    window.render();
    return true; })()`);
  const uid = await page.evaluate(`(() => window.state.battle.enemies[${DRAGON}]?.uid ?? null)()`);
  const played = await page.evaluate(`(() => {
    const st = window.state;
    return window.BattleSystem.playActiveCard(st, 0, "${uid}");
  })()`);
  if (!played) return { ok: false };
  await page.waitForTimeout(600);
  return await page.evaluate(`(() => { const e = window.state.battle.enemies[${DRAGON}];
    return { ok: true, dragonHp: e.hp, dragonBlock: e.block || 0, hits: e.ruinsHitsThisTurn || 0 }; })()`);
}

// ---------- 场景3：死亡音波 ----------
const waveTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${DRAGON}];
  e.ai = "ruins_dragon"; e.name = "机械AI龙";
  e.stats = e.stats || {}; e.stats.attack = 13;
  e.hp = 342; e.ruinsDeathWaveSuits = []; e.ruinsDeathWaveSuit = null;
  // 手中 ♠×2、♥×1、♦×1 → 结束阶段应记录 3 种花色（按张数降序 ♠→♥→♦）
  e.hand = [{ name: "杀", type: "kill", suit: "♠" }, { name: "杀", type: "kill", suit: "♠" },
            { name: "闪", type: "response", suit: "♥" }, { name: "闪", type: "response", suit: "♦" }];
  b.allies.forEach(u => {
    u.hp = 300; u.stats = u.stats || {}; u.stats.handLimit = 99;
    // 只给 ♥，回合内用不出 ♠ → 结束应受音波伤害
    u.hand = [{ name: "闪", type: "response", suit: "♥" }];
    u.suitsUsedThisTurn = {};
  });
  b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
  window.__log = []; window.__waveDomSeen = false;
  window.render();
  return { enemy: e.name, suits: e.ruinsDeathWaveSuits };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${DRAGON}];
  return {
    log: (window.__log || []).map(x => \`\${x.actor}:\${x.move}\`),
    battleLog: (window.state.log || []).slice(0, 120).map(String),
    dice: window.state.battle.dice ? window.state.battle.dice.value : null,
    diceDom: !!document.querySelector(".dice-popup"),
    waveSuits: Array.isArray(e?.ruinsDeathWaveSuits)
      ? e.ruinsDeathWaveSuits
      : (e?.ruinsDeathWaveSuit ? [e.ruinsDeathWaveSuit] : []),
    waveDom: !!document.querySelector(".death-wave-badge"),
    dragonBlock: e?.block || 0,
    hits: e?.ruinsHitsThisTurn || 0,
    gunFired: !!e?.ruinsGunFired,
    allyHp: b.allies.map(u => u.hp),
  };
})()`;

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

async function watch(page, seenTarget, rounds, clickEnd = false) {
  const seen = { drill: false, diceData: false, diceDom: false, gun: false, armor: false,
    waveRecord: false, waveDom: false, waveHit: false };
  for (let i = 0; i < rounds; i++) {
    await page.waitForTimeout(800);
    if (clickEnd) {
      // 我方回合会停在等待出牌输入，不点"结束出牌"就永远走不到结束阶段
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* 忽略 */ }
    }
    const st = await page.evaluate(peekTpl);
    const logs = st.battleLog || [];
    if (logs.some(l => l.includes("发动电钻火花"))) seen.drill = true;
    if (st.dice != null) seen.diceData = true;
    if (st.diceDom) seen.diceDom = true;
    if (logs.some(l => l.includes("发动机尾机枪"))) seen.gun = true;
    if (st.dragonBlock > 0) seen.armor = true;
    if ((st.waveSuits || []).length) seen.waveRecord = true;
    if (st.waveDom) seen.waveDom = true;
    if (logs.some(l => l.includes("死亡音波") && l.includes("伤害"))) seen.waveHit = true;
    if (seenTarget(seen, st)) break;
  }
  return seen;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  // ===== 场景1：电钻火花 =====
  await openGame(page);
  await startRegressionBattle(page);
  const s1 = await page.evaluate(drillTpl);
  console.log("场景1 初始化:", JSON.stringify(s1));
  await page.locator("button", { hasText: "结束出牌" }).first().click();
  const seen1 = await watch(page, s => s.drill && s.diceData && s.diceDom, 20);
  console.log("场景1 seen:", JSON.stringify(seen1));
  T("电钻火花触发（日志含骰子点数）", seen1.drill, seen1);
  T("骰子弹窗已显示（DOM .dice-popup）", seen1.diceDom, seen1);
  T("骰子数据进入 battle.dice", seen1.diceData, seen1);
  await page.close();

  // ===== 场景1b：杀被【闪】抵消 → 不发动电钻火花 =====
  const page1b = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page1b.on("pageerror", e => errors.push(String(e)));
  await openGame(page1b);
  await startRegressionBattle(page1b);
  await page1b.evaluate(drillBlockTpl);
  await page1b.locator("button", { hasText: "结束出牌" }).first().click();
  // 不做提前 break：要看的是「全程都没出现电钻火花」
  await watch(page1b, () => false, 10);
  const fin1b = await page1b.evaluate(peekTpl);
  const logs1b = fin1b.battleLog || [];
  T("杀被【闪】抵消 → 不发动电钻火花",
    !logs1b.some(l => l.includes("发动电钻火花")), { logs: logs1b.slice(0, 12) });
  T("抵消确实发生（日志含【闪】响应）",
    logs1b.some(l => l.includes("闪")), { logs: logs1b.slice(0, 12) });
  await page1b.close();

  // ===== 场景2：机尾机枪 =====
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page2.on("pageerror", e => errors.push(String(e)));
  await openGame(page2);
  await startRegressionBattle(page2);
  const s2 = await page2.evaluate(gunTpl);
  console.log("场景2 初始化:", JSON.stringify(s2));
  const hit = await allyHitDragon(page2);
  console.log("场景2 我方出杀:", JSON.stringify(hit));
  const seen2 = await watch(page2, s => s.gun && s.armor, 12);
  console.log("场景2 seen:", JSON.stringify(seen2));
  T("龙受击计数累加", hit.hits >= 1, hit);
  T("机尾机枪发动", seen2.gun, seen2);
  T("按伤害获得等量护甲", seen2.armor, seen2);
  await page2.close();

  // ===== 场景3：死亡音波 =====
  const page3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page3.on("pageerror", e => errors.push(String(e)));
  await openGame(page3);
  await startRegressionBattle(page3);
  const s3 = await page3.evaluate(waveTpl);
  console.log("场景3 初始化:", JSON.stringify(s3));
  for (let i = 0; i < 20; i++) {
    await page3.waitForTimeout(800);
    try {
      const btn = page3.locator("button", { hasText: "结束出牌" }).first();
      if (await btn.count() && await btn.isVisible()) await btn.click();
    } catch (e) { /* 忽略 */ }
    const st = await page3.evaluate(peekTpl);
    if ((st.waveSuits || []).length && st.waveDom) break;
  }
  const seen3 = await watch(page3, s => s.waveRecord && s.waveDom, 20, true);
  console.log("场景3 seen:", JSON.stringify(seen3));
  const fin = await page3.evaluate(peekTpl);
  T("结束阶段记录花色（1-3 种且均为合法花色）",
    fin.waveSuits.length >= 1 && fin.waveSuits.length <= 3
    && fin.waveSuits.every(s => ["♥", "♦", "♠", "♣"].includes(s)), fin);
  T("头像显示记录的花色（.death-wave-badge）", seen3.waveDom || fin.waveDom, seen3);
  await page3.close();

  // ===== 场景3b：死亡音波伤害（独立战斗，开局即锁定花色）=====
  // 在已推进过的战斗里补锁花色会错过我方回合窗口（我方可能刚结束回合），
  // 因此另起一场：开局记录花色固定 ♠，我方手牌固定 ♥ 用不出 ♠，
  // "未使用记录花色"成为确定性场景。
  const page3b = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page3b.on("pageerror", e => errors.push(String(e)));
  await openGame(page3b);
  await startRegressionBattle(page3b);
  await page3b.evaluate(`(() => {
    const b = window.state.battle;
    const e = b.enemies[${DRAGON}];
    e.ai = "ruins_dragon"; e.name = "机械AI龙";
    e.stats = e.stats || {}; e.stats.attack = 13;
    e.hp = 342; e.ruinsDeathWaveSuit = "♠";
    e.hand = [{ name: "杀", type: "kill", suit: "♠" }];
    b.allies.forEach(u => { u.hp = 300; u.stats = u.stats || {}; u.stats.handLimit = 99;
      u.hand = [{ name: "闪", type: "response", suit: "♥" }]; u.suitsUsedThisTurn = {}; });
    b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
    window.state.log = [];
    window.render();
    return true;
  })()`);
  const seen3b = await watch(page3b, s => s.waveHit, 20, true);
  console.log("场景3b seen:", JSON.stringify(seen3b));
  T("我方未使用记录花色 → 回合结束受伤", seen3b.waveHit, seen3b);
  await page3b.close();

  // ===== 场景4：AI 优先单体杀 =====
  const page4 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page4.on("pageerror", e => errors.push(String(e)));
  await openGame(page4);
  await startRegressionBattle(page4);
  const s4 = await page4.evaluate(`(() => {
    const b = window.state.battle;
    const e = b.enemies[${DRAGON}];
    e.ai = "ruins_dragon"; e.name = "机械AI龙";
    e.stats = e.stats || {}; e.stats.attack = 13; e.hp = 342; e.intent = 1;
    e.hand = [{ name: "战术牌", type: "tactic", suit: "♣" }, { name: "杀", type: "kill", suit: "♠" }];
    b.allies.forEach(u => { u.hp = 300; u.stats = u.stats || {}; u.stats.handLimit = 99; });
    b.enemies.forEach((u, i) => { if (i !== ${DRAGON}) u.hand = []; });
    window.render();
    const move = window.BattleAI.choose(b, e, () => true);
    return { move: move?.card?.name ?? null };
  })()`);
  console.log("场景4 AI 首选:", JSON.stringify(s4));
  T("AI 出牌阶段优先单体杀", s4.move === "杀", s4);
  await page4.close();

  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
