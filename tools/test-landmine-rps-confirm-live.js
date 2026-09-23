// 复现卡死：地雷猜拳「确认结果」在非平局分支下能否关闭 + 解锁
// 缺口：已有 test-landmine-rps-stuck-live.js 只测到平局（平局会重新选手势，永远走不到关闭）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log(`✅ ${name}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? "  " + JSON.stringify(extra) : ""}`); }
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0], src = b.enemies[0];
  src.stats = src.stats || {}; src.stats.attack = 11;
  const mine = { name: "地雷", type: "status", suit: "♠",
    landmine: true, landmineSourceUid: src.uid, landmineAttack: 11 };
  holder.hand = [mine];
  holder.hp = 80;
  b.activeUid = holder.uid; b.phase = 4; b.locked = false;
  b.landmineRpsPrompt = null;
  window.render();
  return { holder: holder.name };
})()`;

// 直接构造非平局结果（holder 赢 / source 赢），跳过随机猜拳
const forceResultTpl = outcome => `(() => {
  const b = window.state.battle;
  b.landmineRpsPrompt = {
    holderUid: b.allies[0].uid, sourceUid: b.enemies[0].uid,
    amount: 11, tied: false,
    result: ${outcome === "holder"
      ? '{ holderChoice: "石头", sourceChoice: "剪刀", outcome: "holder" }'
      : '{ holderChoice: "石头", sourceChoice: "布", outcome: "source" }'},
  };
  b.locked = true;
  window.render();
  return { outcome: b.landmineRpsPrompt.result.outcome };
})()`;

const stateTpl = `(() => {
  const b = window.state.battle;
  return { prompt: !!b.landmineRpsPrompt, locked: !!b.locked,
    hp: b.allies[0].hp, mineInHand: (b.allies[0].hand||[]).some(c => c.landmine),
    confirmBtn: !!document.querySelector('[data-landmine-rps-result-confirm]'),
    confirmText: document.querySelector('[data-landmine-rps-result-confirm]')?.textContent || '',
    gestureCount: document.querySelectorAll('[data-landmine-rps-choice]').length,
    boxTitle: document.querySelector('.manual-dodge-box h2')?.textContent || '' };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  for (const outcome of ["holder", "source"]) {
    console.log(`\n=== 猜拳结果：${outcome === "holder" ? "持有者获胜(拆除)" : "来源获胜(引爆)"} ===`);
    await page.evaluate(setupTpl);
    const forced = await page.evaluate(forceResultTpl(outcome));
    console.log("构造:", JSON.stringify(forced));

    const before = await page.evaluate(stateTpl);
    check("结果弹窗渲染出确认按钮", before.confirmBtn, before);
    console.log("确认按钮文案:", before.confirmText, "| 标题:", before.boxTitle);

    await page.click("[data-landmine-rps-result-confirm]");
    await page.waitForTimeout(600);
    const after = await page.evaluate(stateTpl);
    console.log("点确认后:", JSON.stringify(after));

    check("点确认后弹窗关闭", !after.prompt, after);
    check("点确认后 locked 解除", !after.locked, after);
    check("点确认后不再显示手势按钮", after.gestureCount === 0, after);

    if (outcome === "holder") {
      check("持有者获胜：地雷被拆除（手牌无地雷）", !after.mineInHand, after);
      check("持有者获胜：不掉血", after.hp === before.hp, { before: before.hp, after: after.hp });
    } else {
      check("来源获胜：地雷引爆（手牌无地雷）", !after.mineInHand, after);
      check("来源获胜：掉 11 点血", after.hp === before.hp - 11,
        { before: before.hp, after: after.hp });
    }
  }

  console.log(`\n页面错误: ${errors.length ? errors.join(" | ") : "none"}`);
  check("页面无错误", errors.length === 0);
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
