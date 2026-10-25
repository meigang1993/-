// 截图：泡泡手牌区与手牌区的实际位置关系，并扫描是否存在「切换按键」。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.thunderHammer;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.hand = [
    { name: "泡泡牌1", type: "tactic", suit: "♦", text: "", targetless: true },
    { name: "泡泡牌2", type: "tactic", suit: "♥", text: "", targetless: true },
    { name: "泡泡牌3", type: "tactic", suit: "♠", text: "", targetless: true },
    { name: "手牌杀", type: "kill", suit: "♦", text: "" },
    { name: "手牌闪", type: "tactic", suit: "♣", text: "", targetless: true },
  ];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach(e => { e.hp = e.maxHp = 90; e.block = 0; e.statuses = []; e.hand = []; e.noResponse = true; });
  st.log = []; st.battleLog = [];
  // 直接装填 3 张泡泡牌（绕过逐张存入），目的是看界面布局
  u.bubbleCards = [
    { name: "泡泡牌1", type: "tactic", suit: "♦", text: "", targetless: true },
    { name: "泡泡牌2", type: "tactic", suit: "♥", text: "", targetless: true },
    { name: "泡泡牌3", type: "tactic", suit: "♠", text: "", targetless: true },
  ];
  window.render();
  return { hand: u.hand.length, bubble: u.bubbleCards.length };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(setupTpl);
  await page.waitForTimeout(600);

  // 1) 扫描全部可交互控件，找"切换"相关的
  const scan = await page.evaluate(`(() => {
    const out = { buttons: [], dataAttrs: [], switchLike: [] };
    document.querySelectorAll("button").forEach(b => {
      const t = (b.textContent || "").trim();
      if (t) out.buttons.push(t);
    });
    const seen = new Set();
    document.querySelectorAll("*").forEach(el => {
      if (!el.dataset) return;
      Object.keys(el.dataset).forEach(k => { seen.add(k); });
    });
    out.dataAttrs = Array.from(seen).sort();
    out.switchLike = out.buttons.filter(t => /切换|手牌区|泡泡区|切换区/.test(t));
    const zone = document.querySelector(".karuna-bubble-zone");
    const hand = document.querySelector(".hand-panel");
    const r = el => el ? (({x,y,width,height}) => ({x:Math.round(x),y:Math.round(y),w:Math.round(width),h:Math.round(height)}))(el.getBoundingClientRect()) : null;
    out.zoneBox = r(zone);
    out.handBox = r(hand);
    out.zoneParent = zone ? (zone.parentElement?.className || zone.parentElement?.tagName) : null;
    out.zoneVisible = zone ? (zone.getBoundingClientRect().width > 0 && zone.getBoundingClientRect().height > 0) : false;
    out.slots = document.querySelectorAll("[data-bubble-index]").length;
    const card = document.querySelector("[data-bubble-index] .play-card, [data-bubble-index]");
    out.cardBox = r(card);
    const hcard = document.querySelector(".hand-cards .play-card") || document.querySelector(".hand-panel .play-card");
    out.handCardBox = r(hcard);
    return out;
  })()`);

  console.log("=== 扫描 ===");
  console.log("泡泡区 box:", JSON.stringify(scan.zoneBox));
  console.log("泡泡区父级:", scan.zoneParent, " 可见:", scan.zoneVisible, " 槽位:", scan.slots);
  console.log("手牌面板 box:", JSON.stringify(scan.handBox));
  console.log("泡泡牌尺寸:", JSON.stringify(scan.cardBox));
  console.log("手牌尺寸:", JSON.stringify(scan.handCardBox));
  console.log("含「切换/手牌区/泡泡区」的按钮:", JSON.stringify(scan.switchLike));
  console.log("全部按钮:", JSON.stringify(scan.buttons));
  console.log("全部 data 属性:", JSON.stringify(scan.dataAttrs));

  // 2) 整屏截图
  await page.screenshot({ path: "/data/workspace/karuna_switch_full.png" });
  // 3) 手牌面板区域截图（含泡泡区）
  const hb = scan.handBox;
  if (hb) {
    await page.screenshot({
      path: "/data/workspace/karuna_switch_panel.png",
      clip: { x: Math.max(0, hb.x - 10), y: Math.max(0, hb.y - 10), width: Math.min(1600 - Math.max(0, hb.x - 10), hb.w + 20), height: Math.min(1000 - Math.max(0, hb.y - 10), hb.h + 20) },
    });
  }

  const errs = relevantErrors(page);
  console.log("页面错误:", errs.length, JSON.stringify(errs.slice(0, 3)));
  await browser.close();
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
