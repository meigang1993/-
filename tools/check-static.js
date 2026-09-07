const fs = require("fs");
const path = require("path");
const vm = require("vm");
const manifest = require("./publish-bundles.json");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");
const publish = path.join(root, "publish");
const maxJsLines = 200;
const failures = [];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    out.push({ full, stat });
    if (stat.isDirectory()) walk(full, out);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function fail(message) {
  failures.push(message);
}

function checkPublishExists() {
  if (!fs.existsSync(path.join(publish, "index.html"))) {
    fail("publish/index.html is missing");
  }
}

function checkEntryScripts() {
  const entry = path.join(publish, "index.html");
  if (!fs.existsSync(entry)) return;
  const source = fs.readFileSync(entry, "utf8");
  const externalScripts = [...source.matchAll(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi)]
    .map(match => match[0]);
  const blocking = externalScripts.filter(tag => !/\sdefer(?:\s|=|>)/i.test(tag));
  if (blocking.length) fail(`publish/index.html has ${blocking.length} parser-blocking external scripts`);
}

function checkPublishPaths(entries) {
  for (const { full } of entries) {
    const parts = rel(full).split("/");
    const bad = parts.find(part => /[^\x00-\x7f]| /.test(part));
    if (bad) fail(`Invalid publish path segment: ${rel(full)}`);
  }
}

function checkPublishBoundary(entries) {
  const expected = new Set(Object.keys(manifest).map(name => `bundles/${name}.min.js`));
  const actual = entries
    .filter(({ full, stat }) => !stat.isDirectory() && full.endsWith(".js"))
    .map(({ full }) => path.relative(publish, full).replace(/\\/g, "/"));
  const unexpected = actual.filter(file => !expected.has(file));
  const missing = [...expected].filter(file => !actual.includes(file));
  if (unexpected.length) fail(`publish contains non-bundle JavaScript: ${unexpected.join(", ")}`);
  if (missing.length) fail(`publish is missing generated bundles: ${missing.join(", ")}`);
}

function checkJsFiles(entries, enforceLineLimit) {
  for (const { full, stat } of entries) {
    if (stat.isDirectory() || !full.endsWith(".js")) continue;
    const source = fs.readFileSync(full, "utf8");
    try {
      new vm.Script(source, { filename: rel(full) });
    } catch (error) {
      fail(`Syntax check failed: ${rel(full)}\n${error.message}`);
    }
    if (enforceLineLimit) {
      const lines = source.split(/\r?\n/).length;
      if (lines > maxJsLines) fail(`${rel(full)} has ${lines} lines; limit is ${maxJsLines}`);
    }
  }
}

function checkDesktopOnlyRuntime(entries) {
  const banned = [
    ["visualViewport", /\bvisualViewport\b/],
    ["disabled user scaling", /\buser-scalable\b/i],
    ["touch-action CSS", /\btouch-action\s*:/i],
    ["touch event handlers", /\b(?:touchstart|touchmove|touchend|touchcancel)\b/i],
    ["orientation handlers", /\b(?:orientationchange|screen\.orientation)\b/i],
    ["narrow-device max-width media query", /@media[^{]*\(\s*max-width\s*:/i],
  ];
  const textExtensions = new Set([".css", ".html", ".js"]);
  for (const { full, stat } of entries) {
    if (stat.isDirectory() || !textExtensions.has(path.extname(full))) continue;
    const source = fs.readFileSync(full, "utf8");
    for (const [label, pattern] of banned) {
      if (pattern.test(source)) fail(`${rel(full)} contains forbidden ${label}`);
    }
  }
}

checkPublishExists();
checkEntryScripts();
const entries = fs.existsSync(publish) ? walk(publish) : [];
const sourceEntries = fs.existsSync(sourceDir) ? walk(sourceDir) : [];
checkPublishPaths(entries);
checkPublishBoundary(entries);
checkJsFiles(entries, false);
checkJsFiles(sourceEntries, true);
checkDesktopOnlyRuntime([...entries, ...sourceEntries]);

if (failures.length) {
  console.error("Static checks failed:");
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Static checks passed: ${entries.length} publish entries, ${sourceEntries.length} source entries`);
