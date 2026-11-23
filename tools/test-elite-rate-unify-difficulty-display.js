// 256 版：所有副本冒险级以上精英率统一普通级 + 删除难度选择上的精英出现率显示。
// 覆盖：难度表 / 真实路线掷点 / 面板渲染 DOM / bundle 源镜像 / 公告 / 夹具同步。
// REVERT=<组> 时撤掉对应源码改动，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => fs.readFileSync(path.join(dir, name), "utf8");
const REPL = {
  rate: ["data-world.js", "eliteRate: 20, reward: 135", "eliteRate: 30, reward: 135"],
  display: ["villa-team.js",
    "<p>怪物属性 ${d.attrText}</p><p>莉莉丝元",
    "<p>怪物属性 ${d.attrText}</p><p>精英出现率 ${Math.round((d.eliteRate || 0) * 100)}%</p><p>莉莉丝元"],
  drop: ["villa-team.js",
    "<p>卡牌/饰品 ${Math.round(d.dropRate)}%</p>",
    "<p>卡牌/饰品 ${Math.round(d.dropRate * 100)}%</p>"],
  notice: ["update-notice-recent.js",
    "精英怪出现概率统一：所有副本的冒险级",
    "精英怪出现概率已回退：所有副本的冒险级"],
};
const EXPECT_GROUPS = {
  rate: ["A", "B"], display: ["C", "D"], drop: ["C", "D"], notice: ["E"],
};
const source = name => {
  const text = raw(name);
  if (!REVERT || !REPL[REVERT] || REPL[REVERT][0] !== name) return text;
  const [, from, to] = REPL[REVERT];
  if (!text.includes(from)) throw new Error(`REVERT=${REVERT} 目标未命中：${from}`);
  return text.replace(from, to);
};
const load = name => vm.runInThisContext(source(name), { filename: name });

const results = [];
const check = (group, name, ok) => results.push({ group, name, ok: !!ok });

// ---------- A 难度表 ----------
const world = source("data-world.js");
const rateLines = [...world.matchAll(/^\s*(\w+): \{ name: "([^"]+)".*?eliteRate: (\d+),/gm)]
  .map(m => ({ id: m[1], name: m[2], rate: +m[3] }));
check("A", "五档难度全部解析到", rateLines.length === 5, JSON.stringify(rateLines.map(x => x.id)));
check("A", "五档精英率全为普通级 20", rateLines.every(x => x.rate === 20), JSON.stringify(rateLines));
check("A", "普通级保持 20", rateLines.find(x => x.id === "normal")?.rate === 20);
check("A", "冒险/勇士/王者/英雄四档均为 20", ["adventure", "warrior", "king", "hell"]
  .every(id => rateLines.find(x => x.id === id)?.rate === 20));
const EXPECT_OTHER = {
  normal: [100, 100, 20], adventure: [135, 115, 40], warrior: [175, 135, 50],
  king: [220, 160, 60], hell: [275, 190, 70],
};
for (const [id, exp] of Object.entries(EXPECT_OTHER)) {
  const line = world.split("\n").find(l => l.includes(`${id}: { name:`)) || "";
  const got = ["reward: ", "xp: ", "dropRate: "].map(k => {
    const m = line.match(new RegExp(k + "(\\d+)")); return m ? +m[1] : NaN;
  });
  check("A", `${id} 奖励/经验/掉落率未被误改`, JSON.stringify(got) === JSON.stringify(exp), JSON.stringify(got));
}
check("A", "难度属性倍率与解锁链未被误改", ["150%", "200%", "250%", "300%", "unlock: \"normal\"", "unlock: \"king\"", "enemyRelics: true"].every(t => world.includes(t)));
check("A", "源码注释写明统一口径", world.includes("所有副本、所有难度统一为普通级 20%"));

// ---------- B 真实路线生成：各难度掷点概率一致 ----------
global.window = global;
let chanceCalls = [];
window.GameRandom = {
  sample: list => (Array.isArray(list) ? list[0] : list),
  int: min => min,
  chance: (p) => { chanceCalls.push(p); return chanceCalls.length % 2 === 0; },
  value: () => 0.5, persistentId: () => "test",
};
window.ButlerManualProgress = { has: () => false };
[
  "economy-config.js", "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js", "data-tenri-institute.js",
  "data-future-dungeons.js", "character-progression.js", "character-enhance.js",
  "unlock-event-progress.js", "tenri-institute-unlock-events.js",
].forEach(load);
window.GameDataFutureEnemies = {};
load("data-world.js");
load("dungeon-map.js");
window.GameData = { ...window.GameDataWorld };
const D = window.GameDataWorld.difficulties;
const missions = window.GameData.missions.filter(m => m.kind === "dungeon");
check("B", "副本数量 5（含未开发占位）", missions.length === 5, JSON.stringify(missions.map(m => m.id)));
const routeCases = [
  { label: "fixed-random", mission: { route: { type: "fixed-random", layers: 10, rest: [9], chest: [8], boss: [10] } } },
  { label: "linear", mission: { route: { type: "linear", layers: 15, rest: [14], chest: [8], boss: [15] } } },
  { label: "default", mission: {} },
];
const eliteCounts = {};
for (const [id, diff] of Object.entries(D)) {
  eliteCounts[id] = {};
  for (const rc of routeCases) {
    chanceCalls = [];
    const layers = window.DungeonMap.buildLayers(rc.mission, diff, { party: [], log: [], flags: {} });
    const elites = layers.flat().filter(n => n.type === "elite").length;
    eliteCounts[id][rc.label] = elites;
    check("B", `${id}/${rc.label} 掷点概率恒为 0.2`,
      chanceCalls.length > 0 && chanceCalls.every(p => Math.abs(p - 0.2) < 1e-9),
      `calls=${chanceCalls.length} p=${[...new Set(chanceCalls)].join(",")}`);
  }
}
for (const rc of routeCases) {
  const vals = Object.keys(D).map(id => eliteCounts[id][rc.label]);
  check("B", `${rc.label} 五档难度精英节点数完全一致`, new Set(vals).size === 1, JSON.stringify(vals));
}
check("B", "dungeon-map 仍按 /100 折算整数百分比", raw("dungeon-map.js").includes("(diff.eliteRate ?? 0) / 100"));

// ---------- C 面板渲染：真实 VillaTeamUI.team ----------
window.UICommon = { esc: s => String(s == null ? "" : s), skillSummary: () => "" };
window.SkinSystem = { applyToChar: (_s, c) => c };
window.DungeonUnlocks = { has: () => true };
window.Onboarding = { active: () => false };
load("villa-team.js");
const st = { chars: [], party: [], flags: {}, sortieStarting: false };
const html = window.VillaTeamUI.team(st);
const cards = html.match(/class="card difficulty-card/g) || [];
check("C", "5 副本 × 5 难度 = 25 张卡片", cards.length === missions.length * 5, `cards=${cards.length}`);
check("C", "面板不再出现「精英出现率」", !html.includes("精英出现率"), html.includes("精英出现率") ? "仍有" : "0 处");
check("C", "面板不再出现 2000% 误显示", !html.includes("2000%"));
check("C", "五档属性/金币/掉落率文案齐全",
  ["普通级", "冒险级", "勇士级", "王者级", "英雄级", "怪物属性", "莉莉丝元 ×100", "莉莉丝元 ×275",
    "卡牌/饰品 20%", "卡牌/饰品 70%"].every(t => html.includes(t)));
check("C", "未开发副本仍显示「未开发完成」", html.includes("未开发完成"));
check("C", "villa-team 模板源码无精英率显示", !source("villa-team.js").includes("<p>精英出现率"));
check("C", "villa-team 模板源码不再 ×100", !source("villa-team.js").includes("d.dropRate * 100"));

// ---------- D bundle 镜像 / 公告 ----------
const hallMap = path.join(root, "publish", "bundles", "hall.min.js.map");
let mapHit = false, mapClean = false;
if (fs.existsSync(hallMap)) {
  const j = JSON.parse(fs.readFileSync(hallMap, "utf8"));
  const i = (j.sources || []).findIndex(s => String(s).includes("villa-team.js"));
  if (i >= 0 && Array.isArray(j.sourcesContent)) {
    const c = String(j.sourcesContent[i] || "");
    mapHit = c.includes("difficulty-card");
    mapClean = !c.includes("<p>精英出现率") && !c.includes("d.dropRate * 100");
  }
}
check("D", "hall.min.js.map 含 villa-team 源码", mapHit);
check("D", "bundle 源镜像同步删除精英显示与 ×100", mapClean);
const hallJs = fs.readFileSync(path.join(root, "publish", "bundles", "hall.min.js"), "utf8");
check("D", "hall bundle 含本期新公告条目", hallJs.includes("精英怪出现概率统一"));
check("D", "hall bundle 不含精英率模板片段", !hallJs.includes("精英出现率 ${") && !hallJs.includes("精英出现率 \"+"));

// ---------- E 公告 ----------
const recent = source("update-notice-recent.js");
check("E", "首期新增本期条目", recent.includes("精英怪出现概率统一：所有副本的冒险级"));
check("E", "条目写明四档统一 20% 与普通级不变", recent.includes("一律与普通级相同（20%）") && recent.includes("普通级本身不变"));
check("E", "条目写明其它数值不变", recent.includes("经验、莉莉丝元收益、卡牌/饰品掉落率与难度解锁链全部保持不变"));
check("E", "公告行数未超 150 归档线", recent.split("\n").length <= 150, `lines=${recent.split("\n").length}`);
check("E", "历史条目按既有口径保留原文", recent.includes("经验、精英出现率、卡牌/饰品掉落率与难度解锁链均不改动"));

// ---------- F 夹具同步 ----------
const scan = f => fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), "utf8") : "";
const tools = ["tools/test-difficulty-attr-boost.js", "tools/test-difficulty-gold-cut.js",
  "tools/check-dungeon-routes.js", "tools/test-ruins-sand-city-layout.js"].map(scan).join("\n");
check("F", "旧精英率基线 30/40/50/60 已从夹具清除",
  !/eliteRate:\s*(30|40|50|60)\b/.test(tools) && !/\[135, 115, 30, 40\]/.test(tools));
check("F", "attr-boost 已改为 20 基线", scan("tools/test-difficulty-attr-boost.js").includes("eliteRate: 20, reward: 135"));
check("F", "gold-cut 已改为 20 基线", scan("tools/test-difficulty-gold-cut.js").includes("[135, 115, 20, 40]"));

const bad = results.filter(r => !r.ok);
if (REVERT) {
  const own = bad.filter(r => (EXPECT_GROUPS[REVERT] || []).includes(r.group));
  const other = bad.filter(r => !own.includes(r));
  const ok = own.length > 0 && other.length === 0;
  console.log(`REVERT=${REVERT} ${ok ? "OK" : "FAILED"} own=${own.length} other=${other.length} [${other.map(r => r.group + ":" + r.name).join(" | ")}]`);
  process.exit(ok ? 0 : 1);
}
console.log(`精英率统一与难度显示删除 检查 通过 ${results.length - bad.length} / ${results.length}（${new Set(results.map(r => r.group)).size} 组）`);
bad.forEach(r => console.log(`  ❌ [${r.group}] ${r.name}`));
process.exit(bad.length ? 1 : 0);
