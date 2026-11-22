// 天日国鹰7研究所 · 端到端玩家链路实机（255 版）
// 真实点击出征废墟沙城·冒险级 → 真实逐层点节点 / 战斗结算 / 通关领奖 / 回大厅
// → 自动弹出「出发前夜」剧情 → 真实点「跳到结尾」→ 真实点「各自准备，明天出发」
// → 校验解锁落盘。不手工注入 pending、不直接调 trigger 函数，剧情必须由通关链自己弹出。
//
// 前置条件（普雷希/米尔尤拉已解锁、废墟沙城与冒险级已开放）在运行时构造，
// 因为新档不可能天然满足；这些是玩家「已经玩到这一步」的存档形态，不是跳过链路。
// 战斗胜沿用项目既有实机范式：运行时置敌人 hp=0 + 调真实 DungeonNodeRewards.completeBattle 结算，
// 不逐张出牌（完整战斗 AI 不稳定且非本次链路关注点）。不改任何产品源码。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const path = require("path");
const { dismissOpeningStory } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const ROOT = path.resolve(__dirname, "..");
// NEGATE=1：在点击通关结算前把研究所触发链替换成 no-op，验证「不经过通关链就不会凭空弹窗」。
// A/B/C 段仍走完整真实通关，D 段只判定反向结果后退出，不跑 E/F。
const NEGATE = process.env.NEGATE === "1";
const results = [];
const check = (group, name, ok, detail = "") => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? "✅" : "❌"} [${group}] ${name}${detail ? " · " + detail : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + String(e)));
  page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push("console: " + m.text()); });

  await page.goto("file://" + path.join(ROOT, "publish", "index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2200);
  await page.locator("[data-start-game]").click();
  await dismissOpeningStory(page);
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([
    window.GameBundles.load("battle"), window.GameBundles.load("dungeon"), window.GameBundles.load("hall"),
  ]));
  await page.waitForTimeout(400);

  // ---------- A 构造「已玩到这一步」的前置存档，并确认研究所剧情尚未触发 ----------
  const pre = await page.evaluate(() => {
    const st = window.state;
    st.flags = st.flags || {};
    // 研究所剧情彻底清零（本链路必须由通关自己触发）
    delete st.flags.tenriInstituteUnlocked;
    delete st.flags.tenriInstituteUnlockSeen;
    delete st.flags.tenriInstituteUnlockPending;
    if (window.UnlockEventProgress?.fresh) st.unlockEvents = window.UnlockEventProgress.fresh();
    // 玩家前置：废墟沙城已解锁 + 冒险级已开放 + 普雷希/米尔尤拉已解锁
    st.flags.ruinsSandCityUnlocked = true;
    st.flags.ruinsSandCityUnlockSeen = true;
    st.flags.orcDungeonUnlocked = true;
    st.flags.orcDungeonUnlockSeen = true;
    // 冒险级是「通关普通级」解锁的：ServerCore 的 core 快照会按 butlerFeats 重算难度链
    // （DungeonUnlocks.migrate），只手动 unlock 会被回收成 normal 导致 startDungeon 拒绝。
    // 因此按真实存档形态补一条普通级通关记录，而不是伪造难度。
    st.butlerFeats = Array.isArray(st.butlerFeats) ? st.butlerFeats : [];
    if (!st.butlerFeats.includes("clear:ruins_sand_city@normal")) {
      st.butlerFeats.push("clear:ruins_sand_city@normal");
    }
    window.DungeonUnlocks.unlock(st, "ruins_sand_city", "adventure");
    ["preshi", "mieryula"].forEach(id => {
      const c = (st.chars || []).find(x => x.id === id);
      if (c) { c.locked = false; c.hp = c.stats?.maxHp || c.hp; }
    });
    // 其余剧情标记置为已看，避免通关后抢占 hallModal（不覆盖研究所事件本身）
    ["hoshinoFamilyUnlockSeen", "gerdaNurseryUnlocked", "hitwellUnlockSeen",
      "preshiUnlockSeen", "mieryulaUnlockSeen", "opheliaUnlockSeen",
      "bestaNurseryUnlocked", "ailengUnlockSeen", "underwaterTrainFirstClear",
    ].forEach(k => { st.flags[k] = true; });

    st.party = (st.chars || []).filter(c => !c.locked).slice(0, 4).map(c => c.id);
    if (st.flags?.onboarding) { st.flags.onboarding.skipped = true; st.flags.onboarding.completed = true; }
    st.sortieStarting = false; st.view = "hall"; st.hallModal = null;
    st.explore = null; st.battle = null; st.adv = null;
    if (window.render) window.render();
    return {
      view: st.view, hallModal: st.hallModal, party: st.party.length,
      castReady: window.GameDataTenriInstitute.unlockCastReady(st),
      adventureOpen: window.DungeonUnlocks.has(st, "ruins_sand_city", "adventure"),
      pending: !!st.flags.tenriInstituteUnlockPending,
      unlocked: !!st.flags.tenriInstituteUnlocked,
      gold: st.resources?.gold,
    };
  });
  await page.waitForTimeout(400);
  check("A", "前置：两位角色已解锁且冒险级已开放", pre.castReady && pre.adventureOpen, JSON.stringify(pre));
  check("A", "前置：研究所剧情尚未触发（无 pending / 无 unlocked）", !pre.pending && !pre.unlocked);
  check("A", "前置：大厅无弹窗", pre.hallModal === null && pre.view === "hall");

  // 清掉开场可能残留的剧情弹窗（真实点击完成/关闭）
  for (let k = 0; k < 4; k++) {
    const done = page.locator([
      "[data-new-game-intro-complete]", "[data-first-victory-complete]",
      "[data-first-defeat-complete]", "[data-close-modal]",
    ].join(",")).first();
    if (!(await done.count())) break;
    await done.evaluate(el => el.click()).catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => {
    if (window.state.hallModal && window.state.hallModal !== "team") {
      window.state.hallModal = null;
      if (window.render) window.render();
    }
  });

  // ---------- B 真实点击大厅出征按钮 ----------
  if (!(await page.locator(".villa-modal").isVisible().catch(() => false))) {
    await page.locator("[data-open-modal='team']").first().click();
  }
  await page.locator(".villa-modal").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
  const startBtn = page.locator('[data-start="ruins_sand_city"][data-difficulty="adventure"]');
  const startCount = await startBtn.count();
  const startDisabled = startCount ? await startBtn.first().isDisabled().catch(() => true) : true;
  check("B", "废墟沙城·冒险级出征按钮存在且可点", startCount > 0 && !startDisabled, `count=${startCount}`);
  if (!startCount || startDisabled) {
    console.log(JSON.stringify(await page.evaluate(() => ({
      view: window.state.view, hallModal: window.state.hallModal,
      missions: (window.GameData?.missions || []).filter(m => m.kind === "dungeon")
        .map(m => `${m.id}:${m.requiresFlag}=${!!window.state.flags?.[m.requiresFlag]}`),
      diff: window.DungeonUnlocks.list(window.state, "ruins_sand_city"),
    })), null, 2));
    await browser.close();
    process.exit(1);
  }
  await page.screenshot({ path: "/data/workspace/研究所端到端-出征前大厅.png" });
  await startBtn.first().click();
  await page.waitForTimeout(1800);
  const diag = await page.evaluate(() => {
    const st = window.state;
    return {
      view: st.view, hallModal: st.hallModal, sortieStarting: st.sortieStarting,
      loadingBattleName: st.loadingBattleName, explore: !!st.explore,
      log: (st.log || []).slice(0, 4),
      dungeonUnlocks: st.dungeonUnlocks,
      flagsRuins: !!st.flags?.ruinsSandCityUnlocked,
      pendingCount: window.DungeonRewards?.pendingCount?.(st) ?? -1,
    };
  });
  console.log("DIAG_AFTER_START", JSON.stringify(diag));
  await page.locator(".dungeon-screen").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(700);

  const entered = await page.evaluate(() => ({
    view: window.state.view,
    missionId: window.state.explore?.missionId,
    difficultyId: window.state.explore?.difficultyId,
    layers: window.state.explore?.layers?.length,
    complete: !!window.state.explore?.complete,
  }));
  check("B", "真实点击后进入废墟沙城·冒险级副本", entered.missionId === "ruins_sand_city"
    && entered.difficultyId === "adventure" && !entered.complete, JSON.stringify(entered));
  check("B", "生成了层级地图", entered.layers > 0, `layers=${entered.layers}`);
  await page.screenshot({ path: "/data/workspace/研究所端到端-副本地图.png" });

  // ---------- C 真实逐层点节点 + 战斗结算 ----------
  const types = [];
  const battles = [];
  let reachedBoss = false;
  for (let step = 1; step <= 24; step++) {
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
    await page.waitForTimeout(950);

    const after = await page.evaluate(() => ({
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
      await page.waitForTimeout(450);
      const claim = page.locator("[data-node-claim], .reward-popup button").first();
      if (await claim.count()) { await claim.click().catch(() => {}); await page.waitForTimeout(380); }
      await page.evaluate(() => {
        if (window.state.view === "battle") {
          window.state.battle = null; window.state.view = "dungeon";
          if (window.render) window.render();
        }
      });
      await page.waitForTimeout(280);
    } else {
      if (type === "rest") {
        const restBtn = page.locator('[data-rest-choice="team"]');
        if (await restBtn.count()) { await restBtn.first().click().catch(() => {}); await page.waitForTimeout(550); }
      } else if (type === "chest") {
        const claim = page.locator('[data-node-claim="chest"]');
        if (await claim.count()) { await claim.first().click().catch(() => {}); await page.waitForTimeout(550); }
      } else if (after.rewardPopup) {
        const claim = page.locator("[data-node-claim], .reward-popup button").first();
        if (await claim.count()) { await claim.click().catch(() => {}); await page.waitForTimeout(450); }
      }
      console.log(`  [${step}] ${type}「${info.label}」`);
    }

    for (let k = 0; k < 3; k++) {
      const rc = page.locator('[data-reward-confirm="1"]');
      if (!(await rc.count())) break;
      await rc.first().click().catch(() => {});
      await page.waitForTimeout(450);
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
    await page.waitForTimeout(280);
    if (type === "boss") { reachedBoss = true; break; }
  }

  const beforeFinish = await page.evaluate(() => ({
    complete: !!window.state.explore?.complete,
    done: (window.state.explore?.layers || []).flat().filter(n => n.done).length,
    earnedGold: window.state.explore?.earned?.gold,
    rewardPopup: !!window.state.explore?.rewardPopup,
    view: window.state.view,
    pendingBeforeFinish: !!window.state.flags?.tenriInstituteUnlockPending,
  }));
  check("C", "走到 BOSS 并真实结算通关", reachedBoss && types.includes("boss") && beforeFinish.complete,
    `types=[${types.join(",")}]`);
  check("C", "所有战斗节点真实结算通过", battles.length > 0 && battles.every(b => b.r === true), `battles=${battles.length}`);
  check("C", "通关结算前研究所剧情仍未被手工触发", !beforeFinish.pendingBeforeFinish);

  // ---------- D 真实点「通关结算」→ 回大厅自动弹剧情 ----------
  const finishBtn = page.locator('[data-dungeon-finish="1"]');
  const finishCount = await finishBtn.count();
  check("D", "通关结算按钮出现", finishCount > 0, `count=${finishCount}`);
  // 正常模式只包装不篡改：记录通关链是否真的调用了研究所触发函数、传进去的 run 是否本次通关。
  // NEGATE 模式则把触发链与补触发一起换成 no-op，用来验证弹窗不是脚本自己造出来的。
  await page.evaluate((negate) => {
    window.__tenriTriggerCalls = [];
    if (negate) {
      window.triggerTenriInstituteUnlockEvent = () => false;
      window.TenriInstituteUnlockEvents.triggerPending = () => false;
      return;
    }
    const orig = window.triggerTenriInstituteUnlockEvent;
    window.triggerTenriInstituteUnlockEvent = function (state, run) {
      window.__tenriTriggerCalls.push({
        missionId: run?.missionId, difficultyId: run?.difficultyId, complete: run?.complete,
      });
      return orig.call(this, state, run);
    };
  }, NEGATE);
  if (finishCount) { await finishBtn.first().click().catch(() => {}); await page.waitForTimeout(1500); }

  const arrived = await page.evaluate(() => {
    const st = window.state;
    return {
      view: st.view, exploreNull: st.explore === null,
      hallModal: st.hallModal,
      title: document.querySelector(".villa-modal h2")?.textContent || "",
      speaker: document.querySelector(".adv-name")?.textContent || "",
      progress: document.querySelector(".adv-progress")?.textContent || "",
      advBox: !!document.querySelector("[data-adv-advance]"),
      pending: !!st.flags?.tenriInstituteUnlockPending,
      unlocked: !!st.flags?.tenriInstituteUnlocked,
      seen: !!st.flags?.tenriInstituteUnlockSeen,
      clearRecord: (st.butlerFeats || []).includes("clear:ruins_sand_city@adventure"),
      gold: st.resources?.gold,
      log: (st.log || []).slice(0, 2).join(" | "),
      triggerCalls: window.__tenriTriggerCalls || [],
    };
  });
  if (NEGATE) {
    const negOk = arrived.view === "hall" && arrived.exploreNull
      && arrived.hallModal !== "tenriInstituteUnlock" && !arrived.title.includes("出发前夜")
      && !arrived.pending && !arrived.unlocked && arrived.triggerCalls.length === 0;
    console.log(`NEGATE ${negOk ? "OK" : "FAILED"} · A/B/C 真实通关照跑，触发链撤掉后：`
      + `hallModal=${arrived.hallModal} pending=${arrived.pending} 弹窗=${arrived.title || "无"}`);
    await browser.close();
    process.exit(negOk ? 0 : 1);
  }
  check("D", "通关链真实调用研究所触发函数（且只调一次）", arrived.triggerCalls.length === 1,
    JSON.stringify(arrived.triggerCalls));
  check("D", "触发参数就是本次废墟沙城·冒险级通关 run",
    arrived.triggerCalls[0]?.missionId === "ruins_sand_city"
    && arrived.triggerCalls[0]?.difficultyId === "adventure"
    && arrived.triggerCalls[0]?.complete === true, JSON.stringify(arrived.triggerCalls[0]));
  check("D", "真实点击结算后回到大厅且清空 explore", arrived.view === "hall" && arrived.exploreNull, `view=${arrived.view}`);
  check("D", "管家手册写入废墟沙城·冒险级通关记录", arrived.clearRecord);
  check("D", "金币已入账", arrived.gold > pre.gold, `${pre.gold} → ${arrived.gold}`);
  check("D", "通关链自动写出 pending（未手工注入）", arrived.pending && !arrived.unlocked && !arrived.seen);
  check("D", "回大厅自动弹出「天日国鹰7研究所 · 出发前夜」",
    arrived.hallModal === "tenriInstituteUnlock" && arrived.title.includes("出发前夜"), arrived.title);
  check("D", "剧情停在首句 1 / 9（橘千樱）", arrived.advBox && arrived.speaker === "橘千樱"
    && arrived.progress.includes("1 / 9"), `${arrived.speaker}｜${arrived.progress}`);
  await page.screenshot({ path: "/data/workspace/研究所端到端-通关后剧情弹出.png" });

  // ---------- E 真实点「跳到结尾」→「各自准备，明天出发」 ----------
  const skipProbe = await page.evaluate(() => {
    const el = document.querySelector("[data-adv-skip]");
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { exists: true, visible: r.width > 0 && r.height > 0, disabled: !!el.disabled,
      pointerEvents: cs.pointerEvents, hit: top === el || (top && el.contains(top)) };
  });
  check("E", "「跳到结尾」按钮可点", skipProbe.exists && skipProbe.visible && !skipProbe.disabled
    && skipProbe.pointerEvents !== "none" && skipProbe.hit, JSON.stringify(skipProbe));
  await page.locator("[data-adv-skip]").click();
  await page.waitForTimeout(280);
  check("E", "跳到结尾后进度 9 / 9",
    (await page.evaluate(() => document.querySelector(".adv-progress")?.textContent || "")).includes("9 / 9")
    || (await page.evaluate(() => window.state.adv?.index)) === 8);

  const doneProbe = await page.evaluate(() => {
    const el = document.querySelector("[data-tenri-institute-unlock-complete]");
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { exists: true, visible: r.width > 0 && r.height > 0, disabled: !!el.disabled,
      w: Math.round(r.width), h: Math.round(r.height), pointerEvents: cs.pointerEvents,
      hit: top === el || (top && el.contains(top)), text: (el.textContent || "").trim() };
  });
  check("E", "完成按钮存在 / 可见 / 未禁用 / 无遮挡", doneProbe.exists && doneProbe.visible
    && !doneProbe.disabled && doneProbe.pointerEvents !== "none" && doneProbe.hit, JSON.stringify(doneProbe));
  check("E", "按钮文案「各自准备，明天出发」", doneProbe.text === "各自准备，明天出发", doneProbe.text);
  await page.screenshot({ path: "/data/workspace/研究所端到端-完成按钮.png" });

  await page.locator("[data-tenri-institute-unlock-complete]").click();
  await page.waitForTimeout(1700);
  const done = await page.evaluate(() => {
    const st = window.state;
    return {
      hallModal: st.hallModal,
      modalVisible: !!document.querySelector(".villa-modal"),
      unlocked: !!st.flags?.tenriInstituteUnlocked,
      seen: !!st.flags?.tenriInstituteUnlockSeen,
      pending: !!st.flags?.tenriInstituteUnlockPending,
      completed: st.unlockEvents?.completed?.tenri_institute === true,
      log: (st.log || []).slice(0, 3).join(" | "),
      view: st.view,
      devLocked: !!(window.GameData?.missions || []).find(m => m.id === "tenri_institute")?.devLocked,
      devHint: (window.GameData?.missions || []).find(m => m.id === "tenri_institute")?.devHint || "",
    };
  });
  check("E", "真实点击完成按钮后弹窗关闭", done.hallModal === null && !done.modalVisible, `hallModal=${done.hallModal}`);
  check("E", "写入 Unlocked / Seen 并清 Pending", done.unlocked && done.seen && !done.pending);
  check("E", "UnlockEventProgress 登记完成", done.completed);
  check("E", "日志提示剧情已解锁", done.log.includes("剧情已解锁"), done.log.slice(0, 90));
  check("E", "停留在大厅", done.view === "hall");
  check("E", "剧情解锁不打开研究所入口（仍提示未开发完成）",
    done.devLocked && done.devHint === "未开发完成", `devHint=${done.devHint}`);

  // ---------- F 幂等：已完成后不再重复弹 ----------
  const idem = await page.evaluate(() => {
    const st = window.state;
    const run = { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true };
    const again = window.triggerTenriInstituteUnlockEvent(st, run);
    const pendingAgain = window.TenriInstituteUnlockEvents.triggerPending(st);
    return { again, pendingAgain, hallModal: st.hallModal };
  });
  check("F", "已解锁后再次通关不重复弹窗", idem.again === false && idem.pendingAgain === false && idem.hallModal === null);

  check("G", "页面无 JS 错误", errors.length === 0, errors.slice(0, 3).join(" | ") || "无");
  await page.screenshot({ path: "/data/workspace/研究所端到端-完成回大厅.png" });

  await browser.close();
  const bad = results.filter(r => !r.ok);
  console.log(`\nTOTAL ${results.length - bad.length}/${results.length} · 节点[${types.join(",")}] · 战斗 ${battles.length} 场`);
  if (bad.length) bad.forEach(r => console.log(`  ❌ [${r.group}] ${r.name} ${r.detail}`));
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch(e => { console.error("LIVE_THREW", e && e.stack ? e.stack : e); process.exit(2); });
