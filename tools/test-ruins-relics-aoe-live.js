// 专项实战：推进器 / 智能大脑 对 AOE（群体）牌是否生效
// 推进器：根据你使用牌指定的目标数摸等量牌（群体牌按存活敌人数计）
// 智能大脑：战术牌造成的伤害翻倍（含群体战术牌）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 我方 0 号行动，塞一张牌并真实打出
const playTpl = (relics, card, single) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  a.intent = 5; a.battleRelics = ${JSON.stringify(relics)};
  a.hand = [${JSON.stringify(card)}];
  b.enemies.forEach(e => { e.hand = []; e.block = 0; e.hp = 200; });
  st.log = [];
  window.render();
  const uid = ${single === true ? "b.enemies[0].uid" : "null"};
  const ok = window.BattleSystem.playActiveCard(st, 0, uid);
  return { ok, foeCount: b.enemies.filter(e => e.hp > 0).length };
})()`;

const peekTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  return {
    allyHand: (a.hand || []).length,
    foeHps: b.enemies.map(e => e.hp),
    logs: (st.log || []).slice(0, 80).map(String),
  };
})()`;

const MG_SWEEP = { name: "机枪扫杀", type: "slash", scale: "attack", sweep: true,
  targetless: true, responseKind: "dodge", suit: "♠" };
const METEOR = { name: "流星杀", type: "slash", scale: "magic", attackType: "magic",
  sweep: true, targetless: true, responseKind: "dodge", suit: "♥" };
const RAIN = { name: "枪林弹雨", type: "tactic", power: 1, hybridAttack: true,
  sweep: true, targetless: true, responseKind: "dodge", suit: "♦" };
const SINGLE_SLASH = { name: "杀", type: "slash", suit: "♠", scale: "attack" };

const runCase = async (browser, relics, card, label, errors, single) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(playTpl(relics, card, single));
  await page.waitForTimeout(1000);
  const r = await page.evaluate(peekTpl);
  await page.close();
  return { ...r, label };
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  const cases = [
    { relics: ["推进器"], card: MG_SWEEP, label: "推进器·机枪扫杀(AOE杀)" },
    { relics: ["推进器"], card: METEOR, label: "推进器·流星杀(AOE魔法杀)" },
    { relics: ["推进器"], card: RAIN, label: "推进器·枪林弹雨(AOE战术)" },
    { relics: [], card: MG_SWEEP, label: "对照·无推进器(AOE杀)" },
    { relics: ["推进器"], card: SINGLE_SLASH, label: "推进器·单体杀(对照)", single: true },
    { relics: ["智能大脑"], card: RAIN, label: "智能大脑·枪林弹雨(AOE战术)" },
    { relics: [], card: RAIN, label: "对照·无智能大脑(AOE战术)" },
  ];

  const results = {};
  for (const c of cases) {
    const r = await runCase(browser, c.relics, c.card, c.label, errors, !!c.single);
    results[c.label] = r;
    const thruster = (r.logs || []).find(l => l.includes("推进器触发"));
    console.log(`\n--- ${c.label} ---`);
    console.log("  存活敌人:", r.foeHps.filter(h => h > 0).length,
      "| 敌方HP:", JSON.stringify(r.foeHps), "| 我方手牌:", r.allyHand);
    console.log("  推进器日志:", thruster || "无");
  }

  console.log("\n=== 断言 ===");
  const sweepR = results["推进器·机枪扫杀(AOE杀)"];
  const meteorR = results["推进器·流星杀(AOE魔法杀)"];
  const rainR = results["推进器·枪林弹雨(AOE战术)"];
  const noneR = results["对照·无推进器(AOE杀)"];
  const singleR = results["推进器·单体杀(对照)"];

  const sweepLog = (sweepR.logs || []).find(l => l.includes("推进器触发")) || "";
  const meteorLog = (meteorR.logs || []).find(l => l.includes("推进器触发")) || "";
  const rainLog = (rainR.logs || []).find(l => l.includes("推进器触发")) || "";
  const singleLog = (singleR.logs || []).find(l => l.includes("推进器触发")) || "";

  T("推进器：AOE 杀（机枪扫杀）触发", !!sweepLog, { logs: sweepR.logs });
  T("推进器：AOE 杀按存活敌人数摸牌", /摸2张/.test(sweepLog), { log: sweepLog });
  T("推进器：AOE 魔法杀（流星杀）触发", !!meteorLog, { logs: meteorR.logs });
  T("推进器：AOE 魔法杀按存活敌人数摸牌", /摸2张/.test(meteorLog), { log: meteorLog });
  T("推进器：AOE 战术牌（枪林弹雨）触发", !!rainLog, { logs: rainR.logs });
  T("推进器：AOE 战术牌按存活敌人数摸牌", /摸2张/.test(rainLog), { log: rainLog });
  T("推进器：单体杀只摸 1 张", /摸1张/.test(singleLog), { log: singleLog });
  T("推进器：未装备时 AOE 不触发",
    !(noneR.logs || []).some(l => l.includes("推进器触发")), { logs: noneR.logs });

  const brainR = results["智能大脑·枪林弹雨(AOE战术)"];
  const brainBase = results["对照·无智能大脑(AOE战术)"];
  const brainLoss = 200 - brainR.foeHps[0], baseLoss = 200 - brainBase.foeHps[0];
  console.log("智能大脑·AOE战术: 基线", baseLoss, "→ 装备后", brainLoss);
  T("智能大脑：AOE 战术牌伤害翻倍", baseLoss > 0 && brainLoss === baseLoss * 2,
    { baseLoss, brainLoss });
  T("智能大脑：AOE 战术牌有触发日志",
    (brainR.logs || []).some(l => l.includes("智能大脑触发")), { logs: brainR.logs });
  T("智能大脑：未装备时不翻倍",
    !(brainBase.logs || []).some(l => l.includes("智能大脑触发")), { logs: brainBase.logs });

  // AOE 牌对所有敌人造成伤害（确认 AOE 真的打到 2 个目标，摸牌数才有意义）
  T("AOE 杀确实命中全部存活敌人",
    sweepR.foeHps.filter(h => h < 200).length === 2, { hps: sweepR.foeHps });

  console.log(`\n页面错误: ${errors.length}`);
  if (errors.length) errors.slice(0, 5).forEach(e => console.log("  " + e));
  await browser.close();
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total ? 0 : 1);
})();
