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
const expectedOutputs = Object.keys(manifest).map(name => `${name}.min.js`).sort();

function listJavaScript(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJavaScript(full, relative);
    return entry.name.endsWith(".js") ? [relative.replace(/\\/g, "/")] : [];
  });
}

function readSources(files) {
  return Object.fromEntries(files.map(file => {
    const full = path.join(sourceDir, file);
    if (!fs.existsSync(full)) throw new Error(`Missing bundle source: src/original/${file}`);
    return [file, fs.readFileSync(full, "utf8")];
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
    compress: false,
    mangle: {
      keep_classnames: true,
      keep_fnames: true,
    },
    ecma: 2020,
    format: {
      ascii_only: false,
      beautify: false,
      comments: false,
      preamble: `/*! generated from tools/publish-bundles.json: ${name} */`,
    },
  });
  if (!result.code) throw new Error(`Terser returned no output for ${name}`);
  return `${result.code}\n`;
}

async function main() {
  validateManifest();
  validatePublishBoundary();
  const outputs = {};
  for (const [name, files] of Object.entries(manifest)) outputs[name] = await compile(name, files);
  const index = fs.readFileSync(path.join(publish, "index.html"), "utf8");
  assertRepositoryPublishVersion(root, outputs, index);
  if (checkOnly) {
    const stale = Object.entries(outputs).filter(([name, code]) => {
      const file = path.join(outputDir, `${name}.min.js`);
      return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== code;
    }).map(([name]) => name);
    if (stale.length) throw new Error(`Stale publish bundles: ${stale.join(", ")}; run npm run build:bundles`);
    console.log(`Publish bundles are current: ${Object.keys(outputs).join(", ")}`);
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  Object.entries(outputs).forEach(([name, code]) => {
    const target = path.join(outputDir, `${name}.min.js`);
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, code);
    fs.renameSync(temporary, target);
  });
  validatePublishBoundary();
  console.log(Object.entries(outputs).map(([name, code]) => `${name} ${(Buffer.byteLength(code) / 1024).toFixed(1)} KiB`).join(", "));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
