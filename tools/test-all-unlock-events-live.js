// 实战：17 个剧情/解锁事件「能不能真正解锁」的严格检查
// 每个事件：重置存档 → 按服务端口径准备真实前置条件 → 打开弹窗 → ADV 推进到结尾
// → 真实点击完成按钮 → 断言角色/标记/进度三处都落地。
// 前置条件取自 local-core-events.js 的 unlockEvent 分支，不是凭空设置标志。
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
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

// setup 在页面内执行，必须与 local-core-events.js 的判定口径一致
const CASES = [
  { modal: "firstDefeat", id: "first_defeat", expect: { chars: ["loki"] },
    setup: `s.flags.firstDefeatSeen = true;` },
  { modal: "secondDefeat", id: "second_defeat", expect: { chars: ["carlos"] },
    setup: `s.flags.secondDefeatSeen = true;` },
  { modal: "millerUnlock", id: "miller", expect: { chars: ["miller"] },
    setup: `u("manny");` },
  { modal: "gerlotUnlock", id: "gerlot", expect: { chars: ["gerlot"] },
    setup: `u("bertis");` },
  { modal: "cadicisUnlock", id: "cadicis", expect: { chars: ["cadicis"] },
    setup: `u("wendy");` },
  { modal: "lukaUnlock", id: "luka", expect: { chars: ["luka"] },
    setup: `u("angelica");` },
  { modal: "littleElranaUnlock", id: "little_elrana", expect: { chars: ["little_elrana"] },
    setup: `s.flags.littleElranaUnlockPending = true;` },
  { modal: "aceUnlock", id: "ace", expect: { chars: ["ace"] },
    setup: `u("elrana");` },
  { modal: "underwaterTrainUnlock", id: "underwater_train", expect: { chars: ["aileng"] },
    setup: `u("nanali");` },
  { modal: "opheliaUnlock", id: "ophelia", expect: { chars: ["ophelia"] },
    setup: `s.flags.underwaterTrainFirstClear = true;` },
  { modal: "bestaNurseryUnlock", id: "besta_nursery", expect: { flags: ["bestaNurseryUnlocked"] },
    setup: `s.flags.bestaNurseryUnlockPending = true;` },
  { modal: "orcDungeonUnlock", id: "orc_dungeon", expect: { flags: ["orcDungeonUnlocked"] },
    setup: `s.flags.orcDungeonUnlockPending = true;` },
  { modal: "soniaNurseryUnlock", id: "sonia_nursery", expect: { flags: ["soniaNurseryUnlocked"] },
    setup: `s.defeatedElites.push("xx_witherer_1124");` },
  { modal: "chiyoRecruitUnlock", id: "chiyo_recruit", expect: { chars: ["chiyo"] },
    setup: `s.defeatedElites.push("mechanical_bull_king");` },
  { modal: "gerdaNurseryUnlock", id: "gerda_nursery", expect: { flags: ["gerdaNurseryUnlocked"] },
    setup: `s.defeatedElites.push("demon_king_bakaar");` },
  { modal: "hoshinoFamilyUnlock", id: "hoshino_family", expect: { chars: ["hoshino_yi", "hoshino_kaiichi"] },
    setup: `s.flags.hoshinoFamilyUnlockPending = true;` },
  { modal: "ruinsSandCityUnlock", id: "ruins_sand_city", expect: { chars: ["artina", "maria"], flags: ["ruinsSandCityUnlocked"] },
    setup: `s.flags.ruinsSandCityUnlockPending = true;` },
];

const resetAndSetup = (page, modal, setupSrc) => page.evaluate(({ modal, setupSrc, noPre }) => {
  const s = window.state;
  // 回到新档：只有罗卡尔与贝丝妲魔偶可用
  s.chars.forEach(c => { c.locked = !(c.id === "lokar" || c.id === "besta_doll"); });
  s.flags = {};
  s.defeatedElites = [];
  s.unlockEvents = { version: 2, completed: {} };
  s.unlockedDifficulties = ["normal"];
  s.adv = null;
  s.hallModal = null;
  s.battle = null;
  s.explore = null;
  s.view = "hall";
  const u = id => { const c = s.chars.find(x => x.id === id); if (c) c.locked = false; };
  // NO_PREREQ=1 用于反向验证：跳过前置条件，事件应当无法完成
  if (!noPre) new Function("s", "u", setupSrc)(s, u);
  s.hallModal = modal;
  window.render?.();
}, { modal, setupSrc, noPre: process.env.NO_PREREQ === "1" });

const probe = page => page.evaluate(() => {
  const s = window.state;
  const byId = id => s.chars.find(c => c.id === id);
  return {
    locked: Object.fromEntries(s.chars.map(c => [c.id, !!c.locked])),
    flags: s.flags || {},
    completed: { ...(s.unlockEvents?.completed || {}) },
    btnAttrs: [...document.querySelectorAll(".actions button")]
      .map(b => [...b.attributes].map(a => a.name).find(n => n.startsWith("data-") && n !== "data-close-modal") || null)
      .filter(Boolean),
    hasAdv: !!document.querySelector(".adv-box"),
    modal: s.hallModal,
    _byId: !!byId("lokar"),
  };
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(400);

  for (const c of CASES) {
    await resetAndSetup(page, c.modal, c.setup);
    await page.waitForSelector(".adv-box", { timeout: 5000 });
    const before = await probe(page);
    T(`${c.modal}：弹窗渲染出 ADV 对话框`, before.hasAdv, before);
    T(`${c.modal}：前置下尚未完成`, !before.completed[c.id], before.completed);

    // 推进到结尾（真实点击"跳到结尾"）
    await page.click("[data-adv-skip]");
    await page.waitForSelector(".actions button", { timeout: 5000 });
    const atEnd = await probe(page);
    T(`${c.modal}：结尾出现完成按钮`, atEnd.btnAttrs.length >= 1, atEnd);

    // 真实点击完成按钮
    const attr = atEnd.btnAttrs[0];
    await page.click(`[${attr}]`);
    await page.waitForTimeout(500);
    const after = await probe(page);

    // 断言 1：进度记录为该事件已完成
    T(`${c.modal}：unlockEvents 记录 ${c.id}=true`, after.completed[c.id] === true, after.completed);
    // 断言 2：目标角色解锁
    (c.expect.chars || []).forEach(id => {
      T(`${c.modal}：角色 ${id} 已解锁`, after.locked[id] === false, { locked: after.locked[id] });
    });
    // 断言 3：目标标记置位
    (c.expect.flags || []).forEach(f => {
      T(`${c.modal}：标记 ${f} 已置位`, !!after.flags[f], { flag: f, flags: Object.keys(after.flags) });
    });
    // 断言 4：弹窗已关闭（完成即返回别墅）
    T(`${c.modal}：完成后弹窗关闭`, after.modal === null || after.modal !== c.modal, { modal: after.modal });
  }

  // —— 2. 触发链：真实前置 → 真实 trigger 函数 → 是否弹出对应弹窗 ——
  // 只测"能不能弹出来"：条件不满足就必须返回 false，否则玩家会看到不该出现的剧情。
  const TRIGGERS = [
    { modal: "millerUnlock", setup: `u("manny");`, call: `window.HallUnlockEvents.trigger("millerUnlock")` },
    { modal: "gerlotUnlock", setup: `u("bertis");`, call: `window.HallUnlockEvents.trigger("gerlotUnlock")` },
    { modal: "cadicisUnlock", setup: `u("wendy");`, call: `window.HallUnlockEvents.trigger("cadicisUnlock")` },
    { modal: "lukaUnlock", setup: `u("angelica");`, call: `window.HallUnlockEvents.trigger("lukaUnlock")` },
    { modal: "aceUnlock", setup: `u("elrana");`, call: `window.triggerAceUnlockEvent()` },
    { modal: "underwaterTrainUnlock", setup: `u("nanali");`, call: `window.triggerUnderwaterTrainUnlockEvent()` },
    { modal: "opheliaUnlock", setup: `s.flags.underwaterTrainFirstClear = true;`, call: `window.triggerPendingPostUnderwaterTrainEvents(s)` },
    { modal: "bestaNurseryUnlock", setup: `s.flags.bestaNurseryUnlockPending = true;`, call: `window.triggerPendingPostUnderwaterTrainEvents(s)` },
    { modal: "orcDungeonUnlock", setup: `s.flags.orcDungeonUnlockPending = true;`, call: `window.OrcUnlockEvents.triggerPending(s)` },
    { modal: "ruinsSandCityUnlock", setup: `s.flags.ruinsSandCityUnlockPending = true;`, call: `window.OrcUnlockEvents.triggerPending(s)` },
    { modal: "ruinsSandCityUnlock", setup: `s.flags.ruinsSandCityUnlockPending = true;`, call: `window.NewCharacterUnlockEvents.triggerPending(s)` },
    { modal: "hoshinoFamilyUnlock", setup: `s.flags.hoshinoFamilyUnlockPending = true;`, call: `window.NewCharacterUnlockEvents.triggerPending(s)` },
    { modal: "gerdaNurseryUnlock", setup: `s.defeatedElites.push("demon_king_bakaar");`, call: `window.NewCharacterUnlockEvents.triggerPending(s)` },
    { modal: "chiyoRecruitUnlock", setup: `s.defeatedElites.push("mechanical_bull_king");`, call: `window.RecruitUnlockEvents.triggerPending(s)` },
    { modal: "soniaNurseryUnlock", setup: `s.defeatedElites.push("xx_witherer_1124");`, call: `window.RecruitUnlockEvents.triggerPending(s)` },
  ];
  for (const t of TRIGGERS) {
    await resetAndSetup(page, null, t.setup);
    const r = await page.evaluate(({ call }) => {
      const s = window.state;
          const fired = new Function("s", `return (${call});`)(s);
      return { fired: !!fired, modal: s.hallModal, view: s.view };
    }, { call: t.call });
    // 大厅渲染时 triggerAll 可能已自动弹出，故只断言最终弹窗正确（fired 仅作参考）
    T(`触发 ${t.call.slice(0, 46)}… → ${t.modal}`, r.modal === t.modal, r);
    // 反向：不设前置时同一入口不得弹出该弹窗
    await resetAndSetup(page, null, "");
    const no = await page.evaluate(({ call }) => {
      const s = window.state;
          const fired = new Function("s", `return (${call});`)(s);
      return { fired: !!fired, modal: s.hallModal };
    }, { call: t.call });
    T(`无前置时 ${t.call.slice(0, 40)}… 不弹出 ${t.modal}`, no.modal !== t.modal, no);
  }

  // —— 3. 持久化：完成后 flush 存档，解锁必须写进存档本身 ——
  // 存档是可读 JSON（succubus-kill-save-v1），直接查 chars/flags/unlockEvents 三处。
  for (const c of ["ruinsSandCityUnlock", "orcDungeonUnlock"]) {
    const flag = c === "ruinsSandCityUnlock" ? "ruinsSandCityUnlockPending" : "orcDungeonUnlockPending";
    await resetAndSetup(page, c, `s.flags.${flag} = true;`);
    await page.waitForSelector(".adv-box", { timeout: 5000 });
    await page.click("[data-adv-skip]");
    await page.waitForSelector(".actions button", { timeout: 5000 });
    const attr = (await probe(page)).btnAttrs[0];
    await page.click(`[${attr}]`);
    await page.waitForTimeout(900);
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem("succubus-kill-save-v1");
      if (!raw) return null;
      const o = JSON.parse(raw);
      return {
        locked: Object.fromEntries((o.chars || []).map(x => [x.id, !!x.locked])),
        flags: o.flags || {},
        completed: { ...(o.unlockEvents?.completed || {}) },
      };
    });
    T(`${c}：存档已写入`, !!saved, { saved });
    if (!saved) continue;
    if (c === "ruinsSandCityUnlock") {
      T("存档中 artina 已解锁", saved.locked.artina === false, { artina: saved.locked.artina });
      T("存档中 maria 已解锁", saved.locked.maria === false, { maria: saved.locked.maria });
      T("存档中 ruins_sand_city 已完成", saved.completed.ruins_sand_city === true, saved.completed);
    } else {
      T("存档中 orcDungeonUnlocked 已置位", !!saved.flags.orcDungeonUnlocked, saved.flags);
      T("存档中 orc_dungeon 已完成", saved.completed.orc_dungeon === true, saved.completed);
    }
  }

  T("全程无 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
