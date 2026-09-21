// 专项实战：神速之翼（芙萝娅转换闪）对阵 梅尔卡坦克·坦克炮弹
// 当前预期：炮弹卡 responseKind="dodge"，但转换闪入口只判 isKillCard，
// 导致神速之翼对阵炮弹不触发（BUG）。
// 修复后应为：可用【闪】抵消的牌（杀 或 responseKind==="dodge"）均可触发转换闪。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// CARDS: 芙萝娅手牌里可转换的牌数量（全部为杀，无真实闪）
const CARDS = Number(process.env.CARDS || "2");

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
  // allies[0] = 芙萝娅，带神速之翼；手牌全为杀（无闪）
  const f = b.allies[0];
  // 注意：不改 ref —— 改为 flora 会在准备阶段触发"神速之袭"等待玩家操作而卡住
  f.name = "芙萝娅";
  f.skills = [{ name: "神速之翼", type: "passive", icon: "⭐",
    text: "锁定技，当你成为【杀】的目标时，你将1张手牌当【闪】使用。" }];
  f.hp = 200;
  f.stats = f.stats || {}; f.stats.handLimit = 99;
  f.hand = Array.from({ length: ${CARDS} },
    (_, i) => ({ name: "杀", type: "kill", suit: i % 2 ? "♥" : "♠" }));
  b.allies.forEach((u, idx) => {
    if (idx === 0) return;
    u.hand = [];
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  // 其他队友给足闪，保证不会因手牌为空在准备阶段卡住
  b.allies.forEach((u, idx) => {
    if (idx === 0) return;
    u.hand = Array.from({ length: 6 },
      () => ({ name: "闪", type: "response", suit: "♥" }));
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
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
  return { enemy: e.name, attack: e.stats.attack, flora: f.name,
    floraHand: (f.hand || []).map(c => c.name),
    floraHp: f.hp, skill: (f.skills || []).map(s => s.name).join(",") };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  const f = b.allies[0];
  return {
    tankReady: !!e.ruinsTankShellReady,
    tankUsed: !!e.usedRuinsTankShell,
    floraHp: f.hp,
    floraHand: (f.hand || []).map(c => c.name),
    locked: !!b.locked,
    phase: b.phase,
    activeUid: b.activeUid || null,
    awaiting: b.awaitingSpeedAssaultUid || b.awaitingJudgmentUid || null,
    turn: b.turn || 0,
    ended: !!b.ended || !!b.result,
    aliveAllies: (b.allies || []).filter(u => u.hp > 0).length,
    aliveEnemies: (b.enemies || []).filter(u => u.hp > 0).length,
    seen: (window.__seen || []).slice(-40),
  };
})()`;

const tankForce = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  b.enemies.forEach(u => { if (u !== e) u.hand = []; });
  // 坦克手牌恒为 2 张单体杀：装填前可装填，装填后无牌可打，避免打出机枪扫杀等干扰
  if (e && e.hp > 0 && !e.usedRuinsTankShell) {
    e.hand = [{ name: "杀", type: "kill", suit: "♠" },
              { name: "杀", type: "kill", suit: "♥" }];
  }
  const f = b.allies[0];
  if (f.hp > 0 && (f.hand || []).length < ${CARDS}) {
    f.hand = Array.from({ length: ${CARDS} },
      (_, i) => ({ name: "杀", type: "kill", suit: i % 2 ? "♥" : "♠" }));
  }
  f.stats = f.stats || {}; f.stats.handLimit = 99;
  b.allies.forEach((u, idx) => {
    if (idx === 0) return;
    u.hand = Array.from({ length: 6 },
      () => ({ name: "闪", type: "response", suit: "♥" }));
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const setup = await page.evaluate(setupTpl);
  console.log(`构造: 敌=${setup.enemy} 攻击=${setup.attack}`);
  console.log(`芙萝娅 技能=${setup.skill} HP=${setup.floraHp} 手牌=${JSON.stringify(setup.floraHand)}`);

  const pass = [], fail = [];
  const A = (name, ok, extra = "") => (ok ? pass : fail).push(name + (extra ? ` (${extra})` : ""));

  await page.locator("button", { hasText: "结束出牌" }).first().click();
  let last = null, loaded = false, fired = false;
  // 通用推进：玩家侧可能停在"结束出牌/确认弃置/跳过"等按钮上，自动点掉
  const advance = async () => {
    const texts = ["确认弃置", "结束出牌", "结束准备", "跳过", "确定"];
    for (const t of texts) {
      const btn = page.locator("button", { hasText: t }).first();
      try {
        if (await btn.count() && await btn.isVisible()) {
          await btn.click({ timeout: 1500 });
          await page.waitForTimeout(600);
          return true;
        }
      } catch (err) { /* 点击失败则尝试下一个文案 */ }
    }
    return false;
  };

  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000);
    await advance();
    await page.evaluate(tankForce);
    const st = await page.evaluate(peekTpl);
    last = st;
    const seen = (st.seen || []).join(" | ");
    if (seen.includes("装填坦克炮弹")) loaded = true;
    if (seen.includes("发射坦克炮弹")) fired = true;
    if (i % 30 === 0) {
      console.log(`  [${i}s] ready=${st.tankReady} used=${st.tankUsed} ` +
        `phase=${st.phase} active=${st.activeUid} locked=${st.locked} ` +
        `awaiting=${st.awaiting} turn=${st.turn} ` +
        `aliveA=${st.aliveAllies}/aliveE=${st.aliveEnemies} ` +
        `floraHp=${st.floraHp} fired=${fired}`);
    }
    if (loaded && fired) break;
  }

  // 取完整日志（__seen 自构造起全量累积），只在"发射"之后统计神速之翼
  const allLogs = await page.evaluate(`(() => window.__seen || [])()`);
  const fireIdx = allLogs.findIndex(t => String(t).includes("发射坦克炮弹"));
  const afterFire = fireIdx >= 0 ? allLogs.slice(fireIdx) : [];
  console.log(`\n装填=${loaded} 发射=${fired} 发射日志位置=${fireIdx}`);
  const wingHits = afterFire
    .filter(t => String(t).includes("发动神速之翼")).length;
  console.log(`神速之翼触发次数: ${wingHits}`);
  console.log(`芙萝娅 HP=${last && last.floraHp} 手牌=${JSON.stringify(last && last.floraHand)}`);
  console.log(`\n--- 发射后日志 ---`);
  afterFire.slice(0, 14).forEach(t => console.log(`  ${t}`));

  A("炮弹已装填并发射", loaded && fired);
  A("页面无错误", errors.length === 0, errors[0] || "");

  // 修复后预期：神速之翼对所有"需用【闪】抵消"的牌生效（含坦克炮弹），
  // 因此发射后应触发转化闪并完成抵消。
  // 注：芙萝娅可能被炮弹以外的攻击扣血，故以"炮弹是否对她造成伤害"为准，
  // 而非直接断言 HP === 200。
  const shellHitFlora = afterFire
    .some(t => String(t).includes("坦克炮弹对芙萝娅造成"));
  A("神速之翼对阵炮弹触发", wingHits >= 1, `触发${wingHits}次`);
  A("炮弹未对芙萝娅造成伤害（转换闪抵消）", !shellHitFlora,
    `HP=${last && last.floraHp}`);
  A("双闪抵消成立", afterFire
    .some(t => String(t).includes("自动使用两张闪")), "");

  console.log(`\n通过 ${pass.length} / 失败 ${fail.length}`);
  pass.forEach(t => console.log(`  ✅ ${t}`));
  fail.forEach(t => console.log(`  ❌ ${t}`));
  await browser.close();
  if (fail.length) process.exit(1);
})();
