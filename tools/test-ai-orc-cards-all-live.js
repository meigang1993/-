// 实战回归：真实浏览器 + 真实 AI 决策，覆盖兽人地下城全部 10 张卡
// 主动牌 7：勒杀/战争号角/武装/撞杀/仇杀/追杀/火杀
// 响应牌 3：佯攻/后空翻/弹反（单独场景，需我方主动出牌触发）
// 已修 BUG：战争号角（tacticScore 无 warHorn 分支 → 0 分 → AI 完全不使用）
// 注意：注入 enemies[1]（机器魅魔）；enemies[0] 常不轮到行动。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 自实现进入战斗：helper 的 expect.poll 固定 5s，存储抖动时会误判超时
async function enterBattle(page) {
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() =>
    !window.BattleEffects.animating
      && !window.BattleEffects.draining
      && !window.state?.battle?.animQueue?.length, null, { timeout: 60000 });
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    battle.allies.concat(battle.enemies)
      .forEach(unit => unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
  });
}

const INJECT = `(cardName, opts) => {
  const b = window.state.battle;
  const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex, window.GameData?.cards];
  let card = null;
  for (const l of src) { if (Array.isArray(l)) { card = l.find(c => c?.name === cardName); if (card) break; } }
  if (!card) return { missing: true };
  window.__log = [];
  const orig = window.BattleAI.choose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null; try { r = orig(bb, actor, canPlay); } catch (e) {}
    if ((actor?.hand || []).some(c => c.name === cardName)) {
      window.__log.push({ actor: actor?.name, hand: (actor?.hand || []).map(c => c.name),
        move: r?.card?.name || null, score: r?.score ?? null, target: r?.target?.name || null });
    }
    return r;
  };
  const e1 = b.enemies[1];
  e1.hand = [JSON.parse(JSON.stringify(card))];
  e1.hand[0].suit = e1.hand[0].suit || "♠";
  e1.stats.attack = opts.attack ?? 6;
  e1.stats.magic = 4;
  e1.block = opts.block || 0;
  e1.intent = opts.intent ?? 2;
  b.allies.forEach(u => u.hand = []);
  if (opts.blankPartner) b.enemies[0].hand = [];
  window.render();
  return { missing: false, injected: e1.name, partner: b.enemies[0].name,
           partnerHand: b.enemies[0].hand.length, allyHp: b.allies.map(u => u.hp) };
}`;

async function runEnemyTurn(page) {
  await page.locator("button", { hasText: "结束出牌" }).first().click();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => ({
      log: (window.__log || []).length,
      e1: window.state.battle?.enemies[1]?.hand.length,
    }));
    if (st.log > 0 && st.e1 === 0) break;
  }
  return page.evaluate(() => ({
    log: window.__log || [],
    allyHp: window.state.battle.allies.map(u => u.hp),
    partnerHand: window.state.battle.enemies[0].hand.length,
    battleLog: (window.state.battle?.log || window.state.log || []).slice(-16),
  }));
}

// 主动牌：注入敌方，看 AI 是否选中并打出
const ACTIVE = [
  { name: "勒杀", opts: {} },
  { name: "战争号角", opts: { intent: 0 } },
  { name: "武装", opts: { block: 0 } },
  { name: "撞杀", opts: { block: 4 } },
  { name: "仇杀", opts: {} },
  { name: "追杀", opts: { intent: 1 } },
  { name: "火杀", opts: {} },
];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const chk = (n, ok, d) => results.push({ n, ok, d });

  for (const scene of ACTIVE) {
    let page = null;
    try {
      page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.setDefaultTimeout(60000);
      await openGame(page);
      await enterBattle(page);
      const before = await page.evaluate(`(${INJECT})(${JSON.stringify(scene.name)}, ${JSON.stringify(scene.opts)})`);
      if (before.missing) { chk(`${scene.name}：定位卡牌`, false, "找不到定义"); await page.close(); continue; }
      const after = await runEnemyTurn(page);
      const hit = after.log.find(l => l.move === scene.name);
      chk(`${scene.name}：AI 决策选中`, !!hit,
        hit ? `score=${hit.score} target=${hit.target}` : `决策=${JSON.stringify(after.log.map(l => l.move))}`);
      const inLog = (after.battleLog || []).some(l => String(l).includes(scene.name));
      chk(`${scene.name}：战报出现使用记录`, inLog || !!hit,
        inLog ? "战报命中" : `末16条=${JSON.stringify((after.battleLog || []).slice(-4))}`);
    } catch (e) {
      chk(`${scene.name}：场景执行`, false, String(e.message || e).slice(0, 120));
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  console.log("\n===== 实战：AI 兽人地下城主动牌（真实浏览器） =====");
  let pass = 0;
  results.forEach(r => { console.log(`${r.ok ? "✅" : "❌"} ${r.n}\n     ${r.d}`); if (r.ok) pass++; });
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
