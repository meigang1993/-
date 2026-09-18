// 实战：检查【枪林弹雨】能否被【看破】响应使其失效
// 判定依据：出牌后是否出现 state.battle.manualCounter，以及战报是否出现"失效"
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const injectTpl = cardName => `(() => {
  const cardName = ${JSON.stringify(cardName)};
  const b = window.state.battle;
  const src = [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex, window.GameData?.cards];
  let card = null;
  for (const l of src) { if (Array.isArray(l)) { card = l.find(c => c?.name === cardName); if (card) break; } }
  if (!card) return { missing: true };
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = true;
  window.__log = [];
  const orig = window.BattleAI.choose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null; try { r = orig(bb, actor, canPlay); } catch (e) {}
    window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
    return r;
  };
  const e1 = b.enemies[1];
  e1.hand = [JSON.parse(JSON.stringify(card))];
  e1.stats.attack = 3; e1.stats.magic = 4;
  // 玩家手牌塞满【看破】
  b.allies.forEach(u => { u.hand = [{ name: "看破", type: "response", counterTactic: true, suit: "♥" }]; u.hp = 80; });
  b.enemies[0].hand = [];
  window.render();
  return { missing: false, enemy: e1.name };
})()`;

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const name of ["枪林弹雨", "魔王军入侵"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const inj = await page.evaluate(injectTpl(name));
      if (inj.missing) { out[name] = { err: "卡牌缺失" }; await page.close(); continue; }
      await page.locator("button", { hasText: "结束出牌" }).first().click();
      let sawCounter = false;
      const counterCards = new Set();
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const st = await page.evaluate(() => ({
          counter: !!window.state.battle?.manualCounter,
          counterCard: window.state.battle?.manualCounter?.card?.name || null,
        }));
        if (st.counter) { sawCounter = true; if (st.counterCard) counterCards.add(st.counterCard); }
        if (sawCounter || i > 24) break;
      }
      const st = await page.evaluate(() => ({
        log: (window.state.log || []).slice(0, 20),
        allyHp: window.state.battle.allies.map(u => u.hp),
      }));
      out[name] = {
        counterWindow: sawCounter, counterCards: [...counterCards],
        log: st.log, allyHp: st.allyHp,
        errors: errors.length ? errors.slice(0, 2) : [],
      };
    } catch (e) { out[name] = { err: String(e).slice(0, 160) }; }
    await page.close();
  }
  await browser.close();
  console.log("\n===== 实战：看破响应 =====");
  Object.entries(out).forEach(([name, r]) => {
    if (r.err) { console.log(`  ${name} ❌ ${r.err}`); return; }
    console.log(`  ${name.padEnd(6)} 看破窗口=${r.counterWindow} 窗口牌=${JSON.stringify(r.counterCards)}`);
    console.log(`         我方HP=${JSON.stringify(r.allyHp)}`);
    console.log(`         战报=${JSON.stringify(r.log.slice(0, 12))}`);
    if (r.errors.length) console.log(`         页面错误=${r.errors.join(";")}`);
  });
  process.exit(0);
})();
