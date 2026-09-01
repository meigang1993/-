# Original Verification Policy

Executable scripts, package configuration, and current source are the command
authority. This document stores policy only, not test inventories or results.

## Scope

- Run the smallest directly relevant check after an implementation change.
- Game Studio experience reports inspect only the exported `publish/` game
  files. The container health scan instead snapshots the complete tracked
  `HEAD`; local QA also inspects `src/original/` directly.
- Documentation-only changes require consistency inspection only.
- Bundled source changes must rebuild the affected bundles and confirm that
  generated output is current.
- Published CSS or bundle changes must advance `meta[name="game-build"]`
  according to the repository build contract.
- Browser checks run sequentially with one Playwright worker.
- Playwright uses the repository-local `.playwright-browsers/` directory by
  default. Keep the binary directory Git-ignored; install the lockfile-pinned
  Chromium with `npm run playwright:install` after cloning or upgrading
  Playwright. If launch reports a missing Linux library, run
  `npm run playwright:install:deps`, then verify with
  `npm run check:toolchain`.
- Full, unrelated, performance, coverage, soak, screenshot, accessibility, or
  optimization suites require the user's explicit request.
- Do not retain per-bug regression lists, command transcripts, pass/fail
  histories, screenshots, reports, or completed investigation handoffs in
  canonical memory.

## Save Gate

Before saving:

1. Confirm `npm run check:hooks` passes.
2. Confirm every path under `publish/` is ASCII-only and contains no spaces.
3. Run the directly affected executable check when implementation changed.
4. Save through the Game Studio git save endpoint with a Chinese message.

The tracked pre-commit hook and current package scripts remain authoritative
for machine-enforced checks.
