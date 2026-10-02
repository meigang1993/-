// 管家手册「能否真实触发完成目标」端到端检查（浏览器）
// 不走 mock，走游戏真实结算入口 DungeonSettlementActions（与 dungeon-node-rewards 完全一致），
// 验证四类目标：讨伐boss / 讨伐精英 / 通关副本 / 魅魔满级，并重点验证难度维度是否正确。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.waitForTimeout(300);

  // 真实结算：与 dungeon-node-rewards.js 中 completeBattle 的调用完全一致
  const settle = (opts) => page.evaluate(async (o) => {
    const run = {
      focusId: `${o.missionId}-${o.difficultyId}-butler-test`,
      missionId: o.missionId, difficultyId: o.difficultyId,
      party: [...(state.party || [])], activeParty: [...(state.activeParty || [])],
      layers: [], current: "n1-0",
      earned: { gold: 0, essence: 0, relics: [], cards: [] },
      pending: null, lastReward: null, complete: !!o.complete,
    };
    state.explore = run;
    const before = [...(state.butlerFeats || [])];
    if (o.defeatedIds?.length) {
      state.battle = {
        exploration: true, nodeType: o.nodeType || "boss", missionId: o.missionId,
        defeatedEnemyIds: [...o.defeatedIds], allies: [], enemies: [], enemyCount: 1,
      };
      window.DungeonSettlementActions.queueBattleExtras(state, run, "n1-0", state.battle);
    }
    if (o.complete) window.DungeonSettlementActions.queueDungeonCompletion(state, run);
    await window.DungeonSettlementActions.retryPending(state);
    return { before, after: [...(state.butlerFeats || [])] };
  }, opts);

  const feats = () => page.evaluate(() => [...(state.butlerFeats || [])]);

  console.log("—— 场景1：普通级击败机械牛头王 ——");
  let r = await settle({ missionId: "machine_factory", difficultyId: "normal",
    defeatedIds: ["mechanical_bull_king"], nodeType: "boss" });
  T("战斗结算后新增了成果记录", r.after.length > r.before.length, r);
  T("记录了 boss:mechanical_bull_king@normal",
    r.after.includes("boss:mechanical_bull_king@normal"), r.after);

  console.log("—— 场景2：英雄级击败机械AI龙（难度维度是否正确） ——");
  r = await settle({ missionId: "ruins_sand_city", difficultyId: "hell",
    defeatedIds: ["mech_ai_dragon"], nodeType: "boss" });
  T("记录了 boss:mech_ai_dragon@hell",
    r.after.includes("boss:mech_ai_dragon@hell"), r.after);
  T("没有错误落到 normal",
    !r.after.includes("boss:mech_ai_dragon@normal"), r.after);

  console.log("—— 场景3：勇士级击败精英武装直升机 ——");
  r = await settle({ missionId: "ruins_sand_city", difficultyId: "warrior",
    defeatedIds: ["attack_helicopter"], nodeType: "elite" });
  const eliteKey = r.after.find(k => k.startsWith("elite:attack_helicopter@"));
  T("记录了精英成果", !!eliteKey, r.after);
  T("精英难度维度为 warrior", eliteKey === "elite:attack_helicopter@warrior", { eliteKey });

  console.log("—— 场景4：通关废墟沙城·王者级 ——");
  r = await settle({ missionId: "ruins_sand_city", difficultyId: "king", complete: true });
  T("记录了 clear:ruins_sand_city@king",
    r.after.includes("clear:ruins_sand_city@king"), r.after);

  console.log("—— 场景5：魅魔满级（20级） ——");
  const hero = await page.evaluate(() => {
    state.chars[0].level = 20;
    const list = window.ButlerManualProgress.heroList(state);
    const target = list.find(h => h.id === state.chars[0].id);
    return { level: target?.level, maxed: target?.maxed, name: target?.name };
  });
  T("20级角色被判定为满级", hero.maxed === true, hero);
  const overall = await page.evaluate(() => window.ButlerManualProgress.overall(state));
  T("总览含满级计数", overall.heroes.done >= 1, overall.heroes);

  console.log("—— 场景6：手册界面真实点亮 ——");
  // 手册没有 open 方法，真实入口是大厅的 [data-open-butler] 按钮
  await page.evaluate(() => { const b = document.querySelector("[data-open-butler]"); if (b) b.click(); });
  await page.waitForTimeout(400);
  const opened = await page.locator("[data-butler-tab]").count();
  T("手册界面可打开且页签渲染", opened === 4, { opened });
  if (opened) {
    await page.locator("[data-butler-tab='boss']").click();
    await page.waitForTimeout(200);
    const doneCount = await page.locator(".butler-mark.done").count();
    T("讨伐页签有已完成标记", doneCount > 0, { doneCount });
    await page.locator("[data-butler-tab='explore']").click();
    await page.waitForTimeout(200);
    // 探索页签渲染的是 .butler-row.all-done（无 .butler-mark），与讨伐/精英页签不同
    const clearDone = await page.locator(".butler-row.all-done").count();
    T("探索页签有已完成标记", clearDone > 0, { clearDone });
  }

  console.log("—— 场景7：总完成度与文案随进度变化 ——");
  const lv = await page.evaluate(() => ({
    pct: window.ButlerManualProgress.overall(state).pct,
    line: window.ButlerManualProgress.line(state),
    comment: window.ButlerManualProgress.comment(state),
  }));
  T("总完成度已大于0", lv.pct > 0, lv);
  T("管家台词非空", !!lv.line, lv);

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message); process.exit(1); });
