// 实战：地雷 × 「使用闪」/「打出杀」两条响应路径 × 自动/手动模式
// 三国杀口径：闪=使用，杀作为响应=打出。规则要求两者都触发地雷。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// responseKind: dodge -> 使用闪 ; slash -> 打出杀
const CASES = [
  { name: "流星杀", kind: "dodge", verb: "使用", label: "闪" },
  { name: "魔王军入侵", kind: "slash", verb: "打出", label: "杀" },
];
const MODES = ["auto", "manual"];

const inject = (cardName, mode) => `(() => {
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = ${mode === "manual"};
  const findCard = n => {
    const src = [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex,
                 window.GameData?.cards, window.GameData?.allCards];
    for (const l of src) { if (Array.isArray(l)) { const c = l.find(x => x?.name === n); if (c) return JSON.parse(JSON.stringify(c)); } }
    return null;
  };
  const card = findCard(${JSON.stringify(cardName)});
  if (!card) return { missing: true };
  const e1 = b.enemies[1];
  e1.hand = [card];
  e1.stats = e1.stats || {}; e1.stats.attack = 11; e1.stats.magic = 11;
  const reg = window.BattleStatusCards;
  b.allies.forEach(u => {
    const mine = reg?.create?.("landmine", e1);
    u.hand = [mine, { name: "闪", type: "response", suit: "♥", responseKind: "dodge" },
              { name: "杀", type: "slash", suit: "♠", power: 0, scale: "attack" }]
             .filter(Boolean);
    u.hp = 90; u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  window.__mineBefore = b.allies.map(u => (u.hand||[]).filter(c => c?.landmine).length);
  window.render();
  return { missing: false, mineBefore: window.__mineBefore,
           landmineAttack: b.allies[0]?.hand?.find(c => c?.landmine)?.landmineAttack || 0 };
})()`;

const snapshot = () => `(() => {
  const b = window.state.battle;
  const all = (window.state.log || []).join("|");
  return {
    manualDodge: !!b?.manualDodge,
    manualCounter: !!b?.manualCounter,
    triggered: all.includes("地雷触发"),
    verbUse: /自动使用闪|可以手动选择是否使用闪|使用闪/.test(all),
    verbPlay: /自动打出杀|可以手动选择是否打出杀|打出杀/.test(all),
    mineNow: b.allies.map(u => (u.hand||[]).filter(c => c?.landmine).length),
    allyHp: b.allies.map(u => u.hp),
    head: (window.state.log || []).slice(0, 10),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const mode of MODES) {
    for (const c of CASES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      const row = { mode, name: c.name, kind: c.kind, verb: c.verb };
      try {
        await openGame(page);
        await startRegressionBattle(page);
        const inj = await page.evaluate(inject(c.name, mode));
        if (inj.missing) { row.err = "卡牌缺失"; results.push(row); await page.close(); continue; }
        row.mineBefore = inj.mineBefore; row.landmineAttack = inj.landmineAttack;
        await page.locator("button", { hasText: "结束出牌" }).first().click();
        let clicked = false;
        for (let i = 0; i < 22; i++) {
          await page.waitForTimeout(700);
          const st = await page.evaluate(snapshot());
          row.manualWin = row.manualWin || st.manualDodge || st.manualCounter;
          // AOE 对每个角色依次弹窗，手动模式下每次弹窗都要点
          if (st.manualDodge && mode === "manual") {
            const btn = page.locator("[data-manual-dodge-use]").first();
            if (await btn.count()) {
              await btn.click();
              row.clicks = (row.clicks || 0) + 1; row.clicked = true;
            }
          }
          const left = st.mineNow.reduce((a, b) => a + b, 0);
          if (st.triggered && left === 0) { row.triggered = true; break; }
          if (row.clicked && i > 18) break;
        }
        const fin = await page.evaluate(snapshot());
        Object.assign(row, fin);
        row.errors = errors.slice(0, 2);
      } catch (e) {
        row.err = String(e).slice(0, 160);
      }
      await page.close();
      results.push(row);
    }
  }
  await browser.close();
  console.log("\n===== 地雷 × 使用/打出 × 自动/手动 实战 =====");
  let pass = 0, fail = 0;
  results.forEach(r => {
    if (r.err) { console.log(`  ${r.mode}/${r.name}  ❌ ${r.err}`); fail++; return; }
    const ok = r.triggered && r.mineBefore?.some(n => n > 0) && r.mineNow?.every(n => n === 0);
    ok ? pass++ : fail++;
    console.log(`  ${ok ? "✅" : "❌"} ${r.mode}/${r.name}(${r.kind}) 期望动词=${r.verb}` +
      ` 地雷触发=${r.triggered} 地雷数 ${JSON.stringify(r.mineBefore)}→${JSON.stringify(r.mineNow)}` +
      ` 伤害=${r.landmineAttack} HP=${JSON.stringify(r.allyHp)} 手动窗口=${!!r.manualWin} 点击=${r.clicks || 0}次`);
    console.log(`      使用闪=${r.verbUse} 打出杀=${r.verbPlay} 战报=${JSON.stringify(r.head || [])}`);
    if (r.errors?.length) console.log(`      错误=${r.errors.join(";")}`);
  });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
