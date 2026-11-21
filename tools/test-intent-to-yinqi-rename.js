// 247/248 版：出牌资源文案全库统一复查（历史公告与归档一并替换，零残留）。
// 旧词以 Unicode 转义构造，避免本脚本自身命中全库扫描；注释一律用「旧词」指代。
// 全库任何文本文件都不允许再出现旧词，历史公告与 bundle 镜像同样零残留。
// REVERT=card|recent|archive|bundle|docs|ui|current 为源码级反向验证：
// 只改动指定文件，期望打红的段必须精准、无关段保持绿。
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

const HISTORY_NOTICE = [
  "src/original/update-notice-archive.js",
  "src/original/update-notice-recent.js",
];
const HISTORY_BUNDLE = "publish/bundles/hall.min.js";
const ALLOW_OLD = new Set();

const REVERT_FILES = {
  card: ["src/original/data-cards.js"],
  recent: ["src/original/update-notice-recent.js"],
  archive: ["src/original/update-notice-archive.js"],
  bundle: [HISTORY_BUNDLE],
  docs: ["docs/04-卡牌.txt"],
  ui: ["src/original/battle-prepare-prompts.js", "src/original/battle-turn-input.js"],
  current: ["src/original/update-notice-recent.js"],
};
const REVERT_SEGS = {
  card: "ABG", recent: "AD", archive: "AD", bundle: "AE",
  docs: "AD", ui: "A", current: "D",
};
const POLICY_TEXT = "全库文案统一：历史更新说明与归档章节中的旧称一并替换为新称，全库不再保留任何旧称。";

let pass = 0, total = 0;
const fails = [];
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  fails.push(name);
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}

function read(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const list = REVERT_FILES[REVERT];
  if (!list || !list.includes(rel)) return s;
  if (REVERT === "current") return s.replace(POLICY_TEXT, "");
  return s.split(NEW).join(OLD);
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
const bundleDir = path.join(ROOT, "publish", "bundles");
const bundles = fs.readdirSync(bundleDir).filter(f => f.endsWith(".min.js")).sort();
const bundleRel = f => `publish/bundles/${f}`;

// ---------- A 全库残留（按文件分类） ----------
check("A1 扫描文本文件数 > 1000", files.length > 1000, { n: files.length });
const nonHistOld = files.filter(f => !ALLOW_OLD.has(f)).reduce((a, f) => a + countOld(f), 0);
check("A2 非历史公告文件旧词残留 = 0", nonHistOld === 0, { nonHistOld });
const histOld = HISTORY_NOTICE.reduce((a, f) => a + countOld(f), 0);
const bundleOld = bundles.reduce((a, f) => a + countOld(bundleRel(f)), 0);
check("A2b 全库旧词零残留（含历史公告与 bundle 镜像）", histOld === 0 && bundleOld === 0
  && HISTORY_NOTICE.every(f => countNew(f) > 0) && countNew(HISTORY_BUNDLE) > 0,
  { histOld, bundleOld });
const newTotal = files.reduce((a, f) => a + countNew(f), 0);
check("A3 全库新词总数 >= 1100", newTotal >= 1100, { newTotal });
check("A4 src 非历史公告旧词 = 0",
  files.filter(f => f.startsWith("src/") && !ALLOW_OLD.has(f)).every(f => countOld(f) === 0));
check("A5 publish 非历史镜像旧词 = 0",
  files.filter(f => f.startsWith("publish/") && !ALLOW_OLD.has(f)).every(f => countOld(f) === 0));
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

// ---------- D 公告与文档口径 ----------
const recent = read("src/original/update-notice-recent.js");
const firstBlock = recent.split(/\n    \},/)[0];
check("D1 recent 当期条目无旧词", !firstBlock.includes(OLD));
check("D1b recent 全篇无旧词", !recent.includes(OLD));
check("D2 当期公告含更名说明与全库统一口径",
  recent.includes("出牌资源统一更名为【淫气】") && recent.includes(POLICY_TEXT));
check("D3 recent 行数 <= 150", recent.split("\n").length <= 150,
  { lines: recent.split("\n").length });
const archive = read("src/original/update-notice-archive.js");
check("D4 archive 无旧词", !archive.includes(OLD));
check("D4b archive 新词已就位", archive.includes(NEW));
const doc4 = read("docs/04-卡牌.txt");
check("D5 docs/04 无旧词且含消耗1点淫气", !doc4.includes(OLD) && doc4.includes("消耗1点淫气"));
const doc5 = read("docs/05-怪物与怪物技能与饰品.txt");
check("D6 docs/05 无旧词且含新词", !doc5.includes(OLD) && doc5.includes(NEW));

// ---------- E 构建产物与版本 ----------
check("E1 bundle 数量 = 11", bundles.length === 11, { n: bundles.length });
check("E2 全部 bundle 旧词 = 0", bundleOld === 0, { bundleOld });
check("E2b 除 hall 外其它 bundle 旧词 = 0",
  bundles.filter(f => bundleRel(f) !== HISTORY_BUNDLE).every(f => countOld(bundleRel(f)) === 0));
const bundleNew = bundles.reduce((a, f) => a + countNew(bundleRel(f)), 0);
check("E3 bundle 新词总数 >= 150", bundleNew >= 150, { bundleNew });
check("E4 hall.min.js 新词 >= 8", countNew(HISTORY_BUNDLE) >= 8,
  { n: countNew(HISTORY_BUNDLE) });
const idx = read("publish/index.html");
check("E5 index 版本 249 ×13", (idx.match(/20260915-249/g) || []).length === 13);
check("E6 徽章 v26.0915.249 且 248/250 残留 0",
  idx.includes("v26.0915.249") && !idx.includes("20260915-248") && !idx.includes("20260915-250"));
const villa = read("publish/villa.css");
check("E7 villa.css cache-buster 249 ×4", (villa.match(/20260915-249/g) || []).length === 4,
  { n: (villa.match(/20260915-248/g) || []).length });

// ---------- F 语法完整性 ----------
const touched = files.filter(f => f.endsWith(".js") && read(f).includes(NEW));
let badSyntax = [];
for (const rel of touched) {
  try { new vm.Script(read(rel), { filename: rel }); }
  catch (e) { badSyntax.push(rel); }
}
check("F1 含新词的 js 全部可解析", badSyntax.length === 0,
  { badSyntax: badSyntax.slice(0, 8), n: touched.length });
check("F2 旧词/新词 UTF-8 等长 = 6", Buffer.byteLength(OLD) === 6 && Buffer.byteLength(NEW) === 6);

// ---------- G 卡面字段 ----------
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
