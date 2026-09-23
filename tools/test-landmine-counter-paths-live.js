// 实战：持雷者用「看破」类响应牌时，地雷是否触发
// counter = 手动模式(manualCounter 路径)  auto = 自动模式(playCounter 路径)  dodge = 对照
// 对照：持雷者用「闪」响应（已知触发路径）
// 场景A = 看破响应战术牌  场景B = 闪响应杀（对照）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const inject = (scene) => `(() => {
  const b = window.state.battle;
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = ${JSON.stringify(scene)} !== "auto";
  const findCard = n => {
    const src = [window.GameDataRuinsContent?.cards, window.GameData?.cardCodex, window.GameData?.cards];
    for (const l of src) { if (Array.isArray(l)) { const c = l.find(x => x?.name === n); if (c) return JSON.parse(JSON.stringify(c)); } }
    return null;
  };
  const e1 = b.enemies[1];
  const a0 = b.allies[0];
  e1.stats = e1.stats || {}; e1.stats.attack = 11;
  // 生成真实地雷牌（landmineAttack = 埋雷者攻击力 11）
  const mine = window.BattleStatusCardRegistry?.create?.("landmine", e1) || null;
  if (!mine) return { missing: "landmine" };
  a0.hp = 80; a0.stats = a0.stats || {}; a0.stats.handLimit = 99;
  if (${JSON.stringify(scene)} === "counter" || ${JSON.stringify(scene)} === "auto") {
    const tactic = findCard("枪林弹雨");
    const kanpo = findCard("看破");
    if (!tactic || !kanpo) return { missing: "card" };
    e1.hand = [tactic];
    a0.hand = [kanpo, mine];
  } else {
    const kill = findCard("流星杀");
    if (!kill) return { missing: "kill" };
    e1.hand = [kill];
    a0.hand = [{ name: "闪", type: "response", suit: "♥" }, mine];
  }
  b.enemies[0].hand = [];
  window.render();
  return { missing: null, mineAttack: mine.landmineAttack };
})()`;

const readState = () => `(() => {
  const b = window.state.battle;
  const a0 = b.allies[0];
  const hasMine = (a0.hand || []).some(c => (c.key || c.name || c.statusKey) === "landmine" || c.name === "地雷");
  return {
    manualCounter: !!b?.manualCounter,
    manualDodge: !!b?.manualDodge,
    hp: a0.hp,
    hasMine,
    log: (window.state.log || []).slice(0, 20),
    triggeredNow: (window.state.log || []).some(l => String(l).includes("地雷触发")),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const scene of ["counter", "auto", "dodge"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    try {
      await openGame(page);
      await startRegressionBattle(page);
      const inj = await page.evaluate(inject(scene));
      if (inj.missing) { out[scene] = { err: "注入失败: " + inj.missing }; await page.close(); continue; }
      await page.locator("button", { hasText: "结束出牌" }).first().click();
      let clicked = false, windowSeen = false;
      if (scene === "auto") {
        // 自动模式：不出现手动窗口，直接等 AI 自动响应结算
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(800);
          const st = await page.evaluate(readState());
          if (st.triggeredNow) break;
        }
      } else {
      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(700);
        const st = await page.evaluate(readState());
        if (!(st.manualCounter || st.manualDodge)) { if (clicked) break; continue; }
        windowSeen = true;
        const kind = st.manualCounter ? "counter" : "dodge";
        try {
          // 每次重新定位（render 后元素会被替换），force 规避覆盖层
          const pick = page.locator(`[data-manual-${kind}-pick]`).first();
          if (await pick.count() > 0) await pick.click({ timeout: 4000, force: true });
          await page.waitForTimeout(400);
          const use = page.locator(`[data-manual-${kind}-use]`).first();
          if (await use.count() > 0) await use.click({ timeout: 4000, force: true });
          clicked = true;
        } catch (e) { /* 元素在 render 中失效，下一轮重试 */ }
        await page.waitForTimeout(800);
        const after = await page.evaluate(readState());
        if (!after.manualCounter && !after.manualDodge) break;
      }
      }
      await page.waitForTimeout(2000);
      const fin = await page.evaluate(readState());
      const allLog = (fin.log || []).join("|");
      out[scene] = {
        windowSeen, clicked,
        mineAttack: inj.mineAttack,
        hpBefore: 80, hpAfter: fin.hp,
        hpLoss: 80 - fin.hp,
        mineLeft: fin.hasMine,
        triggered: allLog.includes("地雷触发"),
        log: fin.log.slice(0, 8),
        errors: errors.slice(0, 2),
      };
    } catch (e) {
      out[scene] = { err: String(e).slice(0, 200) };
    }
    await page.close();
  }
  await browser.close();
  console.log("\n===== 地雷 × 响应路径 实战 =====");
  Object.entries(out).forEach(([k, r]) => {
    console.log(`\n[${k}]`);
    if (r.err) { console.log("  ❌ " + r.err); return; }
    console.log(`  窗口出现=${r.windowSeen} 已点击=${r.clicked}  地雷伤害值=${r.mineAttack}`);
    console.log(`  HP 80 -> ${r.hpAfter} (掉 ${r.hpLoss})   地雷是否残留=${r.mineLeft}   战报含"地雷触发"=${r.triggered}`);
    console.log(`  战报=${JSON.stringify(r.log || [])}`);
    if (r.errors && r.errors.length) console.log(`  错误=${r.errors.join(";")}`);
  });
  process.exit(0);
})();
