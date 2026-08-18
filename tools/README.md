# Local QA Tools

These tools are for development only. They do not change the static game runtime.

## Setup

- `npm run playwright:install`
  Downloads the Playwright Chromium build pinned by the lockfile into the
  repository-local `.playwright-browsers/` directory. The directory is
  intentionally Git-ignored because browser binaries are large and
  platform-specific. Run this after cloning, when the Playwright package
  version changes, or when `npm run check:playwright` reports a missing binary.

- `npm run playwright:install:deps`
  Installs Linux shared-library and font dependencies required by Chromium.
  This changes the development container rather than the repository and is
  needed only when the browser launch check reports a missing system library.
  Exact Debian package versions and critical loader paths are tracked in
  `tools/chromium-system-dependencies.json`.

- `npm run qa:install`
  Verifies the original Node, npm package, and Playwright/Chromium components.
  It performs no network installation.

## Commands

- `npm run impact -- [files...]`
  Analyzes changed or explicitly named files and reports affected publish
  bundles, focused logic/browser tests, cache-version requirements, resource
  checks, and memory documents to review.

- `npm run dev:save -- "message"`
  Runs the hook check, publish path check, bundle rebuild when runtime files
  changed, quick QA, and the authenticated Game Studio save endpoint. It uses
  all three provisioning headers through curl config input so secrets are not
  exposed in process arguments. After a successful save, refresh the Preview
  panel.

- `npm run qa`
  Runs the complete automatic QA chain. This is an alias for `qa:full`.

- `npm run qa:quick`
  Runs linting, sandbox/SDK risk checks, syntax and path checks, data and
  relation validation, resource checks, asset budgets, bundle/global
  contracts, and duplicate detection. Runtime JavaScript inspection uses
  `src/original/`; generated bundles are checked for freshness and boundaries.
  Use this during normal editing.

- `npm run qa:watch`
  Watches source, tool, test, and QA configuration files. It runs `qa:quick`
  once at startup and again after changes settle for 800 ms. Stop it with
  `Ctrl+C`.

- `npm run hooks:install`
  Activates the tracked `.githooks/pre-commit` guard for the current clone.
  Run it after migrating or cloning the development repository.

- `npm run check:hooks`
  Verifies that direct Git and Game Studio saves are protected by the tracked
  pre-commit guard. The guard checks bundle/CSS versions, static boundaries,
  resource references and budgets, script contracts, and publish paths.

- `npm run qa:full`
  Runs the quick chain, all logic regression tests, Chromium readiness, startup
  performance budgets, and the curated browser release suite. Browser-only
  rule matrices already covered exhaustively in Node remain available as
  focused tests without extending every normal release check.

- `npm run qa:exhaustive`
  Runs the same pre-browser chain as `qa:full`, then executes every registered
  Playwright spec. Reserve it for browser-catalog audits and explicitly
  exhaustive investigations.

- `npm run qa:extended`
  Runs `qa:full`, produces c8 logic coverage, then runs the same-page battle
  soak and the complete non-writing optimization suite.

- `npm run check`  
  Runs `check:core` followed by all Node logic regression tests.

- `npm run verify`
  Runs linting, runtime-risk checks, all Node checks, startup performance, and
  the curated Playwright release suite.

- `npm run save:studio -- "message"`
  Rebuilds publish bundles, runs the full automatic QA chain, and only saves
  through the Game Studio git endpoint when every stage passes.

- `npm run build:publish`
  Atomically rebuilds the eleven runtime bundles from `src/original/`, then
  verifies that they exactly match source and that no unbundled JavaScript is
  present under `publish/`. JavaScript is compressed with three Terser passes
  and identifier mangling; Brotli remains a CDN transport concern rather than
  a committed `.br` artifact. When generated bundle or published CSS bytes differ
  from `HEAD`, `meta[name="game-build"]` must first be advanced beyond the
  `HEAD` value. Development copies without Git history are rejected.

- `npm run check:bundles`
  Verifies complete source-manifest membership, the publish JavaScript
  boundary, byte-for-byte bundle freshness, and the same bundle/CSS
  cache-version gate without writing files.

- `npm run check:static`  
  Checks `publish/index.html`, publish path safety, source and bundle syntax,
  the source 200-line limit, and the generated-only JavaScript boundary.

- `npm run lint`
  Runs original-domain ESLint plus publish Stylelint and HTMLHint checks.

- `npm run check:risks`
  Scans `src/original/` and rejects sandbox-blocked browser APIs and costly SDK
  calls placed in high-frequency callbacks.

- `npm run validate:data`  
  Runs Ajv JSON Schema validation for characters, skills, virtual skill cards, future enemies, and runtime cards. It also catches target balance values such as `demon_mecha_cerberus.bloodlust === 1`.

- `npm run validate:relations`
  Checks unique IDs, mission/enemy groups, card unlock references, data-owned assets, script existence, and critical script ordering.

- `npm run check:resources`  
  Checks resource references from `src/original/` JavaScript and published
  HTML/CSS while ignoring JS comments and dynamic template expressions.

- `npm run check:asset-budget`
  Enforces first-screen, per-file, and total publish asset budgets using the runtime `GameAssets.criticalUrls()` list.

- `npm run check:scripts`
  Validates global ownership, unresolved global dependencies, bundle membership,
  lazy-bundle exports, loader mappings, and the startup entry script.

- `npm run check:performance`
  Enforces `tools/performance-budget.json` at the 1280x720 desktop baseline and
  writes the measured report to `.qa-artifacts/performance/`.

- `npm run check:duplicates`
  Runs jscpd over non-generated runtime JavaScript and CSS with a 0.35%
  duplicated-line budget.

- `npm run check:playwright`
  Validates the pinned Debian package versions and critical shared-library
  paths, then launches the repository Chromium once.

- `npm run check:toolchain`
  Verifies only the original Node, npm package, Playwright browser, and Chromium
  launch baseline.

- `npm run test:original:list`
  Lists the seven original-game Node regression groups and all focused test ids.

- `npm run test:original:focus -- store battle-runtime`
  Runs only the named focused tests. Group names can be mixed with test ids.

- `npm run test:contracts`, `npm run test:storage`, `npm run test:progression`,
  `npm run test:battle`,
  `npm run test:characters`, `npm run test:presentation`, and
  `npm run test:determinism`
  Run the matching group from `tools/qa-test-catalog.js`.

- `npm run replay:record -- [file] [--seed=N]`
  Records a replay to `.qa-artifacts/replays/latest.json` by default.

- `npm run replay:verify -- [file]`
  Recreates and verifies a battle from its persistent random seed and cursor.

- `npm run test:save-fuzz`
  Runs reproducible `fast-check` save validation properties. Use `FUZZ_SEED` and
  `FUZZ_RUNS` to reproduce or expand a run.

- `npm run coverage:logic`
  Runs all Node gameplay tests through c8 and writes HTML/JSON/text coverage
  reports under `.qa-artifacts/coverage/`.

- `npm run test:soak`
  Reuses one Chromium page for repeated battle lifecycles and checks errors,
  retained DOM, and heap growth. `SOAK_ROUNDS` defaults to 20.

- `npm run optimize:images`
  Audits published JPG/PNG/WebP files through sharp without changing assets.
  Use `optimize:images:write` only when intentionally applying replacements.

- `npm run optimize:audio`
  Decodes and audits MP3, M4A, OGG, and WAV audio with the pinned FFmpeg
  binary. Use `optimize:audio:write` only when intentionally recompressing
  eligible long M4A or MP3 files.

- `npm run analyze:coverage`
  Collects representative Chromium JavaScript and CSS usage.

- `npm run analyze:bundles`
  Reports raw, minified, and gzip contribution for every bundle source.

- `npm run test:frames`
  Compares idle and battle-effect frame cadence against relative budgets.

- `npm run optimize:all`
  Runs every retained optimization command in non-writing mode.

- `npm run test:preview -- --project=chromium`  
  Opens `publish/index.html` through Playwright, checks startup, test-battle
  start/completion, layout overflow, console/page errors, accessibility, and
  visual baselines.

- `npm run test:original:browser:list`
  Lists the canonical Playwright groups, release-suite size, and every browser
  test id.

- `npm run test:original:browser:release`
  Runs the curated Playwright release suite used by `qa:full`. Playwright
  options pass through normally, for example append `-- --list`.

- `npm run test:original:browser:focus -- startup-direct-kv`
  Runs one exact spec. Use selectors such as `@storage` to run a group, and
  append `-- --grep "text"` to pass options to Playwright.

- `npm run test:a11y`
  Runs axe against the start screen and hall, attaches full reports, and fails
  on critical WCAG violations.

- `npm run screenshot`  
  Runs the Chromium preview smoke test and stores the screenshot artifact.
