# Project Agent Entry

This repository is the long-term memory for Game Studio game `2971485`.
Do not rely on chat history for game rules, architecture, QA policy, or visual
identity. This file is intentionally short: it routes work to the canonical
documents and contains only rules that must be visible before every task.

## Required Reading

- Read `docs/project-rules.md` before changing files.
- Use `docs/README.md` to select the task-specific memory documents.
- For original `publish/` work, read the relevant section of
  `docs/original/game-settings.md` before changing any
  character, enemy, card, relic, dungeon, battle rule, reward, UI wording,
  lore, save behavior, or visual identity.
- Read `docs/original/architecture.md` before adding original modules, moving
  logic, changing bundles, or editing a compatibility facade.
- Read `docs/original/known-risks.md` before changing async battle flow, settlement,
  storage, animation, media loading, or rerender behavior.
- Read `docs/original/interaction-visual-reference.md` before changing original
  screen composition, navigation, control states, modal behavior, scrolling,
  visual treatment, art roles, or UI evidence.
- Read `docs/original/platform-runtime.md` before using `dzmm`, KV, loading state,
  completions, drawing, sharing, workshop, or serverless functions.
- Follow `docs/original/qa-workflow.md` for minimal original verification.

## Hard Stops

- The original `publish/` runtime is active.
  `docs/original-runtime-freeze.json` remains a machine contract used by
  repository tooling.
- Runtime code is a static frontend under `publish/`; `publish/index.html` is
  the entry point. Do not add servers, ports, backend frameworks, or non-static
  runtime requirements.
- After each implementation update, run only the focused QA or test commands
  that cover its directly affected behavior. Do not run full or unrelated
  suites without the user's explicit request.
- The game is landscape-first. Use `1280x720` as the primary visual baseline;
  keep the root fitted to the current iframe with dynamic viewport sizing,
  safe-area padding, and internal scrolling. Do not add portrait, touch-only,
  virtual-keyboard, or separate narrow-device presentation branches.
- Keep every path under `publish/` ASCII-only and free of spaces.
- Keep each JavaScript file under `publish/` at or below 200 lines.
- Keep the tracked Git save guard active with `core.hooksPath=.githooks`; after
  cloning or migrating the development repository, run `npm run hooks:install`.
- After meaningful edits, run the publish path compliance check and save through
  the Game Studio git save endpoint.

## Git / LFS Operations

- Git branch names cannot contain spaces. GitHub rejects
  `refs/heads/<name with space>` with 422; strip spaces or use ASCII names.
- Judge whether large files really occupy repository size by reading the raw
  git blob, not the contents API: the contents API resolves LFS pointers and
  reports the *real* byte size (e.g. 225442304), which looks like a real binary
  but is actually a ~134-byte pointer. A pointer begins with
  `version https://git-lfs.github.com/spec/v1`.
- An LFS pointer with no object behind it (batch API returns 404
  `Object does not exist`) poisons every clone made with git-lfs enabled:
  checkout dies at the smudge stage. Removing such files restores clone health.
- When performing several consecutive write operations on one branch through
  the GitHub API (create tree / update file / create commit), re-read the
  branch HEAD before each step. Reusing a stale parent SHA makes the commit
  fail with 422.
- To verify a clone result when the sandbox blocks `github.com` and
  `media.githubusercontent.com`: use GitHub Actions as a remote executor, and
  have the workflow write its own log file to a branch so it can be read back
  through `api.github.com` (Actions log URLs are also blocked). Note that
  `.gitattributes` containing `* filter=lfs` turns the workflow file itself
  into a pointer, so exclude `.github/**` first.
- A repository may have Actions disabled (`/actions/workflows` returns
  `total_count: 0`) even after a workflow file is pushed; dispatch then 404s.
  Cross-verify by running the workflow from another repository that has Actions
  enabled.
- **2026-09-12: default branch renamed `魅魔杀` -> `main`.** Every API call
  must use `ref=main`. A local clone still tracking `origin/魅魔杀` is broken:
  fix with `git fetch --prune origin && git branch -m 魅魔杀 main &&
  git branch --set-upstream-to=origin/main main`, or re-clone.
  **Never hand-encode the branch name.** `魅魔杀` is `%E9%AD%85%E9%AD%94%E6%9D%80`;
  writing `%E9%AD%82` produces 魂 instead of 魔 and yields a silent 404 that
  masquerades as "the file does not exist". Always use `urllib.parse.quote()`.
  This bit the sandbox four times in one day.

## Playwright / Chromium in the Sandbox (2026-09-12)

- Chromium 152.0.7977.0 lives in the persistent directory
  `/data/workspace/.pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/`
  (197 MB). `/data/workspace/rebuild/.playwright-browsers` is only a symlink to
  it, so rebuilding the project copy never loses the browser.
- **Always export `PLAYWRIGHT_BROWSERS_PATH=/data/workspace/.pw-browsers`**
  before running any browser test. Without it Playwright looks only in the
  default cache `~/.cache/ms-playwright` and fails with
  `Executable doesn't exist at /root/.cache/ms-playwright/...` — the binary is
  present, merely not on the searched path.
- **Never run `npx playwright install chromium`.** It downloads from
  `cdn.playwright.dev`, which this sandbox blocks with HTTP 403, so it always
  fails with `Download failure, code=1`. That failure does **not** mean the
  browser is missing. Restore it instead with `bash /data/workspace/setup-qa-env.sh`
  (step 4), which pulls `@sparticuz/chromium` 152 from the reachable npm mirror
  and brotli-decompresses `bin/chromium.br`.
- Diagnosis order when browser tests will not start: (1) is the binary at
  `$REAL` and executable — `$REAL --version`; (2) is `PLAYWRIGHT_BROWSERS_PATH`
  exported; (3) only then consider re-downloading.

## Multi-Agent Collaboration

- More than one AI session may edit this repository at the same time. The
  sandbox keeps several working copies (for example `/data/workspace/rebuild`
  and `/data/workspace/wk`); each can hold a different snapshot of the same
  branch.
- Never push a full-repository bulk sync from a stale local copy. A bulk sync
  overwrites every file with the local snapshot and silently reverts changes
  another session already pushed.
  - Real incident (2026-09-11): a button restored in `src/original/villa-team.js`
    at `010fae10` was wiped one commit later by `ba55b183`, a bulk sync made
    from a copy that never pulled the fix. The user saw the button disappear
    right after being told it was restored.
  - The stale copy was detected afterwards by comparing
    `grep -c testBattle src/original/villa-team.js` (0) and
    `meta[name=game-build]` (20260910-05) against the remote.
- Before any bulk or many-file sync, check that the local
  `meta[name=game-build]` matches the remote one. If the local build id is
  older, pull and reconcile first instead of pushing.
- Push only the files that genuinely changed, after diffing each candidate
  against its remote version. Do not re-push bundles that are byte-equivalent
  but differ only because of a local terser version (for example `??1` versus
  `??!0`); that reintroduces unrelated churn and can clobber another session's
  artifacts.
- After pushing, re-read the remote file to confirm the change survived. A later
  bulk sync from another copy can still revert it, so re-verify before telling
  the user a fix is live.
- Binary assets need the same pre-push diff as source, and are easier to break
  silently because a diff is not obvious from the file name.
  - Real incident (2026-09-11/12): the user's own uploaded Lv.10 special art was
    committed by another session at `c63f48579f`. One day later `13e0b27014`
    pushed a stale local copy of
    `publish/assets/generated/angelica-level-10-special.9ce0de16.webp` and
    reverted it to the 2026-09-06 art. The path never changed, so nothing in the
    commit message hinted that art had been swapped.
  - Before pushing any image/audio, compare `git hash-object <file>` with the
    remote blob sha. If they differ but the intended change does not touch that
    asset, do not push it — the local copy is stale.
  - When restoring or replacing an asset, write it under a content-hash file
    name (`<name>.<sha256[:8]>.webp`) and update the reference. Asset URLs carry
    no `?v=`, so only a new file name busts the browser cache.
- This file *is* tracked by Git (it appears in the remote tree), so a bulk sync
  can overwrite it. Keep rules short and re-verify them after any bulk sync;
  also prefer keeping durable cross-session rules here because every session is
  told to read this file first.

## Memory Discipline

- Exact gameplay values and behavior belong in runtime/data sources and
  `docs/original/game-settings.md`, not in this file.
- Original source ownership belongs in `docs/original/architecture.md`.
- Original hazards and platform contracts belong under `docs/original/`.
- Original visual identity belongs in `docs/original/art-bible.md`.
- Original goals and experience principles belong in
  `docs/original/game-design.md`.
- When a user changes a rule, update the implementation first, then update the
  matching canonical document. If code and memory disagree, treat the conflict
  as a bug and reconcile it instead of silently choosing one copy.

## Test Count Expectations

- Numeric expectations in skill audits (`assert(x.length === N)`) go stale the
  moment a dungeon or character is added. Updating them is a **test-data
  update**, not "hiding a failure" — but only after confirming the new count is
  correct and every entry still resolves its artwork/catalog registration.
- A thrown assertion **masks every assertion after it**. After fixing the first
  failure in a suite, always re-run: later expectations are usually stale too.
  (`skill-audit` hid two more stale counts behind the combat-role assertion.)
- Adding entries to `data-combat-roles.js` `byId` is **not enough** — the unit's
  source array must also be present in the `templates` list, or `combatRoles`
  is never assigned. Ruins Sand City enemies were missing from that list.
- New playable-character active skills must be registered in
  `character-skill-access.js`; `definitionOf()` returning null breaks the
  boundary catalog audit. Unregistered skills still resolve in play because
  `canActor` defaults to allow, so this failure is invisible in manual testing.

## Two-State Verification Before Reporting Anomalies (2026-09-12)

**Never report a file as missing, broken, dangling or unreferenced until both
the remote tree and the local working copy have been checked.** A single-sided
check has produced two false alarms in two consecutive days.

- Required before reporting any anomaly, for every path involved:

  | local | remote | meaning | action |
  |---|---|---|---|
  | has | has | normal | diff them; only report if the diff is the intended change |
  | missing | has | local copy is stale | pull/re-fetch before concluding anything |
  | has | missing | never pushed, or deleted remotely | confirm with `commits` API — **0 commits means it never existed remotely**, not "deleted" |
  | missing | missing | **not an anomaly — it is nothing** | do not report, and do not create the file |

- Existence is only half the check. **Verify the reference direction too**:
  before calling something a "dangling reference", grep the *referencing* side
  (bundles, `package.json`, config) and prove at least one hit. A 404 with no
  referrer is not a broken link — there is no link.
- **Never fabricate a file to "fix" a dangling reference.** If nothing
  references it, creating it adds dead weight and hides the real state.

Two real incidents behind this rule:
- *2026-09-11* — "11 unreferenced assets": reported from a stale local copy.
  9 had **0 commits in the remote** (existed only in a sandbox copy); the rest
  were already deleted. A remote check would have killed the report instantly.
- *2026-09-12* — "`startup-marker.js` and `duplicates-legacy.js` are dangling
  runtime references": the remote check *was* done, but one-sided. Both files
  were absent locally **and** remotely, and `startup.min.js`, `package.json`
  and `.jscpd.json` contained **zero** hits. There was no reference to break.
  Reporting them as a crash risk nearly led to inventing two dead files.

The common failure is treating "I did not find it" as "it is broken". Absence
with no referrer is a non-event; say nothing.

## Asset "unreferenced" Audits (2026-09-11)

Never conclude an asset is unreferenced from a **stale local copy**. This is a
special case of the two-state rule above — check the remote tree *and* the local
copy before reporting anything:
- Sync the working copy against the remote tree first (compare blob SHA per path), otherwise deleted / never-pushed files look like "unused assets".
- On 2026-09-11 a report of "11 unreferenced assets" was entirely bogus: 9 of them (`futuristic-city*`, `mechanical-factory-assembly-line*`, `card-art-guard-break*`) had **0 commits in the remote** — they only ever existed in a stale sandbox copy; the rest had already been deleted.
- Exclude `deliver/`, `.studio/`, `node_modules/` when grepping for references. A leftover `deliver/` unpack dir once contained old bundles and produced fake "referenced" hits for already-deleted art.
- Two-file-name trap: `angelica-level-10-special.9ce0de16.webp` and `.1f484c88.webp` had **identical bytes** (sha256 `1f484c88…`). A name-based scan reports the unused twin as garbage — always compare content hashes before deleting art.
- Correct method: download every non-asset blob, grep basenames, then verify the reverse direction (every code reference resolves to an existing blob). Healthy state is a 1:1 match; on 2026-09-11 it was 223 refs / 223 files / 0 missing / 0 unreferenced.
