const fs = require("fs");
const path = require("path");
const { load, createChecks, assetChecker, validateScripts } = require("./relation-validation-helpers");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");
const publish = path.join(root, "publish");
const failures = [];
const { fail, unique } = createChecks(failures);
const assetExists = assetChecker(publish, fail);

const context = { console, window: {} };
context.window = context;
[
  "game-random.js",
  "economy-config.js",
  "data-cards.js",
  "data-characters-core.js",
  "data-characters-extra.js",
  "data-future-characters.js",
  "data-new-characters.js",
  "data-characters.js",
  "character-progression.js",
  "data-future-dungeons.js",
  "data-future-orc-enemies.js",
  "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js",
  "data-guard-kelly.js",
  "data-sakura-risa.js",
  "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js",
  "data-world.js",
  "data.js",
  "data-future-relics.js",
  "relics.js",
  "bounty-ledger.js",
  "receipt-ledger.js",
  "unlock-event-progress.js",
  "store-state-factory.js",
].forEach(file => load(sourceDir, file, context));

const characters = context.GameData.characters || [];
const missions = context.GameData.missions || [];
const enemyGroups = context.GameData.enemies || {};
const enemies = Object.values(enemyGroups).flat();
const testEnemies = context.GameData.testEnemies || [];
const cards = context.GameData.cardCodex || [];
const difficulties = context.GameData.difficulties || {};
const characterIds = new Set(characters.map(character => character.id));
const missionIds = new Set(missions.map(mission => mission.id));
const enemyIds = new Set(enemies.map(enemy => enemy.id));
const cardNames = new Set(cards.map(card => card.name));

unique(characters, "id", "character");
unique(missions, "id", "mission");
unique(enemies, "id", "enemy");
unique(testEnemies, "id", "test enemy");
unique(cards, "name", "card");

characters.forEach(character => {
  unique(character.skills || [], "name", `character skill ${character.id}`);
  assetExists(character.face, `character ${character.id}.face`);
  assetExists(character.art, `character ${character.id}.art`);
  assetExists(character.avatar, `character ${character.id}.avatar`);
});

enemies.forEach(enemy => {
  unique(enemy.skills || [], "name", `enemy skill ${enemy.id}`);
  assetExists(enemy.art, `enemy ${enemy.id}.art`);
  assetExists(enemy.bgm, `enemy ${enemy.id}.bgm`);
  assetExists(enemy.annihilationBgm, `enemy ${enemy.id}.annihilationBgm`);
});
testEnemies.forEach(enemy => {
  assetExists(enemy.art, `test enemy ${enemy.id}.art`);
  assetExists(enemy.bgm, `test enemy ${enemy.id}.bgm`);
});

missions.filter(mission => mission.kind === "dungeon").forEach(mission => {
  if (!enemyGroups[mission.id]?.length) fail(`Dungeon mission has no enemy group: ${mission.id}`);
  assetExists(mission.bgm, `mission ${mission.id}.bgm`);
});
Object.keys(enemyGroups).forEach(missionId => {
  if (!missionIds.has(missionId)) fail(`Enemy group references unknown mission: ${missionId}`);
});

Object.entries(context.GameData.eliteUnlocks || {}).forEach(([enemyId, names]) => {
  if (!enemyIds.has(enemyId)) fail(`Card unlock references unknown enemy: ${enemyId}`);
  names.forEach(name => {
    if (!cardNames.has(name)) fail(`Card unlock ${enemyId} references unknown card: ${name}`);
  });
});

Object.entries(context.GameData.unlockHints || {}).forEach(([characterId]) => {
  if (!characterIds.has(characterId)) fail(`Unlock hint references unknown character: ${characterId}`);
});

["initialShopCardNames", "repeatableDropCardNames"].forEach(field => {
  (context.GameData[field] || []).forEach(name => {
    if (!cardNames.has(name)) fail(`${field} references unknown card: ${name}`);
  });
});

const difficultyIds = new Set(Object.keys(difficulties));
Object.entries(difficulties).forEach(([id, difficulty]) => {
  if (difficulty.unlock && !difficultyIds.has(difficulty.unlock)) fail(`Difficulty ${id} unlock references unknown difficulty: ${difficulty.unlock}`);
  if (difficulty.unlock === id) fail(`Difficulty ${id} cannot unlock from itself`);
});
Object.keys(difficulties).forEach(startId => {
  const seen = new Set();
  let id = startId;
  while (id && difficulties[id]) {
    if (seen.has(id)) {
      fail(`Difficulty unlock chain contains a cycle starting at: ${startId}`);
      break;
    }
    seen.add(id);
    id = difficulties[id].unlock;
  }
});

const freshState = context.GameStoreStateFactory.freshState();
["party", "testAllies"].forEach(field => {
  (freshState[field] || []).forEach(id => {
    if (!characterIds.has(id)) fail(`Fresh state ${field} references unknown character: ${id}`);
  });
});
(freshState.unlockedShopCards || []).forEach(name => {
  if (!cardNames.has(name)) fail(`Fresh state unlockedShopCards references unknown card: ${name}`);
});
(freshState.unlockedDifficulties || []).forEach(id => {
  if (!difficultyIds.has(id)) fail(`Fresh state unlockedDifficulties references unknown difficulty: ${id}`);
});
if (!difficultyIds.has(freshState.testDifficulty)) fail(`Fresh state testDifficulty references unknown difficulty: ${freshState.testDifficulty}`);
(freshState.testEnemies || []).forEach(index => {
  if (!Number.isInteger(index) || index < 0 || index >= testEnemies.length) fail(`Fresh state testEnemies contains invalid enemy index: ${index}`);
});

context.RelicSystem.all({ resources: { relics: [] }, equipment: {} }).forEach(data => {
  if (!data?.effect || !data?.source) fail(`Relic data incomplete: ${data?.name || "unknown"}`);
  if (data?.enemy && !enemyIds.has(data.enemy)) fail(`Relic ${data.name} references unknown enemy: ${data.enemy}`);
});
const dependencies = [
  ["economy-config.js", "data-cards.js", "card-utils.js"],
  ["battle-card-playability.js", "battle-combat-targeting.js", "battle-combat.js"],
  ["battle-card-cleanup.js", "battle-combat-card-effects.js", "battle-combat-attack-values.js", "battle-combat-attack-flow.js", "battle-combat-attack.js", "battle-combat-resolver.js", "battle-combat.js"],
  ["data-characters-core.js", "data-characters.js"],
  ["data-machine-factory-enemies.js", "data-world.js"],
  ["data-underwater-train-enemies.js", "data-world.js"],
  ["data-sakura-risa.js", "data-world.js"],
  ["data-future-relics.js", "data-relics.js", "relics.js"],
  ["data-world.js", "data.js"],
  ["hoshino-kaiichi-share-queue.js", "hoshino-kaiichi-share-resolution.js", "hoshino-kaiichi-share.js", "hoshino-kaiichi-skills.js"],
  ["battle-turn-state.js", "battle-runtime-helpers.js", "battle-relic-turns.js", "battle-share-flow.js", "battle-session-settlement.js", "battle-session.js", "battle-auto-enemy.js", "battle-turn-start.js", "battle-turn-input.js", "battle-turn-preparation.js", "battle-turn-completion.js", "battle-turn-flow.js", "battle-resolution-actions.js", "battle.js"],
  ["battle-ai-skill-helpers.js", "battle-ai-skill-evaluation.js", "battle-ai-skill-moves.js", "battle-ai-skill-planner.js", "battle-ai.js"],
  ["battle-card-hand-interactions.js", "battle-card-counter-interactions.js", "battle-card-interactions.js", "battle-card-specials.js"],
  ["battle-damage-relics.js", "battle-damage-lifecycle.js", "battle-damage-resolution.js", "battle-damage-hit.js", "battle-damage.js"],
  ["battle-card-resume-state.js", "battle-card-resume-hooks.js", "battle-card-resume-flow.js", "battle-card-resume.js", "battle-combat.js"],
  ["machine-factory-skills.js", "enemy-status-effects.js", "enemy-kill-hooks.js", "enemy-damage-hooks.js", "enemy-combat-hooks.js", "enemy-tactical-skills.js", "enemy-skills.js"],
  ["underwater-train-target-counters.js", "underwater-train-target-actions.js", "underwater-train-target-skills.js", "underwater-train-combat-skills.js"],
  ["orc-drone-skills.js", "orc-combat-skills.js", "orc-dungeon-skills.js"],
  ["bakar-skills.js", "battle.js"],
  ["witherer-relic-skills.js", "witherer-skills.js", "battle.js"],
  ["sakura-risa-combat-skills.js", "sakura-risa-lifecycle-skills.js", "sakura-risa-skills.js", "battle.js"],
  ["elrana-healing-skills.js", "ace-skills.js", "nanali-skills.js",
    "ace-nanali-skills.js", "elrana-ace-nanali-skills.js"],
  ["ui-common-skill-model.js", "ui-common-skill-view.js", "ui-common-skills.js", "ui-common-art.js", "ui-common-relics.js", "ui-common.js", "ui-living-room.js", "ui.js", "ui-battle-scene.js"],
  ["ui-common.js", "card-art.js", "ui-common-card-art.js",
    "ui-common-card-combat.js", "ui-common-cards.js"],
  ["ui-battle-pickers.js", "ui-battle-targeting.js", "ui-battle-units.js",
    "ui-battle-trail.js", "ui-battle-overlays.js", "ui-battle-scene.js"],
  ["game-random.js", "bounty-ledger.js", "receipt-ledger.js", "unlock-event-progress.js", "store-state-factory.js", "store-save-schema.js", "store-bounty-repairs.js", "store-repairs.js", "store-migration-characters.js", "store-migration-runs.js", "store-migration-normalizers.js", "store-migrations.js"],
  ["store-save-schema.js", "store-save-validation.js", "store-save-limits.js"],
  ["store-io-local.js", "store-io-selection.js", "store-io-mutations.js", "store-io-recovery.js", "store-io.js"],
  ["store-io-cloud.js", "store-io-selection.js", "store-io-mutations.js", "store-io-recovery.js", "store-io.js"],
  ["store-io.js", "store-main-save-support.js", "store-main-save-writer.js", "store-main-save-timer.js", "store-main-save-scheduler.js", "store-main-save-queue.js", "store-main-save-meta.js", "store-main-snapshot.js", "store-main-recovery.js", "store-main-save.js", "store.js"],
  ["store-io.js", "store-main-copy-inspection.js", "store-main-load.js", "store-main-save-meta.js", "store-main-snapshot.js", "store-main-recovery.js", "store-main-save.js"],
  ["store-compact.js", "store-main-save-support.js", "store-main-save-writer.js", "store-main-save-timer.js", "store-main-save-scheduler.js", "store-main-save-queue.js", "store-main-snapshot.js", "store-main-recovery.js", "store-main-save.js", "store.js"],
  ["store-pause-queue.js", "store-settings-schema.js", "store-settings-state.js", "store-settings-writer.js", "store-settings.js", "store-slots-read.js", "store-slots-data.js", "store.js", "store-lifecycle.js"],
  ["save-slots-view.js", "save-slots-bindings.js", "save-slots-actions.js", "save-slots.js"],
  ["bounty-rewards.js", "bounty-task-rewards.js", "bounty-task-generator.js", "bounty-task-repair.js", "bounty-tasks.js"],
  ["battle-line-data.js", "battle-line-intro.js", "battle-speech-controller.js", "battle-caption-controller.js", "battle-lines.js"],
  ["battle-effect-geometry.js", "battle-effect-animation.js", "battle-effect-utils.js", "battle-effect-event-runner.js", "battle-effect-drain-recovery.js", "battle-effect-drain.js", "battle-effects.js"],
  ["battle-effect-card-dom.js", "battle-effect-card-motion.js", "battle-effect-card-transfers.js", "battle-effect-played-card-flight.js", "battle-effect-card-plays.js", "battle-effect-cards.js", "battle-effect-handlers.js", "battle-effect-event-runner.js", "battle-effect-drain.js", "battle-effects.js"],
  ["battle-effect-play.js", "battle-effect-drain.js", "battle-effects.js"],
  ["battle-damage-audio.js", "battle-damage-fx.js"],
  ["battle-audio-samples.js", "battle-audio.js", "battle-bump-fx.js", "battle-hit-fx-fallback.js", "battle-float-numbers.js", "battle-float-fx.js", "battle-fx.js"],
  ["dungeon-map.js", "dungeon-icons.js", "dungeon-render.js"],
  ["dungeon-reward-core.js", "dungeon-reward-payload.js", "settlement-recovery.js", "dungeon-settlement-actions.js", "dungeon-node-rewards.js", "dungeon-run-rewards.js", "dungeon-rewards.js"],
  ["battle-action-share-selection.js", "battle-action-selection.js", "battle-action-skill-bindings.js", "battle-action-hand-bindings.js", "battle-action-prompt-bindings.js", "battle-action-target-bindings.js", "battle-action-special-bindings.js", "battle-actions.js"],
  ["ui-common-skill-model.js", "ui-common-skill-view.js", "ui-common-skills.js", "ui-common-art.js", "ui-common-relics.js", "ui-common.js", "villa-event-renderer.js", "villa-defeat-events.js", "villa-family-events.js", "villa-events.js", "villa.js"],
  ["villa-test.js", "villa.js"],
  ["app.js", "app-battle-persistence.js", "app-settings-persistence.js", "app-persistence.js", "app-state.js", "app-render.js"],
  ["data-skins.js", "skins.js"],
  ["relic-ui-picker.js", "relic-ui-codex-interactions.js", "relic-ui-bindings.js", "relic-ui.js"],
  ["battle-thunder-hammer-response.js", "battle-dodge-cards.js", "battle-dodge-resume.js", "battle-dodge-auto-response.js", "battle-dodge-response.js", "battle-damage-response.js"],
  ["flora-speed-assault.js", "flora-skills.js", "carlos-skills.js", "flora-carlos-skills.js"],
  ["battle-manual-hit-resume.js", "battle-manual-resume-actions.js", "battle-manual-continuation.js", "battle-manual-actions.js", "battle-manual-flow.js"],
  ["app-action-utils.js", "app-modal-actions.js", "app-scroll-actions.js", "app-battle-skin-actions.js", "app-action-guard.js", "app-hall-bindings.js"],
  ["app-start-new-game.js", "app-start-save-actions.js", "app-start-actions.js", "app-action-bindings.js", "app-actions.js", "app-render.js"],
  ["app-render-pages.js", "app-render.js"],
  ["app-render-overlays.js", "app-render.js"],
  ["app-render-focus-preservation.js", "app-render-preservation.js", "app-render.js"],
  ["app-render-state.js", "app-render.js"],
  ["app-render-chrome.js", "app-render.js"],
  ["app-render.js", "app-boot.js", "app-runtime-error-dialog.js", "app-runtime-errors.js"],
];
validateScripts(publish, sourceDir, unique, fail, dependencies);

if (failures.length) {
  console.error("Relation validation failed:");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Relation validation passed: ${characters.length} characters, ${enemies.length} enemies, ${missions.length} missions, ${cards.length} cards`);
