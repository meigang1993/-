// 手动模式下：剩余 6 张非响应类卡是否正常打出、不卡死、无报错
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));
const CARDS = ["拼杀", "魔之连杀", "物资私分", "魅惑术", "魅杀", "冰冻术"];
const inject = n => `(() => {
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = true;
  const find = x => { for (const l of [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex, window.GameData?.cards])
    if (Array.isArray(l)) { const c = l.find(y => y?.name === x); if (c) return JSON.parse(JSON.stringify(c)); } return null; };
  const card = find(${JSON.stringify(n)}); if (!card) return { missing: true };
  const e1 = b.enemies[1];
  e1.hand = [card]; e1.stats = e1.stats || {}; e1.stats.attack = 12; e1.stats.magic = 12;
  b.allies.forEach(u => { u.hand = [{ name: "杀", type: "slash", suit: "♠", power: 0, scale: "attack" },
    { name: "闪", type: "response", suit: "♥" }]; u.hp = 90; u.stats = u.stats || {}; u.stats.handLimit = 99; });
  b.enemies[0].hand = []; window.render(); return { missing: false };
})()`;
const snap = () => `(() => { const b = window.state.battle; const all = (window.state.log||[]).join("|");
  return { played: all.includes(${JSON.stringify("USED")}) || false, log: (window.state.log||[]).slice(0,8),
    stalled: !b, allyHp: b ? b.allies.map(u => u.hp) : [] }; })()`;
(async () => {
  const browser = await chromium.launch(); let pass = 0, fail = 0;
  for (const name of CARDS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page); await startRegressionBattle(page);
      const inj = await page.evaluate(inject(name));
      if (inj.missing) { console.log(`  ❌ ${name} 卡牌缺失`); fail++; await page.close(); continue; }
      await page.locator("button", { hasText: "结束出牌" }).first().click();
      let hit = false;
      for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(700);
        const st = await page.evaluate(`(() => { const all=(window.state.log||[]).join("|");
          return { hit: all.includes(${JSON.stringify(name)}), head:(window.state.log||[]).slice(0,8),
            hp: window.state.battle ? window.state.battle.allies.map(u=>u.hp) : [] }; })()`);
        if (st.hit) { hit = true; console.log(`  ✅ ${name} 已打出  HP=${JSON.stringify(st.hp)}`);
          console.log(`      战报=${JSON.stringify(st.head.slice(0,4))}`); break; }
      }
      if (!hit) { console.log(`  ❌ ${name} 未打出（可能卡死）`); fail++; }
      else if (errors.length) { console.log(`      ⚠️ 有报错: ${errors[0].slice(0,120)}`); fail++; }
      else pass++;
    } catch (e) { console.log(`  ❌ ${name} ${String(e).slice(0,120)}`); fail++; }
    await page.close();
  }
  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(0);
})();
