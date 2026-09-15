const fs = require("fs");
const path = require("path");
const { loadDependency } = require("./repository-toolchain");
const acorn = loadDependency("acorn");
const {
  manifest,
  startupBundleNames,
  startupBundlePaths,
} = require("./publish-bundle-groups");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");
const publish = path.join(root, "publish");
const failures = [];
const owners = new Map();
const reads = new Map();
const allowedShared = new Set(["GameDataFutureEnemies"]);
const browserGlobals = new Set(["AudioContext", "Event"]);

function windowProperty(node) {
  return node?.type === "MemberExpression"
    && !node.computed
    && node.object?.type === "Identifier"
    && node.object.name === "window"
    && node.property?.type === "Identifier"
    ? node.property.name : null;
}

function visit(node, parent, file) {
  if (!node || typeof node !== "object") return;
  const property = windowProperty(node);
  if (property) {
    const write = parent?.type === "AssignmentExpression" && parent.left === node;
    const target = write ? owners : reads;
    if (!target.has(property)) target.set(property, new Set());
    target.get(property).add(file);
  }
  Object.values(node).forEach(value => {
    if (Array.isArray(value)) value.forEach(child => visit(child, node, file));
    else if (value && typeof value === "object") visit(value, node, file);
  });
}

const groups = Object.values(manifest);
const manifestFiles = groups.flat();
const rootScripts = fs.readdirSync(sourceDir).filter(file => file.endsWith(".js")).sort();
if (new Set(manifestFiles).size !== manifestFiles.length) failures.push("bundle manifest contains duplicate source files");
const missing = rootScripts.filter(file => !manifestFiles.includes(file));
const extra = manifestFiles.filter(file => !rootScripts.includes(file));
if (missing.length || extra.length) {
  failures.push(`bundle manifest mismatch; missing ${missing.join(", ") || "none"}; extra ${extra.join(", ") || "none"}`);
}

manifestFiles.forEach(file => {
  const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
  const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
  visit(ast, null, file);
});

owners.forEach((files, name) => {
  if (files.size > 1 && !allowedShared.has(name)) {
    failures.push(`window.${name} has multiple owners: ${[...files].join(", ")}`);
  }
});

reads.forEach((files, name) => {
  if (/^[A-Z]/.test(name) && !owners.has(name) && !browserGlobals.has(name)) {
    failures.push(`window.${name} is read but never exported: ${[...files].join(", ")}`);
  }
});

const expectedExports = {
  startup: "GameBundles",
  "startup-store": "GameStore",
  "startup-app": "AppRuntimeErrors",
  hall: "VillaCollectionUI",
  "battle-flow": "BattleSystem",
  dungeon: "DungeonSystem",
};
Object.entries(expectedExports).forEach(([group, name]) => {
  const files = owners.get(name) || new Set();
  if (![...files].some(file => manifest[group].includes(file))) {
    failures.push(`${group} bundle does not own window.${name}`);
  }
});

const index = fs.readFileSync(path.join(publish, "index.html"), "utf8");
const scriptTags = [...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map(match => ({ tag: match[0], src: match[1] }));
const scripts = scriptTags.map(entry => entry.src);
const cleanScripts = scripts.map(src => src.split(/[?#]/)[0]);
if (JSON.stringify(cleanScripts) !== JSON.stringify(startupBundlePaths)) {
  failures.push(`index script contract changed: ${scripts.join(", ") || "none"}`);
}
const blockingScripts = scriptTags.filter(entry => !/\sdefer(?:\s|=|>)/i.test(entry.tag));
if (blockingScripts.length) {
  failures.push(`index startup bundles must use defer: ${blockingScripts.map(entry => entry.src).join(", ")}`);
}
const buildVersion = index.match(/<meta\b[^>]*\bname=["']game-build["'][^>]*\bcontent=["']([^"']+)["']/i)?.[1];
const staleStartupBundles = scripts.filter(src =>
  new URL(src, "https://game.invalid/").searchParams.get("v") !== buildVersion);
if (!buildVersion || staleStartupBundles.length || scripts.length !== startupBundleNames.length) {
  failures.push(`index startup bundle cache versions must match meta[name=game-build]: ${staleStartupBundles.join(", ") || "none"}`);
}
const styles = [...index.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)]
  .map(match => match[1]);
const staleStyles = styles.filter(href =>
  new URL(href, "https://game.invalid/").searchParams.get("v") !== buildVersion);
if (!styles.length || staleStyles.length) {
  failures.push(`index stylesheet cache versions must match meta[name=game-build]: ${staleStyles.join(", ") || "none"}`);
}
const villaCss = fs.readFileSync(path.join(publish, "villa.css"), "utf8");
const villaImports = [...villaCss.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/gi)]
  .map(match => match[1]);
const staleVillaImports = villaImports.filter(href =>
  new URL(href, "https://game.invalid/").searchParams.get("v") !== buildVersion);
if (!villaImports.length || staleVillaImports.length) {
  failures.push(`villa stylesheet imports must match meta[name=game-build]: ${staleVillaImports.join(", ") || "none"}`);
}
const badgeTag = index.match(/<span\b[^>]*\bclass=["'][^"']*\bbuild-badge\b[^"']*["'][^>]*>[^<]*<\/span>/i)?.[0] || "";
const badgeBuild = badgeTag.match(/\btitle=["']build ([^"']+)["']/i)?.[1];
const badgeLabel = badgeTag.match(/>([^<]+)</)?.[1]?.trim();
const versionParts = /^(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(buildVersion || "");
const expectedLabel = versionParts
  ? `v${versionParts[1].slice(2)}.${versionParts[2]}${versionParts[3]}.${versionParts[4]}`
  : "";
if (!badgeTag || badgeBuild !== buildVersion || badgeLabel !== expectedLabel) {
  failures.push("visible build badge must match meta[name=game-build]");
}

const loaderFiles = ["runtime-loader.js", "runtime-loader-state.js",
  "runtime-script-loader.js", "runtime-style-loader.js"];
const loader = loaderFiles
  .map(file => fs.readFileSync(path.join(sourceDir, file), "utf8"))
  .join("\n");
const deferredBundleParts = {
  hall: ["hall"],
  battle: ["battle-rules", "battle-skills", "battle-flow", "battle-ai", "battle-presentation", "battle-ui"],
  dungeon: ["dungeon"],
};
Object.entries(deferredBundleParts).forEach(([scene, groups]) => {
  groups.forEach(group => {
    if (!loader.includes(`"./bundles/${group}.min.js"`)) {
      failures.push(`runtime loader is missing the ${scene} bundle part ${group}`);
    }
  });
});
if (!loader.includes("meta[name=\"game-build\"]")
  || !loader.includes("versioned(source)")
  || !loader.includes("versioned(href)")) {
  failures.push("runtime loader must apply the index build version to deferred bundles and styles");
}

if (failures.length) {
  console.error("Script contract checks failed:");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`Script contracts passed: ${manifestFiles.length} sources, ${owners.size} window exports`);
