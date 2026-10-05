// 探针：验证「半魅魔血触发次数波动」的成因
// 假设：半魅魔血受击摸 2 张牌，若摸到【闪】会自动响应抵消后续段，
// 导致触发次数在 3~5 之间波动（与双重打杀第二段的成因同源）。
// 三种 MODE 对照：
//   allflash   —— 牌堆全【闪】，预期触发次数暴跌（仅首段）
//   noresponse —— 牌堆剔除响应牌，预期稳定 5 次
//   normal     —— 原样，作为基准（应在 3~5 波动）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const MODE = process.env.MODE || "normal";

const setup = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  const def = (window.GameDataMachineFactoryEnemies || [])
    .find(x => x.id === "pursuer_edis");
  if (def) { e.id = def.id; e.skills = JSON.parse(JSON.stringify(def.skills)); }
  e.ai = "pursuer_edis"; e.name = "内英组杀手伊迪斯";
  e.stats = Object.assign({}, e.stats, { attack: 6, magic: 5, handLimit: 5 });
  e.hp = 3000; e.maxHp = 3000; e.block = 0; e.intent = 1;
  e.hand = Array.from({ length: 9 }, () => ({ name: "杀", type: "kill", suit: "♠" }));

  const a0 = b.allies[0], a1 = b.allies[1];
  if (a0) { a0.ref = "hoshino_kaiichi"; a0.name = "星野一";
    a0.hp = 3000; a0.maxHp = 3000; a0.skills = [{ name: "半魅魔血" }]; }
  if (a1) { a1.ref = "lokar"; a1.name = "罗卡尔";
    a1.hp = 3000; a1.maxHp = 3000; a1.skills = []; }
  b.allies.forEach(u => { u.hand = []; u.block = 0; u.stats = u.stats || {};
    u.stats.handLimit = 99; u.stats.drawPerTurn = 0; u.stats.initialDraw = 0; });

  const MODE = ${JSON.stringify(MODE)};
  b.allies.forEach(u => {
    u.pileStats = u.pileStats || {};
    const deck = u.pileStats.deck || u.deck || [];
    if (MODE === "allflash") {
      const filled = Array.from({ length: 40 },
        () => ({ name: "闪", type: "response", suit: "♥" }));
      u.pileStats.deck = filled; if (u.deck) u.deck = filled;
    } else if (MODE === "noresponse") {
      const kept = deck.filter(c => c && c.type !== "response" && c.name !== "闪");
      u.pileStats.deck = kept; if (u.deck) u.deck = kept.slice();
    }
  });
  window.__deckInfo = b.allies.map(u => ({
    name: u.name,
    deck: ((u.pileStats && u.pileStats.deck) || u.deck || []).length,
    flash: ((u.pileStats && u.pileStats.deck) || u.deck || [])
      .filter(c => c && (c.type === "response" || c.name === "闪")).length
  }));
  b.enemies.forEach((u, i) => { if (i !== 1) { u.hand = []; u.hp = 1; } });
  window.state.log = [];
  window.render();
  return true;
})()`;

async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function settle(page, maxMs = 25000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    await dismissPrompts(page);
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        prompt: !!(b.kaiichiShare || b.dimensionTransfer || b.responsibility),
        queue: (b.reactionQueue || b.pendingActions || []).length,
        len: (window.state.log || []).length };
    })()`);
    const quiet = !s.locked && !s.anim && !s.prompt && !s.queue;
    if (quiet && s.len === lastLen) { stable += 1; if (stable >= 3) break; }
    else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await startRegressionBattle(page);
  await page.waitForTimeout(400);
  await page.evaluate(setup);
  await page.waitForTimeout(300);
  const deckInfo = await page.evaluate(`(() => window.__deckInfo || [])()`);
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[1], a0 = b.allies[0];
    b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
    b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
    e.intent = 1;
    const kill = (e.hand || []).find(c => window.CardUtils?.isEntitySingleKill?.(c));
    window.BattleSystem.useCard(st, e, a0, kill);
    return true;
  })()`);
  await settle(page);
  const texts = await page.evaluate(
    `(() => (window.state.battleLog || []).map(l => String(l.text || l)))()`);
  const extraMatch = texts.map(t => t.match(/额外结算(\d+)次/)).find(Boolean);
  const extra = extraMatch ? +extraMatch[1] : 0;
  const kaiichi = texts.filter(t => t.includes("星野一受到生命值伤害")).length;
  const flash = texts.filter(t => t.includes("自动使用闪")).length;
  const dmg = texts.filter(t => /伊迪斯的杀对星野一造成\d+伤害/.test(t)).length;
  await page.close();
  await browser.close();
  console.log(JSON.stringify({
    mode: MODE, extra, seg: extra + 1, kaiichi, flashAuto: flash, dmgToStar: dmg, deckInfo
  }));
  if (process.env.DUMP_LOG) texts.slice(0, 30).forEach((t, i) => console.log(`  ${i}: ${t}`));
})();
