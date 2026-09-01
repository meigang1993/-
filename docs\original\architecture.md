# Original Architecture Memory

## Runtime Shape

- Unminified runtime modules live only under `src/original/`; they are
  development sources and must never be copied into `publish/`.
- The Electron desktop packaging shell was removed on August 17, 2026. The
  repository ships only the static Game Studio runtime under `publish/`.
- `publish/index.html` loads the ordered generated startup bundle set with
  deferred classic scripts: `startup`, `startup-store`, then `startup-app`.
  Browsers may fetch those files in parallel, but execution order remains the
  canonical dependency order and `app-boot.js` stays in the final startup file.
- `publish/index.html` owns the release cache version through
  `meta[name="game-build"]`; startup scripts, initial styles, villa compatibility
  imports, and deferred bundle/style loaders must apply that same value so a
  release cannot mix old and new runtime or CSS generations.
- `publish/index.html` loads `publish/villa.css` as one startup stylesheet.
  That compatibility entry imports the four villa owner files in cascade order
  with the same build version, avoiding four separate startup link elements.
- Runtime code uses ordered classic scripts and global public APIs.
- `tools/publish-bundles.json` is the canonical source order for the three
  startup bundles plus the deferred hall, battle responsibility set, and
  dungeon bundle.
- Every new or split runtime source module is created under `src/original/`,
  registered exactly once in `tools/publish-bundles.json`, and delivered to
  players only through its generated bundle. Never place an unminified source
  module anywhere under `publish/`, including a nested scripts directory.
- `npm run build:bundles` compiles `src/original/` into the eleven generated
  files under `publish/bundles/`; it rejects unlisted source modules,
  unbundled published JavaScript at any depth, and unexpected bundle files. If
  generated bundle bytes or any published stylesheet differ from `HEAD`, the
  command requires `meta[name="game-build"]` to be newer than the `HEAD` value
  before writing. A copied development tree without Git history fails closed.
- Generated JavaScript uses Terser compression with three passes plus identifier
  mangling while preserving function and class names required by diagnostics
  and compatibility contracts. Property mangling remains disabled because
  runtime modules communicate through named global and object properties.
- HTTP Brotli compression is a Game Studio/CDN transport responsibility.
  Precompressed `.br` files are not committed under `publish/` because the
  static runtime cannot assign their required `Content-Encoding` response
  metadata or negotiate them from the browser.
- The bundle check recompiles in memory and byte-compares every
  committed bundle with its current sources and applies the same cache-version
  gate to generated bundles plus every `publish/**/*.css` file. After changing
  a runtime source or stylesheet, bump the build version and rebuild.
- The publish build performs the required rebuild plus freshness check.
- `.githooks/pre-commit` applies the non-writing bundle/CSS version gate,
  static and script contracts, resource references and budgets,
  staged-worktree consistency, and publish path policy to every Git commit,
  including direct Game Studio `/git/save` calls. The tracked hook is activated
  through `npm run hooks:install`; saving is invalid when the repository-local
  `core.hooksPath` no longer points to `.githooks`.
- Deferred battle and dungeon bundles must activate all required styles
  together before rendering their scene. `src/original/runtime-battle-styles.js`
  owns the battle CSS set: core battle and victory styles load with the battle
  bundle, while special skin styles load only for selected or restored battle
  participants. Later battle-context loads may add another skin stylesheet
  without reloading the battle bundle.
- Hall-only unlock event modules, `src/original/villa-collection.js`, and
  `src/original/update-notice.js` live in the deferred hall bundle. Hall-only
  story, codex, villa, shop, bounty, party/test action, and binding modules
  also stay out of startup and load together before leaving the start screen.
  New-game, continue, manual-slot load, and replacement-save paths load that
  bundle before rendering hall or inventory-cleanup UI.
- Startup ownership is split without changing runtime globals:
  `startup.min.js` owns runtime loading, canonical data, assets, and skins;
  `startup-store.min.js` owns ledgers, save validation/migration, storage,
  LocalCore, and ServerCore; `startup-app.min.js` owns save-slot UI, common UI,
  relic runtime, application rendering/actions, boot, and runtime recovery.
- Battle-only UI renderers (`ui-battle-pickers.js`, `ui-battle-targeting.js`,
  `ui-battle-units.js`, and `ui-battle-scene.js`) live in the deferred
  `battle-ui` bundle. The startup `GameUI` facade resolves the complete scene renderer
  lazily only when rendering a loaded battle.
- `card-art.js` and `ui-common-cards.js` live in `battle-rules`. They load
  before battle renderers, while the startup `UICommon` facade resolves card
  rendering lazily only after the complete battle bundle set is ready.
- The full Game Studio release unit always contains `publish/`. Top-level
  `functions/*.ts` are included only for features that currently invoke them;
  player save storage has no serverless-function dependency.
- The only JavaScript files allowed in `publish/` are the generated manifest
  outputs. Battle delivery is split into ordered `battle-rules`,
  `battle-skills`, `battle-flow`, `battle-ai`, `battle-presentation`, and
  `battle-ui` bundles; `GameBundles.load("battle")` loads the complete set
  serially and remains the only public scene-loading entry.

## Development Toolchain

- The QA container is Debian GNU/Linux 12 (`bookworm`).
- Playwright uses the repository-local Chromium build; on August 17, 2026,
  `npm run check:toolchain` launched Chromium `149.0.7827.55`.
- On August 18, 2026, `npm run playwright:install` installed Chrome for
  Testing and the matching Headless Shell `149.0.7827.55` (Playwright
  Chromium v1228), plus FFmpeg v1011, under the ignored
  `/workspace/.playwright-browsers/` directory for browser QA.
- Chromium Linux libraries and fonts are installed into the development
  container with `npm run playwright:install:deps`; they are not copied into
  `publish/` or tracked as binary repository content. The repository-owned
  version lock and critical loader-path inventory is
  `tools/chromium-system-dependencies.json`; `npm run check:playwright`
  validates the running container against it before launching Chromium.
- Browser QA recovery: before running Playwright tests, check the
  repository-local `.playwright-browsers/` installation and system
  dependencies with `npm run check:playwright`. If Chromium, the headless
  shell, FFmpeg, required Linux libraries, or the locked
  `fonts-freefont-ttf` package is missing, restore them with
  `npm run playwright:install` followed by
  `npm run playwright:install:deps`, then rerun
  `npm run check:playwright` before reporting browser tests as blocked.
  Missing browser artifacts are environment failures, not product-test
  failures.
- The installed GLib runtime is Debian package `libglib2.0-0`
  `2.74.6-2+deb12u9` (`amd64`). Its loader path is
  `/usr/lib/x86_64-linux-gnu/libglib-2.0.so.0`, resolving to
  `/usr/lib/x86_64-linux-gnu/libglib-2.0.so.0.7400.6`. It is required for the
  repository Chromium used by browser QA. The package and the complete
  Chromium dependency set were restored and verified on August 18, 2026 with
  `npm run playwright:install:deps` after the container was found without the
  GLib loader. `npm run check:toolchain` then confirmed Chromium
  `149.0.7827.55` could launch.
- Any future Windows/Electron package is a disposable development artifact,
  not part of the static player runtime. Install packaging dependencies, stage
  `publish/`, create the unpacked Windows application, and compress it entirely
  below `/tmp/game-2971485-windows/`; never generate Electron `node_modules`,
  staging trees, unpacked output, caches, or an in-progress archive anywhere
  below `/workspace`. `.gitignore` does not protect these paths from the Game
  Studio file watcher. To expose one completed archive for download, copy it
  to `uploads/SuccubusKill-win64.zip~` first; the trailing `~` keeps the copy
  operation out of file-watch events, then rename it atomically on the
  `/workspace` filesystem to `uploads/SuccubusKill-win64.zip`. Remove the
  delivered archive after download so workspace size does not grow.
- Wormhole browser delivery uses Playwright Chromium with one dedicated
  persistent profile outside the watched workspace, such as
  `/tmp/game-2971485-wormhole-profile`, and launches with
  `--disable-dev-shm-usage` because the container `/dev/shm` is only 64 MiB.
  Selecting the archive and receiving a share URL is not completion: keep the
  originating browser context alive until the page reports both `Encrypted`
  and `Uploaded`. Then open the full URL, including its fragment key, in an
  independent browser context and verify the expected filename, byte-size
  presentation, and enabled download control without starting a download.
  Delete the delivered archive and browser profile after verification.

## Source Ownership

| Domain | Canonical owners |
| --- | --- |
| Characters | `src/original/data-characters*.js`, `src/original/data-future-characters.js`, `src/original/data-new-characters.js`; automatic level growth and experience rules live in `src/original/character-progression.js`; shared battle-role assignments live in `src/original/data-combat-roles.js` |
| Enemies and bosses | `src/original/dungeon-enemies.js`, split `src/original/data-*-enemies.js`, `src/original/data-bakar-enemy.js`; shared battle-role assignments live in `src/original/data-combat-roles.js` |
| Cards | `src/original/data-cards.js`; status-card identity, uniqueness, creation, and hand normalization live in `src/original/battle-status-card-registry.js`, while judgement, expiry, removal, and resistance live in `src/original/battle-status-cards.js`; actual draw-result wording is owned by `src/original/battle-draw-feedback.js` |
| Relics | `src/original/data-relics.js`, `src/original/data-future-relics.js`, `src/original/relics.js`, `src/original/relic-bindings.js` |
| Dungeons and world | `src/original/data-world.js`, `src/original/data-future-dungeons.js`, `src/original/dungeon*.js` |
| Battle rules | `src/original/battle*.js`, including the dedicated `src/original/battle-status-cards.js` subsystem, shared `src/original/battle-draw-feedback.js`, transactional skill-draw rollback in `src/original/battle-draw-transaction.js`, `src/original/character-skill-access.js`, and dedicated character/enemy skill modules; damage response assembly lives in `src/original/battle-damage-response.js` over the thunder-hammer and dodge modules, manual response assembly lives in `src/original/battle-manual-flow.js` over its action/resume/continuation modules; Flora and Carlos implementations live in `src/original/flora-speed-assault.js`, `src/original/flora-skills.js`, and `src/original/carlos-skills.js` behind `src/original/flora-carlos-skills.js`; Wendy/Cadicis and Ace/Nanali follow the same facade pattern |
| Store and saves | `src/original/unlock-event-progress.js` owns versioned durable unlock completion IDs; `src/original/store-unlock-recovery.js` owns interrupted unlock, battle, and party recovery while `src/original/store-unlock-migrations.js` remains the unlock repair facade; `src/original/battle-save-checkpoint-validation.js` owns stable checkpoint admission and structure checks while `src/original/battle-save-checkpoint.js` owns snapshot fidelity and restore-time pile reconstruction; `src/original/store-save-schema.js`, `src/original/store-save-validation.js`, other `src/original/store*.js`, `src/original/save-slots*.js` |
| Deterministic randomness | `src/original/game-random.js`; gameplay callers persist `state.random`, while visual IDs and audio noise use its transient stream |
| Non-battle async actions | `src/original/app-action-guard.js`, with bindings in `src/original/app-hall-bindings.js` and `src/original/app-dungeon-actions.js` |
| Runtime error boundary | `src/original/app-runtime-recovery.js` owns prompt classification, action-guard reset, control unlocking, and recoverable state cleanup; `src/original/app-runtime-errors.js` owns post-start uncaught-error and unhandled-rejection capture, structured diagnostics, generation invalidation, and retry orchestration; `src/original/app-runtime-error-dialog.js` owns the global modal-stack retry dialog, keyboard isolation, and prior-focus restoration across repeated retry failures; `src/original/battle-action-guard.js` separates queued-input invalidation used by a normal battle exit from full generation reset; battle turn/effect modules consume the captured generation, restart interrupted prompt effects plus explicitly recovery-critical events without concurrent drains, and reconcile discarded pending-card events; `src/original/app-boot.js` remains the startup failure owner |
| App state and persistence | `src/original/app.js` owns shared runtime variables and per-battle checkpoint marker admission; `src/original/app-state.js` owns replacement/render scheduling and pending-checkpoint invalidation; `src/original/app-battle-persistence.js` owns gameplay and battle-checkpoint writes, `src/original/app-settings-persistence.js` owns preference snapshots and writes, and `src/original/app-persistence.js` wires lifecycle events |
| UI and wording | `src/original/ui-common-skill-model.js` owns skill lookup/state and `src/original/ui-common-skill-view.js` owns skill markup behind `src/original/ui-common-skills.js`; `src/original/ui-common-card-art.js` owns card-media fallback markup, `src/original/ui-common-card-combat.js` owns combat bars and damage previews, and `src/original/ui-common-cards.js` remains their card facade; relic picker, codex interactions, and bindings live in matching `src/original/relic-ui-*.js` modules behind `src/original/relic-ui.js`; `src/original/ui-battle-trail.js` owns played-card reconciliation, `src/original/ui-battle-overlays.js` owns battle overlays, and `src/original/ui-battle-scene.js` assembles the battle screen |
| Skins and assets | `src/original/data-skins.js` owns purchased, initial, level-gated, and test-trial appearance metadata; `src/original/skins.js` owns ownership, equipment, and runtime appearance selection; `src/original/skin-fx-runtime.js` owns shared dynamic-effect, timer, mount, and invalidation infrastructure used by dedicated skin controllers including `src/original/flora-sonic-skin-fx.js`, `src/original/wendy-teacher-skin-fx.js`, and `src/original/elrana-fallen-physician-skin-fx.js`; `src/original/assets.js`, skin CSS, `publish/assets/` |
| Interaction and visual memory | `docs/original/interaction-visual-reference.md` |
| Skill-state skin variants | `src/original/skins.js` selects the equipped-skin-only variant from live skill state using metadata from `src/original/data-skins.js`, with rendering in `src/original/ui-common-art.js`; no timed full-screen damage-art controller remains |
| Bundle order | `tools/publish-bundles.json`; battle sources are published by rules, skills, flow/settlement, AI, presentation/audio, and UI responsibility |
| Intended contracts | `docs/original/game-settings.md` |
| Verification policy | `docs/original/qa-workflow.md` |

The detailed source-of-truth map in `docs/original/game-settings.md` records
current split modules and should be updated whenever ownership changes.

## Content Growth And File Creation

Choose files from the size and responsibility of the new game content, not
from the convenience of the current edit:

- A small addition may stay in its canonical owner when it uses the same data
  shape and behavior and leaves the owner comfortably below 150 JavaScript
  lines.
- A new character group, enemy group, card/relic family, dungeon, independent
  UI flow, reusable rule system, or substantial data table should receive a
  dedicated file named for that responsibility.
- If an existing owner is already near 150 lines, split its coherent
  responsibility before adding more behavior. Never rely on dense formatting
  to remain under the 200-line hard limit.
- Data, runtime logic, and rendering may use separate files when they
  have different change reasons; do not combine them only to reduce file count.
- New runtime files must follow the existing classic-script namespace pattern
  and be registered in the correct bundle order and direct-load harnesses.
  Their development copy remains under `src/original/`; no second source copy
  may be added under `publish/`.

After adding or splitting content, record the canonical data, runtime, and UI
owners in the relevant `docs/original/game-settings.md` section. Update
this document when the module boundary, facade, bundle, or ownership model
changes.

## Facade Rule

Compatibility entry files assemble, delegate, and export existing public APIs.
They must not become new business-logic containers.

Battle facades include:

- `battle.js`
- `battle-actions.js`
- `battle-ai.js`
- `battle-ai-skill-planner.js`
- `battle-turn-preparation.js`
- `battle-card-interactions.js`
- `battle-card-resume.js`
- `battle-combat-attack.js`
- `battle-damage.js`
- `battle-effect-utils.js`
- `battle-effect-cards.js`
- `battle-effect-drain.js`

Store, task, character, enemy, and effect facades include:

- `store-main-save.js`
- `store-main-save-queue.js`
- `bounty-tasks.js`
- `data-future-enemies.js`
- `enemy-combat-hooks.js`
- `sakura-risa-skills.js`
- `hoshino-kaiichi-share.js`
- `hoshino-kaiichi-skills.js`
- `bakar-skills.js`
- `underwater-train-target-skills.js`
- `underwater-train-combat-skills.js`
- `manny-gun-skin-fx.js`

Add new behavior to the matching responsibility submodule. When splitting or
adding a module, update:

1. `tools/publish-bundles.json`;
2. public global ownership when applicable;
3. the source map in `docs/original/game-settings.md`.

## Important Domain Boundaries

- Character data, skills, prompts, and continuation helpers may be split into
  separate files; compatibility aggregators expose the public API.
- Battle rendering reads state but must not own durable gameplay truth.
- `src/original/app-render-overlays.js` exclusively owns character detail overlays
  across hall, modal, living-room, and battle views; scene renderers only expose
  openers so one global modal layer can isolate background controls and restore
  focus.
- `src/original/app-render-preservation.js` owns media, animation, caption, and
  hand-selection continuity across `innerHTML` replacement;
  `src/original/app-render-focus-preservation.js` owns focused-control and modal
  opener restoration.
- Global app interaction helpers are separated by responsibility:
  `src/original/app-modal-actions.js` owns modal/info delegation,
  `src/original/app-scroll-actions.js` owns scroll preservation and keyboard
  delegation, and `src/original/app-battle-skin-actions.js` owns asynchronous
  in-battle skin changes. `src/original/app-action-utils.js` retains only shared
  control and confirmation helpers.
- `src/original/relics.js` owns relic data queries and equipment mutations;
  `src/original/relic-bindings.js` owns the character-panel DOM and drag/drop
  bindings while preserving the `RelicSystem.bind()` compatibility API.
- `src/original/battle-fx.js` remains the public battle feedback facade.
  `src/original/battle-float-numbers.js` owns floating-number lifecycle,
  `src/original/battle-hit-fx-fallback.js` owns slash fallback and stale guards,
  `src/original/battle-float-fx.js` assembles them, and
  `src/original/battle-bump-fx.js` owns rerender-stable hit, heal, and armor bumps.
- `src/original/battle-effect-animation.js` owns Web Animation compatibility,
  normalized battle-speed scaling, CSS timing-variable synchronization,
  presentation cleanup timers, and compact follow-up holds. Effect modules
  must keep settlement boundaries explicit and consume that presentation clock
  instead of changing gameplay order.
- `src/original/save-slots.js` owns panel state and controller assembly;
  `src/original/save-slots-actions.js` owns save, retry, load/promotion/settings
  reconciliation, and delete operations.
- Start-screen flows are split without changing their global command API:
  `src/original/app-start-new-game.js` owns new-game creation,
  `src/original/app-start-save-actions.js` owns cloud-conflict and migration/settings
  synchronization, and `src/original/app-start-actions.js` owns continue/entry flow.
- The animation/effect queue presents committed or staged actions; stale
  effects must not commit gameplay after state replacement.
- Main save, manual slots, settings, and lifecycle deletion have separate queue
  responsibilities and must coordinate without circular waits.
- Settings normalization and structural validation live in
  `src/original/store-settings-schema.js`; read/sync status and pending explicit
  restores live in `src/original/store-settings-state.js`;
  `src/original/store-settings-writer.js` owns versioned writes and lifecycle
  pausing, while `src/original/store-settings.js` owns strict local/cloud
  selection and repair orchestration.
- `src/original/store-save-schema.js` owns persisted card identity reconstruction
  and bounty-task structural validation. Store repair, compaction, validation,
  bounty repair, and LocalCore apply paths must depend on it directly rather
  than on one another.
- `src/original/store-repairs.js` owns card and relic migration repair;
  `src/original/store-bounty-repairs.js` owns committed bounty-gold validation
  and legacy range repair.
- `src/original/store-save-validation.js` owns bounded persisted-state structure
  validation. `src/original/store-save-limits.js` remains the public limits,
  resource, inventory-capacity, and byte-size API while delegating validation.
- Main-save copy cloning, migration validation, and player-facing summaries
  live in `src/original/store-main-copy-inspection.js`; local/browser-KV reads,
  version selection, recovery selection, and the public load API remain in
  `src/original/store-main-load.js`.
- `src/original/store-main-save-timer.js` owns the bounded debounce timer;
  `src/original/store-main-save-scheduler.js` owns job merging, flush replay,
  queue execution, raw-snapshot admission validation, and pause/resume
  coordination. `src/original/store-main-snapshot.js` retains final compact
  snapshot validation while trusted runtime saves skip the redundant
  pre-clone migrated-state validation; local and cloud raw writers revalidate
  their public boundary regardless of caller options.
- Battle entry and initial draws live in `src/original/battle-session.js`;
  victory, defeat, test, dungeon, and direct mission settlement live in
  `src/original/battle-session-settlement.js`.
- `src/original/store-io-cloud.js` owns browser `dzmm.kv` timeouts and per-key
  mutation serialization. `src/original/store-io-selection.js` selects valid
  local/browser-KV copies by `_saveVersion` then `updatedAt`, with cloud winning
  exact ties. `src/original/store-io-mutations.js` owns direct put/delete semantics.
- Offline bounty claims and their inventory preflight live in
  `src/original/local-core-bounty.js`; dungeon node/run and defeat settlement remain
  in `src/original/local-core-dungeon.js`.
- Player-visible role and skill wording belongs with canonical data and UI
  renderers, not AI heuristics.

## Data-Driven Extension

- New playable characters must be discovered by the codex automatically.
- New enemy groups must come from canonical dungeon data after all split files
  load.
- Generic skill logic should classify cards by type, range, source, suit, color,
  and runtime conversion instead of patching individual IDs.
- New art should resolve through the existing asset/skin manifests.
- New persistent state must define validation, migration, snapshot inclusion,
  cleanup ownership, and idempotency behavior before release.
