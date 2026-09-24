const fs = require("fs");
const path = require("path");

const standalone = Object.freeze([
  "test-frame-performance.js",
  "test-soldier-six-phases-live.js",
  "test-confusion-freeze-live.js",
  "test-paralysis-lock-ui-live.js",
  "test-paralysis-effect-live.js",
  "test-status-lock-icons-live.js",
  "test-ruins-layout-live.js",
  "test-ruins-dodge-live.js",
  "test-ruins-counter-live.js",
  "test-ai-ruins-cards-live.js",
  "test-dungeon-playtest-live.js",
  "test-dungeon-walkthrough-live.js",
  "test-artina-skills-live.js",
  "test-artina-sniper-converted-live.js",
  "test-artina-sniper-boss-live.js",
  "test-sniper-converted-dodge-live.js",
  "test-ruins-sniper-once-live.js",
  "test-tank-shell-dodge-live.js",
  "test-ruins-dragon-boss-live.js",
  "test-ruins-dragon-tailgun.js",
  "test-ruins-dragon-deathwave-live.js",
  "test-witherer1312-live.js",
  "test-witherer1312-hell-live.js",
  "test-relic-once-per-turn.js",
  "test-badge-hand-overlap-live.js",
  "test-dragon-drill-guard-live.js",
  "test-dragon-drill-share-live.js",
  "test-ruins-dragon-combo-vs-counter-live.js",
  "test-kaiichi-share-anim-live.js",
  "test-ruins-relics-live.js",
  "test-ruins-relics-aoe-live.js",
  "test-smart-brain-tactic-live.js",
  "test-mark-badges-stack-live.js",
  "test-card-transfer-endpoints.js",
  "test-ruins-relics-aoe-4live.js",
  "test-thruster-draw-anim-live.js",
  "test-ruins-gold-difficulty.js",
  "test-ruins-gold-difficulty-live.js",
  "test-ruins-dragon-heroic-relics-live.js",
  "test-codex-pop-role-live.js",
  "test-relic-missing-effects-live.js",
  "test-flora-wing-vs-shell-live.js",
  "test-ruins-landmine-rps-live.js",
  "test-landmine-counter-response-live.js",
  "test-landmine-rps-dungeon-live.js",
  "test-landmine-rps-stuck-live.js",
  "test-landmine-locked-stuck-live.js",
  "test-landmine-rps-confirm-live.js",
  "test-landmine-convert-live.js",
  "test-landmine-counter-paths-live.js",
  "check-ruins-boss-bounty-live.js",
  "test-underwater-elite-stats.js",
  "test-ruins-grunt-skills-live.js",
  "test-ruins-landmine-live.js",
  "test-ruins-cards-response-modes-live.js",
  "test-ruins-doc-specs-live.js",
  "test-sweep-manual-response-live.js",
  "test-landmine-response-verbs-live.js",
  "test-ruins-rest6-manual-live.js",
  "test-ruins-unlock-dialog-live.js",
  "test-ruins-unlock-difficulty-live.js",
  "test-ruins-unlock-closex-live.js",
  "test-landmine-aoe-live.js",
  "test-ai-orc-cards.js",
  "test-ai-orc-cards-all.js",
  "test-ai-orc-cards-live.js",
  "test-ai-orc-cards-all-live.js",
  "test-ai-orc-cards-rest.js",
  "test-orc-cards-rest-live.js",
  "test-ai-underwater-cards.js",
  "test-hover-tools-landmine-live.js",
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
    "test-battle-save-io.js",
    "test-battle-checkpoint-codec.js",
    "test-battle-checkpoint-snapshot.js",
    "test-battle-checkpoint-scheduling.js",
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
    "test-ruins-sand-city-layout.js",
    "test-ruins-boss-bounty-group.js",
    "check-enemy-pools.js",
    "check-bounty-groups.js",
    "check-bounty-elite-live.js",
    "test-ruins-grunt-skills.js",
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
    "test-ruins-card-effects.js",
    "test-ruins-cards-practical.js",
    "test-ai-ruins-cards.js",
    "test-ruins-card-flag-driven.js",
    "test-ruins-dodge-counter.js",
    "test-status-card-judgement-popup.js",
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
    "test-maria-blessing-tempattack.js",
    "test-new-character-relic-matrix.js",
    "test-wendy-tutor-new-tactics.js",
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
    "test-angelica-berserker-skin.js",
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
