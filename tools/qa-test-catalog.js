const fs = require("fs");
const path = require("path");

const standalone = Object.freeze([
  "test-frame-performance.js",
]);

const groups = Object.freeze({
  contracts: [
    "test-git-save-guard.js",
    "test-original-health-coverage.js",
    "test-original-runtime-ownership.js",
    "test-publish-build-version.js",
  ],
  storage: [
    "test-battle-start-save.js",
    "test-battle-resume-save.js",
    "test-store.js",
    "test-save-slots.js",
    "test-save-fuzz.js",
    "test-relic-whitelist.js",
  ],
  progression: [
    "test-local-core.js",
    "test-unlock-event-progress.js",
    "test-settlement-recovery.js",
    "test-economy-balance.js",
    "test-balance-values.js",
    "test-character-progression.js",
    "test-playable-roster-integrity.js",
    "test-receipt-ledgers.js",
    "test-bounty-system.js",
    "test-dungeon-matrix.js",
  ],
  battle: [
    "test-battle-ai-targeting.js",
    "test-animation-fallback.js",
    "test-battle-effects.js",
    "test-generated-attack-presentation.js",
    "test-battle-fx.js",
    "test-battle-audio-timing.js",
    "test-audio-loading.js",
    "test-battle-facades.js",
    "test-damage-attributes.js",
    "test-battle-runtime.js",
    "test-ui-battle-pickers.js",
    "test-battle-actions.js",
    "test-deflect-flow.js",
    "test-battle-log.js",
    "test-battle-mvp.js",
    "test-berserk-slash-lifecycle.js",
    "test-card-consistency.js",
    "test-formal-card-edge-contracts.js",
    "test-status-card-rules.js",
  ],
  characters: [
    "test-nanali-skills.js",
    "test-witherer-skills.js",
    "test-bakar-skills.js",
    "test-bakar-relic-conflicts.js",
    "test-machine-factory-skills.js",
    "test-edis-relic-conflict.js",
    "test-heroic-edis.js",
    "test-pursue-kill.js",
    "test-kaiichi-reaction-resume.js",
    "test-relic-effects.js",
    "test-all-relic-contracts.js",
    "test-guard-kelly-relics.js",
    "test-sakura-risa-skills.js",
    "test-ophelia-skills.js",
    "test-new-character-skills.js",
    "test-new-character-relic-matrix.js",
    "test-skill-coverage.js",
    "test-skill-audit.js",
  ],
  presentation: [
    "test-villa-collection.js",
    "test-assets.js",
    "test-battle-lines.js",
    "test-character-special-art.js",
    "test-bertis-queen-skin.js",
    "test-elrana-fallen-physician-skin.js",
    "test-flora-sonic-skin.js",
    "test-nonoka-idol-skin.js",
    "test-wendy-teacher-skin.js",
    "test-battle-effect-anchors.js",
    "test-character-skin-fx.js",
    "test-manny-gun-skin.js",
  ],
  determinism: [
    "test-seeded-battle.js",
    "test-battle-replay.js",
  ],
});

const idFor = file => file.replace(/^test-/, "").replace(/\.js$/, "");
const tests = Object.entries(groups).flatMap(([group, files]) =>
  files.map(file => ({ group, id: idFor(file), file })));

function validate(root) {
  const ids = new Set();
  const files = new Set();
  for (const test of tests) {
    if (ids.has(test.id)) throw new Error(`Duplicate QA test id: ${test.id}`);
    if (files.has(test.file)) throw new Error(`Duplicate QA test file: ${test.file}`);
    if (!fs.existsSync(path.join(root, "tools", test.file))) {
      throw new Error(`Missing QA test file: tools/${test.file}`);
    }
    ids.add(test.id);
    files.add(test.file);
  }
  const known = new Set([...files, ...standalone]);
  const unregistered = fs.readdirSync(path.join(root, "tools"))
    .filter(file => /^test-.*\.js$/.test(file) && !known.has(file));
  if (unregistered.length) {
    throw new Error(`Unregistered QA test files: ${unregistered.join(", ")}`);
  }
}

function select(selectors) {
  if (!selectors.length) throw new Error("Provide at least one QA group or test id");
  const selected = [];
  const seen = new Set();
  for (const selector of selectors) {
    const matches = groups[selector]
      ? tests.filter(test => test.group === selector)
      : tests.filter(test => test.id === selector);
    if (!matches.length) throw new Error(`Unknown QA group or test id: ${selector}`);
    for (const test of matches) {
      if (!seen.has(test.id)) selected.push(test);
      seen.add(test.id);
    }
  }
  return selected;
}

module.exports = { groups, standalone, tests, select, validate };
