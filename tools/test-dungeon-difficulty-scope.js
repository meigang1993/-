// 副本难度解锁作用域测试：难度解锁必须按副本独立，不能全局生效。
//
// 背景 BUG：state.unlockedDifficulties 是全局数组，通关 machine_factory 的普通级
// 会解锁冒险级，而 underwater_train / orc_dungeon / ruins_sand_city 的冒险级
// 也会同时显示为已解锁。
//
// 判据用 window.DungeonUnlocks.list（按副本查询）。修复前该模块不存在，
// 回退到全局数组，从而复现 BUG；修复后按副本独立，断言成立。
const {
  assert, DungeonRewards, GameStoreStateFactory,
} = require("./dungeon-matrix-harness");

const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon"];
const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];

// 按副本查询已解锁难度。修复前 DungeonUnlocks 不存在 → 回退全局数组（复现 BUG）。
function listFor(state, missionId) {
  if (global.DungeonUnlocks?.list) return global.DungeonUnlocks.list(state, missionId);
  return Array.isArray(state.unlockedDifficulties) ? state.unlockedDifficulties : [];
}

function hasFor(state, missionId, difficultyId) {
  if (global.DungeonUnlocks?.has) return global.DungeonUnlocks.has(state, missionId, difficultyId);
  return (state.unlockedDifficulties || []).includes(difficultyId);
}

function stateWithRun(missionId, difficultyId) {
  const state = GameStoreStateFactory.freshState();
  state.flags.underwaterTrainUnlocked = true;
  state.flags.orcDungeonUnlocked = true;
  state.party = ["lokar"];
  state.explore = {
    focusId: `scope-${missionId}-${difficultyId}`,
    missionId, difficultyId,
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  return state;
}

async function clearRun(missionId, difficultyId) {
  const state = stateWithRun(missionId, difficultyId);
  await DungeonRewards.finish(state);
  assert(state.explore === null, `${missionId}/${difficultyId}: finish 未回到大厅`);
  return state;
}

async function testDifficultyScope() {
  // A. 通关 machine_factory 普通级：只有该副本解锁冒险级，其他副本不受影响。
  const state = await clearRun("machine_factory", "normal");
  assert(hasFor(state, "machine_factory", "adventure"),
    "A1 通关副本应解锁该副本的下一难度");
  assert(!hasFor(state, "underwater_train", "adventure"),
    `A2 水下列车不应被其他副本的通关解锁（当前=${JSON.stringify(listFor(state, "underwater_train"))}）`);
  assert(!hasFor(state, "orc_dungeon", "adventure"),
    `A3 兽人地下城不应被其他副本的通关解锁（当前=${JSON.stringify(listFor(state, "orc_dungeon"))}）`);
  assert(hasFor(state, "underwater_train", "normal"),
    "A4 其他副本至少保留普通级");

  // B. 逐难度推进：只在本副本内链式解锁。
  const deep = await clearRun("machine_factory", "normal");
  deep.explore = {
    focusId: "scope-chain-adventure", missionId: "machine_factory", difficultyId: "adventure",
    complete: true, banked: false,
    party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  await DungeonRewards.finish(deep);
  assert(hasFor(deep, "machine_factory", "warrior"), "B1 本副本应继续链式解锁勇士级");
  assert(!hasFor(deep, "underwater_train", "warrior"), "B2 勇士级不得外溢到其他副本");
  assert(!hasFor(deep, "underwater_train", "adventure"),
    `B3 冒险级仍不得外溢（当前=${JSON.stringify(listFor(deep, "underwater_train"))}）`);

  // C. 反向：水下列车通关，不影响机械工厂已解锁的难度（单向独立）。
  const train = await clearRun("underwater_train", "normal");
  assert(hasFor(train, "underwater_train", "adventure"), "C1 水下列车应解锁自己的冒险级");
  assert(!hasFor(train, "machine_factory", "adventure"),
    `C2 机械工厂不应被水下列车通关解锁（当前=${JSON.stringify(listFor(train, "machine_factory"))}）`);

  // D. 初始状态：每个副本只有普通级。
  const fresh = GameStoreStateFactory.freshState();
  MISSIONS.forEach(id => {
    const list = listFor(fresh, id);
    assert(list.includes("normal"), `D1 ${id} 初始应含普通级`);
    assert(list.length === 1, `D2 ${id} 初始只应含普通级（当前=${JSON.stringify(list)}）`);
  });
}

async function testUnknownIdsRejected() {
  // 防御：未知副本/难度不得写入解锁表。
  const state = GameStoreStateFactory.freshState();
  if (!global.DungeonUnlocks?.unlock) return; // 修复前无此模块
  global.DungeonUnlocks.unlock(state, "machine_factory", "adventure");
  global.DungeonUnlocks.unlock(state, "no_such_mission", "adventure");
  global.DungeonUnlocks.unlock(state, "machine_factory", "no_such_difficulty");
  const list = global.DungeonUnlocks.list(state, "machine_factory");
  assert(list.includes("adventure"), "E1 合法难度应写入");
  assert(!global.DungeonUnlocks.list(state, "no_such_mission").length,
    "E2 未知副本不得写入");
  assert(!list.includes("no_such_difficulty"), "E3 未知难度不得写入");
}

async function testLegacyMigration() {
  // 老存档（数组形态）迁移：已开放副本保留原有进度，未开放副本只给普通级。
  const state = GameStoreStateFactory.freshState();
  if (!global.DungeonUnlocks?.migrate) return;
  state.unlockedDifficulties = ["normal", "adventure", "warrior"];
  state.flags.underwaterTrainUnlocked = true;
  state.flags.orcDungeonUnlocked = false;
  global.DungeonUnlocks.migrate(state);
  const open = global.DungeonUnlocks.list(state, "machine_factory");
  assert(open.includes("normal") && open.includes("adventure") && open.includes("warrior"),
    `F1 已开放副本应继承旧进度（当前=${JSON.stringify(open)}）`);
  const train = global.DungeonUnlocks.list(state, "underwater_train");
  assert(train.includes("adventure"), "F2 已开放的水下列车应继承旧进度");
  const orc = global.DungeonUnlocks.list(state, "orc_dungeon");
  assert(orc.length === 1 && orc[0] === "normal",
    `F3 未开放副本应只保留普通级（当前=${JSON.stringify(orc)}）`);
}

module.exports = {
  testDifficultyScope,
  testUnknownIdsRejected,
  testLegacyMigration,
};

if (require.main === module) {
  (async () => {
    const cases = [
      ["副本难度解锁作用域", testDifficultyScope],
      ["未知 id 防御", testUnknownIdsRejected],
      ["老存档迁移", testLegacyMigration],
    ];
    let failed = 0;
    for (const [name, fn] of cases) {
      try {
        await fn();
        console.log(`通过 ${name}`);
      } catch (err) {
        failed += 1;
        console.log(`失败 ${name}: ${err.message}`);
      }
    }
    console.log(failed ? `总计 失败 ${failed}` : "总计 全部通过");
    process.exit(failed ? 1 : 0);
  })();
}
