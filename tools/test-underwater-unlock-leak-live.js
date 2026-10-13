// 实机复现玩家场景：机械工厂推到冒险级之后，再开放水下列车副本，
// 读取真实界面上的难度卡，确认水下列车的冒险级没有跟着一起解锁。
//
// 关键点：读界面 DOM（VillaTeamUI.team 渲染结果），而不是只查内存表 ——
// 玩家看到的是卡片是否带 .locked，界面与内存表若不同源就会出现「表对、界面错」。

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const CHAIN = ["normal", "adventure", "warrior", "king", "hell"];

// 直接从真实界面渲染结果读取卡片状态。
const readCards = page => page.evaluate(() => {
  const html = window.VillaTeamUI.team(window.state);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {};
  doc.querySelectorAll("button[data-start][data-difficulty]").forEach(btn => {
    const card = btn.closest(".difficulty-card");
    out[`${btn.dataset.start}/${btn.dataset.difficulty}`] = {
      locked: !!card && card.classList.contains("locked"),
      text: (btn.textContent || "").trim(),
    };
  });
  return out;
});
const readState = page => page.evaluate(() => ({
  table: JSON.parse(JSON.stringify(window.state.dungeonUnlocks || {})),
  legacy: [...(window.state.unlockedDifficulties || [])],
  feats: [...(window.state.butlerFeats || [])],
  hasDungeonUnlocks: !!window.DungeonUnlocks,
  flags: {
    underwater: !!window.state.flags?.underwaterTrainUnlocked,
  },
}));
const listOf = (s, id) => (window.DungeonUnlocks ? [] : []);

const clearRun = (page, missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
  const s = window.state;
  s.party = ["lokar"];
  s.view = "dungeon";
  s.explore = {
    focusId: `uw-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await window.DungeonRewards.finish(s);
  return { view: s.view };
}, { missionId, difficultyId });

const openUnderwater = page => page.evaluate(() => {
  window.state.flags.underwaterTrainUnlocked = true;
  window.state.flags.underwaterTrainUnlockSeen = true;
  // D 段要断言兽人/废墟「仍只有普通级」，必须先开放这两个副本 ——
  // 否则副本未开放时难度卡恒为 locked，断言会假绿。
  window.state.flags.orcDungeonUnlocked = true;
  window.state.flags.ruinsSandCityUnlocked = true;
});

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", e => errors.push(e.message));

  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);

    console.log("--- A. 环境：界面判定所依赖的模块可用 ---");
    let st = await readState(page);
    T("window.DungeonUnlocks 已加载（界面不会回退全局数组）", st.hasDungeonUnlocks, st);

    console.log("\n--- B. 机械工厂推到冒险级 ---");
    await clearRun(page, "machine_factory", "normal");
    let cards = await readCards(page);
    T("机械工厂通普通后：机械工厂/冒险 界面已开放",
      cards["machine_factory/adventure"] && !cards["machine_factory/adventure"].locked,
      cards["machine_factory/adventure"]);

    await clearRun(page, "machine_factory", "adventure");
    cards = await readCards(page);
    T("机械工厂通冒险后：机械工厂/勇士 界面已开放",
      cards["machine_factory/warrior"] && !cards["machine_factory/warrior"].locked,
      cards["machine_factory/warrior"]);

    st = await readState(page);
    console.log(`   内存表: ${JSON.stringify(st.table)}`);
    console.log(`   派生全局数组: ${JSON.stringify(st.legacy)}`);
    console.log(`   通关记录: ${JSON.stringify(st.feats)}`);

    console.log("\n--- C. 开放水下列车副本（尚未打过任何一局） ---");
    await openUnderwater(page);
    cards = await readCards(page);
    st = await readState(page);

    T("水下列车/普通 界面已开放（副本确实解锁）",
      cards["underwater_train/normal"] && !cards["underwater_train/normal"].locked,
      cards["underwater_train/normal"]);
    T("水下列车/冒险 界面仍锁定 ← 玩家报的核心现象",
      !!(cards["underwater_train/adventure"] && cards["underwater_train/adventure"].locked),
      cards["underwater_train/adventure"]);
    T("水下列车/勇士 界面仍锁定",
      !!(cards["underwater_train/warrior"] && cards["underwater_train/warrior"].locked),
      cards["underwater_train/warrior"]);
    T("内存表：水下列车仅普通级",
      JSON.stringify(st.table.underwater_train || ["normal"]) === JSON.stringify(["normal"]),
      { table: st.table.underwater_train });

    // 界面与内存表必须同源：全局数组含 adventure，但界面必须不看它。
    T("界面不被派生全局数组误导（全局数组含 adventure 但界面仍锁）",
      st.legacy.includes("adventure")
        ? !!(cards["underwater_train/adventure"] && cards["underwater_train/adventure"].locked)
        : true,
      { legacy: st.legacy, card: cards["underwater_train/adventure"] });

    console.log("\n--- D. 真正通关水下列车普通级之后 ---");
    await clearRun(page, "underwater_train", "normal");
    cards = await readCards(page);
    st = await readState(page);
    T("水下列车/冒险 此时才开放",
      cards["underwater_train/adventure"] && !cards["underwater_train/adventure"].locked,
      cards["underwater_train/adventure"]);
    T("机械工厂进度不受影响（勇士仍开放）",
      cards["machine_factory/warrior"] && !cards["machine_factory/warrior"].locked,
      cards["machine_factory/warrior"]);
    T("兽人地下城仍只有普通级",
      !!(cards["orc_dungeon/adventure"] && cards["orc_dungeon/adventure"].locked),
      cards["orc_dungeon/adventure"]);
    T("废墟沙城仍只有普通级",
      !!(cards["ruins_sand_city/adventure"] && cards["ruins_sand_city/adventure"].locked),
      cards["ruins_sand_city/adventure"]);
    console.log(`   最终内存表: ${JSON.stringify(st.table)}`);

    console.log("\n--- E. 页面错误 ---");
    T("无页面错误", errors.length === 0, errors.slice(0, 3));
  } catch (e) {
    console.error("运行异常:", e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass} / ${total}`);
  if (pass !== total) process.exitCode = 1;
})();
