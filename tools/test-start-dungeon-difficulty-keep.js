/* 回归：出征不得回收已解锁的难度。
   背景：本地核心处理 startDungeon 时，传给 core 的字段快照（LocalCoreUtils.sanitize）
   原本不含 butlerFeats，而难度解锁会按「通关记录」重算（DungeonUnlocks.migrate/chain）。
   于是每次出征 core 都被判定为「无任何通关记录」，把各副本难度整体回收到普通级，
   再随 apply 写回存档——玩家已解锁的冒险级/勇士级会莫名消失。
   注意：本文件依赖 dungeon-matrix-harness 在 require 时装载的运行时模块。 */
require("./dungeon-matrix-harness");

const assert = require("assert");

const DIFF = "adventure";
const MISSION = "machine_factory";

function freshClearedNormal() {
  const state = window.GameStoreStateFactory.freshState();
  state.flags.underwaterTrainUnlocked = true;
  state.flags.orcDungeonUnlocked = true;
  // 通关普通级：写入真实通关记录， adventure 应随之解锁
  window.ButlerManualProgress.recordClear(state, MISSION, "normal");
  window.DungeonUnlocks.migrate(state);
  return state;
}

(async () => {
  let fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) console.log(`✅ ${name}`);
    else { fail++; console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})} `); }
  };

  // A. 前置：通关记录确实解锁了 adventure
  const s0 = freshClearedNormal();
  ok("A1 通关普通级后 adventure 已解锁",
    window.DungeonUnlocks.has(s0, MISSION, DIFF),
    { list: window.DungeonUnlocks.list(s0, MISSION) });

  // B. 出征 adventure：不得被拒
  const s1 = freshClearedNormal();
  const start = await window.ServerCore.call("startDungeon",
    { missionId: MISSION, difficultyId: DIFF }, s1);
  ok("B1 startDungeon 未被拒", start.ok, { start });

  // C. 出征后存档里的解锁表不得被回收
  ok("C1 出征后 machine_factory 仍保留 adventure",
    window.DungeonUnlocks.has(s1, MISSION, DIFF),
    { table: s1.dungeonUnlocks, legacy: s1.unlockedDifficulties });

  // D. 高阶难度（勇士级）同样不被回收
  const s2 = freshClearedNormal();
  window.ButlerManualProgress.recordClear(s2, MISSION, "adventure");
  window.DungeonUnlocks.migrate(s2);
  ok("D1 通关冒险级后 warrior 已解锁",
    window.DungeonUnlocks.has(s2, MISSION, "warrior"),
    { list: window.DungeonUnlocks.list(s2, MISSION) });
  const start2 = await window.ServerCore.call("startDungeon",
    { missionId: MISSION, difficultyId: "warrior" }, s2);
  ok("D2 startDungeon（勇士级）未被拒", start2.ok, { start2 });
  ok("D3 出征后仍保留 warrior",
    window.DungeonUnlocks.has(s2, MISSION, "warrior"), { table: s2.dungeonUnlocks });

  // E. 防御层：core 快照缺 butlerFeats 时，migrate 必须保持原值不动
  const s3 = freshClearedNormal();
  const before = JSON.parse(JSON.stringify(s3.dungeonUnlocks));
  window.DungeonUnlocks.migrate({ dungeonUnlocks: JSON.parse(JSON.stringify(before)) });
  const probe = { dungeonUnlocks: JSON.parse(JSON.stringify(before)) };
  window.DungeonUnlocks.migrate(probe);
  ok("E1 缺通关记录的快照 migrate 后不回收",
    JSON.stringify(probe.dungeonUnlocks) === JSON.stringify(before),
    { before, after: probe.dungeonUnlocks });

  assert.strictEqual(fail, 0, `${fail} 项失败`);
  console.log("Start dungeon difficulty retention passed");
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
