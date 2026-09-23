// 专项实战：废墟沙城掉落饰品 —— 推进器 / 智能大脑
// 推进器（被动）：根据你使用牌指定的目标数，你摸等量牌。
// 智能大脑（被动）：战术牌造成的伤害翻倍。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 把我方 0 号设为行动者，塞一张指定牌并真实打出
const playTpl = (relics, card, targetMode) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  a.intent = 5; a.battleRelics = ${JSON.stringify(relics)};
  a.hand = [${JSON.stringify(card)}];
  b.enemies.forEach(e => { e.hand = []; e.block = 0; e.hp = e.hp || 200; });
  st.log = [];
  window.render();
  const uid = ${targetMode === "none" ? "null" : `b.enemies[${FOE}].uid`};
  const ok = window.BattleSystem.playActiveCard(st, 0, uid);
  return { ok, allyHand: (a.hand || []).length };
})()`;

const peekTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  return {
    hand: (a.hand || []).filter(c => !c._pendingDraw).length,
    rawHand: (a.hand || []).length,
    thrusterDraw: (a.hand || []).filter(c => c._thrusterDraw).length,
    foeHp: b.enemies[${FOE}]?.hp ?? null,
    logs: (st.log || []).slice(0, 60).map(String),
  };
})()`;

const resetFoeTpl = hp => `(() => {
  const b = window.state.battle;
  const e = b.enemies[${FOE}];
  e.hp = ${hp}; e.block = 0; e.hand = [];
  window.render();
  return e.hp;
})()`;

const SINGLE_SLASH = { name: "杀", type: "slash", suit: "♠", scale: "attack" };
const SWEEP_TACTIC = { name: "枪林弹雨", type: "tactic", power: 1, hybridAttack: true,
  sweep: true, targetless: true, responseKind: "dodge", suit: "♠" };
const TACTIC = { name: "测试战术牌", type: "tactic", power: 2, suit: "♠" };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  // ===== 推进器：单体杀 → 摸 1 张 =====
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const s1 = await page.evaluate(playTpl(["推进器"], SINGLE_SLASH, "single"));
  await page.waitForTimeout(900);
  const r1 = await page.evaluate(peekTpl);
  const thrusterLog1 = (r1.logs || []).find(l => l.includes("推进器触发"));
  console.log("推进器·单体:", JSON.stringify(s1), "手牌", r1.hand, "|", thrusterLog1 || "无日志");
  T("推进器：打出牌成功", s1.ok, s1);
  T("推进器：单体目标摸 1 张（日志）", /摸1张/.test(thrusterLog1 || ""), { log: thrusterLog1 });
  // 摸到的牌在动画结算前带 _pendingDraw，visible 计数为 0，故看原始手牌数
  T("推进器：手牌确实摸到牌", r1.rawHand >= 1, r1);

  // ===== 推进器：群体战术牌 → 摸敌人数 =====
  await page.evaluate(playTpl(["推进器"], SWEEP_TACTIC, "none"));
  await page.waitForTimeout(900);
  const r2 = await page.evaluate(peekTpl);
  const foeCount = await page.evaluate(`(() => (window.state.battle.enemies || []).filter(e => e.hp > 0).length)()`);
  const thrusterLog2 = (r2.logs || []).find(l => l.includes("推进器触发"));
  console.log("推进器·群体:", "存活敌人", foeCount, "|", thrusterLog2 || "无日志");
  T("推进器：群体牌按存活敌人数摸牌",
    !!thrusterLog2 && thrusterLog2.includes(`摸${foeCount}张`), { log: thrusterLog2, foeCount });

  // ===== 推进器：未装备不触发（对照） =====
  await page.evaluate(playTpl([], SINGLE_SLASH, "single"));
  await page.waitForTimeout(900);
  const r3 = await page.evaluate(peekTpl);
  T("推进器：未装备时不触发", !(r3.logs || []).some(l => l.includes("推进器触发")),
    { logs: (r3.logs || []).filter(l => l.includes("推进器")) });

  // ===== 掉落来源：推进器由机械AI龙掉落（不再由贵族军士兵/狙击手掉落）=====
  const dropSrc = await page.evaluate(`(() => {
    const R = window.RelicSystem;
    return {
      dragon: R?.enemyRelics?.("mech_ai_dragon") || [],
      soldier: R?.enemyRelics?.("noble_soldier") || [],
      sniper: R?.enemyRelics?.("noble_sniper") || [],
      source: window.GameDataRuinsContent?.relics?.["推进器"]?.source || "",
    };
  })()`);
  console.log("掉落来源:", JSON.stringify(dropSrc));
  T("推进器：机械AI龙可掉落", (dropSrc.dragon || []).includes("推进器"), dropSrc);
  T("推进器：贵族军士兵不再掉落", !(dropSrc.soldier || []).includes("推进器"), dropSrc);
  T("推进器：贵族军狙击手不再掉落", !(dropSrc.sniper || []).includes("推进器"), dropSrc);
  T("推进器：图鉴来源显示机械AI龙", dropSrc.source === "机械AI龙", dropSrc);
  T("智能大脑：机械AI龙可掉落", (dropSrc.dragon || []).includes("智能大脑"), dropSrc);
  await page.close();

  // ===== 智能大脑：战术牌伤害翻倍 =====
  const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page2.on("pageerror", e => errors.push(String(e)));
  await openGame(page2);
  await startRegressionBattle(page2);
  // 基线：不装备
  await page2.evaluate(resetFoeTpl(300));
  await page2.evaluate(playTpl([], TACTIC, "single"));
  await page2.waitForTimeout(900);
  const base = await page2.evaluate(peekTpl);
  const baseLoss = 300 - base.foeHp;
  // 装备后
  await page2.evaluate(resetFoeTpl(300));
  await page2.evaluate(playTpl(["智能大脑"], TACTIC, "single"));
  await page2.waitForTimeout(900);
  const brained = await page2.evaluate(peekTpl);
  const brainLoss = 300 - brained.foeHp;
  const brainLog = (brained.logs || []).find(l => l.includes("智能大脑触发"));
  console.log("智能大脑: 基线伤害", baseLoss, "→ 装备后", brainLoss, "|", brainLog || "无日志");
  T("智能大脑：战术牌伤害翻倍", baseLoss > 0 && brainLoss === baseLoss * 2,
    { baseLoss, brainLoss });
  T("智能大脑：有触发日志", !!brainLog, { log: brainLog });
  T("智能大脑：未装备时不翻倍", !(base.logs || []).some(l => l.includes("智能大脑触发")),
    { logs: (base.logs || []).filter(l => l.includes("智能大脑")) });
  await page2.close();

  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
