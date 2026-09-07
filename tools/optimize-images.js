const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { root, walk, writeReport, formatBytes, replacementFile } = require("./optimization-utils");

const assetRoot = path.resolve(process.env.OPTIMIZE_ASSET_ROOT || path.join(root, "publish", "assets"));
const extensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const write = process.argv.includes("--write");
sharp.cache(false);

function encoder(image, format) {
  if (format === "png") return image.png({ compressionLevel: 9, adaptiveFiltering: true });
  if (format === "jpeg") return image.jpeg({ quality: 88, mozjpeg: true });
  return image.webp({ quality: 88, effort: 6, smartSubsample: true });
}

function displayDimensions(metadata) {
  const rotated = [5, 6, 7, 8].includes(Number(metadata.orientation));
  return {
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
  };
}

async function inspect(file) {
  const originalStat = fs.statSync(file);
  const before = originalStat.size;
  const metadata = await sharp(file).metadata();
  const relative = path.relative(root, file).replace(/\\/g, "/");
  if (metadata.pages > 1) {
    return { file: relative, before, skipped: "animated image" };
  }
  const format = metadata.format === "jpg" ? "jpeg" : metadata.format;
  if (!["png", "jpeg", "webp"].includes(format)) {
    return { file: relative, before, skipped: `unsupported ${metadata.format}` };
  }
  const dimensions = displayDimensions(metadata);
  const output = await encoder(sharp(file).rotate(), format).toBuffer();
  const optimizedMetadata = await sharp(output).metadata();
  if (optimizedMetadata.width !== dimensions.width || optimizedMetadata.height !== dimensions.height) {
    throw new Error(`dimension mismatch for ${relative}`);
  }
  const after = output.length;
  const savings = Math.max(0, before - after);
  let replaced = false;
  if (write && savings > Math.max(1024, before * 0.02)) {
    const temporary = replacementFile(file);
    try {
      fs.writeFileSync(temporary, output);
      fs.chmodSync(temporary, originalStat.mode & 0o777);
      await sharp(temporary).metadata();
      fs.renameSync(temporary, file);
      replaced = true;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  return {
    file: relative,
    format,
    width: dimensions.width,
    height: dimensions.height,
    sourceOrientation: metadata.orientation || 1,
    alpha: !!metadata.hasAlpha,
    before,
    optimized: after,
    savings,
    savingsPct: before ? Number((savings / before * 100).toFixed(2)) : 0,
    replaced,
  };
}

(async () => {
  const files = walk(assetRoot, file => extensions.has(path.extname(file).toLowerCase()));
  const results = [];
  for (const file of files) results.push(await inspect(file));
  const candidates = results.filter(item => item.savings > Math.max(1024, item.before * 0.02));
  const totals = results.reduce((sum, item) => ({
    before: sum.before + (item.before || 0),
    optimized: sum.optimized + (item.optimized || item.before || 0),
    savings: sum.savings + (item.savings || 0),
    replaced: sum.replaced + (item.replaced ? 1 : 0),
  }), { before: 0, optimized: 0, savings: 0, replaced: 0 });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: write ? "write" : "audit",
    files: results.length,
    candidates: candidates.length,
    totals,
    results: results.sort((a, b) => (b.savings || 0) - (a.savings || 0)),
  };
  writeReport("images", report);
  console.log(
    `Image optimization ${write ? "write" : "audit"} passed: ${results.length} files, ` +
    `${candidates.length} candidates, potential ${formatBytes(totals.savings)}, replaced ${totals.replaced}`
  );
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
