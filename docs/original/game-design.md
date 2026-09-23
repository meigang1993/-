# Original Game Design Memory

## Identity

- Title: `魅魔杀`
- Format: desktop-only static card-battle and villa-management game.
- Main structure: title screen, villa/hall management, party setup, dungeon
  exploration, card battle, settlement, unlocks, and long-term progression.
- Primary baseline: `1280x720`, mouse and keyboard.

Exact content, balance, and rules remain canonical in `game-settings.md` and the
runtime/data files it names. Exact screen composition, interaction states,
visual hierarchy, and art roles are recorded in
`interaction-visual-reference.md`.

## Core Loop

1. Manage the villa, roster, living room growth, cards, relics, and party.
2. Choose a dungeon and route through battles, events, rest, chests, elites,
   and bosses.
3. Play character skills and a shared card economy through the standard turn
   phases.
4. Receive immediate audiovisual feedback for targeting, card movement, damage,
   healing, armor, rewards, and failure.
5. Bank rewards, unlock content, improve the roster, and prepare a stronger or
   more specialized party for the next run.

## Turn Contract

The standard turn order is:

`准备阶段 -> 判定阶段 -> 摸牌阶段 -> 出牌阶段 -> 弃牌阶段 -> 结束阶段`

End-phase effects occur only after discard is completed or skipped. Cards
gained or transferred during the end phase do not cause a second discard phase.
Exact exceptions and continuation behavior belong in `game-settings.md`.

## Experience Principles

- Rules should be legible from player-visible descriptions and battle feedback.
- Character identity comes from distinctive mechanics, role wording, art,
  dialogue, and effects working together.
- The first useful response to an action should be immediate: selection state,
  target line, card motion, sound, floating value, status, or log.
- Long chains must remain deterministic and resumable. Prompts may pause a
  chain, but they must resume the exact unfinished operation.
- Rewards and persistent progress fail closed. Uncertain settlement must stay
  retryable instead of granting zero, duplicating rewards, or clearing receipts.
- Enemy AI behavior may be sophisticated, but hidden priorities must not leak
  into player-facing skill descriptions.
- New content should reuse generic rule matrices and data-driven discovery
  instead of requiring hard-coded character or enemy ID patches.

## Content Expansion Checklist

For a new character, enemy, card, relic, dungeon, or skin:

- define its player-facing role and exact mechanical contract;
- choose canonical data and runtime owners;
- add complete visible wording and source attribution;
- integrate automatic codex/discovery paths where applicable;
- define unlock, acquisition, reward, save, and migration behavior;
- provide target, success, failure, and unavailable states;
- add visual and audio feedback consistent with `art-bible.md`;
- update bundle order and direct-load harness dependencies when needed;
