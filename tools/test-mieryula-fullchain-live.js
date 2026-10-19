// 完整实机链路：新档 → 解锁废墟沙城 → 击败XX型凋零者1312号（走真实结算）→ 回别墅 → 米尔尤拉解锁
// BOSS 战用真实结算函数模拟（queueBattleExtras + retryPending，
// 与真实 BOSS 击败走的是同一个 unlockEliteCards 写入口），其余全部走真实 UI 与真实点击。
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
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.waitForTimeout(300);

  // 0. 新档基线
  const base = await page.evaluate(() => {
    const s = window.state;
    const m = s.chars.find(c => c.id === "mieryula");
    return { hasMieryula: !!m, locked: !!m?.locked, elites: [...(s.defeatedElites || [])], view: s.view };
  });
  T("新档：米尔尤拉角色存在且处于锁定", base.hasMieryula && base.locked === true, base);
  T("新档：defeatedElites 为空", base.elites.length === 0, base);
  T("新档：已进入大厅", base.view === "hall", base);

  // 1. 真实解锁废墟沙城（走真实弹窗 + 真实完成按钮）
  const ruins = await page.evaluate(() => {
    const s = window.state;
    s.flags.ruinsSandCityUnlockPending = true;
    const fired = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    window.render?.();
    return { fired: !!fired, modal: s.hallModal };
  });
  T("废墟沙城：triggerPending 弹出解锁弹窗", ruins.modal === "ruinsSandCityUnlock", ruins);
  await page.waitForSelector(".adv-box", { timeout: 5000 });
  await page.click("[data-adv-skip]");
  await page.waitForSelector(".actions button", { timeout: 5000 });
  const ruinBtn = await page.evaluate(() => [...document.querySelectorAll(".actions button")]
    .map(b => [...b.attributes].map(a => a.name)
      .find(n => n.startsWith("data-") && n !== "data-close-modal")).filter(Boolean)[0]);
  await page.click(`[${ruinBtn}]`);
  await page.waitForTimeout(700);
  const afterRuins = await page.evaluate(() => {
    const s = window.state;
    return {
      unlocked: !!s.flags.ruinsSandCityUnlocked,
      modal: s.hallModal,
      artina: s.chars.find(c => c.id === "artina")?.locked === false,
    };
  });
  T("废墟沙城：解锁完成，flag 置位", afterRuins.unlocked === true, afterRuins);
  T("废墟沙城：完成后弹窗关闭", afterRuins.modal === null, afterRuins);

  // 2. 模拟击败1312号：走真实结算（unlockEliteCards 写入 defeatedElites）
  await page.evaluate(() => {
    const s = window.state;
    const run = {
      missionId: "ruins_sand_city", focusId: "ruins_sand_city", difficultyId: "normal",
      complete: true, party: ["lokar"], activeParty: ["lokar"],
    };
    window.DungeonSettlementActions.queueBattleExtras(
      s, run, "boss", { defeatedEnemyIds: ["witherer_1312"] });
  });
  const applied = await page.evaluate(async () => {
    const s = window.state;
    try { await window.DungeonSettlementActions.retryPending(s); }
    catch (e) { return { error: String(e), elites: [...s.defeatedElites] }; }
    return { elites: [...s.defeatedElites] };
  });
  T("击败1312号：走真实结算写入 defeatedElites",
    (applied.elites || []).includes("witherer_1312"), applied);

  // 3. 返回别墅：调用真实副本结算后触发入口
  const back = await page.evaluate(() => {
    const s = window.state;
    s.view = "hall"; s.explore = null; s.battle = null;
    const fired = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    window.render?.();
    return { fired: !!fired, modal: s.hallModal };
  });
  T("返回别墅：自动弹出米尔尤拉解锁弹窗", back.modal === "mieryulaUnlock", back);

  // 4. 真实点击完成按钮
  await page.waitForSelector(".adv-box", { timeout: 5000 });
  await page.click("[data-adv-skip]");
  await page.waitForSelector(".actions button", { timeout: 5000 });
  const mieryulaBtn = await page.evaluate(() => [...document.querySelectorAll(".actions button")]
    .map(b => [...b.attributes].map(a => a.name)
      .find(n => n.startsWith("data-") && n !== "data-close-modal")).filter(Boolean)[0]);
  T("米尔尤拉：结尾完成按钮属性正确", mieryulaBtn === "data-mieryula-unlock-complete", { mieryulaBtn });
  await page.click(`[${mieryulaBtn}]`);
  await page.waitForTimeout(1000);

  const after = await page.evaluate(() => {
    const s = window.state;
    const m = s.chars.find(c => c.id === "mieryula");
    let saved = null;
    const raw = localStorage.getItem("succubus-kill-save-v1");
    if (raw) {
      const o = JSON.parse(raw);
      saved = {
        locked: Object.fromEntries((o.chars || []).map(x => [x.id, !!x.locked])),
        flags: o.flags || {},
        completed: { ...(o.unlockEvents?.completed || {}) },
      };
    }
    return {
      locked: !!m?.locked, hp: m?.hp, seen: !!s.flags?.mieryulaUnlockSeen,
      completed: !!s.unlockEvents?.completed?.mieryula, modal: s.hallModal, saved,
    };
  });
  T("米尔尤拉：点击完成按钮后角色解锁", after.locked === false, after);
  T("米尔尤拉：解锁后为满血", after.hp > 0, after);
  T("米尔尤拉：mieryulaUnlockSeen 置位", after.seen === true, after);
  T("米尔尤拉：unlockEvents 记录 mieryula=true", after.completed === true, after);
  T("米尔尤拉：完成后弹窗关闭（回到别墅）", after.modal === null, after);
  T("米尔尤拉：存档已写入且角色解锁",
    !!after.saved && after.saved.locked.mieryula === false, after.saved);

  // 5. 负向对照：未击败1312号时不得弹出
  const neg = await page.evaluate(() => {
    const s = window.state;
    s.flags.mieryulaUnlockSeen = false;
    const m = s.chars.find(c => c.id === "mieryula");
    if (m) m.locked = true;
    s.defeatedElites = [];
    s.hallModal = null;
    const fired = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    return { fired: !!fired, modal: s.hallModal };
  });
  T("负向：未击败1312号时不弹出米尔尤拉弹窗", neg.modal !== "mieryulaUnlock", neg);

  // 6. 排队冲突检查：1312号已击败但希特威条件同时满足时，米尔尤拉不应被永久吞掉
  const queue = await page.evaluate(() => {
    const s = window.state;
    const m = s.chars.find(c => c.id === "mieryula");
    if (m) m.locked = true;
    s.flags.mieryulaUnlockSeen = false;
    s.defeatedElites = ["witherer_1312", "pursuer_edis"];
    const hit = s.chars.find(c => c.id === "hitwell");
    if (hit) hit.locked = true;
    s.flags.hitwellUnlockSeen = false;
    s.hallModal = null;
    // 第一次：应弹出排在前面的希特威
    const first = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    const firstModal = s.hallModal;
    // 完成希特威后再次触发：应轮到米尔尤拉
    s.chars.find(c => c.id === "hitwell").locked = false;
    s.flags.hitwellUnlockSeen = true;
    s.hallModal = null;
    const second = window.NewCharacterUnlockEvents?.triggerPending?.(s);
    return { first: !!first, firstModal, second: !!second, secondModal: s.hallModal };
  });
  T("排队：希特威与米尔尤拉同时满足时先弹希特威", queue.firstModal === "hitwellUnlock", queue);
  T("排队：希特威完成后再次触发应轮到米尔尤拉", queue.secondModal === "mieryulaUnlock", queue);

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
