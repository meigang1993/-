// 研究所 4 只普通怪「两个摸牌属性」修正的独立严格检查。
// 根因：用户稿写「每回合摸牌 基础2 + N / 初始摸牌 基础4 + N」，
// 而 drawPerTurn / initialDraw 字段在引擎里存的是**加成值 N**：
//   battle-runtime-helpers.js: 2 + stats.drawPerTurn / 4 + stats.initialDraw
//   ui-common.js 的 baseValue 同样给 2 / 4
// 此前把实摸总量写进字段 → 每回合 / 开局各多摸 2 / 4 张。
// 本脚本从产品源码抽行执行真实公式（不复刻断言），逐只校验实摸回到用户稿总量。
// REVERT=<组> 改真实源码后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => fs.readFileSync(path.join(SRC, name), "utf8");
const rel = p => fs.readFileSync(path.join(ROOT, p), "utf8");

const REPL = {
  data: ["data-tenri-institute-enemies.js", "drawPerTurn: 1, initialDraw: 1", "drawPerTurn: 3, initialDraw: 5"],
  formula: ["battle-runtime-helpers.js", "const turnDrawCount = unit => Math.max(0, 2 + (unit.stats.drawPerTurn || 0));",
    "const turnDrawCount = unit => Math.max(0, (unit.stats.drawPerTurn || 0));"],
  ui: ["ui-common.js", 'key === "drawPerTurn" ? 2 : 0;', 'key === "drawPerTurn" ? 0 : 0;'],
  notice: ["update-notice-recent.js", "4 只普通怪的两个摸牌属性修正", "占位"],
};
const EXPECT = { data: ["A", "B", "C"], formula: ["B"], ui: ["C"], notice: ["D"] };

const patched = name => {
  let s = raw(name);
  const r = REPL[REVERT];
  if (r && r[0] === name) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 70)}`);
    s = s.replace(r[1], r[2], 1);
  }
  return s;
};

const results = [];
const check = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });

// ---------- 真实公式抽行 ----------
const runtime = patched("battle-runtime-helpers.js");
function extractArrow(source, name) {
  const line = source.split("\n").find(l => l.includes(`const ${name} = unit =>`));
  if (!line) return null;
  const expr = line.trim().replace(/^const \w+ = /, "").replace(/;\s*$/, "");
  return vm.runInThisContext(`(${expr})`, { filename: name });
}
const turnDrawCount = extractArrow(runtime, "turnDrawCount");
const initialDrawCount = extractArrow(runtime, "initialDrawCount");

const ui = patched("ui-common.js");
const baseBody = (ui.match(/const baseValue = key =>[\s\S]*?;/)?.[0] || "")
  .replace(/^const baseValue = /, "").replace(/;\s*$/, "");
const baseValue = baseBody ? vm.runInThisContext(`(${baseBody})`, { filename: "baseValue" }) : null;

// ---------- 数据表 ----------
global.window = global;
vm.runInThisContext(patched("data-tenri-institute-enemies.js"), { filename: "data-tenri-institute-enemies.js" });
const ALL = window.GameDataTenriInstituteEnemies || [];
// 4 只普通怪的加成值表；第 5 只精英【魔王军枪炮师杰明】另有专项检查。
const POOL = ALL.filter(e => e?.type === "normal");
const byId = Object.fromEntries(ALL.map(e => [e.id, e]));

// 用户稿：id -> [每回合摸牌 N, 初始摸牌 N, 实摸每回合, 实摸开局]
const SPEC = {
  tenri_assault: [1, 1, 3, 5],
  tenri_guard: [2, 3, 4, 7],
  tenri_railgun: [3, 2, 5, 6],
  tenri_ghoul: [1, 1, 3, 5],
};

// A 字段口径
check("A", "A1 恰好 4 只普通怪 + 1 精英且 id 齐全",
  POOL.length === 4 && Object.keys(SPEC).every(id => !!byId[id])
  && ALL.length === 5 && byId.tenri_jamin?.type === "elite"
  && byId.tenri_jamin?.drawPerTurn === 2 && byId.tenri_jamin?.initialDraw === 1);
for (const [id, [nTurn, nInitial]] of Object.entries(SPEC)) {
  const e = byId[id];
  check("A", `A2 ${id} 字段存加成值 N = ${nTurn}/${nInitial}`,
    e?.drawPerTurn === nTurn && e?.initialDraw === nInitial,
    `got=${e?.drawPerTurn}/${e?.initialDraw}`);
}
check("A", "A3 数据表注释明确「加成值 N」而非绝对值",
  /加成值 N/.test(patched("data-tenri-institute-enemies.js"))
  && /2 \+ drawPerTurn/.test(patched("data-tenri-institute-enemies.js")));
check("A", "A4 八项基础属性其余六项未被误改", [
  ["tenri_assault", 260, 43, 35, 48, 2, 4],
  ["tenri_guard", 300, 36, 34, 43, 1, 4],
  ["tenri_railgun", 220, 44, 40, 50, 2, 3],
  ["tenri_ghoul", 200, 50, 47, 53, 2, 3],
].every(([id, hp, atk, mag, spd, bl, hl]) => {
  const e = byId[id];
  return e && [e.hp, e.attack, e.magic, e.speed, e.bloodlust, e.handLimit]
    .join() === [hp, atk, mag, spd, bl, hl].join();
}));

// B 真实公式 → 实摸总量
check("B", "B1 两条公式与 UI baseValue 均成功从产品源码抽行",
  !!turnDrawCount && !!initialDrawCount && !!baseValue);
for (const [id, [, , turn, initial]] of Object.entries(SPEC)) {
  const e = byId[id];
  if (!e) continue;
  const unit = { stats: { drawPerTurn: e.drawPerTurn, initialDraw: e.initialDraw } };
  check("B", `B2 ${id} 每回合实摸 ${turn}（2+${e.drawPerTurn}）`,
    turnDrawCount?.(unit) === turn, `got=${turnDrawCount?.(unit)}`);
  check("B", `B3 ${id} 开局实摸 ${initial}（4+${e.initialDraw}）`,
    initialDrawCount?.(unit) === initial, `got=${initialDrawCount?.(unit)}`);
}
check("B", "B4 修复前的总量写法确实会多摸（反向事实核对）", (() => {
  const old = { stats: { drawPerTurn: 3, initialDraw: 5 } };
  return turnDrawCount?.(old) === 5 && initialDrawCount?.(old) === 9;
})(), "旧值 3/5 → 实摸 5/9");

// C UI 面板口径
check("C", "C1 ui-common baseValue 对两个字段给 2 / 4",
  baseValue?.("drawPerTurn") === 2 && baseValue?.("initialDraw") === 4,
  `got=${baseValue?.("drawPerTurn")}/${baseValue?.("initialDraw")}`);
check("C", "C2 statValue 用 baseValue + stats 字段（面板与引擎同源）",
  /baseValue\(key\)/.test(ui) && /unit\.stats\?\.\[key\]/.test(ui));
check("C", "C3 UI 显示值等于实摸总量", Object.entries(SPEC).every(([id, [, , turn, initial]]) => {
  const e = byId[id];
  return baseValue?.("drawPerTurn") + (e?.drawPerTurn || 0) === turn
    && baseValue?.("initialDraw") + (e?.initialDraw || 0) === initial;
}));

// D 文档 / 公告同步
const doc05 = rel("docs/05-怪物与怪物技能与饰品.txt");
const doc12 = rel("docs/12-新副本素材-废墟沙城.txt");
const ref = rel("docs/reference/天日国鹰7研究所怪物设计.md");
const notice = patched("update-notice-recent.js");
check("D", "D1 docs/05 与 docs/12 写明加成值口径并标注实摸总量",
  [doc05, doc12].every(s => s.includes("加成值") && s.includes("2+1") && s.includes("4+3")
    && s.includes("2+3") && s.includes("4+2")));
check("D", "D2 docs/reference 快照改为加成值口径（不再写「按字面折算为绝对值」）",
  /加成值/.test(ref) && !/按字面折算为绝对值/.test(ref));
check("D", "D3 当期公告写明两列摸牌属性修正与实摸总量",
  /两个摸牌属性修正/.test(notice) && /3\/5、4\/7、5\/6、3\/5/.test(notice));
const noticeLines = notice.replace(/\n$/, "").split("\n").length;
check("D", "D4 公告未增行（仍 149 行，未超 150 归档线）",
  noticeLines === 149, `lines=${noticeLines}`);
check("D", "D5 严格检查期望值已同步为加成值",
  /tenri_assault: \[260, 43, 35, 48, 2, 4, 1, 1\]/.test(rel("tools/test-tenri-normal-enemies-strict.js"))
  && /tenri_guard: \[300, 36, 34, 43, 1, 4, 2, 3\]/.test(rel("tools/test-tenri-normal-enemies-strict.js")));

if (REVERT) {
  const want = EXPECT[REVERT] || [];
  const failed = results.filter(r => !r.ok);
  const own = failed.filter(r => want.includes(r.g)).length;
  const other = failed.filter(r => !want.includes(r.g)).length;
  console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
  failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n} ${r.d}`));
  process.exit(own > 0 && other === 0 ? 0 : 1);
}
results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
const failed = results.filter(r => !r.ok).length;
console.log(`RESULT ${results.length - failed}/${results.length} · 反向组 ${Object.keys(REPL).join("/")}`);
process.exit(failed ? 1 : 0);
