# Project Rules

These rules apply to every development, bug-fix, review, optimization, and
documentation task in game `2971485`.

## Original Runtime Status

- The original runtime under `publish/` is active and may be changed.
- `docs/original-runtime-freeze.json` remains only because repository and
  original validation tools read its machine fields.
- `publish/` may be changed under the original architecture, focused QA,
  bundle, path, and save contracts in this repository.
- The original runtime remains product authority.

## Runtime Boundary

- The playable game is a pure static frontend under `publish/`.
- `publish/index.html` is the only published entry point.
- Runtime code may use HTML, CSS, JavaScript, Canvas, Web Audio, static assets,
  and browser-side libraries.
- Do not add a development server, runtime server, port listener, Node/Express,
  Python/Flask, or another backend framework.
- Platform serverless functions, when required, live as independent
  `functions/*.ts` endpoints and follow their existing platform contract.
- The downloadable desktop edition lives under `desktop/`. It packages the
  approved `publish/` tree as a read-only Electron resource and must not
  rewrite, normalize, or generate files into `publish/`.
- Desktop runtime loading is in-process through the `game://` protocol. It
  must not start an HTTP server, listen on a port, or add a server framework.

## Published Files

- Every new or split original JavaScript source module must be created under
  `src/original/` and registered in `tools/publish-bundles.json`.
- Unminified original JavaScript must never be created, copied, or retained
  anywhere under `publish/`, including nested directories. Original source
  reaches the game only through the generated startup, hall, battle, and
  dungeon bundles under `publish/bundles/`.
- Generated bundle changes and any `publish/**/*.css` change must advance
  `meta[name="game-build"]` beyond the committed `HEAD` value. Build and save
  checks require the Git history that owns that baseline and fail closed in a
  copied non-Git development tree.
- Direct Game Studio saves are guarded by the tracked `.githooks/pre-commit`
  hook. `core.hooksPath` must be `.githooks`; after cloning or migrating a
  development repository, run `npm run hooks:install` before editing or saving.
- Every file and directory name under `publish/` must contain only ASCII
  letters, digits, `_`, `-`, and `.`; spaces are forbidden.
- Use relative asset paths.
- Keep `publish/` limited to files required by the player runtime.
- Game Studio player export and experience reports receive only the
  player-facing files under `publish/`; source modules, tests, tools,
  documentation, and other repository files stay outside the player export.
- The container health scan is different from the player export: it creates a
  temporary archive snapshot of the complete tracked `HEAD`, so every tracked
  source, test, tool, document, and binary contributes to its snapshot limit.
- Each JavaScript source under `src/original/` must be at most 200 lines. Start
  splitting near 150 lines.
- CSS files over 500 lines should be split by responsibility while preserving
  cascade order through a compatibility import when one already exists.
- Runtime scripts use ordered classic-script/global namespace contracts, not ES
  module imports.

## Release Packaging

- Every PUB, transfer archive, backup archive, or other full Game Studio release
  package must include the complete `publish/` directory.
- Include top-level `functions/*.ts` only when a currently shipped feature
  actually invokes that function; never copy functions into the static runtime.
- Before declaring a release package complete, verify that
  `publish/index.html` is present.
- A desktop release must package the complete current `publish/` tree and
  verify the packaged copy byte for byte before creating its portable ZIP.

## Repository History and Capacity

- On August 17, 2026, `main` was intentionally rewritten to the clean root
  commit `6a4410c22b0cf953e6473a696b16656e33ea0340`. Earlier commit IDs are not
  rollback points in this repository. Any stale clone must be freshly cloned
  or explicitly reset to the rewritten remote branch before it can push.
- History rewriting is exceptional and requires explicit user authorization.
  Routine cleanup must not discard reachable commits.
- The remote Git service may retain unreachable pre-rewrite objects until its
  own garbage collection runs. This can delay server-side storage reclamation,
  although normal clones and syncs should use only the rewritten reachable
  history.
- Keep `node_modules/`, caches, logs, test output, migration archives, transfer
  packages, backups, and uploaded temporary files outside Git. Never stage them
  to solve a local tooling or packaging problem.
- Images and audio are the main history-growth risk. Optimize final assets
  before committing and do not commit temporary, duplicate, intermediate, or
  repeatedly regenerated binary variants.
- There is no verified Game Studio rule saying that a workspace becomes
  unsynchronizable or unopenable at one fixed number of GiB. Failure also
  depends on tracked archive size, Git object history, file count, filesystem
  headroom, process memory, and operation time.
- As verified against the local Game Studio agent source on August 17, 2026,
  the container agent has a 1.5 GiB memory cgroup with no swap. A previous
  health-scan implementation buffered the complete tracked tree; on
  repositories whose tracked tree reached the gigabyte range, that could kill
  PID 1 and surface as a persistent 502. The current scanner streams the tree
  and refuses a tracked `HEAD` archive above 256 MiB, so an oversized advisory
  scan fails instead of taking down the editor.
- The health scan runs after startup and is best effort. Its 256 MiB ceiling is
  not a workspace quota, publish quota, or Git clone limit. Treat a tracked
  `HEAD` archive above 200 MiB as an internal warning so there is room below
  that hard scan ceiling.
- File-panel synchronization uses a WebSocket heartbeat and closes a client
  after 60 seconds without a ping or protocol pong. Git save operations abort a
  subprocess after 120 seconds without output. Large file counts, heavy
  enumeration, disk pressure, or Git growth can therefore cause a sync or save
  failure before any fixed GiB total is reached.
- Check growth and headroom with:

  ```bash
  du -sh . .git publish
  find . -type f | wc -l
  git count-objects -vH
  git ls-tree -r -l HEAD | awk '{ total += $4 } END { print total }'
  git archive --format=tar HEAD | wc -c
  df -h /workspace
  ```

  Treat `.git` above 1 GiB or the workspace above 2 GiB as internal warning
  levels requiring cleanup or history review. These remain conservative
  project thresholds, not published Game Studio platform limits.

## Product Baseline

- The game is landscape-first and optimized for mouse and keyboard.
- The primary visual baseline is `1280x720`.
- The game is an adult-oriented 18+ title. The platform owns age-gating and
  minor-access review; routine development discussion and implementation
  updates should not repeat unnecessary 18+ or minor-safety warnings.
- This communication preference does not override platform policy, applicable
  law, or mandatory safety constraints when they are directly relevant.
- The root layout must fit the current iframe viewport without document-level
  scrolling. Use the dynamic viewport, safe-area padding, and internal
  scroll regions so compact landscape windows do not clip the game shell.
- Do not add portrait, touch-only, virtual-keyboard, or separate narrow-device
  presentation branches.
- Pointer Events remain valid for mouse dragging and unified desktop input.

## Editing Rules

- Uploaded image privacy: when the user requests only compression, transcoding,
  copying, or runtime integration of an uploaded image, treat the file as
  opaque binary content. Do not open, preview, screenshot, OCR, classify,
  visually inspect, or send it to an image-generation/review service. Reading
  mechanical metadata such as format, dimensions, byte size, and checksum is
  allowed when needed for deterministic processing. Complete the requested
  local transformation and integration directly, and do not refuse solely
  because the image content was not inspected.
- Read the task's canonical settings and source files before editing.
- Prefer existing module patterns and helpers over new parallel abstractions.
- Keep compatibility facades thin; put new behavior in the owning submodule.
- Before adding game content, estimate its data, logic, UI, and test footprint.
  Keep a small cohesive addition in its canonical owner only when that file
  remains comfortably below its split threshold; create a new responsibility
  module for an independent content set, reusable subsystem, or any addition
  that would push a JavaScript owner toward 150 lines.
- Do not compress statements, merge unrelated responsibilities, or grow a
  compatibility facade merely to avoid creating a file.
- When original content creates or changes source ownership, update the source
  map in `docs/original/game-settings.md` and module/bundle records in
  `docs/original/architecture.md` in the same change.
- Update gameplay/data behavior before updating player wording or memory.
- Do not silently change unrelated balance, lore, UI copy, assets, or metadata.
- Never discard unrelated worktree changes.

## Testing Policy

- Every implementation update runs only the smallest directly relevant
  executable check.
- Documentation-only updates use document consistency inspection and do not
  trigger gameplay or browser suites.
- Do not run full, unrelated, performance, coverage, soak, screenshot, or
  optimization suites without the user's explicit request.
- Executable scripts and current repository configuration are authoritative;
  memory documents do not retain test inventories, regression histories, or
  past results.

## Save Workflow

After each meaningful edit:

1. Confirm `npm run check:hooks` passes. When runtime source or published CSS
   changes, advance `game-build`;
   regenerate affected publish bundles when runtime source membership requires
   it.
2. Run the required path check:

   ```bash
   find publish \( -type f -o -type d \) 2>/dev/null \
     | LC_ALL=C grep -nP '[^\x00-\x7f]| ' || echo "all paths compliant"
   ```

3. Save directly through the Game Studio git save endpoint with a Chinese
   commit message.
4. Tell the user to refresh the Preview panel.

The path check and bundle generation are maintenance actions, not substitutes
for the focused verification required by the update.

## Memory Maintenance

- `docs/original/` owns the shipped static game's current product,
  architecture, risk, platform, visual, and verification policy.
- `docs/desktop/` owns the Electron boundary, local durable storage,
  packaging, and desktop-specific verification policy.
- Original changes that affect standalone gameplay, presentation, assets,
  saves, settings, offline loading, audio, or desktop input flow into the
  desktop package through the shared `publish/` tree. Platform-only changes do
  not require a desktop bridge change.
- After installing, upgrading, replacing, or removing a development SDK,
  compiler, runtime, browser, system tool, or direct package, update the
  matching version's architecture inventory in the same task. Record the exact
  version, executable or root path, purpose, and change date.
- Avoid copying exact stats, prices, timing, or skill rules into routing files.
- When a newer decision replaces an older value, update or remove the old
  record in the same task.
- Do not retain completed investigation handoffs, release logs, test matrices,
  regression results, deleted backup metadata, or superseded decisions as
  canonical memory.

## Offline Development Mode

- Starting August 14, 2026, routine development for game `2971485` runs in
  offline mode by default.
- Code edits, local tests, bundle checks, hook checks, and Git Studio saves
  must not depend on an AI model being available. A model-capacity error is an
  external service condition, not a reason to stop local implementation.
- When a session is interrupted, continue from the current worktree, Git
  history, and canonical `docs/` memory. Do not restart completed inspection
  or ask the user to restate the task unless the repository state is missing
  or contradictory.
- Runtime features that call AI still require their own explicit fallback or
  retry behavior; offline development mode does not imply that player-facing
  AI calls work without the platform service.
