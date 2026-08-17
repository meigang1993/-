const fs = require("fs");
const path = require("path");
const groups = Object.freeze({
  platform: [
    ["accessibility", "accessibility.spec.js"],
    ["online-parity", "online-parity.spec.js"],
    ["bundle-runtime", "preview-bundle-runtime.spec.js"],
    ["deferred-flows", "preview-deferred-flows.spec.js"],
    ["smoke", "preview.spec.js"],
    ["startup-direct-kv", "startup-direct-kv.spec.js"],
  ],
  storage: [
    ["storage-lifecycle", "preview-storage-lifecycle.spec.js"],
    ["storage-runtime", "preview-storage-runtime.spec.js"],
    ["storage-slots", "preview-storage-slots.spec.js"],
    ["storage-core", "preview-storage.spec.js"],
  ],
  progression: [
    ["dungeon-flow", "dungeon-flow.spec.js"],
    ["dungeon-map", "dungeon-map.spec.js"],
    ["battle-rewards", "preview-battle-rewards.spec.js"],
    ["progression-character", "preview-progression-character.spec.js"],
    ["progression-equipment", "preview-progression-equipment.spec.js"],
    ["progression-skins", "preview-progression-skins.spec.js"],
    ["unlocks", "preview-unlocks.spec.js"],
  ],
  "battle-core": [
    ["battle-status", "preview-battle-status.spec.js"],
    ["battle-hand", "preview-battle-hand.spec.js"],
    ["battle-card-sizing", "preview-battle-card-sizing.spec.js"],
    ["battle-layout", "preview-battle-layout.spec.js"],
    ["battle-hand-owner", "preview-battle-hand-owner.spec.js"],
    ["battle-pile-stats", "preview-battle-pile-stats.spec.js"],
    ["battle-play-stress", "preview-battle-play-stress.spec.js"],
    ["card-sharing", "preview-card-sharing.spec.js"],
    ["character-ui", "preview-character-ui.spec.js"],
    ["dimension-transfer", "preview-dimension-transfer.spec.js"],
    ["edis-chain", "preview-edis-chain.spec.js"],
    ["nanali-battle", "preview-nanali-battle.spec.js"],
  ],
  "battle-effects": [
    ["battle-aoe", "preview-battle-aoe.spec.js"],
    ["battle-effect-lifecycle", "preview-battle-effect-lifecycle.spec.js"],
    ["battle-effect-rendering", "preview-battle-effects.spec.js"],
    ["battle-feedback", "preview-battle-feedback.spec.js"],
    ["battle-ui", "preview-battle-ui.spec.js"],
    ["card-motion", "preview-card-motion.spec.js"],
    ["damage-effects", "preview-damage-effects.spec.js"],
    ["defense-effects", "preview-defense-effects.spec.js"],
  ],
  presentation: [
    ["assets", "preview-assets.spec.js"],
    ["bertis-skin-effects", "preview-bertis-skin-effects.spec.js"],
    ["card-art", "preview-card-art.spec.js"],
    ["flora-sonic-skin-effects", "preview-flora-sonic-skin-effects.spec.js"],
    ["hall-ui", "preview-hall-ui.spec.js"],
    ["lokar-besta-skin-effects", "preview-lokar-besta-skin-effects.spec.js"],
    ["manny-skin-effects", "preview-manny-skin-effects.spec.js"],
    ["modal-focus", "preview-modal-focus.spec.js"],
    ["nonoka-skin-effects", "preview-nonoka-skin-effects.spec.js"],
    ["wendy-teacher-skin-effects", "preview-wendy-teacher-skin-effects.spec.js"],
    ["relic-equipment", "preview-relic-equipment.spec.js"],
    ["render-stability", "preview-render-stability.spec.js"],
    ["skins-effects", "preview-skins-effects.spec.js"],
  ],
});
const tests = Object.entries(groups).flatMap(([group, entries]) =>
  entries.map(([id, file]) => ({ group, id, file })));
const scenarioPattern = /require\(["']\.\/([^"']+\.scenario\.js)["']\)/g;
const suites = Object.freeze({
  release: [
    "accessibility.spec.js",
    "preview-bundle-runtime.spec.js",
    "preview.spec.js",
    "startup-direct-kv-1.scenario.js",
    "startup-direct-kv-2.scenario.js",
    "preview-storage-lifecycle.spec.js",
    "preview-storage-runtime.spec.js",
    "preview-storage-slots-1.scenario.js",
    "preview-storage-slots-3.scenario.js",
    "preview-storage.spec.js",
    "preview-deferred-flows.spec.js",
    "dungeon-flow-1.scenario.js",
    "dungeon-flow-2.scenario.js",
    "dungeon-map.spec.js",
    "preview-battle-rewards.spec.js",
    "preview-progression-character.spec.js",
    "preview-progression-equipment.spec.js",
    "preview-progression-skins.spec.js",
    "preview-battle-status.spec.js",
    "preview-battle-hand.spec.js",
    "preview-battle-card-sizing.spec.js",
    "preview-battle-layout.spec.js",
    "preview-battle-hand-owner.spec.js",
    "preview-battle-play-stress.spec.js",
    "preview-battle-effect-lifecycle-3.scenario.js",
    "preview-battle-effect-lifecycle-5.scenario.js",
    "preview-battle-ui-1.scenario.js",
    "preview-card-motion-1.scenario.js",
    "preview-assets.spec.js",
    "preview-hall-ui.spec.js",
    "preview-modal-focus.spec.js",
    "preview-relic-equipment.spec.js",
    "preview-skins-effects.spec.js",
    "preview-wendy-teacher-skin-effects.spec.js",
  ],
});

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
