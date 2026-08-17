# Project Memory Index

The repository contains the original static game and its development memory.

## Shared Memory

| Document | Owns |
| --- | --- |
| `project-rules.md` | Repository-wide constraints, precedence, and save workflow |
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

## Selection Rules

- Original gameplay, content, UI, animation, save, browser runtime, or assets:
  read only the relevant `docs/original/` memory.
- Product changes are implemented in `src/original/`, generated into
  `publish/bundles/`, and recorded in the matching original memory document.

## Precedence

1. The user's current explicit instruction.
2. Original runtime/data and matching `docs/original/` contract.
3. Current executable repository contracts.
