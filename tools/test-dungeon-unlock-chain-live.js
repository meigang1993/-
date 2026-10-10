// 实战核查副本解锁全链路：
//   A) 四个副本难度是否各自独立递进（每通一档只解锁本副本的下一档）
//   B) 兽人地下城：水下列车·冒险级通关 → 触发 → 完成 → 解锁 → 可进入
//   C) 废墟沙城：兽人地下城·勇士级通关 → 触发 → 完成 → 解锁
//      重点回答「2 个角色先解锁还是副本先解锁」：查解锁事件前后的角色锁定态
//   D) 兽人地下城 / 废墟沙城 能否正常进入副本（真实 startDungeon + 建图）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const CHAIN = ["normal", "adventure", "warrior", "king", "hell"];

// 读准备启程页：每个副本每个难度的锁定态
const readCards = page => page.evaluate(() => {
  const html = window.VillaTeamUI.team(window.state);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {};
  doc.querySelectorAll("button[data-start][data-difficulty]").forEach(btn => {
    const card = btn.closest(".difficulty-card");
    out[`${btn.dataset.start}/${btn.dataset.difficulty}`] = {
      locked: !!card && card.classList.contains("locked"),
      text: (btn.textContent || "").trim(),
    };
  });
  return out;
});

// 走真实结算路径通关某副本某难度
const clearRun = (page, missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
  const s = window.state;
  s.party = ["lokar"];
  s.view = "dungeon";
  s.explore = {
    focusId: `ui-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await window.DungeonRewards.finish(s);
  return { view: s.view };
}, { missionId, difficultyId });

// 启程页只显示已开放的副本，先把四个副本的开放 flag 全部置上，
// 这样卡片上的 locked 才表示「难度未解锁」，而不是「副本未开放」。
const openAll = page => page.evaluate(() => {
  window.state.flags.underwaterTrainUnlocked = true;
  window.state.flags.orcDungeonUnlocked = true;
  window.state.flags.ruinsSandCityUnlocked = true;
});

(async () => {
  const browser = await chromium.launch();
  let page = await browser.newPage();
  const errors = [];
  const watch = p => p.on("pageerror", e => errors.push(String(e.message || e)));
  watch(page);
  try {
    // ============ 阶段一：难度递进按副本独立 ============
    // 启程页只渲染已开放副本，先把四个副本的开放 flag 全置上，
    // 这样卡片上的 locked 才表示「难度未解锁」，而不是「副本未开放」。
    await openGame(page);
    await startFreshGame(page);
    await openAll(page);

    await clearRun(page, "machine_factory", "normal");
    let cards = await readCards(page);
    T("A1 机械工厂·冒险级解锁",
      cards["machine_factory/adventure"] && !cards["machine_factory/adventure"].locked,
      cards["machine_factory/adventure"]);
    ["underwater_train", "orc_dungeon", "ruins_sand_city"].forEach(id => {
      T(`A2-${id} 冒险级仍锁定`, cards[`${id}/adventure`]?.locked === true, cards[`${id}/adventure`]);
    });

    await clearRun(page, "machine_factory", "adventure");
    cards = await readCards(page);
    T("A3 机械工厂·勇士级解锁",
      cards["machine_factory/warrior"] && !cards["machine_factory/warrior"].locked,
      cards["machine_factory/warrior"]);
    ["underwater_train", "orc_dungeon", "ruins_sand_city"].forEach(id => {
      T(`A4-${id} 勇士级仍锁定`, cards[`${id}/warrior`]?.locked === true, cards[`${id}/warrior`]);
    });

    await clearRun(page, "underwater_train", "normal");
    cards = await readCards(page);
    T("A5 水下列车·冒险级解锁",
      cards["underwater_train/adventure"] && !cards["underwater_train/adventure"].locked,
      cards["underwater_train/adventure"]);
    T("A6 机械工厂·勇士级保持解锁（不被拖回）",
      cards["machine_factory/warrior"]?.locked === false, cards["machine_factory/warrior"]);
    ["orc_dungeon", "ruins_sand_city"].forEach(id => {
      T(`A7-${id} 冒险级仍锁定`, cards[`${id}/adventure`]?.locked === true, cards[`${id}/adventure`]);
    });

    // ============ 阶段二：真实解锁全链路（换新页面，不预置任何解锁 flag）============
    // 上一阶段为了读卡片把 orc/ruins 的开放 flag 置上了，会挡住触发器，故重开。
    await page.close();
    page = await browser.newPage();
    watch(page);
    await openGame(page);
    await startFreshGame(page);
    // 水下列车的开放 flag 由娜娜莉剧情解锁给出，这里直接置上以进入该副本；
    // 兽人地下城 / 废墟沙城的 flag 一律不碰，必须由通关链路自己解锁。
    await page.evaluate(() => { window.state.flags.underwaterTrainUnlocked = true; });

    const flags = () => page.evaluate(() => {
      const s = window.state;
      const pick = id => {
        const c = s.chars.find(x => x.id === id);
        return c ? { exists: true, locked: !!c.locked } : { exists: false };
      };
      return {
        orcUnlocked: !!s.flags?.orcDungeonUnlocked,
        orcPending: !!s.flags?.orcDungeonUnlockPending,
        ruinsUnlocked: !!s.flags?.ruinsSandCityUnlocked,
        ruinsPending: !!s.flags?.ruinsSandCityUnlockPending,
        artina: pick("artina"), maria: pick("maria"),
        orcList: window.DungeonUnlocks.list(s, "orc_dungeon"),
        ruinsList: window.DungeonUnlocks.list(s, "ruins_sand_city"),
      };
    });

    // --- 兽人地下城：需水下列车·冒险级通关 ---
    await clearRun(page, "underwater_train", "normal");
    let f = await flags();
    T("B1 通关水下列车·普通级后，兽人地下城仍未开放", !f.orcUnlocked && !f.orcPending, f);

    await clearRun(page, "underwater_train", "adventure");
    f = await flags();
    T("B2 通关水下列车·冒险级 → 兽人地下城解锁待触发",
      f.orcPending && !f.orcUnlocked, f);

    const orcDone = await page.evaluate(async () => {
      const s = window.state;
      await window.completeOrcDungeonUnlockEvent();
      return { unlocked: !!s.flags?.orcDungeonUnlocked, pending: !!s.flags?.orcDungeonUnlockPending };
    });
    T("B3 完成事件 → 兽人地下城解锁", orcDone.unlocked && !orcDone.pending, orcDone);
    f = await flags();
    T("B4 兽人地下城初始只有普通级（难度不外溢）",
      f.orcList.length === 1 && f.orcList[0] === "normal", f.orcList);

    // --- 废墟沙城：需兽人地下城·勇士级通关（先递进到勇士级）---
    await clearRun(page, "orc_dungeon", "normal");
    await clearRun(page, "orc_dungeon", "adventure");
    f = await flags();
    T("C1 兽人地下城递进到勇士级解锁", f.orcList.includes("warrior"), f.orcList);
    T("C2 此时废墟沙城仍未开放", !f.ruinsUnlocked && !f.ruinsPending, f);

    const before = await flags();
    T("C3 完成前：亚缇娜与玛利亚均锁定",
      before.artina.exists && before.artina.locked && before.maria.exists && before.maria.locked,
      { artina: before.artina, maria: before.maria });

    await clearRun(page, "orc_dungeon", "warrior");
    const mid = await flags();
    T("C4 通关兽人地下城·勇士级 → 废墟沙城解锁待触发",
      mid.ruinsPending && !mid.ruinsUnlocked, mid);
    T("C5 待触发阶段：亚缇娜与玛利亚仍锁定（未先于副本解锁）",
      mid.artina.locked === true && mid.maria.locked === true,
      { artina: mid.artina, maria: mid.maria });

    const done = await page.evaluate(async () => {
      const s = window.state;
      await window.completeRuinsSandCityUnlockEvent();
      return { ok: true };
    });
    f = await flags();
    T("C6 完成事件 → 废墟沙城解锁", f.ruinsUnlocked && !f.ruinsPending, f);
    T("C7 完成事件 → 亚缇娜与玛利亚同时解锁（与副本同一事件，无先后）",
      !f.artina.locked && !f.maria.locked, { artina: f.artina, maria: f.maria });
    T("C8 废墟沙城初始只有普通级",
      f.ruinsList.length === 1 && f.ruinsList[0] === "normal", f.ruinsList);

    // ============ 阶段三：能否正常进入副本 ============
    const enter = (missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
      const s = window.state;
      s.view = "hall"; s.explore = null; s.party = ["lokar"];
      const ok = await window.ServerCore.call("startDungeon",
        { missionId, difficultyId, bounties: [], runId: `t-${missionId}-${difficultyId}` }, s);
      if (!ok.ok) return { ok: false, message: ok.message };
      window.DungeonSystem.start(s, missionId, difficultyId, `t-${missionId}-${difficultyId}`);
      const run = s.explore;
      return {
        ok: true, view: s.view,
        layers: run?.layers?.length || 0,
        nodes: (run?.layers || []).flat().length,
        boss: (run?.layers || []).flat().filter(n => n.type === "boss").length,
        missionId: run?.missionId, difficultyId: run?.difficultyId,
      };
    }, { missionId, difficultyId });

    const eOrc = await enter("orc_dungeon", "normal");
    T("D1 兽人地下城·普通级可正常进入并建图",
      eOrc.ok && eOrc.view === "dungeon" && eOrc.layers > 0 && eOrc.boss > 0, eOrc);

    const eRuins = await enter("ruins_sand_city", "normal");
    T("D2 废墟沙城·普通级可正常进入并建图",
      eRuins.ok && eRuins.view === "dungeon" && eRuins.layers > 0 && eRuins.boss > 0, eRuins);

    const eBlocked = await enter("ruins_sand_city", "warrior");
    T("D3 对照：废墟沙城·勇士级未解锁，进入被拒", eBlocked.ok === false, eBlocked);

    T("E1 页面无 JS 错误", errors.length === 0, errors);
  } catch (err) {
    console.log(`❌ 执行异常: ${err.message}`);
    total++;
  } finally {
    await browser.close();
  }
  console.log(`\n通过 ${pass}/${total}`);
  console.log(`总计 ${pass === total ? "全部通过" : `失败 ${total - pass}`}`);
  process.exit(pass === total ? 0 : 1);
})();
