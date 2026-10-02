// 新手引导剧情事件回归（浏览器）：新游戏开场 + 首战胜利归来
// 覆盖：
//   1. 新游戏后自动弹出「出发之前」，6 句台词、说话者与高亮立绘逐句对应
//   2. 末句出现完成按钮，点击后关闭并置 flag，不再重复触发
//   3. 首战胜利回大厅自动弹出「首战归来」，3 句台词正确
//   4. 两个事件均为纯剧情（不解锁角色、不改角色栏）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const INTRO_LINES = [
  ["凯瑟琳", "小主人，去执行任务前，了解一下战斗方式"],
  ["凯瑟琳", "去完成首战吧"],
  ["罗卡尔", "你没有翅膀？难道你是低级人类魅魔？"],
  ["凯瑟琳", "小主人，难道你也鄙视我这种魅魔吗？"],
  ["罗卡尔", "不，不是，那我去战斗了 ，妈妈交给你了"],
  ["凯瑟琳", "放心吧，主人由我照顾"],
];
const VICTORY_LINES = [
  ["凯瑟琳", "小主人，了解战斗方式了呀，带着主人的魔偶去冒险吧"],
  ["凯瑟琳", "如果把曼妮四小姐唤醒，奴婢，就跟小主人一起去冒险，满足你任何需求，就算是身体方面也可以"],
  ["罗卡尔", "我知道了，我……走了"],
];

const snapshot = page => page.evaluate(() => ({
  modal: window.state?.hallModal || null,
  title: document.querySelector(".adv-event h2")?.textContent || "",
  speaker: document.querySelector(".adv-name")?.textContent || "",
  text: document.querySelector(".adv-text")?.textContent || "",
  progress: (document.querySelector(".adv-progress")?.textContent || "").trim(),
  speaking: [...document.querySelectorAll(".vn-stage .portrait.is-speaking")]
    .map(p => p.getAttribute("data-art-name")),
  muted: [...document.querySelectorAll(".vn-stage .portrait.is-muted")]
    .map(p => p.getAttribute("data-art-name")),
  portraits: [...document.querySelectorAll(".vn-stage .portrait")].map(p => ({
    name: p.getAttribute("data-art-name"),
    src: p.getAttribute("data-art-src") || "",
    loaded: (() => {
      const img = p.querySelector("img");
      return !!img && img.complete && img.naturalWidth > 0;
    })(),
  })),
}));

// 立绘是异步加载的：弹窗刚出现时 img.complete 可能仍为 false，
// 直接判定「已加载」会把没加载完的图误判成占位/剪影（实测凯瑟琳立绘会偶发）。
// 这里等到所有立绘 img 真正解码完成（或超时）再取样。
async function waitPortraits(page, maxMs = 5000) {
  const deadline = Date.now() + maxMs;
  for (;;) {
    const ok = await page.evaluate(`(() => {
      const imgs = [...document.querySelectorAll(".vn-stage .portrait img")];
      return imgs.length > 0 && imgs.every(i => i.complete && i.naturalWidth > 0);
    })()`);
    if (ok || Date.now() > deadline) return ok;
    await page.waitForTimeout(100);
  }
}

async function walkLines(page, expected) {
  const got = [];
  for (let i = 0; i < expected.length; i++) {
    const cur = await snapshot(page);
    got.push(cur);
    if (i < expected.length - 1) {
      await page.evaluate(() => window.AdvDialogue.next());
      await page.waitForTimeout(80);
    }
  }
  return got;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);

  // ---------- 事件一：新游戏开场 ----------
  console.log("—— 一、新游戏开场剧情 ——");
  await waitPortraits(page);
  const intro0 = await snapshot(page);
  T("新游戏后自动弹出开场剧情", intro0.modal === "newGameIntro", intro0);
  T("标题为「出发之前」", intro0.title === "出发之前", intro0);
  T("登场立绘为凯瑟琳与罗卡尔",
    intro0.portraits.length === 2
      && intro0.portraits.some(p => p.name === "凯瑟琳")
      && intro0.portraits.some(p => p.name === "罗卡尔"), intro0.portraits);
  T("两张立绘均真实加载（非占位/剪影）",
    intro0.portraits.length === 2 && intro0.portraits.every(p => p.src && p.loaded), intro0.portraits);
  T("进度显示 1 / 6", intro0.progress === "1 / 6", intro0);

  const introLines = await walkLines(page, INTRO_LINES);
  INTRO_LINES.forEach(([who, text], i) => {
    const cur = introLines[i] || {};
    T(`开场第 ${i + 1} 句说话者为${who}`, cur.speaker === who, cur);
    T(`开场第 ${i + 1} 句台词正确`, cur.text === text, cur);
    T(`开场第 ${i + 1} 句高亮立绘为${who}`,
      cur.speaking?.length === 1 && cur.speaking[0] === who, cur.speaking);
  });
  const introMutedOk = introLines.every(l => l.muted?.length === 1);
  T("每句仅一人高亮、另一人压暗", introMutedOk,
    introLines.map(l => ({ speaking: l.speaking, muted: l.muted })));

  const introBtn = await page.locator("[data-new-game-intro-complete]").count();
  T("末句出现开场完成按钮", introBtn === 1, { introBtn });

  const lockedBefore = await page.evaluate(() =>
    window.state.chars.filter(c => !c.locked).length);
  await page.locator("[data-new-game-intro-complete]").first().click();
  await page.waitForTimeout(500);
  const afterIntro = await page.evaluate(() => ({
    modal: window.state?.hallModal || null,
    flag: !!window.state.flags?.newGameIntroSeen,
    unlocked: window.state.chars.filter(c => !c.locked).length,
  }));
  T("点击后弹窗关闭", afterIntro.modal === null, afterIntro);
  T("置 newGameIntroSeen 标记", afterIntro.flag === true, afterIntro);
  T("开场剧情不解锁角色", afterIntro.unlocked === lockedBefore,
    { before: lockedBefore, after: afterIntro.unlocked });

  // 关闭后不应再次触发
  const retrigger = await page.evaluate(() => {
    const ok = window.triggerNewGameIntroEvent(window.state);
    return { ok, modal: window.state.hallModal };
  });
  T("已看过后不再重复触发", retrigger.ok === false, retrigger);

  // ---------- 事件二：首战胜利归来 ----------
  console.log("—— 二、首战胜利归来剧情 ——");
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").first().click();
  await page.locator(".map-node").first().waitFor({ state: "visible" });
  await page.locator(".onboarding-recommend").first().click();
  await page.locator(".battle-screen").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => !!window.state?.battle);

  await page.evaluate(async () => {
    const state = window.state, battle = state.battle;
    battle.defeatedEnemyIds = battle.enemies.map(e => e.id).filter(Boolean);
    battle.enemies.forEach(e => { e.hp = 0; });
    await window.DungeonNodeRewards.completeBattle(state, true);
    window.render?.();
  });
  await page.waitForFunction(() => window.state?.view === "dungeon", null, { timeout: 25000 });
  await page.waitForTimeout(500);

  await page.locator("[data-reward-confirm]").first().click();
  await page.waitForFunction(() => window.state?.view === "hall", null, { timeout: 25000 });
  await page.waitForTimeout(500);

  const vic0 = await snapshot(page);
  T("首战胜利回大厅弹出归来剧情", vic0.modal === "firstVictory", vic0);
  T("标题为「首战归来」", vic0.title === "首战归来", vic0);
  T("进度显示 1 / 3", vic0.progress === "1 / 3", vic0);
  T("归来剧情立绘为凯瑟琳与罗卡尔",
    vic0.portraits.length === 2
      && vic0.portraits.some(p => p.name === "凯瑟琳")
      && vic0.portraits.some(p => p.name === "罗卡尔"), vic0.portraits);

  const vicLines = await walkLines(page, VICTORY_LINES);
  VICTORY_LINES.forEach(([who, text], i) => {
    const cur = vicLines[i] || {};
    T(`归来第 ${i + 1} 句说话者为${who}`, cur.speaker === who, cur);
    T(`归来第 ${i + 1} 句台词正确`, cur.text === text, cur);
    T(`归来第 ${i + 1} 句高亮立绘为${who}`,
      cur.speaking?.length === 1 && cur.speaking[0] === who, cur.speaking);
  });

  const vicBtn = await page.locator("[data-first-victory-complete]").count();
  T("末句出现归来完成按钮", vicBtn === 1, { vicBtn });

  const unlockedBefore = await page.evaluate(() =>
    window.state.chars.filter(c => !c.locked).length);
  await page.locator("[data-first-victory-complete]").first().click();
  await page.waitForTimeout(500);
  const afterVic = await page.evaluate(() => ({
    modal: window.state?.hallModal || null,
    flag: !!window.state.flags?.firstVictorySeen,
    unlocked: window.state.chars.filter(c => !c.locked).length,
    doll: !window.state.chars.find(c => c.id === "besta_doll")?.locked,
  }));
  T("点击后弹窗关闭", afterVic.modal === null, afterVic);
  T("置 firstVictorySeen 标记", afterVic.flag === true, afterVic);
  T("归来剧情本身不解锁角色（魔偶由首战解锁）",
    afterVic.unlocked === unlockedBefore && afterVic.doll === true,
    { before: unlockedBefore, after: afterVic.unlocked, doll: afterVic.doll });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 5));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("FATAL", err);
  process.exit(1);
});
