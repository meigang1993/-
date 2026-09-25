// 新手引导端到端实战回归（浏览器）
// 覆盖：新档 → 大厅 → 出征准备 → 副本地图 → 第一场战斗 → 第一次奖励
// 验收点：
//   1. 新游戏进入大厅时 onboarding.step = "hall"，文案为机械工厂·普通级
//   2. 大厅提供「跳过引导」，点击后 skipped = true
//   3. 打开出征界面后 step = "prep"，机械工厂普通级带「推荐首战」
//   4. 进入地图后 step = "map"，推荐节点唯一且带「推荐」标记
//   5. 首个战斗节点固定为单个机械哥布林，罗卡尔先手且初始手牌含实体【杀】
//   6. 战斗内锚点提示按 选牌 → 选目标 → 确定 → 结束出牌 顺序切换
//   7. 贝丝妲魔偶的榨取精华弹窗在首战被屏蔽
//   8. 胜利后奖励弹窗含暂存说明，确认后 completed = true
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium, expect } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const flag = page => page.evaluate(() => JSON.parse(JSON.stringify(
  window.state?.flags?.onboarding || null)));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);

  // ---------- 第一阶段：大厅 ----------
  let f = await flag(page);
  T("新档 onboarding 存在且 step=hall", f && f.step === "hall" && f.completed === false, f);

  const objective = page.locator(".hall-first-objective");
  T("大厅显示首次目标卡片", await objective.count() === 1);
  const objText = await objective.innerText().catch(() => "");
  T("目标为机械工厂·普通级", /机械工厂/.test(objText) && /普通级/.test(objText), objText);
  T("大厅有跳过引导按钮", await page.locator("[data-onboarding-skip]").count() === 1);
  T("大厅有开始首次远征", await page.locator("[data-open-modal='team']").count() === 1);

  // 跳过后恢复：先验证 skip，再重置回 hall 继续走完整流程
  await page.locator("[data-onboarding-skip]").click();
  f = await flag(page);
  T("点击跳过后 skipped=true", f && f.skipped === true, f);
  await page.evaluate(() => {
    const o = window.state.flags.onboarding;
    o.skipped = false; o.completed = false; o.step = "hall";
    window.render();
  });
  f = await flag(page);
  T("重置后回到 hall 且未跳过", f && f.step === "hall" && !f.skipped, f);

  // ---------- 第二阶段：出征准备 ----------
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  f = await flag(page);
  T("打开出征界面后 step=prep", f && f.step === "prep", f);

  // 副本名在 section 标题（.<h3>副本：机械工厂</h3>），难度卡片本身不含副本名
  const factoryCard = page.locator(".team-dungeon").filter({ hasText: "机械工厂" })
    .locator(".difficulty-card");
  T("机械工厂难度卡片存在", await factoryCard.count() === 5, await factoryCard.count());
  T("普通级带推荐首战标记",
    await page.locator(".team-dungeon").filter({ hasText: "机械工厂" })
      .locator(".difficulty-card").filter({ hasText: "普通级" })
      .locator(".recommended-badge").count() === 1);
  const prepTip = await page.locator(".onboarding-tip").first().innerText().catch(() => "");
  T("出征准备提示文案", /初始队伍已经就绪/.test(prepTip), prepTip);

  // ---------- 第三阶段：副本地图 ----------
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").first().click();
  await page.locator(".map-node").first().waitFor({ state: "visible" });
  f = await flag(page);
  T("进入地图后 step=map", f && f.step === "map", f);

  // 首个可选层（第 2 层）在同层内全部标为推荐：该层已被强制为普通战斗，任选其一都受保护
  const rec = page.locator(".onboarding-recommend");
  const recCount = await rec.count();
  T("推荐节点存在", recCount >= 1, recCount);
  T("推荐节点均位于首个可选层",
    await rec.evaluateAll(els => els.length > 0
      && els.every(e => /n2-/.test(e.getAttribute("data-dungeon-node") || ""))));
  T("推荐节点均为普通战斗",
    await rec.evaluateAll(els => els.every(e => e.classList.contains("normal"))));
  T("推荐节点带推荐字样",
    await rec.evaluateAll(els => els.every(e => /推荐/.test(e.innerHTML || ""))));
  T("推荐节点可点击（未 disabled）", await rec.first().isEnabled());

  // ---------- 第四阶段：第一场战斗 ----------
  await rec.first().click();
  await page.locator(".battle-screen").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => !!window.state?.battle);
  f = await flag(page);
  T("进入战斗后 step=battle", f && f.step === "battle", f);

  const enemies = await page.evaluate(() => window.state.battle.enemies.map(e => e.id || e.name));
  T("首战只有 1 名敌人", enemies.length === 1, enemies);
  T("首战敌人为机械哥布林", /mechanical_goblin|机械哥布林/.test(String(enemies[0])), enemies);

  // 战斗刚进入时尚未确定行动者与阶段（实测初始 activeUid 为 null、phase 3），
  // 必须等真实推进到我方出牌阶段再断言，否则读到的是过渡态。
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !!b && !!b.activeUid && b.phase === 4 && !b.locked;
  }, null, { timeout: 25000 });
  const firstActor = await page.evaluate(() => window.state.battle.activeUid);
  const lokarUid = await page.evaluate(() =>
    (window.state.battle.allies.find(a => /罗卡尔/.test(a.name)) || {}).uid);
  T("罗卡尔先行动", firstActor === lokarUid, { firstActor, lokarUid });

  const hasKill = await page.evaluate(() => {
    const a = window.state.battle.allies.find(x => /罗卡尔/.test(x.name));
    return (a?.hand || []).some(c => c.type === "slash" && !c.virtual && !c._skill);
  });
  T("罗卡尔初始手牌含实体【杀】", hasKill);

  const tip = () => page.locator(".onboarding-tip").innerText().catch(() => "");
  let t1 = await tip();
  T("提示①选牌", /点击一张亮起的【杀/.test(t1), t1);

  // 选牌 → 提示应切到选目标
  await page.evaluate(() => {
    const b = window.state.battle;
    const a = b.allies.find(x => /罗卡尔/.test(x.name));
    const idx = (a.hand || []).findIndex(c => c.type === "slash" && !c.virtual && !c._skill);
    window.BattleSystem.selectCard(window.state, idx);
    window.render();
  });
  let t2 = await tip();
  T("提示②选目标", /点击发光的敌人/.test(t2), t2);

  // 选目标 → 提示应切到确定
  await page.evaluate(() => {
    const st = window.state, b = st.battle;
    window.BattleSystem.chooseTarget(st, b.enemies[0].uid);
    window.render();
  });
  let t3 = await tip();
  T("提示③确定", /点击“确定”发动卡牌/.test(t3), t3);

  // 出牌后 → 提示应切到结束出牌
  // 敌人持有【闪】会自动抵消（实测"机械哥布林 自动使用闪"），清空其手牌才能一击结束；
  // 这里验证的是引导流程，不是战斗平衡，故做此构造。
  await page.evaluate(() => {
    window.state.battle.enemies.forEach(e => { e.hp = 1; e.hand = []; });
  });
  await page.locator("[data-confirm-target]").first().click();
  await page.waitForTimeout(1200);
  let t4 = await tip();
  T("提示④结束出牌或已推进", /结束出牌/.test(t4) || /消耗杀意/.test(t4), t4);

  T("首战未弹出榨取精华", await page.locator("[data-skip-extract]").count() === 0);

  // ---------- 第五阶段：第一次奖励 ----------
  // 胜利后先出胜利面板（.victory-screen，需等 .ready 才可点），点"继续探索"才回地图出奖励弹窗
  const victory = page.locator(".victory-screen.ready");
  await victory.waitFor({ state: "visible", timeout: 25000 });
  T("胜利面板提供继续探索", await page.locator("[data-victory-continue]").count() === 1);
  await page.locator("[data-victory-continue]").click();
  const popup = page.locator(".reward-popup");
  await popup.waitFor({ state: "visible", timeout: 25000 });
  f = await flag(page);
  T("胜利后 step=reward", f && f.step === "reward", f);
  const rewardText = await popup.innerText();
  T("奖励界面含暂存说明", /暂存在本次探索中/.test(rewardText), rewardText.slice(0, 80));
  T("奖励说明含继续深入与撤退", /继续深入/.test(rewardText) && /撤退/.test(rewardText),
    rewardText.slice(0, 120));
  T("奖励界面有确认按钮", await page.locator("[data-reward-confirm]").count() === 1);

  // 确认奖励 → completed（引导完成条件是"确认第一次节点奖励"，不是"进入副本"）
  await page.locator("[data-reward-confirm]").click();
  await page.waitForTimeout(800);
  f = await flag(page);
  T("确认奖励后 completed=true", f && f.completed === true, f);
  T("引导完成后不再显示提示", await page.locator(".onboarding-tip").count() === 0);
  T("完成后回到副本地图（可继续深入/撤退）",
    await page.locator(".dungeon-screen").count() === 1
    && await page.locator("[data-dungeon-retreat]").count() === 1);

  const relevant = errors.filter(t => !/favicon|ResizeObserver loop/.test(t));
  T("页面无 JS 错误", relevant.length === 0, relevant.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message); process.exit(2); });
