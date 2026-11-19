// 245 版：出牌资源旧名 →「淫气」全局文案统一，严格复查。
// 旧词以 Unicode 转义构造，避免本脚本自身命中「全库残留」扫描；注释一律用「旧词」指代。
// REVERT=card|notice|archive|bundle|docs|ui 为源码级反向验证：只回退指定文件，
// 期望打红的段必须精准、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const OLD = "\u6740\u610f";
const NEW = "淫气";
const REVERT = process.env.REVERT || "none";

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".qa-artifacts", ".qa-cache", "__pycache__",
  ".playwright-browsers", "test-results", ".qatmp", ".pw-browsers",
  "deliveries", "deliveries_backup",
]);
const TEXT_EXT = new Set([".js", ".json", ".txt", ".md", ".html", ".css", ".ts", ".csv", ".yml", ".yaml", ".svg"]);

const REVERT_FILES = {
  card: ["src/original/data-cards.js"],
  notice: ["src/original/update-notice-recent.js"],
  archive: ["src/original/update-notice-archive.js"],
  bundle: ["publish/bundles/hall.min.js"],
  docs: ["docs/04-卡牌.txt"],
  ui: ["src/original/battle-prepare-prompts.js", "src/original/battle-turn-input.js"],
};
const REVERT_SEGS = {
  card: "ABG", notice: "AD", archive: "AD", bundle: "AE", docs: "AD", ui: "A",
};

let pass = 0, total = 0;
const fails = [];
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  fails.push(name);
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}

function read(rel) {
  const s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const list = REVERT_FILES[REVERT];
  return list && list.includes(rel) ? s.split(NEW).join(OLD) : s;
}
function walk() {
  const out = [];
  (function rec(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) rec(path.join(dir, ent.name));
      } else if (TEXT_EXT.has(path.extname(ent.name).toLowerCase())) {
        out.push(path.relative(ROOT, path.join(dir, ent.name)).replace(/\\/g, "/"));
      }
    }
  })(ROOT);
  return out;
}

const files = walk();
const countOld = rel => (read(rel).match(new RegExp(OLD, "g")) || []).length;
const countNew = rel => (read(rel).match(new RegExp(NEW, "g")) || []).length;

// ---------- A 全库残留 ----------
check("A1 扫描文本文件数 > 1000", files.length > 1000, { n: files.length });
const oldTotal = files.reduce((a, f) => a + countOld(f), 0);
check("A2 全库旧词残留 = 0", oldTotal === 0, { oldTotal });
const newTotal = files.reduce((a, f) => a + countNew(f), 0);
check("A3 全库新词总数 >= 1200", newTotal >= 1200, { newTotal });
check("A4 src 旧词残留 = 0", files.filter(f => f.startsWith("src/")).every(f => countOld(f) === 0));
check("A5 publish 旧词残留 = 0", files.filter(f => f.startsWith("publish/")).every(f => countOld(f) === 0));
check("A6 docs 旧词残留 = 0", files.filter(f => f.startsWith("docs/")).every(f => countOld(f) === 0));

// ---------- B 卡牌文案 ----------
const cards = read("src/original/data-cards.js");
check("B1 data-cards 无旧词", !cards.includes(OLD));
check("B2 杀（普攻）消耗新词", /text: "[^"]*消耗1点淫气/.test(cards));
check("B3 放血恢复新词", /放血[^]*?恢复1点淫气/.test(cards));
check("B4 战争号角重置新词", /战争号角[^]*?淫气重置至上限/.test(cards));
check("B5 怒杀免新词", /怒杀[^]*?不消耗淫气/.test(cards));
check("B6 追杀免新词", /追杀[^]*?不消耗淫气/.test(cards));

// ---------- C 角色/怪物文案与内部标识 ----------
for (const [i, rel] of [
  "src/original/data-characters-core.js",
  "src/original/data-characters-extra.js",
  "src/original/data-future-orc-enemies.js",
].entries()) {
  const s = read(rel);
  check(`C${i + 1} ${path.basename(rel)} 无旧词且含新词`, !s.includes(OLD) && s.includes(NEW), { rel });
}
const srcJs = files.filter(f => f.startsWith("src/original/") && f.endsWith(".js"));
const srcAll = srcJs.map(read).join("\n");
check("C4 noIntentCost 标识保留", srcAll.includes("noIntentCost"));
check("C5 beforeIntentCost 标识保留", srcAll.includes("beforeIntentCost"));
check("C6 spendIntent 标识保留", srcAll.includes("spendIntent"));
check("C7 isIntentFree 标识保留", srcAll.includes("isIntentFree"));
check("C8 intent 英文标识总量 > 200", (srcAll.match(/intent/gi) || []).length > 200,
  { n: (srcAll.match(/intent/gi) || []).length });

// ---------- D 公告与文档 ----------
const recent = read("src/original/update-notice-recent.js");
check("D1 recent 无旧词", !recent.includes(OLD));
check("D2 当期公告含更名说明", recent.includes("出牌资源统一更名为【淫气】"));
check("D3 recent 行数 <= 150", recent.split("\n").length <= 150, { lines: recent.split("\n").length });
const archive = read("src/original/update-notice-archive.js");
check("D4 archive 无旧词且含新词", !archive.includes(OLD) && archive.includes(NEW));
const doc4 = read("docs/04-卡牌.txt");
check("D5 docs/04 无旧词且含消耗1点淫气", !doc4.includes(OLD) && doc4.includes("消耗1点淫气"));
const doc5 = read("docs/05-怪物与怪物技能与饰品.txt");
check("D6 docs/05 无旧词且含新词", !doc5.includes(OLD) && doc5.includes(NEW));

// ---------- E 构建产物与版本 ----------
const bundleDir = path.join(ROOT, "publish", "bundles");
const bundles = fs.readdirSync(bundleDir).filter(f => f.endsWith(".min.js")).sort();
check("E1 bundle 数量 = 11", bundles.length === 11, { n: bundles.length });
const bundleOld = bundles.reduce((a, f) => a + countOld(`publish/bundles/${f}`), 0);
check("E2 bundle 旧词残留 = 0", bundleOld === 0, { bundleOld });
const bundleNew = bundles.reduce((a, f) => a + countNew(`publish/bundles/${f}`), 0);
check("E3 bundle 新词总数 >= 169", bundleNew >= 169, { bundleNew });
check("E4 hall.min.js 新词 >= 52", countNew("publish/bundles/hall.min.js") >= 52,
  { n: countNew("publish/bundles/hall.min.js") });
const idx = read("publish/index.html");
check("E5 index 版本 245 ×13", (idx.match(/20260915-245/g) || []).length === 13);
check("E6 徽章 v26.0915.245 且 244/246 残留 0",
  idx.includes("v26.0915.245") && !idx.includes("20260915-244") && !idx.includes("20260915-246"));
const villa = read("publish/villa.css");
check("E7 villa.css cache-buster 245 ×4", (villa.match(/20260915-245/g) || []).length === 4,
  { n: (villa.match(/20260915-245/g) || []).length });

// ---------- F 语法完整性 ----------
const touched = files.filter(f => (f.endsWith(".js")) && read(f).includes(NEW));
let badSyntax = [];
for (const rel of touched) {
  try { new vm.Script(read(rel), { filename: rel }); }
  catch (e) { badSyntax.push(rel); }
}
check("F1 含新词的 js 全部可解析", badSyntax.length === 0, { badSyntax: badSyntax.slice(0, 8), n: touched.length });
check("F2 旧词/新词 UTF-8 等长 = 6", Buffer.byteLength(OLD) === 6 && Buffer.byteLength(NEW) === 6);

// ---------- G 卡面字段 ----------
// 文案本身是字符串字面量，直接按 text 字段抽取验证；
// 不整文件 vm 执行，避免 data-cards.js 尾部对 GameEconomy 等外部全局的装配依赖。
const texts = [...cards.matchAll(/text:\s*"([^"]*)"/g)].map(m => m[1]);
check("G1 卡面 text 字段 > 30", texts.length > 30, { n: texts.length });
check("G2 全部卡面 text 无旧词", texts.length > 0 && texts.every(t => !t.includes(OLD)));
check("G3 存在卡面 text 含消耗1点淫气", texts.some(t => t.includes("消耗1点淫气")));

// ---------- H 反向验证有效性 ----------
if (REVERT === "none") {
  check("H1 none 模式零失败", fails.length === 0, { fails });
} else {
  const expected = REVERT_SEGS[REVERT];
  check(`H1 REVERT=${REVERT} 至少 1 红`, fails.length > 0, { fails });
  check(`H2 REVERT=${REVERT} 红项只落在 ${expected} 段`,
    fails.every(f => expected.includes(f[0])), { fails });
}

console.log(`\n通过 ${pass} / ${total}${REVERT === "none" ? "" : `  REVERT=${REVERT}`}`);
if (fails.length && REVERT === "none") process.exit(1);
if (REVERT !== "none" && fails.length === 0) process.exit(1);
