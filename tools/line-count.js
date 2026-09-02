"use strict";

/*
 * 行数巡检：扫描 publish/ 与 src/original/ 下的 .js 文件，
 * 按行数降序列出，标记 >200 (错误, 硬约束) 与 >150 (警告, 考虑拆分)。
 * 退出码：有 >200 行文件返回 1，否则 0。
 *
 * 用法: node tools/line-count.js [--short]
 *   --short   只列出 >150 行的文件
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publishDir = path.join(root, "publish");
const sourceDir = path.join(root, "src", "original");

const WARN = 150;
const HARD = 200;

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

const files = [];
for (const f of walk(publishDir)) {
  if (isMinBundle(f)) continue;
  files.push({ file: f, lines: countLines(f), kind: "publish" });
}
for (const f of walk(sourceDir)) {
  files.push({ file: f, lines: countLines(f), kind: "src" });
}

files.sort((a, b) => b.lines - a.lines);

const hard = files.filter(x => x.lines > HARD);
const warn = files.filter(x => x.lines > WARN && x.lines <= HARD);

function fmt(n) {
  return String(n).padStart(4);
}

function mark(lines) {
  if (lines > HARD) return "ERR ";
  if (lines > WARN) return "warn";
  return "    ";
}

if (!shortMode) {
  console.log("行数巡检 (publish/ + src/original/, 排除 *.min.js)");
  console.log(`硬约束 >${HARD} 行 | 警告 >${WARN} 行`);
  console.log("-".repeat(72));
  for (const x of files) {
    const flag = x.lines > HARD ? "!!" : x.lines > WARN ? "! " : "  ";
    console.log(`${flag}${fmt(x.lines)}  ${mark(x.lines)}  ${rel(x.file)}`);
  }
  console.log("-".repeat(72));
  console.log(`总计 ${files.length} 个 .js 文件; ${hard.length} 个超硬约束, ${warn.length} 个超警告`);
} else {
  for (const x of [...hard, ...warn]) {
    console.log(`${mark(x.lines)} ${fmt(x.lines)}  ${rel(x.file)}`);
  }
}

if (hard.length) {
  console.error(`\n[FAIL] ${hard.length} 个文件超过 ${HARD} 行硬约束:`);
  for (const x of hard) console.error(`  ${fmt(x.lines)}  ${rel(x.file)}`);
  process.exit(1);
}

console.log("\n[OK] 无 .js 文件超过硬约束。");
