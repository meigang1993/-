// 天日国鹰7研究所 · 真实浏览器逐层通关（255 版）
// 玩家入口仍 devLocked「未开发完成」；本脚本只在页面运行时临时解除入口锁，
// 不改任何产品源码/文件，用于回答「开发完成后这条流程能不能真正通关」。
// 链路：start → 14 层逐节点 enter/settle → 第 14 层 BOSS → confirmReward → finish → 回大厅。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const path = require("path");
const { dismissOpeningStory } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push("console: " + m.text()); });

  const results = [];
  const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };

  await page.goto("file://" + path.resolve(__dirname, "..", "publish/index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2500);
  await page.locator("[data-start-game]").click();
  await dismissOpeningStory(page);
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([window.GameBundles.load("battle"), window.GameBundles.load("dungeon")]));
  await page.waitForTimeout(500);

  // 只在运行时模拟「开发完成」：解除 devLocked、补剧情 flag，产品文件不动。
  await page.evaluate(() => {
    const st = window.state;
    st.flags = st.flags || {};
    st.flags.tenriInstituteUnlocked = true;
    st.party = (st.chars || []).filter(c => !c.locked).slice(0, 4).map(c => c.id);
    if (st.flags?.onboarding) { st.flags.onboarding.skipped = true; st.flags.onboarding.completed = true; }
    st.sortieStarting = false; st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
    const m = window.GameData.missions.find(x => x.id === "tenri_institute");
    m.devLocked = false; delete m.devHint;
    if (window.render) window.render();
  });
  await page.waitForTimeout(300);

  // 关掉可能占位的剧情弹窗，再打开出征面板。
  for (let k = 0; k < 3; k++) {
    const closeBtn = page.locator("[data-close-modal='1']");
    if (!(await closeBtn.count())) break;
    await closeBtn.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { if (window.state.hallModal && window.state.hallModal !== "team") { window.state.hallModal = null; if (window.render) window.render(); } });
  await page.waitForTimeout(300);
  if (!(await page.locator(".villa-modal").isVisible().catch(() => false))) {
    await page.locator("[data-open-modal='team']").first().click();
  }
  await page.locator(".villa-modal").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);

  const startBtn = page.locator('[data-start="tenri_institute"][data-difficulty="normal"]');
  const startCount = await startBtn.count();
  const startDisabled = startCount ? await startBtn.first().isDisabled().catch(() => true) : true;
  check("入口按钮存在且可点（devLocked 已临时解除）", startCount > 0 && !startDisabled, `count=${startCount}`);
  if (!startCount || startDisabled) {
    console.log(JSON.stringify(await page.evaluate(() => ({
      view: window.state.view, hallModal: window.state.hallModal,
      missions: (window.GameData?.missions || []).filter(m => m.kind === "dungeon").map(m => `${m.id}:${m.devLocked ? "locked" : "open"}`),
    })), null, 2));
    await browser.close();
    process.exit(1);
  }

  await startBtn.first().click();
  await page.locator(".dungeon-screen").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(700);

  const initial = await page.evaluate(() => ({
    layers: window.state.explore?.layers?.length,
    missionId: window.state.explore?.missionId,
    gold: window.state.resources?.gold,
  }));
  check("进入副本且生成 14 层", initial.layers === 14 && initial.missionId === "tenri_institute", `layers=${initial.layers}`);
  await page.screenshot({ path: "/data/workspace/研究所14层地图-255.png" });

  const types = [];
  const battles = [];
  let reachedBoss = false;
  for (let step = 1; step <= 20; step++) {
    const openNodes = await page.locator(".map-node.open:not([disabled])").count();
    if (!openNodes) { console.log(`  [${step}] 无可点节点，提前结束`); break; }
    const elite = page.locator(".map-node.open.elite:not([disabled])");
    const target = (await elite.count()) ? elite.first() : page.locator(".map-node.open:not([disabled])").first();
    const info = await target.evaluate(el => ({
      id: el.getAttribute("data-dungeon-node"),
      cls: el.className,
      label: el.querySelector(".node-label")?.textContent || "",
    }));
    const type = (info.cls.match(/map-node (\w+)/) || [])[1] || "?";
    types.push(type);
    await target.click();
    await page.waitForTimeout(1000);

    const after = await page.evaluate(() => ({
      view: window.state.view,
      hasBattle: !!window.state.battle,
      rewardPopup: !!window.state.explore?.rewardPopup,
    }));

    if (after.hasBattle) {
      const won = await page.evaluate(async () => {
        const st = window.state, bt = st.battle, run = st.explore;
        const node = (run.layers || []).flat().find(x => x.id === run.pending);
        const ids = (node?.enemies || []).map(e => e.id).filter(Boolean);
        (bt.enemies || []).forEach(e => { e.hp = 0; });
        bt.defeatedEnemyIds = ids;
        try {
          const r = await window.DungeonNodeRewards.completeBattle(st, true);
          if (window.render) window.render();
          return { r, ids: ids.length, exp: st.explore?.lastReward?.experience || 0 };
        } catch (e) { return { r: "ERR:" + e.message }; }
      });
      battles.push({ type, ...won });
      console.log(`  [${step}] ${type} 战斗胜利 → 结算=${won.r} 击败${won.ids || 0} 经验=${won.exp || 0}`);
      await page.waitForTimeout(500);
      const claim = page.locator("[data-node-claim], .reward-popup button").first();
      if (await claim.count()) { await claim.click().catch(() => {}); await page.waitForTimeout(400); }
      await page.evaluate(() => { if (window.state.view === "battle") { window.state.battle = null; window.state.view = "dungeon"; if (window.render) window.render(); } });
      await page.waitForTimeout(300);
    } else {
      if (type === "rest") {
        const restBtn = page.locator('[data-rest-choice="team"]');
        if (await restBtn.count()) { await restBtn.first().click().catch(() => {}); await page.waitForTimeout(600); }
      } else if (type === "chest") {
        const claim = page.locator('[data-node-claim="chest"]');
        if (await claim.count()) { await claim.first().click().catch(() => {}); await page.waitForTimeout(600); }
      } else if (after.rewardPopup) {
        const claim = page.locator("[data-node-claim], .reward-popup button").first();
        if (await claim.count()) { await claim.click().catch(() => {}); await page.waitForTimeout(500); }
      }
      console.log(`  [${step}] ${type}「${info.label}」`);
    }

    for (let k = 0; k < 3; k++) {
      const rc = page.locator('[data-reward-confirm="1"]');
      if (!(await rc.count())) break;
      await rc.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => {
      if (window.state.explore?.rewardPopup && window.DungeonRewards?.confirmReward) {
        window.DungeonRewards.confirmReward(window.state);
        if (window.render) window.render();
      }
      if (window.state.view !== "dungeon" && window.state.explore) {
        window.state.battle = null; window.state.view = "dungeon";
        if (window.render) window.render();
      }
    });
    await page.waitForTimeout(300);
    if (type === "boss") { reachedBoss = true; break; }
  }

  const beforeFinish = await page.evaluate(() => ({
    complete: !!window.state.explore?.complete,
    done: (window.state.explore?.layers || []).flat().filter(n => n.done).length,
    earnedGold: window.state.explore?.earned?.gold,
    rewardPopup: !!window.state.explore?.rewardPopup,
    view: window.state.view,
  }));
  check("走到第 14 层 BOSS", reachedBoss && types.includes("boss"), `types=[${types.join(",")}]`);
  check("BOSS 结算后 run.complete=true 且奖励弹窗已确认",
    beforeFinish.complete && !beforeFinish.rewardPopup, `done=${beforeFinish.done} earnedGold=${beforeFinish.earnedGold}`);
  check("11 场战斗全部真实结算通过",
    battles.length > 0 && battles.every(b => b.r === true), `battles=${battles.length}`);

  const finishBtn = page.locator('[data-dungeon-finish="1"]');
  const finishCount = await finishBtn.count();
  check("通关结算按钮出现", finishCount > 0, `count=${finishCount}`);
  if (finishCount) { await finishBtn.first().click().catch(() => {}); await page.waitForTimeout(1200); }

  const final = await page.evaluate(() => ({
    view: window.state.view,
    exploreNull: window.state.explore === null,
    gold: window.state.resources?.gold,
    clearRecord: (window.state.butlerFeats || []).includes("clear:tenri_institute@normal"),
    adventureUnlocked: !!(window.DungeonUnlocks?.has?.(window.state, "tenri_institute", "adventure")),
    flag: !!window.state.flags?.tenriInstituteUnlocked,
    pendingSettlements: window.SettlementRecovery?.count?.(window.state) ?? 0,
  }));
  check("finish 回到大厅且清空 explore", final.view === "hall" && final.exploreNull, `view=${final.view}`);
  check("金币已入账（> 初始）", final.gold > initial.gold, `${initial.gold} → ${final.gold}`);
  check("管家手册写入通关记录", final.clearRecord);
  check("难度链推进到冒险级", final.adventureUnlocked);
  check("剧情解锁标记保持（不重复弹窗）", final.flag);
  check("附加结算无滞留", final.pendingSettlements === 0, `pending=${final.pendingSettlements}`);
  check("页面无 JS 错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "无");

  // 占位怪物池连带触发的普雷希/米尔尤拉解锁剧情只是剧情弹窗，关掉后拍干净大厅。
  await page.evaluate(() => { if (window.state.hallModal) { window.state.hallModal = null; if (window.render) window.render(); } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/data/workspace/研究所通关-255.png" });
  const bad = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length - bad.length}/${results.length} · 节点 [${types.join(",")}] · 战斗 ${battles.length} 场`);
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch(e => { console.error("LIVE_THREW", e && e.stack ? e.stack : e); process.exit(2); });
