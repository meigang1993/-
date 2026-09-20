// 真实浏览器实战：验证【混乱】【冰冻】两张状态牌判定成功后是否真的有效果。
// 真实链路：注入状态牌 → 控制判定牌花色 → 调用 judgement() → 检查标志位/日志/杀牌可用性/UI 标识。
// 判定规则（battle-status-card-triggers.js judgement）：
//   混乱 → ♠或♥ 命中 → triggerConfusion（随机对同伴视为使用虚拟杀；无同伴则自伤+跳过出牌）
//   冰冻 → ♦或♣ 命中 → frozenSlash = true（本回合无法使用【杀】）
// 判定牌来源：unit.deck.pop()，故直接把 deck 设成单张指定花色即可控制成败。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const VIDEO_DIR = "/data/workspace/vid-confusion-freeze";

async function enterBattle(page) {
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    // 敌方换成贵族军士兵（放置地雷/麻痹毒子弹所属怪）
    const list = window.GameData?.testEnemies || [];
    const idx = list.findIndex(e => e.id === "noble_soldier" || e.name === "贵族军士兵");
    window.state.testEnemies = idx >= 0 ? [idx] : [0];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() =>
    !window.BattleEffects.animating
      && !window.BattleEffects.draining
      && !window.state?.battle?.animQueue?.length, null, { timeout: 60000 });
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    battle.allies.concat(battle.enemies)
      .forEach(unit => unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
  });
}

// 每个场景通用的执行体：重置 → 注入 → 判定 → 采样
const runTpl = (statusKey, suit) => `(() => {
  const b = window.state.battle;
  const u = b.allies[0];
  // 重置上一场景遗留标志
  u.skipPlayPhase = false; u.skipPlayReason = null;
  u.skipDrawPhase = false; u.drawLockedThisTurn = false;
  u.frozenSlash = false;
  u.hp = 200; u.maxHp = 200;
  // 清掉手牌里其它状态牌，只留本场景这一张
  u.hand = (u.hand || []).filter(c => !c._statusKey && !window.BattleStatusCardRegistry.isStatus?.(c));
  u.hand = u.hand.filter(c => !(c.name === "混乱" || c.name === "冰冻"
    || c.name === "麻痹" || c.name === "眩晕" || c.name === "封魔"));
  const card = window.BattleStatusCardRegistry.create("${statusKey}");
  if (!card) return { error: "create 返回 null" };
  u.hand.push(card);
  window.BattleStatusCardRegistry.sync(u, b);
  // 控制判定牌：deck 只放一张指定花色，discard 清空避免 reshuffle 干扰
  u.deck = [{ suit: "${suit}", name: "判定", type: "slash", power: 0 }];
  u.discard = [];
  b.activeUid = u.uid; b.phase = 4; b.locked = false;
  window.state.log.length = 0;
  const before = { hp: u.hp, handCount: u.hand.length };
  window.BattleStatusCardTriggers.judgement(window.state, u);
  // 采样：杀牌可用性（UI 层真实点击，注入一张杀看能否选中）
  u.hand.push({ name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "♠" });
  window.render();
  const killIndex = u.hand.length - 1;
  const cardEl = document.querySelector('.play-card[data-card-index="' + killIndex + '"]');
  const cardDisabled = cardEl ? cardEl.className.includes("disabled") : null;
  b.selectedCardIndex = null;
  if (cardEl) cardEl.click();
  window.render();
  const canKill = b.selectedCardIndex === killIndex;
  const el = document.querySelector('.unit[data-target="' + u.uid + '"]');
  const icons = el ? Array.from(el.querySelectorAll(".status-icon")).map(n => n.textContent.trim()) : [];
  return {
    name: u.name,
    frozenSlash: !!u.frozenSlash,
    skipPlayPhase: !!u.skipPlayPhase,
    skipPlayReason: u.skipPlayReason || null,
    canKill,
    cardDisabled,
    icons,
    hp: u.hp,
    before,
    log: window.state.log.slice(0, 8),
  };
})()`;

const cases = [
  { name: "混乱·判定成功(♠)", statusKey: "confusion", suit: "♠",
    check: r => r.log.some(l => l.includes("混乱触发")) || r.skipPlayReason === "混乱" },
  { name: "混乱·判定失败(♦)", statusKey: "confusion", suit: "♦",
    check: r => !r.log.some(l => l.includes("混乱触发")) && r.skipPlayReason !== "混乱" },
  { name: "冰冻·判定成功(♦)", statusKey: "freeze", suit: "♦",
    check: r => r.frozenSlash === true && r.canKill === false
      && r.icons.includes("冻") && r.log.some(l => l.includes("无法使用【杀】牌")) },
  { name: "冰冻·判定失败(♠)", statusKey: "freeze", suit: "♠",
    check: r => r.frozenSlash === false && !r.icons.includes("冻")
      && r.icons.includes("冰") && r.log.some(l => l.includes("未触发")) },
];

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
  page.on("pageerror", e => errors.push(String(e)));
  let passed = 0;
  const failed = [];

  try {
    await openGame(page);
    await enterBattle(page);

    for (const item of cases) {
      const raw = await page.evaluate(runTpl(item.statusKey, item.suit));
      if (raw?.error) { failed.push(`${item.name} → ${raw.error}`); continue; }
      const ok = item.check(raw);
      if (ok) passed += 1;
      else failed.push(item.name);
      console.log(`\n[${ok ? "✅" : "❌"}] ${item.name}`);
      console.log(`   单位=${raw.name} frozenSlash=${raw.frozenSlash} `
        + `skipPlayPhase=${raw.skipPlayPhase}(${raw.skipPlayReason}) `
        + `canKill=${raw.canKill} 图标=${JSON.stringify(raw.icons)} hp=${raw.hp}`);
      raw.log.forEach(l => console.log(`   日志: ${l}`));
      await page.waitForTimeout(1500);
    }

    // 附带：士兵是否会在实战中放置地雷（上一轮修复项回归）
    const soldier = await page.evaluate(() => window.state.battle.enemies[0]?.name || "");
    console.log(`\n[附带] 敌方首位=${soldier}`);

    console.log(`\n汇总：${passed} 通过 / ${failed.length} 失败`);
    if (failed.length) console.log(`失败项: ${failed.join("、")}`);
    console.log(`页面错误: ${errors.length ? errors.join(" | ") : "none"}`);
  } catch (error) {
    console.log(`\nEXCEPTION: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
  const files = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith(".webm"));
  if (files.length) {
    const src = path.join(VIDEO_DIR, files[0]);
    const dst = "/data/workspace/混乱冰冻实战测试.mp4";
    fs.copyFileSync(src, "/data/workspace/混乱冰冻实战测试.webm");
    require("child_process").execSync(
      `ffmpeg -y -i "${src}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${dst}" 2>/dev/null`,
      { stdio: "ignore" });
    console.log(`录像: ${dst}`);
  }
  process.exit(failed.length ? 1 : 0);
})();
