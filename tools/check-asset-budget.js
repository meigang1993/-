const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repository = path.resolve(__dirname, "..");
const root = path.join(repository, "publish");
const sourceDir = path.join(repository, "src", "original");
const assets = path.join(root, "assets");
const limits = {
  criticalTotal: 2 * 1024 * 1024,
  singleFile: 2 * 1024 * 1024,
  sceneAudio: 1.75 * 1024 * 1024,
  longAudioTotal: 21 * 1024 * 1024,
  publishAssetsTotal: 40 * 1024 * 1024,
};
const audioExtensions = new Set([".m4a", ".mp3", ".ogg", ".wav"]);

function criticalAssets() {
  const context = { console, window: {} };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(sourceDir, "assets.js"), "utf8"),
    context,
    { filename: "src/original/assets.js" }
  );
  const urls = context.GameAssets?.criticalUrls?.();
  if (!Array.isArray(urls)) throw new Error("GameAssets.criticalUrls() must return an array");
  return [...new Set(urls.map(url => String(url).replace(/^\.\//, "")))];
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push({ full, size: stat.size });
  }
  return out;
}

function format(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

const failures = [];
const files = fs.existsSync(assets) ? walk(assets) : [];
const total = files.reduce((sum, item) => sum + item.size, 0);
const longAudio = files.filter(item =>
  audioExtensions.has(path.extname(item.full).toLowerCase()) && item.size > 256 * 1024
);
const longAudioTotal = longAudio.reduce((sum, item) => sum + item.size, 0);
let critical = [];
try {
  critical = criticalAssets();
} catch (err) {
  failures.push(`Cannot read runtime critical assets: ${err.message}`);
}
const criticalTotal = critical.reduce((sum, relative) => {
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`)) {
    failures.push(`Critical asset escapes publish/: ${relative}`);
    return sum;
  }
  if (!fs.existsSync(file)) {
    failures.push(`Missing critical asset: publish/${relative}`);
    return sum;
  }
  return sum + fs.statSync(file).size;
}, 0);

if (criticalTotal > limits.criticalTotal) {
  failures.push(`Critical assets total ${format(criticalTotal)} exceeds ${format(limits.criticalTotal)}`);
}
if (total > limits.publishAssetsTotal) {
  failures.push(`publish/assets total ${format(total)} exceeds ${format(limits.publishAssetsTotal)}`);
}
if (longAudioTotal > limits.longAudioTotal) {
  failures.push(`Long audio total ${format(longAudioTotal)} exceeds ${format(limits.longAudioTotal)}`);
}
longAudio.filter(item => item.size > limits.sceneAudio).forEach(item => {
  failures.push(`${path.relative(root, item.full)} is ${format(item.size)}; per-scene audio limit is ${format(limits.sceneAudio)}`);
});
files.filter(item => item.size > limits.singleFile).forEach(item => {
  failures.push(`${path.relative(root, item.full)} is ${format(item.size)}; per-file limit is ${format(limits.singleFile)}`);
});

if (failures.length) {
  console.error("Asset budget check failed:");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log(
  `Asset budget passed: critical ${format(criticalTotal)}, long audio ${format(longAudioTotal)}, ` +
  `total ${format(total)}, ${files.length} files`
);
