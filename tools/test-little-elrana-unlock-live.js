// 小艾尔拉娜 · 解锁链路实战回归（严格版）
//   解锁条件（data.js）：艾尔拉娜在队伍中，首次遭遇艾尔拉娜克隆体时触发剧情。
//   触发实现：extra-unlock-events.js 的 tryLittleElranaEncounter，
//             在 app-dungeon-actions.js 进入副本节点时调用。
//
// 断言的是「实际效果」：真的进入副本地图、真的点了节点、弹窗真的出现、
// 真的推进到最后一句、点完按钮角色真的解锁进栏，而不是只检查条件字符串。
//
// 反向验证方式（改完源码后必须重跑，确认断言非空转）：
//   把 extra-unlock-events.js:14 的 `enemies.some(e => e.id === "elrana_clone")`
//   改成 `true`（无条件触发），场景2「敌人不含克隆体」应立刻变红。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const CLONE_GROUP = ["skeleton_patrol", "elrana_clone", "skeleton_patrol"];
const OTHER_GROUP = ["invader_chiyo"];

// 准备：跳过新手引导、把艾尔拉娜解锁并放进队伍、确保小艾尔拉娜仍是锁定态
function setupTpl({ party, enemyIds }) {
  return `(() => {
  const st = window.state;
  window.Onboarding.skip(st);
  const elrana = st.chars.find(c => c.id === "elrana");
  if (elrana) { elrana.locked = false; elrana.hp = elrana.stats.maxHp; }
  const little = st.chars.find(c => c.id === "little_elrana");
  if (little) little.locked = true;
  st.flags = st.flags || {};
  delete st.flags.littleElranaUnlockSeen;
  delete st.flags.littleElranaUnlockPending;
  st.party = ${JSON.stringify(party)}.filter(id => st.chars.some(c => c.id === id));
  st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
  window.DungeonEvents.start(st, "machine_factory", "normal", "test-little-elrana");
  const run = st.explore;
  const node = run.layers[1][0];
  node.type = "elite";
  node.enemies = window.DungeonEnemyGroups.fromIds(run, "elite", ${JSON.stringify(enemyIds)}, st);
  window.DungeonMap.connect(run.layers, st);
  window.render();
  return {
    party: run.activeParty,
    nodeId: node.id,
    enemyIds: (node.enemies || []).map(e => e.id),
    littleLocked: !!little?.locked,
    elranaLocked: !!elrana?.locked,
  };
})()`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);

  await openGame(page);
  await startFreshGame(page);

  // ---------- 场景 1：条件齐全，应触发并解锁 ----------
  console.log("\n— 场景1：艾尔拉娜在队伍 + 遭遇克隆体 —");
  const s1 = await page.evaluate(setupTpl({ party: ["lokar", "elrana"], enemyIds: CLONE_GROUP }));
  T("队伍里真的有艾尔拉娜", s1.party.includes("elrana"), s1);
  T("节点敌人真的含艾尔拉娜克隆体", s1.enemyIds.includes("elrana_clone"), s1);
  T("小艾尔拉娜初始为锁定态", s1.littleLocked === true, s1);

  await page.locator(`[data-dungeon-node="${s1.nodeId}"]`).click();
  await page.waitForFunction(
    () => window.state.hallModal === "littleElranaUnlock" || window.state.battle,
    null, { timeout: 15000 });
  const s1Modal = await page.evaluate(() => window.state.hallModal);
  T("进入节点后触发「克隆体归巢」", s1Modal === "littleElranaUnlock", { hallModal: s1Modal });

  await page.locator(".adv-event").waitFor({ state: "visible" });
  const s1Title = await page.locator(".adv-event h2").textContent();
  T("弹窗标题为「克隆体归巢」", (s1Title || "").trim() === "克隆体归巢", { title: s1Title });

  const s1Lines = await page.evaluate(() => window.state.adv?.total || 0);
  T("台词共 6 句", s1Lines === 6, { total: s1Lines });

  await page.locator("[data-adv-skip]").click();
  await page.locator("[data-little-elrana-unlock-complete]").waitFor({ state: "visible" });
  const s1Btn = await page.locator("[data-little-elrana-unlock-complete]").textContent();
  T("末句出现「带小艾尔拉娜回别墅」", (s1Btn || "").includes("带小艾尔拉娜回别墅"), { btn: s1Btn });

  await page.locator("[data-little-elrana-unlock-complete]").click();
  await page.waitForFunction(
    () => !window.state.chars.find(c => c.id === "little_elrana")?.locked,
    null, { timeout: 15000 });
  const s1After = await page.evaluate(() => {
    const st = window.state;
    const little = st.chars.find(c => c.id === "little_elrana");
    return {
      locked: !!little?.locked,
      seen: !!st.flags?.littleElranaUnlockSeen,
      pending: !!st.flags?.littleElranaUnlockPending,
      logs: st.log.slice(0, 4),
      modal: st.hallModal,
      view: st.view,
    };
  });
  T("小艾尔拉娜已解锁（locked=false）", s1After.locked === false, s1After);
  T("解锁标记已置位", s1After.seen === true, s1After);
  T("待处理标记已清除", s1After.pending === false, s1After);
  T("日志含「小艾尔拉娜加入角色栏」",
    (s1After.logs || []).some(t => t.includes("小艾尔拉娜加入角色栏")), s1After);
  // 注意：解锁艾尔拉娜后，「艾斯解锁事件」会紧接着排队弹出（triggerAceUnlockEvent
  // 的条件是艾尔拉娜已解锁且艾斯未解锁），故此处只断言本事件弹窗已关闭。
  T("解锁后回到大厅且本事件弹窗关闭",
    s1After.modal !== "littleElranaUnlock" && s1After.view === "hall", s1After);

  // 角色列表（teamRoster）里真的能看到她，且不再是灰色剪影（face 占位）
  const s1Roster = await page.evaluate(() => {
    window.state.hallModal = "teamRoster";
    window.render();
    // 角色列表只渲染 !locked 的角色，故能选到卡片本身就证明已解锁
    const hit = document.querySelector('[data-party-roster] [data-toggle-party="little_elrana"]');
    return {
      found: document.body.innerText.includes("小艾尔拉娜"),
      card: !!hit,
      name: hit?.querySelector?.("b")?.textContent || "",
      hasImg: !!hit?.querySelector?.("img"),
      src: hit?.querySelector?.("img")?.getAttribute?.("src") || "",
      locked: !!hit?.className?.includes?.("locked"),
    };
  });
  T("角色列表出现「小艾尔拉娜」", s1Roster.found === true && s1Roster.card === true, s1Roster);
  T("卡片名字正确", s1Roster.name.trim() === "小艾尔拉娜", s1Roster);
  T("卡片有立绘头像（非剪影占位）", s1Roster.hasImg === true && /\.webp$/.test(s1Roster.src), s1Roster);
  await page.evaluate(() => { window.state.hallModal = null; window.render(); });

  // 重复进入同一事件不应二次触发
  const s1Again = await page.evaluate(`(() => {
    const st = window.state;
    window.DungeonEvents.start(st, "machine_factory", "normal", "test-again");
    const run = st.explore, node = run.layers[1][0];
    node.type = "elite";
    node.enemies = window.DungeonEnemyGroups.fromIds(run, "elite", ${JSON.stringify(CLONE_GROUP)}, st);
    window.DungeonMap.connect(run.layers, st);
    window.render();
    return window.tryLittleElranaEncounter(st, { exploration: true, enemies: node.enemies }, () => true);
  })()`);
  T("已解锁后不再重复触发", s1Again === false, { result: s1Again });

  // ---------- 场景 2：敌人不含克隆体，不应触发 ----------
  console.log("\n— 场景2：艾尔拉娜在队伍，但敌人不含克隆体 —");
  const s2 = await page.evaluate(setupTpl({ party: ["lokar", "elrana"], enemyIds: OTHER_GROUP }));
  T("对照组队伍含艾尔拉娜", s2.party.includes("elrana"), s2);
  T("对照组敌人不含克隆体", !s2.enemyIds.includes("elrana_clone"), s2);
  await page.locator(`[data-dungeon-node="${s2.nodeId}"]`).click();
  await page.waitForFunction(
    () => window.state.hallModal === "littleElranaUnlock" || window.state.battle,
    null, { timeout: 15000 });
  const s2Modal = await page.evaluate(() => window.state.hallModal);
  T("未遭遇克隆体则不触发（正常进入战斗）", s2Modal !== "littleElranaUnlock", { hallModal: s2Modal });

  // ---------- 场景 3：队伍不含艾尔拉娜，不应触发 ----------
  console.log("\n— 场景3：遭遇克隆体，但队伍没有艾尔拉娜 —");
  await page.evaluate(() => {
    const st = window.state;
    st.battle = null; st.explore = null; st.view = "hall"; st.hallModal = null;
    window.render();
  });
  const s3 = await page.evaluate(setupTpl({ party: ["lokar", "besta"], enemyIds: CLONE_GROUP }));
  T("对照组队伍不含艾尔拉娜", !s3.party.includes("elrana"), s3);
  T("对照组敌人含克隆体", s3.enemyIds.includes("elrana_clone"), s3);
  await page.locator(`[data-dungeon-node="${s3.nodeId}"]`).click();
  await page.waitForFunction(
    () => window.state.hallModal === "littleElranaUnlock" || window.state.battle,
    null, { timeout: 15000 });
  const s3Modal = await page.evaluate(() => window.state.hallModal);
  T("队伍无艾尔拉娜则不触发（正常进入战斗）", s3Modal !== "littleElranaUnlock", { hallModal: s3Modal });

  // ---------- 收尾 ----------
  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, { errors: bad.slice(0, 4) });

  await browser.close();
  console.log(`\n小艾尔拉娜解锁链路 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
