"use strict";

/*
 * 行数巡检：扫描 publish/ 与 src/original/ 下的 .js 文件，
 * 按行数降序列出，标记 >200 (错误, 硬约束) 与 >150 (警告, 考虑拆分)。
 *
 * 同时统计字节数与"每行平均字节数"，用于发现仅看行数会漏掉的宽行文件：
 *   - 字节数 > WARN_BYTES(8000)：文件过大，但行数可能很低
 *   - 每行平均字节 > WARN_WIDTH(300)：单行超长的数据表（如敌人数据表，
 *     11 行却有 9966 字节）。这类文件行数巡检完全看不见，是本脚本原先的盲点。
 *
 * 字节/宽度只作为"警告"提示，不作为硬约束退出码——数据表天然宽，
 * 强制拆分属于无谓改动。硬约束仍只有 >200 行一项。
 *
 * 退出码：有 >200 行文件返回 1，否则 0。
 *
 * 用法: node tools/line-count.js [--short]
 *   --short   只列出触发任意告警或硬约束的文件
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publishDir = path.join(root, "publish");
const sourceDir = path.join(root, "src", "original");

const WARN = 150;
const HARD = 200;
// 字节/行宽告警阈值（仅提示，不导致退出码非 0）
const WARN_BYTES = 8000;
const WARN_WIDTH = 300;

const argv = new Set(process.argv.slice(2));
const shortMode = argv.has("--short") || argv.has("-s");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (full.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function isMinBundle(file) {
  // 压缩 bundle 通常 1-2 行，不参与行数约束
  return /[/\\]bundles[/\\][^/\\]+\.min\.js$/.test(file);
}

function countLines(file) {
  const src = fs.readFileSync(file, "utf8");
  return src.split(/\r?\n/).length;
}

function countBytes(file) {
  return Buffer.byteLength(fs.readFileSync(file, "utf8"));
}

const files = [];
for (const f of walk(publishDir)) {
  if (isMinBundle(f)) continue;
  files.push({ file: f, lines: countLines(f), bytes: countBytes(f), kind: "publish" });
}
for (const f of walk(sourceDir)) {
  files.push({ file: f, lines: countLines(f), bytes: countBytes(f), kind: "src" });
}
for (const x of files) {
  x.width = Math.round(x.bytes / Math.max(1, x.lines));
}

files.sort((a, b) => b.lines - a.lines);

const hard = files.filter(x => x.lines > HARD);
// 触发任一告警：行数、字节数、或单行过宽
const isWarn = x => x.lines > WARN || x.bytes > WARN_BYTES || x.width > WARN_WIDTH;
const warn = files.filter(x => x.lines <= HARD && isWarn(x));

function fmt(n) {
  return String(n).padStart(4);
}

function mark(x) {
  if (x.lines > HARD) return "ERR ";
  if (x.lines > WARN) return "warn";
  if (x.width > WARN_WIDTH) return "wide";
  if (x.bytes > WARN_BYTES) return "size";
  return "    ";
}

if (!shortMode) {
  console.log("行数巡检 (publish/ + src/original/, 排除 *.min.js)");
  console.log(`硬约束 >${HARD} 行 | 警告 >${WARN} 行 或 >${WARN_BYTES} 字节 或 >${WARN_WIDTH} 字节/行`);
  console.log("-".repeat(84));
  for (const x of files) {
    const flag = x.lines > HARD ? "!!" : isWarn(x) ? "! " : "  ";
    console.log(`${flag}${fmt(x.lines)} ${fmt(x.bytes)}B ${fmt(x.width)}w  ${mark(x)}  ${rel(x.file)}`);
  }
  console.log("-".repeat(84));
  console.log(`总计 ${files.length} 个 .js 文件; ${hard.length} 个超硬约束, ${warn.length} 个触发告警`);
} else {
  for (const x of [...hard, ...warn]) {
    console.log(`${mark(x)} ${fmt(x.lines)} ${fmt(x.bytes)}B ${fmt(x.width)}w  ${rel(x.file)}`);
  }
}

const wide = warn.filter(x => x.width > WARN_WIDTH);
if (wide.length) {
  console.log(`\n提示: ${wide.length} 个文件单行过宽(>${WARN_WIDTH} 字节/行)，行数巡检本看不出它们过大：`);
  for (const x of wide) console.log(`  ${fmt(x.width)}w ${fmt(x.bytes)}B ${fmt(x.lines)}行  ${rel(x.file)}`);
}

if (hard.length) {
  console.error(`\n[FAIL] ${hard.length} 个文件超过 ${HARD} 行硬约束:`);
  for (const x of hard) console.error(`  ${fmt(x.lines)}  ${rel(x.file)}`);
  process.exit(1);
}

console.log("\n[OK] 无 .js 文件超过硬约束。");
