// 天日国鹰7研究所骨架严格检查：副本定义 / 节点 / 入口占位 / 解锁剧情 / 数值口径。
// REVERT=<组> 时把对应源码守卫撤掉并重载，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => fs.readFileSync(path.join(dir, name), "utf8");
const REPL = {
  devlock: ["data-tenri-institute.js", "    devLocked: true,", "    "],
  layers: ["data-tenri-institute.js", "layers: 14, rest: [13]", "layers: 15, rest: [13]"],
  guard: ["hall-party-actions.js", "  if (m.devLocked) return log(m.devHint || \"未开发完成\"), render();", "  "],
  exp: ["character-progression.js", "tenri_institute: 5", "tenri_institute: 1"],
  maxlevel: ["character-progression.js", "const maxLevel = 25;", "const maxLevel = 20;"],
  enhance: ["character-enhance.js", "const MAX_LEVEL = 70;", "const MAX_LEVEL = 50;"],
  lines: ["tenri-institute-unlock-events.js", "    [\"橘千樱\", \"算了，我也去做好明天出发的准备\"],", "    "],
  unlock: ["local-core-events.js", "setFlag(\"tenriInstituteUnlocked\");", ""],
};
const EXPECT_GROUPS = {
  devlock: ["A"], layers: ["A", "C"], guard: ["D"], exp: ["G"],
  maxlevel: ["G"], enhance: ["G"], lines: ["E"], unlock: ["F"],
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
  int: min => min, chance: () => false, value: () => 0.5, persistentId: () => "test",
};
window.ButlerManualProgress = { has: () => false };
[
  "economy-config.js", "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js",
  "data-tenri-institute-enemies.js", "data-tenri-institute.js",
  "data-future-dungeons.js", "character-progression.js", "character-enhance.js",
  "unlock-event-progress.js", "dungeon-map.js", "tenri-institute-unlock-events.js",
].forEach(load);
window.GameDataFutureEnemies = {};
load("data-world.js");
// 真实运行由 data.js 聚合；本检查只涉及 missions / enemies / difficulties，取 world 部分即可。
window.GameData = { ...window.GameDataWorld };

const results = [];
const check = (group, name, ok) => results.push({ group, name, ok: !!ok });
const has = (name, text) => source(name).includes(text);
const T = window.GameDataTenriInstitute, m = T.mission, P = window.CharacterProgression;

// A 副本定义
check("A", "id / 名称 / kind", m.id === "tenri_institute" && m.name === "天日国鹰7研究所" && m.kind === "dungeon");
check("A", "requiresFlag 与 lockedHint", m.requiresFlag === "tenriInstituteUnlocked" && m.lockedHint.includes("废墟沙城"));
check("A", "devLocked + devHint 占位", m.devLocked === true && m.devHint === "未开发完成");
check("A", "subtitle 含研究所与橘千樱", m.subtitle.includes("秘密研究所") && m.subtitle.includes("橘千樱"));
check("A", "bgm 已配置（研究所专属无缝循环曲）", typeof m.bgm === "string"
  && /\.(ogg|mp3)$/.test(m.bgm)
  && m.bgm.includes("tenri-institute-battle"));
check("A", "reward 按废墟沙城", m.reward.gold === 0 && m.reward.goldMultiplier === 230);
check("A", "route 14 层 / 固定节点", m.route.type === "fixed-random" && m.route.layers === 14
  && m.route.rest[0] === 13 && m.route.chest[0] === 7 && m.route.boss[0] === 14);
check("A", "lore 背景两句", T.lore.length === 2 && T.lore[0].includes("无人小岛"));

// B 聚合与怪物池复用
const all = window.GameData.missions.filter(x => x.id === m.id);
check("B", "聚合进 GameData.missions 且唯一", all.length === 1 && all[0] === m);
check("B", "GameDataFutureDungeons 条件展开", window.GameDataFutureDungeons.includes(m));
check("B", "敌人池已挂载且非空", Array.isArray(window.GameData.enemies[m.id]) && window.GameData.enemies[m.id].length > 0);
check("B", "敌人池为 4 只研究所专属普通怪", window.GameData.enemies[m.id].length === 4
  && window.GameData.enemies[m.id].every(e => String(e.id).startsWith("tenri_")));
check("B", "精英/首领待设计：池内仅普通怪", window.GameData.enemies[m.id].every(e => e.type === "normal"));
check("B", "解锁前置判定", T.unlockCastReady({ chars: [{ id: "preshi", locked: false }, { id: "mieryula", locked: false }] })
  && !T.unlockCastReady({ chars: [{ id: "preshi", locked: false }] }));

// C 真实路线生成
const state = { party: [], log: [], unlockedDifficulties: ["normal"] };
const layers = window.DungeonMap.buildLayers(m, window.GameData.difficulties.normal, state);
window.DungeonMap.connect(layers, state);
const flat = layers.flat(), ids = new Set(flat.map(n => n.id));
check("C", "生成 14 层", layers.length === 14);
check("C", "起点唯一", layers[0].length === 1 && layers[0][0].type === "start" && flat.filter(n => n.type === "start").length === 1);
check("C", "BOSS 唯一且在第 14 层", flat.filter(n => n.type === "boss").length === 1 && flat.find(n => n.type === "boss")?.layer === 14);
check("C", "第 7 层宝箱 / 第 13 层休整", layers[6][0].type === "chest" && layers[12][0].type === "rest");
check("C", "next 无悬空引用", flat.every(n => (n.next || []).every(id => ids.has(id))));

// D 入口占位守卫（四处静态接线 + 真实 devLocked）
check("D", "大厅面板置灰", has("villa-team.js", "mission.devLocked"));
check("D", "客户端出征守卫", has("hall-party-actions.js", "if (m.devLocked) return log(m.devHint || \"未开发完成\"), render();"));
check("D", "本地核心守卫", has("local-core-dungeon.js", "if (mission.devLocked) return outcomes.rejected;"));
check("D", "悬赏生成排除", has("bounty-task-generator.js", "!mission.devLocked"));
check("D", "面板显示未开发完成", has("villa-team.js", "mission.devHint || \"未开发完成\""));
check("D", "提示文本一致", source("data-tenri-institute.js").includes("未开发完成"));

// E 剧情与解锁触发
const E = window.TenriInstituteUnlockEvents;
check("E", "台词 9 句", E.LINES.length === 9);
check("E", "说话人只有橘千樱与罗卡尔", E.LINES.every(([who, text]) => ["橘千樱", "罗卡尔"].includes(who) && text.length > 0));
check("E", "关键线索齐全", ["内鬼", "艾尔拉娜", "安洁莉卡", "魔后", "不能说的计划"].every(k => E.LINES.some(([, t]) => t.includes(k))));
const base = () => ({ view: "hall", flags: {}, chars: [{ id: "preshi", locked: false }, { id: "mieryula", locked: false }, { id: "chiyo", locked: false }, { id: "lokar", locked: false }] });
const run = { missionId: "ruins_sand_city", difficultyId: "adventure", complete: true };
check("E", "前置角色未解锁不触发", !window.triggerTenriInstituteUnlockEvent({ ...base(), chars: [{ id: "preshi", locked: false }] }, run));
const s1 = base();
check("E", "满足条件写 pending + modal", window.triggerTenriInstituteUnlockEvent(s1, run) === true
  && s1.flags.tenriInstituteUnlockPending === true && s1.hallModal === E.MODAL);
const s2 = base(); s2.flags.tenriInstituteUnlockPending = true;
check("E", "triggerPending 回大厅补弹窗", E.triggerPending(s2) === true && s2.hallModal === E.MODAL
  && !E.triggerPending({ ...s2, view: "dungeon" }));

// F 事件白名单与四处接线
check("F", "UnlockEventProgress.ids 已注册", window.UnlockEventProgress.ids.includes(E.EVENT_ID));
check("F", "LocalCoreEventOps 完成分支", has("local-core-events.js", "setFlag(\"tenriInstituteUnlocked\")"));
check("F", "villa modal 映射", has("villa.js", "tenriInstituteUnlock"));
check("F", "完成按钮绑定", has("app-hall-bindings.js", "data-tenri-institute-unlock-complete"));
check("F", "modal 关闭动作映射", has("app-modal-actions.js", "tenriInstituteUnlock"));
check("F", "通关结算挂点", has("dungeon-run-rewards.js", "triggerTenriInstituteUnlockEvent"));
check("F", "triggerAll 补挂点", has("hall-unlock-events.js", "TenriInstituteUnlockEvents?.triggerPending"));

// G 数值口径
check("G", "等级上限 25", P.maxLevel === 25 && P.expToNext.length === 25);
check("G", "成长提高 30%", P.growthScale === 1.3);
const tpl = { id: "lokar", stats: { maxHp: 124, attack: 10, magic: 5, speed: 11 } };
const at25 = P.statsAt(tpl, 25), at0 = P.statsAt(tpl, 0);
check("G", "25 级成长按 1.3 倍取整", ["maxHp", "attack", "magic", "speed"].every(k =>
  at25[k] === Math.round(at0[k] + P.growth.lokar[k] * 1.3)));
check("G", "本副本经验 5 倍", P.dungeonExpMultiplier[m.id] === 5);
check("G", "强化上限 70", window.CharacterEnhance.MAX_LEVEL === 70);
check("G", "金币倍率按废墟沙城", window.GameEconomy.missionRewards[m.id].goldMultiplier === 230);
check("G", "Bundle 清单已登记", ["tools/publish-bundles.json"].every(f =>
  fs.readFileSync(path.join(root, f), "utf8").includes("tenri-institute")));

const bad = results.filter(r => !r.ok);
const groups = [...new Set(results.map(r => r.group))];
if (REVERT) {
  const own = bad.filter(r => (EXPECT_GROUPS[REVERT] || []).includes(r.group));
  const other = bad.filter(r => !own.includes(r));
  const ok = own.length > 0 && other.length === 0;
  console.log(`REVERT=${REVERT} ${ok ? "OK" : "FAILED"} own=${own.length} other=${other.length} [${other.map(r => r.group + ":" + r.name).join(" | ")}]`);
  process.exit(ok ? 0 : 1);
}
console.log(`天日国鹰7研究所骨架检查 通过 ${results.length - bad.length} / ${results.length}（${groups.length} 组）`);
bad.forEach(r => console.log(`  ❌ ${r.group} ${r.name}`));
process.exit(bad.length ? 1 : 0);
