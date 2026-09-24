// 单分组重编：仅重建指定 bundle（全量构建内嵌 sourcesContent，耗时过长）。
// 用法: node tools/rebuild-one-bundle.js <groupName>
const fs = require("fs");
const path = require("path");
const { loadDependency } = require("./repository-toolchain");
const terser = loadDependency("terser");
const manifest = require("./publish-bundles.json");

const name = process.argv[2];
if (!name || !manifest[name]) {
  console.error(`用法: node tools/rebuild-one-bundle.js <${Object.keys(manifest).join("|")}>`);
  process.exit(1);
}
const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");
const outputDir = path.join(root, "publish", "bundles");
const files = manifest[name];
const sources = Object.fromEntries(files.map(file => {
  const full = path.join(sourceDir, file);
  if (!fs.existsSync(full)) throw new Error(`Missing bundle source: src/original/${file}`);
  return [`../../src/original/${file}`, fs.readFileSync(full, "utf8")];
}));

(async () => {
  const result = await terser.minify(sources, {
    compress: { passes: 3 },
    keep_classnames: true,
    keep_fnames: true,
    mangle: { keep_classnames: true, keep_fnames: true },
    ecma: 2020,
    sourceMap: {
      filename: `${name}.min.js`,
      url: `${name}.min.js.map`,
      includeSources: true,
    },
    format: {
      ascii_only: false,
      beautify: false,
      comments: false,
      preamble: `/*! generated from tools/publish-bundles.json: ${name} */`,
    },
  });
  if (!result.code || !result.map) throw new Error(`Terser 返回空结果: ${name}`);
  const writeAtomic = (target, content) => {
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  };
  writeAtomic(path.join(outputDir, `${name}.min.js`), `${result.code}\n`);
  writeAtomic(path.join(outputDir, `${name}.min.js.map`), `${result.map}\n`);
  console.log(`${name} 已重建 ${(Buffer.byteLength(result.code) / 1024).toFixed(1)} KiB`);
})().catch(e => { console.error(e.message); process.exit(1); });
