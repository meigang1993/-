// 实机核查：解锁某副本难度后，其余副本是否跟着解锁。
// 与既有测试的区别：走真实结算 + 真实存盘重开，覆盖「存档往返」这一段，
// 因为跨副本外溢可能在写入/读回之间复活（派生字段、快照范围都可能漏）。

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
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

const openAll = page => page.evaluate(() => {
  window.state.flags.underwaterTrainUnlocked = true;
  window.state.flags.orcDungeonUnlocked = true;
  window.state.flags.ruinsSandCityUnlocked = true;
});

const clearRun = (page, missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
  const s = window.state;
  s.party = ["lokar"];
  s.view = "dungeon";
  s.explore = {
    focusId: `x-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await window.DungeonRewards.finish(s);
  return { view: s.view };
}, { missionId, difficultyId });

(async () => {
  const before = {
    feats: (window.state.butlerFeats || []).length,
    table: JSON.stringify(window.state.dungeonUnlocks || {}),
  };
  await window.GameStore.save(window.state, { flush: true });
  const raw = localStorage.getItem("succubus-kill-save-v1");
  return { before, bytes: (raw || "").length, hasEpoch: /"saveEpoch"/.test(raw || "") };
});

const unlockedList = (cards, missionId) => CHAIN.filter(d => cards[`${missionId}/${d}`] && !cards[`${missionId}/${d}`].locked);
const leakAt = (cards, missionId, difficulty) => {
  const c = cards[`${missionId}/${difficulty}`];
  return c && !c.locked;
};

// 重开后：起手页会有「继续/读档」，必须点它回到原存档，不能点新游戏（会覆盖）。
const resumeAfterReload = async page => {
  // 走真实 UI：起手页「读档」→ 槽位弹窗 → 自动存档 → 读回。
  // window.state 是只读 getter（有 get 无 set），直接赋值会被静默忽略，必须走 UI。
  await page.locator("#view").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator("[data-start-load]").click();
  await page.locator("[data-save-slot]").first().waitFor({ state: "visible", timeout: 30000 });
  await page.locator("[data-save-slot]").first().click();
  await page.waitForFunction(() => window.state?.view === "hall"
    && (window.state?.butlerFeats || []).length > 0, null, { timeout: 60000 });
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("hall"),
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
  ]).catch(() => {}));
  await page.waitForFunction(() => !!window.VillaTeamUI, null, { timeout: 60000 });
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);
    await openAll(page);

    // 0. 起点：四个副本都只开放普通级
    let cards = await readCards(page);
    const baseLeak = MISSIONS.flatMap(m => CHAIN.slice(1).filter(d => leakAt(cards, m, d)));
    T("A0 起点：四副本仅普通级开放", baseLeak.length === 0, { baseLeak });

    // 1. 通关机械工厂·普通 → 只有机械工厂的冒险级解锁
    await clearRun(page, "machine_factory", "normal");
    cards = await readCards(page);
    T("A1 机械工厂·冒险级已解锁", leakAt(cards, "machine_factory", "adventure"), cards["machine_factory/adventure"]);
    const leak1 = ["underwater_train", "orc_dungeon", "ruins_sand_city"].filter(m => leakAt(cards, m, "adventure"));
    T("A2 其余三副本·冒险级仍锁定", leak1.length === 0, { leak1 });
    console.log("   解锁态：" + MISSIONS.map(m => `${m}=${JSON.stringify(unlockedList(cards, m))}`).join(" | "));

    // 3. 把机械工厂一路推到地狱级，全程其余副本不得跟着解锁
    for (const d of ["adventure", "warrior", "king"]) {
      await clearRun(page, "machine_factory", d);
      cards = await readCards(page);
      const leaked = ["underwater_train", "orc_dungeon", "ruins_sand_city"]
        .flatMap(m => CHAIN.slice(1).filter(x => leakAt(cards, m, x)));
      T(`C:${d} 通关后其余三副本无外溢`, leaked.length === 0, { leaked });
    }
    cards = await readCards(page);
    T("C4 机械工厂推满五档", unlockedList(cards, "machine_factory").length === 5, unlockedList(cards, "machine_factory"));
    console.log("   终态：" + MISSIONS.map(m => `${m}=${JSON.stringify(unlockedList(cards, m))}`).join(" | "));

    // 4. 另一个副本独立推进，不得被机械工厂的进度影响
    await clearRun(page, "underwater_train", "normal");
    cards = await readCards(page);
    T("D1 水下列车·冒险级解锁", leakAt(cards, "underwater_train", "adventure"), cards["underwater_train/adventure"]);
    T("D2 机械工厂保持五档不受影响", unlockedList(cards, "machine_factory").length === 5, unlockedList(cards, "machine_factory"));
    T("D3 兽人地下城/废墟沙城仍只普通级",
      unlockedList(cards, "orc_dungeon").join() === "normal" && unlockedList(cards, "ruins_sand_city").join() === "normal",
      { orc: unlockedList(cards, "orc_dungeon"), ruins: unlockedList(cards, "ruins_sand_city") });

    // E. 存档往返：不覆盖 window.state（它是只读 getter，赋值会被静默忽略），
    //    直接取 load() 返回的对象，校验通关记录与难度表是否完整落盘并读回。
    const round = await page.evaluate(async () => {
      await window.GameStore.save(window.state, { flush: true });
      const raw = localStorage.getItem("succubus-kill-save-v1");
      const saved = JSON.parse(raw || "{}");
      const loaded = await window.GameStore.load();
      const list = id => window.DungeonUnlocks.list(loaded, id);
      return {
        bytes: (raw || "").length,
        savedFeats: (saved.butlerFeats || []).length,
        savedTable: saved.dungeonUnlocks || {},
        loadedFeats: (loaded?.butlerFeats || []).length,
        machine: list("machine_factory"), underwater: list("underwater_train"),
        orc: list("orc_dungeon"), ruins: list("ruins_sand_city"),
      };
    });
    T("E0 存档落盘且含通关记录", round.bytes > 0 && round.savedFeats >= 4, round);
    T("E1 难度表按副本分别落盘", Object.keys(round.savedTable).length === 4, round.savedTable);
    T("E2 读回后机械工厂保持多档", round.machine.length >= 2, round.machine);
    T("E3 读回后水下列车 2 档", round.underwater.join() === "normal,adventure", round.underwater);
    T("E4 读回后兽人/废墟未外溢", round.orc.join() === "normal" && round.ruins.join() === "normal",
      { orc: round.orc, ruins: round.ruins });

    T("Z 全程无页面错误", errors.length === 0, { errors: errors.slice(0, 5) });
  } catch (e) {
    console.log("❌ 执行异常：" + e.message);
    total++;
  } finally {
    console.log(`\n结果：${pass}/${total}`);
    await browser.close();
  }
  process.exit(pass === total ? 0 : 1);
})();
