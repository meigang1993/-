// 三副本真实试玩：从起点逐个点击节点，进入战斗→结算→推进，验证节点链路
const { chromium } = require("playwright");
const path = require("path");

const DUNGEONS = [
  { id: "ruins_sand_city", name: "废墟沙城", flag: "ruinsSandCityUnlocked", maxSteps: 14 },
  { id: "orc_dungeon", name: "兽人地下城", flag: "orcDungeonUnlocked", maxSteps: 14 },
  { id: "underwater_train", name: "水下列车", flag: "underwaterTrainUnlocked", maxSteps: 14 },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push("console: " + m.text()); });

  await page.goto("file://" + path.resolve(__dirname, "..", "publish/index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2500);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([window.GameBundles.load("battle"), window.GameBundles.load("dungeon")]));
  await page.waitForTimeout(500);

  const summary = [];
  for (const d of DUNGEONS) {
    console.log(`\n========== 试玩 ${d.name} ==========`);
    await page.evaluate(() => {
      const st = window.state;
      st.flags = st.flags || {};
      ["ruinsSandCityUnlocked", "orcDungeonUnlocked", "underwaterTrainUnlocked"].forEach(f => { st.flags[f] = true; });
      if (!st.unlockedDifficulties?.includes("normal")) st.unlockedDifficulties = ["normal", ...(st.unlockedDifficulties || [])];
      st.party = (st.chars || []).filter(c => !c.locked).slice(0, 4).map(c => c.id);
      st.sortieStarting = false;
      st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null;
      if (window.render) window.render();
    });
    await page.waitForTimeout(300);
    // 关闭可能弹出的剧情事件弹窗（通关副本会触发），否则占用 modal 位置
    for (let k = 0; k < 3; k++) {
      const closeBtn = page.locator("[data-close-modal='1']");
      if (!(await closeBtn.count())) break;
      await closeBtn.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => {
      if (window.state.hallModal && window.state.hallModal !== "team") { window.state.hallModal = null; if (window.render) window.render(); }
    });
    await page.waitForTimeout(300);
    const modalOpen = await page.locator(".villa-modal").isVisible().catch(() => false);
    if (!modalOpen) await page.locator("[data-open-modal='team']").first().click();
    await page.locator(".villa-modal").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(250);
    const startBtn = page.locator(`[data-start="${d.id}"][data-difficulty="normal"]`);
    if (!(await startBtn.count())) {
      const diag = await page.evaluate(() => {
        const m = document.querySelector(".villa-modal");
        return {
          modalHTML: m ? m.innerHTML.slice(0, 300) : null,
          view: window.state.view,
          hallModal: window.state.hallModal,
          sortieStarting: window.state.sortieStarting,
          startBtns: [...document.querySelectorAll("[data-start]")].map(b => b.getAttribute("data-start") + "/" + b.getAttribute("data-difficulty")),
        };
      });
      console.log("  ❌ 未找到入口，诊断:", JSON.stringify(diag, null, 2));
      await page.screenshot({ path: path.resolve(__dirname, "..", `shot-nostart-${d.id}.png`) });
      continue;
    }
    await startBtn.first().click();
    await page.locator(".dungeon-screen").waitFor({ state: "visible" });
    await page.waitForTimeout(700);

    const steps = [];
    for (let s = 1; s <= d.maxSteps; s++) {
      // 找到可点击的下一个节点
      const openNodes = await page.locator(".map-node.open:not([disabled])").count();
      if (!openNodes) { steps.push({ step: s, r: "无可点节点" }); break; }
      // 优先选择精英节点，以便验证精英掉卡链（修复重点）
      const eliteNode = page.locator(".map-node.open.elite:not([disabled])");
      const target = (await eliteNode.count()) ? eliteNode.first() : page.locator(".map-node.open:not([disabled])").first();
      const nodeInfo = await target.evaluate(el => ({
        id: el.getAttribute("data-dungeon-node"),
        cls: el.className,
        label: el.querySelector(".node-label")?.textContent || "",
      }));
      const type = (nodeInfo.cls.match(/map-node (\w+)/) || [])[1] || "?";
      await target.click();
      await page.waitForTimeout(1200);

      const after = await page.evaluate(() => ({
        view: window.state.view,
        hasBattle: !!window.state.battle,
        explore: !!window.state.explore,
        rewardPopup: !!window.state.explore?.rewardPopup,
        current: window.state.explore?.current,
      }));

      let note = "";
      if (after.hasBattle) {
        // 战斗已开始：读取敌人信息（含 ABCD 编号）
        const battleInfo = await page.evaluate(() => {
          const b = window.state.battle;
          const enemies = (b.enemies || []).map(e => `${e.name}${e.label || ""}(hp${e.hp})`);
          return {
            enemies,
            nodeType: b.nodeType,
            handCount: (b.allies?.[0]?.hand || b.hand || []).length,
            enemyRowCount: document.querySelectorAll(".enemy-row .unit").length,
            duplicateLabels: [...document.querySelectorAll(".duplicate-label")].map(x => x.textContent),
          };
        });
        note = `战斗[${battleInfo.nodeType}] 敌人=${battleInfo.enemies.join(",")} 手牌=${battleInfo.handCount}`;
        if (battleInfo.duplicateLabels.length) note += ` 重复编号=${battleInfo.duplicateLabels.join("/")}`;
        // 模拟真实胜利：清空敌人血量 + 填入与节点敌人完全一致的击败名单
        // （服务器校验 defeatedEnemyIds 必须等于 node.enemies 的 id 集合）
        const won = await page.evaluate(async () => {
          const st = window.state, bt = st.battle, run = st.explore;
          const node = (run.layers || []).flat().find(x => x.id === run.pending);
          const ids = (node?.enemies || []).map(e => e.id).filter(Boolean);
          bt.enemies.forEach(e => { e.hp = 0; });
          bt.defeatedEnemyIds = ids;
          const beforeCards = (st.unlockedShopCards || []).length;
          const beforeElites = (st.defeatedElites || []).length;
          try {
            const r = await window.DungeonNodeRewards.completeBattle(st, true);
            if (window.render) window.render();
            return { r, ids, gained: (st.unlockedShopCards || []).length - beforeCards, elites: (st.defeatedElites || []).length - beforeElites };
          } catch (e) { return { r: "ERR:" + e.message }; }
        });
        note += ` 结算=${won.r} 击败${won.ids?.length || 0} 解锁卡+${won.gained || 0} 精英+${won.elites || 0}`;
        steps.push({ step: s, type, label: nodeInfo.label, r: note });
        console.log(`  [${s}] 点击 ${type}「${nodeInfo.label}」→ ${note}`);
        await page.waitForTimeout(800);
        // 关闭奖励弹窗
        const claim = page.locator("[data-node-claim], .reward-popup button").first();
        if (await claim.count()) { await claim.click().catch(() => {}); await page.waitForTimeout(600); }
        // 若回到战斗视图则强制回地图
        await page.evaluate(() => {
          if (window.state.view === "battle") { window.state.battle = null; window.state.view = "dungeon"; if (window.render) window.render(); }
        });
        await page.waitForTimeout(400);
        continue;
      }
      if (after.rewardPopup) {
        const claim = page.locator("[data-node-claim], .reward-popup button").first();
        if (await claim.count()) { await claim.click().catch(() => {}); await page.waitForTimeout(600); }
        note = `${type} 弹窗已领取`;
      } else if (type === "rest") {
        // 休整节点需要点「确认」
        const restBtn = page.locator('[data-rest-choice="team"]');
        if (await restBtn.count()) {
          await restBtn.first().click().catch(() => {});
          await page.waitForTimeout(800);
          const healed = await page.evaluate(() => (window.state.chars || []).filter(c => !c.locked).map(c => `${c.name}:${c.hp}/${c.stats?.maxHp}`).join(" "));
          note = `休整已确认 → ${healed}`;
        } else { note = "休整无确认按钮"; }
      } else if (type === "chest") {
        const claim = page.locator('[data-node-claim="chest"]');
        if (await claim.count()) { await claim.first().click().catch(() => {}); await page.waitForTimeout(700); note = "宝箱已开启"; }
        else note = "宝箱无开启按钮";
      } else {
        note = `${type} view=${after.view}`;
      }
      steps.push({ step: s, type, label: nodeInfo.label, r: note });
      console.log(`  [${s}] 点击 ${type}「${nodeInfo.label}」→ ${note}`);
      // 统一关闭奖励确认弹窗（宝箱/战斗胜利后都会出现，不关则 canChoose 一直为 false）
      for (let k = 0; k < 3; k++) {
        const rc = page.locator('[data-reward-confirm="1"]');
        if (!(await rc.count())) break;
        await rc.first().click().catch(() => {});
        await page.waitForTimeout(700);
      }
      const pendingPopup = await page.evaluate(() => !!window.state.explore?.rewardPopup);
      if (pendingPopup) {
        await page.evaluate(() => { if (window.DungeonRewards?.confirmReward) window.DungeonRewards.confirmReward(window.state); if (window.render) window.render(); });
        await page.waitForTimeout(400);
      }
      // 若不在地图视图，尝试回到地图
      const back = await page.evaluate(() => {
        if (window.state.view !== "dungeon" && window.state.explore) {
          window.state.battle = null; window.state.view = "dungeon";
          if (window.render) window.render(); return "forced-back";
        }
        return window.state.view;
      });
      if (back === "forced-back") { console.log("     (强制回到地图)"); await page.waitForTimeout(400); }
      if (type === "boss") break;
    }

    const final = await page.evaluate(() => ({
      view: window.state.view,
      current: window.state.explore?.current,
      done: (window.state.explore?.layers || []).flat().filter(n => n.done).length,
      earned: window.state.explore?.earned?.gold,
      complete: window.state.explore?.complete,
    }));
    console.log(`  结果: view=${final.view} 已完成节点=${final.done} 累计金币=${final.earned} 通关=${!!final.complete}`);
    // 通关后点「返回据点」，否则下一个副本无法开始
    const finishBtn = page.locator('[data-dungeon-finish="1"]');
    if (await finishBtn.count()) {
      await finishBtn.first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => {
      const st = window.state;
      st.view = "hall"; st.hallModal = null; st.explore = null; st.battle = null; st.sortieStarting = false;
      if (window.render) window.render();
    });
    await page.locator(".villa-hall").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.resolve(__dirname, "..", `shot-playtest-${d.id}.png`) });
    summary.push({ id: d.id, name: d.name, steps, final });
  }

  console.log("\n========== 试玩汇总 ==========");
  for (const s of summary) {
    const types = s.steps.map(x => x.type).filter(Boolean);
    const battles = s.steps.filter(x => /战斗/.test(x.r)).length;
    const okSettle = s.steps.every(x => !/结算=false|ERR:/.test(x.r));
    console.log(`${okSettle ? "✅" : "❌"} ${s.name}: 走了 ${s.steps.length} 步，战斗 ${battles} 场，节点类型 [${types.join(",")}]`);
    s.steps.forEach(x => { if (/ERR:|结算=false/.test(x.r)) console.log(`     ❌ ${x.r}`); });
  }
  console.log(`\n页面错误: ${errors.length ? errors.slice(0, 6).join(" | ") : "无"}`);
  await browser.close();
})();
