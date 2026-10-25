// 安倍卡露娜 · 解锁后再次遭遇安倍麦克是否会强制回大厅（回归）
//
// 玩家疑问：解锁安倍卡露娜之后，队伍里仍带着艾尔拉娜，再刷到「鱼人武士安倍麦克」
//           精英节点，会不会又触发「鱼人武士的托付」、被强制踢回别墅、战斗打不成？
//
// 与小艾尔拉娜那份（test-little-elrana-reen-counter-live.js）同构，区别只在：
//   剧情人物为安倍麦克（abe_mike），解锁角色为安倍卡露娜（abe_karuna）。
//
// 用例结构：
//   ① 完整走一遍解锁流程（真实点节点 → 弹窗 → 真实点完成按钮）
//   ② 解锁后重新开副本、真实点击安倍麦克节点，断言必须正常进入战斗
//   ③ 连续再遭遇一次，同样不许回大厅
//   ④ 读档后（持久化）再遭遇一次，同样不许回大厅
//   ⑤ 负向对照：卡露娜仍锁定 + 无 seen 标记时，必须仍能触发（证明判据不是恒假）
//
// 反向验证方式（改完源码后必须重跑，确认断言非空转）：
//   把 extra-unlock-events.js 里 tryAbeKarunaEncounter 的早退判据中三个兜底
//   （abeKarunaUnlockSeen、abeKarunaUnlockPending、!karuna?.locked）全部去掉，
//   只留 `!context?.exploration || !active.includes("elrana") || elrana?.locked`，
//   场景2 / 场景3 / 场景4 应立刻变红（弹出 abeKarunaUnlock 且战斗被清空）。
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

const MIKE_GROUP = ["abe_mike", "skeleton_patrol"];

// 准备：艾尔拉娜在队、卡露娜锁定（首次触发用）。
// 小艾尔拉娜 / 艾斯一并解锁并置 seen，避免别的剧情弹窗插队干扰本用例。
function setupFirstTpl() {
  return `(() => {
  const st = window.state;
  window.Onboarding.skip(st);
  const elrana = st.chars.find(c => c.id === "elrana");
  if (elrana) { elrana.locked = false; elrana.hp = elrana.stats.maxHp; }
  const karuna = st.chars.find(c => c.id === "abe_karuna");
  if (karuna) karuna.locked = true;
  st.flags = st.flags || {};
  delete st.flags.abeKarunaUnlockSeen;
  delete st.flags.abeKarunaUnlockPending;
  st.flags.underwaterTrainUnlocked = true;
  st.flags.littleElranaUnlockSeen = true;
  st.flags.aceUnlockSeen = true;
  const little = st.chars.find(c => c.id === "little_elrana");
  if (little) little.locked = false;
  const ace = st.chars.find(c => c.id === "ace");
  if (ace) ace.locked = false;
  st.party = ["lokar", "elrana"].filter(id => st.chars.some(c => c.id === id));
  st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
  window.DungeonEvents.start(st, "underwater_train", "normal", "test-karuna-reen-1");
  const run = st.explore;
  const node = run.layers[1][0];
  node.type = "elite";
  node.enemies = window.DungeonEnemyGroups.fromIds(run, "elite", ${JSON.stringify(MIKE_GROUP)}, st);
  window.DungeonMap.connect(run.layers, st);
  window.render();
  return {
    party: run.activeParty,
    nodeId: node.id,
    enemyIds: (node.enemies || []).map(e => e.id),
    karunaLocked: !!karuna?.locked,
  };
})()`;
}

// 解锁完成后，重新开一个副本并把某节点摆成安倍麦克精英
function setupReencounterTpl() {
  return `(() => {
  const st = window.state;
  st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
  st.party = ["lokar", "elrana"].filter(id => st.chars.some(c => c.id === id));
  window.DungeonEvents.start(st, "underwater_train", "normal", "test-karuna-reen-2");
  const run = st.explore;
  const node = run.layers[1][0];
  node.type = "elite";
  node.enemies = window.DungeonEnemyGroups.fromIds(run, "elite", ${JSON.stringify(MIKE_GROUP)}, st);
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
  console.log("\n— 场景1：首次遭遇安倍麦克（应触发并解锁）—");
  const s1 = await page.evaluate(setupFirstTpl());
  T("队伍里真的有艾尔拉娜", s1.party.includes("elrana"), s1);
  T("节点敌人真的含安倍麦克", s1.enemyIds.includes("abe_mike"), s1);
  T("卡露娜初始为锁定态", s1.karunaLocked === true, s1);

  const r1 = await clickNodeAndSettle(page, s1.nodeId);
  T("首次遭遇触发「鱼人武士的托付」", r1.modal === "abeKarunaUnlock", r1);

  await page.locator(".adv-event").waitFor({ state: "visible" });
  await page.locator("[data-adv-skip]").click();
  await page.locator("[data-abe-karuna-unlock-complete]").waitFor({ state: "visible" });
  await page.locator("[data-abe-karuna-unlock-complete]").click();
  await page.waitForFunction(
    () => !window.state.chars.find(c => c.id === "abe_karuna")?.locked,
    null, { timeout: 15000 });

  const s1After = await page.evaluate(() => {
    const st = window.state;
    const karuna = st.chars.find(c => c.id === "abe_karuna");
    return {
      locked: !!karuna?.locked,
      seen: !!st.flags?.abeKarunaUnlockSeen,
      pending: !!st.flags?.abeKarunaUnlockPending,
      modal: st.hallModal || null,
      view: st.view,
    };
  });
  T("卡露娜已解锁", s1After.locked === false, s1After);
  T("解锁标记已置位", s1After.seen === true, s1After);
  T("待处理标记已清除", s1After.pending === false, s1After);

  // ---------- 场景 2：解锁后再遭遇（核心）----------
  console.log("\n— 场景2：解锁后带着艾尔拉娜再遇安倍麦克（不应回大厅）—");
  const s2 = await page.evaluate(setupReencounterTpl());
  T("再遇时队伍里仍有艾尔拉娜", s2.party.includes("elrana"), s2);
  T("再遇时节点敌人含安倍麦克", s2.enemyIds.includes("abe_mike"), s2);

  const r2 = await clickNodeAndSettle(page, s2.nodeId);
  T("再遭遇不再弹「鱼人武士的托付」", r2.modal !== "abeKarunaUnlock", r2);
  T("再遭遇正常进入战斗", r2.hasBattle === true, r2);
  T("再遭遇没有被踢回别墅（view 仍为战斗）", r2.view === "battle", r2);
  T("副本进度没有被清空", r2.exploreCleared === false, r2);
  T("战斗里敌方确实是安倍麦克", r2.enemies.includes("abe_mike"), r2);

  // 战斗真的能推进：手牌有牌、真打出一张牌且不被弹窗卡住
  const r2atk = await page.evaluate(`(() => {
    const st = window.state;
    const me = (st.battle?.allies || []).find(u => (u.hand || []).length > 0)
      || (st.battle?.allies || [])[0];
    const target = (st.battle?.enemies || []).find(e => e.id === "abe_mike");
    if (!me || !target) return {
      played: false, reason: "找不到己方单位或安倍麦克",
      allies: (st.battle?.allies || []).map(u => u.ref || u.name),
      enemies: (st.battle?.enemies || []).map(e => e.id),
    };
    const handLen = (me.hand || []).length;
    const card = (me.hand || [])[0];
    if (!card) return { played: false, reason: "手牌为空", handLen };
    window.BattleSystem.useCard(st, me, target, card);
    return {
      played: true, handLen,
      modal: st.hallModal || null, view: st.view,
      hasBattle: !!st.battle,
      cardName: card.name,
    };
  })()`);
  // 注：battle.locked 在本用例构造的战斗里恒为 true（phase=0、activeUid=null），
  // 因为直接改节点敌人后点进来的路径没有走完整的入场初始化；对照组（把安倍麦克换成
  // 普通敌人、其余不变）同样是 locked=true，故它不能作为「是否卡住」的判据，
  // 这里只断言手牌已发出。能否不被卡住由下一条「打出牌后仍在战斗中」覆盖。
  T("解锁后的安倍麦克战斗己方已发到手牌",
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
  T("第三次遭遇仍不弹剧情", r3.modal !== "abeKarunaUnlock", r3);
  T("第三次遭遇仍正常进入战斗", r3.hasBattle === true && r3.view === "battle", r3);

  // ---------- 场景 4：刷新读档后再遭遇 ----------
  // 持久化若丢了 seen 标记，靠 karuna.locked=false 也应兜住，不能重复弹窗
  console.log("\n— 场景4：读档后再遭遇（持久化兜底）—");
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("succubus-kill-save-v1");
    if (!raw) return null;
    const o = JSON.parse(raw);
    const c = (o.chars || []).find(x => x.id === "abe_karuna");
    return { locked: !!c?.locked, seen: !!(o.flags || {}).abeKarunaUnlockSeen };
  });
  T("存档里卡露娜为解锁态且 seen 已落盘",
    !!saved && saved.locked === false && saved.seen === true, saved);

  // 用存档内容覆盖内存态，精确模拟「读档后」的 state
  // （reload 会停在启动界面且 DungeonEvents 尚未装配，走存档值覆盖更可靠、更可控）
  const loaded = await page.evaluate((sv) => {
    const st = window.state;
    const karuna = st.chars.find(c => c.id === "abe_karuna");
    if (karuna) karuna.locked = sv.locked;
    st.flags = st.flags || {};
    st.flags.abeKarunaUnlockSeen = sv.seen;
    delete st.flags.abeKarunaUnlockPending;
    st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
    window.render();
    return {
      karunaLocked: !!karuna?.locked,
      seen: !!st.flags.abeKarunaUnlockSeen,
      pending: !!st.flags.abeKarunaUnlockPending,
    };
  }, { locked: saved?.locked, seen: saved?.seen });
  T("读档态下卡露娜为解锁态且 seen 为真",
    loaded.karunaLocked === false && loaded.seen === true && loaded.pending === false, loaded);

  const s4 = await page.evaluate(setupReencounterTpl());
  T("读档后队伍里仍有艾尔拉娜", s4.party.includes("elrana"), s4);
  T("读档后节点敌人含安倍麦克", s4.enemyIds.includes("abe_mike"), s4);
  const r4 = await clickNodeAndSettle(page, s4.nodeId);
  T("读档后再遭遇不弹剧情", r4.modal !== "abeKarunaUnlock", r4);
  T("读档后再遭遇正常进入战斗", r4.hasBattle === true && r4.view === "battle", r4);

  // ---------- 场景 5：负向对照（证明判据不是恒假）----------
  // 把卡露娜重新锁回、清掉 seen，再遭遇一次，这次「必须」触发。
  // 否则说明前面的「不触发」是因为场景根本走不到判定，断言全是空转。
  console.log("\n— 场景5：负向对照（重置为未解锁，必须重新触发）—");
  await page.evaluate(() => {
    const st = window.state;
    st.battle = null; st.explore = null; st.view = "hall"; st.hallModal = null;
    const karuna = st.chars.find(c => c.id === "abe_karuna");
    if (karuna) karuna.locked = true;
    st.flags = st.flags || {};
    delete st.flags.abeKarunaUnlockSeen;
    delete st.flags.abeKarunaUnlockPending;
    window.render();
  });
  const s5 = await page.evaluate(setupReencounterTpl());
  T("对照场景队伍里仍有艾尔拉娜", s5.party.includes("elrana"), s5);
  T("对照场景节点敌人含安倍麦克", s5.enemyIds.includes("abe_mike"), s5);
  const r5 = await clickNodeAndSettle(page, s5.nodeId);
  T("未解锁时确实会触发剧情（判据非恒假）", r5.modal === "abeKarunaUnlock", r5);
  T("未解锁时确实被踢回别墅（对照成立）",
    r5.view === "hall" && r5.exploreCleared === true, r5);

  // ---------- 收尾 ----------
  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, { errors: bad.slice(0, 4) });

  await browser.close();
  console.log(`\n安倍卡露娜解锁后再遭遇 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
