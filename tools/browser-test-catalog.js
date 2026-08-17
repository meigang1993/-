const fs = require("fs");
const path = require("path");
const { groups, suites, tests } = require("./browser-test-manifest");
const scenarioPattern = /require\(["']\.\/([^"']+\.scenario\.js)["']\)/g;

function validate(root) {
  const ids = new Set();
  const files = new Set();
  const scenarioOwners = new Map();
  for (const test of tests) {
    if (ids.has(test.id)) throw new Error(`Duplicate browser test id: ${test.id}`);
    if (files.has(test.file)) throw new Error(`Duplicate browser test file: ${test.file}`);
    const testPath = path.join(root, "tests", test.file);
    if (!fs.existsSync(testPath)) {
      throw new Error(`Missing browser test file: tests/${test.file}`);
    }
    const source = fs.readFileSync(testPath, "utf8");
    for (const match of source.matchAll(scenarioPattern)) {
      const scenario = match[1];
      if (scenarioOwners.has(scenario)) {
        throw new Error(`Duplicate browser scenario owner: ${scenario}`);
      }
      if (!fs.existsSync(path.join(root, "tests", scenario))) {
        throw new Error(`Missing browser scenario file: tests/${scenario}`);
      }
      scenarioOwners.set(scenario, test.file);
    }
    ids.add(test.id);
    files.add(test.file);
  }
  const testDirectoryFiles = fs.readdirSync(path.join(root, "tests"));
  const unregisteredSpecs = testDirectoryFiles
    .filter(file => file.endsWith(".spec.js") && !files.has(file));
  if (unregisteredSpecs.length) {
    throw new Error(`Unregistered browser test files: ${unregisteredSpecs.join(", ")}`);
  }
  const unregisteredScenarios = testDirectoryFiles
    .filter(file => file.endsWith(".scenario.js") && !scenarioOwners.has(file));
  if (unregisteredScenarios.length) {
    throw new Error(`Unregistered browser scenario files: ${unregisteredScenarios.join(", ")}`);
  }
  for (const [suite, selectors] of Object.entries(suites)) {
    const suiteFiles = new Set();
    for (const file of selectors) {
      if (!files.has(file) && !scenarioOwners.has(file)) {
        throw new Error(`Unregistered ${suite} browser test file: tests/${file}`);
      }
      if (suiteFiles.has(file)) throw new Error(`Duplicate ${suite} browser test file: ${file}`);
      suiteFiles.add(file);
    }
    for (const file of suiteFiles) {
      const owner = scenarioOwners.get(file);
      if (owner && suiteFiles.has(owner)) {
        throw new Error(`${suite} browser suite includes both ${owner} and ${file}`);
      }
    }
  }
}

function select(selectors) {
  if (!selectors.length) throw new Error("Provide at least one browser test id or @group");
  const selected = [];
  const seen = new Set();
  for (const selector of selectors) {
    const group = selector.startsWith("@") ? selector.slice(1) : null;
    const matches = group
      ? tests.filter(test => test.group === group)
      : tests.filter(test => test.id === selector);
    if (!matches.length) throw new Error(`Unknown browser test selector: ${selector}`);
    for (const test of matches) {
      if (!seen.has(test.id)) selected.push(test);
      seen.add(test.id);
    }
  }
  return selected;
}

function selectSuite(name) {
  if (!suites[name]) throw new Error(`Unknown browser suite: ${name}`);
  return [...suites[name]];
}

function suiteGroups(name) {
  const files = new Set(selectSuite(name));
  const selectedGroups = new Set();
  for (const test of tests) {
    if (files.has(test.file)) selectedGroups.add(test.group);
    const source = fs.readFileSync(path.join(__dirname, "..", "tests", test.file), "utf8");
    for (const match of source.matchAll(scenarioPattern)) {
      if (files.has(match[1])) selectedGroups.add(test.group);
    }
  }
  return [...selectedGroups];
}

module.exports = { groups, suites, tests, select, selectSuite, suiteGroups, validate };
