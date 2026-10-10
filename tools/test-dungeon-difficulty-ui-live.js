// 实战：准备启程页的难度卡片必须按副本独立显示锁定状态。
// 通关机械工厂·普通级后，水下列车的冒险级仍应显示"未解锁"（带锁），
// 这正是"一个副本难度解锁、其他副本难度也同时解锁"的界面表现。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

// 在页面内渲染准备启程页，返回每个副本每个难度的锁定状态
const readCards = page => page.evaluate(() => {
  const html = window.VillaTeamUI.team(window.state);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {};
  doc.querySelectorAll("button[data-start][data-difficulty]").forEach(btn => {
    const card = btn.closest(".difficulty-card");
    const key = `${btn.dataset.start}/${btn.dataset.difficulty}`;
    out[key] = {
      locked: !!card && card.classList.contains("locked"),
      hasLockIcon: !!card && !!card.querySelector(".difficulty-lock"),
      disabled: btn.disabled,
      text: (btn.textContent || "").trim(),
    };
  });
  return out;
});

// 走真实结算路径通关某副本某难度
const clearRun = (page, missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
  const s = window.state;
  s.flags.underwaterTrainUnlocked = true;
  s.flags.orcDungeonUnlocked = true;
  s.party = ["lokar"];
  s.view = "dungeon";
  s.explore = {
    focusId: `ui-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await window.DungeonRewards.finish(s);
  return { explore: s.explore, view: s.view };
}, { missionId, difficultyId });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await openGame(page);
    await startFreshGame(page);

    // A. 新档：每个副本只有普通级解锁
    const fresh = await readCards(page);
    T("A1 新档机械工厂·普通级已解锁",
      fresh["machine_factory/normal"] && !fresh["machine_factory/normal"].locked,
      fresh["machine_factory/normal"]);
    T("A2 新档机械工厂·冒险级锁定",
      fresh["machine_factory/adventure"] && fresh["machine_factory/adventure"].locked,
      fresh["machine_factory/adventure"]);
    T("A3 新档水下列车·冒险级锁定",
      fresh["underwater_train/adventure"] && fresh["underwater_train/adventure"].locked,
      fresh["underwater_train/adventure"]);

    // B. 通关机械工厂·普通级
    const settled = await clearRun(page, "machine_factory", "normal");
    T("B1 结算已回到大厅", settled.explore === null && settled.view === "hall", settled);

    const after = await readCards(page);
    T("B2 机械工厂·冒险级应解锁",
      after["machine_factory/adventure"] && !after["machine_factory/adventure"].locked,
      after["machine_factory/adventure"]);
    T("B3 水下列车·冒险级仍锁定（BUG 核心）",
      after["underwater_train/adventure"] && after["underwater_train/adventure"].locked,
      after["underwater_train/adventure"]);
    T("B4 水下列车·冒险级按钮文案为未解锁",
      after["underwater_train/adventure"]
        && after["underwater_train/adventure"].text === "未解锁",
      after["underwater_train/adventure"]);
    T("B5 兽人地下城·冒险级仍锁定",
      after["orc_dungeon/adventure"] && after["orc_dungeon/adventure"].locked,
      after["orc_dungeon/adventure"]);
    T("B6 水下列车·普通级仍可出征",
      after["underwater_train/normal"] && !after["underwater_train/normal"].locked,
      after["underwater_train/normal"]);

    // C. 反向：通关水下列车·普通级，不影响机械工厂
    await clearRun(page, "underwater_train", "normal");
    const back = await readCards(page);
    T("C1 水下列车·冒险级应解锁",
      back["underwater_train/adventure"] && !back["underwater_train/adventure"].locked,
      back["underwater_train/adventure"]);
    T("C2 机械工厂·冒险级保持已解锁（不被回退）",
      back["machine_factory/adventure"] && !back["machine_factory/adventure"].locked,
      back["machine_factory/adventure"]);
    T("C3 机械工厂·勇士级仍锁定",
      back["machine_factory/warrior"] && back["machine_factory/warrior"].locked,
      back["machine_factory/warrior"]);

    T("D1 页面无 JS 错误", errors.length === 0, errors);
  } catch (err) {
    console.log(`❌ 执行异常: ${err.message}`);
    total++;
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass}/${total}`);
  console.log(`总计 ${pass === total ? "全部通过" : `失败 ${total - pass}`}`);
  process.exit(pass === total ? 0 : 1);
})();
