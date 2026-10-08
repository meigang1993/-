const fs = require("fs");
const path = require("path");

const standalone = Object.freeze([]);

// 单脚本超时（秒）：多段/连击类用例要驱动完整回合与动画队列，远超默认 180s，
// 用统一默认值会被 SIGKILL 误杀，退出码 124 的表现与“浏览器崩溃”一模一样。
// 在此登记的文件由 run-live-suite.js 按文件覆盖 --timeout。
const timeouts = Object.freeze({
  "test-multihit-vs-counter-live.js": 300,
  "test-crazy-bayonet-multihit-live.js": 300,
  "test-phantom-sword-dance-live.js": 240,
  "test-edis-chainsaw-vs-counter-live.js": 240,
  // 每段各弹一次交牌窗，需等交牌窗挂载并跳过，等待链更长
  "test-double-and-chain-slash-live.js": 300,
  "test-reaction-queue-guards-live.js": 300,
});

const timeoutFor = (file, fallback) => timeouts[file] || fallback;

const groups = Object.freeze({
  contracts: [
    "test-git-save-guard.js",
    "test-original-health-coverage.js",
    "test-original-runtime-ownership.js",
    "test-publish-build-version.js",
    "test-asar-content-smoke.js",
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
    "test-ruins-sand-city-groups.js",
    "check-enemy-pools.js",
    "check-bounty-groups.js",
    "check-bounty-hunt-drops.js",
    "check-exp-multiplier-and-orc-groups.js",
    "check-dungeon-routes.js",
    "check-ruins-enemy-skill-text.js",
    "check-bounty-elite-live.js",
    "test-ruins-grunt-skills.js",
    "test-dungeon-playtest-live.js",
    "test-dungeon-route-integrity-live.js",
    "test-dungeon-walkthrough-live.js",
    "test-onboarding-first-battle-live.js",
    "test-onboarding-first-victory-exp-live.js",
    "test-onboarding-flow-live.js",
    "test-onboarding-robustness-live.js",
    "test-onboarding-story-events-live.js",
    "test-ruins-difficulty-scale.js",
    "test-ruins-doc-specs-live.js",
    "test-ruins-gold-difficulty-live.js",
    "test-ruins-gold-difficulty.js",
    "test-underwater-elite-stats.js",
  ],
  battle: [
    "test-raff-control-eye-cost-live.js",
    "test-raff-control-eye-live.js",
    "test-multihit-vs-counter-live.js",
    "test-heartblood-curse-multihit-live.js",
    "test-heartblood-curse-timing-live.js",
    "test-supply-drop-team-draw-live.js",
    "test-supply-drop-4p-live.js",
    "test-draw-discard-group-pack-live.js",
    "test-reaction-queue-guards-live.js",
    "test-aileng-bet-instant-draw-live.js",
    "test-aileng-bet-instant-discard-live.js",
    "test-aileng-awaken-persist-live.js",
    "test-phantom-sword-dance-live.js",
    "test-crazy-bayonet-multihit-live.js",
    "test-double-and-chain-slash-live.js",
    "test-multihit-slash-sweep-live.js",
    "test-edis-chainsaw-vs-counter-live.js",
    "test-dungeon-drop-rate-live.js",
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
    "test-card-pool-sync-live.js",
    "test-card-transfer-avatar-flight-live.js",
    "test-draw-discard-instant-live.js",
    "test-draw-group-collapse-live.js",
    "test-multi-unit-draw-discard-group-live.js",
    "test-gaincards-fromuid-flight-live.js",
    "test-relic-transfer-flight-live.js",
    "test-card-transfer-ownership-live.js",
    "test-ally-card-loan-ownership-live.js",
    "test-ally-card-loan-ownership-2-live.js",
    "test-hitwell-curse-ally-ownership-live.js",
    "test-card-ownership-keep-live.js",
    "test-formal-card-edge-contracts.js",
    "test-status-card-rules.js",
    "test-ruins-card-effects.js",
    "test-ruins-cards-practical.js",
    "test-ai-ruins-cards.js",
    "test-ruins-card-flag-driven.js",
    "test-ruins-dodge-counter.js",
    "test-status-card-judgement-popup.js",
    "check-ruins-boss-bounty-live.js",
    "test-ai-orc-cards-all-live.js",
    "test-ai-orc-cards-all.js",
    "test-ai-orc-cards-live.js",
    "test-ai-orc-cards-rest.js",
    "test-ai-orc-cards.js",
    "test-ai-ruins-cards-live.js",
    "test-ai-underwater-cards.js",
    "test-cadicis-responsibility-choice-live.js",
    "test-card-transfer-endpoints.js",
    "test-confusion-freeze-live.js",
    "test-dragon-drill-guard-live.js",
    "test-dragon-drill-share-live.js",
    "test-dragon-tailgun-fix.js",
    "test-helicopter-hell-live.js",
    "test-helicopter-skills-live.js",
    "test-helicopter-suppress-propeller-live.js",
    "test-landmine-aoe-live.js",
    "test-landmine-convert-live.js",
    "test-landmine-counter-paths-live.js",
    "test-landmine-counter-response-live.js",
    "test-landmine-locked-stuck-live.js",
    "test-landmine-response-verbs-live.js",
    "test-landmine-rps-confirm-live.js",
    "test-landmine-response-trigger-live.js",
    "test-landmine-rps-dungeon-live.js",
    "test-landmine-use-response-and-snipe-live.js",
    "test-landmine-rps-stuck-live.js",
    "test-mark-badges-stack-live.js",
    "test-orc-cards-rest-live.js",
    "test-paralysis-click-guard-live.js",
    "test-paralysis-lock-ui-live.js",
    "test-paralysis-no-response-live.js",
    "test-paralysis-response-coverage-live.js",
    "test-paralysis-response-second-sweep-live.js",
    "test-backflip-verb-consistency-live.js",
    "test-deflect-verb-consistency-live.js",
    "test-response-verbs-three-cards-live.js",
    "test-response-verb-trail-live.js",
    "test-ruins-cards-response-modes-live.js",
    "test-ruins-counter-live.js",
    "test-ruins-dodge-live.js",
    "test-ruins-dragon-boss-live.js",
    "test-ruins-dragon-combo-vs-counter-live.js",
    "test-ruins-dragon-deathwave-live.js",
    "test-ruins-dragon-tailgun.js",
    "test-ruins-landmine-live.js",
    "test-ruins-landmine-rps-live.js",
    "test-ruins-rest6-manual-live.js",
    "test-ruins-shop-unlock-live.js",
    "test-dungeon-drops-all-live.js",
    "test-ruins-relic-drops-live.js",
    "test-smart-brain-tactic-live.js",
    "test-soldier-six-phases-live.js",
    "test-sweep-manual-response-live.js",
    "test-tank-shell-dodge-live.js",
    "test-thruster-draw-anim-live.js",
    "test-witherer-eye-entity-live.js",
    "test-witherer-eye-entity.js",
    "test-witherer-eye-regress2.js",
    "test-witherer-virtual-full-audit.js",
    "test-witherer-virtual-guard.js",
    "test-witherer-virtual-source-live.js",
    "test-witherer1312-hell-live.js",
    "test-witherer1312-live.js",
  ],
  characters: [
    "test-hitwell-skills-strict-live.js",
    "test-card-transfer-anim-live.js",
    "test-nanali-skills.js",
    "test-nanali-unlock-price-live.js",
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
    "test-ruins-relic-conflicts.js",
    "test-wendy-tutor-new-tactics.js",
    "test-skill-coverage.js",
    "test-skill-audit.js",
    "test-little-elrana-unlock-live.js",
    "test-butler-manual-tutorial-goal-live.js",
    "test-all-unlock-events-live.js",
    "test-artina-skills-live.js",
    "test-artina-sniper-boss-live.js",
    "test-artina-sniper-converted-live.js",
    "test-butler-manual-full-unlock-live.js",
    "test-butler-manual-goals-live.js",
    "test-butler-manual-hero-locked-live.js",
    "test-butler-manual-live.js",
    "test-butler-manual-trigger-live.js",
    "test-carrier-fixes-live.js",
    "test-carrier-skills-live.js",
    "test-catherine-skills-live.js",
    "test-catherine-steal-flow-live.js",
    "test-drill-blood-edge-live.js",
    "test-flora-wing-vs-shell-live.js",
    "test-hilde-skills-live.js",
    "test-ice-dagger-gain-live.js",
    "test-kaiichi-share-anim-live.js",
    "test-relic-conflict-fixes-live.js",
    "test-relic-conversion-damage-live.js",
    "test-relic-heal-ally-live.js",
    "test-relic-missing-effects-live.js",
    "test-relic-once-per-turn.js",
    "test-relic-virtual-guard.js",
    "test-ruins-dragon-heroic-relics-live.js",
    "test-ruins-grunt-skills-live.js",
    "test-ruins-relics-aoe-4live.js",
    "test-ruins-relics-aoe-live.js",
    "test-ruins-relics-live.js",
    "test-ruins-sniper-once-live.js",
    "test-ruins-unlock-closex-live.js",
    "test-ruins-unlock-dialog-live.js",
    "test-ruins-unlock-difficulty-live.js",
    "test-sniper-converted-dodge-live.js",
    "test-soul-scythe-entity-live.js",
    "test-soul-scythe-relic-conversion.js",
    "test-tailgun-bayonet-live.js",
    "test-trail-duel-relic-live.js",
    "test-unlock-adv-dialogue-live.js",
    "test-unlock-event-cast-coverage-live.js",
    "test-unlock-event-modal-size-live.js",
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
    "test-badge-hand-overlap-live.js",
    "test-codex-pop-role-live.js",
    "test-frame-performance.js",
    "test-hover-tools-landmine-live.js",
    "test-ruins-layout-live.js",
    "test-status-lock-icons-live.js",
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
  for (const file of Object.keys(timeouts)) {
    if (!fs.existsSync(path.join(root, "tools", file))) {
      throw new Error(`Timeout registered for missing QA test file: tools/${file}`);
    }
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

module.exports = { groups, standalone, tests, timeouts, timeoutFor, select, validate };
