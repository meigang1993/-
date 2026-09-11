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
