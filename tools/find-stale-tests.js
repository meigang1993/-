"use strict";
// 扫描 tests/*.spec.js 中引用的 CSS 类选择器，检查其在 src/ 与 publish/*.css 中是否仍存在。
// 仅报告“疑似过期”：选择器在全部源码中都找不到。
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const testsDir = path.join(root, "tests");
const srcDir = path.join(root, "src");
const publishDir = path.join(root, "publish");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|css|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

const sourceFiles = [
  ...walk(srcDir),
  ...fs.readdirSync(publishDir)
    .filter(f => /\.(css|html)$/.test(f))
    .map(f => path.join(publishDir, f)),
];
const sourceBlob = sourceFiles
  .filter(p => !p.includes(`${path.sep}bundles${path.sep}`))
  .map(p => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } })
  .join("\n");

const specFiles = fs.readdirSync(testsDir).filter(f => f.endsWith(".spec.js")).sort();
const findings = [];

for (const f of specFiles) {
  const p = path.join(testsDir, f);
  const text = fs.readFileSync(p, "utf8");
  // 只从字符串字面量里提取 kebab-case 的 CSS 类选择器，避免误抓 JS 方法名
  const classes = new Set();
  for (const m of text.matchAll(/(['"`])([^'"`\n]*)\1/g)) {
    for (const c of m[2].matchAll(/\.([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/g)) classes.add(c[1]);
  }
  const missing = [...classes].filter(c => !sourceBlob.includes(c));
  if (missing.length) findings.push({ file: f, missing });
}

if (!findings.length) console.log("未发现引用已消失 CSS 类的测试。");
for (const { file, missing } of findings) {
  console.log(`\n${file}`);
  console.log(`  疑似失效选择器(${missing.length}): ${missing.slice(0, 12).join(", ")}`);
}
