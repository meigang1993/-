// 实机逐副本核查：四个副本各自独立重开一局，在真实页面里走真实结算，
// 把自己从普通级一路推到英雄级，全程核查其余三个副本的界面难度卡是否仍锁定。
//
// 与 test-dungeon-cross-unlock-live.js 的区别：那份只把机械工厂推满，
// 其余副本只验了部分档位；本份对四个副本逐一推满，覆盖「每个副本」。

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
    focusId: `pm-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await window.DungeonRewards.finish(s);
  return { view: s.view };
}, { missionId, difficultyId });

const unlockedList = (cards, missionId) => CHAIN.filter(d => cards[`${missionId}/${d}`] && !cards[`${missionId}/${d}`].locked);
const leakAt = (cards, missionId, difficulty) => {
  const c = cards[`${missionId}/${difficulty}`];
  return c && !c.locked;
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  for (const self of MISSIONS) {
    const others = MISSIONS.filter(m => m !== self);
    console.log(`\n===== ${self} 独立一局，推满五档 =====`);
    const page = await browser.newPage();
    page.on("pageerror", e => errors.push(`${self}: ${e.message}`));
    try {
      await openGame(page);
      await startFreshGame(page);
      await dismissOpeningStory(page);
      await openAll(page);

      // 起点：四个副本都只有普通级
      let cards = await readCards(page);
      const baseLeak = MISSIONS.flatMap(m => CHAIN.slice(1).filter(d => leakAt(cards, m, d)));
      T(`${self} 起点：四副本仅普通级开放`, baseLeak.length === 0, { baseLeak });

      // 逐档推进：每通一档，立刻核查其余三副本有没有被带开
      let clean = true;
      let selfOk = true;
      for (let i = 0; i < CHAIN.length - 1; i += 1) {
        const cur = CHAIN[i];
        const next = CHAIN[i + 1];
        await clearRun(page, self, cur);
        cards = await readCards(page);
        if (!leakAt(cards, self, next)) selfOk = false;
        const leaked = others.flatMap(m => CHAIN.slice(1).filter(d => leakAt(cards, m, d)));
        if (leaked.length) {
          clean = false;
          console.log(`   ⚠️ 通完 ${self}/${cur} 后外溢：${JSON.stringify(leaked)}`);
        }
      }
      cards = await readCards(page);
      const selfUnlocked = unlockedList(cards, self);
      T(`${self} 自身推满 5 档`, selfUnlocked.length === 5 && selfOk, { selfUnlocked });
      T(`${self} 全程其余三副本始终锁定`, clean,
        { 终态: MISSIONS.map(m => `${m}=${JSON.stringify(unlockedList(cards, m))}`) });
      console.log("   终态：" + MISSIONS.map(m => `${m}=${JSON.stringify(unlockedList(cards, m))}`).join(" | "));
    } finally {
      await page.close().catch(() => {});
    }
  }

  T("Z 全程无页面错误", errors.length === 0, { errors: errors.slice(0, 5) });
  await browser.close();
  console.log(`\n结果：${pass}/${total}`);
  if (pass !== total) process.exitCode = 1;
})().catch(e => { console.error("崩溃:", e); process.exitCode = 1; });
