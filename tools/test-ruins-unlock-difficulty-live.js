// 实战：废墟沙城解锁的难度判定（triggerRuinsSandCityUnlockEvent）
// 同时回归星野一家解锁（recordDungeonClear，兽人地下城·冒险级），防止误改
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));

  const clean = () => {
    const s = window.state;
    s.flags ||= {};
    ["ruinsSandCityUnlockPending", "ruinsSandCityUnlockSeen", "ruinsSandCityUnlocked",
     "hoshinoFamilyUnlockPending", "hoshinoFamilyUnlockSeen"].forEach(k => delete s.flags[k]);
    s.hallModal = null;
    return s;
  };

  // 废墟沙城：应判定勇士级
  const warrior = await page.evaluate(fn => {
    const s = window.state; s.flags ||= {};
    ["ruinsSandCityUnlockPending","ruinsSandCityUnlockSeen","ruinsSandCityUnlocked"].forEach(k => delete s.flags[k]);
    s.hallModal = null;
    const fired = !!window[fn]?.(s, { missionId: "orc_dungeon", difficultyId: "warrior", complete: true });
    return { fired, pending: !!s.flags.ruinsSandCityUnlockPending, modal: s.hallModal };
  }, "triggerRuinsSandCityUnlockEvent");
  check("勇士级通关 → 触发废墟沙城解锁", warrior.fired && warrior.pending && warrior.modal === "ruinsSandCityUnlock", warrior);

  const adv = await page.evaluate(fn => {
    const s = window.state; s.flags ||= {};
    ["ruinsSandCityUnlockPending","ruinsSandCityUnlockSeen","ruinsSandCityUnlocked"].forEach(k => delete s.flags[k]);
    s.hallModal = null;
    const fired = !!window[fn]?.(s, { missionId: "orc_dungeon", difficultyId: "adventure", complete: true });
    return { fired, pending: !!s.flags.ruinsSandCityUnlockPending };
  }, "triggerRuinsSandCityUnlockEvent");
  check("冒险级通关 → 不触发（不能提前解锁）", !adv.fired && !adv.pending, adv);

  const other = await page.evaluate(fn => {
    const s = window.state; s.flags ||= {};
    delete s.flags.ruinsSandCityUnlockPending; s.hallModal = null;
    const fired = !!window[fn]?.(s, { missionId: "underwater_train", difficultyId: "warrior", complete: true });
    return { fired, pending: !!s.flags.ruinsSandCityUnlockPending };
  }, "triggerRuinsSandCityUnlockEvent");
  check("其他副本勇士级 → 不触发", !other.fired && !other.pending, other);

  // 回归：星野一家（冒险级），确认未被误改
  const hoshino = await page.evaluate(() => {
    const s = window.state; s.flags ||= {};
    delete s.flags.hoshinoFamilyUnlockPending;
    delete s.flags.hoshinoFamilyUnlockSeen;
    const fn = window.NewCharacterUnlockEvents?.recordDungeonClear;
    const fired = !!fn?.(s, { missionId: "orc_dungeon", difficultyId: "adventure", complete: true });
    return { fired, pending: !!s.flags.hoshinoFamilyUnlockPending };
  });
  check("回归：星野一家（兽人地下城·冒险级）仍触发", hoshino.fired && hoshino.pending, hoshino);

  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  console.log("页面错误:", errors.length ? errors : "none");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
