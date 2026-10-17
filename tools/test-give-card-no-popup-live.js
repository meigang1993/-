// 交牌类技能「不再弹窗」· 实战回归
//
// 背景：交牌类技能此前用居中弹窗（armory-popup）列出队友让玩家选，
// 与【半魅魔血】【新月之歌】【收获分享】【指挥官责任】的「手牌区选牌 +
// 点击队友交出」口径不一致。本次把仍在弹窗的两处交牌环节统一：
//   · 艾伦格【战斗演练】—— 交出已结算的牌
//   · 温蒂【解答迷惑】—— 选定牌名后交给队友（选牌名仍需弹窗，牌不在手牌区）
//
// 验证点：
//   1. 交牌时不再出现居中弹窗（.armory-popup），改为提示条（.dimension-prompt）
//   2. 队友被标成可选目标（.selectable-target），真实点击即可交出
//   3. 点队友后确实完成交牌（牌到队友手上）、prompt 清空、界面解锁
//   4. 「不交」按钮仍有效
//   5. 解答迷惑的选牌名阶段仍保留弹窗（该步必须从牌库选，不能手牌区替代）

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

const resetTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.ailengDrillPicker = null; b.wendyTutorPicker = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => {
    a.hp = 300; a.maxHp = 300; a.block = 0; a.hand = [];
    a.ref = i === 0 ? "aileng" : "lokar";
    a.name = i === 0 ? "艾伦格" : "队友" + i;
    a.skills = i === 0 ? [{ name: "战斗演练", type: "passive" }] : [];
  });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  st.log = [];
  return { allies: b.allies.map(a => a.uid) };
})()`;

const drillTriggerTpl = `(() => {
  const st = window.state, b = st.battle;
  b.ailengDrillPicker = null; b.locked = false; b.animQueue = [];
  b.allies.forEach(a => { a.hand = []; });
  const actor = b.allies[0];
  actor.ref = "aileng"; actor.name = "艾伦格";
  actor.skills = [{ name: "战斗演练", type: "passive" }];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
  actor.hand.push(card);
  window.GuestAilengSkills?.afterCardPlayed?.(st, actor, card);
  window.render();
  return {
    prompt: !!b.ailengDrillPicker, locked: !!b.locked,
    cardName: b.ailengDrillPicker?.card?.name || null,
    ally0Hand: b.allies[0].hand.length, ally1Hand: b.allies[1].hand.length,
  };
})()`;

const domTpl = `(() => {
  const popup = document.querySelector(".armory-popup");
  const prompts = [...document.querySelectorAll(".dimension-prompt")]
    .map(node => node.textContent || "");
  const skip = document.querySelector("[data-aileng-drill-skip]");
  const selectable = [...document.querySelectorAll("[data-target]")]
    .filter(node => node.classList.contains("selectable-target"))
    .map(node => node.dataset.target);
  return { hasPopup: !!popup, prompts, skip: !!skip, selectable };
})()`;

const drillAfterTpl = `(() => {
  const st = window.state, b = st.battle;
  return {
    prompt: !!b.ailengDrillPicker, locked: !!b.locked,
    ally0Hand: b.allies[0].hand.length,
    ally1Cards: b.allies[1].hand.map(c => c.name),
    logs: (st.log || []).map(String).slice(-2),
  };
})()`;

const tutorTriggerTpl = `(() => {
  const st = window.state, b = st.battle;
  b.wendyTutorPicker = null; b.locked = false; b.animQueue = [];
  b.allies.forEach((a, i) => { a.hand = []; a.hp = 300; a.maxHp = 300; });
  const actor = b.allies[0];
  actor.ref = "wendy"; actor.name = "温蒂"; actor.usedWendyTutor = false;
  // WendyCadicisSkills 只导出 handleSpecialCard/chooseTutorCard/tutorPool，
  // 并没有 tutor()；直接调 ?.tutor?.() 是静默 no-op，选择器永远不开启
  // （此前正是这个原因让整段用例假红）。tutor 由 handleSpecialCard 按
  // card.wendyTutor 分发，与实战出牌路径一致。
  window.WendyCadicisSkills?.handleSpecialCard?.(st, actor, null,
    { name: "解答迷惑", type: "tactic", wendyTutor: true });
  window.render();
  return {
    prompt: !!b.wendyTutorPicker, locked: !!b.locked,
    cardName: b.wendyTutorPicker?.cardName || null,
  };
})()`;

const tutorPickTpl = `(() => {
  const st = window.state;
  const pool = window.WendyCadicisSkills?.tutorPool?.(st) || [];
  const name = pool[0]?.name || null;
  const ok = !!window.WendyCadicisSkills?.chooseTutorCard?.(st, name);
  window.render();
  return { ok, name, cardName: st.battle.wendyTutorPicker?.cardName || null };
})()`;

const tutorDomTpl = `(() => {
  const popup = document.querySelector(".armory-popup");
  const prompts = [...document.querySelectorAll(".dimension-prompt")]
    .map(node => node.textContent || "");
  const selectable = [...document.querySelectorAll("[data-target]")]
    .filter(node => node.classList.contains("selectable-target"))
    .map(node => node.dataset.target);
  return { hasPopup: !!popup, prompts, selectable };
})()`;

const tutorAfterTpl = `(() => {
  const st = window.state, b = st.battle;
  return {
    prompt: !!b.wendyTutorPicker, locked: !!b.locked,
    ally1Cards: b.allies[1].hand.map(c => c.name),
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

  const roster = await page.evaluate(resetTpl);
  const teammateUid = roster.allies[1];
  console.log(`[队伍] ${JSON.stringify(roster.allies)}`);

  // ================= 战斗演练 =================
  const d0 = await page.evaluate(drillTriggerTpl);
  console.log(`[战斗演练-触发] prompt=${d0.prompt} locked=${d0.locked} 牌=${d0.cardName} 艾伦格手牌=${d0.ally0Hand}`);
  T("战斗演练：使用杀后触发交牌", d0.prompt === true, d0);
  T("战斗演练：触发后界面锁定等待选择", d0.locked === true, d0);

  await page.waitForSelector("[data-aileng-drill-skip]", { timeout: 8000 }).catch(() => null);
  const dom = await page.evaluate(domTpl);
  console.log(`[战斗演练-DOM] 弹窗=${dom.hasPopup} 提示条=${JSON.stringify(dom.prompts)} 可选=${JSON.stringify(dom.selectable)}`);
  T("战斗演练：不再出现居中弹窗", dom.hasPopup === false, dom);
  T("战斗演练：出现提示条并写明牌名",
    dom.prompts.some(text => text.includes("战斗演练") && text.includes("杀（普攻）")), dom);
  T("战斗演练：保留「不交」按钮", dom.skip === true, dom);
  T("战斗演练：队友被标为可选目标", dom.selectable.includes(teammateUid), dom);

  const before = await page.evaluate(drillAfterTpl);
  await page.click(`[data-target="${teammateUid}"]`);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(drillAfterTpl);
  console.log(`[战斗演练-交出] 艾伦格手牌 ${before.ally0Hand}→${after.ally0Hand} 队友=${JSON.stringify(after.ally1Cards)}`);
  console.log(`  日志: ${JSON.stringify(after.logs)}`);
  T("战斗演练：点队友后牌交到队友手上",
    after.ally1Cards.includes("杀（普攻）") && after.ally0Hand === before.ally0Hand - 1,
    { before, after });
  T("战斗演练：交牌后 prompt 清空并解锁",
    after.prompt === false && after.locked === false, after);

  // 不交按钮
  const d1 = await page.evaluate(drillTriggerTpl);
  T("战斗演练：可再次触发（供不交用例）", d1.prompt === true, d1);
  await page.waitForSelector("[data-aileng-drill-skip]", { timeout: 8000 }).catch(() => null);
  const beforeSkip = await page.evaluate(drillAfterTpl);
  await page.click("[data-aileng-drill-skip]");
  await page.waitForTimeout(1200);
  const afterSkip = await page.evaluate(drillAfterTpl);
  console.log(`[战斗演练-不交] 队友手牌=${JSON.stringify(afterSkip.ally1Cards)} prompt=${afterSkip.prompt}`);
  T("战斗演练：点不交后不交牌",
    afterSkip.ally0Hand === beforeSkip.ally0Hand
    && !afterSkip.ally1Cards.includes("杀（普攻）"), { beforeSkip, afterSkip });
  T("战斗演练：点不交后解锁（不卡死）",
    afterSkip.prompt === false && afterSkip.locked === false, afterSkip);

  // ================= 解答迷惑 =================
  const t0 = await page.evaluate(tutorTriggerTpl);
  console.log(`[解答迷惑-触发] prompt=${t0.prompt} locked=${t0.locked}`);
  T("解答迷惑：发动后开启选择器", t0.prompt === true && t0.locked === true, t0);
  await page.waitForTimeout(400);
  const tutorDom0 = await page.evaluate(tutorDomTpl);
  T("解答迷惑：选牌名阶段仍保留弹窗（需从牌库选，无法手牌区替代）",
    tutorDom0.hasPopup === true, tutorDom0);

  const pick = await page.evaluate(tutorPickTpl);
  console.log(`[解答迷惑-选牌] ${pick.name} → cardName=${pick.cardName}`);
  T("解答迷惑：可选定牌名", pick.cardName === pick.name, pick);
  await page.waitForTimeout(400);
  const tutorDom1 = await page.evaluate(tutorDomTpl);
  console.log(`[解答迷惑-DOM] 弹窗=${tutorDom1.hasPopup} 提示条=${JSON.stringify(tutorDom1.prompts)} 可选=${JSON.stringify(tutorDom1.selectable)}`);
  T("解答迷惑：选定牌名后不再弹窗", tutorDom1.hasPopup === false, tutorDom1);
  T("解答迷惑：出现交牌提示条",
    tutorDom1.prompts.some(text => text.includes("解答迷惑") && text.includes(pick.name)),
    tutorDom1);
  T("解答迷惑：我方角色被标为可选目标",
    tutorDom1.selectable.includes(teammateUid), tutorDom1);

  await page.click(`[data-target="${teammateUid}"]`);
  await page.waitForTimeout(1200);
  const tutorAfter = await page.evaluate(tutorAfterTpl);
  console.log(`[解答迷惑-交出] 队友手牌=${JSON.stringify(tutorAfter.ally1Cards)}`);
  console.log(`  日志: ${JSON.stringify(tutorAfter.logs)}`);
  T("解答迷惑：点队友后临时牌交给队友",
    tutorAfter.ally1Cards.includes(pick.name), tutorAfter);
  T("解答迷惑：交牌后选择器关闭并解锁",
    tutorAfter.prompt === false && tutorAfter.locked === false, tutorAfter);

  T("全程无页面错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n===== 交牌类弹窗清理：${pass}/${total} 通过 =====`);
  if (pass !== total) process.exit(1);
  console.log("Give-card popups removed: passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
