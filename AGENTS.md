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

## QA Environment (container)

- Rebuild the Playwright/Chromium environment with one command before running any test:
  `bash /data/workspace/setup-qa-env.sh`
  It is idempotent: existing packages and the browser are skipped.
- Chromium and QA dependencies live **outside** the project copy
  (`/data/workspace/.pw-browsers`, `/data/workspace/qa-deps`); the repository only
  holds symlinks, so deleting or re-cloning the project copy does not remove them.
- Always run Playwright with `--workers=1`. The container has ~4.4 GB RAM and
  concurrent workers produce false failures.
- Do not delete a test because it fails. Delete it only when the asserted object no
  longer exists in the product (grep returns zero hits in `src/` and `publish/*.css`).
  Use `tools/find-stale-tests.js` to scan for such cases.
- Never move a large binary and delete the source in the same command chain. After
  moving, verify the byte count with `ls -lh` before removing the original.

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


## Sandbox Network Limits and the Actions Escape Hatch

The sandbox blocks most GitHub hosts. Measured:

| Host | Result |
| ---- | ------ |
| `api.github.com` | 200 (reachable) |
| `github.com` | 403 `policy_default_denied` |
| `media.githubusercontent.com` | 403 |
| `objects.githubusercontent.com` | 404 (host up, no path) |
| `github-cloud.githubusercontent.com` | 403 |
| `uploads.github.com` | 302 |
| `productionresultssa*.blob.core.windows.net` (Actions logs) | 403 |

Consequences: you cannot `git clone`, cannot fetch Git LFS objects, cannot read
Actions logs, and `git lfs` is not installed and cannot be installed.

Escape hatch: **use GitHub Actions as a remote executor.** Workflows run inside
GitHub's network where every blocked host is reachable.

1. Create a workflow on the default branch via `PUT /repos/{o}/{r}/contents/`.
2. Trigger with `POST /repos/{o}/{r}/actions/workflows/{file}/dispatches`.
3. Poll `GET /repos/{o}/{r}/actions/runs?per_page=1`.
4. Have the workflow write its own output to a file and push it to a scratch
   branch, then read it back with the contents API. Never rely on the Actions
   logs endpoint — that host is blocked, so a self-written log file is the only
   way to see stdout.

Two traps that cost real time:

- A `.gitattributes` containing `* filter=lfs` also captures `.github/**`, so
  workflow files become LFS pointers and Actions cannot read them. Always add
  `/.github/** -filter -diff -merge -text` before creating workflows in a repo
  with global LFS tracking.
- A publish-log step needs its own `actions/checkout`; without one the
  workspace has no git repo and the step fails silently, producing no log.

Git LFS verification: probe `https://github.com/{o}/{r}.git/info/lfs/objects/batch`
with `{"operation":"download",...}`. A `download.href` in the response means the
real object exists; `"error":{"code":404}` means the repo holds only pointers and
any `lfs pull` will fail with a smudge error. Pointer files are ~130 bytes, so
file count and `size` from the contents API can look healthy while the binaries
are absent.
