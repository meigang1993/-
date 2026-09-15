const fs = require("fs");
const path = require("path");
const { loadDependency } = require("./repository-toolchain");
const terser = loadDependency("terser");
const manifest = require("./publish-bundles.json");
const { assertRepositoryPublishVersion } = require("./publish-build-version");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");
const publish = path.join(root, "publish");
const outputDir = path.join(publish, "bundles");
const checkOnly = process.argv.includes("--check");
// 默认内嵌可读源码到 .map（sourcesContent），使 publish 独立部署或仅下载发布包时，
// DevTools 仍能还原源文件与行号，而不是只能看到单个巨型压缩包的第 2 行。
// .map 仅在打开 DevTools 时才会被请求，正常玩家不会下载，因此不增加运行时流量。
// 需要精简发布产物时用 --no-sources 关闭（此时依赖仓库内 src/original 解析）。
const includeSources = !process.argv.includes("--no-sources");
const expectedOutputs = Object.keys(manifest).map(name => `${name}.min.js`).sort();

function listJavaScript(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJavaScript(full, relative);
    return entry.name.endsWith(".js") ? [relative.replace(/\\/g, "/")] : [];
  });
}

// sources 写成相对 .map 文件自身位置的路径（.map 位于 publish/bundles/），
// DevTools 才能回溯到可读源文件 src/original/<file>，而不是单个巨型压缩包的第 2 行。
function readSources(files) {
  return Object.fromEntries(files.map(file => {
    const full = path.join(sourceDir, file);
    if (!fs.existsSync(full)) throw new Error(`Missing bundle source: src/original/${file}`);
    return [`../../src/original/${file}`, fs.readFileSync(full, "utf8")];
  }));
}

function validateManifest() {
  const groups = Object.values(manifest).flat();
  const duplicates = groups.filter((file, index) => groups.indexOf(file) !== index);
  if (duplicates.length) throw new Error(`Duplicate bundle sources: ${[...new Set(duplicates)].join(", ")}`);
  const expected = listJavaScript(sourceDir).sort();
  const actual = [...groups].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const missing = expected.filter(file => !actual.includes(file));
    const extra = actual.filter(file => !expected.includes(file));
    throw new Error(`Bundle manifest mismatch; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`);
  }
}

function validatePublishBoundary() {
  const expected = expectedOutputs.map(file => `bundles/${file}`);
  const actual = listJavaScript(publish).sort();
  const unexpected = actual.filter(file => !expected.includes(file));
  if (unexpected.length) {
    throw new Error(`Unbundled JavaScript in publish/: ${unexpected.join(", ")}`);
  }
}

async function compile(name, files) {
  const result = await terser.minify(readSources(files), {
    compress: {
      passes: 3,
    },
    keep_classnames: true,
    keep_fnames: true,
    mangle: {
      keep_classnames: true,
      keep_fnames: true,
    },
    ecma: 2020,
    sourceMap: {
      filename: `${name}.min.js`,
      url: `${name}.min.js.map`,
      includeSources,
    },
    format: {
      ascii_only: false,
      beautify: false,
      comments: false,
      preamble: `/*! generated from tools/publish-bundles.json: ${name} */`,
    },
  });
  if (!result.code) throw new Error(`Terser returned no output for ${name}`);
  if (!result.map) throw new Error(`Terser returned no source map for ${name}`);
  return { code: `${result.code}\n`, map: `${result.map}\n` };
}

function writeAtomic(target, content) {
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, target);
}

async function main() {
  validateManifest();
  validatePublishBoundary();
  const outputs = {};
  const sourceMaps = {};
  for (const [name, files] of Object.entries(manifest)) {
    const compiled = await compile(name, files);
    outputs[name] = compiled.code;
    sourceMaps[name] = compiled.map;
  }
  const index = fs.readFileSync(path.join(publish, "index.html"), "utf8");
  assertRepositoryPublishVersion(root, outputs, index);
  if (checkOnly) {
    const stale = Object.entries(outputs).filter(([name, code]) => {
      const file = path.join(outputDir, `${name}.min.js`);
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== code) return true;
      const mapFile = path.join(outputDir, `${name}.min.js.map`);
      return !fs.existsSync(mapFile) || fs.readFileSync(mapFile, "utf8") !== sourceMaps[name];
    }).map(([name]) => name);
    if (stale.length) throw new Error(`Stale publish bundles: ${stale.join(", ")}; run npm run build:bundles`);
    console.log(`Publish bundles are current: ${Object.keys(outputs).join(", ")}`);
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  Object.entries(outputs).forEach(([name, code]) => {
    writeAtomic(path.join(outputDir, `${name}.min.js`), code);
  });
  Object.entries(sourceMaps).forEach(([name, map]) => {
    writeAtomic(path.join(outputDir, `${name}.min.js.map`), map);
  });
  validatePublishBoundary();
  console.log(Object.entries(outputs).map(([name, code]) => `${name} ${(Buffer.byteLength(code) / 1024).toFixed(1)} KiB`).join(", "));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
