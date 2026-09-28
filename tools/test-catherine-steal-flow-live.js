// 凯瑟琳 ·【窃取】目标选择流程实战回归
//
// 背景（本轮修的 BUG）：窃取牌原本标了 targetless: true，于是
//   - 技能栏点击走 bindSkills 的 `targetless && !needsHandChoice` 分支直接 confirmBattleCard，
//   - 手牌双击走 quickPlayTargetless 直接打出，
// 两条路径都跳过了「指定敌方一名角色」，victim 退化成 GameRandom.sample 随机一名敌人，
// 玩家完全看不到选人流程（既有的 test-catherine-skills-live.js 直接调
// handleSpecialCard(st, c, foe, card) 把 foe 当参数传进去，绕过了 UI，所以一直没暴露）。
//
// 本脚本走真实 DOM 点击：点技能 → 点敌方单位 → 断言进入接收队友选择。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把我方 0 号改造成凯瑟琳：技能栏第 0 项即【窃取】
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.catherineStealPicker = null; b.handReveal = null;
  b.activeUid = b.allies[0].uid; b.phase = 4;
  const c = b.allies[0];
  c.name = "凯瑟琳"; c.ref = "catherine"; c.id = "catherine";
  c.hp = 28; c.maxHp = 28; c.block = 0; c.tempMagic = 0; c.intent = 1;
  c.stats = { attack: 1, magic: 3, speed: 2 };
  c.usedCatherineSteal = false;
  c.hand = [];
  // 技能卡必须取自真实角色数据：手写 card 会自带一份 targetless 的取值，
  // 数据文件里的改动反映不到测试上（反向验证因此失效）。
  const src = (window.GameDataCharactersExtra || [])
    .find(item => item.id === "catherine");
  c.skills = src ? JSON.parse(JSON.stringify(src.skills)) : [];
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = 100; u.maxHp = 100; u.hand = [];
  });
  b.enemies.forEach((u, i) => {
    u.hp = i === 0 ? 100 : 90; u.maxHp = 100; u.block = 0;
    u.hand = [
      { name: "杀", type: "slash", suit: "♥", scale: "attack" },
      { name: "闪", type: "response", suit: "♠" },
    ];
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  st.log = [];
  window.render();
  return { ok: true, foeUid: b.enemies[0].uid, allies: b.allies.length };
})()`;

const dumpTpl = `(() => {
  const b = window.state.battle;
  return { selectedSkill: b.selectedSkillCard?.name || null,
    selectedIndex: b.selectedCardIndex, pendingTargetUid: b.pendingTargetUid || null,
    picker: !!b.catherineStealPicker, locked: !!b.locked,
    used: !!b.allies[0].usedCatherineSteal,
    hasReceiver: !!document.querySelector("[data-catherine-receiver]") };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("战斗场景准备完成（凯瑟琳 + 2 名敌人持手牌）", setup.ok, setup);

  // 1) 点击技能栏【窃取】→ 应处于「待选目标」状态，不得立即打出
  const skillBtn = page.locator("[data-skill-index]").first();
  await skillBtn.click();
  // 必须等出牌动画与 confirmBattleCard 真正跑完再采样：只 sleep 120ms 会采到
  // 「尚未出牌」的中间态，导致 targetless 的旧实现也能蒙混过关（反向验证失效）。
  await page.waitForTimeout(1000);
  const afterSkill = await page.evaluate(dumpTpl);
  T("点击技能后选中【窃取】", afterSkill.selectedSkill === "窃取", afterSkill);
  T("点击技能后没有立即打出（未消耗限一次）", afterSkill.used === false, afterSkill);
  T("点击技能后进入待选目标状态（尚未弹出接收队友面板）",
    afterSkill.picker === false, afterSkill);
  T("待选目标时尚未确定敌方目标", afterSkill.pendingTargetUid === null, afterSkill);

  // 2) 点击敌方单位 → 应弹出「选择接收队友」面板（说明真的走了选敌方角色流程）
  await page.locator(`[data-target="${setup.foeUid}"]`).first().click();
  // BattleEffects.choose 带动画并异步确认出牌，固定 sleep 会采到中间态
  // （pendingTargetUid 已设定、面板尚未渲染）。改为等面板真正出现。
  await page.waitForFunction(
    () => !!window.state.battle?.catherineStealPicker, null, { timeout: 8000 })
    .catch(() => {});
  // 面板状态与 DOM 渲染之间还差一次 render，直接 evaluate 会采到空 DOM。
  await page.waitForSelector("[data-catherine-receiver]", { timeout: 8000 })
    .catch(() => {});
  const afterFoe = await page.evaluate(dumpTpl);
  T("点击敌方角色后弹出接收队友选择面板",
    afterFoe.picker === true, afterFoe);
  T("面板渲染出队友选项",
    afterFoe.hasReceiver === true, afterFoe);

  // 3) 选择接收队友 → 打开敌方手牌供挑一张
  const mateUid = await page.evaluate(`(() => {
    const b = window.state.battle;
    const mate = b.allies.find((u, i) => i > 0 && u.hp > 0);
    return mate?.uid || null;
  })()`);
  // 面板缺失时直接 click 会等 30s 超时并抛错，掩盖真实失败原因；先等再点。
  await page.waitForSelector(`[data-catherine-receiver="${mateUid}"]`, { timeout: 5000 })
    .catch(() => {});
  await page.locator(`[data-catherine-receiver="${mateUid}"]`).first()
    .click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
  const afterMate = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { reveal: !!b.handReveal, mode: b.handReveal?.mode || null,
      receiverUid: b.handReveal?.receiverUid || null,
      cardCount: document.querySelectorAll(".hand-reveal-card, [data-hand-reveal-card]").length };
  })()`);
  T("选择队友后打开敌方手牌展示", afterMate.reveal === true, afterMate);
  T("手牌展示模式为 catherineSteal", afterMate.mode === "catherineSteal", afterMate);
  T("记录了接收者", afterMate.receiverUid === mateUid, afterMate);

  // 4) 挑一张手牌 → 完成转移：敌方少 1 张、队友多 1 张
  const moved = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const c = b.allies[0], foe = b.enemies[0];
    const receiver = b.allies.find(u => u.uid === b.handReveal?.receiverUid);
    const before = { foe: foe.hand.length, mate: receiver?.hand.length ?? -1 };
    const card = foe.hand.find(x => !x._pendingDraw);
    const ok = window.CatherineSkills.resolveSteal(st, c, foe, b.handReveal, card);
    b.handReveal = null; b.locked = false;
    window.render();
    return { ok, before, foeAfter: foe.hand.length,
      mateAfter: receiver?.hand.length ?? -1, name: card?.name,
      logs: (st.log || []).slice(0, 3).map(String) };
  })()`);
  T("转移成功", moved.ok === true, moved);
  T("敌方手牌减少 1 张", moved.foeAfter === moved.before.foe - 1, moved);
  T("队友手牌增加 1 张", moved.mateAfter === moved.before.mate + 1, moved);

  T("页面无 JS 错误", errors.filter(t => !/favicon|ResizeObserver/.test(t)).length === 0,
    errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("运行失败：", err);
  process.exit(1);
});
