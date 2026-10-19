#!/usr/bin/env node
// 等级特殊立绘（10 级自动解锁）快速接入脚本。
//   单张：node tools/add-special-portrait.js --char=nanali --src=/tmp/raw.png
//   批量：node tools/add-special-portrait.js --batch=specials.json
//         （JSON 数组：[{ "char": "nanali", "src": "/tmp/a.png" }, ...]）
//   查看覆盖：node tools/add-special-portrait.js --list
// 选项：--level=10 --width=1024 --quality=82 --dry（只打印不落盘）
//       --no-build（跳过重建产物）
//       --auto-initial（角色缺"默认外观"时，用角色表的默认立绘自动补一条）
// 契约：命名 {charId}_level_{N}_special、品质 special、价格 0、
//       图片统一为 assets/generated 下的 hash webp；校验由
//       tools/test-character-special-art.js 自动派生，新增无需改测试。
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GEN_DIR = path.join(ROOT, "publish/assets/generated");
const SKINS_FILE = path.join(ROOT, "src/original/data-skins.js");

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf("=");
  return i < 0 ? [a.replace(/^--/, ""), true]
    : [a.slice(2, i), a.slice(i + 1)];
}));

global.window = global;
["data-characters-core", "data-characters-extra", "data-future-characters",
  "data-new-characters"].forEach(f => {
  const p = path.join(ROOT, "src/original", `${f}.js`);
  if (fs.existsSync(p)) require(p);
});
require(path.join(ROOT, "src/original/data-characters.js"));
require(path.join(ROOT, "src/original/data-skins.js"));

const CHARS = new Map(window.GameDataCharacters.map(c => [c.id, c.name]));
const SKINS = window.GameSkinData.skins;

function die(msg) { console.error("✗ " + msg); process.exit(1); }
function log(msg) { console.log(msg); }

function coverage() {
  const has = new Set(SKINS.filter(s => s.specialIllustration).map(s => s.charId));
  const missing = [...CHARS.keys()].filter(id => !has.has(id));
  log(`等级特殊立绘覆盖：${has.size}/${CHARS.size} 个角色`);
  log(`已有：${[...has].map(id => CHARS.get(id) || id).join("、")}`);
  log(`待补：${missing.map(id => CHARS.get(id) || id).join("、") || "（无）"}`);
  return missing;
}

if (args.list) { coverage(); return; }

const level = Number(args.level || 10);
const width = Number(args.width || 1024);
const quality = Number(args.quality || 82);
const dry = !!args.dry;

let sharp;
try { sharp = require("sharp"); } catch (e) { die("需要 sharp（repo/node_modules）"); }

async function convertToWebp(src) {
  const buf = await sharp(src)
    .resize(width, width, { fit: "cover", position: "centre" })
    .webp({ quality })
    .toBuffer();
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
  return { buf, hash };
}

// 缺默认外观时，用角色表里的默认立绘补一条 initial 皮肤。
// 角色表 31 个角色都有 art 字段，所以这条永远能补出来。
function upsertInitial(charId, name) {
  const entry = window.GameDataCharacters.find(c => c.id === charId);
  const art = entry?.art || entry?.portrait || entry?.image;
  if (!art) return null;
  const id = `${charId}_default`;
  const line = `    { id: "${id}", charId: "${charId}", name: "默认", `
    + `quality: "default", price: 0, art: "${art}", `
    + `desc: "${name}的初始外观。", initial: true },`;
  let text = fs.readFileSync(SKINS_FILE, "utf8");
  const exact = new RegExp(`^.*"${id}".*$\\n?`, "m");
  if (exact.test(text)) return { text, mode: "默认外观已存在" };
  const lines = text.split("\n");
  let at = -1;
  lines.forEach((l, i) => { if (l.includes(`charId: "${charId}"`)) at = i; });
  if (at < 0) at = lines.findIndex(l => l.trim() === "];") - 1;
  lines.splice(at + 1, 0, line);
  return { text: lines.join("\n"), mode: "补默认外观" };
}

function upsertEntry(charId, art, name) {
  const id = `${charId}_level_${level}_special`;
  const line = `    { id: "${id}", charId: "${charId}", name: "特殊立绘", `
    + `quality: "special", price: 0, unlockLevel: ${level}, `
    + `specialIllustration: true, art: "${art}", `
    + `desc: "${name}达到${level}级后自动解锁，可作为正式战斗立绘装备。" },`;
  let text = fs.readFileSync(SKINS_FILE, "utf8");
  const exact = new RegExp(`^.*"${id}".*$\\n?`, "m");
  if (exact.test(text)) {
    text = text.replace(exact, line + "\n");
    return { text, mode: "更新" };
  }
  // 新条目插在该角色最后一条皮肤之后，保持按角色分组
  const lines = text.split("\n");
  let at = -1;
  lines.forEach((l, i) => { if (l.includes(`charId: "${charId}"`)) at = i; });
  if (at < 0) at = lines.findIndex(l => l.trim() === "];") - 1;
  lines.splice(at + 1, 0, line);
  return { text: lines.join("\n"), mode: "新增" };
}

async function addOne(charId, src) {
  const name = CHARS.get(charId);
  if (!name) die(`未知角色 ${charId}（可用：${[...CHARS.keys()].join(", ")}）`);
  if (!src || !fs.existsSync(src)) die(`源图不存在：${src}`);
  if (!SKINS.some(s => s.charId === charId && s.initial)) {
    if (!args["auto-initial"]) {
      die(`${name}(${charId}) 缺少默认外观；加 --auto-initial 自动补，或先手工补 initial 皮肤`);
    }
    const r = upsertInitial(charId, name);
    if (!r) die(`${name}(${charId}) 角色表里也没有默认立绘字段，无法补`);
    if (!dry) fs.writeFileSync(SKINS_FILE, r.text);
    SKINS.push({ id: `${charId}_default`, charId, initial: true });
    log(`${r.mode} ${name}(${charId})`);
  }
  const { buf, hash } = await convertToWebp(src);
  const file = `${charId}-level-${level}-special.${hash}.webp`;
  const art = `./assets/generated/${file}`;
  const { text, mode } = upsertEntry(charId, art, name);
  log(`${mode} ${name}(${charId}) → ${file}  ${Math.round(buf.length / 1024)}KB`);
  if (dry) { log("  --dry：未写入"); return; }
  fs.writeFileSync(path.join(GEN_DIR, file), buf);
  fs.writeFileSync(SKINS_FILE, text);
  // 同步内存里的皮肤表，否则 coverage() 统计不到刚写入的条目
  SKINS.push({ id: `${charId}_level_${level}_special`, charId,
    specialIllustration: true, unlockLevel: level });
}

(async () => {
  const jobs = args.batch
    ? JSON.parse(fs.readFileSync(path.resolve(String(args.batch)), "utf8"))
    : [{ char: String(args.char), src: args.src ? String(args.src) : "" }];
  for (const job of jobs) await addOne(String(job.char), String(job.src || ""));
  if (dry) return;
  coverage();
  if (!args["no-build"]) {
    log("重建产物…");
    execSync("npm run build:publish", { cwd: ROOT, stdio: "inherit" });
  }
  log("下一步：node tools/test-character-special-art.js");
})();
