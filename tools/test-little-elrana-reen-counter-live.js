// 小艾尔拉娜 · 解锁后再次遭遇克隆体是否会强制回大厅（回归）
//
// 玩家疑问：解锁小艾尔拉娜之后，队伍里仍带着艾尔拉娜，再刷到「艾尔拉娜克隆体」
//           精英节点，会不会又触发「克隆体归巢」、被强制踢回别墅、战斗打不成？
//
// 与 test-little-elrana-unlock-live.js 的区别：
//   那边那条「已解锁后不再重复触发」是直接调 tryLittleElranaEncounter 函数、
//   在同一内存会话里验的，不走真实点击。本用例改为：
//     ① 完整走一遍解锁流程（真实点节点 → 弹窗 → 点完成按钮）
//     ② 解锁后重新开副本、真实点击克隆体节点，断言必须正常进入战斗
//     ③ 连续再遭遇一次，同样不许回大厅
//     ④ 读档后（持久化）再遭遇一次，同样不许回大厅
//
// 反向验证方式（改完源码后必须重跑，确认断言非空转）：
//   把 extra-unlock-events.js:13 的早退判据里三个「一次性 / 已解锁」兜底
//   （littleElranaUnlockSeen、littleElranaUnlockPending、!little?.locked）
//   全部去掉，只留 `!context?.exploration || !active.includes("elrana") || elrana?.locked`，
//   场景2 / 场景3 应立刻变红（弹出 littleElranaUnlock 且战斗被清空）。
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

// 准备：艾尔拉娜在队、小艾尔拉娜锁定（首次触发用）。艾斯一并解锁，避免别的剧情弹窗插队干扰。
function setupFirstTpl() {
  return `(() => {
  const st = window.state;
  window.Onboarding.skip(st);
  const elrana = st.chars.find(c => c.id === "elrana");
  if (elrana) { elrana.locked = false; elrana.hp = elrana.stats.maxHp; }
  const little = st.chars.find(c => c.id === "little_elrana");
  if (little) little.locked = true;
  const ace = st.chars.find(c => c.id === "ace");
  if (ace) ace.locked = false;
  st.flags = st.flags || {};
  delete st.flags.littleElranaUnlockSeen;
  delete st.flags.littleElranaUnlockPending;
  st.flags.aceUnlockSeen = true;
  st.party = ["lokar", "elrana"].filter(id => st.chars.some(c => c.id === id));
  st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
  window.DungeonEvents.start(st, "machine_factory", "normal", "test-reen-counter-1");
  const run = st.explore;
  const node = run.layers[1][0];
  node.type = "elite";
  node.enemies = window.DungeonEnemyGroups.fromIds(run, "elite", ${JSON.stringify(CLONE_GROUP)}, st);
  window.DungeonMap.connect(run.layers, st);
  window.render();
  return {
    party: run.activeParty,
    nodeId: node.id,
    enemyIds: (node.enemies || []).map(e => e.id),
    littleLocked: !!little?.locked,
  };
})()`;
}

// 解锁完成后，重新开一个副本并把某节点摆成克隆体精英
function setupReencounterTpl() {
  return `(() => {
  const st = window.state;
  st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
  st.party = ["lokar", "elrana"].filter(id => st.chars.some(c => c.id === id));
  window.DungeonEvents.start(st, "machine_factory", "normal", "test-reen-counter-2");
  const run = st.explore;
  const node = run.layers[1][0];
  node.type = "elite";
  node.enemies = window.DungeonEnemyGroups.fromIds(run, "elite", ${JSON.stringify(CLONE_GROUP)}, st);
  window.DungeonMap.connect(run.layers, st);
  window.render();
  return {
    party: run.activeParty,
    nodeId: node.id,
    enemyIds: (node.enemies || []).map(e => e.id),
  };
})()`;
}

// 点节点后等一个稳定态：要么进战斗，要么弹剧情窗
async function clickNodeAndSettle(page, nodeId) {
  await page.locator(`[data-dungeon-node="${nodeId}"]`).click();
  await page.waitForFunction(
    () => window.state.battle || window.state.hallModal,
    null, { timeout: 15000 });
  return page.evaluate(() => {
    const st = window.state;
    return {
      modal: st.hallModal || null,
      view: st.view,
      hasBattle: !!st.battle,
      exploreCleared: st.explore === null,
      enemies: (st.battle?.enemies || []).map(e => e.id),
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);

  await openGame(page);
  await startFreshGame(page);

  // ---------- 场景 1：首次遭遇，正常触发并解锁 ----------
  console.log("\n— 场景1：首次遭遇克隆体（应触发并解锁）—");
  const s1 = await page.evaluate(setupFirstTpl());
  T("队伍里真的有艾尔拉娜", s1.party.includes("elrana"), s1);
  T("节点敌人真的含克隆体", s1.enemyIds.includes("elrana_clone"), s1);
  T("小艾尔拉娜初始为锁定态", s1.littleLocked === true, s1);

  const r1 = await clickNodeAndSettle(page, s1.nodeId);
  T("首次遭遇触发「克隆体归巢」", r1.modal === "littleElranaUnlock", r1);

  await page.locator(".adv-event").waitFor({ state: "visible" });
  await page.locator("[data-adv-skip]").click();
  await page.locator("[data-little-elrana-unlock-complete]").waitFor({ state: "visible" });
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
      modal: st.hallModal || null,
      view: st.view,
    };
  });
  T("小艾尔拉娜已解锁", s1After.locked === false, s1After);
  T("解锁标记已置位", s1After.seen === true, s1After);
  T("待处理标记已清除", s1After.pending === false, s1After);

  // ---------- 场景 2：解锁后再遭遇（核心）----------
  console.log("\n— 场景2：解锁后带着艾尔拉娜再遇克隆体（不应回大厅）—");
  const s2 = await page.evaluate(setupReencounterTpl());
  T("再遇时队伍里仍有艾尔拉娜", s2.party.includes("elrana"), s2);
  T("再遇时节点敌人含克隆体", s2.enemyIds.includes("elrana_clone"), s2);

  const r2 = await clickNodeAndSettle(page, s2.nodeId);
  T("再遭遇不再弹「克隆体归巢」", r2.modal !== "littleElranaUnlock", r2);
  T("再遭遇正常进入战斗", r2.hasBattle === true, r2);
  T("再遭遇没有被踢回别墅（view 仍为战斗）", r2.view === "battle", r2);
  T("副本进度没有被清空", r2.exploreCleared === false, r2);
  T("战斗里敌方确实是克隆体", r2.enemies.includes("elrana_clone"), r2);

  // 战斗真的能推进：手牌有牌、战斗未锁定，且真的打出一张牌不被弹窗卡住
  const r2atk = await page.evaluate(`(() => {
    const st = window.state;
    const me = (st.battle?.allies || []).find(u => (u.hand || []).length > 0)
      || (st.battle?.allies || [])[0];
    const target = (st.battle?.enemies || []).find(e => e.id === "elrana_clone");
    if (!me || !target) return {
      played: false, reason: "找不到己方单位或克隆体",
      allies: (st.battle?.allies || []).map(u => u.ref || u.name),
      enemies: (st.battle?.enemies || []).map(e => e.id),
    };
    const handLen = (me.hand || []).length;
    const locked = !!st.battle?.locked;
    const card = (me.hand || [])[0];
    if (!card) return { played: false, reason: "手牌为空", handLen, locked };
    window.BattleSystem.useCard(st, me, target, card);
    return {
      played: true, handLen, locked,
      modal: st.hallModal || null, view: st.view,
      hasBattle: !!st.battle,
      cardName: card.name,
    };
  })()`);
  // 注：battle.locked 在本用例构造的战斗里恒为 true（phase=0、activeUid=null），
  // 因为直接改节点敌人后点进来的路径没有走完整的入场初始化；对照组（把克隆体换成
  // 普通敌人、其余不变）同样是 locked=true，故它不能作为「是否卡住」的判据，
  // 这里只断言手牌已发出。能否不被卡住由下一条「打出牌后仍在战斗中」覆盖。
  T("解锁后的克隆体战斗己方已发到手牌",
    r2atk.played === true && r2atk.handLen > 0, r2atk);
  T("解锁后能真的打出牌且不被弹窗打断",
    r2atk.played === true && r2atk.view === "battle" && r2atk.hasBattle === true
    && !r2atk.modal, r2atk);

  // ---------- 场景 3：连续第三次遭遇 ----------
  console.log("\n— 场景3：再遭遇第二次（累积第三次，仍不应回大厅）—");
  await page.evaluate(() => {
    const st = window.state;
    st.battle = null; st.explore = null; st.view = "hall"; st.hallModal = null;
    window.render();
  });
  const s3 = await page.evaluate(setupReencounterTpl());
  const r3 = await clickNodeAndSettle(page, s3.nodeId);
  T("第三次遭遇仍不弹剧情", r3.modal !== "littleElranaUnlock", r3);
  T("第三次遭遇仍正常进入战斗", r3.hasBattle === true && r3.view === "battle", r3);

  // ---------- 场景 4：刷新读档后再遭遇 ----------
  // 持久化若丢了 seen 标记，靠 little.locked=false 也应兜住，不能重复弹窗
  console.log("\n— 场景4：读档后再遭遇（持久化兜底）—");
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("succubus-kill-save-v1");
    if (!raw) return null;
    const o = JSON.parse(raw);
    const c = (o.chars || []).find(x => x.id === "little_elrana");
    return { locked: !!c?.locked, seen: !!(o.flags || {}).littleElranaUnlockSeen };
  });
  T("存档里小艾尔拉娜为解锁态且 seen 已落盘",
    !!saved && saved.locked === false && saved.seen === true, saved);

  // 用存档内容覆盖内存态，精确模拟「读档后」的 state
  // （reload 会停在启动界面且 DungeonEvents 尚未装配，走存档值覆盖更可靠、更可控）
  const loaded = await page.evaluate((sv) => {
    const st = window.state;
    const little = st.chars.find(c => c.id === "little_elrana");
    if (little) little.locked = sv.locked;
    st.flags = st.flags || {};
    st.flags.littleElranaUnlockSeen = sv.seen;
    delete st.flags.littleElranaUnlockPending;
    st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
    window.render();
    return {
      littleLocked: !!little?.locked,
      seen: !!st.flags.littleElranaUnlockSeen,
      pending: !!st.flags.littleElranaUnlockPending,
    };
  }, { locked: saved?.locked, seen: saved?.seen });
  T("读档态下小艾尔拉娜为解锁态且 seen 为真",
    loaded.littleLocked === false && loaded.seen === true && loaded.pending === false, loaded);

  const s4 = await page.evaluate(setupReencounterTpl());
  T("读档后队伍里仍有艾尔拉娜", s4.party.includes("elrana"), s4);
  T("读档后节点敌人含克隆体", s4.enemyIds.includes("elrana_clone"), s4);
  const r4 = await clickNodeAndSettle(page, s4.nodeId);
  T("读档后再遭遇不弹剧情", r4.modal !== "littleElranaUnlock", r4);
  T("读档后再遭遇正常进入战斗", r4.hasBattle === true && r4.view === "battle", r4);

  // ---------- 收尾 ----------
  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, { errors: bad.slice(0, 4) });

  await browser.close();
  console.log(`\n小艾尔拉娜解锁后再遭遇 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
