# Original Known Risks And Defensive Contracts

This is a cross-cutting risk index. Exact behavior remains in
`game-settings.md`; platform SDK contracts remain in `platform-runtime.md`.

## Stale Async Work

Risk: an old animation, preload, AI wait, timer, or promise commits into a
replacement state or battle.

Required guards:

- capture state, battle object, actor, phase, and runtime generation before an
  async boundary;
- verify them again before every commit, rerender, unlock, or continuation;
- invalidate old queues and timers when loading, leaving, or replacing battle;
- maintain single ownership for enemy thinking and `autoEnemy`.

Hall, shop, save-retry, and dungeon controls use `AppActionGuard`. The guard
must release the originating control in `finally`, show a visible retry message
after unexpected failure, and reject render/save writeback when either the
runtime state or captured dungeon run has been replaced. Duplicate submissions
from the same control or explicit action key are blocked, but an older action
must not suppress a different control rendered by a later scene. Dungeon node
entry also captures the pending node ID: a late success or failure from an
older node must not render, save, or roll back a successor node in the same run.
If a pre-battle encounter handles the action without replacing the run, its
pending node must be rolled back so the same node remains selectable. Clearing
a partially initialized battle must first invalidate its effects, dialogue,
audio, timers, and battle-action guard so detached work cannot mutate null or
overwrite the original failure message. Pre-battle encounter waits must render
an interaction-blocking loading scene and recheck node ownership after every
async settlement boundary; map or settings retreat controls must not race that
settlement.

Save-slot loading has its own state-replacement boundary because a successful
load intentionally replaces the state and resets application action guards. It
must capture the originating state plus runtime-error generation, reject stale
work after every asynchronous boundary before adoption, then capture the loaded
state for settings synchronization and final UI writeback.

Loading a battle snapshot occurs before deferred dungeon modules are guaranteed
to exist. A legacy start-only or malformed snapshot must therefore clear
`run.pending` and restore a completed predecessor through the startup store
migration layer. A versioned stable-operation checkpoint may resume only at an
unlocked allied play phase with no prompt, selection, pending draw, animation,
enemy thinking, or settlement work. Its full battle card data must survive
snapshot preparation, each side's shared pile must be serialized exactly once,
and restore must rebuild the shared object and unit zone references after JSON
cloning. New checkpoints must advance a monotonic operation sequence only for
completed gameplay operations that reach stable input, even when the turn
number has not changed, while legacy completed-turn markers remain readable.
Requests from the same event-loop task must merge before snapshot cloning or
validation; unchanged rerenders must not rebuild or enqueue the same battle
state. State replacement cancels the pending batch, while page hiding flushes
the latest valid batch. The resume marker must be removed from live state
immediately after synchronous snapshot preparation; otherwise a later manual
save can incorrectly authorize an unstable battle resume. Snapshot compaction
must modify only the already-isolated store clone instead of cloning the
expanded battle a second time. Trusted runtime saves may skip redundant
pre-clone validation, but the final compact raw snapshot must still pass the
shared validator. The same isolated snapshot may flow without another clone,
but the main queue and externally callable local/cloud raw-write boundaries
must each reject invalid data regardless of a caller-supplied `validated`
option. Unavailable local storage must be detected before running its raw-write
validation. Depending on `DungeonSystem`
during migration leaves every map node disabled because `DungeonMap.canChoose`
rejects runs with a pending node. Compatibility repair may clear an orphaned
pending node only when it points to a normal, elite, or boss battle; rest and
chest nodes legitimately use pending state to keep their interaction panels
open. The repaired snapshot must retain its migration-save marker until a
durable automatic-save write finishes; clearing that marker in a low-level slot
reader leaves the stale battle snapshot authoritative on the next load.

## Runtime Error Boundary

Risk: a detached promise rejection or uncaught callback exception occurs after
the first interactive frame, leaving an action guard, control, loading view, or
non-prompt battle lock stuck without a visible recovery path.

Required guards:

- log and retain the normalized `source`, `code`, `message`, and `stack`;
- reset application and battle action guards plus their owned DOM locks;
- advance the runtime generation before unlocking so late startup, sortie,
  test-battle, battle-create, asset-retry, turn-input, enemy-thinking, and
  enemy-play continuations cannot commit;
- a normal battle exit must discard queued stale inputs without resetting the
  action that owns that exit before its required save and rerender complete;
  full action-generation reset remains reserved for runtime recovery and state
  replacement;
- clear transient start, sortie, test-battle, asset-retry, and interrupted
  loading state without removing a legitimate battle prompt or settlement;
- classify every visible battle prompt through one shared helper, preserve its
  required effect queue, and explicitly mark non-prompt effect events whose
  commit owns required gameplay continuation; invalidate and requeue those
  interrupted events before retry so old and new drains cannot overlap, while
  releasing `_pendingDraw` markers from effects that are deliberately
  discarded;
- roll back an interrupted pre-battle dungeon node before returning to the map,
  so `run.pending` cannot leave every route node disabled;
- recover battle-effect presentation before the next render;
- show the error dialog as the top child of the global modal stack, keep lower
  dialogs inert, trap focus, preserve the exact prior control across a failed
  retry render, restore it after recovery, and prevent `Escape` from closing
  background UI;
- provide an explicit player-triggered retry without replaying stale work;
- never report a post-start failure through `dzmm.loading.error()` or
  automatically replay the failed action.

## Deterministic Randomness

Risk: direct entropy calls, comparator-based shuffles, or visual-only random
work changes gameplay outcomes and makes a reported run impossible to replay.

Required guards:

- all gameplay randomness consumes `state.random.seed` plus
  `state.random.cursor` through `GameRandom`;
- migration creates the state once for legacy saves, and local-core snapshots
  return the advanced cursor to the runtime state;
- all shuffles use the shared Fisher-Yates implementation;
- durable run and task IDs derive from the persistent seed/cursor without
  advancing gameplay randomness;
- animation IDs, confirmation IDs, dialogue variants, and audio noise use the
  transient random stream and must not advance gameplay randomness.

## Interrupted Battle Chains

Risk: a prompt opened by damage, counterattack, sharing, or status processing
restarts a whole action, skips remaining hits/targets/phases, or resumes the
wrong enemy.

Required guards:

- pause the exact unfinished reaction step;
- preserve hit index, target index, source, actor, phase, and pending queue;
- resume only after all required prompts and reactions finish;
- recheck source survival, active actor, phase ownership, and settlement lock;
- post-animation skill rewards must capture the first direct-hit result before
  synchronous chain triggers, commit once at the tail of the final effect
  queue, and reject commits from a replaced battle;
- propagate continuation failures to the owning action boundary and never
  persist a stable-operation checkpoint after failed recovery;
- never rerun completed target selection, response, or damage modifiers.

High-risk examples include 半魅魔血, multi-hit attacks, full-target attacks,
counterattacks, preparation damage, end-phase skills, and enemy AI continuation.

## Save And Cloud Coordination

Risk: stale writes overwrite newer progress, failed cloud reads appear empty,
new-game overwrite destroys recovery data, or lifecycle deletion reports false
success.

Required guards:

- distinguish empty data from read failure;
- serialize writes per key through actual SDK completion;
- treat browser `dzmm.kv` success as the durable result whenever that API is
  available; local storage is only a best-effort recovery copy;
- keep startup independent of `dzmm.fn` so a function bridge failure cannot
  prevent the title screen from rendering;
- select valid local/browser-KV copies by `_saveVersion` then `updatedAt`, with
  browser KV winning exact ties, and expose differing or damaged copies for
  repair;
- validate size, structure, resources, receipts, and migrations
  before replacing a valid copy;
- persist physical cards as canonical identity plus suit only, reject unknown
  identities, and rebuild gameplay fields from authoritative card data;
- keep manual slot, main save, settings, and lifecycle queue ownership separate;
- return real partial/failure states and preserve explicit retry paths.

Direct browser KV has no cross-page compare-and-swap. Per-key queues and the
platform's single active game-session model reduce stale-write exposure, but
cannot eliminate it if multiple independent pages write the same player save.

## Settlement And Economy

Risk: duplicate rewards, zero-value fallback, reordered recovery actions, or
inventory mutation against the wrong item.

Required guards:

- require valid reward payloads or recover from authoritative receipts/deltas;
- keep uncertain settlement pending and retryable;
- use idempotent ordered receipts/high-water marks;
- preserve action order and block later actions behind an unresolved earlier
  action;
- identify inventory operations by stable item identity plus receipt, not array
  index alone;
- identify shop purchases by displayed authority sequence, card identity, and
  slot index, and keep refresh recovery under the same action lock so stale UI
  cannot buy a replacement item even when the replacement has the same identity;
- initialize and refresh shop stock only through the core, require its authority
  marker before purchase, and never generate stock or consume gameplay
  randomness from render-time normalization;
- preflight capacity before charging or clearing rewards.
- LocalCore operations must return explicit changed/accepted/apply outcomes,
  sanitize and write back only their owned fields, and use inventory patches
  for card/relic additions or removals. Change detection and unrelated actions
  must never serialize, clone, rebuild, or traverse the complete inventory.

## DOM Preservation And Input

Risk: same-screen rerenders flash portraits, restart video/animations, shift
scroll position, or apply old DOM indices to another character's hand.

Required guards:

- preserve matching image/video nodes and stable keyed roster cards;
- derive HP-dependent skill-state portraits and decorators from `visualHp`
  while damage or healing is queued, so group effects cannot expose a later
  target's state change before its own visual hit commits;
- render persistent card artwork as reusable image nodes with asynchronous
  decoding, so same-screen battle rerenders do not recreate decoded art;
- do not use deferred `content-visibility` sizing in party/test pickers;
- preserve modal, hand, public-trail, and log scroll unless new content requires
  following;
- rebuild persisted bounty tasks from a field whitelist and escape every stored
  text or attribute value before inserting task markup;
- validate hand-owner uid before processing a card index;
- keep controls visibly locked while a hidden prompt is not yet interactive.
- damage-interception prompts such as 为我护驾, 次元转移, and 指挥官责任
  must establish their gameplay lock immediately but delay captions, hand
  ownership changes, target highlights, and input until the current effect
  queue is fully idle;
- when an async action rerenders a successor transfer or target prompt before
  its guard releases, queue the new control action until idle and validate the
  captured state and prompt identity before executing it. Never silently drop
  a visible successor control or let an old prompt callback enter the new one.

## Animation Compatibility

Risk: missing or broken Web Animation APIs block settlement or input forever.

Required guards:

- support missing `Element.animate()`, missing `animation.finished`, and missing
  `Array.prototype.at()`;
- apply the final frame and release after the configured duration;
- bound browser animation completion waits with a fallback deadline;
- recover controls and effect queues after rejected animation work.

## Continuous Presentation Cost

Risk: permanent transform, filter, opacity, or border animations over decoded
battle portraits or dedicated-skin decorators can force continuous composition
and lower the display refresh rate.

Required guards:

- keep standard idle battle portraits static and identify the active unit
  through its existing border and glow;
- allow the authored dedicated-skin idle portrait and decorator loops, but keep
  them limited to the selected skin layers and disable them under reduced
  motion;
- keep symmetric or otherwise visually unchanged decorators static. When a
  continuous dedicated-skin loop exceeds its idle budget, preserve the authored
  identity through bounded controller-owned idle pulses instead of repainting
  the portrait or shadowed decorator every frame;
- reserve all other portrait movement, filters, decorator motion, and bumps for
  bounded entry, skill, hit, status, victory, or settlement feedback;
- merge repeated hits into the active short bump instead of restarting it
  through a synchronous layout read, and bound overlapping per-target damage
  decorators and visible float numbers while still presenting every damage
  value and impact sound;
- keep continuous dedicated-skin effects within the current runtime performance
  budgets without weakening visual identity or the static standard-portrait
  baseline.

## Audio

Risk: effects scheduled on a suspended `AudioContext` disappear, stale BGM
requests report false failures, or zero-volume effects still allocate audio
graphs.

Required guards:

- await `AudioContext.resume()` and confirm the running state;
- queue delayed unlock effects instead of dropping them;
- invalidate stale BGM play/fade work when source or volume changes;
- prime only the final mission or encounter BGM after enemies are selected;
- avoid CORS-sensitive fetch preloading in opaque-origin frames;
- allocate no synthesized effect nodes at zero SFX volume.

## Media And Paths

Risk: player text is accidentally bound to `img/audio/video src`, causing large
volumes of invalid requests; invalid filenames break publishing.

Required guards:

- create media elements only for validated media data;
- consume battle preload failures, render explicit portrait/card fallbacks, and retain a visible retry action;
- scope media retry ownership to its captured battle object, keep it independent from the global battle-action lock, and reject every stale retry callback after state or battle replacement;
- use conditional DOM creation, not CSS hiding, for mixed text/media blocks;
- keep all `publish/` paths ASCII-only and without spaces;
- use relative runtime asset paths.

## Bundle And Module Drift

Risk: source changes do not reach generated bundles, dependency order changes,
or logic returns to a compatibility facade.

Required guards:

- keep all unminified modules under `src/original/` and publish only the six
  generated files under `publish/bundles/`;
- regenerate affected bundles after bundled source changes;
- fail static, bundle, and runtime-ownership checks when `publish/` contains
  any other JavaScript or when a committed bundle differs from current source;
- make standard save workflows rebuild bundles before running QA;
- version startup and deferred script URLs plus initial, imported, and deferred
  stylesheet URLs from the same release value so browser cache cannot mix
  runtime or CSS generations;
- keep the three startup scripts deferred and in manifest order so the browser
  may fetch them concurrently without executing storage or app boot before
  their data/runtime dependencies;
- keep `tools/publish-bundles.json` in dependency order;
- update direct-load harness dependencies after module splits;
- keep facades limited to assembly, delegation, and export;
- update `docs/original/architecture.md` and the source map in
  `docs/original/game-settings.md` when ownership changes.

## Small Viewport Clipping

Risk: fixed minimum canvas dimensions or document-level scrolling crop controls
and move the entire game shell in a smaller host window.

Required guards:

- keep `html`, `body`, and `.game-shell` fitted to the current dynamic viewport
  without fixed minimum width or height;
- keep the document scrolling element fixed and apply safe-area padding at the
  root;
- retain contained component-level scrolling for long modal, map, log, hand,
  and compact battle content;
- keep flex and grid scroll owners at `min-height: 0` so content cannot expand
  the root;
- keep the `1280x720` baseline free of document overflow.
