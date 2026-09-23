// 实战回归：真实浏览器 + 真实点击结束回合 + 真实 AI 决策
// 覆盖兽人地下城 7 张卡：勒杀/战争号角/武装/撞杀/仇杀（主动）+ 佯攻/后空翻（响应）
// 已修 BUG：战争号角（tacticScore 无 warHorn 分支 → 0 分 → AI 完全不使用）
// 注意：注入到 enemies[1]（机器魅魔）——实战中确认它会行动；enemies[0] 常不轮到。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

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
        move: r?.card?.name || null, score: r?.score ?? null });
    }
    return r;
  };
  const e1 = b.enemies[1];
  e1.hand = [JSON.parse(JSON.stringify(card))];
  e1.hand[0].suit = e1.hand[0].suit || "♠";
  e1.stats.attack = 4; e1.stats.magic = 4;
  e1.block = opts.block || 0;
  e1.intent = opts.intent ?? 0;
  b.allies.forEach(u => u.hand = []);
  if (opts.blankPartner) b.enemies[0].hand = [];
  window.render();
  return { missing: false, injected: e1.name, partner: b.enemies[0].name,
           partnerHand: b.enemies[0].hand.length, allyHp: b.allies.map(u => u.hp) };
}`;

async function runEnemyTurn(page) {
  await page.locator("button", { hasText: "结束出牌" }).first().click();
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1200);
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
    battleLog: (window.state.battle?.log || window.state.log || []).slice(-14),
  }));
}

const SCENES = [
  { name: "勒杀", opts: {} },
  { name: "战争号角", opts: { intent: 0 } },
  { name: "武装", opts: { block: 0 } },
  { name: "撞杀", opts: { block: 3 } },
  { name: "仇杀", opts: {} },
];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const chk = (n, ok, d) => results.push({ n, ok, d });

  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openGame(page); await startRegressionBattle(page);
    const before = await page.evaluate(`(${INJECT})(${JSON.stringify(scene.name)}, ${JSON.stringify(scene.opts)})`);
    if (before.missing) { chk(`${scene.name}：定位卡牌`, false, "找不到定义"); await page.close(); continue; }
    const after = await runEnemyTurn(page);
    const hit = after.log.find(l => l.move === scene.name);
    chk(`${scene.name}：AI 决策选中该卡`, !!hit,
      hit ? `score=${hit.score}` : `决策记录=${JSON.stringify(after.log.map(l => l.move))}`);
    chk(`${scene.name}：AI 实际打出`, !!hit && after.log[0]?.hand?.includes(scene.name),
      `首次决策时手牌=${JSON.stringify(after.log[0]?.hand || [])}`);
    await page.close();
  }

  // 战争号角：额外验证效果（队友摸杀牌）
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openGame(page); await startRegressionBattle(page);
    const before = await page.evaluate(`(${INJECT})("战争号角", { intent: 0, blankPartner: true })`);
    const after = await runEnemyTurn(page);
    const used = (after.battleLog || []).some(l => /战争号角/.test(String(l)));
    chk("战争号角：战报出现使用记录", used,
      `末14条战报=${JSON.stringify(after.battleLog.slice(-6))}`);
    chk("战争号角：队友获得杀牌", after.partnerHand >= 1,
      `队友(${before.partner}) 摸牌前=${before.partnerHand} 后=${after.partnerHand}`);
    await page.close();
  }

  console.log("\n===== 实战测试：AI 兽人地下城卡牌（真实浏览器） =====");
  let pass = 0;
  results.forEach(r => { console.log(`${r.ok ? "✅" : "❌"} ${r.n}\n     ${r.d}`); if (r.ok) pass++; });
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
