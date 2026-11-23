// 实战回归：真实浏览器 + 真实出牌流程
// 检查废墟沙城 5 张牌是否会触发【闪】响应窗口（state.battle.manualDodge）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 单条命令串行 5 个完整浏览器场景（各 30×1000ms）会超过工具层前台 HTTP 超时窗口，
// 表现为 502 / 日志 0 字节。用 ONLY=<卡名[,卡名]> 分批跑；默认仍是全量。
const TARGETS = ["流星杀", "吸魔杀", "枪林弹雨", "拼杀", "魔之连杀"]
  .filter(n => !process.env.ONLY || process.env.ONLY.split(",").includes(n));

const injectTpl = cardName => `(() => {
  const cardName = ${JSON.stringify(cardName)};
  const b = window.state.battle;
  // 必须取带 suit 的实体牌：卡牌「定义」没有 suit，进战斗后 canPlay 判为无效，
  // 敌人 AI 永远不出牌（旧脚本恒绿掩盖了这一点）。
  const src = [window.GameDataCards?.eliteCards, window.GameData?.cards,
    window.GameData?.cardCodex, window.GameDataRuinsContent?.cards];
  let card = null;
  for (const l of src) {
    if (!Array.isArray(l)) continue;
    card = l.find(c => c?.name === cardName && c?.suit);
    if (card) break;
  }
  if (!card) return { missing: true };
  // 开启手动响应，玩家方（ally）才能弹出闪窗口
  window.state.settings = window.state.settings || {};
  window.state.settings.manualResponse = true;
  window.__log = [];
  const e1 = b.enemies[1];
  const orig = window.BattleAI.choose;
  window.BattleAI.choose = function (bb, actor, canPlay) {
    let r = null; try { r = orig(bb, actor, canPlay); } catch (e) {}
    // 准备阶段摸牌后 AI 可能改选别的牌（如「拼杀」被「魔杀」顶掉），导致目标牌
    // 从未打出的假阴性。本脚本只验证「这张牌 → 闪窗口」，故固定出牌，保留 AI 原决策字段。
    if (r && actor?.uid === e1.uid) {
      const c = (actor.hand || []).find(x => x.name === cardName);
      if (c) r = { ...r, card: c };
    }
    window.__log.push({ actor: actor?.name, move: r?.card?.name || null, score: r?.score ?? null });
    return r;
  };
  e1.hand = [JSON.parse(JSON.stringify(card))];
  e1.stats.attack = 3; e1.stats.magic = 4;
  // 玩家手牌塞满【闪】，保证有可用响应牌
  b.allies.forEach(u => { u.hand = [{ name: "闪", type: "response", suit: "♥" }]; u.hp = 80; });
  b.enemies[0].hand = [];
  // 双我方测试战斗里，点一次「结束出牌」只会切到第二名我方；重建回合队列，
  // 让携带目标牌的敌人成为下一个行动单位，AI 才会真正出牌并触发闪窗口。
  b.roundOrder = [e1.uid, b.enemies[0].uid, ...b.allies.map(u => u.uid)];
  b.roundIndex = 0;
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
        await page.waitForTimeout(500);
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
        // 目标牌打出后仍继续观察数轮，避免错过响应窗口
        if (sawDodge || (played && i > 10)) break;
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
  const failed = Object.entries(results).filter(([, r]) =>
    r.err || !r.played || (r.errors || []).length);
  console.log(`\n结果：${Object.keys(results).length - failed.length}/${Object.keys(results).length} 场景通过` +
    (failed.length ? `，失败：${failed.map(([k]) => k).join("、")}` : "") +
    `（本次范围 ONLY=${process.env.ONLY || "全部"}）`);
  // 原先恒为 process.exit(0)，即使场景抛错/没打出牌也算通过；现按真实结果设码。
  process.exit(failed.length || !Object.keys(results).length ? 1 : 0);
})();
