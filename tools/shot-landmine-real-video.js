// 录像：真实链路 —— 士兵自己在出牌阶段发动【放置地雷】→ 我方点击地雷牌 → 猜拳 → 结算
// 与 shot-landmine-rps-video.js 的区别：地雷由士兵技能真实产生（非脚本注入）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = "/data/workspace/.video-rps2";
const OUT = "/data/workspace/士兵埋雷猜拳演示.mp4";

// 把敌方首位替换成贵族军士兵（保留 uid，避免破坏战斗结构）
const useSoldier = `(() => {
  const b = window.state.battle;
  const src = (window.GameDataRuinsSandCityEnemies || [])
    .find(e => e.id === "noble_soldier");
  if (!src || !b?.enemies?.length) return { missing: true };
  const e = b.enemies[0];
  Object.assign(e, {
    name: src.name, id: src.id, ai: src.ai, hp: 64, maxHp: 64,
    stats: { attack: 11, magic: 8, speed: 12 },
    handLimit: src.handLimit, drawPerTurn: src.drawPerTurn,
    usedRuinsLandmine: false,
  });
  e.skills = src.skills;
  return { name: e.name, ai: e.ai, uid: e.uid };
})()`;

// 切到敌方出牌阶段，让士兵真实发动放置地雷
const soldierMine = `(() => {
  const st = window.state, b = st.battle;
  const foe = (b.enemies || [])[0];
  const ally = (b.allies || [])[0];
  if (!foe || !ally) return { missing: true };
  b.activeUid = foe.uid;
  b.phase = 4;          // 出牌阶段
  b.locked = false;
  foe.usedRuinsLandmine = false;
  window.render();

  const move = window.RuinsGruntSkills?.landmineMove?.(st, foe);
  if (!move) return { noMove: true, handFoe: foe.hand?.length };
  const tgt = move.target;
  const before = { foeHand: foe.hand?.length, tgtHand: tgt.hand?.length };
  window.RuinsGruntSkills?.usePlaceLandmine?.(st, foe, tgt);
  window.render();
  const cards = [...(tgt.hand || []), ...(tgt.statuses || [])];
  return {
    before,
    after: { foeHand: foe.hand?.length, tgtHand: tgt.hand?.length },
    mineCount: cards.filter(c => window.BattleStatusCardRegistry?.keyOf?.(c) === "landmine").length,
    targetName: tgt?.name,
    targetUid: tgt?.uid,
  };
})()`;

const snap = `(() => {
  const b = window.state.battle;
  return {
    locked: !!b.locked,
    prompt: !!b.landmineRpsPrompt,
    gestures: document.querySelectorAll("[data-landmine-rps-choice]").length,
    confirm: !!document.querySelector("[data-landmine-rps-result-confirm]"),
    skip: !!document.querySelector("[data-landmine-rps-skip]"),
    overlay: !!document.querySelector(".manual-dodge-overlay"),
    log: (window.state.log || []).slice(0, 10),
  };
})()`;

(async () => {
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e).slice(0, 160)));
  const results = [];
  const check = (name, ok, extra) => {
    results.push({ ok: !!ok, name });
    console.log(`${ok ? "✅" : "❌"} ${name}${extra !== undefined ? "  " + JSON.stringify(extra) : ""}`);
  };
  const wait = ms => page.waitForTimeout(ms);

  try {
    await openGame(page, { scenario: "standard-battle", missionId: "orc_dungeon", difficultyId: "warrior" });
    await startRegressionBattle(page);
    await wait(1200);

    console.log("敌方首位:", JSON.stringify(await page.evaluate(useSoldier)));
    await wait(600);

    // --- 士兵真实发动放置地雷 ---
    const mine = await page.evaluate(soldierMine);
    console.log("士兵埋雷:", JSON.stringify(mine));
    check("士兵发动了放置地雷", mine.mineCount > 0, mine);
    check("士兵弃掉自己一张牌（手牌-1）",
      mine.after.foeHand === mine.before.foeHand - 1, mine);
    check("地雷是新增（目标手牌+1）",
      mine.after.tgtHand === mine.before.tgtHand + 1, mine);
    await wait(2000);

    // --- 切到【实际持雷角色】的出牌阶段，点击地雷牌发起猜拳 ---
    await page.evaluate(`(() => {
      const b = window.state.battle;
      b.activeUid = ${JSON.stringify(mine.targetUid || null)} || b.allies[0].uid;
      b.phase = 4;
      b.locked = false;
      window.render();
      return { activeUid: b.activeUid, phase: b.phase };
    })()`);
    await wait(2000);

    const mineCard = page.locator(".active-hand [data-card-index]", { hasText: "地雷" }).first();
    const cnt = await mineCard.count();
    check("我方手牌区能看到地雷牌", cnt > 0, { count: cnt });
    if (cnt > 0) {
      await mineCard.click();
      await wait(1000);
    }

    let s = await page.evaluate(snap);
    console.log("点击地雷后:", JSON.stringify(s));
    check("猜拳弹窗已打开", s.prompt === true && s.overlay === true, s);
    check("手势按钮出现（3个）", s.gestures === 3, { gestures: s.gestures });

    // --- 选手势 ---
    if (s.gestures > 0) {
      await page.locator("[data-landmine-rps-choice]").first().click();
      await wait(1000);
    }
    s = await page.evaluate(snap);
    console.log("选手势后:", JSON.stringify(s));
    check("出现结果确认按钮", s.confirm === true, s);

    // --- 确认结果（平局则再选，最多 3 轮）---
    for (let i = 0; i < 3; i += 1) {
      if (!s.confirm) break;
      await page.locator("[data-landmine-rps-result-confirm]").click();
      await wait(1200);
      s = await page.evaluate(snap);
      console.log(`第${i + 1}次确认后:`, JSON.stringify({ prompt: s.prompt, locked: s.locked }));
      if (!s.prompt) break;
      if (s.gestures > 0) {
        await page.locator("[data-landmine-rps-choice]").first().click();
        await wait(1000);
        s = await page.evaluate(snap);
      }
    }

    check("猜拳结束后弹窗关闭", s.prompt === false, { prompt: s.prompt });
    check("猜拳结束后已解锁（不卡死）", s.locked === false, { locked: s.locked });
    check("猜拳日志已生成",
      (s.log || []).some(t => /猜拳/.test(String(t))),
      (s.log || []).filter(t => /猜拳|地雷/.test(String(t))).slice(0, 4));

    await wait(1500);
    check("页面无错误", errors.length === 0, errors.slice(0, 2).join(" / "));
  } catch (e) {
    check("脚本异常", false, String(e.message || e).slice(0, 200));
  } finally {
    await context.close();
    await browser.close();
  }

  try {
    const files = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith(".webm"));
    if (files.length) {
      const src = path.join(VIDEO_DIR, files[0]);
      fs.rmSync(OUT, { force: true });
      require("child_process").execSync(
        `ffmpeg -y -i "${src}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${OUT}" 2>/dev/null`,
        { stdio: "pipe" });
    }
  } catch (e) { /* ffmpeg 不可用时保留 webm */ }

  const pass = results.filter(r => r.ok).length;
  console.log(`\n汇总：${pass} 通过 / ${results.length - pass} 失败`);
  console.log(`录像：${fs.existsSync(OUT) ? OUT : VIDEO_DIR}`);
  process.exit(pass === results.length ? 0 : 1);
})();
