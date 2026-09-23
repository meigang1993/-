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

## Anti-Fabrication — No Result Without A Tool Trace (2026-09-16)

Three times — version 37, version 12, and the card-shop audit — a complete
report was produced **without a single command being run**. Files, bug counts,
percentages, and savepoint paths were all generated from a remembered success
template. The output looked professional because the *format* was familiar; the
only missing thing — execution — leaves no visible trace in prose.

Rules recalled at the moment of writing do not help: the failure happens when
the assistant has already switched into "fill in the template" mode, and that
mode does not consult rules. So the guards below are **binary checks**, not
resolutions.

**① A turn with no tool call has produced no result.**
Every real action in this setup goes through a tool. If a turn contains no tool
result, the only honest outputs are "this is my plan" or "this is a proposal".
Never a completion report. "Did I call a tool?" is a yes/no question, not a
memory — it is the one check that survives the failure mode.

**② Every number and filename must appear verbatim in this turn's tool output.**
`53/53 unlocked`, `8 real bugs`, `0.64%` are the tell: precise, confident, and
impossible without a run. If a figure cannot be pointed at in raw output, write
"not measured" instead. **Saying "I did not test it" is always available;
inventing a passing measurement is not.**

**③ Keep plan and evidence in separate columns.**
Mixing them is the direct trigger: a `PROGRESS.md` line like
"next: fix the dead flag" gets read on resume as *already done*, and then a full
report grows around it. Use `## Done (with evidence)` and
`## Next (planned, not executed)`. Any claim of completion carries its command
and exit code, or it moves to Next.

**What the user can do — the cheapest and most reliable check.**
"Paste the raw output of that command." A fabricated run cannot produce it;
what follows instead is an explanation of why the output was not saved. Compare
the remote commit timestamp and message against what was claimed. Self-promises
have already failed three times; verification from outside has caught all three.

## Sandbox DNS — Run `fix_dns.sh` First On Every Session

The sandbox's default nameservers `183.60.83.19` / `183.60.82.98` drop roughly
80% of UDP queries. Measured 2026-09-17: 6 queries → 1 success on each.

Because `resolv.conf` servers are tried in order with a 5s timeout and retries,
a failed lookup burns up to ~20s before failing. It surfaces as:

```
socket.gaierror: [Errno -3] Temporary failure in name resolution
```

and it is **intermittent** — the same command passes on retry, which makes it
look like flaky network rather than a broken resolver.

Fix — put public DNS first:

```bash
source /data/workspace/fix_dns.sh     # idempotent, self-checks
```

Measured after: 30/30 successful, median 8ms (was max 20s). `urllib`, which
failed most often, went to 10/10 at ~626ms per call.

Do not confuse this with a real push failure. A DNS failure means the request
never left the sandbox; nothing was written. Retry after `fix_dns.sh`.

## Sandbox Egress Is Allowlisted — `yb.woa.com` Can Never Be Fetched

The sandbox reaches the internet through a transparent proxy. Only allowlisted
domains actually serve HTTP. `github.com` / `raw.githubusercontent.com` /
`api.github.com` are allowed; **`yb.woa.com` is not.**

Measured 2026-09-17, after `fix_dns.sh` (so DNS is confirmed good):

| target | result |
|:--|:--|
| `yb.woa.com` | 3/3 fail — `http=000`, 0 bytes, 18s timeout |
| `api.github.com` | 3/3 ok — `http=200` |

**This is not fixable from inside the sandbox.** It is infrastructure policy.

### The trap: TCP connect succeeds, HTTP never returns

```
connect=0.008s   ← proxy accepts instantly, so it LOOKS reachable
http=000 0 bytes ← then the request is silently dropped
```

A TCP connect test against a non-allowlisted host returns success because you
are connecting to the proxy, not the origin. **Never report a host as
"reachable" based on `socket.connect()` alone** — issue a real HTTP GET and
check for a status code. Reporting "connected fine" here would be exactly the
kind of unverified claim this file exists to prevent.

### What this means for image assets

Generated image URLs (`http://yb.woa.com/...`) are viewable by the user but
**cannot be downloaded by the sandbox**. Do not claim you will "compress and
wire in" an image you generated — you will get as far as a download timeout.

The only working path, verified repeatedly: **the user uploads the file to the
GitHub repo root**, then fetch it via `raw.githubusercontent.com` (works for
multi-MB files, e.g. the 2.8 MB `安洁莉卡特殊.png` on 2026-09-16).

Tell the user this up front instead of generating an asset and then failing to
ingest it.

## Sandbox Playwright — Run `setup-playwright.sh` Before Browser Tests

Playwright looks for browsers at `/root/.cache/ms-playwright`, but in this
sandbox they live at `/data/workspace/.pw-browsers`. Without the env var,
launch fails:

```
browserType.launch: Executable doesn't exist at
/root/.cache/ms-playwright/chromium_headless_shell-1228/...
```

The trap: some older scripts `export PLAYWRIGHT_BROWSERS_PATH=...` internally,
so browser tests appear to work — until a session runs one that does not, and
it fails in a way that reads like "browser not installed".

Fix — symlink the default path to the real one (preferred over the env var,
because it works for every entry point: `npm test`, `node -e`, CI):

```bash
bash tools/setup-playwright.sh     # idempotent; self-checks by launching
```

Note `/root/.cache` sits on the container layer and may be reset between
sessions. If the self-check fails, re-run the script.

Do not "fix" this by deleting `.pw-browsers` or reinstalling — there is only
one browser copy (chromium 152.0.7977.0, headless shell 1228) and it is
required by the test suite.

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

## Push Policy — Stage Locally, Push Only On Request (2026-09-14)

**Default is: do not push.** After finishing an update, keep everything in the
permanent working copy `/data/workspace/repo`, print the list of changed files,
and wait for an explicit "推送" instruction from the user. Verification is still
required — only the push itself is gated.

- Finish the edit → rebuild bundles → run the test suites → **verify** → report.
- Report must end with a "待推送清单" listing every changed file, so the user can
  decide when (or whether) they go remote.
- Stage the same set as an overlay package under `/data/workspace/` so the push,
  when requested, is a one-step apply.

### Atomic version + content pushes

A version bump (`publish/index.html`, `publish/villa.css`) **must never be pushed
without the content it advertises**. Shipping the bump alone produces the worst
possible state: the UI reports version N while the bundles still run version N-1,
so the tester believes a fix is live when it is not.

Before any push, confirm the batch is complete:

```
version files  +  every modified src/original/*.js  +  every affected bundle
```

Then re-run the full-file git-blob SHA comparison (not a sample) to prove the
remote matches. See "Resolved case: version 34 shipped without its content".

### Resolved case: version 34 shipped without its content (2026-09-14)

Reported symptom: "神数标记增加的属性有效，但面板没有变化". Root cause was **not** a
logic bug — the 33 fix (marks accumulate, capped by target, instead of resetting
to zero) was never pushed. Only 3 files reached the remote
(`villa.css`, `index.html`, one bundle), leaving the remote on the old
reset-to-zero code while `index.html` already advertised version 34.

Eight files were out of sync when the full comparison finally ran:

```
src/original/artina-maria-skills.js      marks accumulate + temp clear at turn end
src/original/data-new-characters.js      skill text (三国杀式 + cap wording)
src/original/ui-info.js                  bonus = Math.min(marks, target)
publish/bundles/startup.min.js           skill text
publish/bundles/startup-app.min.js       bonus cap
publish/bundles/battle-skills.min.js     early-return refactor
tools/test-new-character-skills.js       assertions
tests/preview-artina-maria-skills.spec.js
```

Lesson: a Contents API push returns 200 per file, so a partial batch *looks*
completely successful. Success must be proven by a whole-tree blob SHA diff
afterwards, never by the per-file status codes.

### Push transport: `urllib` `method=` is not trustworthy (2026-09-14)

**Never use `urllib.request.Request(..., method='PUT')` to push.** On several
call paths the `method=` kwarg does not take effect and the request goes out as
`GET`. A GET on an existing file returns **200**, so the push looks successful
while nothing changed. This is the root cause of the "version 29 pushed but
never arrived" incident: the write silently no-op'd, and the follow-up read hit
a cache and confirmed the false success.

Use one of these instead:

```
http.client.HTTPSConnection('api.github.com').request('PUT', path, body, headers)
curl -X PUT ... -d @payload.json        # large files: body from file, not argv
```

`curl -d @payload.json` matters for big files (`docs/开发日记.md` is ~110 KB;
base64 in an argv exceeds the limit and fails with `Argument list too long`).

### Push verification: three channels (2026-09-14)

The user requires verification after **every** push. Per-file status codes are
not verification. Run all three:

| # | channel | proves |
|---|---|---|
| 1 | whole-tree blob SHA diff (`/git/trees/main?recursive=1`) | every path matches byte-for-byte; catches partial batches |
| 2 | contents API read-back, compare returned `sha` | the server really stored the bytes |
| 3 | `codeload` tarball + `cmp` | independent of the write path entirely |

Channel 1 is the authoritative one — git blob SHAs are content-addressed, so
`1048/1048 identical` is a byte-level proof across the whole repo.

**Do not trust `raw.githubusercontent.com` as the sole check.** In this session
it returned **0 bytes** for `publish/index.html` (the same URL that had worked
earlier), and it can serve stale content for source paths behind CDN cache. It
is fine as a supporting signal, never as the verdict.

Two mechanics that cost time and are worth remembering:

- The tarball's top-level directory is **`--main`** (repo name is `-`), which
  every shell parses as an option. Always prefix `./` — `./--main/publish/...`
  — or `cmp`/`ls` fail with `unrecognized option`.
- The tarball only contains **263 `publish/` files**: `.gitattributes` marks
  `src/`, `tools/`, `tests/`, `docs/` `export-ignore`. It can verify bundles and
  version files but **cannot verify source**, so channel 1 remains mandatory.

### Settled design: 神数咒语 marks clear when the target is reached (2026-09-14)

The mark semantics were changed **three times**; the user rejected both
alternatives, so treat this as settled and do not "improve" it again.

```
31  clear on reach          user: 面板看不到变化（加成瞬间归零）
33  accumulate, cap=target  user: 标记达到目标没有清空  ← rejected
34  clear on reach          ← current, do not change
```

The user's two explicit requirements, in their own words, are both satisfied by
clearing: *"把标记清0，不然角色输出很强，数字也乱"* (output control + clean
numbers). The 33 "panel does not change" complaint was a **separate** display
issue; the fix is to make the attribute panel reflect temp bonuses, **not** to
keep marks alive. Never trade a stated game-balance requirement away to make a
UI symptom disappear.

With clearing, the bonus sequence is a sawtooth `0,1,0,1,2,0` and the badge reads
`mark/target` where the mark is always below the target — that is intended, not a
bug.

### Settled design: 荣誉祝福 counts 玛利亚's current attack, including temp bonuses (2026-09-16)

Honor Blessing used to read `actor.stats.attack` only, so 神数咒语's
`tempAttack` never reached the team. The user tested the documented combo
("stack marks to 2/3 or 3/4, then bless") and reported **"好像没有效果"** — the
combo was real but the code ignored it, and the attribute panel showed
`stats + temp` while the bless granted `stats`, so the numbers never reconciled.

```
实际攻击 = stats.attack + tempAttack      ← 两段式，面板显示这个
bonus    = stats.attack + tempAttack      ← 祝福必须取同一口径（speed 无 temp）
```

Do **not** revert to `stats`-only. The old comment claimed counting temp bonuses
would cause "无限膨胀"; that is wrong — inflation is already prevented by
subtracting `self` (the previous bless bonus), and by the
`usedMariaHonorBlessing` + `mariaBlessingSuits` double lock. Verified: casting
twice keeps the team at the same total instead of stacking.

Decay stays exact: the bonus is snapshotted at cast time and subtracted
verbatim, so clearing 神数 marks at end of turn cannot corrupt it.

Regression: `tools/test-maria-blessing-tempattack.js` (4 scenarios: no marks,
with marks, repeat-cast no inflation, exact decay back to base).

### Settled design: test battles trial every skin, formal play keeps level art locked (2026-09-15)

Two different contexts, two different rules — do not collapse them:

| 场景 | 等级特殊立绘（`unlockLevel`） | 普通未拥有皮肤 |
|:--|:--|:--|
| 大厅 / 正式战斗 | **锁定**：按钮禁用、不渲染立绘本体 | 不可装备 |
| 测试战斗（`battle.test`） | **可试用**：可选、渲染、外观生效 | 可试用 |

Implementation points:

- `SkinSystem.testEquip` writes **`testSkins` only**. It must never grant
  `ownedSkins` or overwrite `equippedSkins`. Trialing a level-10 art at level 0
  does **not** unlock it.
- `selectedForUnit` trusts `testSkins` **only** while `state.battle.test` is true,
  so a leftover `testSkins` entry cannot leak into formal play.
- `ui-info.js` computes `specialLocked = !!s.unlockLevel && !formalOwned && !trial`
  — the `!trial` term is what unlocks trialing. Dropping it silently re-locks
  test battles; removing `!formalOwned` leaks unreleased art in the hall.
- `villa-test.js` labels locked level art `Lv.N试用` and **does not** disable the
  button.

History: this was "locked everywhere" once (2026-09-15), which over-corrected and
blocked legit trialing. The browser case
`test battle lets Bertis trial special art before level 10` is the regression
guard — if it fails, someone re-locked trials or let trials grant ownership.

### Whole-tree comparison (zero-download)

`api.github.com` cannot be reached for browsing but the tree endpoint works, and
git blob SHAs can be computed locally, so the entire repository can be compared
without downloading a single file body:

```
GET /repos/{owner}/{repo}/git/trees/main?recursive=1     # 1 API call
local_sha = sha1("blob <len>\0" + file_bytes)            # compare to tree sha
```

This finds three classes: missing locally, extra locally, content-divergent.
Run it before reporting any "in sync" claim.

### Note on `codeload` tarballs

The `codeload` archive of this repo contains **only 263 files** (the `publish/`
tree) because `.gitattributes` marks `src/`, `tools/`, `tests/` and `docs/` with
`export-ignore`. It is fine for verifying `publish/`, useless for verifying
source or docs. Use the tree endpoint for those.

## Bundle Rebuild Discipline — Never Ship Source Without Rebuilding (2026-09-13)

Any edit to `src/original/*.js` **must** be followed by a bundle rebuild before
pushing. The full required sequence is:

```
1. bump version: publish/index.html (12 sites) + publish/villa.css (4 sites)
   + badge v26.0911.N — all three must move together
2. npm run build:bundles
3. npm run check:bundles        # == node tools/build-publish-bundles.js --check
4. push: changed bundles + version files
```

**Never bump the version alone without rebuilding.** `assertRepositoryPublishVersion`
enforces that the version advances, but it does not prove bundles match sources —
only `--check` does.

The same trap hits the *receiving* side: browser tests load `bundles/`, never
`src/`, so a stale bundle makes correct source look broken. When handing a fix to
another session, tell it to rebuild too — see
*Multi-Agent Collaboration → Tell the other session to rebuild, not just to pull*.

### Ship `.map` files together with their bundles (2026-09-15)

`tools/build-publish-bundles.js` emits **two** artifacts per bundle:

```
publish/bundles/<name>.min.js        # carries a trailing //# sourceMappingURL= comment
publish/bundles/<name>.min.js.map    # the mapping itself
```

Bundles are single-line minified files (60–190 KiB; `battle-rules` alone holds
29,802 mapping segments). Without the `.map` present on the remote, every
production stack trace reads `battle-rules.min.js:2:<col>` and cannot be traced
back to `src/original/...`. **A push that includes `.min.js` but omits
`.min.js.map` is incomplete** — every file still returns HTTP 200, so the
per-file success code proves nothing.

- Push 11 `.min.js` **and** 11 `.map` in the same batch.
- Verify with `contents/publish/bundles?ref=main`; it must list **22** entries.
- To prove a push is behaviour-neutral: strip the trailing
  `//# sourceMappingURL=` line from the local `.min.js` and compare its git
  blob SHA with the remote. Equal SHA ⇒ the only delta is that comment.
- `includeSources` defaults to **true**: every map embeds `sourcesContent`, so
  DevTools resolves real files and lines even from a standalone `publish/`
  deployment or a downloaded release archive — no `src/` needed.
- Opt out with `node tools/build-publish-bundles.js --no-sources`
  (`npm run build:bundles:lean`) when the publish artifact must stay small.
  Lean maps then fall back to resolving `../../src/original/...`, which only
  works from a checkout.

Measured cost of embedding (2026-09-15):

| | maps total | build time |
|---|---|---|
| `--no-sources` | 1.22 MiB | ~44 s |
| default (embedded) | 3.02 MiB | ~96 s |

The +1.79 MiB equals `src/original` (1,739,002 bytes) **exactly once** — the
manifest is an exact partition of all 416 sources across the 11 bundles, so
nothing is duplicated. `.map` is only fetched when DevTools is open, so players
never download it; the cost is repository size and build time, not runtime.
Embedding never changes `.min.js` bytes (verified: all 11 SHAs identical across
both modes).

### Bundle ownership is declared, not guessable

Every source file's bundle is fixed in `tools/publish-bundles.json`. **Do not
infer it from the filename.** Real example that caused a false bug report:

```
src/original/ui-info.js  →  startup-app        (NOT battle-ui)
```

`validateManifest()` also enforces that the manifest covers *exactly* the file
set under `src/original/` — a new source file without a manifest entry fails the
build loudly, so silence means coverage.

### Verifying a reported "bundle drift" before acting (2026-09-13)

A report of the form *"you changed X but did not rebuild bundle Y"* can be a
false positive. Confirm all four before touching anything:

1. Which bundle does X actually belong to? (`publish-bundles.json`)
2. Does `npm run check:bundles` pass locally against the *remote* source set?
3. Do the local `src/original` files match remote blob SHAs? (0 diffs required)
4. Do all 11 remote bundles match local byte-for-byte?

If all four pass, the drift is not in the repository — it is in the reporter's
working copy (uncommitted local edits, or a stale HEAD). **Report the evidence
rather than "fixing" a non-problem.** Note that a teammate who later pushes
their own source edit without rebuilding *will* create real drift, so the rule
above still stands.

### Resolved case: `battle-ui` `!0` vs `1` (2026-09-13, closed)

**Symptom.** `--check` flagged only `battle-ui` as stale; the other 10 bundles
matched. Local rebuild produced 78,903 bytes vs HEAD's 78,905.

**Root cause (two Terser versions, not a missed rebuild).** At offset 7581:

```
HEAD (terser 5.51.2):  …attle)??!0)&&awa…
local (terser 5.49.0): …attle)??1)&&awa…
```

`!0` and `1` are both `true` — **semantically identical**, different literal
spelling across Terser minors. `preamble` was byte-identical, ruling out a
build-script difference. The sandbox runs **5.51.2**; the lockfile pinned
**5.49.0**; each environment was internally consistent with its own lock, so
neither side was "wrong".

**Why only one bundle.** The divergence needs input whose compressed output
contains a bare `true` in that exact position; 10 of 11 bundles never hit it.

**Fix applied (two rounds — the first was incomplete).** Aligned the lockfile to
the version that actually produced HEAD: `package.json` `^5.49.0 → ^5.51.2`,
and in `package-lock.json` **both** places terser appears:

1. `packages[""].devDependencies.terser` — the root package's declared range
2. `packages["node_modules/terser"]` — `version`, `resolved`, `integrity`

Dependency ranges were identical between 5.49.0 and 5.51.2, so no
sub-dependency churn. `integrity` was verified by re-hashing the real tarball.
Post-change: all 11 bundles rebuild byte-identical, `--check` reports current.

**Trap: a lockfile carries the dependency twice, and both must be edited.**
Round one changed only `packages["node_modules/terser"]`. The other environment
ran `npm ci --include=dev` and still got **5.49.0**, because
`packages[""].devDependencies` still said `^5.49.0` — npm resolved from the
root declaration. Symptoms: `npm ci` "succeeds" but installs the old version,
then `build:bundles` dies with
`Cache-versioned publish resources changed (bundles/battle-ui.min.js); bump
meta[name=game-build] above …`.

**Do not bump `game-build` to silence that error.** It fires because the
freshly-built bundle differs from HEAD's — i.e. the toolchain is wrong, not the
version stale. A bump changes zero bytes inside bundles and only masks the
mismatch. Fix the dependency, then rebuild.

### Symptom: `git pull` says "Already up to date" but the working copy is behind

Seen after the `魅魔杀 → main` rename. A clone made while the branch had its
old name keeps a **single-branch refspec**
(`remote.origin.fetch = +refs/heads/魅魔杀:refs/remotes/origin/魅魔杀`).
That ref no longer exists upstream, so `git pull` fetches nothing new and
merges a **stale** remote-tracking ref — it reports "Already up to date" while
sitting N commits behind.

**Check `remote.origin.url` FIRST — it outranks the refspec hypothesis.**
In the actual resolution of this case the agent reported "已将 origin 更新为
`https://github.com/meigang1993/-.git`" — its configured origin had pointed
somewhere else. `git pull` then ran against a *different* remote that legitimately
had nothing new, so "Already up to date" was truthful about the wrong repo.
A stale refspec and a wrong URL produce identical symptoms; confirm the URL
before touching `remote.origin.fetch`.

**Tell-tale sign:** a build error quoting a version you already advanced, e.g.

```
Cache-versioned publish resources changed (bundles/battle-ui.min.js);
bump meta[name=game-build] above 20260911-26 before rebuilding
```

`20260911-26` is read from **`HEAD:publish/index.html`**. If you already pushed
27, that message proves the local HEAD predates your push — not that the remote
is stale. Check the remote before believing your own `git pull`.

**Confirm which side is wrong (never assume — check the remote directly):**

```bash
git remote -v                            # FIRST: must be meigang1993/-.git
git rev-parse --abbrev-ref HEAD          # expect: main
git rev-parse HEAD                       # compare with the remote tip
git config --get remote.origin.fetch     # single-branch refspec is the other cause
git branch -vv                           # upstream shown here
grep -o 'name="game-build"[^>]*' publish/index.html
```

**Fix:**

```bash
git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git fetch --prune origin
git branch --set-upstream-to=origin/main main   # or: git checkout -B main origin/main
git reset --hard origin/main                    # ONLY on a clean tree
```

`git reset --hard` discards uncommitted work — run `git status` first.

**Resolved (2026-09-14).** All three working copies now report `terser 5.51.2`,
`build:bundles` succeeds, and `--check` reports **11/11 current**. No
`game-build` bump was used at any point — the mismatch was toolchain-only, so
bumping would have changed zero bytes and only masked it. Root cause was the
agent's origin pointing at a different remote, not a stale refspec.

**Verify after any dependency realignment:**

```bash
node -e "const d=require('./package-lock.json');\
console.log('root decl :',d.packages[''].devDependencies.terser);\
console.log('locked    :',d.packages['node_modules/terser'].version)"
grep -c '5\.49\.0' package-lock.json   # expect 0 after migrating to 5.51.2
```

**Aftermath for other environments.** Anyone who previously ran `npm ci` on the
old lock has 5.49.0 installed and must reinstall:

```bash
npm ci --include=dev          # plain `npm ci` may skip devDeps if omit=dev is set
node -e "console.log(require('terser/package.json').version)"   # expect 5.51.2
npm run build:bundles
node tools/build-publish-bundles.js --check
```

**Do not** "fix" this class of diff by rebuilding-and-pushing from a
mismatched environment: that flips the bytes back and starts a ping-pong
between environments. Align the dependency first, then rebuild.

**Do not** advance `game-build` for it — version strings are not injected into
bundles, so a bump changes zero bytes and only pollutes version history.

### Diagnosing a single-bundle mismatch: suspect Terser, not a missed rebuild (2026-09-13)

If `--check` flags **one** bundle (e.g. `battle-ui`) while the others match, do
**not** conclude "source was changed without rebuilding". A missed rebuild
usually fails loudly across the bundle(s) that own the edited file — and file→
bundle ownership is declared in `publish-bundles.json`, never inferred.

A single-bundle mismatch is far more often **build-environment drift**. Compare
these three things first:

1. **Terser actual dependency** — `package.json` may declare a caret range
   (`"terser": "^5.49.0"`) while `package-lock.json` pins an exact version
   (`5.49.0`). Any environment that resolves fresh gets a *newer* minor whose
   compression heuristics differ, producing different bytes for identical
   input. Verify with:
   ```
   node -e "console.log(require('terser/package.json').version)"   # 实际运行版本
   python3 -c "import json;d=json.load(open('package-lock.json'));\
     print([v.get('version') for k,v in d['packages'].items() if k.endswith('/terser')])"
   ```
2. **Build parameters** — `tools/build-publish-bundles.js` `compile()`:
   `compress.passes=3`, `keep_classnames`, `keep_fnames`,
   `mangle.keep_classnames/keep_fnames`, `ecma=2020`,
   `format.ascii_only=false|beautify=false|comments=false`, plus a
   `preamble`. A differing preamble alone shifts every byte offset.
3. **Bundle SHA** — compare the remote blob SHA/byte length against the local
   rebuild before deciding anything.

Known state at 2026-09-13: sandbox runs terser **5.51.2** while the lockfile
pins **5.49.0**; the 11 remote bundles still rebuilt byte-identical, so the
drift had not yet manifested. Treat this as a live risk, not a settled matter.

**Do not advance `game-build` merely to paper over such a mismatch.** A version
bump does not change bundle bytes (version strings are not injected into
bundles), so bumping "to fix" a bundle diff ships nothing and pollutes the
version history. Resolve the dependency/param difference, or report the
evidence and let a human decide.

### Rebuild is idempotent when sources are unchanged

If `npm run build:bundles` reproduces all 11 bundles byte-identical to remote,
that is proof sources and bundles are in sync — only the version files need
pushing. Version strings are **not** injected into bundle bodies, so a version
bump alone changes `index.html` / `villa.css` only.

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

### Tell the other session to rebuild, not just to pull (2026-09-15)

Handing another session a fix is not finished when the push lands. If the fix
touched `src/original/*.js`, say explicitly:

```
git pull
npm run build:bundles      # ← required; a pull alone runs the OLD bundle
npm run check:bundles
```

Why the reminder is necessary: the browser entry point is
`publish/index.html` → `publish/bundles/*.min.js`. `src/original/` is **not**
loaded at runtime. A pull that brings new source but no rebuilt bundle leaves
the page executing pre-fix code, so tests fail on a fix that is already
correct in the source tree — which reads exactly like a broken fix.

- Real incident (2026-09-15): four existing level-art cases (Bertis / Nonoka /
  Lokar / Besta Doll) failed on the other session while the local source was
  already correct. Root cause was `publish/bundles/hall.min.js` still carrying
  the pre-fix `villa-test.js`; rebuilding made all four pass **without touching
  a line of source**.
- Diagnostic order when the other session reports failures in code you believe
  is correct:
  1. `node tools/build-publish-bundles.js --check` — must be `11/11 current`.
  2. Compare the remote `.min.js` blob sha against a freshly built local one.
  3. Only then suspect the source. Do **not** "fix" correct source to satisfy a
     stale bundle; that is how the trialing rule got over-corrected into
     "locked everywhere" the same day.
- Symmetrically, when you are the one pulling someone else's source change,
  rebuild before running browser tests — otherwise you will report a regression
  that exists only in your stale bundle.

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

## Sandbox QA Tooling (2026-09-16)

### 四个 lint 依赖缺失会导致"假通过"
`stylelint / htmlhint / eslint / jscpd` 未安装时，四项检查**耗时 0.02~0.19 秒就退出并报 FAIL**，
并非代码有问题。装好后才能暴露真实问题（实测装完立刻查出 3 项：见下）。

沙盒装法（依赖在全局 `/usr/local/lib/node_modules`，但 npm 未建 `.bin` 软链，需手动链）：

```bash
G=/usr/local/lib/node_modules
mkdir -p node_modules/.bin
ln -sf $G/eslint/bin/eslint.js   node_modules/.bin/eslint
ln -sf $G/htmlhint/bin/htmlhint  node_modules/.bin/htmlhint
ln -sf $G/stylelint/bin/stylelint.mjs node_modules/.bin/stylelint
ln -sf $G/jscpd/run-jscpd.js     node_modules/.bin/jscpd
```

`node_modules` 被 .gitignore 排除，不影响远端。
本机安装请用 `npm i --include=dev`（有 `omit=dev` 配置时默认不装 dev 依赖）。

### 沙盒慢的根因：小文件元数据，不是 CPU
根因是**小文件创建/元数据操作**，不是 CPU 也不是带宽。
实测：磁盘上创建 300 个小文件要 **26 秒**，tmpfs 只要 **<1 秒**（约 26×）。
node 要 require 几千个小文件，全卡在这里。

加速脚本 `sandbox-fast.sh`（tmpfs 挂载到 /mnt，2G）。**2026-09-16 复测值**：

| 操作 | 磁盘 | tmpfs | 加速 |
|---|---|---|---|
| test:logic | 12.6s | 6.7s | 1.9× |
| build:bundles | 31.5s | 7.5s | 4.2× |
| check:core | 42.6s | 7.4s | 5.7× |

⚠️ 本节早期曾记录过 "全量测试 89s→10s(8.7×)、build 109s→10s(10.9×)"，
那些数字**未经实测、不可信**，已由上表替换。引用本节数据时请以复测值为准。

**该不该用 tmpfs**：只跑 `test:logic` 不划算（复制 9~56 秒 + 6.7s，不如直接磁盘跑）；
跑 `build:bundles` + `check:core` 才省时间（磁盘 74s → 约 15s + 复制）。
复制耗时波动大（9~56 秒，取决于页缓存冷热）。

⚠️ tmpfs 副本**必须完整**，否则静默出错：
缺 `.git` → `build:bundles` 直接 exit=1（"Publish version checks require a Git worktree"）；
缺 `publish/assets` → 约 10 个测试 FAIL（audio-loading 等要读真实素材）。
所以只排除 `node_modules` 与浏览器缓存，其余全带。用完务必同步回磁盘。

### 已确认的两处历史隐患（装完 lint 才暴露）
1. `manny-skills.js` `resolveCounterTrigger` 被完整重复定义两次（127/137 行，内容逐字相同）。
   JS 函数提升使后者覆盖前者，当前无行为差异，但属冗余，且掩盖后续修改。
2. `angelica-berserker-skin.css:205` `scaleX()` 被当作独立 CSS 属性使用——CSS 无此属性
   （应为 `transform: scaleX(1.45)` 或 `scale: 1.45 1`），浏览器会忽略，`imperialScarClose` 动画实际不生效。

### duplicate budget 已单独排期（2026-09-16）
`npm run check:core` 里 `duplicate budget` 目前 FAIL（jscpd 0.50% > 阈值 0.3%，16 clones / 177 行）。
**不要在别的任务里顺手修**，已单独排期，详见 `docs/技术债务排期.md`（含实测 clone 清单、分类、修复估算）。

要点：120 行属**皮肤 FX 模板互似**，硬抽公共层会伤可读性，不建议动；
真正该修的是同文件内重复（27 行，`battle-manual-continuation.js`）+ 跨文件非皮肤（46 行）。

⚠️ 处理任何技术债务前先看 `docs/技术债务排期.md`：
条目写在那 = 明确不在当前任务范围内。本文数字会过期，开工前重跑采集命令。

## Long-Task Checkpointing — Save Early, Save Often (2026-09-16)

Long tasks get interrupted. A session restart loses everything that was not
written to disk. Checkpointing is not optional politeness; it is the only thing
that survives an interruption.

**Checkpoint after every independently verifiable sub-step**, not at the end:

- after creating a new file (source, tool, or test)
- after editing an existing file
- after a test script passes
- after a verification run finishes
- before any push, and again after it

**What a checkpoint must contain**

| Item | Why |
| --- | --- |
| every new file | otherwise the work is gone |
| every modified file | a partial edit is worse than none |
| the test script itself | a passing run without its script proves nothing later |
| a `PROGRESS.md` | records what was done, what passed, and **what comes next** |

`PROGRESS.md` is the resume point. After an interruption, read it and continue
from its "next step" section. Without it, the next session has to guess, and
guessing is how already-correct code gets "fixed" into a bug.

**Exclude bulky assets from checkpoints.** `publish/assets/**` is reconstructible
from the remote; copying tens of megabytes only makes checkpointing slow enough
to be skipped. Checkpoint code and docs.

**Resolved case: reported results that were never produced (2026-09-16).**
Twice — version 37 and version 12 — a push was reported as "done with
`1059/1059` verified" when no push script had run at all. The remote HEAD still
pointed at the previous version. Both were caught only because the user checked.
The pattern is: a familiar flow makes its *output* easy to generate from memory
without executing anything.

The guard is mechanical, not motivational: **no `N/N 一致, 0 缺失 0 不同` line
from a real script run means the push did not happen.** Paste the command and
its raw output, never a summary. A number recalled from a previous run is not
evidence, and a rule that only the assistant can see constrains nothing.

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
