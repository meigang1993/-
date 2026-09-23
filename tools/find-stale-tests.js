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

// 形如 `cards-${count}`、`damage-attribute-${type}` 的模板拼接，最终 class 名不会
// 以字面量出现在源码里，直接比对会把这类运行期生成的 class 误报为过期。
// 提取这些动态前缀，命中前缀的 class 视为合法并跳过。
const dynamicPrefixes = new Set();
for (const m of sourceBlob.matchAll(/([a-z][a-z0-9]*(?:-[a-z0-9]+)*-)\$\{/g)) {
  dynamicPrefixes.add(m[1]);
}

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
  const stale = missing.filter(c => ![...dynamicPrefixes].some(pre => c.startsWith(pre)));
  const dynamic = missing.filter(c => !stale.includes(c));
  if (stale.length || dynamic.length) findings.push({ file: f, stale, dynamic });
}

if (!findings.length) console.log("未发现引用已消失 CSS 类的测试。");
for (const { file, stale, dynamic } of findings) {
  console.log(`\n${file}`);
  if (stale.length) {
    console.log(`  疑似失效选择器(${stale.length}): ${stale.slice(0, 12).join(", ")}`);
  }
  if (dynamic.length) {
    console.log(`  运行期拼接生成，已跳过(${dynamic.length}): ${dynamic.slice(0, 12).join(", ")}`);
  }
}
