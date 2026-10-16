"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { bumpRepositoryVersion, nextBuildVersion } = require("./publish-version-bump");

const dash = "20260915-135";
const dotted = "26.0915.135";
const nextDash = "20260915-136";
const nextDotted = "26.0915.136";

// 在临时目录里搭一份与真实仓库同构的最小骨架，避免测试污染工作区。
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-bump-"));
  const files = {
    "publish/index.html": [
      `<meta name="game-build" content="${dash}">`,
      `<link rel="stylesheet" href="villa.css?v=${dash}">`,
      `<span id="badge">v${dotted}</span>`,
    ].join("\n"),
    "publish/villa.css": `:root{--build:"${dash}"}\n.unit{--build:"${dash}"}`,
    "electron-entry/package.json": `{\n  "version": "${dotted}"\n}`,
  };
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("序号递增、日期段保持不变", () => {
  assert.equal(nextBuildVersion("20260915-135"), "20260915-136");
  assert.equal(nextBuildVersion("20260915-9"), "20260915-10");
});

test("非 YYYYMMDD-N 形态直接报错，不静默产出错误版本号", () => {
  assert.throws(() => nextBuildVersion("v26.0915.135"), /YYYYMMDD-N/);
  assert.throws(() => nextBuildVersion(""), /YYYYMMDD-N/);
});

test("两种形态的版本串都被推进", () => {
  const root = scaffold();
  const result = bumpRepositoryVersion(root, dash);
  assert.equal(result.previous, dash);
  assert.equal(result.next, nextDash);
  assert.equal(result.changed, true);

  const index = fs.readFileSync(path.join(root, "publish/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "publish/villa.css"), "utf8");
  const pkg = fs.readFileSync(path.join(root, "electron-entry/package.json"), "utf8");
  assert.equal(index.includes(dash), false, `index.html 仍有旧版本号: ${index}`);
  assert.equal(css.includes(dash), false, `villa.css 仍有旧版本号: ${css}`);
  assert.equal(pkg.includes(dotted), false, `package.json 仍有旧版本号: ${pkg}`);
  assert.equal(index.includes(nextDash), true);
  assert.equal(index.includes(`v${nextDotted}`), true, "徽章版本未同步");
  assert.equal(css.includes(nextDash), true);
  assert.equal(pkg.includes(nextDotted), true);
});

test("替换是彻底的：不留任何旧版本残留", () => {
  const root = scaffold();
  bumpRepositoryVersion(root, dash);
  for (const relative of [
    "publish/index.html",
    "publish/villa.css",
    "electron-entry/package.json",
  ]) {
    const content = fs.readFileSync(path.join(root, relative), "utf8");
    assert.equal(/20260915-135|26\.0915\.135/.test(content), false, `${relative} 有残留`);
  }
});

test("目标文件缺失时跳过而不抛错", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-bump-empty-"));
  const result = bumpRepositoryVersion(root, dash);
  assert.equal(result.changed, false);
  assert.equal(result.next, nextDash);
});

let failures = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`not ok - ${name}\n    ${error.message}`);
  }
}
console.log(`\n通过 ${tests.length - failures}/${tests.length}`);
if (failures) process.exit(1);
