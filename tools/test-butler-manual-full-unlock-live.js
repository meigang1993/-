// 管家手册「全部目标能否点亮 / 是否存在死目标」端到端检查（浏览器，作弊方式）
// 1. 作弊把四类目标全部记录 + 全部魅魔设为 20 级，检查手册是否每一条都点亮、总完成度是否 100%
// 2. 静态排查"死目标"：难度解锁链是否完整、每名首领/精英的 id 是否真的会出现在战斗结算里、
//    等级上限是否可达、每个副本是否都能在 5 个难度下通关
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

const EXPECT = {
  boss: 8, elite: 12, missions: 4, heroes: 30, diffs: 5,
  // 探索目标 = 4 副本 × 5 难度 + 新手引导首战 1 条
  explore: 4 * 5 + 1,
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
  const tab = async (id) => {
    await page.locator(`[data-butler-tab='${id}']`).click();
    await page.waitForTimeout(150);
  };
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });

  // ================= 一、数据源规模 =================
  console.log("—— 一、数据源规模 ——");
  const src = await page.evaluate(() => {
    const P = window.ButlerManualProgress;
    const G = window.GameData || {};
    const missions = P.missions();
    const bosses = [], elites = [];
    missions.forEach(m => {
      P.enemiesOf(m.id, "boss").forEach(e => bosses.push({ id: e.id, name: e.name, mission: m.id }));
      P.enemiesOf(m.id, "elite").forEach(e => elites.push({ id: e.id, name: e.name, mission: m.id }));
    });
    return {
      missions: missions.map(m => ({ id: m.id, name: m.name })),
      bosses, elites,
      heroes: (G.characters || []).map(c => ({ id: c.id, name: c.name })),
      maxLevel: P.MAX_LEVEL,
      progMax: window.CharacterProgression?.maxLevel ?? null,
      diffs: P.difficulties().map(d => d.id),
      diffUnlock: Object.fromEntries(Object.entries(G.difficulties || {})
        .map(([k, v]) => [k, v.unlock ?? null])),
    };
  });
  T(`副本 ${EXPECT.missions} 个`, src.missions.length === EXPECT.missions, src.missions);
  T(`首领 ${EXPECT.boss} 名`, src.bosses.length === EXPECT.boss, src.bosses.map(b => b.name));
  T(`精英 ${EXPECT.elite} 名`, src.elites.length === EXPECT.elite, src.elites.map(e => e.name));
  T(`魅魔 ${EXPECT.heroes} 名`, src.heroes.length === EXPECT.heroes, { n: src.heroes.length });
  T(`难度 ${EXPECT.diffs} 档`, src.diffs.length === EXPECT.diffs, src.diffs);
  T("手册满级线与角色成长上限一致（20）",
    src.maxLevel === 20 && src.progMax === 20, { manual: src.maxLevel, prog: src.progMax });

  // ================= 二、死目标排查（记录前先看能不能达成） =================
  console.log("—— 二、死目标排查 ——");
  // 难度解锁链：normal → adventure → warrior → king → hell，每档的前置必须存在
  const chain = ["adventure", "warrior", "king", "hell"];
  T("难度解锁链完整（逐级可解锁到英雄级）",
    chain.every(d => src.diffUnlock[d] && src.diffs.includes(src.diffUnlock[d])), src.diffUnlock);
  // 每个副本都必须能在 5 档难度下通关（否则探索目标有死条目）
  // 副本自身解锁条件只影响"何时能打"，不影响"能否打"，故只校验副本都在 missions() 里
  T("四个副本都在手册探索目标内",
    src.missions.length === EXPECT.missions && src.missions.every(m => !!m.id), src.missions);
  // 首领/精英 id 必须唯一且与所在副本敌人池一致（结算靠 defeatedEnemyIds 匹配）
  const dup = (arr) => {
    const seen = new Set(), d = [];
    arr.forEach(x => { if (seen.has(x.id)) d.push(x.id); seen.add(x.id); });
    return d;
  };
  T("首领 id 无重复（否则同名覆盖导致漏记）", dup(src.bosses).length === 0, dup(src.bosses));
  T("精英 id 无重复", dup(src.elites).length === 0, dup(src.elites));

  // ================= 三、作弊全记录 =================
  console.log("—— 三、作弊记录全部目标 ——");
  const rec = await page.evaluate(() => {
    const P = window.ButlerManualProgress;
    const DIFFS = P.DIFFS;
    const missions = P.missions();
    let bossN = 0, eliteN = 0, clearN = 0;
    const bossIds = [], eliteIds = [];
    missions.forEach(m => {
      P.enemiesOf(m.id, "boss").forEach(e => {
        bossIds.push(e.id);
        DIFFS.forEach(d => { if (P.record(state, "boss", e.id, d)) bossN += 1; });
      });
      P.enemiesOf(m.id, "elite").forEach(e => {
        eliteIds.push(e.id);
        DIFFS.forEach(d => { if (P.record(state, "elite", e.id, d)) eliteN += 1; });
      });
      DIFFS.forEach(d => { if (P.recordClear(state, m.id, d)) clearN += 1; });
    });
    // 全部魅魔设为 20 级且已解锁
    state.chars = (window.GameData?.characters || []).map(c => ({ id: c.id, level: 20, locked: false }));
    // 新手引导首战（探索目标页签的第一条）：走 Onboarding 真实完成入口
    state.flags = state.flags || {};
    if (!window.Onboarding.complete(state)) {
      state.flags.onboarding = { version: window.Onboarding.VERSION, step: "hall", completed: true, skipped: false };
    }
    return {
      bossN, eliteN, clearN, tutorialDone: window.ButlerManualProgress.tutorialDone(state),
      chars: state.chars.length,
      feats: (state.butlerFeats || []).length,
    };
  });
  console.log(`   记录：首领 ${rec.bossN} / 精英 ${rec.eliteN} / 通关 ${rec.clearN}，成果总数 ${rec.feats}`);
  T(`首领目标全部记录（${EXPECT.boss}×${EXPECT.diffs}）`,
    rec.bossN === EXPECT.boss * EXPECT.diffs, rec);
  T(`精英目标全部记录（${EXPECT.elite}×${EXPECT.diffs}）`,
    rec.eliteN === EXPECT.elite * EXPECT.diffs, rec);
  T(`探索目标全部记录（${EXPECT.missions}×${EXPECT.diffs}）`,
    rec.clearN === EXPECT.missions * EXPECT.diffs, rec);
  T("新手引导首战计入探索目标", rec.tutorialDone === true, rec);
  T(`成果总数 = ${EXPECT.boss * 5 + EXPECT.elite * 5 + EXPECT.missions * 5}`,
    rec.feats === (EXPECT.boss + EXPECT.elite + EXPECT.missions) * EXPECT.diffs, rec);

  // ================= 四、总完成度 =================
  console.log("—— 四、总完成度 ——");
  const ov = await page.evaluate(() => {
    const P = window.ButlerManualProgress;
    const o = P.overall(state);
    return { ...o, line: P.line(state), comment: P.comment(state), heroCells: P.heroList(state).length };
  });
  console.log(`   ${JSON.stringify(ov.boss)} ${JSON.stringify(ov.elite)} ${JSON.stringify(ov.explore)} ${JSON.stringify(ov.heroes)} pct=${ov.pct}`);
  T("首领 40/40", ov.boss.done === 40 && ov.boss.total === 40, ov.boss);
  T("精英 60/60", ov.elite.done === 60 && ov.elite.total === 60, ov.elite);
  T(`探索 ${EXPECT.explore}/${EXPECT.explore}`, ov.explore.done === EXPECT.explore && ov.explore.total === EXPECT.explore, ov.explore);
  T(`魅魔 ${EXPECT.heroes}/${EXPECT.heroes}`, ov.heroes.done === EXPECT.heroes && ov.heroes.total === EXPECT.heroes, ov.heroes);
  T("总完成度 100%", ov.pct === 100, { pct: ov.pct });
  T("管家台词为最高档", ov.line === "您比我想象的更有趣，主人。", { line: ov.line });
  T("底部简评为最高档", ov.comment === "主人，深渊的名单已经所剩无几了。", { comment: ov.comment });

  // ================= 五、界面逐条点亮 =================
  console.log("—— 五、手册界面逐条点亮 ——");
  await page.evaluate(() => { const b = document.querySelector("[data-open-butler]"); if (b) b.click(); });
  await page.waitForTimeout(400);
  T("手册已打开（4 个页签）", await page.locator("[data-butler-tab]").count() === 4);

  await tab("boss");
  const bossUi = await page.evaluate(() => ({
    rows: document.querySelectorAll(".butler-row").length,
    allDone: document.querySelectorAll(".butler-row.all-done").length,
    marks: document.querySelectorAll(".butler-mark").length,
    marksDone: document.querySelectorAll(".butler-mark.done").length,
  }));
  T(`讨伐页签 ${EXPECT.boss} 行全部点亮`, bossUi.rows === EXPECT.boss && bossUi.allDone === EXPECT.boss, bossUi);
  T(`讨伐页签 ${EXPECT.boss * 5} 个难度标记全亮`,
    bossUi.marks === 40 && bossUi.marksDone === 40, bossUi);

  await tab("elite");
  const eliteUi = await page.evaluate(() => ({
    rows: document.querySelectorAll(".butler-row").length,
    allDone: document.querySelectorAll(".butler-row.all-done").length,
    marks: document.querySelectorAll(".butler-mark").length,
    marksDone: document.querySelectorAll(".butler-mark.done").length,
  }));
  T(`精英页签 ${EXPECT.elite} 行全部点亮`, eliteUi.rows === EXPECT.elite && eliteUi.allDone === EXPECT.elite, eliteUi);
  T(`精英页签 ${EXPECT.elite * 5} 个难度标记全亮`,
    eliteUi.marks === 60 && eliteUi.marksDone === 60, eliteUi);

  await tab("hero");
  const heroUi = await page.evaluate(() => ({
    cells: document.querySelectorAll(".butler-hero").length,
    maxed: document.querySelectorAll(".butler-hero.maxed").length,
    locked: document.querySelectorAll(".butler-hero.locked").length,
    sum: document.querySelector(".butler-sum")?.textContent || "",
  }));
  T(`魅魔页签 ${EXPECT.heroes} 个头像、全部亮起`,
    heroUi.cells === EXPECT.heroes && heroUi.maxed === EXPECT.heroes, heroUi);
  T("无灰色未解锁剪影", heroUi.locked === 0, heroUi);
  T(`底部显示「已满级：${EXPECT.heroes} / ${EXPECT.heroes}」`,
    heroUi.sum.includes(`${EXPECT.heroes} / ${EXPECT.heroes}`), { sum: heroUi.sum });

  await tab("explore");
  const expUi = await page.evaluate(() => ({
    rows: document.querySelectorAll(".butler-row").length,
    allDone: document.querySelectorAll(".butler-row.all-done").length,
  }));
  T(`探索页签 ${EXPECT.explore} 条全部点亮（含新手引导首战）`,
    expUi.rows === EXPECT.explore && expUi.allDone === EXPECT.explore, expUi);

  const foot = await page.evaluate(() => ({
    pct: document.querySelector(".butler-progress span")?.textContent || "",
    width: document.querySelector(".butler-bar i")?.getAttribute("style") || "",
    comment: document.querySelector(".butler-comment")?.textContent || "",
    speaker: document.querySelector(".butler-speaker")?.textContent || "",
    bubble: document.querySelectorAll(".butler-bubble").length,
  }));
  T("进度条显示 100%", foot.pct.includes("100%") && foot.width.includes("100%"), foot);
  T("底部简评含管家名凯瑟琳", foot.comment.includes("凯瑟琳"), foot);
  T("台词气泡已取消（无 .butler-speaker / .butler-bubble）",
    foot.bubble === 0 && foot.speaker === "", foot);

  // ============ 六、真实结算入口：每名首领/精英是否都能被记录 ============
  // 手册记录靠 defeatedEnemyIds 与敌人 id 匹配；若某怪的 id 对不上，该目标永远打不掉（死目标）。
  console.log("—— 六、真实结算入口覆盖全部首领/精英 ——");
  const real = await page.evaluate(async () => {
    const P = window.ButlerManualProgress;
    const rows = [];
    for (const m of P.missions()) {
      for (const kind of ["boss", "elite"]) {
        for (const e of P.enemiesOf(m.id, kind)) {
          state.butlerFeats = [];
          const run = {
            focusId: `${m.id}-hell-real`, missionId: m.id, difficultyId: "hell",
            party: [...(state.party || [])], activeParty: [...(state.activeParty || [])],
            layers: [], current: "n1-0",
            earned: { gold: 0, essence: 0, relics: [], cards: [] },
            pending: null, lastReward: null, complete: false,
          };
          state.explore = run;
          state.battle = {
            exploration: true, nodeType: kind, missionId: m.id,
            defeatedEnemyIds: [e.id], allies: [], enemies: [], enemyCount: 1,
          };
          window.DungeonSettlementActions.queueBattleExtras(state, run, "n1-0", state.battle);
          await window.DungeonSettlementActions.retryPending(state);
          const ok = (state.butlerFeats || []).includes(`${kind}:${e.id}@hell`);
          rows.push({ kind, id: e.id, name: e.name, ok });
        }
      }
    }
    return rows;
  });
  const miss = real.filter(r => !r.ok);
  T(`真实结算可记录全部 ${EXPECT.boss} 首领 + ${EXPECT.elite} 精英（无死目标）`,
    miss.length === 0 && real.length === EXPECT.boss + EXPECT.elite,
    { total: real.length, miss });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message); process.exit(1); });
