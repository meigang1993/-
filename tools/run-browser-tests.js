const { spawn } = require("child_process");
const path = require("path");
require("./repository-toolchain");
const catalog = require("./browser-test-catalog");

const root = path.resolve(__dirname, "..");
const playwright = path.join(root, "node_modules", ".bin", "playwright");

catalog.validate(root);

function printList() {
  for (const [suite, selectors] of Object.entries(catalog.suites)) {
    console.log(`${suite} suite (${selectors.length} files)`);
  }
  for (const group of Object.keys(catalog.groups)) {
    const ids = catalog.tests.filter(test => test.group === group).map(test => test.id);
    console.log(`@${group} (${ids.length})`);
    ids.forEach(id => console.log(`  ${id}`));
  }
}

function splitArgs(args) {
  const separator = args.indexOf("--");
  return separator < 0
    ? { selectors: args, passthrough: [] }
    : { selectors: args.slice(0, separator), passthrough: args.slice(separator + 1) };
}

function normalizePassthrough(args) {
  return args[0] === "--" ? args.slice(1) : args;
}

function buildPlaywrightArgs(files, passthrough = [], config = null) {
  const args = ["test"];
  if (config) args.push("--config", config);
  args.push(...files.map(file => path.join("tests", file)), ...passthrough);
  return args;
}

function run(files, passthrough = [], config = null) {
  const args = buildPlaywrightArgs(files, passthrough, config);
  const child = spawn(playwright, args, { cwd: root, env: process.env, stdio: "inherit" });
  child.on("error", error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("close", code => {
    process.exitCode = code ?? 1;
  });
}

function main(argv = process.argv.slice(2)) {
  const [mode, ...args] = argv;
  if (mode === "list") {
    printList();
  } else if (catalog.suites[mode]) {
    run(catalog.selectSuite(mode), normalizePassthrough(args), "playwright.release.config.js");
  } else if (mode === "all") {
    run(catalog.tests.map(test => test.file), normalizePassthrough(args));
  } else if (mode === "focus") {
    try {
      const { selectors, passthrough } = splitArgs(args);
      run(catalog.select(selectors).map(test => test.file), passthrough);
    } catch (error) {
      console.error(
        `${error.message}. Run npm run test:original:browser:list for available names.`
      );
      process.exitCode = 2;
    }
  } else {
    console.error("Usage: node tools/run-browser-tests.js <release|all|focus|list>");
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = { buildPlaywrightArgs, main, normalizePassthrough, splitArgs };
