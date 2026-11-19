// 2026-11-19 难度调整严格复查：
//   四档难度四项属性统一 +50%/+100%/+150%/+200%；所有副本莉莉丝元获得 -30%。
// 走真实源码（vm 载入配置 + 抓真实 rollGold 函数体执行），REVERT=stats|gold|notice|doc 反向验证。
const fs = require("fs");
const vm = require("vm");
const REVERT = process.env.REVERT || "";
const codeOf = f => fs.readFileSync(`./${f}`, "utf8");
function reverted(file, src) {
  if (REVERT === "stats" && file.endsWith("data-world.js")) {
    return src.replace(/hp: 150, power: 150, speed: 150/g, "hp: 140, power: 130, speed: 120")
      .replace(/hp: 200, power: 200, speed: 200/g, "hp: 180, power: 160, speed: 140");
  }
  if (REVERT === "gold" && file.endsWith("economy-config.js")) {
    return src.replace("normal: Object.freeze([63, 91])", "normal: Object.freeze([90, 130])")
      .replace("elite: 196", "elite: 280").replace("boss: 350", "boss: 500").replace("chest: 154", "chest: 220");
  }
  if (REVERT === "notice" && file.endsWith("update-notice-recent.js")) {
    return src.replace('title: "2026年11月19日 · 今日更新"', 'title: "2026年11月17日 · 今日更新"');
  }
  if (REVERT === "doc" && file.endsWith("01-完整项目.txt")) {
    return src.replace("所有副本节点的莉莉丝元获得统一减少 30%", "所有副本节点的莉莉丝元获得保持不变");
  }
  return src;
}
let pass = 0; const reds = [];
function T(name, cond, extra) {
  if (cond) pass++; else reds.push(name);
  if (!cond) console.log(`  ❌ ${name}${extra !== undefined ? "  ← " + JSON.stringify(extra).slice(0, 180) : ""}`);
}
const ctx = vm.createContext({ console });
ctx.window = ctx;
ctx.GameRandom = { int: (a) => a, chance: () => false, sample: (list) => list[0], persistentId: () => "x" };
const LOAD = [
  "economy-config.js", "data-future-dungeons.js", "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js", "data-ruins-sand-city-enemies.js",
  "data-ruins-sand-city.js",
];
for (const f of LOAD) vm.runInContext(reverted(`src/original/${f}`, codeOf(`src/original/${f}`)), ctx, { filename: f });
// 第四个副本的 mission 必须在 data-world.js 展开 missions 之前并入。
vm.runInContext("window.GameDataFutureDungeons.push(window.GameDataRuinsSandCity.mission)", ctx);
vm.runInContext(reverted("src/original/data-world.js", codeOf("src/original/data-world.js")), ctx, { filename: "data-world.js" });
ctx.GameData = ctx.GameDataWorld;
const W = ctx.GameDataWorld, E = ctx.GameEconomy, D = W.difficulties;
const TIERS = ["adventure", "warrior", "king", "hell"], TARGET = [150, 200, 250, 300];

console.log("=== A. 四档四项属性统一倍率 ===");
T("A1 普通级仍为 100 基础", [100, 100, 100].every(v => [D.normal.enemy.normal.hp, D.normal.enemy.normal.power, D.normal.enemy.normal.speed].includes(v)) && D.normal.enemy.normal.hp === 100, D.normal.enemy.normal);
TIERS.forEach((id, i) => {
  const d = D[id];
  ["normal", "elite", "boss"].forEach(kind => {
    const c = d.enemy[kind];
    T(`A2 ${d.name}/${kind} 三键均为 ${TARGET[i]}%`, c.hp === TARGET[i] && c.power === TARGET[i] && c.speed === TARGET[i], c);
  });
  T(`A3 ${d.name} 四属性真实缩放 = ×${TARGET[i] / 100}`, (() => {
    const e = { hp: 137, attack: 9, magic: 7, speed: 11, type: "normal" };
    const s = W.scaleEnemyStats(e, d, "normal");
    return s.hp === Math.ceil(137 * TARGET[i] / 100) && s.attack === Math.round(9 * TARGET[i] / 100)
      && s.magic === Math.round(7 * TARGET[i] / 100) && s.speed === Math.round(11 * TARGET[i] / 100);
  })(), d.enemy.normal);
  T(`A4 ${d.name} attrText 三项 = ${TARGET[i]}%`,
    new RegExp(`生命${TARGET[i]}%/输出${TARGET[i]}%/速度${TARGET[i]}%`).test(d.attrText), d.attrText);
  T(`A5 ${d.name} 奖励/经验/精英/掉落未改`,
    JSON.stringify([d.reward, d.xp, d.eliteRate, d.dropRate]) === JSON.stringify([[135, 115, 30, 40], [175, 135, 40, 50], [220, 160, 50, 60], [275, 190, 60, 70]][i]), [d.reward, d.xp, d.eliteRate, d.dropRate]);
});
T("A6 英雄级 enemyRelics 保留", D.hell.enemyRelics === true, D.hell.enemyRelics);

console.log("=== B. 所有副本莉莉丝元 -30% ===");
const OLD_GOLD = { normal: [90, 130], elite: 280, boss: 500, chest: 220 };
const NEW_GOLD = { normal: [63, 91], elite: 196, boss: 350, chest: 154 };
T("B1 基础值恰为原值 ×70% 且全整数",
  JSON.stringify(E.dungeonGold) === JSON.stringify(NEW_GOLD)
  && Object.values(NEW_GOLD).flat().every(v => Number.isInteger(v))
  && NEW_GOLD.normal.every((v, i) => Math.abs(v - OLD_GOLD.normal[i] * 0.7) < 1e-9)
  && Math.abs(NEW_GOLD.elite - OLD_GOLD.elite * 0.7) < 1e-9 && Math.abs(NEW_GOLD.boss - OLD_GOLD.boss * 0.7) < 1e-9
  && Math.abs(NEW_GOLD.chest - OLD_GOLD.chest * 0.7) < 1e-9, E.dungeonGold);
// 抓真实 rollGold 函数体（客户端节点结算 / 本地核心结算）执行，不是自写等价式。
vm.runInContext(reverted("src/original/dungeon-reward-core.js", codeOf("src/original/dungeon-reward-core.js")), ctx, { filename: "dungeon-reward-core.js" });
const coreSrc = codeOf("src/original/local-core-dungeon.js");
const fnSrc = coreSrc.match(/  function rollGold\(core, run, kind\) \{[\s\S]*?\n  \}/);
T("B2 本地核心 rollGold 函数体可定位", !!fnSrc, fnSrc && fnSrc[0].slice(0, 80));
const coreRoll = fnSrc ? vm.runInContext(`const economy = window.GameEconomy;\n${fnSrc[0]}\nrollGold`, ctx) : null;
T("B3 两处结算都直接读 dungeonGold 基础值（无旁路倍率）",
  /const reward = window\.GameEconomy\.dungeonGold/.test(codeOf("src/original/dungeon-reward-core.js"))
  && /economy\.dungeonGold\[kind\]/.test(coreSrc)
  && !/\*\s*0\.7/.test(coreSrc), "rollGold sources");
const missions = W.missions.filter(m => m.kind === "dungeon");
T("B4 覆盖全部副本", missions.length >= 4, missions.map(m => m.id));
let checked = 0, bad = [];
for (const m of missions) for (const id of Object.keys(D)) for (const kind of ["normal", "elite", "boss", "chest"]) {
  const run = { difficultyId: id, missionId: m.id };
  const now = ctx.DungeonRewardCore.rollGold(run, kind, {});
  // 期望按「新基础值（= 旧基础值 ×70%，B1 已锁）」走同一条结算公式；
  // 用 oldRaw*0.7 会在 962.5 这类 .5 边界因浮点表示差 1，不能当判据。
  const newBase = Array.isArray(NEW_GOLD[kind]) ? NEW_GOLD[kind][0] : NEW_GOLD[kind];
  const expect = Math.round(newBase * ((D[id].reward || 100) / 100) * ((m.reward?.goldMultiplier || 100) / 100));
  const coreNow = coreRoll && coreRoll({}, run, kind);
  checked++;
  if (now !== expect || (coreNow !== undefined && coreNow !== expect)) bad.push({ m: m.id, id, kind, now, coreNow, expect });
}
T(`B5 ${checked} 组（副本×难度×节点）两处结算恰为旧值 ×70%`, bad.length === 0, bad.slice(0, 4));
T("B6 难度金币倍率与副本金币倍率未改",
  JSON.stringify(Object.values(D).map(d => d.reward)) === JSON.stringify([100, 135, 175, 220, 275])
  && JSON.stringify(missions.map(m => m.reward?.goldMultiplier)) === JSON.stringify([100, 125, 170, 230]), missions.map(m => m.reward?.goldMultiplier));

console.log("=== C/D. 公告、界面与文档 ===");
const notice = codeOf("src/original/update-notice.js"), recent = reverted("src/original/update-notice-recent.js", codeOf("src/original/update-notice-recent.js"));
const doc = reverted("docs/01-完整项目.txt", codeOf("docs/01-完整项目.txt"));
T("C1 日期三处为 2026-11-19", /iso: "2026-11-19"/.test(notice) && /label: "2026年11月19日"/.test(notice) && /badge: "2026\.11\.19"/.test(notice));
T("C2 首期标题为 11月19日", recent.includes('title: "2026年11月19日 · 今日更新"'));
T("C3 新一期写明四档 +50%/+100%/+150%/+200%", recent.includes("+50% / +100% / +150% / +200%"));
T("C4 新一期写明所有副本金币 -30%", recent.includes("统一下调 30%") && recent.includes("逐副本、逐难度、逐节点"));
// 公告摘要已重写为只讲当前生效口径，「统一下调」措辞收敛为「下调」；-30% 语义不变。
T("C5 summary 同步两项", notice.includes("+50% / +100% / +150% / +200%") && notice.includes("下调 30%"));
T("C6 recent 未超 150 行归档线", recent.split("\n").length <= 150, recent.split("\n").length);
T("C7 难度卡仍显示难度金币倍率", /莉莉丝元 ×\$\{d\.reward\}/.test(codeOf("src/original/villa-team.js")));
T("D1 文档难度表改为 1.5/2.0/2.5/3.0", ["1.5", "2.0", "2.5", "3.0"].every(v => doc.includes(`| ${v} |`)), doc.slice(doc.indexOf("| adventure"), doc.indexOf("| adventure") + 480));
T("D2 文档写明副本金币减少 30%", doc.includes("所有副本节点的莉莉丝元获得统一减少 30%"));

console.log(`\n通过 ${pass} / ${pass + reds.length}${reds.length ? `  红项: ${reds.join(",")}` : ""}`);
if (REVERT) console.log(`REVERT=${REVERT} REDS=${reds.length} ${JSON.stringify(reds)}`);
if (reds.length && !REVERT) process.exit(1);
