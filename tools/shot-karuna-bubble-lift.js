// 截图：泡泡手牌区选中前后的抬升效果
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setup = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna"; u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  u.bubbleCards = [
    { name: "泡泡战术", type: "tactic", suit: "♦", text: "", targetless: true },
    { name: "泡泡杀", type: "kill", suit: "♣", text: "" },
  ];
  u.hand = [{ name: "手牌战术", type: "tactic", suit: "♥", text: "", targetless: true }];
  b.activeUid = u.uid; b.selectedCardIndex = -1; b.selectedSkillCard = null;
  b.enemies.forEach(e => { e.hp = e.maxHp = 90; e.block = 0; e.statuses = []; e.hand = []; e.noResponse = true; });
  st.log = []; st.battleLog = [];
  window.render();
  return u.bubbleCards.length;
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(setup);
  await page.waitForTimeout(500);
  const zone = await page.$(".karuna-bubble-zone");
  if (zone) await zone.screenshot({ path: "/data/workspace/karuna_bubble_unselected.png" });
  await page.evaluate(`(() => { document.querySelector("[data-bubble-index]")?.click(); return 1; })()`);
  await page.waitForTimeout(600);
  const zone2 = await page.$(".karuna-bubble-zone");
  if (zone2) await zone2.screenshot({ path: "/data/workspace/karuna_bubble_selected.png" });
  const panel = await page.$(".hand-panel");
  if (panel) await panel.screenshot({ path: "/data/workspace/karuna_bubble_panel_selected.png" });
  console.log("done");
  await browser.close();
})();
