// 四个副本难度解锁正向链路 + 后两个副本开放与进入校验。
//
// 与 test-dungeon-legacy-unlock-relock.js 互补：那份验证"外溢进度被回收"（反向），
// 这份验证"正常进度能一路推上去、且能真正进入副本"（正向）。
// 重点是每次通关后都要跑一遍 migrate —— 若 migrate 误锁，难度会被打回普通级，
// 玩家永远推不到英雄级，这类 BUG 只测一次通关是抓不到的。
//
// 加载顺序：ruins_sand_city 的 mission 由 data-future-dungeons.js 合并，
// 所以 data-ruins-sand-city.js 必须先加载，否则第 4 个副本缺席而测试仍"全绿"。

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
  "data-ruins-sand-city-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "dungeon-unlocks.js", "butler-man-progress.js",
].filter(f => f !== "butler-man-progress.js").forEach(load);
load("butler-manual-progress.js");
[
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "store-state-factory.js",
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
// 模拟一次通关：写通关记录 -> 解锁下一档 -> 重新加载（migrate 不得回退）。
function clearRun(s, missionId, difficultyId) {
  P.recordClear(s, missionId, difficultyId);
  U.unlockNext(s, missionId, difficultyId);
  U.migrate(s);
}

// A. 四个副本都必须注册。
const registered = (window.GameData.missions || []).filter(m => m?.kind === "dungeon").map(m => m.id);
assert(MISSIONS.every(id => registered.includes(id)), `A1 四个副本均已注册 -> ${JSON.stringify(registered)}`);

// B. 每个副本各自推满五档，且互不干扰。
MISSIONS.forEach(id => {
  const s = fresh();
  let ok = true;
  const trail = [];
  CHAIN.forEach((diff, i) => {
    const list = U.list(s, id);
    if (!list.includes(diff)) { ok = false; trail.push(`${diff}:未解锁`); return; }
    if (i < CHAIN.length - 1) clearRun(s, id, diff);
    trail.push(`${diff}✓`);
  });
  assert(ok, `B-${id} 五档逐档解锁 (${trail.join(" ")})`);
});

// C. 推进过程中其余三个副本不得被带上去。
{
  const s = fresh();
  clearRun(s, "machine_factory", "normal");
  clearRun(s, "machine_factory", "adventure");
  clearRun(s, "machine_factory", "warrior");
  const others = MISSIONS.filter(id => id !== "machine_factory")
    .map(id => `${id}=${JSON.stringify(U.list(s, id))}`);
  assert(MISSIONS.filter(id => id !== "machine_factory")
    .every(id => U.list(s, id).length === 1), `C1 机械工厂推进不外溢 (${others.join(" ")})`);
  assert(U.list(s, "machine_factory").join(",") === "normal,adventure,warrior,king",
    `C2 机械工厂自身推进正确 (${JSON.stringify(U.list(s, "machine_factory"))})`);
}

// D. 每次通关后 migrate 不得回退已解锁进度（误锁保护）。
{
  const s = fresh();
  clearRun(s, "orc_dungeon", "normal");
  const after1 = U.list(s, "orc_dungeon").join(",");
  clearRun(s, "orc_dungeon", "adventure");
  const after2 = U.list(s, "orc_dungeon").join(",");
  assert(after1 === "normal,adventure" && after2 === "normal,adventure,warrior",
    `D1 兽人地下城逐档推进且不回退 (${after1} -> ${after2})`);
}

// E. 进入副本校验：已解锁可进，未解锁被拒，缺开放 flag 被拒。
{
  const s = fresh();
  s.flags.underwaterTrainUnlocked = true;
  s.flags.orcDungeonUnlocked = true;
  s.flags.ruinsSandCityUnlocked = true;
  const enter = (missionId, difficultyId) =>
    window.LocalCoreDungeonOps.startDungeon(s, { missionId, difficultyId });

  assert(enter("machine_factory", "normal") === window.LocalCoreUtils.outcomes.changed,
    "E1 机械工厂·普通级 可进入");
  clearRun(s, "machine_factory", "normal");
  assert(enter("machine_factory", "adventure") === window.LocalCoreUtils.outcomes.changed,
    "E2 通关后 机械工厂·冒险级 可进入");
  assert(enter("machine_factory", "warrior") === window.LocalCoreUtils.outcomes.rejected,
    "E3 未解锁的 机械工厂·勇士级 被拒");

  // 四个副本各自的普通级（已开放 flag）都可进入。
  const openable = MISSIONS.map(id => `${id}:${enter(id, "normal") === window.LocalCoreUtils.outcomes.changed ? "OK" : "REJ"}`);
  assert(MISSIONS.every(id => enter(id, "normal") === window.LocalCoreUtils.outcomes.changed),
    `E4 四副本普通级均可进入 (${openable.join(" ")})`);

  // 缺 flag 必须被拒。
  const s2 = fresh();
  const locked = MISSIONS.filter(id => {
    const m = window.GameData.missions.find(x => x.id === id);
    return m?.requiresFlag;
  }).map(id => `${id}:${window.LocalCoreDungeonOps.startDungeon(s2, { missionId: id, difficultyId: "normal" }) === window.LocalCoreUtils.outcomes.rejected ? "REJ" : "OK"}`);
  assert(MISSIONS.filter(id => window.GameData.missions.find(x => x.id === id)?.requiresFlag)
    .every(id => window.LocalCoreDungeonOps.startDungeon(s2, { missionId: id, difficultyId: "normal" }) === window.LocalCoreUtils.outcomes.rejected),
    `E5 缺开放 flag 的三个副本被拒 (${locked.join(" ")})`);
}

// F. 后两个副本的开放触发：靠指定副本的指定难度通关。
{
  const s = fresh();
  const orcByNormal = window.triggerOrcDungeonUnlockEvent(s, { missionId: "underwater_train", difficultyId: "normal" });
  const orcByAdventure = window.triggerOrcDungeonUnlockEvent(s, { missionId: "underwater_train", difficultyId: "adventure" });
  assert(orcByNormal === false && orcByAdventure === true,
    `F1 兽人地下城仅由水下列车·冒险级触发 (normal=${orcByNormal}, adventure=${orcByAdventure})`);

  const s3 = fresh();
  const ruinsByAdventure = window.triggerRuinsSandCityUnlockEvent(s3, { missionId: "orc_dungeon", difficultyId: "adventure" });
  const ruinsByWarrior = window.triggerRuinsSandCityUnlockEvent(s3, { missionId: "orc_dungeon", difficultyId: "warrior" });
  assert(ruinsByAdventure === false && ruinsByWarrior === true,
    `F2 废墟沙城仅由兽人地下城·勇士级触发 (adventure=${ruinsByAdventure}, warrior=${ruinsByWarrior})`);
}

// G. 完整推进：从零打到废墟沙城·英雄级，模拟真实玩家路径。
{
  const s = fresh();
  const path = [
    ["machine_factory", "normal"], ["machine_factory", "adventure"],
    ["machine_factory", "warrior"], ["machine_factory", "king"],
    ["underwater_train", "normal"], ["underwater_train", "adventure"],
    ["orc_dungeon", "normal"], ["orc_dungeon", "adventure"], ["orc_dungeon", "warrior"],
    ["ruins_sand_city", "normal"], ["ruins_sand_city", "adventure"], ["ruins_sand_city", "warrior"],
  ];
  path.forEach(([m, d]) => clearRun(s, m, d));
  s.flags.underwaterTrainUnlocked = true;
  window.triggerOrcDungeonUnlockEvent(s, { missionId: "underwater_train", difficultyId: "adventure" });
  s.flags.orcDungeonUnlocked = true;
  window.triggerRuinsSandCityUnlockEvent(s, { missionId: "orc_dungeon", difficultyId: "warrior" });
  s.flags.ruinsSandCityUnlocked = true;
  const final = MISSIONS.map(id => `${id}=${U.list(s, id).join("/")}`);
  const expected = {
    machine_factory: "normal/adventure/warrior/king/hell",
    underwater_train: "normal/adventure/warrior",
    orc_dungeon: "normal/adventure/warrior/king",
    ruins_sand_city: "normal/adventure/warrior/king",
  };
  const ok = MISSIONS.every(id => U.list(s, id).join("/") === expected[id]);
  assert(ok, `G1 完整路径各副本难度正确 (${final.join(" | ")})`);
  assert(window.LocalCoreDungeonOps.startDungeon(s, { missionId: "ruins_sand_city", difficultyId: "king" }) === window.LocalCoreUtils.outcomes.changed,
    "G2 最终废墟沙城·王者级可进入");
  assert(window.LocalCoreDungeonOps.startDungeon(s, { missionId: "ruins_sand_city", difficultyId: "hell" }) === window.LocalCoreUtils.outcomes.rejected,
    "G3 未解锁的废墟沙城·英雄级被拒");
}

console.log(`\n总计 ${failed ? `失败 ${failed}` : `全部通过`} (${passed}/${passed + failed})`);
process.exit(failed ? 1 : 0);
