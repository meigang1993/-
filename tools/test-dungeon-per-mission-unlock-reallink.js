// 逐个副本验证：走玩家真实结算链路（DungeonRunRewards.finish），
// 确认通关某副本某难度后，只有该副本推进难度链，其余三个副本不受影响。
//
// 与 test-dungeon-cross-unlock-strict.js 的区别：那份直接调 DungeonUnlocks.unlockNext，
// 本份走 finish() 真实入口（bank → unlockNext → 角色解锁事件），覆盖结算层的接线。

const fs = require("fs");
const vm = require("vm");

global.window = global;
global.console = console;
function load(file) {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file });
}
[
  "game-random.js",
  "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js", "data-ruins-content.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "dungeon-unlocks.js",
].forEach(load);
load("butler-manual-progress.js");
[
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "save-epoch.js", "store-state-factory.js",
  "store-save-schema.js", "local-core-utils.js",
  "local-core-character.js", "local-core-commerce.js",
  "local-core-bounty.js", "local-core-dungeon.js", "local-core-events.js", "local-core.js",
  "server-core-apply.js", "server-core.js", "dungeon-enemies.js",
  "dungeon-map.js", "dungeon-events.js", "dungeon-reward-core.js", "dungeon-reward-payload.js",
  "settlement-recovery.js", "dungeon-settlement-actions.js",
  "orc-unlock-events.js", "new-character-unlock-events.js", "dungeon-node-rewards.js",
  "dungeon-run-rewards.js", "dungeon-rewards.js",
].forEach(load);

const U = window.DungeonUnlocks;
const P = window.ButlerManualProgress;
const R = window.DungeonRunRewards;
const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const CHAIN = ["normal", "adventure", "warrior", "king", "hell"];

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`✅ ${msg}`); passed += 1; }
  else { console.log(`❌ ${msg}`); failed += 1; }
}

function fresh() {
  const s = window.GameStoreStateFactory.freshState();
  s.dungeonUnlocks = {};
  s.unlockedDifficulties = ["normal"];
  s.butlerFeats = [];
  return s;
}
// 构造一个「已通关待结算」的 run，字段对齐 dungeon-matrix-settlement.js 的夹具形态，
// 否则 rewardText / bankRun 会读不到 earned 而崩。
function makeRun(state, missionId, difficultyId, focusId) {
  const party = (state.party || []).slice(0, 1);
  return {
    focusId, missionId, difficultyId,
    party, activeParty: party, current: "n1-0", pending: null,
    layers: [[{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: [] }]],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
    rewardPopup: false, complete: true, banked: false,
  };
}
function lists(s) {
  return MISSIONS.map(id => `${id}=${JSON.stringify(U.list(s, id))}`).join(" | ");
}
// 只统计「不该解锁却解锁了」的副本，用于精确定位外溢。
function leaks(s, self, allowed) {
  return MISSIONS.filter(id => id !== self
    && U.list(s, id).some(d => !allowed.includes(d)));
}

async function main() {
  console.log("--- A. 模块可用性 ---");
  assert(!!R?.finish, "真实结算入口 DungeonRunRewards.finish 可用");
  assert(MISSIONS.every(id => U.missions().some(m => m.id === id)), `四个副本均已注册 -> ${JSON.stringify(MISSIONS)}`);

  // 每个副本单独走一遍：从普通级一路通到英雄级。
  for (const self of MISSIONS) {
    console.log(`\n--- B. ${self} 走真实 finish 链路推满五档 ---`);
    const s = fresh();
    // 让每个副本都处于「已开放」状态，排除开放 flag 干扰，只看难度链。
    s.flags = s.flags || {};
    ["underwaterTrainUnlocked", "orcDungeonUnlocked", "ruinsSandCityUnlocked"].forEach(f => { s.flags[f] = true; });

    let allOthersClean = true;
    let selfOk = true;
    for (let i = 0; i < CHAIN.length - 1; i += 1) {
      const cur = CHAIN[i];
      const next = CHAIN[i + 1];
      // 通关记录：真实链路里 finish 前由 recordDungeonClear 写入。
      P.recordClear(s, self, cur);
      s.explore = makeRun(s, self, cur, `t-${self}-${cur}`);
      await R.finish(s);
      const selfList = U.list(s, self);
      if (!selfList.includes(next)) selfOk = false;
      // 其余三副本：只允许 normal。
      const lk = leaks(s, self, ["normal"]);
      if (lk.length) {
        allOthersClean = false;
        console.log(`   ⚠️ 通完 ${self}/${cur} 后外溢：${JSON.stringify(lk)} -> ${lists(s)}`);
      }
    }
    assert(selfOk, `${self} 走真实链路后自身推满 5 档 -> ${JSON.stringify(U.list(s, self))}`);
    assert(allOthersClean, `${self} 全程通关，其余三副本始终只有普通级 -> ${lists(s)}`);
    // 反向确认：确实推满了，不是因为链路压根没生效而"看起来没外溢"。
    assert(U.list(s, self).length === 5, `${self} 难度链长度=5（证明 finish 确实生效） -> ${U.list(s, self).length}`);
  }

  console.log("\n--- C. 真实链路下的交叉推进 ---");
  {
    const s = fresh();
    s.flags = s.flags || {};
    ["underwaterTrainUnlocked", "orcDungeonUnlocked", "ruinsSandCityUnlocked"].forEach(f => { s.flags[f] = true; });
    // 机械工厂通 1 档、水下列车通 2 档、兽人通 3 档，废墟不动。
    const plan = [["machine_factory", 1], ["underwater_train", 2], ["orc_dungeon", 3]];
    for (const [id, times] of plan) {
      for (let i = 0; i < times; i += 1) {
        const cur = U.list(s, id)[U.list(s, id).length - 1];
        P.recordClear(s, id, cur);
        s.explore = makeRun(s, id, cur, `x-${id}-${i}`);
        await R.finish(s);
      }
    }
    assert(JSON.stringify(U.list(s, "machine_factory")) === JSON.stringify(["normal", "adventure"]), `机械工厂 1 档 -> ${JSON.stringify(U.list(s, "machine_factory"))}`);
    assert(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal", "adventure", "warrior"]), `水下列车 2 档 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);
    assert(JSON.stringify(U.list(s, "orc_dungeon")) === JSON.stringify(["normal", "adventure", "warrior", "king"]), `兽人 3 档 -> ${JSON.stringify(U.list(s, "orc_dungeon"))}`);
    assert(JSON.stringify(U.list(s, "ruins_sand_city")) === JSON.stringify(["normal"]), `废墟未动仍普通级 -> ${JSON.stringify(U.list(s, "ruins_sand_city"))}`);
  }

  console.log("\n--- D. 派生字段不得反向污染判据 ---");
  {
    const s = fresh();
    s.flags = s.flags || {};
    ["underwaterTrainUnlocked", "orcDungeonUnlocked", "ruinsSandCityUnlocked"].forEach(f => { s.flags[f] = true; });
    P.recordClear(s, "machine_factory", "normal");
    s.explore = makeRun(s, "machine_factory", "normal", "d1");
    await R.finish(s);
    const merged = s.unlockedDifficulties;
    assert(merged.includes("adventure"), `派生字段含 adventure（并集语义）-> ${JSON.stringify(merged)}`);
    const lk = leaks(s, "machine_factory", ["normal"]);
    assert(lk.length === 0, `虽有并集，其余副本 adventure 仍锁定 -> 泄漏 ${JSON.stringify(lk)}`);
  }

  console.log("\n--- E. 存档往返后不外溢 ---");
  {
    const s = fresh();
    s.flags = s.flags || {};
    ["underwaterTrainUnlocked", "orcDungeonUnlocked", "ruinsSandCityUnlocked"].forEach(f => { s.flags[f] = true; });
    P.recordClear(s, "orc_dungeon", "normal");
    s.explore = makeRun(s, "orc_dungeon", "normal", "e1");
    await R.finish(s);
    const json = JSON.stringify(s.dungeonUnlocks);
    const back = JSON.parse(json);
    const s2 = fresh();
    s2.dungeonUnlocks = back;
    s2.butlerFeats = s.butlerFeats;
    assert(JSON.stringify(U.list(s2, "orc_dungeon")) === JSON.stringify(["normal", "adventure"]), `往返后兽人保持 2 档 -> ${JSON.stringify(U.list(s2, "orc_dungeon"))}`);
    assert(leaks(s2, "orc_dungeon", ["normal"]).length === 0, `往返后其余三副本仍只普通级 -> ${lists(s2)}`);
  }

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  if (failed) process.exitCode = 1;
}

main().catch(e => { console.error("崩溃:", e); process.exitCode = 1; });
