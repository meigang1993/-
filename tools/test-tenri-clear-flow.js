// 天日国鹰7研究所 · 通关流程严格检查（255 版）
// 不复用既有断言：真实加载副本链路模块，走 start → 逐层 enter/settle → BOSS → finish → 回大厅 → 剧情解锁。
// REVERT=<组> 撤掉对应源码守卫并重载，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => fs.readFileSync(path.join(DIR, name), "utf8");
const REPL = {
  devlock: ["data-tenri-institute.js", "    devLocked: true,", "    "],
  settle: ["local-core-dungeon.js", "|| mission?.devLocked) return outcomes.rejected;", "|| false) return outcomes.rejected;"],
  restore: ["store-migration-runs.js", "if (!mission || mission.devLocked) return false;", "if (!mission) return false;"],
  complete: ["dungeon-reward-core.js", "    if (node.layer === run.layers.length) run.complete = true;", "    "],
  event: ["dungeon-run-rewards.js", "    window.triggerTenriInstituteUnlockEvent?.(state, run);", "    "],
  exp: ["character-progression.js", "tenri_institute: 5,", "tenri_institute: 1,"],
  gold: ["economy-config.js", "tenri_institute: Object.freeze({", "tenri_institute_DISABLED: Object.freeze({"],
  notice: ["update-notice-recent.js", "调整为 70 次", "调整为 50 次"],
};
const EXPECT_GROUPS = {
  devlock: ["A"], settle: ["A"], restore: ["A"], complete: ["B"],
  event: ["B"], exp: ["C"], gold: ["C"], notice: ["D"],
};
const patched = name => {
  const text = raw(name);
  if (!REVERT || !REPL[REVERT] || REPL[REVERT][0] !== name) return text;
  const [, from, to] = REPL[REVERT];
  if (!text.includes(from)) throw new Error(`REVERT=${REVERT} 目标未命中：${from}`);
  return text.replace(from, to);
};
const source = name => patched(name);
const load = name => vm.runInThisContext(source(name), { filename: name });

global.window = global;
window.GameRandom = {
  sample: list => (Array.isArray(list) ? list[0] : list),
  int: (min, max) => (Array.isArray(min) ? min[0] : min),
  chance: () => false, value: () => 0.5, persistentId: () => "test",
};
window.GameDataFutureEnemies = {};
const calls = [];
const queue = [];
window.BountySystem = {
  completeBattle() {}, completeDungeon() {}, claimPending() { return true; },
  failRun() {}, markMapNode() {},
};
window.ShopSystem = { refresh() { return true; } };
window.SettlementRecovery = {
  enqueue(state, action) { queue.push(action); },
  run(state, fn) { const list = queue.splice(0); list.forEach(a => fn(a)); return true; },
};
window.NewCharacterUnlockEvents = { recordDungeonClear() {}, triggerPending() {} };
window.ServerCore = {
  async call(op, args, state) {
    calls.push(op);
    if (op === "unlockEvent") window.LocalCoreEventOps.unlockEvent(state, args);
    return { ok: true, stale: false };
  },
};
window.AdvDialogue = { render() { return ""; }, cast() { return []; } };
global.render = () => {};
global.persist = async () => true;

[
  "economy-config.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js", "data-ruins-sand-city-enemies.js",
  "data-ruins-sand-city.js", "data-tenri-institute-enemies.js", "data-tenri-institute.js", "data-future-dungeons.js",
  "character-progression.js", "character-enhance.js", "unlock-event-progress.js", "local-core-utils.js",
  "dungeon-unlocks.js", "dungeon-map.js", "dungeon-enemies.js", "dungeon-events.js",
  "dungeon-reward-core.js", "dungeon-settlement-actions.js", "dungeon-run-rewards.js",
  "local-core-dungeon.js", "local-core-events.js", "data-world.js",
  "butler-manual-progress.js", "tenri-institute-unlock-events.js",
].forEach(load);
window.GameData = { ...window.GameDataWorld };
window.DungeonNodeRewards = {
  async retryPending(state) { window.DungeonSettlementActions.retryPending(state); return true; },
};

const GD = window.GameData;
const T = window.GameDataTenriInstitute;
const P = window.CharacterProgression;
const O = window.LocalCoreUtils.outcomes;
const results = [];
const check = (group, name, ok) => results.push({ group, name, ok: !!ok });

function makeState(withUnlockFlag = true) {
  const st = {
    view: "hall", log: [], hallModal: null, battle: null, explore: null,
    flags: withUnlockFlag ? { tenriInstituteUnlocked: true } : {},
    chars: [
      { id: "lokar", level: 0, exp: 0, stats: { maxHp: 124, attack: 10, magic: 5, speed: 11 }, hp: 124, locked: false },
      { id: "preshi", locked: false }, { id: "mieryula", locked: false },
    ],
    party: ["lokar"], bounties: [], butlerFeats: [],
    dungeonUnlocks: {}, unlockedDifficulties: ["normal"],
    resources: { gold: 0, essence: 0 }, defeatedElites: [], unlockedShopCards: [],
    pendingRun: { gold: 0, essence: 0, cards: [], relics: [] }, localRunState: null,
    unlockEvents: undefined,
  };
  return st;
}

// ---------- A. 当前版本：入口锁住，按设计无法通关 ----------
const coreA = makeState();
check("A", "副本仍标记 devLocked / 未开发完成",
  source("data-tenri-institute.js").includes("devLocked: true,")
  && source("data-tenri-institute.js").includes('devHint: "未开发完成"'));
const guards = [
  ["hall-party-actions.js", 'if (m.devLocked) return log(m.devHint || "未开发完成")'],
  ["local-core-dungeon.js", "if (mission.devLocked) return outcomes.rejected;"],
  ["store-migration-runs.js", "if (!mission || mission.devLocked) return false;"],
  ["app-render-state.js", "if (mission?.devLocked) return false;"],
  ["bounty-task-generator.js", "!mission.devLocked"],
  ["villa-team.js", "!mission.devLocked"],
];
check("A", "六处入口/恢复/悬赏守卫齐全", guards.every(([f, s]) => source(f).includes(s)));
check("A", "ServerCore 出征被 devLocked 拒绝",
  window.LocalCoreDungeonOps.startDungeon(coreA, { missionId: "tenri_institute", difficultyId: "normal" }) === O.rejected);
const fakeRun = {
  focusId: "f1", missionId: "tenri_institute", difficultyId: "normal",
  layers: [
    [{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: ["n2-0"] }],
    [{ id: "n2-0", layer: 2, col: 0, type: "normal", done: false, enemies: [{ id: "e1" }] }],
  ],
  pending: "n2-0",
};
check("A", "ServerCore 节点结算被 devLocked 拒绝",
  window.LocalCoreDungeonOps.settleDungeon(coreA, {
    run: fakeRun, nodeId: "n2-0", kind: "normal",
    defeatedEnemyIds: ["e1"], participantIds: ["lokar"],
  }) === O.rejected);
check("A", "当前版本不会误写通关记录", !window.ButlerManualProgress.has(coreA, "clear", "tenri_institute", "normal"));

// ---------- B. 解除入口锁后：真实链路逐层通关 ----------
const state = makeState(false);
global.state = state;
check("B", "mission 引用与 GameData.missions 同一对象",
  GD.missions.find(m => m.id === "tenri_institute") === T.mission);
check("B", "敌人池非空（getter 在 bundle 顺序内已就绪）",
  Array.isArray(GD.enemies.tenri_institute) && GD.enemies.tenri_institute.length > 0);
// 老档：废墟沙城·冒险级已有通关记录，供剧情触发链读取。
window.ButlerManualProgress.record(state, "clear", "ruins_sand_city", "adventure");
// 模拟开发完成：只解除入口锁，不改其它任何源码。
T.mission.devLocked = false;
delete T.mission.devHint;

window.DungeonEvents.start(state, "tenri_institute", "normal");
const run = state.explore;
check("B", "start 生成 14 层，7 宝箱 / 13 休整 / 14 BOSS",
  !!run && run.layers.length === 14
  && run.layers[6][0].type === "chest" && run.layers[12][0].type === "rest"
  && run.layers[13][0].type === "boss" && run.layers[0][0].done === true);
check("B", "每层连通且 current 指向起点",
  run.layers.every((layer, i) => i === run.layers.length - 1 || layer.every(n => (n.next || []).length > 0))
  && run.current === "n1-0");

const settled = [];
let steps = 0;
while (!run.complete && steps < 60) {
  steps += 1;
  const nodes = window.DungeonMap.nodes(run);
  const cur = nodes.find(n => n.id === run.current);
  const nextId = (cur?.next || []).find(id => {
    const n = nodes.find(x => x.id === id);
    return n && !n.done;
  });
  if (!nextId) break;
  const node = nodes.find(x => x.id === nextId);
  const entered = window.DungeonEvents.enter(state, nextId);
  if (!entered) break;
  if (entered.battle) {
    const ids = (node.enemies || []).map(e => e.id).filter(Boolean);
    const settle = window.LocalCoreDungeonOps.settleDungeon(state, {
      run, nodeId: nextId, kind: node.type,
      defeatedEnemyIds: ids, participantIds: ["lokar"],
    });
    settled.push({ node, settle, reward: { ...state.lastLocalReward } });
  }
  window.DungeonRewardCore.completeNode(state);
}
check("B", "逐层推进无卡死（步数正好覆盖 13 个可结算层）", steps === 13 && settled.length > 0);
check("B", "所有战斗节点结算均通过且敌人 id 一一对应",
  settled.length > 0 && settled.every(s => s.settle === O.changed
    && Array.isArray(s.reward.progression) && s.reward.nodeId === s.node.id));
check("B", "第 14 层 BOSS 结算后 run.complete=true", run.complete === true
  && run.layers[13][0].done === true);
check("B", "路径上每层至少一个节点完成，最后一层完成",
  run.layers.every(layer => layer.some(n => n.done)) && run.layers[13].every(n => n.done));

(async () => {
  await window.DungeonRunRewards.finish(state);
  check("B", "finish 回大厅且清空 explore", state.view === "hall" && state.explore === null);
  check("B", "通关记录写入管家手册", window.ButlerManualProgress.has(state, "clear", "tenri_institute", "normal"));
  check("B", "ServerCore 链路真实调用 bankRun", calls.includes("bankRun"));
  check("B", "废墟沙城冒险级通关记录触发剧情排队",
    state.hallModal === "tenriInstituteUnlock" && state.flags.tenriInstituteUnlockPending === true);
  await window.completeTenriInstituteUnlockEvent();
  check("B", "剧情完成写入解锁标记并释放弹窗",
    state.flags.tenriInstituteUnlocked === true && state.hallModal === null
    && !Object.hasOwn(state.flags, "tenriInstituteUnlockPending")
    && window.UnlockEventProgress.isCompleted(state, "tenri_institute"));
  check("B", "剧情只触发一次（二次调用被拒绝）",
    window.triggerTenriInstituteUnlockEvent(state, {
      missionId: "tenri_institute", difficultyId: "normal", complete: true,
    }) === false);
  check("B", "通关后难度链推进到下一档",
    !!window.DungeonUnlocks.has(state, "tenri_institute", "adventure"));

  // ---------- C. 通关数值口径 ----------
  check("C", "新副本经验倍率 5（其它副本不变）",
    P.dungeonExpMultiplier.tenri_institute === 5
    && P.dungeonExpMultiplier.ruins_sand_city === 4
    && P.dungeonExpMultiplier.machine_factory === 1);
  check("C", "每场战斗经验按 5 倍 rewardFor 结算",
    settled.every(s => s.reward.experience === P.rewardFor(s.node.type, GD.difficulties.normal, "tenri_institute"))
    && P.rewardFor("normal", { xp: 100 }, "tenri_institute") === 5 * P.rewardFor("normal", { xp: 100 }, "machine_factory"));
  check("C", "金币按 230% 倍率且与客户端同一公式",
    T.mission.reward.goldMultiplier === 230
    && settled.every(s => Number.isSafeInteger(s.reward.gold) && s.reward.gold > 0
      && s.reward.gold === window.DungeonRewardCore.rollGold(run, s.node.type, state)));
  check("C", "25 级上限 / 强化 70 次",
    P.maxLevel === 25 && window.CharacterEnhance.MAX_LEVEL === 70 && window.CharacterEnhance.COST === 5000);

  // ---------- D. 公告订正 ----------
  const notice = source("update-notice-recent.js");
  check("D", "历史公告 50 次已订正为 70 次且零残留",
    notice.includes("调整为 70 次") && notice.includes("超过 70 次") && notice.includes("收敛为 70 次")
    && !notice.includes("50 次") && !notice.includes("50次"));
  check("D", "面板/常量/QA 注释同步 70",
    source("ui-info.js").includes("每项最多 70 次")
    && source("character-enhance.js").includes("const MAX_LEVEL = 70;")
    && !fs.readFileSync(path.join(ROOT, "tools", "qa-test-catalog.js"), "utf8").includes("每项 50 次"));
  const hallBundle = path.join(ROOT, "publish", "bundles", "hall.min.js");
  check("D", "公告 bundle 镜像同步（无 50 次）",
    fs.existsSync(hallBundle) && !fs.readFileSync(hallBundle, "utf8").includes("50 次")
    && fs.readFileSync(hallBundle, "utf8").includes("调整为 70 次"));

  // ---------- 输出 / 反向验证 ----------
  const bad = results.filter(r => !r.ok);
  const groups = [...new Set(results.map(r => r.group))];
  if (REVERT) {
    const expected = EXPECT_GROUPS[REVERT] || [];
    const own = bad.filter(r => expected.includes(r.group)).length;
    const other = bad.filter(r => !expected.includes(r.group)).length;
    const ok = own > 0 && other === 0 && expected.every(g => bad.some(r => r.group === g));
    console.log(`REVERT=${REVERT} own=${own} other=${other} REVERT_OK=${ok}`);
    bad.forEach(r => console.log(`  [${r.group}] ${r.name}`));
    process.exit(ok ? 0 : 1);
  }
  groups.forEach(g => {
    const list = results.filter(r => r.group === g);
    console.log(`[${g}] ${list.filter(r => r.ok).length}/${list.length}`);
  });
  console.log(`TOTAL ${results.length - bad.length}/${results.length} steps=${steps} battles=${settled.length}`);
  bad.forEach(r => console.log(`  FAIL [${r.group}] ${r.name}`));
  process.exit(bad.length ? 1 : 0);
})().catch(error => {
  console.error("FLOW_THREW", error && error.stack ? error.stack : error);
  process.exit(2);
});
