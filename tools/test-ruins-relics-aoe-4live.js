// 专项实战：推进器对 3 / 4 个目标的 AOE 牌是否按实际存活敌人数摸牌
// 推进器（被动）：根据你使用牌指定的目标数，你摸等量牌。
// 口径：群体/无目标牌按敌方存活数计（不含已阵亡者）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 打出一张群体牌；deadCount 表示先击杀几个敌人（用于验证"存活数"口径）
const playTpl = (relics, card, deadCount) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  a.intent = 5; a.battleRelics = ${JSON.stringify(relics)};
  a.hand = [${JSON.stringify(card)}];
  b.enemies.forEach((e, i) => {
    e.hand = []; e.block = 0;
    e.hp = i < ${deadCount} ? 0 : 200;
  });
  st.log = [];
  window.render();
  const ok = window.BattleSystem.playActiveCard(st, 0, null);
  return { ok, alive: b.enemies.filter(e => e.hp > 0).length };
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
const RAIN = { name: "枪林弹雨", type: "tactic", power: 1, hybridAttack: true,
  sweep: true, targetless: true, responseKind: "dodge", suit: "♦" };

const startBattleWith = async (page, enemyIds) => {
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(ids => {
    window.state.testEnemies = ids;
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  }, enemyIds);
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const b = window.state.battle;
    window.state.settings.battleSpeed = 1;
    b.animQueue = []; b.locked = false; b.phase = 4;
    b.activeUid = b.allies[0].uid;
    window.render();
    window.BattleEffects.recover(window.state);
  });
};

const runCase = async (browser, enemyIds, card, deadCount, label, errors) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await startBattleWith(page, enemyIds);
  const pre = await page.evaluate(playTpl(["推进器"], card, deadCount));
  await page.waitForTimeout(2000);
  const r = await page.evaluate(peekTpl);
  await page.close();
  return { ...r, aliveAtPlay: pre.alive, label };
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  const cases = [
    { ids: [0, 1, 2], card: MG_SWEEP, dead: 0, label: "3敌·机枪扫杀·全存活", want: 3 },
    { ids: [0, 1, 2, 3], card: MG_SWEEP, dead: 0, label: "4敌·机枪扫杀·全存活", want: 4 },
    { ids: [0, 1, 2, 3], card: RAIN, dead: 0, label: "4敌·枪林弹雨·全存活", want: 4 },
    { ids: [0, 1, 2, 3], card: MG_SWEEP, dead: 1, label: "4敌·机枪扫杀·1个已阵亡", want: 3 },
  ];

  const results = {};
  for (const c of cases) {
    const r = await runCase(browser, c.ids, c.card, c.dead, c.label, errors);
    results[c.label] = { ...r, want: c.want };
    const log = (r.logs || []).find(l => l.includes("推进器触发")) || "无";
    console.log(`\n--- ${c.label} ---`);
    console.log("  出牌时存活:", r.aliveAtPlay, "| 敌方HP:", JSON.stringify(r.foeHps),
      "| 我方手牌:", r.allyHand);
    console.log("  推进器日志:", log);
  }

  console.log("\n=== 断言 ===");
  for (const c of cases) {
    const r = results[c.label];
    const log = (r.logs || []).find(l => l.includes("推进器触发")) || "";
    T(`${c.label}：触发`, !!log, { logs: r.logs });
    T(`${c.label}：摸 ${c.want} 张（按存活数 ${c.want}）`,
      new RegExp(`摸${c.want}张`).test(log), { log, want: c.want });
    // AOE 确实覆盖所有存活敌人：
    // 机甲牛头怪自带【铁甲】判定（随机花色，命中♣则本次杀伤害被防止），
    // 所以"掉血数"可能少 1，需把这类"已判定但被防止"的情况计入覆盖。
    const hurt = r.foeHps.filter(h => h > 0 && h < 200).length;
    const prevented = (r.logs || []).filter(l => l.includes("防止本次杀造成的伤害")).length;
    T(`${c.label}：AOE 覆盖 ${c.want} 个存活敌人（掉血 ${hurt} + 被防止 ${prevented}）`,
      hurt + prevented >= c.want, { hps: r.foeHps, hurt, prevented, want: c.want });
  }

  console.log(`\n页面错误: ${errors.length}`);
  if (errors.length) errors.slice(0, 5).forEach(e => console.log("  " + e));
  await browser.close();
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total ? 0 : 1);
})();
