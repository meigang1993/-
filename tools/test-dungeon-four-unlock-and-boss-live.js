// 实战核查两件事：
//   1) 四个副本是否都注册进 GameData.missions（此前我误判为只有 3 个，这里用事实纠正）
//   2) 难度解锁是否按副本独立（四副本互不影响）
//   3) 每个副本是否都有 2 个 BOSS，且 BOSS 随机（换种子两个 BOSS 都会出现）
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

// 在页面内渲染准备启程页，返回每个副本每个难度的锁定状态
const readCards = page => page.evaluate(() => {
  const html = window.VillaTeamUI.team(window.state);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {};
  doc.querySelectorAll("button[data-start][data-difficulty]").forEach(btn => {
    const card = btn.closest(".difficulty-card");
    const key = `${btn.dataset.start}/${btn.dataset.difficulty}`;
    out[key] = {
      locked: !!card && card.classList.contains("locked"),
      text: (btn.textContent || "").trim(),
    };
  });
  return out;
});

// 走真实结算路径通关某副本某难度
const clearRun = (page, missionId, difficultyId) => page.evaluate(async ({ missionId, difficultyId }) => {
  const s = window.state;
  s.flags.underwaterTrainUnlocked = true;
  s.flags.orcDungeonUnlocked = true;
  s.flags.ruinsSandCityUnlocked = true;
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
  return { explore: s.explore, view: s.view };
}, { missionId, difficultyId });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await openGame(page);
    await startFreshGame(page);

    // A. 四个副本是否都注册
    const registered = await page.evaluate(() => (window.GameData.missions || [])
      .filter(m => m?.kind === "dungeon").map(m => m.id));
    T("A1 四个副本均已注册",
      MISSIONS.every(id => registered.includes(id)), registered);

    // B. 新档：每个副本只有普通级解锁
    // 注意：后三个副本需先置开放 flag，否则显示"副本锁定"（那是副本未开放，不是难度未解锁）。
    await page.evaluate(() => {
      window.state.flags.underwaterTrainUnlocked = true;
      window.state.flags.orcDungeonUnlocked = true;
      window.state.flags.ruinsSandCityUnlocked = true;
    });
    const fresh = await readCards(page);
    MISSIONS.forEach(id => {
      T(`B-${id} 新档只解锁普通级`,
        fresh[`${id}/normal`] && !fresh[`${id}/normal`].locked
        && fresh[`${id}/adventure`] && fresh[`${id}/adventure`].locked,
        { normal: fresh[`${id}/normal`], adventure: fresh[`${id}/adventure`] });
    });

    // C. 只通关机械工厂·普通级 → 其余三个副本的冒险级必须仍锁定
    await clearRun(page, "machine_factory", "normal");
    const after = await readCards(page);
    T("C1 机械工厂·冒险级解锁",
      after["machine_factory/adventure"] && !after["machine_factory/adventure"].locked,
      after["machine_factory/adventure"]);
    ["underwater_train", "orc_dungeon", "ruins_sand_city"].forEach(id => {
      T(`C-${id} 冒险级仍锁定（独立解锁核心）`,
        after[`${id}/adventure`] && after[`${id}/adventure`].locked,
        after[`${id}/adventure`]);
    });

    // D. 再通关废墟沙城·普通级 → 只影响废墟沙城
    await clearRun(page, "ruins_sand_city", "normal");
    const back = await readCards(page);
    T("D1 废墟沙城·冒险级解锁",
      back["ruins_sand_city/adventure"] && !back["ruins_sand_city/adventure"].locked,
      back["ruins_sand_city/adventure"]);
    ["machine_factory", "underwater_train", "orc_dungeon"].forEach(id => {
      const expectLocked = id !== "machine_factory";
      const card = back[`${id}/adventure`];
      T(`D-${id} 冒险级${expectLocked ? "仍锁定" : "保持解锁"}`,
        !!card && card.locked === expectLocked, card);
    });

    // E. BOSS 池：每个副本应恰有 2 个 BOSS
    const bossPools = await page.evaluate(missions => {
      const out = {};
      missions.forEach(id => {
        out[id] = (window.GameData.enemies[id] || [])
          .filter(e => e.type === "boss").map(e => e.id);
      });
      return out;
    }, MISSIONS);
    MISSIONS.forEach(id => {
      T(`E-${id} 恰有 2 个 BOSS`,
        bossPools[id] && bossPools[id].length === 2, bossPools[id]);
    });

    // F. BOSS 随机：换 40 个种子生成 boss 组，统计出现的 BOSS id
    const dist = await page.evaluate(({ missions, seeds }) => {
      const out = {};
      missions.forEach(id => {
        const seen = {};
        seeds.forEach(seed => {
          const fake = { random: { version: 1, seed, cursor: 0 } };
          const group = window.DungeonEnemyGroups.enemiesFor(
            { missionId: id, difficultyId: "normal" }, "boss", fake);
          (group || []).forEach(e => {
            if (e.type === "boss") seen[e.id] = (seen[e.id] || 0) + 1;
          });
        });
        out[id] = seen;
      });
      return out;
    }, { missions: MISSIONS, seeds: Array.from({ length: 40 }, (_, i) => i * 7919 + 13) });

    MISSIONS.forEach(id => {
      const seen = dist[id] || {};
      const keys = Object.keys(seen);
      const bothAppear = (bossPools[id] || []).every(b => keys.includes(b));
      const allPositive = keys.every(k => seen[k] > 0);
      T(`F-${id} 两个 BOSS 都会随机出现（各出现次数均 >0）`,
        bothAppear && allPositive, { seen, pool: bossPools[id] });
    });

    T("G1 页面无 JS 错误", errors.length === 0, errors);
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
