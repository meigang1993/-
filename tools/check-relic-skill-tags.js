// 全库饰品「标签 + 图标」一致性护栏（以后新增饰品/技能自动拦下）。
//
// 口径（与 relics.js 的 skillsForNames / skillIcon 单一真相源一致）：
//   ⚔️ 主动技  = 有 activeCard：effect 写「出牌阶段限一次，你可以…」，不加标签前缀
//   🔵 非锁定技 = skillType:"trigger"：effect 必须以「非锁定技，」开头且含「你可以」，
//                玩家有「发动/跳过」入口；图鉴标签「触发饰品」
//   ⭐ 锁定技   = 其余：effect 必须以「锁定技，」开头且不含「你可以」（自动生效）
//
// 覆盖 3 个饰品数据源（286 轮只扫了前 2 个，漏掉 data-future-relics.js，
// 导致【血色刺伞】这个可选发动饰品一直没补前缀、图标也没从 ⭐ 改成 🔵）：
//   src/original/data-relics.js          (18)
//   src/original/data-ruins-content.js  (10)
//   src/original/data-future-relics.js  (12，末尾还会合并 ruins 的 10 件)
// 逐项按规则校验，不写死饰品名清单 —— 以后往任一数据源新增饰品，
// 只要漏写前缀 / 漏配 skillType / 图标与语义不符，这里立刻打红。
//
// 用法：node tools/check-relic-skill-tags.js
//       REVERT=prefix|icon|optional|locked|missing node tools/check-relic-skill-tags.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const SRC = "src/original/";
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const FILES = [
  SRC + "data-relics.js",
  SRC + "data-ruins-content.js",
  SRC + "data-future-relics.js",
];
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (REVERT === "prefix" && rel.endsWith("data-future-relics.js")) {
    t = t.replace('effect: "非锁定技，当你使用或打出响应牌后',
      'effect: "当你使用或打出响应牌后', 1);
  }
  if (REVERT === "icon" && rel.endsWith("data-future-relics.js")) {
    t = t.replace('    skillType: "trigger",\n    stats: {},\n    effect: "非锁定技，当你使用或打出响应牌后',
      '    stats: {},\n    effect: "非锁定技，当你使用或打出响应牌后', 1);
  }
  if (REVERT === "optional" && rel.endsWith("data-ruins-content.js")) {
    t = t.replace('effect: "锁定技，战术牌造成的伤害翻倍。"',
      'effect: "锁定技，战术牌造成的伤害翻倍。你可以改为不翻倍。"', 1);
  }
  if (REVERT === "locked" && rel.endsWith("data-ruins-content.js")) {
    t = t.replace('effect: "锁定技，战术牌造成的伤害翻倍。"',
      'effect: "战术牌造成的伤害翻倍。"', 1);
  }
  if (REVERT === "missing" && rel.endsWith("data-relics.js")) {
    t = t.replace('window.GameDataRelics = {',
      'window.GameDataRelics = {\n  "测试新饰品": { icon: "新", stats: {}, effect: "摸牌阶段，你多摸一张牌。" },', 1);
  }
  return t;
};

// ── 1. 真实加载 3 个数据源（vm 模拟 window，与浏览器装配同口径） ──
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) {
  vm.runInContext(read(f), ctx, { filename: f });
}
const pools = [
  ["data-relics.js", ctx.GameDataRelics],
  ["data-ruins-content.js", ctx.GameDataRuinsContent?.relics],
  ["data-future-relics.js", ctx.GameDataFutureRelics],
];
const seen = new Set();
const relics = [];
for (const [file, pool] of pools) {
  for (const [name, d] of Object.entries(pool || {})) {
    if (!d || typeof d !== "object" || !d.effect || seen.has(name)) continue;
    seen.add(name);
    const icon = d.activeCard ? "⚔️" : d.skillType === "trigger" ? "🔵" : "⭐";
    relics.push({ name, file, icon, d });
  }
}
check("A0", `3 个数据源全部纳入：共 ${relics.length} 件饰品（含 future 合并的废墟 10 件）`,
  relics.length === 40 && pools.every(([, p]) => p && Object.keys(p).length > 0),
  { total: relics.length, perPool: pools.map(([f, p]) => [f, Object.keys(p || {}).length]) });
check("A1", "每个数据源都至少有 1 件饰品（漏加新数据源会被此条+总数一起拦下）",
  pools.every(([, p]) => Object.keys(p || {}).length >= 10));

// ── 2. 逐件按三类规则校验（新增饰品自动覆盖） ──
const bad = [];
for (const { name, file, icon, d } of relics) {
  const e = d.effect || "";
  const locked = e.startsWith("锁定技，"), optional = e.startsWith("非锁定技，");
  const canChoose = e.includes("你可以");
  if (icon === "⚔️") {
    if (!d.activeCard) bad.push({ name, file, why: "⚔️ 却没有 activeCard" });
    if (locked || optional) bad.push({ name, file, why: "主动技不该带标签前缀" });
  } else if (icon === "🔵") {
    if (d.skillType !== "trigger") bad.push({ name, file, why: "🔵 却没有 skillType:trigger" });
    if (!optional) bad.push({ name, file, why: "🔵 非锁定技缺少「非锁定技，」前缀" });
    if (!canChoose) bad.push({ name, file, why: "🔵 非锁定技却没有「你可以」选择权" });
  } else { // ⭐
    if (!locked) bad.push({ name, file, why: "⭐ 锁定技缺少「锁定技，」前缀" });
    if (canChoose) bad.push({ name, file, why: "⭐ 锁定技 effect 含「你可以」却无跳过入口（应改 🔵）" });
  }
}
check("A2", `${relics.length} 件饰品逐项：图标 / 标签前缀 / 语义（是否可选）三者一致`,
  bad.length === 0, bad.slice(0, 8));

// ── 3. 三类分布与重点项 ──
const dist = relics.reduce((m, r) => (m[r.icon] = (m[r.icon] || 0) + 1, m), {});
check("A3", `图标分布 ⭐${dist["⭐"] || 0} / 🔵${dist["🔵"] || 0} / ⚔️${dist["⚔️"] || 0}（🔵 恰好 2 件：霹雳之锤 + 血色刺伞）`,
  dist["🔵"] === 2 && dist["⚔️"] === 6 && dist["⭐"] === 32, dist);
const blue = relics.filter(r => r.icon === "🔵").map(r => r.name);
check("A4", "2 件 🔵 非锁定技饰品都在：霹雳之锤（放弃发动）+ 血色刺伞（通用反击面板发动/跳过）",
  blue.includes("霹雳之锤") && blue.includes("血色刺伞"), blue);
check("A5", "【血色刺伞】来自 data-future-relics.js（286/293 轮漏扫的数据源已纳入）",
  relics.some(r => r.name === "血色刺伞" && r.file === "data-future-relics.js"));
check("A6", "主动技 6 件全部保留「出牌阶段…你可以」措辞且不加标签前缀",
  relics.filter(r => r.icon === "⚔️").every(r => r.d.effect.includes("出牌阶段")));

// ── 4. 复刻 relics.js 的展示函数，确认玩家实际看到的图标/标签 ──
const umbrella = relics.find(r => r.name === "血色刺伞");
const hammer = relics.find(r => r.name === "霹雳之锤");
const propeller = relics.find(r => r.name === "螺旋桨");
check("B1", "【血色刺伞】图鉴显示 🔵 / 「触发饰品」/「满足条件时触发或弹出响应选择」",
  umbrella?.icon === "🔵" && umbrella?.d.skillType === "trigger");
check("B2", "【霹雳之锤】仍是 🔵 非锁定技，【螺旋桨】290 改锁定技后仍是 ⭐",
  hammer?.icon === "🔵" && propeller?.icon === "⭐"
  && propeller?.d.effect.startsWith("锁定技，") && !propeller?.d.skillType);

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = {
    prefix: ["A2"], icon: ["A2", "A3", "A4", "B1"],
    optional: ["A2"], locked: ["A2"], missing: ["A0", "A2", "A3"],
  }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
