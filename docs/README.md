# Project Memory Index

The repository contains the original static game and its development memory.

## Shared Memory

| Document | Owns |
| --- | --- |
| `project-rules.md` | Repository-wide constraints, precedence, and save workflow |
| `开发日记.md` | **Change log — append one entry per change; also holds cross-AI collaboration rules (see §17 scripts/ boundary, §16 skin-switch self-correction)** |
| `README.md` | Routing for original-game memory |
| `original-runtime-freeze.json` | Machine-readable runtime ownership state required by repository tooling |

## Original Static Game

- Runtime: `publish/`
- Memory index: `docs/original/README.md`
- Exact gameplay and content: `docs/original/game-settings.md`
- Interaction, visual, and art reference:
  `docs/original/interaction-visual-reference.md`
- Architecture: `docs/original/architecture.md`
- Risks: `docs/original/known-risks.md`
- Platform: `docs/original/platform-runtime.md`
- Verification policy: `docs/original/qa-workflow.md`

## Remake Handover Notes

Handover notes written for the "DeepSeek 重制" remake, stored as Chinese `.txt`
files under `docs/`. Their facts overlap the canonical `docs/original/` and
`docs/deepseek-rebuild/` documents: treat canonical docs as authoritative and
reconcile any conflict. `07-UI描述.txt` and the removed `08-界面布局.txt` were
duplicate copies of the same content. The three files marked 最新 are the latest
revisions.

| File | Covers |
| --- | --- |
| `01-完整项目.txt` | Product positioning (魅魔杀, 18+, 1280x720) |
| `02-游戏结构.txt` | Runtime environment and architecture |
| `03-角色与角色技能.txt` | 26 official characters and skills |
| `04-卡牌.txt` | Card system |
| `05-怪物与怪物技能与饰品.txt` | 33 monsters and 30 relics |
| `06-副本.txt` | 4 official dungeons + 1 placeholder (天日国鹰7研究所, devLocked) |
| `07-UI描述.txt` | UI spec (24 screens, battle bands, modal stack) |
| `09-开发风险.txt` | Development risks and mitigations |
| `10-开发规则与DZMM规则.txt` | Static rules, sandbox, DZMM SDK |
| `11-素材引用.txt` | Asset filename reference |
| `12-新副本素材-废墟沙城.txt` | ruins_sand_city dungeon data |
| `13-新角色引用-亚缇娜与玛利亚.txt` | Unfinished character reference |
| `离线开发与风险.txt` | Offline build strategy and risks |
| `亚缇娜与玛利亚设计最新.txt` | Latest Artina/Maria design |
| `安洁莉卡技能重制.txt` | Angelica skill rework (latest) |
| `废墟沙城怪物设计最新版本.txt` | Latest ruins_sand_city design |

## Reference Snapshots (`reference/`)

Read-only snapshots generated from current source, for cross-agent alignment:

| File | Owns |
| --- | --- |
| `reference/废墟沙城怪物属性清单.md` / `.csv` | 9 ruins monsters' base stats, 5 difficulty conversions, groups, drops |
| `reference/研究所立绘与BGM素材清单.md` / `.csv` | 14 assets from remote `天日国鹰7研究所.zip`, source SHA, naming pairs |
| `reference/README.md` | Source-of-truth rules and archive notes |

On 2026-11-24 the base stats in `05-怪物与怪物技能与饰品.txt`,
`12-新副本素材-废墟沙城.txt` and `废墟沙城怪物设计最新版本.txt` were synced to
`src/original/data-ruins-sand-city-enemies.js`. **When a design note and the
implementation disagree, `src/original/` + these snapshots win.** Older dungeon
structure / level-cap wording in the design note is kept as history.

## Selection Rules

- Original gameplay, content, UI, animation, save, browser runtime, or assets:
  read only the relevant `docs/original/` memory.
- Product changes are implemented in `src/original/`, generated into
  `publish/bundles/`, and recorded in the matching original memory document.
- Numeric/design conflicts: trust `src/original/` and `reference/` snapshots; reconcile
  the stale document instead of silently picking one side.

## Precedence

1. The user's current explicit instruction.
2. Original runtime/data and matching `docs/original/` contract.
3. Current executable repository contracts.

## Reference Snapshots

- `reference/天日国鹰7研究所怪物设计.md` — 研究所 4 只普通怪的属性、技能、随机池复用结论与立绘清单。
- `reference/废墟沙城怪物属性清单.md` / `.csv` — 废墟沙城 9 只怪的源码数值快照。
- `reference/研究所立绘与BGM素材清单.md` / `.csv` — 并行提交素材 zip 的逐文件校验记录。

## Cross-AI Collaboration Rules (must read before writing)

Multiple AI agents work on this repo (local container + remote). Before any
write, read **`docs/开发日记.md` §17**, which defines:

- `scripts/save.sh` / `save-checkpoint.sh` are **container-only**. They require
  `CONTAINER_SECRET`, `PROVISIONING_GENERATION`, `PROVISIONING_TOKEN` and call
  `http://localhost:3005/git/save`. **Never fake these variables** and never pass
  secrets via `-H "...: $SECRET"` (the scripts correctly use `curl -K -`).
- `scripts/verify.sh`, `verify-exhaustive.sh`, `test-offline.sh` are local-safe.
- Local verification (`npm run build:bundles` then `npx playwright test`) is a
  **different stage** from a successful G save. Never report local success as
  "synced" or "published".
- After changing `src/original/*.js`, compare **all** bundle blob SHAs before
  committing (a previous commit missed `startup.min.js`).
- Deletion requests: verify the path exists in the tree first — deletion is
  irreversible. (A requested `GGGG/` folder was proven absent: zero matches
  across 1059 entries.)

