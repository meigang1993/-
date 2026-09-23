const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const terser = require("terser");
const manifest = require("./publish-bundles.json");
const { root, writeReport, formatBytes } = require("./optimization-utils");

const sourceDir = path.join(root, "src", "original");
const publish = path.join(root, "publish");

async function minify(source, file) {
  const result = await terser.minify({ [file]: source }, {
    compress: false,
    mangle: { keep_classnames: true, keep_fnames: true },
    ecma: 2020,
    format: { ascii_only: false, comments: false },
  });
  if (typeof result.code !== "string") throw new Error(`Terser returned invalid output for ${file}`);
  return result.code;
}

(async () => {
  const groups = {};
  for (const [name, files] of Object.entries(manifest)) {
    const entries = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
      const code = await minify(source, file);
      entries.push({
        file,
        raw: Buffer.byteLength(source),
        minified: Buffer.byteLength(code),
        gzip: zlib.gzipSync(code, { level: 9 }).length,
      });
    }
    const totals = entries.reduce((sum, item) => ({
      raw: sum.raw + item.raw,
      minified: sum.minified + item.minified,
      gzip: sum.gzip + item.gzip,
    }), { raw: 0, minified: 0, gzip: 0 });
    groups[name] = {
      actualBundle: fs.statSync(path.join(publish, "bundles", `${name}.min.js`)).size,
      totals,
      sources: entries.sort((a, b) => b.minified - a.minified),
    };
  }
  writeReport("bundles", { generatedAt: new Date().toISOString(), groups });
  Object.entries(groups).forEach(([name, group]) => {
    const largest = group.sources.slice(0, 3).map(item => `${item.file} ${formatBytes(item.minified)}`).join(", ");
    console.log(`${name}: ${formatBytes(group.actualBundle)}; largest sources: ${largest}`);
  });
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
