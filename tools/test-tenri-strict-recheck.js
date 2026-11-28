// 250~252 改动独立严格复查：不复用既有断言，走真实模块链路。
// REVERT=<组> 撤掉对应源码守卫并重载，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { sourceOf } = require("./split-source-view");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => sourceOf(path.join(DIR, name));
const REPL = {
  restore: ["store-migration-runs.js", "if (!mission || mission.devLocked) return false;", "if (!mission) return false;"],
  render: ["app-render-state.js", "  if (mission?.devLocked) return false;", "  "],
  settle: ["local-core-dungeon.js", "|| mission?.devLocked) return outcomes.rejected;", "|| false) return outcomes.rejected;"],
  exp: ["character-progression.js", "tenri_institute: 5,", "tenri_institute: 1,"],
  gold: ["economy-config.js", "tenri_institute: Object.freeze({", "tenri_institute_DISABLED: Object.freeze({"],
  maxlevel: ["character-progression.js", "const maxLevel = 25;", "const maxLevel = 20;"],
  enhance: ["character-enhance.js", "const MAX_LEVEL = 70;", "const MAX_LEVEL = 50;"],
  unlock: ["data-tenri-institute.js", '["preshi", "mieryula"].every', '["nobody"].every'],
};
const EXPECT_GROUPS = {
  restore: ["F"], render: ["F"], settle: ["F"], exp: ["A"], gold: ["B"],
  maxlevel: ["C"], enhance: ["D"], unlock: ["E"],
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
[
  "economy-config.js", "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js",
  "data-tenri-institute-enemies.js", "data-tenri-institute.js",
  "data-future-dungeons.js", "character-progression.js", "character-enhance.js",
  "unlock-event-progress.js", "dungeon-map.js", "tenri-institute-unlock-events.js",
].forEach(load);
window.GameDataFutureEnemies = {};
load("data-world.js");
window.GameData = { ...window.GameDataWorld };
const GD = window.GameData, P = window.CharacterProgression, T = window.GameDataTenriInstitute;
const ECON = window.GameEconomy;

const results = [];
const check = (group, name, ok) => results.push({ group, name, ok: !!ok });
const has = (name, text) => source(name).includes(text);

// ---------- A. 经验 5 倍：真实 rewardFor + 各副本对照 ----------
const diff = GD.difficulties.adventure;
check("A", "倍率表新副本=5 其它不变", P.dungeonExpMultiplier.tenri_institute === 5
  && P.dungeonExpMultiplier.ruins_sand_city === 4 && P.dungeonExpMultiplier.machine_factory === 1);
const EXP_BASE = { normal: 30, elite: 70, boss: 130 };
check("A", "每场普通/精英/BOSS 战斗胜利均按 5 倍公式结算", ["normal", "elite", "boss"].every(k =>
  P.rewardFor(k, diff, "tenri_institute") === Math.round(EXP_BASE[k] * (diff.xp / 100) * 5)));
check("A", "普通级难度恰好 5 倍（取整前无误差）", ["normal", "elite", "boss"].every(k =>
  P.rewardFor(k, { xp: 100 }, "tenri_institute") === P.rewardFor(k, { xp: 100 }, "machine_factory") * 5));
check("A", "经验有限非负整数", ["normal", "elite", "boss"].every(k =>
  Number.isSafeInteger(P.rewardFor(k, diff, "tenri_institute")) && P.rewardFor(k, diff, "tenri_institute") >= 0));
check("A", "结算层与胜利面板共用同一 rewardFor", has("local-core-dungeon.js", "CharacterProgression.rewardFor(kind, diff, run.missionId)")
  && has("battle-victory.js", "CharacterProgression?.rewardFor?.("));

// ---------- B. 金币按废墟沙城 ----------
check("B", "missionRewards 两副本同为 230", ECON.missionRewards.tenri_institute?.goldMultiplier === 230
  && ECON.missionRewards.ruins_sand_city?.goldMultiplier === 230);
check("B", "mission.reward 展开得到 230", T.mission.reward.goldMultiplier === 230);
check("B", "rollGold 读 mission.reward.goldMultiplier", has("local-core-dungeon.js", "mission?.reward?.goldMultiplier"));
check("B", "全局 -30% 基础值仍在", Array.isArray(ECON.dungeonGold.normal) && ECON.dungeonGold.normal[0] > 0);
check("B", "bundle 顺序：economy-config 先于 tenri 数据", (() => {
  const b = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/publish-bundles.json"), "utf8"));
  const s = b.startup;
  return s.indexOf("economy-config.js") >= 0 && s.indexOf("data-tenri-institute.js") > s.indexOf("economy-config.js");
})());

// ---------- C. 25 级成长边界 ----------
check("C", "上限 25 / 成长 1.3", P.maxLevel === 25 && P.growthScale === 1.3);
check("C", "经验表 25 项且递增", P.expToNext.length === 25 && P.expToNext.every((v, i, a) => v > 0 && (!i || v > a[i - 1])));
check("C", "need(25)=0 封顶不再要经验", P.need(25) === 0 && P.need(24) === 10880);
const tpl = { id: "lokar", stats: { maxHp: 124, attack: 10, magic: 5, speed: 11 } };
const stats = Array.from({ length: 26 }, (_, lv) => P.statsAt(tpl, lv));
check("C", "0~25 级四属性全为安全整数", stats.every(s => P.statKeys.every(k => Number.isSafeInteger(s[k]))));
check("C", "四属性随等级单调不降", P.statKeys.every(k => stats.every((s, i) => !i || s[k] >= stats[i - 1][k])));
check("C", "满级成长恰好 +30%", (() => {
  const base = tpl.stats.attack, total = P.growth.lokar.attack;
  return stats[25].attack - base === Math.round(total * 1.3);
})());
check("C", "26 级溢出收敛为 25", JSON.stringify(P.statsAt(tpl, 26)) === JSON.stringify(stats[25]));
const hero = { id: "lokar", level: 24, exp: 0, stats: { ...tpl.stats }, locked: false };
const gained = P.grant(hero, 999999, tpl);
check("C", "grant 封顶 25 级且 exp 清零", gained.level === 25 && hero.exp === 0 && hero.level === 25);
check("C", "grant 后属性与 statsAt(25) 一致", JSON.stringify(hero.stats) === JSON.stringify(stats[25]));

// ---------- D. 强化 70 上限一致性 ----------
const ENH = window.CharacterEnhance;
check("D", "MAX_LEVEL=70 单次 5000", ENH.MAX_LEVEL === 70 && ENH.COST === 5000);
check("D", "旧档超 70 收敛不保留", (() => {
  const c = { id: "lokar", enhance: { maxHp: 999, attack: -3, magic: "x", speed: 71 } };
  const r = ENH.normalize ? ENH.normalize(c) : null;
  return r ? r.maxHp === 70 && r.attack === 0 && r.magic === 0 && r.speed === 70 : true;
})());
const allSrc = fs.readdirSync(DIR).filter(f => f.endsWith(".js")).map(f => [f, raw(f)]);
check("D", "面板文案同步 70", allSrc.some(([f, t]) => f === "ui-info.js" && t.includes("每项最多 70 次")));
check("D", "历史公告 50 次已订正为 70 次且零残留", (() => {
  const notice = allSrc.find(([f]) => f === "update-notice-recent.js")?.[1] || "";
  return notice.includes("调整为 70 次") && notice.includes("收敛为 70 次")
    && !notice.includes("50 次") && !notice.includes("50次");
})());
check("D", "结算层读同一常量", has("hall-enhance-actions.js", "enhance?.COST ?? 5000"));

// ---------- E. 解锁链真实性 ----------
const charIds = ["preshi", "mieryula"];
check("E", "角色 id 真实存在于角色表", charIds.every(id => raw("data-characters-extra.js").includes(`id: "${id}"`)));
check("E", "unlockCastReady 两角色都解锁才真", T.unlockCastReady({ chars: charIds.map(id => ({ id, locked: false })) })
  && !T.unlockCastReady({ chars: [{ id: "preshi", locked: false }, { id: "mieryula", locked: true }] }));
check("E", "clearedRuinsAdventure 认本次 run", T.clearedRuinsAdventure({}, { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true }));
check("E", "clearedRuinsAdventure 认手册老档记录", (() => {
  const old = window.ButlerManualProgress;
  window.ButlerManualProgress = { has: (s, k, id, d) => k === "clear" && id === "ruins_sand_city" && d === "adventure" };
  const ok = T.clearedRuinsAdventure({}, null);
  window.ButlerManualProgress = old;
  return ok;
})());
check("E", "recordClear 难度键与查询一致", has("dungeon-settlement-actions.js", "P.recordClear(state, run.missionId, runDifficulty(state, run))")
  && has("dungeon-settlement-actions.js", "return run?.difficultyId"));
check("E", "剧情 9 句 + 事件白名单 + 四处挂点", window.TenriInstituteUnlockEvents.LINES.length === 9
  && has("unlock-event-progress.js", '"tenri_institute"')
  && has("dungeon-run-rewards.js", "triggerTenriInstituteUnlockEvent")
  && has("hall-unlock-events.js", "TenriInstituteUnlockEvents?.triggerPending")
  && has("local-core-events.js", 'setFlag("tenriInstituteUnlocked")'));
check("E", "剧情只置标记不改入口", T.mission.devLocked === true && T.mission.devHint === "未开发完成");

// ---------- F. devLocked 全入口（含存档恢复/渲染层/结算层）----------
const devRun = {
  missionId: "tenri_institute", difficultyId: "adventure", complete: false,
  layers: [[{ id: "n1", type: "normal", layer: 1, next: ["n2"] }], [{ id: "n2", type: "boss", layer: 2, next: [] }]],
  current: "n1", party: [], activeParty: [], focusId: "f1",
};
const clone = () => JSON.parse(JSON.stringify(devRun));
// 真实加载 StoreRunMigrations（含 REVERT 注入）
{
  const sandbox = { window: {}, GameData: GD, Object, Array, JSON, String, Number, Math };
  sandbox.window = sandbox;
  vm.runInNewContext(source("store-migration-runs.js"), sandbox, { filename: "store-migration-runs.js" });
  const s = { view: "dungeon", explore: clone(), battle: null, log: [] };
  sandbox.window.StoreRunMigrations.recoverBrokenDungeonState(s);
  check("F", "存档恢复：devLocked run 被清回大厅", s.explore === null && s.view === "hall");
  const good = { view: "dungeon", explore: { ...clone(), missionId: "ruins_sand_city" }, battle: null, log: [] };
  sandbox.window.StoreRunMigrations.recoverBrokenDungeonState(good);
  check("F", "存档恢复：正常副本 run 不受影响", good.explore !== null && good.view === "dungeon");
}
// 真实加载 app-render-state.js 的 ensureRenderableView
{
  const sandbox = {
    window: { GameData: GD, BattleFX: { leave() {} } },
    state: { view: "dungeon", explore: clone(), battle: null, log: [] },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    Object, Array, JSON, String, Number, Math, Date, console,
  };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source("app-render-state.js"), sandbox, { filename: "app-render-state.js" });
  sandbox.ensureRenderableView();
  check("F", "渲染层：devLocked run 被清回大厅", sandbox.state.explore === null && sandbox.state.view === "hall");
  const good = { view: "dungeon", explore: { ...clone(), missionId: "ruins_sand_city" }, battle: null, log: [] };
  sandbox.state = good;
  sandbox.ensureRenderableView();
  check("F", "渲染层：正常副本 run 不受影响", good.explore !== null && good.view === "dungeon");
}
check("F", "结算层 settleDungeon 静态守卫在位", has("local-core-dungeon.js", "|| mission?.devLocked) return outcomes.rejected;"));
check("F", "结算层真实拒绝 devLocked run 领奖", (() => {
  const outcomes = { rejected: { ok: false }, changed: { ok: true }, reconciled: { ok: true } };
  const sandbox = {
    window: {
      LocalCoreUtils: {
        n: Number, uniq: x => [...new Set(x || [])], sample: x => x, outcomes,
        addResource: (a, b) => a + b, assertInventoryCapacity: () => {},
      },
      GameEconomy: { dungeonGold: { normal: 10, elite: 20, boss: 30 } },
      GameRandom: window.GameRandom, CharacterProgression: P,
      DungeonUnlocks: { migrate() {} },
    },
    GameData: GD, Object, Array, JSON, String, Number, Math, Set,
  };
  sandbox.window.window = sandbox.window;
  try {
    vm.runInNewContext(source("local-core-dungeon.js"), sandbox, { filename: "local-core-dungeon.js" });
    return sandbox.window.LocalCoreDungeonOps.settleDungeon({}, { run: clone(), nodeId: "n1" }) === outcomes.rejected;
  } catch (_) { return false; }
})());
check("F", "startDungeon 守卫仍在", has("local-core-dungeon.js", "if (mission.devLocked) return outcomes.rejected;"));
check("F", "四处静态入口守卫齐全", ["villa-team.js", "hall-party-actions.js", "bounty-task-generator.js", "butler-manual-progress.js"]
  .every(f => raw(f).includes("devLocked")));

// ---------- G. 手册分母与怪物池边界 ----------
check("G", "手册过滤 devLocked 后 4 副本", (() => {
  const sandbox = { window: { GameData: GD, CharacterProgression: P }, Object, Array, JSON, String, Number, Math, Set, Map };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source("butler-manual-progress.js"), sandbox, { filename: "butler-manual-progress.js" });
  const M = sandbox.window.ButlerManualProgress;
  return M.missions().length === 4 && M.missions().every(m => !m.devLocked);
})());
check("G", "手册 MAX_LEVEL 动态跟随成长模块", (() => {
  const sandbox = { window: { GameData: GD, CharacterProgression: P }, Object, Array, JSON, String, Number, Math, Set, Map };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source("butler-manual-progress.js"), sandbox, { filename: "butler-manual-progress.js" });
  return sandbox.window.ButlerManualProgress.MAX_LEVEL === P.maxLevel;
})());
check("G", "怪物池为 4 只普通怪 + 1 精英（共 5 只研究所专属）",
  GD.enemies.tenri_institute.length === 5
  && GD.enemies.tenri_institute.every(e => String(e.id).startsWith("tenri_"))
  && GD.enemies.tenri_institute.filter(e => e.type === "normal").length === 4
  && GD.enemies.tenri_institute.some(e => e.id === "tenri_jamin" && e.type === "elite")
  && GD.enemies.tenri_institute !== window.GameDataRuinsSandCityEnemies);
check("G", "占位期不进手册避免重名点亮", has("butler-manual-progress.js", "!m?.devLocked"));

// ---------- 汇总 ----------
const failed = results.filter(r => !r.ok);
const groups = [...new Set(results.map(r => r.group))];
if (REVERT) {
  const want = EXPECT_GROUPS[REVERT] || [];
  const own = failed.filter(r => want.includes(r.group)).length;
  const other = failed.filter(r => !want.includes(r.group)).length;
  const ok = own > 0 && other === 0;
  console.log(`REVERT=${REVERT} ${ok ? "OK" : "FAILED"} own=${own} other=${other} [${failed.map(r => r.group + ":" + r.name).join(", ")}]`);
  process.exit(ok ? 0 : 1);
}
console.log(`天日国鹰7研究所独立严格复查 通过 ${results.length - failed.length} / ${results.length}（${groups.length} 组）`);
failed.forEach(r => console.log(`  ✗ ${r.group} ${r.name}`));
process.exit(failed.length ? 1 : 0);
