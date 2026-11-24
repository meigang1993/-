// 管家手册接入检查：25 级满级线跟随成长模块 + devLocked 副本不进手册。
// REVERT=<组> 时撤掉对应源码守卫并重载，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => fs.readFileSync(path.join(DIR, name), "utf8");
const REPL = {
  maxlevel: ["butler-manual-progress.js",
    "const maxLevel = () => Math.floor(Number(window.CharacterProgression?.maxLevel)) || 25;",
    "const maxLevel = () => 20;"],
  getter: ["butler-manual-progress.js",
    "get MAX_LEVEL() { return maxLevel(); }", "MAX_LEVEL: 25"],
  devlock: ["butler-manual-progress.js",
    "m?.kind === \"dungeon\" && !m?.devLocked", "m?.kind === \"dungeon\""],
  notice: ["update-notice-recent.js",
    "【管家手册】接入新等级上限与副本占位", "【管家手册】占位说明"],
};
const EXPECT_GROUPS = {
  maxlevel: ["A"], getter: ["A", "E"], devlock: ["B", "C", "E"], notice: ["E"],
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
[
  "game-random.js", "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js", "data-future-characters.js",
  "data-new-characters.js", "data-characters.js",
  "character-progression.js", "character-enhance.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js",
  "data-tenri-institute-enemies.js", "data-tenri-institute.js", "data-future-dungeons.js",
  "data-future-orc-enemies.js", "data-bakar-enemy.js", "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-world.js", "data.js", "butler-manual-progress.js",
].forEach(load);

const P = window.ButlerManualProgress;
const PROG = window.CharacterProgression;
const GD = window.GameData;
const T = window.GameDataTenriInstitute;
const state = () => ({ butlerFeats: [], chars: [], flags: {}, defeatedElites: [] });
const results = [];
const check = (group, name, ok) => results.push({ group, name, ok: !!ok });
const has = (name, text) => source(name).includes(text);

// ---------- A. 满级线接入 25 级 ----------
const heroState = level => ({
  butlerFeats: [], flags: {},
  chars: [{ id: "lokar", level, locked: false }],
});
check("A", "成长模块等级上限 25", PROG.maxLevel === 25 && PROG.growthScale === 1.3);
check("A", "手册 MAX_LEVEL 跟随成长模块", P.MAX_LEVEL === PROG.maxLevel && P.MAX_LEVEL === 25);
check("A", "25 级判满级", P.heroList(heroState(25))[0].maxed === true);
check("A", "24 级不判满级", P.heroList(heroState(24))[0].maxed === false);
check("A", "20 级不再误判满级（旧 BUG）", P.heroList(heroState(20))[0].maxed === false);
const saved = PROG.maxLevel;
PROG.maxLevel = 30;
const dynamic = P.MAX_LEVEL === 30 && P.heroList(heroState(30))[0].maxed === true;
PROG.maxLevel = saved;
check("A", "MAX_LEVEL 为动态 getter 而非写死常量", dynamic && P.MAX_LEVEL === 25);
check("A", "UI 等级文案读 P.MAX_LEVEL", raw("butler-manual.js").includes("${P.MAX_LEVEL}"));

// ---------- B. devLocked 副本不进手册 ----------
const allMissions = (GD.missions || []).filter(m => m?.kind === "dungeon");
const tenri = allMissions.find(m => m.id === "tenri_institute");
check("B", "真实 GameData.missions 含 5 个副本（含占位）", allMissions.length === 5 && !!tenri);
check("B", "占位副本带 devLocked / 未开发完成", tenri?.devLocked === true && tenri?.devHint === "未开发完成");
const listed = P.missions();
check("B", "手册只列 4 个可完成副本", listed.length === 4 && !listed.some(m => m.id === "tenri_institute"));
const st = state();
const explore = P.exploreList(st);
check("B", "探索目标 = 1 引导 + 4 副本", explore.length === 5 && !explore.some(m => m.id === "tenri_institute"));
check("B", "探索格子总数 21", P.overall(st).explore.total === 21);
const bosses = P.bossGroups(st), elites = P.eliteGroups(st);
const bossIds = bosses.flatMap(g => g.list.map(e => e.id));
const eliteIds = elites.flatMap(g => g.list.map(e => e.id));
check("B", "首领 8 名且无重名", bossIds.length === 8 && new Set(bossIds).size === 8);
check("B", "精英 12 名且无重名", eliteIds.length === 12 && new Set(eliteIds).size === 12);
check("B", "讨伐/精英分组不含占位副本", !bosses.some(g => g.id === "tenri_institute")
  && !elites.some(g => g.id === "tenri_institute"));
check("B", "魅魔分母仍为 34", P.overall(st).heroes.total === 34);
const battleState = state();
const added = P.recordBattle(battleState, [...bossIds, ...eliteIds], "normal");
check("B", "真实结算只按 4 副本记 20 条", added === 20 && battleState.butlerFeats.length === 20);

// ---------- C. 开发完成后自动接入（非写死排除） ----------
const flag = tenri.devLocked;
delete tenri.devLocked;
const opened = P.missions();
const openedExplore = P.exploreList(state());
const openedTotal = P.overall(state()).explore.total;
const openedBoss = P.bossGroups(state()).flatMap(g => g.list.map(e => e.id));
tenri.devLocked = flag;
check("C", "去掉 devLocked 后手册自动纳入第 5 个副本", opened.length === 5
  && opened.some(m => m.id === "tenri_institute"));
// 研究所怪物表目前只有 4 只普通怪（精英/首领待设计），纳入后首领数不虚增。
check("C", "纳入后探索格 26 / 首领仍 8（研究所暂无首领怪）", openedExplore.length === 6
  && openedTotal === 26 && openedBoss.length === 8
  && !openedBoss.some(id => String(id).startsWith("tenri_")));
check("C", "恢复 devLocked 后回到 4 副本 21 格", P.missions().length === 4
  && P.overall(state()).explore.total === 21);

// ---------- D. 解锁剧情仍可读取手册通关记录 ----------
const legacyState = state();
P.recordClear(legacyState, "ruins_sand_city", "adventure");
check("D", "老档通关记录可被解锁剧情采纳", T.clearedRuinsAdventure(legacyState, {}) === true);
check("D", "无记录时不误触发", T.clearedRuinsAdventure(state(), {}) === false);
check("D", "本次 run 通关仍可触发", T.clearedRuinsAdventure(state(),
  { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true }) === true);

// ---------- E. 静态接线与公告 ----------
check("E", "手册源码 ≤180 行", source("butler-manual-progress.js").split("\n").length <= 180);
check("E", "动态 getter 与 devLocked 守卫在位",
  has("butler-manual-progress.js", "get MAX_LEVEL()")
  && has("butler-manual-progress.js", "!m?.devLocked"));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/publish-bundles.json"), "utf8"));
check("E", "成长模块先于手册模块装配",
  manifest.startup.includes("character-progression.js")
  && manifest.hall.includes("butler-manual-progress.js"));
check("E", "公告写明管家手册接入口径",
  source("update-notice-recent.js").includes("【管家手册】接入新等级上限与副本占位"));
check("E", "QA 目录已登记本检查",
  fs.readFileSync(path.join(ROOT, "tools/qa-test-catalog.js"), "utf8")
    .includes("test-butler-manual-tenri-integration.js"));

const bad = results.filter(r => !r.ok);
if (REVERT) {
  const own = bad.filter(r => (EXPECT_GROUPS[REVERT] || []).includes(r.group));
  const other = bad.filter(r => !own.includes(r));
  const ok = own.length > 0 && other.length === 0;
  console.log(`REVERT=${REVERT} ${ok ? "OK" : "FAILED"} own=${own.length} other=${other.length} [${other.map(r => r.group + ":" + r.name).join(" | ")}]`);
  process.exit(ok ? 0 : 1);
}
console.log(`管家手册接入检查 通过 ${results.length - bad.length} / ${results.length}（A~E 五组）`);
bad.forEach(r => console.log(`  ❌ ${r.group} ${r.name}`));
process.exit(bad.length ? 1 : 0);
