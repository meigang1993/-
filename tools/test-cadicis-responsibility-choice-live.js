// 指挥官责任（卡迪西斯，触发技）玩家选择权 · 实战回归
//
// 历史 BUG：触发后 battle.locked = true，手牌区只提示「点击一张手牌交给目标」，
// 没有任何放弃入口 → 玩家被强制交牌。描述写的是「你可以摸1张牌，然后交给其1张手牌」，
// 交不交应由玩家决定。本次补上「不交」按钮（data-cadicis-responsibility-skip）。
//
// 验证点：
//   1. 触发后确实出现「不交」按钮（DOM 真实存在，不是只改了数据）
//   2. 点「不交」后不交牌、prompt 清空、界面解锁、后续结算继续（不卡死）
//   3. 对照组：点手牌正常交牌仍然可用（不能把功能改坏）

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 构造：allies[1] 变成卡迪西斯，敌方对 allies[0] 使用单体【杀】触发责任
const triggerTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.cadicisResponsibility = null; b.cadicisResponsibilityResume = null;
  b.allies.forEach((a, i) => {
    a.hp = 300; a.maxHp = 300; a.block = 0; a.intent = 5;
    a.hand = [];
    if (i === 1) { a.ref = "cadicis"; a.name = "卡迪西斯"; }
  });
  b.enemies.forEach((e, i) => { e.hp = i === 0 ? 200 : 100; e.maxHp = 200; e.hand = []; });
  st.log = [];
  const actor = b.enemies[0], target = b.allies[0];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  const draw = (unit, n) => {
    const cards = [];
    for (let i = 0; i < n; i++) {
      const c = { name: "闪", type: "response", suit: "♥" };
      unit.hand.push(c); cards.push(c);
    }
    return cards;
  };
  window.WendyCadicisSkills?.beforeKillTargeted?.(st, actor, target, card, { draw });
  window.render();
  const cadicis = b.allies[1];
  return {
    prompt: !!b.cadicisResponsibility, locked: !!b.locked,
    cadicisHand: (cadicis.hand || []).length,
    targetHand: (target.hand || []).length,
    remaining: b.cadicisResponsibility?.remaining || 0,
    logs: (st.log || []).map(String).slice(-2),
  };
})()`;

const domTpl = `(() => {
  const btn = document.querySelector("[data-cadicis-responsibility-skip]");
  return { exists: !!btn, text: btn ? btn.textContent.trim() : null,
    visible: btn ? btn.offsetParent !== null : false };
})()`;

const afterSkipTpl = `(() => {
  const st = window.state, b = st.battle;
  const cadicis = b.allies[1], target = b.allies[0];
  return {
    prompt: !!b.cadicisResponsibility, locked: !!b.locked,
    cadicisHand: (cadicis.hand || []).length,
    targetHand: (target.hand || []).length,
    resume: !!b.cadicisResponsibilityResume,
    hands: b.allies.map(a => (a.hand || []).map(c => c.name + (c._pendingDraw ? "(pending)" : ""))),
    logs: (st.log || []).map(String).slice(-2),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 1. 触发 + 按钮存在 =====
  await page.evaluate(triggerTpl);
  const t = await page.evaluate(triggerTpl);
  console.log(`[触发] prompt=${t.prompt} locked=${t.locked} 卡迪西斯手牌=${t.cadicisHand} 目标手牌=${t.targetHand}`);
  console.log(`  日志: ${JSON.stringify(t.logs)}`);
  T("指挥官责任：友方成为单体杀目标时触发", t.prompt === true, t);
  T("指挥官责任：触发后界面锁定（等待玩家选择）", t.locked === true, t);
  T("指挥官责任：卡迪西斯摸 1 张牌（目标非温蒂）", t.cadicisHand === 1, t);

  // 渲染是异步的（render 走 rAF），直接查 DOM 会偶发查不到；先等按钮出现再断言
  await page.waitForSelector("[data-cadicis-responsibility-skip]", { timeout: 8000 }).catch(() => null);
  const dom = await page.evaluate(domTpl);
  console.log(`[按钮] exists=${dom.exists} text=${JSON.stringify(dom.text)} visible=${dom.visible}`);
  T("指挥官责任：界面出现「不交」按钮", dom.exists === true && dom.visible === true, dom);
  T("指挥官责任：按钮文案为「不交」", dom.text === "不交", dom);

  // ===== 3. 对照组：正常交牌仍然可用 =====
  // 直接调用真实交牌函数（resolveResponsibility），避开渲染时序抖动，
  // 确保「不交」按钮没有把原交牌路径改坏。
  await page.evaluate(triggerTpl);
  await page.waitForTimeout(300);
  const before = await page.evaluate(afterSkipTpl);
  const gave = await page.evaluate(`(() => {
    const st = window.state;
    return { ok: !!window.WendyCadicisSkills?.resolveResponsibility?.(st, 0) };
  })()`);
  await page.waitForTimeout(1000);
  const after = await page.evaluate(afterSkipTpl);
  console.log(`[对照组] 调用交牌=${JSON.stringify(gave)} 卡迪西斯手牌 ${before.cadicisHand}→${after.cadicisHand} ` +
    `目标手牌 ${before.targetHand}→${after.targetHand} prompt=${after.prompt}`);
  console.log(`  双方手牌: ${JSON.stringify(after.hands)}`);
  T("对照组：正常交牌函数返回成功", gave.ok === true, gave);
  T("对照组：交牌后卡迪西斯少 1 张、目标多 1 张",
    after.cadicisHand === before.cadicisHand - 1
    && after.targetHand === before.targetHand + 1, { before, after });
  T("对照组：交牌后 prompt 清空并解锁", after.prompt === false && after.locked === false, after);

  // ===== 2. 点「不交」 =====
  // 上面的对照组已经把 prompt 消费掉了，必须重新触发一次，否则按钮不存在、
  // page.click 会一直等到 30 秒超时（曾误判为「跳过功能无效」）
  await page.evaluate(triggerTpl);
  await page.waitForSelector("[data-cadicis-responsibility-skip]", { timeout: 8000 }).catch(() => null);
  await page.evaluate(`(() => window.BattleActionGuard?.whenIdle?.() || Promise.resolve())()`);
  const dom2 = await page.evaluate(domTpl);
  T("指挥官责任：重新触发后「不交」按钮仍出现", dom2.exists === true, dom2);
  await page.click("[data-cadicis-responsibility-skip]");
  await page.waitForTimeout(1200);
  const s = await page.evaluate(afterSkipTpl);
  console.log(`[跳过] prompt=${s.prompt} locked=${s.locked} 卡迪西斯手牌=${s.cadicisHand} 目标手牌=${s.targetHand} resume残留=${s.resume}`);
  console.log(`  日志: ${JSON.stringify(s.logs)}`);
  T("指挥官责任：点不交后 prompt 清空", s.prompt === false, s);
  T("指挥官责任：点不交后界面解锁（不卡死）", s.locked === false, s);
  T("指挥官责任：点不交后不交出任何牌", s.targetHand === 0, s);
  T("指挥官责任：点不交后已摸的牌保留在手", s.cadicisHand === 1, s);
  T("指挥官责任：点不交后结算继续（resume 已消费）", s.resume === false, s);
  T("指挥官责任：日志记录放弃发动",
    (s.logs || []).some(l => String(l).includes("不交牌")), s);

  console.log(`\n页面错误: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 5).join("\n"));
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  await browser.close();
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
