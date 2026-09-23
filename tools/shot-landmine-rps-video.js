// 录像：地雷猜拳完整流程（埋雷 → 点击地雷牌 → 选手势 → 结果 → 确认 → 拆除/受伤）
// 重点给人工复核猜拳 UI 是否正常、点击是否有反应、能否正常关闭
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = "/data/workspace/.video-rps";
const OUT = "/data/workspace/地雷猜拳演示.mp4";

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

// 直接给我方首位注入一颗地雷（来源=敌方首位），确保猜拳一定能演示
const injectMine = `(() => {
  const b = window.state.battle;
  const ally = (b.allies || [])[0];
  const foe = (b.enemies || [])[0];
  if (!ally || !foe) return { missing: true };
  const mine = window.BattleStatusCardRegistry?.create?.("landmine", foe);
  if (!mine) return { noMine: true };
  mine.landmineAttack = foe.stats?.attack ?? 11;
  mine.landmineSourceUid = foe.uid;
  ally.hand = ally.hand || [];
  ally.hand.push(mine);
  window.BattleStatusCards?.sync?.(ally, b);
  window.BattleLog?.add?.(window.state,
    \`【演示】\${foe.name} 在\${ally.name}的手牌区埋设了一颗地雷（伤害 \${mine.landmineAttack}）。\`);
  return { ally: ally.name, mineAtk: mine.landmineAttack, hand: ally.hand.length };
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
    log: (window.state.log || []).slice(0, 12),
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

    // 注入地雷，确保猜拳一定可演示
    console.log("注入地雷:", JSON.stringify(await page.evaluate(injectMine)));

    // 切到我方出牌阶段并解锁（地雷猜拳只在我方出牌阶段可发起）
    await page.evaluate(`(() => {
      const b = window.state.battle;
      b.activeUid = b.allies[0].uid;
      b.phase = 4;
      b.locked = false;
      window.render();
      return { activeUid: b.activeUid, phase: b.phase };
    })()`);
    await wait(2500); // 等发牌动画，让地雷牌在手牌区渲染出来

    // --- 点击手牌区的地雷牌，发起猜拳 ---
    const mineCard = page.locator(".active-hand [data-card-index]", { hasText: "地雷" }).first();
    const mineCount = await mineCard.count();
    check("手牌区能找到地雷牌", mineCount > 0, { count: mineCount });
    if (mineCount > 0) {
      await mineCard.click();
      await wait(900);
    }

    let s = await page.evaluate(snap);
    console.log("点击地雷后:", JSON.stringify(s));
    check("猜拳弹窗已打开", s.prompt === true && s.overlay === true, s);
    check("手势按钮出现（3个）", s.gestures === 3, { gestures: s.gestures });
    check("「暂不猜拳」按钮存在", s.skip === true, s.skip);

    // --- 选手势（石头）---
    if (s.gestures > 0) {
      await page.locator("[data-landmine-rps-choice]").first().click();
      await wait(900);
    }
    s = await page.evaluate(snap);
    console.log("选手势后:", JSON.stringify(s));
    check("出现结果确认按钮", s.confirm === true, s);

    // --- 确认结果（平局则再选一次，最多 3 轮）---
    for (let i = 0; i < 3; i += 1) {
      if (!s.confirm) break;
      await page.locator("[data-landmine-rps-result-confirm]").click();
      await wait(1000);
      s = await page.evaluate(snap);
      console.log(`第${i + 1}次确认后:`, JSON.stringify({ prompt: s.prompt, locked: s.locked, gestures: s.gestures }));
      if (!s.prompt) break; // 已结算关闭
      // 平局 → 继续选手势
      if (s.gestures > 0) {
        await page.locator("[data-landmine-rps-choice]").first().click();
        await wait(900);
        s = await page.evaluate(snap);
      }
    }

    check("猜拳结束后弹窗关闭", s.prompt === false, { prompt: s.prompt });
    check("猜拳结束后已解锁（不卡死）", s.locked === false, { locked: s.locked });
    check("猜拳日志已生成",
      (s.log || []).some(t => /猜拳/.test(String(t))), (s.log || []).filter(t => /猜拳|地雷/.test(String(t))).slice(0, 5));

    await wait(1500);
    check("页面无错误", errors.length === 0, errors.slice(0, 2).join(" / "));
  } catch (e) {
    check("脚本异常", false, String(e.message || e).slice(0, 200));
  } finally {
    await context.close();
    await browser.close();
  }

  // 转 mp4
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
