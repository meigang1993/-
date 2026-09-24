const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadDependency } = require("./repository-toolchain");
const terser = loadDependency("terser");
const manifest = require("./publish-bundles.json");
const { assertRepositoryPublishVersion } = require("./publish-build-version");

// --check 无需重新压缩：源输入不变且磁盘产物哈希与上次一致即可判定 current。
// 缓存放在仓库之外，避免污染工作区与推送差异。
const cachePath = path.resolve(__dirname, "..", "..", ".bundle-check-cache.json");

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

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// terser 版本变化会改变压缩产物，纳入指纹以免缓存误判为 current。
function terserStamp() {
  try {
    const pkg = require.resolve("terser/package.json");
    const { name, version } = JSON.parse(fs.readFileSync(pkg, "utf8"));
    return `${name}@${version}`;
  } catch (error) {
    return "terser@unknown";
  }
}

// 覆盖全部影响产物的输入：manifest 分组、是否内嵌源码、terser 版本、每个源文件内容。
function inputFingerprint() {
  const files = new Set(Object.values(manifest).flat());
  const parts = [JSON.stringify(manifest), includeSources ? "sources" : "nosources", terserStamp()];
  for (const file of [...files].sort()) {
    parts.push(`${file}:${sha256(fs.readFileSync(path.join(sourceDir, file), "utf8"))}`);
  }
  return sha256(parts.join("\n"));
}

// 命中时返回磁盘上的现有产物；任何一项不匹配都返回 null，回退到完整编译。
function readCachedOutputs() {
  if (!checkOnly) return null;
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch (error) {
    return null;
  }
  if (!cache?.bundles || cache.sources !== inputFingerprint()) return null;
  const outputs = {};
  const sourceMaps = {};
  for (const name of Object.keys(manifest)) {
    try {
      const code = fs.readFileSync(path.join(outputDir, `${name}.min.js`), "utf8");
      const map = fs.readFileSync(path.join(outputDir, `${name}.min.js.map`), "utf8");
      if (sha256(code) !== cache.bundles[name]?.code) return null;
      if (sha256(map) !== cache.bundles[name]?.map) return null;
      outputs[name] = code;
      sourceMaps[name] = map;
    } catch (error) {
      return null;
    }
  }
  return { outputs, sourceMaps };
}

function writeCache(outputs, sourceMaps) {
  const bundles = {};
  for (const name of Object.keys(outputs)) {
    bundles[name] = { code: sha256(outputs[name]), map: sha256(sourceMaps[name]) };
  }
  try {
    fs.writeFileSync(cachePath, JSON.stringify({ sources: inputFingerprint(), bundles }));
  } catch (error) {
    // 缓存只是加速手段，写失败不应让构建失败
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
  const cached = readCachedOutputs();
  let outputs = {};
  let sourceMaps = {};
  if (cached) {
    outputs = cached.outputs;
    sourceMaps = cached.sourceMaps;
  } else {
    for (const [name, files] of Object.entries(manifest)) {
      const compiled = await compile(name, files);
      outputs[name] = compiled.code;
      sourceMaps[name] = compiled.map;
    }
  }
  const index = fs.readFileSync(path.join(publish, "index.html"), "utf8");
  assertRepositoryPublishVersion(root, outputs, index);
  if (checkOnly) {
    if (!cached) {
      const stale = Object.entries(outputs).filter(([name, code]) => {
        const file = path.join(outputDir, `${name}.min.js`);
        if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== code) return true;
        const mapFile = path.join(outputDir, `${name}.min.js.map`);
        return !fs.existsSync(mapFile) || fs.readFileSync(mapFile, "utf8") !== sourceMaps[name];
      }).map(([name]) => name);
      if (stale.length) throw new Error(`Stale publish bundles: ${stale.join(", ")}; run npm run build:bundles`);
      writeCache(outputs, sourceMaps);
    }
    console.log(`Publish bundles are current: ${Object.keys(outputs).join(", ")}`);
    return;
  }
  writeCache(outputs, sourceMaps);
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
