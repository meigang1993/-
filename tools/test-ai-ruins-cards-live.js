// 实战回归：真实浏览器 + 真实点击结束回合 + 真实 AI 决策
// 覆盖两个已修 BUG：
//   1. 枪林弹雨（hybridAttack 战术牌）AI 原本完全不使用（tacticScore 无匹配分支 → 0 分）
//   2. 物资私分（allyTarget+excludeSelf）AI 原本把目标指定为自己，队友摸不到牌
// 注意：注入到 enemies[1]（机器魅魔）——实战中确认它会行动；enemies[0] 常不轮到。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const INJECT = `(cardName, opts) => {
  const b = window.state.battle;
  const src=[window.GameDataRuinsContent?.cards, window.GameData?.cardCodex, window.GameData?.cards];
  let card=null; for(const l of src){ if(Array.isArray(l)){ card=l.find(c=>c?.name===cardName); if(card) break; } }
  if(!card) return { missing:true };
  window.__log=[];
  const orig = window.BattleAI.choose;
  window.BattleAI.choose = function(bb, actor, canPlay){
    let r=null; try{ r=orig(bb,actor,canPlay); }catch(e){}
    window.__log.push({ actor:actor?.name, hand:(actor?.hand||[]).map(c=>c.name),
      move:r?.card?.name||null, score:r?.score??null });
    return r;
  };
  const e1 = b.enemies[1];
  e1.hand=[JSON.parse(JSON.stringify(card))];
  e1.stats.attack=3; e1.stats.magic=4;
  b.allies.forEach(u=>u.hand=[]);
  if (opts.blankPartner) b.enemies[0].hand=[];
  window.render();
  return { missing:false, injected:e1.name, partner:b.enemies[0].name,
           partnerHand:b.enemies[0].hand.length, allyHp:b.allies.map(u=>u.hp) };
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
  }));
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const chk = (n, ok, d) => results.push({ n, ok, d });

  // 场景1：枪林弹雨
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openGame(page); await startRegressionBattle(page);
    const before = await page.evaluate(`(${INJECT})("枪林弹雨", {})`);
    if (before.missing) chk("枪林弹雨：定位卡牌", false, "找不到定义");
    else {
      const after = await runEnemyTurn(page);
      const hit = after.log.find(l => l.move === "枪林弹雨");
      chk("枪林弹雨：AI 决策选中该卡", !!hit,
        hit ? `score=${hit.score}（=58+伤害8×目标2×2，修复前为0）` : `决策记录=${JSON.stringify(after.log.map(l=>l.move))}`);
      chk("枪林弹雨：AI 实际打出", !!hit && after.log[0]?.hand?.includes("枪林弹雨"),
        `首次决策时手牌=${JSON.stringify(after.log[0]?.hand || [])}`);
    }
    await page.close();
  }

  // 场景2：物资私分
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openGame(page); await startRegressionBattle(page);
    const before = await page.evaluate(`(${INJECT})("物资私分", { blankPartner: true })`);
    if (before.missing) chk("物资私分：定位卡牌", false, "找不到定义");
    else {
      const after = await runEnemyTurn(page);
      chk("物资私分：队友摸到3张（修复前为0）", after.partnerHand >= 3,
        `队友(${before.partner}) 摸牌前=${before.partnerHand} 后=${after.partnerHand}`);
      chk("物资私分：AI 决策选中该卡", (after.log || []).some(l => l.move === "物资私分"),
        `决策记录=${JSON.stringify(after.log.map(l=>l.move))}`);
    }
    await page.close();
  }

  console.log("\n===== 实战测试：AI 废墟沙城卡牌（真实浏览器） =====");
  let pass = 0;
  results.forEach(r => { console.log(`${r.ok ? "✅" : "❌"} ${r.n}\n     ${r.d}`); if (r.ok) pass++; });
  console.log(`\n===== ${pass}/${results.length} 通过 =====`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
