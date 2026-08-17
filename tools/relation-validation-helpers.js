const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(publish, file, context) {
  const code = fs.readFileSync(path.join(publish, file), "utf8");
  vm.runInNewContext(code, context, { filename: file });
}

function createChecks(failures) {
  const fail = message => failures.push(message);
  function unique(items, key, label) {
    const seen = new Set();
    items.forEach(item => {
      const value = item?.[key];
      if (!value) fail(`${label} is missing ${key}`);
      else if (seen.has(value)) fail(`Duplicate ${label} ${key}: ${value}`);
      seen.add(value);
    });
  }
  return { fail, unique };
}

function assetChecker(publish, fail) {
  return (ref, label) => {
    if (!ref || /^(https?:|data:|blob:)/.test(ref) || !/[/.]/.test(ref)) return;
    const clean = ref.replace(/^\.\//, "").split(/[?#]/)[0];
    if (!fs.existsSync(path.join(publish, clean))) fail(`${label} references missing asset: ${ref}`);
  };
}

function validateScripts(publish, sourceDir, unique, fail, dependencies) {
  const html = fs.readFileSync(path.join(publish, "index.html"), "utf8");
  const entryScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
  const cleanEntryScripts = entryScripts.map(src => src.split(/[?#]/)[0]);
  unique(entryScripts.map(src => ({ src })), "src", "script reference");
  cleanEntryScripts.forEach(src => {
    if (!fs.existsSync(path.join(publish, src))) fail(`index.html references missing script: ${src}`);
  });
  let scripts = cleanEntryScripts;
  if (cleanEntryScripts.some(src => /^bundles\/startup(?:-[a-z0-9-]+)?\.min\.js$/.test(src))) {
    const manifestFile = path.join(publish, "..", "tools", "publish-bundles.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    const startupGroups = Object.keys(manifest)
      .filter(group => group === "startup" || group.startsWith("startup-"));
    scripts = Object.values(manifest).flat();
    unique(scripts.map(src => ({ src })), "src", "bundle source");
    scripts.forEach(src => {
      if (!fs.existsSync(path.join(sourceDir, src))) fail(`Bundle manifest references missing source: ${src}`);
    });
    const groupOf = new Map(Object.entries(manifest).flatMap(([group, files]) => files.map(file => [file, group])));
    dependencies.forEach(chain => {
      for (let i = 1; i < chain.length; i += 1) {
        const beforeGroup = groupOf.get(chain[i - 1]), afterGroup = groupOf.get(chain[i]);
        if (beforeGroup !== afterGroup && !startupGroups.includes(beforeGroup)) {
          fail(`Invalid cross-bundle dependency: ${chain[i - 1]} (${beforeGroup}) -> ${chain[i]} (${afterGroup})`);
        }
      }
    });
  }
  dependencies.forEach(chain => {
    for (let i = 1; i < chain.length; i += 1) {
      const before = chain[i - 1], after = chain[i];
      if (scripts.indexOf(before) < 0 || scripts.indexOf(after) < 0) fail(`Missing dependency script: ${before} -> ${after}`);
      else if (scripts.indexOf(before) > scripts.indexOf(after)) fail(`Invalid script order: ${before} must load before ${after}`);
    }
  });
}

module.exports = { load, createChecks, assetChecker, validateScripts };
