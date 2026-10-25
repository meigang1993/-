// 安倍卡露娜【幸运海螺】严格回归：验证「每一名参战角色各自」获得的经验翻倍，
// 而非仅总额翻倍；卡露娜不在队伍 / 阵亡时全队均不翻倍。
//
// 手法：hook CharacterProgression.grant 记录每次 (id, amount)，
// 再走真实结算入口 LocalCoreDungeonOps.settleDungeon。
// 既有测试只验了结算界面显示文本与模块数值，从未验证每个角色实得的数值。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await openGame(page);
  const out = await page.evaluate(() => {
    const G = window.GameData;
    const mission = (G.missions || []).find(m => m.kind === "dungeon");
    const missionId = mission ? mission.id : "machine_factory";
    const nodeId = "probe-node-1";

    const mkCore = () => ({
      chars: ["lokar", "abe_karuna", "besta_doll"].map(id => ({
        id, level: 1, exp: 0, locked: false,
      })),
      resources: { gold: 0, essence: 0 },
      defeatedElites: [], unlockedShopCards: [],
      pendingRun: { gold: 0, essence: 0, cards: [], relics: [] },
      localRunState: null, localRunStatePresent: false,
      flags: {}, deck: [], relics: [],
    });
    const mkRun = party => ({
      missionId, difficultyId: "normal", focusId: "probe-focus",
      pending: nodeId,
      layers: [[{ id: nodeId, type: "normal", enemies: [{ id: "__probe_enemy__" }], done: false }]],
      activeParty: party, party,
    });

    const calls = [];
    const real = window.CharacterProgression.grant;
    window.CharacterProgression.grant = (ch, amount, tpl) => {
      calls.push({ id: ch && ch.id, amount: Math.floor(Number(amount) || 0) });
      return real(ch, amount, tpl);
    };

    const runSettle = (party, aliveIds) => {
      calls.length = 0;
      const core = mkCore(), run = mkRun(party);
      let outcome = null, err = null;
      try {
        outcome = window.LocalCoreDungeonOps.settleDungeon(core, {
          run, nodeId, kind: "normal",
          defeatedEnemyIds: ["__probe_enemy__"],
          participantIds: party,
          aliveParticipantIds: aliveIds,
        });
      } catch (e) { err = String(e && e.message || e); }
      return { outcome, err, calls: calls.slice(), expLevels: core.chars.map(c => `${c.id}:L${c.level}e${c.exp}`) };
    };

    const base = window.CharacterProgression.rewardFor("normal",
      G.difficulties.normal, missionId);

    const withKaruna = runSettle(["lokar", "abe_karuna", "besta_doll"], ["lokar", "abe_karuna", "besta_doll"]);
    const without = runSettle(["lokar", "besta_doll"], ["lokar", "besta_doll"]);
    const karunaDead = runSettle(["lokar", "abe_karuna", "besta_doll"], ["lokar", "besta_doll"]);

    window.CharacterProgression.grant = real;
    return { base, missionId, withKaruna, without, karunaDead };
  });
  const T = (name, cond, extra) => {
    total++;
    if (cond) pass++;
    console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  };
  const amt = (r, id) => (r?.calls || []).find(c => c.id === id)?.amount;

  T("基准经验 30", out.base === 30, out.base);
  T("卡露娜在队且存活：lokar 得 60",
    amt(out.withKaruna, "lokar") === out.base * 2, out.withKaruna.calls);
  T("卡露娜在队且存活：卡露娜本人得 60",
    amt(out.withKaruna, "abe_karuna") === out.base * 2, out.withKaruna.calls);
  T("卡露娜在队且存活：贝丝妲魔偶得 60",
    amt(out.withKaruna, "besta_doll") === out.base * 2, out.withKaruna.calls);
  T("三名参战角色全部翻倍（无一漏掉）",
    out.withKaruna.calls.length === 3
    && out.withKaruna.calls.every(c => c.amount === out.base * 2), out.withKaruna.calls);

  T("卡露娜不在队：lokar 得 30",
    amt(out.without, "lokar") === out.base, out.without.calls);
  T("卡露娜不在队：贝丝妲魔偶得 30",
    amt(out.without, "besta_doll") === out.base, out.without.calls);
  T("卡露娜不在队：无人获得双倍",
    out.without.calls.every(c => c.amount === out.base), out.without.calls);
  T("卡露娜不在队：她本人不获得经验",
    amt(out.without, "abe_karuna") === undefined, out.without.calls);

  T("卡露娜参战但阵亡：全队均不翻倍",
    out.karunaDead.calls.length === 3
    && out.karunaDead.calls.every(c => c.amount === out.base), out.karunaDead.calls);

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
