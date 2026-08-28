const fs = require("fs");
const path = require("path");

const repositoryRoot = path.resolve(__dirname, "..");
const root = path.join(repositoryRoot, "publish");
const sourceRoot = path.join(repositoryRoot, "src", "original");
const assetRoot = path.join(root, "assets");
const sourceExt = /\.(html|css|js)$/i;
const reservedAssets = new Set([
  "assets/new-portraits/gerda.webp",
  "assets/new-portraits/hoshino-kaiichi.webp",
  "assets/new-portraits/hoshino-yi.webp",
  "assets/new-portraits/hoshino-yi-witherer.webp",
  "assets/new-portraits/sonia.webp",
  "assets/new-portraits/maria.webp",
  "assets/new-portraits/atina.webp",
].map(file => path.resolve(root, file)));
const refs = [];
const assets = [];

function walk(dir, includeAssets) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, includeAssets);
    } else if (includeAssets && full.startsWith(`${assetRoot}${path.sep}`)) {
      assets.push(full);
    } else if (sourceExt.test(full)) {
      if (full.startsWith(`${root}${path.sep}bundles${path.sep}`)) continue;
      refs.push(...findRefs(full));
    }
  }
}

function stripJsComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findRefs(file) {
  const isJs = file.endsWith(".js");
  const text = isJs ? stripJsComments(fs.readFileSync(file, "utf8")) : fs.readFileSync(file, "utf8");
  const found = [];
  const patterns = [
    { expression: /(?:src|href)=["']([^"']+)["']/g },
    { expression: /url\(["']?([^"')]+)["']?\)/g, accept: looksLikeResourceUrl },
    { expression: /["'](\.\/assets\/[^"'`]+)["']/g },
  ];

  for (const { expression, accept } of patterns) {
    let match;
    while ((match = expression.exec(text))) {
      const ref = match[1].trim();
      if ((!accept || accept(ref)) && shouldCheck(ref)) {
        found.push({ file, ref });
      }
    }
  }
  return found;
}

function looksLikeResourceUrl(ref) {
  return ref.includes("${")
    || /^(?:https?:|data:|blob:|#|\.{0,2}\/)/.test(ref)
    || /(?:^|\/)[^/?#]+\.[a-z0-9]{2,8}(?:[?#].*)?$/i.test(ref);
}

function shouldCheck(ref) {
  return ref &&
    !ref.includes("${") &&
    !/^(https?:|data:|blob:|#)/.test(ref);
}

function resolveRef(file, ref) {
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return null;
  if (file.startsWith(`${sourceRoot}${path.sep}`)) return path.resolve(root, clean);
  return path.resolve(path.dirname(file), clean);
}

walk(root, true);
walk(sourceRoot, false);

const missing = refs.filter(({ file, ref }) => {
  const resolved = resolveRef(file, ref);
  return resolved && !fs.existsSync(resolved);
});

if (missing.length) {
  console.error("Missing resource references:");
  for (const item of missing) {
    console.error(`- ${path.relative(process.cwd(), item.file)} -> ${item.ref}`);
  }
  process.exit(1);
}

const missingReserved = [...reservedAssets].filter(file => !fs.existsSync(file));
if (missingReserved.length) {
  console.error("Missing reserved assets:");
  for (const file of missingReserved) {
    console.error(`- ${path.relative(process.cwd(), file)}`);
  }
  process.exit(1);
}

const used = new Set(refs.map(({ file, ref }) => resolveRef(file, ref)).filter(Boolean));
const unused = assets.filter(file =>
  !used.has(file) &&
  !reservedAssets.has(file) &&
  !/\/(?:\.DS_Store|Thumbs\.db|\.gitkeep)$/i.test(file)
);

if (unused.length) {
  console.error("Unused published assets:");
  for (const file of unused) {
    console.error(`- ${path.relative(process.cwd(), file)}`);
  }
  process.exit(1);
}

const referencedAssetCount = assets.filter(file => used.has(file)).length;
console.log(
  `Resource reference check passed: ${refs.length} refs, ` +
  `${referencedAssetCount} referenced assets, ${reservedAssets.size} reserved assets`
);
