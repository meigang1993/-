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
  // 属性与技能卡都必须取自真实角色数据：手写会自带一份旧取值，
  // 数据文件里的改动反映不到测试上（反向验证因此失效）。
  const src = (window.GameDataCharactersExtra || [])
    .find(item => item.id === "catherine");
  const tplStats = src?.stats || { attack: 1, magic: 3, speed: 2, maxHp: 28 };
  c.hp = tplStats.maxHp; c.maxHp = tplStats.maxHp;
  c.block = 0; c.tempMagic = 0; c.intent = 1;
  c.stats = { ...tplStats };
  c.usedCatherineSteal = false;
  c.hand = [];
  c.skills = src ? JSON.parse(JSON.stringify(src.skills)) : [];
  b.allies.forEach((u, i) => {
    if (i === 0) return;
    u.hp = 100; u.maxHp = 100; u.hand = [];
  });
  b.enemies.forEach((u, i) => {
    u.hp = i === 0 ? 100 : 90; u.maxHp = 100; u.block = 0;
    // 1 号敌人刻意空手：验证选目标阶段就被排除，点了不会静默失败
    u.hand = i === 0 ? [
      { name: "杀", type: "slash", suit: "♥", scale: "attack" },
      { name: "闪", type: "response", suit: "♠" },
    ] : [];
    u.hand.forEach(x => { delete x._pendingDraw; });
  });
  st.log = [];
  window.render();
  return { ok: true, foeUid: b.enemies[0].uid, emptyFoeUid: b.enemies[1]?.uid || null, selfUid: b.allies[0].uid,
    allies: b.allies.length };
})()`;

const dumpTpl = `(() => {
  const b = window.state.battle;
  return { selectedSkill: b.selectedSkillCard?.name || null,
    selectedIndex: b.selectedCardIndex, pendingTargetUid: b.pendingTargetUid || null,
    picker: !!b.catherineStealPicker, locked: !!b.locked,
    used: !!b.allies[0].usedCatherineSteal,
    hasReceiver: !!document.querySelector("[data-catherine-receiver]"),
    promptText: document.querySelector(".dimension-prompt")?.textContent || "",
    selectable: [...document.querySelectorAll("[data-target].selectable-target")]
      .map(node => node.dataset.target) };
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
  // 窃取要「拿敌方一张手牌」，无牌敌人点了只能静默失败（与狙击目标同一口径），
  // 故在选目标阶段就该排除，而不是等点了再无反应。
  T("持牌敌方角色可选", (afterSkill.selectable || []).includes(setup.foeUid),
    afterSkill);
  T("空手牌敌方角色不可选",
    !(afterSkill.selectable || []).includes(setup.emptyFoeUid), afterSkill);

  // 2) 点击敌方单位 → 进入接收者选择阶段（不再弹居中窗口，改为提示条）
  await page.locator(`[data-target="${setup.foeUid}"]`).first().click();
  // BattleEffects.choose 带动画并异步确认出牌，固定 sleep 会采到中间态
  // （pendingTargetUid 已设定、picker 尚未置位）。改为等阶段真正切换。
  await page.waitForFunction(
    () => !!window.state.battle?.catherineStealPicker, null, { timeout: 8000 })
    .catch(() => {});
  // 提示条与可选高亮都在 render 之后才落到 DOM，固定 sleep 会采到出牌前的旧界面
  // （表现为敌人仍被标成可选、提示条为空）。改为等提示条真正出现。
  await page.waitForFunction(
    () => !!document.querySelector(".dimension-prompt"), null, { timeout: 8000 })
    .catch(() => {});
  const afterFoe = await page.evaluate(dumpTpl);
  T("点击敌方角色后进入接收者选择阶段",
    afterFoe.picker === true, afterFoe);
  T("不再弹出居中选人窗口", afterFoe.hasReceiver === false, afterFoe);
  T("改用提示条引导点击我方角色",
    /点击一名我方角色/.test(afterFoe.promptText), afterFoe);

  // 3) 改为直接点击我方角色 → 打开敌方手牌供挑一张
  const mateUid = await page.evaluate(`(() => {
    const b = window.state.battle;
    const mate = b.allies.find((u, i) => i > 0 && u.hp > 0);
    return mate?.uid || null;
  })()`);
  T("我方其他角色被标为可选", (afterFoe.selectable || []).includes(mateUid), afterFoe);
  T("凯瑟琳自己不可作为接收者",
    !(afterFoe.selectable || []).includes(setup.selfUid), afterFoe);
  await page.locator(`[data-target="${mateUid}"]`).first()
    .click({ timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => !!window.state.battle?.handReveal, null,
    { timeout: 8000 }).catch(() => {});
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

  // 5) 回合流转必须清空接收者 picker：否则残留的 picker 会在下一回合劫持玩家
  //    对我方角色的点击（误触发转移），且 battle.locked 残留会让界面变灰。
  const stale = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    b.animQueue = [];
    b.catherineStealPicker = { actorUid: b.allies[0].uid, targetUid: b.enemies[0].uid };
    b.locked = true;
    window.render();
    const before = { picker: !!b.catherineStealPicker, locked: !!b.locked };
    window.BattleTurnState.cleanupPrompts(b);
    window.render();
    return { before, picker: !!b.catherineStealPicker, locked: !!b.locked,
      prompt: !!document.querySelector(".dimension-prompt") };
  })()`);
  T("回合流转前 picker 与锁定确实存在（前提）",
    stale.before.picker === true && stale.before.locked === true, stale);
  T("回合流转清空窃取接收者 picker", stale.picker === false, stale);
  T("回合流转解除因 picker 残留的界面锁定", stale.locked === false, stale);
  T("回合流转后不再显示交牌提示条", stale.prompt === false, stale);

  T("页面无 JS 错误", errors.filter(t => !/favicon|ResizeObserver/.test(t)).length === 0,
    errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("运行失败：", err);
  process.exit(1);
});
