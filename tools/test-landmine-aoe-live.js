// 实战：AOE 牌 → 响应牌抵消 → 每个持有地雷的角色是否各自触发
// 确定性：直接调用 BattleCombat.useCard 打出 AOE（不依赖 AI 决策）
// 判定依据：地雷消耗数 + 日志"地雷触发"条数（不用掉血，避免被 AOE 自身伤害污染）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const AOE = [
  { name: "机枪扫杀", note: "基础 AOE 杀" },
  { name: "流星杀", note: "废墟 AOE 杀" },
  { name: "枪林弹雨", note: "废墟 AOE 战术" },
];
const MODES = ["auto", "manual"];

const inject = (cardName, mode) => `(() => {
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = ${mode === "manual"};
  const findCard = n => {
    const src = [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex,
                 window.GameData?.cards, window.GameData?.allCards];
    for (const l of src) {
      if (Array.isArray(l)) {
        const c = l.find(x => x?.name === n);
        if (c) return JSON.parse(JSON.stringify(c));
      }
    }
    return null;
  };
  const card = findCard(${JSON.stringify(cardName)});
  if (!card) return { missing: true };
  const e1 = b.enemies[1];
  e1.stats = e1.stats || {};
  e1.stats.attack = 11;
  e1.stats.magic = 11;
  const reg = window.BattleStatusCards;
  // 2 名友方各埋 1 颗地雷 + 2 张闪（确保有牌响应）
  b.allies.forEach(u => {
    const mine = reg?.create?.("landmine", e1);
    u.hp = 120;
    u.stats = u.stats || {};
    u.stats.handLimit = 99;
    u.hand = [mine,
      { name: "闪", type: "response", suit: "♥", responseKind: "dodge" },
      { name: "闪", type: "response", suit: "♦", responseKind: "dodge" }].filter(Boolean);
  });
  b.enemies[0].hand = [];
  window.__card = card;
  window.__before = {
    names: b.allies.map(u => u.name),
    mine: b.allies.map(u => (u.hand || []).filter(c => c?.landmine).length),
    attack: b.allies[0]?.hand?.find(c => c?.landmine)?.landmineAttack || 0,
  };
  window.render();
  return { missing: false, before: window.__before };
})()`;

// 确定性打出 AOE：直接调用 useCard
const fire = `(() => {
  const b = window.state.battle;
  const e1 = b.enemies[1];
  const card = window.__card;
  if (!card) return { err: "no card" };
  const fn = window.BattleSystem?.useCard;
  if (typeof fn !== "function") return { err: "BattleSystem.useCard 不可用" };
  try {
    fn(window.state, e1, e1, card);
    return { fired: true };
  } catch (e) {
    return { err: String(e).slice(0, 200) };
  }
})()`;

const snapshot = () => `(() => {
  const b = window.state.battle;
  const log = window.state.log || [];
  return {
    manualWin: !!b?.manualDodge,
    triggers: log.filter(l => l.includes("地雷触发")),
    hp: b.allies.map(u => u.hp),
    mine: b.allies.map(u => (u.hand || []).filter(c => c?.landmine).length),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const mode of MODES) {
    for (const c of AOE) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      const row = { mode, name: c.name };
      try {
        await openGame(page);
        await startRegressionBattle(page);
        const inj = await page.evaluate(inject(c.name, mode));
        if (inj.missing) { row.err = "卡牌缺失"; results.push(row); await page.close(); continue; }
        row.before = inj.before;
        // 确定性打出 AOE
        const fired = await page.evaluate(fire);
        if (fired.err) { row.err = "打出失败: " + fired.err; results.push(row); await page.close(); continue; }
        row.fired = true;
        // 手动模式下，AOE 对每个角色依次弹窗，需逐个点击
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(600);
          const st = await page.evaluate(snapshot());
          row.manualWin = row.manualWin || st.manualWin;
          if (st.manualWin && mode === "manual") {
            const btn = page.locator("[data-manual-dodge-use]").first();
            if (await btn.count()) { await btn.click(); row.clicks = (row.clicks || 0) + 1; }
          }
          if (st.mine.every(n => n === 0) && st.triggers.length >= 2) break;
        }
        const fin = await page.evaluate(snapshot());
        Object.assign(row, {
          triggers: fin.triggers, hpAfter: fin.hp, mineAfter: fin.mine,
          manualWin: row.manualWin, clicks: row.clicks || 0,
        });
        row.errors = errors.slice(0, 2);
      } catch (e) {
        row.err = String(e).slice(0, 160);
      }
      await page.close();
      results.push(row);
    }
  }
  await browser.close();

  console.log("\n===== AOE 牌 × 地雷触发（确定性打出）× 自动/手动 =====");
  let pass = 0, fail = 0;
  results.forEach(r => {
    if (r.err) { console.log(`  ${r.mode}/${r.name}  ❌ ${r.err}`); fail++; return; }
    const need = r.before.mine.reduce((a, b) => a + b, 0);
    const consumed = need - (r.mineAfter || []).reduce((a, b) => a + b, 0);
    const ok = r.triggers.length >= 2 && consumed === need;
    if (ok) pass++; else fail++;
    console.log(
      `  ${ok ? "✅" : "❌"} ${r.mode}/${r.name}` +
      `  地雷触发${r.triggers.length}条(需2)` +
      `  消耗${consumed}/${need}颗` +
      `  剩余${JSON.stringify(r.mineAfter)}` +
      `  手动窗=${!!r.manualWin} 点击${r.clicks}次`);
    console.log(`      战报: ${JSON.stringify(r.triggers)}`);
    if (r.errors?.length) console.log(`      错误: ${JSON.stringify(r.errors)}`);
  });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
