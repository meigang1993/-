// 实战核查：解锁事件「结尾完成按钮」点击后是否真的生效。
// 起因：玩家反馈「贝丝妲的玩具」事件里「带希特威同行」点了没反应。
// 检查：每个剧情解锁事件跳到结尾 → 点击完成按钮 → 事件是否真的完成（角色解锁/flag 生效）。
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

// 每个事件：前置条件 + 完成后应有的结果
const CASES = [
  {
    modal: "hitwellUnlock", id: "hitwell", char: "hitwell",
    setup: s => { s.defeatedElites = ["pursuer_edis"]; },
    label: "希特威（贝丝妲的玩具）",
  },
  {
    modal: "ruinsSandCityUnlock", id: "ruins_sand_city", char: "artina",
    setup: s => { s.flags.ruinsSandCityUnlockPending = true; },
    label: "废墟沙城/亚缇娜",
  },
  {
    modal: "hoshinoFamilyUnlock", id: "hoshino_family", char: "hoshino_yi",
    setup: s => { s.flags.hoshinoFamilyUnlockPending = true; },
    label: "星野一家",
  },
  {
    modal: "gerdaNurseryUnlock", id: "gerda_nursery", flag: "gerdaNurseryUnlocked",
    setup: s => { s.defeatedElites = ["demon_king_bakaar"]; },
    label: "格尔达兑换",
  },
];

const openModal = async (page, modal) => {
  await page.evaluate(m => {
    const s = window.state;
    s.view = "hall"; s.battle = null; s.explore = null; s.hallModal = m; s.adv = null;
    window.render?.();
  }, modal);
  await page.waitForSelector(".adv-box", { timeout: 5000 });
  await page.waitForTimeout(120);
};

const prepare = (page, c) => page.evaluate(cfg => {
  const s = window.state;
  // 让角色回到未解锁，保证每次都是干净的初始态
  const ch = s.chars.find(x => x.id === cfg.char);
  if (ch) ch.locked = true;
  if (cfg.flag) delete s.flags[cfg.flag];
  delete s.flags.hitwellUnlockSeen;
  delete s.flags.hoshinoFamilyUnlockSeen;
  delete s.flags.ruinsSandCityUnlockSeen;
  window.UnlockEventProgress?.reset?.(s);
  s.defeatedElites = [];
  return true;
}, { char: c.char, flag: c.flag || null });

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
    // 前置条件在页面内执行（setup 是函数，需在浏览器上下文跑）
    await page.evaluate(src => {
      const s = window.state;
      s.defeatedElites = [];
      delete s.flags.ruinsSandCityUnlockPending;
      delete s.flags.hoshinoFamilyUnlockPending;
      new Function("s", src)(s);
    }, `(${c.setup.toString()})(s);`);

    const before = await page.evaluate(ch => {
      const s = window.state;
      const c = ch ? s.chars.find(x => x.id === ch) : null;
      return { locked: c ? !!c.locked : null };
    }, c.char || null);

    await openModal(page, c.modal);
    await page.click("[data-adv-skip]");
    await page.waitForTimeout(180);

    const btn = await page.evaluate(() => {
      const b = document.querySelector(".modal-card .actions button");
      return b ? { html: b.outerHTML.slice(0, 120), text: (b.textContent || "").trim() } : null;
    });
    T(`${c.label}：结尾出现完成按钮`, !!btn, { btn });

    await page.click(".modal-card .actions button");
    await page.waitForTimeout(600);

    const after = await page.evaluate(({ ch, flag, id }) => {
      const s = window.state;
      const c = ch ? s.chars.find(x => x.id === ch) : null;
      return {
        locked: c ? !!c.locked : null,
        flag: flag ? !!s.flags[flag] : null,
        completed: window.UnlockEventProgress?.isCompleted?.(s, id),
        modal: s.hallModal,
      };
    }, { ch: c.char || null, flag: c.flag || null, id: c.id });

    if (c.char) {
      T(`${c.label}：点击后角色解锁`, before.locked === true && after.locked === false,
        { before: before.locked, after: after.locked, modal: after.modal });
    }
    if (c.flag) {
      T(`${c.label}：点击后 flag 生效`, after.flag === true, { flag: after.flag, modal: after.modal });
    }
    T(`${c.label}：事件标记为已完成`, after.completed === true, { completed: after.completed });
    T(`${c.label}：弹窗已关闭`, after.modal === null, { modal: after.modal });
  }

  T("全程无页面错误", errors.length === 0, { errors: errors.slice(0, 3) });

  console.log(`\n=== ${pass}/${total} ===`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
