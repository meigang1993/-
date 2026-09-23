// 实战回归：真实浏览器 + 真实出牌流程
// 检查废墟沙城 5 张牌是否会触发【闪】响应窗口（state.battle.manualDodge）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const TARGETS = ["流星杀", "吸魔杀", "枪林弹雨", "拼杀", "魔之连杀"];

const injectTpl = cardName => `(() => {
  const cardName = ${JSON.stringify(cardName)};
  const b = window.state.battle;
  const src = [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex, window.GameData?.cards];
  let card = null;
  for (const l of src) { if (Array.isArray(l)) { card = l.find(c => c?.name === cardName); if (card) break; } }
  if (!card) return { missing: true };
  // 开启手动响应，玩家方（ally）才能弹出闪窗口
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = true;
  window.__log = [];
  const orig = window.BattleAI.choose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null; try { r = orig(bb, actor, canPlay); } catch (e) {}
    window.__log.push({ actor: actor?.name, move: r?.card?.name || null, score: r?.score ?? null });
    return r;
  };
  const e1 = b.enemies[1];
  e1.hand = [JSON.parse(JSON.stringify(card))];
  e1.stats.attack = 3; e1.stats.magic = 4;
  // 玩家手牌塞满【闪】，保证有可用响应牌
  b.allies.forEach(u => { u.hand = [{ name: "闪", type: "response", suit: "♥" }]; u.hp = 80; });
  b.enemies[0].hand = [];
  window.render();
  return { missing: false, enemy: e1.name };
})()`;

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for (const name of TARGETS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const inj = await page.evaluate(injectTpl(name));
      if (inj.missing) { results[name] = { err: "卡牌缺失" }; await page.close(); continue; }

      // 结束玩家出牌 → 轮到敌人行动
      await page.locator("button", { hasText: "结束出牌" }).first().click();
      let sawDodge = false, played = false;
      const dodgeCards = new Set();
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const st = await page.evaluate(() => ({
          dodge: !!window.state.battle?.manualDodge,
          dodgeCard: window.state.battle?.manualDodge?.card?.name || null,
          log: (window.__log || []).map(x => x.move),
          allyHp: window.state.battle.allies.map(u => u.hp),
          allyFlash: window.state.battle.allies.map(u => (u.hand || []).filter(c => c.name === "闪").length),
          allyCount: window.state.battle.allies.length,
          battleLog: (window.state.log || []).slice(0, 16),
        }));
        if (st.dodge) { sawDodge = true; if (st.dodgeCard) dodgeCards.add(st.dodgeCard); }
        if (st.log.includes(name)) { played = true; }
        // 目标牌打出后仍继续观察 8 秒，避免错过响应窗口
        if (sawDodge || (played && i > 20)) break;
      }
      const st = await page.evaluate(() => ({
        dodge: !!window.state.battle?.manualDodge,
        dodgeCard: window.state.battle?.manualDodge?.card?.name || null,
        log: (window.__log || []).map(x => x.move),
        allyHp: window.state.battle.allies.map(u => u.hp),
        allyFlash: window.state.battle.allies.map(u => (u.hand || []).filter(c => c.name === "闪").length),
        allyCount: window.state.battle.allies.length,
        battleLog: (window.state.log || []).slice(0, 16),
      }));
      results[name] = {
        played, flashWindow: st.dodge || sawDodge, dodgeCard: st.dodgeCard,
        log: st.log.slice(0, 6), allyHp: st.allyHp,
        allyFlash: st.allyFlash, allyCount: st.allyCount,
        battleLog: st.battleLog,
        dodgeCards: [...dodgeCards],
        errors: errors.length ? errors.slice(0, 2) : [],
      };
    } catch (e) {
      results[name] = { err: String(e).slice(0, 160) };
    }
    await page.close();
  }
  await browser.close();

  console.log("\n===== 实战：闪响应窗口 =====");
  Object.entries(results).forEach(([name, r]) => {
    if (r.err) { console.log(`  ${name.padEnd(6)} ❌ ${r.err}`); return; }
    console.log(`  ${name.padEnd(6)} 敌人打出=${r.played}  闪窗口=${r.flashWindow}  窗口牌=${r.dodgeCard || "-"}`);
    console.log(`         AI日志=${JSON.stringify(r.log)} 窗口牌集合=${JSON.stringify(r.dodgeCards || [])}`);
    console.log(`         我方HP=${JSON.stringify(r.allyHp)} 剩余闪=${JSON.stringify(r.allyFlash)} 我方人数=${r.allyCount}`);
    console.log(`         战报=${JSON.stringify(r.battleLog || [])}`);
    if (r.errors.length) console.log(`         页面错误=${r.errors.join(";")}`);
  });
  process.exit(0);
})();
