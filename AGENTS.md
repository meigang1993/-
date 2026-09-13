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

## Playwright / Chromium in the Sandbox (2026-09-12)

- Chromium 152.0.7977.0 lives in the persistent directory
  `/data/workspace/.pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/`
  (197 MB). `/data/workspace/rebuild/.playwright-browsers` is only a symlink to
  it, so rebuilding the project copy never loses the browser.
- **Exporting `PLAYWRIGHT_BROWSERS_PATH` alone is NOT enough.** Every `bash`
  call starts a fresh shell, so an `export` in one call never reaches the next.
  Playwright then falls back to the default cache `~/.cache/ms-playwright` and
  fails with `Executable doesn't exist at /root/.cache/ms-playwright/...` —
  the binary is present, merely not on the searched path. This is why the
  environment "broke" repeatedly (4 times) even after being fixed.
- **The fix that survives shell resets** (both done by
  `bash /data/workspace/setup-qa-env.sh`, step 4):
  1. symlink `/root/.cache/ms-playwright/chromium_headless_shell-1228`
     -> `/data/workspace/.pw-browsers/chromium_headless_shell-1228`
  2. write `/root/.cache/ms-playwright/settings.json` containing
     `{"browsersPath":"/data/workspace/.pw-browsers"}`
  Neither depends on any environment variable, so a brand-new shell finds the
  browser automatically. Verify with `env -u PLAYWRIGHT_BROWSERS_PATH node <script>`
  — if it launches, the fix is real; if only `export` was used, it will fail.
- Note the repo symlink `.playwright-browsers -> .pw-browsers` is **not**
  sufficient on its own, because Playwright does not look there by default.
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

### 沙盒副本的 git status 不可信（根因）

沙盒副本 `/data/workspace/rebuild` 的 git 历史**只有一个 `baseline` 提交**，
它不是远程仓库的 clone，因此：

- `git status` 显示的 `D`（删除）**与远程无关**，只表示"工作区文件相对 baseline 快照少了"，
  通常是因为远程已删除该文件、本地同步时未写入。
- 据此得出"某某文件被误删 / 被另一 AI 拆分 / 副本陈旧"等结论**全部无效**。

**正确做法：判断文件是否存在，一律直接查远程 tree：**

```
GET /repos/meigang1993/-/git/trees/main?recursive=1     # 必须带 branch
```

再判断是否有害，必须查引用（全仓 grep + bundle 内 grep）。
三者都为 0（远程 404、源码 0 引用、bundle 0 命中）才算**已安全删除**。

**实测案例（4 个文件，勿再复查）**：
`battle-action-skill-bindings.js` / `battle-dodge-auto-response.js` /
`battle-manual-resume-actions.js` / `battle-save-checkpoint-piles.js`
→ 远程 404、全仓 0 引用、bundle 0 命中。**已清理干净，无 BUG，无需任何处理。**
（来源为用户用 MonkeyCode 上传时带入，后被清理。）

### 三个 AI 共用同一仓库

本项目同时有 **3 个写入方**：元宝（本 AI）、另一 AI、MonkeyCode（用户侧工具）。
因此每次推送前必须**逐文件比对本地与远程 blob sha**，只推确认属于本次改动的文件；
任何"看起来该删/该改"但无法追溯来源的项，一律不动并上报用户。


## Bundle 推送：禁止混用 Contents API 与 Git Tree API

**事故**：2026-09-13 推送蓄力子弹描述改动时，先用 `PUT /contents/{path}`
逐个上传 4 个文件，再试图用 Git Tree API 合成一个原子 commit。结果：

- Contents API **每上传一个文件就自动创建一个 commit**（message 为传入的 message），
  于是远程出现 4 条碎片 commit；
- 后续 Tree/Commit 基于已过期的 `base_sha`，`PATCH /git/refs/heads/main` 返回 **422**。

**规则（二选一，禁止混用）**：

- **方式 A（单文件/少量文件）**：只用 Contents API。逐个 `PUT /contents/{path}`，
  接受每条一个 commit，**message 要写具体**（勿用 "update"）。适合 1~5 个文件。
- **方式 B（多文件原子提交）**：只用 Git Tree API。先 `POST /git/blobs` 创建 blob，
  再 `POST /git/trees`（带 base_tree），再 `POST /git/commits`，最后 `PATCH` ref。
  **全程不要碰 `/contents/`**。

混用的后果不是失败，而是**静默产生碎片历史**，比失败更难发现。

## 构建产物：远程 bundle 格式不统一，勿全量重建覆盖

实测远程 `publish/bundles/*.min.js` **并非同一套构建脚本产出**：

- `battle-rules` / `hall` / `startup-store` 等：带头部注释
  `/*! generated from tools/publish-bundles.json: X */`
- `startup` / `startup-app` / `battle-skills`：**无**该头部注释

本地 `node tools/build-publish-bundles.js` 会给**所有** bundle 加头部注释。
因此全量重建后直接推送，会改变那 3 个 bundle 的格式（体积分别 +1576 / +3909 / +9155 字节），
虽功能等价，但属于用本机构建产物覆盖他人产物。

**正确做法**：

1. 改动仅涉及**字符串/文案**时，下载远程 bundle，做**精准字符串替换**后回传
   （本次 startup 仅 +20 字节），不重新构建。
2. 必须重建时，只推**归属本次改动源文件**的 bundle（查 `tools/publish-bundles.json`
   确认归属），其余一律不推。
3. 重建后若发现未归属的 bundle 变 DIFF，**从远程下载覆盖回本地**，保持本地与远程一致，
   避免下次误推。
