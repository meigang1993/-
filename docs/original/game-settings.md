# Original Game Settings Memory

This file is the durable index for game `2971485`. It does not replace code. The JavaScript sources under `src/original/` and runtime assets under `publish/` are the canonical game settings, and this file tells future work where to read before editing.

Repository-wide rules, architecture, design goals, visual routing, known risks,
and verification policy are split into the documents indexed by
`docs/README.md`. Exact
gameplay values and behavior remain here rather than being duplicated in
`AGENTS.md`.

## Battle MVP Settlement

- Victory settlement ranks the allied team by actual battle contribution and highlights first place as MVP.
- Tracked contribution: enemy HP damage, effective healing, real kills, cards used, and response cards played.
- Overkill damage is capped at the target's HP immediately before the hit. Friendly damage does not count.
- Poison and burning damage are credited to the unit that applied the status. Poison stacks use the latest applier as their source; each burning card retains its own applier, including after the card changes zones or holders.
- A defeat caused by poison or burning grants kill contribution to the credited status source.
- One player-visible card or skill activation counts as one card use. Internal virtual cards generated only to resolve another card or skill use `skipMvpCardCount` and do not add another card-use contribution.
- 军令状 counts exactly once through its generated virtual 【魔王军入侵】; the outer relic activation does not add a second card use.
- A unit waiting for Sakura Risa's pending revival does not grant a kill.
- Full-health restoration from Sakura Risa's resurrection is excluded from healing contribution.
- Fixed score formula: `damage + healing * 0.85 + kills * 10 + responses * 2 + cards * 0.5`, rounded to the nearest integer.
- MVP settlement is display-only and must not change gold, drops, battle rewards, or combat balance.

## Game Identity

- Title shown on the start screen: `魅魔杀`
- Core structure: JavaScript sources in `src/original/`, compiled into a static HTML/CSS/JavaScript game in `publish/`
- Startup delivery: `tools/publish-bundles.json` splits the required title-screen
  runtime into ordered deferred `startup`, `startup-store`, and `startup-app`
  bundles. Runtime/data load first, storage and LocalCore load second, and UI,
  application boot, and runtime recovery load last. Hall, battle, and dungeon
  remain deferred scene bundles.
- Main loop: villa/hall management, party setup, dungeon exploration, card-based battle, rewards, unlocks
- Published entry point: `publish/index.html`
- Opening flow: `publish/index.html` opens directly on the landscape title screen. The game is designed for mouse and keyboard with `1280x720` as the primary visual baseline, while the root shell always fits the current iframe viewport. `html`, `body`, and `.game-shell` must not impose a fixed minimum canvas or allow document-level scrolling; the body uses the dynamic viewport and safe-area padding, and long content scrolls only inside its owning panel. Runtime and styles still must not add portrait, touch-only, virtual-keyboard, or separate narrow-device presentation branches. Compact landscape rules remain height-based; Pointer Events remain valid for desktop mouse dragging.

## Update Announcement

- The hall must show an `更新公告` button in the upper-right corner. Opening it displays the current player-visible update notes in a scrollable modal; the announcement is informational and must not alter gameplay state.
- The current announcement shows `2026.08.14` on the hall button, keeps the current dated update plus evergreen player rules, and removes superseded dated entries.
- Update announcements contain only player-visible content: gameplay rules, balance values, controls, presentation, art, and resolved player-facing defects. They must not mention regression tests, QA commands or results, test files, bundles, build verification, commit hashes, internal diagnostics, or development workflow.
- The 2026年8月14日 notice records interaction clicks taking priority over dismissible battle speech, one complete target-line batch for formal, temporary, converted, and Edis-copied group attacks, stable standard-size teammate hand reveals for 【偷窃】 and 【拆解】, and bounded high-frequency battle feedback that avoids synchronous layout restarts.

## Character Codex

- Every playable character in `GameData.characters`, including future additions, must appear in the character codex. The codex may keep a curated order for established characters, but all IDs outside that order must be appended automatically rather than omitted.
- Character-specific codex metadata such as mother, role, portrait, and skills should come from the character data when available instead of requiring a second hard-coded entry.

## Card Collection Counts

- The public deck UI must distinguish physical card count from collected card-name types. Every permanent card entry in `state.deck`, including duplicate names or suits, counts toward `实体卡总数`; the codex progress counts unique canonical card names only.
- Each grouped public-deck card entry must display `持有×N`, so receiving another copy of an already collected card remains visible even when the unique-type count does not change.
- Battle pile `总数` is the current physical-card count across the shared draw, discard, consumed, and all same-side hand zones. The UI must display its included hand count so moving a card from the draw pile into a hand is not mistaken for a newly created card or a missing count.
- Player and monster teams each own one separate shared battle pile. Every permanent card acquired into the public deck before battle is cloned once into each side's battle pile; same-side draws and reshuffles preserve that side's total. A card stolen across sides temporarily moves the displayed physical total to the holder's side, then returns to its original side's discard or consumed pile when it leaves the holder's hand.

## Source Of Truth Map

- Player characters: `src/original/data-characters-core.js`, `src/original/data-characters-extra.js`, `src/original/data-future-characters.js`, `src/original/data-new-characters.js`, `src/original/data-characters.js`; the shared five-type combat-role taxonomy for every playable character and enemy lives in `src/original/data-combat-roles.js`.
- Character and enemy `drawPerTurn` values store the bonus added to the shared base draw of `2`; `initialDraw` stores the bonus added to the shared opening draw of `4`. The canonical values live in the character and enemy data sources.
- Character progression: `src/original/character-progression.js` owns levels, experience thresholds, encounter experience, and every character's four-stat growth profile. Level-gated appearance metadata and ownership checks live in `src/original/skins.js`. `src/original/local-core-dungeon.js` grants receipt-backed battle experience; `src/original/store-migration-characters.js` migrates old levels and removes manual allocations; `src/original/ui-living-room.js` and the growth and special-art sections in `src/original/ui-info.js` own the living-room presentation.
- Enemy and boss definitions: `src/original/dungeon-enemies.js`, `src/original/data-future-orc-enemies.js`, and `src/original/data-bakar-enemy.js`; `src/original/data-future-enemies.js` is the compatibility aggregator for the future Orc Dungeon groups.
- Enemy AI and special skills: `src/original/enemy-skills.js`, `src/original/machine-factory-skills.js`, `src/original/battle-ai-tactics.js`, `src/original/battle-ai-helpers.js`, `src/original/battle-ai-slash-planner.js`, and `src/original/battle-ai-skill-helpers.js`; active-skill scoring and targeting live in `src/original/battle-ai-skill-evaluation.js`, move construction lives in `src/original/battle-ai-skill-moves.js`, and `src/original/battle-ai-skill-planner.js` is their compatibility facade. `src/original/battle-ai.js` remains the public decision facade. Dedicated character files include `src/original/witherer-skills.js`. Orc Dungeon's compatibility facade is `src/original/orc-dungeon-skills.js`; drone extraction/countdown behavior lives in `src/original/orc-drone-skills.js`, while witch missile and beast-unit kill behavior live in `src/original/orc-combat-skills.js`. Underwater Train combat uses `src/original/underwater-train-combat-skills.js` as its facade, with bite, preparation, targeting, damage, and attack behavior split across the matching `src/original/underwater-train-*-skills.js` modules.
- Enemy AI's general hostile single-target policy keeps the existing low-health, empty-hand, valuable-card, attack, magic, and current-HP score. During actual targeting it follows the highest score for 40% of the roll and distributes the remaining 60% uniformly across every living candidate, including the highest-scoring candidate. With four living targets the favorite therefore has about 55% total probability, with three about 60%, and with two about 70%. Planning-only score evaluation uses the deterministic favorite without consuming gameplay randomness. Explicit marked-suit, Holy Scar, armor-piercing, fixed, and skill-specific target rules continue to override this general policy.
- Elrana, Ace, and Nanali skills: `src/original/elrana-ace-nanali-skills.js` is the compatibility facade; Elrana healing and regeneration live in `src/original/elrana-healing-skills.js`; `src/original/ace-nanali-skills.js` composes the dedicated `src/original/ace-skills.js` and `src/original/nanali-skills.js` implementations.
- Cards and unlock sources: `src/original/data-cards.js`; status-card identity,
  uniqueness, creation, and hand normalization live in
  `src/original/battle-status-card-registry.js`; judgement, expiry, removal,
  and elite/BOSS resistance live in `src/original/battle-status-cards.js`;
  shared actual-count and Magic Seal draw-result wording lives in
  `src/original/battle-draw-feedback.js`.
- Initial shop cards are always unlocked and remain eligible for their normal repeatable drops. Never move an initial shop card behind an elite, boss, event, or other unlock condition.
- Relic data, runtime, and UI: `src/original/data-relics.js`, `src/original/data-future-relics.js`, `src/original/relics.js`, `src/original/relic-bindings.js`, `src/original/relic-ui.js`
- Relic equipment uses an inline two-slot picker anchored inside the opened character card. The picker stays at that character's position while the relic list scrolls, and opening another character preserves the clicked character's modal position instead of scrolling to the top.
- The relic codex exposes all 30 canonical relics from the hall relic inventory. It renders in the global overlay as the topmost modal, makes every underlying layer inert, and replaces an invalid remembered selection with the first canonical relic. The four-column name grid and fixed detail panel scroll independently; selecting or previewing another relic must not move the grid. `Escape` and backdrop dismissal close only the codex, focus enters and remains within the dialog, and closing restores the exact opener. The Villa Living Room character detail Relics tab retains only its two-slot equip/unequip controls and does not expose a second codex entry.
- Dungeons, maps, rewards, and events: `src/original/data-world.js`, `src/original/data-future-dungeons.js`, `src/original/dungeon.js`, `src/original/dungeon-events.js`, `src/original/dungeon-rewards.js`
- Hall unlock event rendering and settlement: `src/original/extra-unlock-event-views.js`, `src/original/extra-unlock-events.js`, `src/original/orc-unlock-events.js`, `src/original/recruit-unlock-events.js`, `src/original/new-character-unlock-events.js`, and `src/original/hall-unlock-events.js`; these modules load with the deferred hall bundle before gameplay leaves the title screen.
- Durable unlock-event completion lives in `src/original/unlock-event-progress.js` as `unlockEvents: { version, completed }`, keyed by the stable IDs accepted by `LocalCoreEventOps`. Completion handlers must write the explicit event ID before their durable save. Save migration and repair may use this ledger plus unambiguous legacy terminal state for one-time completion backfill; legacy defeat state restores only a pending story because its reward was granted before acknowledgement. Persisted older ledger versions must pass structural validation so migration can preserve known markers. Migrations must never search player-facing log text; logs are presentation only.
- The Little Elrana pre-battle encounter ends the run only after its settlement succeeds. While it is checking or settling, dungeon retreat controls are unavailable. A blocked, failed, or stale settlement restores the selected node when still owned and never continues into battle or writes event state after that node/run has been replaced.
- Gameplay randomness: `src/original/game-random.js` owns the persistent seeded stream, uniform integer/sample helpers, Fisher-Yates shuffle, and durable run/task IDs derived from the current seed/cursor without advancing it. New games store `random.version/seed/cursor`; legacy saves receive the same structure during migration. Visual IDs, dialogue variants, and synthesized audio noise use the module's separate transient stream.
- 2026年7月28日米勒【贪玩老虎机】概率调整为：3格均相同8%、恰有2格相同32%、3格均不同60%；对应仍摸8/4/1张牌，单次发动期望摸牌量为2.52张。
- Battle flow and turn rules: `src/original/battle.js` is the public `BattleSystem` facade. Battle entry and initial draws live in `src/original/battle-session.js`, while victory, defeat, test, dungeon, and direct mission settlement live in `src/original/battle-session-settlement.js`; enemy continuation ownership lives in `src/original/battle-auto-enemy.js`; turn selection and preparation prompts live in `src/original/battle-turn-start.js`, input advancement lives in `src/original/battle-turn-input.js`, and `src/original/battle-turn-preparation.js` is their compatibility facade. Completion and phase advancement live in `src/original/battle-turn-completion.js` and `src/original/battle-turn-flow.js`; public resolution actions live in `src/original/battle-resolution-actions.js`. Supporting rules remain in `src/original/battle-turn-state.js`, `src/original/battle-combat.js`, and `src/original/battle-card-specials.js`. Attack orchestration lives in `src/original/battle-combat-attack-flow.js`, attack values and multi-hit handling live in `src/original/battle-combat-attack-values.js`, and `src/original/battle-combat-attack.js` is their facade. Damage lifecycle, response resolution, and final hit application live in `src/original/battle-damage-lifecycle.js`, `src/original/battle-damage-resolution.js`, and `src/original/battle-damage-hit.js`; `src/original/battle-damage.js` assembles their public API. Hand reveal/discard/theft and tactic counter/clash behavior live in `src/original/battle-card-hand-interactions.js` and `src/original/battle-card-counter-interactions.js`, with `src/original/battle-card-interactions.js` as their facade. Interrupted card state, after-card hooks, and resume steps live in `src/original/battle-card-resume-state.js`, `src/original/battle-card-resume-hooks.js`, and `src/original/battle-card-resume-flow.js`, with `src/original/battle-card-resume.js` as their facade. Prompt resolution and interrupted-turn continuation shared by New Moon, Gerda, Kaiichi, and Miller live in `src/original/battle-share-flow.js`; damage-side relic continuations live in `src/original/battle-damage-relics.js`.
- Battle input binding: `src/original/battle-actions.js` is the public binding facade. Prompt, target, and special-picker bindings live in `src/original/battle-action-prompt-bindings.js`, `src/original/battle-action-target-bindings.js`, and `src/original/battle-action-special-bindings.js`; shared selection and hand bindings remain in their existing `src/original/battle-action-*.js` modules.
- Battle-only UI rendering lives in `src/original/ui-battle-pickers.js`, `src/original/ui-battle-targeting.js`, `src/original/ui-battle-units.js`, and `src/original/ui-battle-scene.js`; these modules load with the deferred battle bundle, while `src/original/ui.js` resolves the complete battle scene only after that bundle is ready.
- Dialogue and battle lines: `src/original/battle-line-data.js`, `src/original/battle-lines.js`
- Battle intro pause flow: `src/original/battle-line-intro.js`; `src/original/battle-lines.js` remains the public speech/skill-line facade.
- Battle effect orchestration: `src/original/battle-effects.js`; `src/original/battle-effect-drain.js` is the queue facade, event dispatch and float sequencing live in `src/original/battle-effect-event-runner.js`, and compensation recovery lives in `src/original/battle-effect-drain-recovery.js`. `src/original/battle-effect-utils.js` combines geometry/DOM helpers from `src/original/battle-effect-geometry.js` with animation fallback and normalized battle-speed timing from `src/original/battle-effect-animation.js`; reusable battlefield/action-area positioning lives in `src/original/battle-effect-anchors.js`.
- Battle audio: `src/original/battle-audio.js` owns the public facade and cue selection, `src/original/battle-audio-samples.js` owns sample loading/media fallback, `src/original/battle-damage-fx.js` owns damage visuals, and `src/original/battle-damage-audio.js` owns synthesized elemental hit audio.
- Role positioning text: `evaluation` fields in data files and canonical single-primary-role `combatRoles` assignments in `src/original/data-combat-roles.js`; rendered beside the name in `src/original/ui-info.js` and in skill tooltips through the `src/original/ui-common.js` compatibility facade. Art resolution, skill descriptions, card previews, and relic codex rendering live in `src/original/ui-common-art.js`, `src/original/ui-common-skills.js`, `src/original/ui-common-cards.js`, and `src/original/ui-common-relics.js`.
- Public role and skill wording: every playable character and enemy must have a non-empty `evaluation`; every playable character skill and derived skill must have a non-empty canonical `text`.
- `evaluation` is a player-visible mechanical positioning summary, not a strategy guide. It may describe public triggers, resources, damage patterns, control, support, phases, and duration, but must not expose AI priorities, hand-preservation rules, target-selection heuristics, or hidden automatic decision logic.
- Playable character skill `text` must state public timing or trigger, optional/locked status, target or condition, exact effect, duration, and usage limit when applicable. Runtime mechanics must be updated first, then matching public text and this memory must be synchronized.
- Public `evaluation` and playable-character skill text must not contain AI implementation wording such as “AI”, “会优先”, “应优先”, “建议”, “尽快”, or “避免”. Public random or fixed target rules remain valid when they are actual mechanics.
- Assets and media mapping: `src/original/assets.js`, `publish/assets/`
- Skin roster and fixed skin assets: `src/original/skins.js`; dedicated appearance constraints and skill-effect rules are recorded under the skin sections in this file. 芙萝娅“音速刺客”的战斗与胜利表现由`src/original/flora-sonic-skin-fx.js`和`publish/flora-sonic-skin.css`负责，技能触发点位于`src/original/flora-carlos-skills.js`。
- New playable-character portraits: `gerda.webp`, `hoshino-kaiichi.webp`, `hoshino-yi.webp`, and `hoshino-yi-witherer.webp` under `publish/assets/new-portraits/` are connected to the playable character data in `src/original/data-new-characters.js`. `hoshino-yi-witherer.webp` is the battle-only transformed portrait used after 梦想真理 resolves.
- Global gothic succubus-sigil UI theme: `publish/gothic-theme.css`; the normal start screen intentionally shows only the game name, with icon-only commands.
- Settings UI is an overlay panel in both the title screen and game views. It must not participate in page flow or require scrolling below the current screen.
- Settings UI does not display automatic-save-disabled or manual-save explanatory copy.
- Modal overlays make the underlying game shell inert, move keyboard focus into the topmost layer, preserve focused controls across same-view rerenders, and restore the opener when the overlay closes. `Escape` closes or cancels only the current topmost dismissible layer; non-button controls with `role="button"` respond to Enter and Space.
- The hall task modal closes when the player left-clicks its backdrop; clicks inside the task card must not close it.
- Completing a dungeon bounty grants its reward directly without opening a separate task-reward settlement popup.
- The X button on every unlock-story modal is a completion action, not a dismiss-only action. It runs the same durable unlock path as the event's primary button and closes only after that path is dispatched.
- Every canonical playable character must retain at least one valid unlock path. Skin purchases immediately equip the purchased skin, and owned default and paid skins must remain freely switchable afterward.
- 2026年7月24日角色平衡调整：贝尔蒂丝满生命时攻击力与魔力为基础值的1.5倍，杀意上限与手牌上限仍各为基础值的2倍；芙萝娅神速飞剑按行动回合记录目标，同一目标每回合最多触发一次；索尼娅的暴走与极速核心机制不变。温蒂当前摸牌加成为每回合`1`、初始`2`。
- 26名角色的初始面板与15级生命成长保持不变；攻击/魔力按基础成长的`3x`总量执行，速度按`2.5x`总量执行。没有跨角色共用的15级终值上限；完整初始属性与15级成长总量以四个角色数据源和`src/original/character-progression.js`为准。
- 2026年8月10日角色调整：芙萝娅基础杀意上限改为`1`，`神速之袭`在准备阶段和结束阶段各限一次，同一回合可分别发动；准备阶段发动仍跳过本回合判定阶段和摸牌阶段，结束阶段发动后芙萝娅翻面并跳过下一个完整回合。`神速之袭`的翻面与击杀摸牌必须等本次攻击动画完成后一次性提交；只有该虚拟【刺杀】首次直接命中的实际生命伤害令实际受伤目标死亡时才摸牌，后续连锁伤害不计，待复活目标不计，最后一名敌人仍须先发放该奖励再进入胜利结算。重复提交或已经替换的旧战斗不得再次摸牌、翻面或回写状态。贝丝妲魔偶基础魔力改为`3`。卡洛斯基础攻击力改为`3`、基础杀意上限改为`1`。
- Same-screen party selection must update roster cards in place: selecting or removing a character preserves both the complete card DOM node and its portrait, keeps card geometry and modal scroll stable, and updates only classes, status text, and the party count. Roster cards must keep `content-visibility: visible` so offscreen intrinsic-size estimates cannot cause vertical jumps. This rule is data-driven and applies automatically to every current and future unlocked character; it must never rely on a hard-coded character list.
- Test-battle character and enemy selection cards must keep `content-visibility: visible`. Their long two-column grids are rerendered after each selection; deferred intrinsic sizing makes offscreen cards switch between estimated and real heights during scroll restoration, causing visible vertical jumps.
- Deferred dungeon and battle styles must remain inactive until every stylesheet for that scene has loaded successfully, then activate together before the scene renders. Each stylesheet gets one short automatic retry after a transient load failure; two consecutive failures still abort scene startup. A failed partial load must not leak half-applied scene styles into the hall, and the dungeon shell must not continue translating after the dungeon becomes visible or after returning to the hall.
- 温蒂的【解答迷惑】只能从正式卡牌图鉴中的全部战术牌选择，不得混入角色技能牌、虚拟牌或临时牌；选牌弹窗必须限制在战斗视口内，并让候选牌区域独立纵向滚动。
- 温蒂通过【解答迷惑】生成的牌必须带有稳定来源标记，并同时具有临时与消耗属性；无论使用、弃置或以其他方式离开手牌，都进入消耗牌堆，不得进入普通弃牌堆重新洗回。其公开牌面遵循统一的技能生成牌规则：燃烧动画完成后保留至本回合结束，并标记为去向已结算，回合清理不得再次飞向消耗牌堆。
- 【组合进攻】依次选择其他友方角色与敌方目标后只进入待确认状态，不得在首次选择敌人时自动发动；操作区按钮显示“使用”，玩家再次点击“使用”或再次点击当前已选敌人后结算。
- 【组合进攻】的两次攻击仍按规则使用虚拟【杀（普攻）】并分别触发目标与响应流程；公共出牌区必须保留【组合进攻】来源牌，并让两张虚拟【杀（普攻）】标记为“协攻”且在提示中说明来源，不能只显示泛化的“虚拟”标签造成来源误解。
- 测试战斗的撤退按钮必须始终位于技能选择、响应、对白遮罩和角色悬停层之上，并可直接打开“结束测试”确认，不得先被对白关闭、选牌取消或敌方角色悬停层吞掉。
- 【解答迷惑】等战斗选牌弹层在同一阶段重绘时必须保留候选区滚动位置；切换到下一选择阶段时才允许使用新的初始滚动位置。
- Victory settlement uses an enlarged fixed no-scroll layout across supported preview sizes, with the ranking panel filling most of the available battle viewport while remaining fully visible on short screens.
- Relic codex entries use the same centered floating detail treatment as character codex entries on hover or keyboard focus; clicking an entry still pins its detail below the grid. Locked-entry grayscale must not affect or reposition the centered floating detail.
- Dungeon maps use compact gothic icons for start, normal battle, elite, rest, chest, and boss nodes. Elite and boss nodes retain their actual enemy names. Available nodes have a soft glow, completed nodes are grayscale, the current node pulses at full brightness, unreachable nodes are dimmed, and every rendered connection must correspond to an actual `next` path; traversed connections are bright while untouched connections stay dark. The map must remain usable without node overlap or clipped available-node labels down to a 480x270 landscape viewport; at that compact height, the layer-count and reward-multiplier tags hide so the map retains at least 60px of visible height while pending gold, essence, and inventory access remain visible.
- A completed battle or chest node must keep every following node disabled while its reward popup is open. The route becomes selectable only after the player explicitly confirms that reward.
- 地图休整节点保持稀少：魔国机械工厂普通级随机权重固定为 `normal/rest/chest = 78/12/10`，其余难度固定为 `75/10/15`；水下列车仅第10层休整，兽人地下城仅第9层休整。
- Battle UI keeps an enlarged public play area in the center without vertical translation. Used cards and played response cards render as complete card faces in chronological order for the current turn, including automatic, manual, converted, proxy, and preparation-phase responses, then clear at turn end. An enemy card's transient animation entry and resolved public snapshot are one logical play and must render as exactly one public card even when animation-only underscore fields differ or public cost discards are inserted between them; mirror matching uses the logical card-resolution identity and cannot depend on equal array positions. Virtual cards carry a two-character `虚拟` marker, converted cards carry a two-character `转换` marker, and real skill cards display type `技能`; virtual and converted cards are never classified as skill cards. Enemy active cards such as 索敌雷达 are real skill cards. Unit dialogue bubbles and global opening dialogue use fixed `17px` text; unit bubbles render above pile statistics with an opaque dark background, remain fully inside the battle viewport for leftmost and rightmost speakers, and speaking unit rows stay below hand controls. Every unit name must remain fully readable without entering the adjacent pile-stat or hand-panel border at each supported landscape size. Battle history is hidden by default and opens from the upper-right battle toolbar as a scrollable translucent pink panel beside Settings; its newest record is inserted at the top and the panel follows new records from the top unless the player is reading older entries.
- Hand cards, public-play snapshots, and every front-facing flying card resolve artwork through battle-deferred `src/original/card-art.js` and `src/original/ui-common-cards.js`, so the same card or skill name always shows the same illustration without adding card-face rendering to the startup bundle. Battle loading prewarms only the current allies' and enemies' portrait, avatar, and damaged-art resources; active-skill and relic-skill artwork loads on first render instead of extending the blocking battle preload. A failed lazy skill-art request is remembered for the current session and switches to the crimson-crystal skill crest, including later rerenders, rather than leaving a broken image or repeatedly requesting the failed URL. Slow-network item timeouts must be longer than normal-network timeouts, while one overall battle-preload deadline bounds serial waiting even when an older cached request is reused and reports all unfinished critical portraits through the existing fallback/retry path. A real active skill snapshot keeps `skillName` as its presentation identity even after runtime-only underscore fields are cleaned; player, enemy, and relic skill flights, public cards, and trail-exit animations must therefore keep the same dedicated image and `技能` label. Unknown slash, response, tactic, consume, and status cards use a same-type fallback illustration. All 36 current named real active skill cards use dedicated artwork: 25 player/derived skills, 8 enemy skills, and 3 active relic skills. Future or otherwise unmapped real skills use the crimson-crystal skill crest; virtual and converted cards keep the illustration of the formal card they represent. Persistent card faces render artwork as reusable asynchronously decoded image nodes so same-screen battle rerenders preserve already loaded art; transient flying cards may keep their isolated flight rendering path. Card backs remain the existing deep-purple succubus emblem. Runtime type remains authoritative for frame color; 狼牙杀 alone is suitless with a neutral silver frame.
- At the `1280x720` desktop baseline, standard `104x160` hand cards must remain fully inside the hand panel and battle viewport. Compact landscape keeps its existing `76x96` card layout; animated response-card scaling must not be treated as a reduction of the underlying interactive layout size.
- 判定、展示、亮出和拼花弹层同样复用完整卡面。判定必须保留实际翻出牌的名称、花色、类型、效果与插画；拼花事件必须保存双方牌的快照并标注使用方/目标方，不能只保存花色后渲染通用占位牌。短屏布局按既有桌面高度档缩小卡面与插画，展示手牌弹层在内容超高时内部滚动。
- 当前行动角色区域的标准立绘固定为`160×196px`；视口高度不超过`520px`时回退为`150×186px`，短屏布局固定为`126×132px`。各档尺寸必须同步预留手牌区右侧空间，不得挤压手牌或覆盖右侧战斗条。
- Cards forcibly discarded from another character's hand are added to the current-turn public play trail as card-face snapshots with the two-character `被拆` marker and the original holder's name. Self-paid costs, normal discard-phase cards, death discards, and cards actually played as responses are not marked as `被拆`.
- Cards discarded from hand by a card or skill effect, including player 【魔弹特攻】 and 魔女【魔法巡飞弹】payments, are rendered before enemy action resumes and remain in the current-turn public play trail. Self-discarded cards use the holder label and no `被拆` marker; normal discard-phase and death discards remain excluded.
- 【魔弹特攻】 can only display standard-suit non-status hand cards and cannot select a target whose visible hand contains no such card. 【借刀杀人】 cannot select a friendly source character with no visible hand cards. Playability, target highlighting, target selection, and final resolution enforce the same restriction. When the selected friendly character has any single-target Slash card, the player must choose the exact Slash to use, including when only one valid Slash exists. If that character has no single-target Slash, the player must choose the exact visible hand card handed to the Borrowed Blade user; both prompts are mandatory and must temporarily switch the bottom hand area to that friendly character's real hand instead of opening a copied hand-reveal overlay.
- 【拆解】 and 【偷窃】 may target any other living character with a visible hand, including a teammate. A friendly target's hand is shown face-up for manual selection; an opposing target's hand remains hidden. Enemy AI may target its own teammates and prioritizes removing a teammate's status card. Any status card removed or stolen by a card or stealing skill immediately enters its original holder's consumed pile and never transfers to the thief.
- Canonical turn order is preparation, judgement, draw, play, discard, then end phase. Effects that say `结束阶段` trigger only after discard has completed or been skipped. Cards drawn or transferred during the end phase do not create a second discard phase.
- 罗卡尔与艾伦格衍生技能`战斗之勇`在实体【杀】或【与我一战】成功使用后，从使用者所属阵营的共享摸牌堆摸1张牌；`公共牌库`仅指战斗外永久卡组，不得再用于该技能描述。
- 罗卡尔皮肤“恋母勇者”拥有专属技能特效：战斗之勇使用深红气焰、摸牌飞行和恢复杀意时的金色粒子红眼反馈；热血契约显示燃烧手牌、贝丝妲轮廓持剑虚影和本回合攻击红色拖尾，虚影强度随消耗牌堆数量提高；狂风绝息斩显示杀牌剑刃风暴、三圈冲击波、暗紫命中与落地裂痕，击倒目标时追加残留紫色电弧。仅装备该皮肤时触发，热血契约持续表现于罗卡尔回合结束时清除。
- 贝丝妲魔偶皮肤“机铠魔偶”拥有专属技能特效：追魂之刃显示核心闪光、虚拟杀与锁链束缚；锁魂镰刀显示玫红魔力镰刀、环形横扫和目标裂痕，连续击杀触发的每轮横扫颜色逐轮加深；榨取精华显示能量触须、核心充能和武器光晕，对非罗卡尔男性使用时改为更深紫红和更强束缚。仅装备该皮肤时触发，榨取精华持续表现于贝丝妲魔偶回合结束时清除。
- 贝丝妲魔偶基础魔力与基础手牌上限固定为`3`。榨取精华每张可见红桃牌令其本回合魔力增加50%，按发动时的基础面板魔力加算，不乘算已有临时魔力；待摸牌动画完成前的红桃不计数。即使发动时没有可见红桃，本回合物理攻击牌转为魔法攻击仍生效；目标生命流失与等量摸牌按可见红桃数结算。转换后的物理攻击牌伤害预览按当前魔力刷新。
- 贝丝妲魔偶的追魂之刃固定为：实体【杀】被【闪】抵消后，额外再次使用原牌1次；此次使用保留原牌名称、伤害属性和效果，不额外消耗手牌或杀意，且不能再次触发追魂之刃。
- Economy values: `src/original/economy-config.js` is the single client configuration source for shop defaults, card deletion, relic smelting, shop stock size, dungeon gold rewards, mission multipliers, and task bonus gold ranges.
- `src/original/economy-config.js` 将初始莉莉丝元固定为 `0`。新游戏从 `0` 莉莉丝元开始，已有存档保留其原有余额；运行时缺失或无效的莉莉丝元统一回退为 `0`，不得重新赠送初始资金。
- Economy balance: dungeon reward multipliers by difficulty are `1 / 1.35 / 1.75 / 2.2 / 2.75`; mission gold multipliers remain `1 / 1.25 / 1.7` for 魔国机械工厂 / 水下列车 / 兽人地下城. Base node gold is `90-130 / 280 / 500 / 220` for normal / elite / boss / chest. Representative normal-run rewards are derived from configured route layers instead of hard-coded combat counts; the one-rest routes currently average about `2582.5` for 水下列车 and `2907` for 兽人地下城. Task bonus ranges remain `500-900 / 800-1400 / 1200-2000`. Character progression no longer consumes Lilith gold. Card deletion costs `700`, and relic smelting grants `180`.
- The August 7, 2026 enemy rebalance is derived from the corrected stronger playable-character level curve, current character skills, each enemy's actual skill amplification, and dungeon encounter composition; uploaded monster drafts are not an input. Canonical speed sequences are Machine Factory `5/4/6/4/6/6/8/6/7`, Underwater Train `11/11/13/8/14/12/11/12`, and Orc Dungeon `17/13/14/14/15/17/13/12/14/17` in source load order. Skills, AI, card resources, group composition, difficulty multipliers, and the separately approved draw bonuses remain unchanged.
- All canonical enemies must have positive attack and magic. Any zero attack or magic value is corrected to `2`; the current affected entries are the Machine Factory enemies 机械哥布林, 骷髅巡逻机, and 机甲牛头怪, whose base magic is `2`.
- Normal, adventure, warrior, king, and heroic enemy HP/power/speed multipliers are `100/100/100%`, `135/110/106%`, `175/122/112%`, `230/136/119%`, and `320/152/127%`. HP rounds upward; attack, magic, and speed round to the nearest integer. Difficulty no longer adds bloodlust, hand limit, or per-turn draw; heroic elite/BOSS relic rules remain unchanged.
- Enemy HP, attack, magic, bloodlust, and hand limits retain the skill-aware pre-draft balance, while speed is raised by role and dungeon tier to answer the stronger playable speed curve. Multi-hit, chained, full-party, splash, copied-card, doubled-damage, revival, repeated-damage, and repeated-armor skills have no shared burst ceiling. High-difficulty enemy groups likewise have no first-turn total-damage cap; output follows canonical stats, difficulty scaling, cards, skills, turn order, and actual target/response outcomes.
- Economy migration: an accepted task's displayed bonus and a completed pending task reward are committed amounts and must survive later balance-range changes when they match a current or recorded historical range. Impossible or unbounded values from damaged/tampered saves are repaired; only unaccepted task offers may otherwise be rerolled into the current configured range. Every future bounty range change must retain the replaced range under `bountyLegacyGoldRanges`. This migration is owned by `src/original/store-bounty-repairs.js`; card and relic repair remain in `src/original/store-repairs.js`.
- Completed dungeon bounty rewards apply directly to inventory and resources. Returning to the hall must not open a separate task-reward settlement popup.
- 所有任务奖励在达成条件时自动结算，不需要任务奖励确认弹窗：讨伐任务在目标战斗节点结算后立即领取，羁绊任务在副本完成时立即领取。节点奖励界面允许直接撤退；撤退必须先完成或保留可重试的任务结算，再入账本次副本收益。
- 撤退或全军覆没会令当前副本仍处于已接取或失败状态的任务失败，并立即用新的未接取任务替换对应任务槽；其他副本的已接任务不受影响。撤退前已经完成并进入待结算队列的任务奖励仍按原收据结算，全军覆没只清除属于该次失败副本记录的待领奖励。副本通关、撤退和全军覆没返回别墅时都会通过可恢复结算队列刷新商店。
- Before first defeating 莫迪奥, at most one newly offered BOSS hunt may appear across all unlocked dungeons. After that defeat, different dungeons may each offer one BOSS hunt at the same time. Accepted tasks take priority when malformed or conflicting task offers are repaired.
- The post-Mordio task limit is seven only when progression provides at least seven valid unique hunt/bond offers. A malformed save that records Mordio defeated without the prerequisite mission and character unlock state may legitimately stop below seven.
- Task-list repair rebuilds every retained task from the strict field whitelist in `src/original/store-save-schema.js`, replaces unknown task types and hunt tasks whose target does not belong to the recorded dungeon, and refreshes displayed character/enemy identity from canonical data. Task rendering escapes all stored text and attribute values, including reward labels and task IDs.
- Desktop title UI and layout: `src/original/app-render.js`, `src/original/app-render-overlays.js`, `src/original/app-actions.js`, `src/original/app-start-new-game.js`, `src/original/app-start-save-actions.js`, `src/original/app-start-actions.js`, `src/original/app-action-bindings.js`, `src/original/app-modal-actions.js`, `src/original/app-scroll-actions.js`, `src/original/app-battle-skin-actions.js`, `publish/base.css`, `publish/gothic-start.css`. Shared state replacement/render scheduling lives in `src/original/app-state.js`, gameplay/settings persistence lives in `src/original/app-persistence.js`, post-start error-state cleanup lives in `src/original/app-runtime-recovery.js`, uncaught-error capture and retry orchestration live in `src/original/app-runtime-errors.js`, and the topmost retry dialog lives in `src/original/app-runtime-error-dialog.js`.
- Bounty task generation lives in `src/original/bounty-task-generator.js`, persisted structure validation lives in `src/original/store-save-schema.js`, runtime whitelist reconstruction and duplicate repair live in `src/original/bounty-task-repair.js`, and `src/original/bounty-tasks.js` is their public facade; reward settlement helpers live in `src/original/bounty-task-rewards.js`.
- General battle mechanism specifications, including 翻面: this file under `Fixed Setting Notes`; implementation must be added to the relevant `src/original/battle*.js` and UI files before a mechanism becomes active.
- 克罗研究记录 only repeats the first successfully resolved tactic card used from hand each turn; relic and other skill cards do not trigger it.
- 克罗研究记录的玩家可见描述只保留“每回合第一张成功结算的战术牌结算两次”，不展示技能牌触发限制；运行时仍只允许手牌中的战术牌触发。
- 无可弃置/偷取手牌的【拆解】与【偷窃】不算克罗研究记录的成功结算；母亲照片会响应生命之泉与不死食尸鬼的实际恢复；白色哥特洛丽塔对同一张【杀】指定同一目标只摸1张牌。
- 剪刀刃和武士铠甲按描述支持虚拟单体【杀】；借刀杀人明确压制“使用【杀】”类触发；妖刀村雨通过完整的虚拟【杀】使用流程结算。
- 鲨鱼头套将手牌中的【杀（普攻）】稳定转换为无基础伤害的【咬杀】，手牌预览和公共出牌区均显示`转换`。普通结算使用攻击力；女王之尾或榨取精华将其转为魔法攻击时使用魔力，两种转换叠加也只换算一次。该转换兼容暴走与极速及火力压制；若原牌先经其他效果转换为【杀（普攻）】，咬杀继续保留最初实体牌名而不是覆盖为【杀（普攻）】。卡面预览与AI估值读取同一结果，结算后恢复原实体牌全部临时字段。
- 格林机枪仅在手牌中存在可追加的【杀】时消耗每回合次数并自动追加。
- 鬼王扑克只转换本次使用，原实体牌保持原名进入弃牌堆，转换牌必须保留原实体关联；需先选择敌方目标并立即使用随机拉芙战术牌，其生成牌属于饰品技能牌，不触发克罗研究记录、精灵女神守护之盾等“使用手牌战术牌”效果。
- 霹雳之锤可响应由真实手牌实体转化的【杀】，但不响应没有实体来源的纯虚拟或技能【杀】。
- 母亲照片对群体恢复按每名实际恢复角色分别触发。
- 黑曜石铠甲在杀牌前置技能与饰品效果结算前令该杀无效，但白色哥特洛丽塔仍因成为目标摸牌；虚拟杀计入母亲怀表与震感手炮的“本回合使用过杀”，借刀杀人强制使用的杀不计入。
- 1124号镰刀对每名本场首次被其击杀的敌方角色各累计1个额外回合，同一角色重复倒下不重复累计，友伤击杀不累计。
- 战斗单位的饰品属性在初始化时已写入实际属性，属性面板、头像提示与卡牌伤害预览只能显示一次；`relicStats` 仅用于标注饰品增量，不能再次叠加到战斗数值。
- 艾尔拉娜大型注射器、凋零者胸部与凋零者长舌头只在实际造成生命值伤害后触发；凋零者胸部还要求持有者在该次伤害后仍存活。
- 鬼王扑克在每回合使用后必须立即变为不可用；克罗研究记录和精灵女神守护之盾只响应从手牌打出的战术牌；格林机枪只由从手牌打出的实体单体【杀】触发。鬼王扑克、1124号长舌头、军令状必须确认发动者实际装备对应饰品、仍存活且属于当前战斗；鬼王扑克与1124号长舌头还只接受当前战斗中存活的敌对目标。任何装备、角色、目标、费用选择或执行回调校验失败，都必须在公共出牌区、战斗日志、出牌次数、弃牌、次数标记和派生牌生成之前停止并返回失败。
- 妖刀村雨生成的准备阶段虚拟【杀】不计入本回合使用【杀】记录，因此不会阻止母亲怀表或震感手炮在该回合结束时触发。
- Card text/runtime consistency: 追杀 becomes no-intent-cost for the turn when another entity kill deals no HP damage, including a dodge or complete armor/defense prevention.
- 【魔弹特攻】cannot select an opposing character without a visible standard-suit non-status hand card, and only those cards may be displayed. 【借刀杀人】cannot select an assisting character with no visible hand cards; both UI targeting and final runtime validation must enforce these restrictions.
- 看破响应所有可响应的战术牌，包括实体战术牌、虚拟战术牌和转换战术牌。角色技能牌或饰品技能牌本体不能被看破，但技能生成或转换出的战术牌可以被看破；因此军令状本体不是看破目标，军令状生成的虚拟【魔王军入侵】可以被看破无效化。
- Dynamic no-intent rules are evaluated at play time and must not be written permanently onto entity cards. In particular, a red kill card that was free in XX型凋零者1124号's 暴走 mode must cost intent again after switching to 极速.
- Offline LocalCore operations use canonical GameData/GameEconomy/SkinSystem configuration rather than duplicated shop or skin constants. Dungeon node/run and defeat settlement live in `src/original/local-core-dungeon.js`; bounty claim preflight and payout live in `src/original/local-core-bounty.js`.
- Storage I/O: `src/original/store-io.js` is the public facade and owns the complete save-key registry; copy selection, direct browser-KV mutations/deletion, and lifecycle capture/recovery live in `src/original/store-io-selection.js`, `src/original/store-io-mutations.js`, and `src/original/store-io-recovery.js`. Sandbox-aware local access remains in `src/original/store-io-local.js`, browser `dzmm.kv` mutation serialization and timeouts remain in `src/original/store-io-cloud.js`, and host reset/delete handling remains in `src/original/store-lifecycle.js`. There is no serverless save coordinator, revision transport, chunk codec, or startup handshake.
- Villa styling uses `publish/villa.css` as the single versioned startup entry. It imports the four owned stylesheets with the same current `game-build` version and preserves their cascade order, keeping the startup stylesheet-link budget bounded without allowing mixed cache generations. Hall/page layout, modal/story presentation, party/test/skin layout, and reward/bounty/codex styling live in `publish/villa-hall.css`, `publish/villa-modal.css`, `publish/villa-team.css`, and `publish/villa-codex.css`.
- Main-save public operations are assembled by the `src/original/store-main-save.js` facade. Copy cloning, migration validation, and summary generation live in `src/original/store-main-copy-inspection.js`, while local/browser-KV reads and recovery-copy selection remain in `src/original/store-main-load.js`. Snapshot preparation and obsolete revision-metadata stripping live in `src/original/store-main-snapshot.js`; new-game overwrite protection and recovery-copy operations live in `src/original/store-main-recovery.js`; status and dirty-state bookkeeping live in `src/original/store-main-save-meta.js`; `src/original/store-main-save-queue.js` assembles the queue API, while single-snapshot persistence lives in `src/original/store-main-save-writer.js`, the bounded debounce timer lives in `src/original/store-main-save-timer.js`, and merge, flush, replay, execution, and pause coordination live in `src/original/store-main-save-scheduler.js`.
- Page-hide flushing upgrades every queued save to durable cloud persistence. If the only save is already running without `flush`, the queue must retain synchronization state and replay that snapshot once with `flush: true`; it must not report that there is nothing to flush.
- Automatic persistence is disabled while battle loading is visible. A formal non-test battle saves its initial active-battle snapshot after startup fully succeeds, then saves a recoverable checkpoint after each completed gameplay operation once control returns to an unlocked allied play phase with no prompt, selection, pending draw, animation, enemy thinking, or settlement work. Multiple completed card plays or skill actions within one turn advance the checkpoint operation sequence and flush distinct snapshots; selection-only changes, rerenders, inspection, and unfinished response chains do not save.
- Cards bought from the shop or banked from elite/BOSS node rewards are part of the persistent deck and must survive both automatic saves and manual save-slot round trips.
- Replacing or leaving a battle must invalidate stale animation drains and release all idle/action waiters. A prompt button queued behind animation idle may survive a same-battle DOM rerender, but it must not execute after the state or battle object has been replaced.
- Web Animation completion waits are bounded by the configured animation duration plus a short grace period. A browser-provided `animation.finished` promise that never settles must fall back to the final frame and release the battle input lock.
- Closing any unlock-event modal with its X button is equivalent to pressing that event's completion button: the unlock transaction must finish, durable flags must update, and the event must not immediately reopen.
- Battle start, stable completed-operation checkpoints, and exit are durable milestones. Standard and dungeon battles save after startup reaches the playable battle view; test battles never write battle checkpoints. Each completed operation that reaches stable allied input advances a monotonic operation revision. Checkpoint requests from the same event-loop task coalesce before snapshot construction, then the newest revision flushes immediately with its current turn and sequence; unchanged stable rerenders do not create another checkpoint. Retreat, defeat return, successful victory settlement, and return to the dungeon or hall save only after the battle object is cleared. `visibilitychange` and `pagehide` flush an existing pending operation batch and the save queue without manufacturing another unchanged active-battle snapshot. Retrying queued settlement actions remains a durable reward milestone and must flush the updated recovery queue and any granted rewards.
- Loading a legacy battle-start checkpoint still treats it as an interrupted battle rather than resuming partially initialized combat. Standard battles return to the hall, while dungeon battles roll back the pending node and return to the dungeon map; both paths clear the battle runtime and keep an explanatory log entry. A versioned stable-operation checkpoint resumes only when it still describes an unlocked allied play phase with no prompt, pending animation/card work, enemy thinking, or settlement state. Restore clears presentation-only trails, intro/retry ownership, and rebuilds each side's shared pile references while preserving complete generated and modified battle cards. Version 1 and 2 completed-turn checkpoints remain readable; new version 3 checkpoints additionally retain the same-turn operation sequence. Any malformed or unstable checkpoint fails closed through the legacy interruption recovery. Pending-node recovery is owned by the startup-loaded store migration layer and must not depend on the deferred dungeon bundle, otherwise `pending` would remain set and disable every map node. The repaired state must be flushed back to the automatic save instead of being discarded after loading. Saves already stranded with no battle object but a pending normal/elite/boss node are repaired the same way, while legitimate rest and chest pending panels remain untouched.
- Save-slot panel state and controller assembly live in `src/original/save-slots.js`; save/load/delete/retry actions live in `src/original/save-slots-actions.js`, slot persistence is in `src/original/store-slots-data.js`, slot/main copy inspection and list loading are in `src/original/store-slots-read.js`, rendering is in `src/original/save-slots-view.js`, and DOM event binding is in `src/original/save-slots-bindings.js`.
- The save and load panels show the main save as a dedicated automatic-save slot before manual slots 1-3. It is loadable, including explicit local/cloud conflict copies, but cannot be manually overwritten or deleted. The card displays its real conditions: normal non-battle progress changes save locally immediately and sync to cloud after about one second; new games, growth and purchases, dungeon entry and settlement, battle start, stable operation checkpoints, battle exit, and character/story unlocks request immediate synchronization. Stable operation requests in one event-loop task share one newest snapshot; battle loading, unchanged rerenders, and unfinished operation chains do not auto-save.
- Offline inventory operations must identify the requested card/relic in addition to its array index and carry a durable operation receipt, so queued delete/smelt actions cannot affect a different item after an earlier action shifts the list or execute the same request twice.
- Offline story unlocks enforce their progression prerequisites, while an event already settled by the preceding defeat/reward step may complete idempotently so its modal can close normally.
- Offline bounty claims, dungeon-node rewards, and defeat settlements are idempotent across retries. New bounty claim receipts use an ordered `bounty:<sequence>` high-water mark so storage stays constant while old claims remain duplicates. Migrated arbitrary legacy receipts use compact double hashes with a hard cap; once full they fail closed instead of growing without limit or granting an uncertain duplicate.
- Dungeon node reward receipts are scoped to the active run and are cleared when a new run starts, rewards are banked, or defeat is settled. Defeat and inventory receipts use ordered `defeat:<sequence>` / `inventory:<sequence>` high-water marks; a structured receipt may advance the mark only when its sequence equals `through + 1`, and later receipts remain blocked behind the unresolved operation. Inventory deletion and smelting share one action lock; when LocalCore explicitly rejects an uncommitted operation, its latest unclaimed sequence is released for reuse, while successful or duplicate receipts can never be released. Legacy arbitrary IDs migrate to a bounded compact double-hash ledger.
- Creating a new game initializes and durably overwrites a candidate snapshot before replacing the current runtime state. Explicit overwrite defers the local recovery copy until the direct browser-KV write succeeds. A pre-commit failure keeps the previous runtime and local save on the title screen, clears the failed candidate from dirty-save retry state, and requires a new explicit attempt.
- Save loading validates offline settlement receipts, inventory revisions, pending run rewards, and pending bounty containers before migration; malformed copies fail closed instead of silently dropping idempotency data. Legacy bounty rewards without claim IDs derive a stable ID from their stored content and queue position so interrupted cleanup cannot grant them twice.
- 饰品存档只接受 `src/original/data-relics.js` 与 `src/original/data-future-relics.js` 中的正式饰品 ID；迁移会从库存、饰品图鉴、正式装备、测试库存、测试装备及所有待入库奖励中删除未知项、已删除饰品和旧名【准备背包】并请求回写。迁移、主动卸下和熔炼后的自动卸装都不得改变其他有效饰品所在的槽位。`RelicSystem.data()`、属性统计、装备、拆解和奖励结算入口不得为未知字符串生成或授予任何有效效果。
- Main and manual save copies fail closed before parsing, migration, comparison, or persistence when their UTF-8 serialization exceeds 2 MiB, a resource or migrated legacy-resource sum exceeds `1,000,000,000`, save metadata exceeds its bounded integer range, any nested collection exceeds the shared structural limits implemented by `src/original/store-save-validation.js` and exposed through `src/original/store-save-limits.js`, or persisted card/task data violates `src/original/store-save-schema.js`. New snapshots persist cards as canonical `name` and `suit` only. Loading validates that identity and suit, then rebuilds every gameplay field from authoritative card data; legacy or injected card fields are ignored rather than trusted, while unknown names and invalid suits are rejected. Explicitly removed historical cards may pass raw-copy validation only long enough for migration to remove them from decks, shop stock/unlocks, test selection, bounty rewards, and pending dungeon rewards; the migrated copy must request a durable rewrite and cannot retain those card IDs. A valid alternate local/cloud copy remains eligible for recovery.
- Main-copy repair must rebuild a compact raw snapshot and pass the same byte and structure validation before either local or cloud persistence. Low-level raw writers and the main-save queue also reject invalid snapshots regardless of any caller-supplied `validated` option, so a migrated runtime state or forged direct call can never overwrite a valid recovery copy with an oversized repair.
- Gold and essence grants use the shared bounded resource addition helper. Dungeon banking, bounty claims, relic smelting, and direct mission rewards saturate at `1,000,000,000`; reaching the cap must not make later progress permanently unsavable.
- Permanent inventory additions use the shared capacity guard from `src/original/store-save-limits.js`. Shop purchases check the deck before charging or marking stock sold; dungeon banking checks the complete pending card/relic batch before granting any resources or clearing the run; bounty claims preflight the whole unclaimed batch before writing receipts. A full deck or relic inventory fails atomically with a visible cleanup instruction, while shop stock, dungeon rewards, and queued task rewards remain available for retry. During an active expedition, the dedicated inventory-cleanup view preserves the run, disables unrelated navigation, allows relic smelting, and waives card-deletion cost only for the exact number of slots required by pending rewards; normal deletion pricing resumes when capacity pressure is cleared. Relic discovery history is deduplicated and bounded so its derived collection list cannot invalidate an otherwise valid reward save.
- Direct battle victory settlement validates that the recorded mission and its non-negative integer gold reward still exist before changing resources. Invalid or incomplete battle save data must keep the victory screen retryable, show a settlement error, and grant no reward until validation succeeds.
- Dungeon battle unlocks, bounty progress, completed bounty payouts, and shop refreshes after clears, retreats, or defeats use an ordered `_pendingSettlementActions` recovery queue after the primary node/run settlement. Failed or unknown actions remain in order with a visible hall retry command; later actions cannot pass the failed action, and a new dungeon cannot start until the older queue is cleared. New-game shop stock and every later refresh succeed only when `ServerCore` validates a complete returned inventory with a strictly newer authority sequence before applying any refresh state. Rendering may normalize bounded slots but must never generate or fill stock, advance gameplay randomness, or expose unconfirmed legacy inventory for purchase. Failed, partially applied, or apparently successful but unconfirmed refreshes preserve the last confirmed stock and expose an explicit retry; unconfirmed or incomplete stock remains unavailable or visibly degraded until a confirmed refresh succeeds. Shop purchases carry the displayed authority sequence and card identity in addition to the slot index; the core rejects a missing, unsafe, or stale sequence even when a concurrent refresh produced the same card in the same slot.
- Settlement-save validation bounds recovery queue length and text fields, and accepts only compact version-1 legacy bounty hashes. Oversized, raw, unsafe-sequence, or future-format receipt data fails closed instead of expanding the save.
- Returning from a dungeon by retreat or the Little Elrana interruption must first finish earlier battle-side compensation, then preserve and claim already promised task rewards. A defeat may discard only pending rewards tagged to that exact failed run; it must never clear legacy or unrelated pending rewards globally.
- Character levels run from `0` through `15`. Required experience for each next level is `100, 160, 240, 340, 470, 620, 800, 1020, 1280, 1580, 1920, 2300, 2720, 3180, 3680`, for `20410` total experience from level 0 to 15.
- Normal, elite, and boss battle nodes grant base team-member experience `30 / 70 / 130`, multiplied by the selected difficulty's XP multiplier `1 / 1.15 / 1.35 / 1.6 / 1.9` and rounded to the nearest integer. A representative Machine Factory route now yields about `392` experience on normal and about `2750` total after one clear at each difficulty, pacing the current growth curve without removing early level feedback. Every unique unlocked member of `run.activeParty` who belongs to the run's original expedition party, including a member defeated during that battle, receives the full node amount once; malformed duplicate or out-of-party IDs never create extra grants. Test battles grant no experience.
- Every level automatically increases maximum HP, attack, magic, and speed. Each of the 26 playable characters has a dedicated total level-15 growth profile in `character-progression.js`; integer HP and two-decimal attack/magic/speed interpolation guarantee that all four values increase at every level. Bloodlust, hand limit, per-turn draw, and initial draw never grow with level.
- Character growth remains skill-amplification-aware. Maximum-HP growth keeps the current character-specific totals; attack and magic add another full base-growth amount over the prior `2x` totals for `3x` totals, while speed remains at `2.5x` totals. Repeated-hit, copied-card, full-health multiplier, damage-doubling, and attribute-conversion characters retain their relative profiles, and no shared final-stat ceiling is applied.
- Difficulty power scaling rounds enemy attack and magic to the nearest integer after applying the displayed multiplier; it must not always round upward and silently turn low base stats into a larger-than-displayed increase. HP continues to round upward and speed continues to round to the nearest integer.
- All 27 canonical enemies use character-relative, skill-aware panels rather than uploaded draft values. Their durability, offense, and utility retain the pre-draft skill budgets, while their speed tiers are raised against the corrected `2.5x` playable speed growth. Multi-hit, chained, AOE, copied, doubled, repeated-trigger, and first-turn team damage are intentionally uncapped; difficulty scaling continues to apply normally.
- Experience and level changes are part of the idempotent dungeon-node reward receipt. Replaying the same settlement returns the stored progression payload and never grants experience twice. The battle victory screen and later node reward popup both show team experience; the reward popup also shows per-character level gains. Test and direct non-dungeon victories do not show team experience.
- New saves store character `level`, `exp`, and current `hp`; canonical stats are derived at runtime and omitted from compact saves. Reloading a current-version compact save preserves that exact current HP, clamped only to the rebuilt maximum. The current version-3 growth migration preserves sanitized level and current-level experience, recomputes canonical stats, and adjusts current HP by the previous maximum-HP ratio; version-2 saves preserve exact current HP because maximum-HP growth is unchanged, and dead characters remain dead. Older manual-allocation migration still resets current-level experience to `0`, removes `spent` and the old stat-reset flag, and preserves HP ratio.
- The bottom navigation destination formerly used by the training room is now `客厅`. The living room shows unlocked characters only, with level, current experience, and core stats; clicking a character opens the shared detail panel with the primary combat-role badge beside the name and level-0/current/level-15 growth values. The full character-position description remains on the Attributes tab and is not repeated on the Skills tab. The non-battle panel keeps Skills, two-slot Relics equip/unequip, available Skins, portrait zoom, backdrop/Escape closing, and exact opener-focus restoration usable. Its Relics tab has no codex button; the hall relic inventory remains the codex entry point. Skin choices use the hall appearance-persistence path rather than the battle-only switch action. There are no paid upgrades, allocation points, recommendations, or reset controls.
- 贝尔蒂丝的等级特殊立绘 ID 固定为`bertis_level_10_special`，素材固定为`publish/assets/generated/bertis-level-10-special.022dd113.webp`。角色详情在`Lv.10`前显示锁定条件，达到`Lv.10`后按当前角色等级自动加入已拥有皮肤并允许装备、放大查看和作为正式战斗立绘；不得通过宝珠购买提前解锁。测试战斗配置与战斗内皮肤面板不得试用未解锁的等级特殊立绘，统一显示`Lv.10`锁定占位且不创建原图；已拥有立绘继续沿用正式装备路径。
- 诺诺卡的等级特殊立绘 ID 固定为`nonoka_level_10_special`，素材固定为`publish/assets/generated/nonoka-level-10-special.ba4c8ff8.webp`。其等级解锁、正式装备、放大查看和测试战斗锁定展示规则与贝尔蒂丝等级特殊立绘相同；现有`nonoka_idol_rising_star`仍是独立的史诗皮肤，不被替换或降级。
- 等级特殊立绘统一使用`specialIllustration: true`、`unlockLevel: 10`和零价格元数据。`src/original/store-migration-normalizers.js`在旧存档归一化时必须调用`SkinSystem.ensure(state)`：已解锁且当前等级达到`Lv.10`的角色，即使旧存档没有对应新立绘 ID，也会自动加入已拥有皮肤；未达到等级的错误拥有标记会被移除，若正装备该立绘则回退角色默认外观。任何拥有或装备修复都必须标记迁移存档重写，不能只在当前内存会话生效。旧`testSkins`中的等级特殊立绘试用记录也必须清除；测试战斗不得绕过等级解锁，正式装备仍按外观设置路径保存。
- 当前等级特殊立绘为贝尔蒂丝`bertis_level_10_special`、诺诺卡`nonoka_level_10_special`、曼妮`manny_level_10_special`、芙萝娅`flora_level_10_special`、温蒂`wendy_level_10_special`和艾尔拉娜`elrana_level_10_special`。曼妮“枪之魅魔”、芙萝娅“音速刺客”和温蒂“慈爱教师”是彼此独立的史诗宝珠皮肤，不属于等级特殊立绘，也不得被等级归一化清除。
- Cloud KV mutations are serialized per key through the completion of the underlying SDK request. A client-side timeout may report a recoverable failure, but its late completion must never overtake and overwrite a newer save or delete.
- When `dzmm.kv` is available it is the required durable copy; sandboxed `localStorage` remains a best-effort fallback. A successful cloud slot/main write or delete must not be reported as permanently partial only because the iframe blocks local storage.
- 生产主档、手动槽1-3和设置都直接使用浏览器 `dzmm.kv` 的现有 key。启动不调用 `dzmm.fn`，函数 bridge、函数发布状态和 Cloudflare challenge 不得阻止标题画面。设置读取失败时可使用有效本地副本或受锁定的默认值继续启动；主档/槽位读取仍必须区分明确空值与失败，失败不得初始化空档或覆盖未知云端数据。
- Cards purchased from the shop and cards banked from elite or BOSS rewards are permanent deck entries. Automatic saves, manual save slots, cloud KV snapshots, and local recovery snapshots must preserve them.
- 本地与浏览器-KV副本都有效时，先比较 `_saveVersion`，再比较 `updatedAt`，完全相同则浏览器 KV 胜出；副本不同或任一损坏时保留修复提示。旧存档中的 `_saveHeads` 仅为兼容读取而接受，新快照必须删除该字段。
- 直接浏览器 KV 不提供跨页面 CAS。客户端按 key 串行等待真实 SDK 完成，平台单游戏会话模型降低并发覆盖概率，但多个独立页面同时写入时仍存在最后写入者覆盖风险。
- 沙箱环境访问 `window.localStorage` 失败属于预期能力缺失，存档层必须缓存安全探测结果，不得重复触发或输出 `SecurityError`。手动槽修复同步只重试尚未持久化的 slot/main 副本，不得重写已经成功的槽位并覆盖其后出现的新版本。
- 玩家明确保存或覆盖手动槽时，云端 KV 可用则以该次云端写入成功为持久化条件，再更新本地恢复副本；删除手动槽时先完成云端删除，再清理本地副本。没有云 KV API 的纯离线环境继续使用本地副本。
- 新游戏显式覆盖主自动存档前必须先确认玩家意图。云端 KV 可用时必须在云端写入成功后才替换本地恢复副本和当前运行状态；云端提交前失败必须保留原状态与原存档。无云端能力的离线版继续使用本地覆盖路径。
- A queued cloud save is visible as syncing until the SDK write completes. Critical milestones use `flush: true`, and `visibilitychange`/`pagehide` force any pending debounced main save to begin a best-effort flush before the frame is suspended.

## Fixed Setting Notes

### 卡牌描述标准化

- 正式卡牌及其玩家可见描述的唯一规范来源是 `src/original/data-cards.js`。当前标准覆盖基础牌和正式掉落牌，不以角色技能牌文案代替卡牌数据。
- 数量、数值和百分比统一使用阿拉伯数字，例如 `1张`、`2点`、`30%`；固定目标句式中的 `一名` 和序数表达 `下一张` 保留中文。牌名统一使用 `【】`，标记名统一使用中文引号 `“”`。
- 所有正式卡牌、卡牌转换形态和由卡牌生成的虚拟攻击均没有固定基础伤害。卡牌伤害只读取其声明的攻击力、魔力、护甲、动态成长值和倍率；角色技能自身的固定伤害不受此规则影响。
- 【暴走杀】每使用1次，使用者本场战斗的攻击力永久+1，并立即按提升后的攻击力结算本次伤害；已使用但被目标效果取消的【暴走杀】仍获得此次攻击力成长。该成长直接写入战斗单位攻击力，不在回合结束时清零。
- 奥菲莉亚的`女王之尾`只作用于物理单体【杀】，覆盖实体、虚拟和转换来源，但明确禁止“使用【杀】”触发的强制出牌除外。结算期间该牌本身改为魔力缩放和魔法攻击类别，飞牌、公开出牌记录、伤害判定与反馈均按魔法攻击处理；实体牌结算完成后恢复原始字段。整张牌结算后若实际造成生命值伤害，弃置目标1张可见手牌；同一次用牌无论包含多少段伤害都只弃置1张，状态牌离手时按统一规则进入消耗牌堆。弃置到【杀】时，以不再次消耗手牌和杀意的方式对同一个目标再次使用原【杀】，并保留原牌的实体或虚拟身份，不存在固定32次追击上限。重复使用仍走完整响应与伤害流程，目标死亡、战斗锁定或不再弃到【杀】时停止。
- 伤害和恢复公式统一使用清晰的等值或全角括号表达，例如 `造成等同于你的攻击力的物理伤害`、`造成等同于你的魔力的物理伤害`、`恢复（其最大生命值的30%+你的魔力）点生命值`。不得使用 `1点+攻击力`、`攻击力+护甲值点` 等旧写法。
- 单体和群体目标统一写为 `指定一名敌方角色为目标`、`指定一名友方角色为目标`、`指定所有敌方角色为目标`。多目标数量直接写阿拉伯数字。
- 主动牌使用 `使用此牌`。响应语义按结算方式区分：【闪】响应【杀】与【看破】响应战术牌属于`使用`；【杀】响应【与我一战】或【魔王军入侵】，以及【无谋冲拳】【佯攻】【弹反】【后空翻】属于`打出`。描述顺序固定为目标与主要效果在前，响应限制、后续触发、持续时间和操作提示在后。
- 只有实际扣除生命值后才触发的效果统一写为 `若此牌造成生命值伤害`，不得笼统写成 `造成伤害后`。涉及多段伤害、护甲完全抵消、闪避或防御系统时，文案必须与实际触发条件一致。
- 攻击类别与伤害属性是两套独立规则。攻击类别分为物理攻击和魔法攻击；凡以魔力结算或由魔法技能造成的伤害均属于魔法攻击。伤害属性仍分为物理、毒、雷、火、圣、暗、冰等；普通【魔杀】属于魔法攻击，但当前造成物理属性伤害。
- 【与我一战】由目标先打出【杀（普攻）】，双方轮流打出直至一方无法继续；未打出的角色受到最后出牌者造成的等同于其攻击力的物理伤害。控神魔眼生成的虚拟【与我一战】使用相同伤害公式。
- 文案标准化只澄清现有运行效果，不得借改文案暗中改变卡牌逻辑。新增或调整正式卡牌时，必须同步更新卡牌描述一致性测试。

### 天日国部队名称

- 游戏所有玩家可见文案统一使用“鹰7部队”，不得再使用旧称“137部队”。

### 克罗博士

- Data file: `src/original/data-machine-factory-enemies.js`
- Skill logic file: `src/original/enemy-skills.js`
- 毒气手雷: only two cards with the identical standard suit symbol are a legal cost. Only ♥+♥, ♦+♦, ♠+♠, or ♣+♣ are legal; every unequal-suit pair, including same-color pairs, and every non-standard suit are illegal. The AI and runtime execution must use the same pairing rule.
- 感电追加伤害属于独立的实际生命值伤害事件，必须经过统一伤害与受伤后触发链；它忽略护甲且不会再次触发感电，但可正常触发半魅魔血等“受到生命值伤害后”效果。
- 毒、燃烧、刺弹爆炸与【魔王军入侵】造成的实际生命值伤害同样经过统一受伤后触发链。毒伤不会重新叠毒，刺弹爆炸不会再次引爆其他刺弹；准备阶段若被半魅魔血等提示暂停，必须从原准备阶段步骤继续，不能漏掉后续毒伤、敌方准备技能、饰品或判定摸牌阶段。
- 安洁莉卡【挑衅】要求所有存活敌人依次完成“使用1张单体【杀】或弃置1张手牌”；其中任一次强制攻击触发责任担当、次元转移或其他锁定提示时，必须保留尚未行动的敌人，并在提示结算后从下一名敌人继续。
- 曼妮【次元转移】触发后，底部手牌区统一切换为曼妮的真实手牌；玩家必须亲自选择1张可见黑色手牌，选牌后再指定一名存活敌人承受伤害。红色牌与待摸牌不可选择；玩家可以放弃发动，放弃时不弃牌并让原目标继续承受已经确认命中的该次伤害，不得重新获得一次响应机会。次元转移每次只改写当前伤害段，多段【杀】的剩余伤害继续走统一续跑并可逐段重新选择。
- 多段伤害续跑显示下一次【次元转移】提示后，费用牌与敌方目标必须立即可操作；若上一段的动画或操作锁仍在收尾，目标点击需排队到收尾完成后执行，不能静默丢弃并让提示卡死。敌方回合续跑失败必须进入战斗动作错误恢复，并且不得把失败后的状态写成稳定操作检查点。
- 多段伤害的中断续跑必须重新确认伤害来源仍存活；若来源在次元转移、反击或其他反应中生命降至0，立即丢弃该来源尚未结算的剩余伤害段，再继续公共反应队列与回合清理。

### XX型凋零者1124号

- Data file: `src/original/data-future-orc-enemies.js`, aggregated by `src/original/data-future-enemies.js`
- Skill logic file: `src/original/witherer-skills.js`
- Role: `暴走极速领主`
- Role positioning: she uses 杀欲窥视 to copy every visible kill card held by one selected enemy without revealing that enemy's hand. Each copy keeps the original name and suit, is temporary with the consume property, and costs no intent. She then enters 暴走 or 极速 based on hand color. During her play phase, if current hand colors satisfy the other form's condition, she can actively switch again at any time. The selected state lasts until her next turn begins unless actively switched.
- Draw settings: 每回合摸牌数 is base 2 + 3; 初始摸牌数 is base 4 + 2.
- 暴走: all red hand cards, including response cards, visibly display as 【杀（普攻）】 and can be actively used as no-intent-cost 普攻杀, creating stable offensive pressure. Active selection, targeting, animation, and resolution must use the converted normal-kill form rather than the original card's target or effect flags. This display conversion is transient: the original card fields are restored after resolution, and the preview disappears immediately after switching away from 暴走 or when the state expires at the next turn start.
- Intent rule: 暴走 red cards and 杀欲窥视 copied kill cards must remain playable at 0 杀意 because both are no-intent-cost kill effects.
- 极速: black cards used by XX型凋零者1124号 are unresponsive, and black cards can also be used as 闪 or 看破, improving offense pressure, defense, and counterplay.
- Unresponsive rule: 不可响应 blocks 闪, 看破, and proxy dodge effects such as 护母心切 or 为我护驾 using 闪 to cancel the card.
- Switch rule: 暴走与极速 is no longer once per turn. Red cards greater than or equal to black cards selects 暴走; black cards greater than red cards selects 极速. It can be used again whenever this would change the current form.
- Important rule: 暴走 and 极速 must only be cleared at the beginning of that unit's next turn. Do not clear them during the same turn or at turn end.
- UI rule: do not render an extra 暴走/极速 floating label. The existing status marker is enough.
- Implementation guard: 极速 response flags are transient runtime state. They must be refreshed from the current holder's mode and must not be copied or transferred as permanent card data.
- Identity guard: every 暴走与极速 AI, before-end, and execution entry point must require unit id `xx_witherer_1124`. No other enemy, including 兽人王邦迪, may generate or execute this skill based on hand colors.
- 1124号镰刀: each defeated unit can grant at most one extra turn per battle. Test-mode recovery must not let repeated defeats of the same unit create an infinite extra-turn loop.
- 追杀 rule: only another entity kill card failing to deal damage enables its no-intent-cost effect for the turn. Virtual kills, skill kills, and 追杀 itself do not enable it.
- 弹反 rock-paper-scissors rule: a tie must immediately continue with another choice until a win or loss. After the first tie, the player cannot cancel or switch to another response card; 弹反 is consumed exactly once only after the final result.

### 可入队索尼娅

- Character data file: `src/original/data-future-characters.js`
- Recruit event file: `src/original/recruit-unlock-events.js`
- Portrait: all Sonia views share `publish/assets/new-portraits/sonia.webp`; replace this asset in place so the codex, roster, nursery, and battle UI stay synchronized.
- Identity: 索尼娅 is the recruited human-form name of XX型凋零者1124号; her mother is 混沌女神 and her source dungeon is 兽人地下城.
- Player-visible identity: `XX型凋零者`.
- Normal base stats: attack 2, magic 2, speed 4, hp 36, bloodlust 1, hand limit 4, draw per turn base 2 + 3, initial draw base 4 + 2.
- Skills: she retains all XX型凋零者1124号 skills and runtime rules: 杀欲窥视, 鲜血之忆, and 暴走与极速.
- Battle entrance line: `父亲大人，小心我们其他姐妹找你麻烦，嘿嘿`.
- Unlock: the first recorded defeat of `xx_witherer_1124` opens the naming event in the hall. Completing it opens Sonia in the nursery for 50 精华宝珠; it does not unlock her for free.

### 可入队橘千樱

- Character data file: `src/original/data-future-characters.js`
- Recruit event file: `src/original/recruit-unlock-events.js`
- Identity: 橘千樱 is female, her late mother is 陈莲樱, and her source dungeon is 魔国机械工厂.
- Player-visible identity: `革命复仇者`.
- Apprentice/normal base stats: attack 2, magic 1, speed 5, hp 30, bloodlust 1, hand limit 4, draw per turn base 2 + 3, initial draw base 4 + 1.
- Skills: she retains 红缨连鬼斩 and 心眼拔刀术 from her enemy version.
- 红缨连鬼斩: when her single-target kill targets a unit, judgements continue without a count limit while results are red and stop only when a black result appears; the kill resolves once plus once per red result. Group-target kills do not trigger its judgements or extra settlements.
- Battle entrance line: `为了复仇，我要继续前进`.
- Unlock: the first recorded defeat of `mechanical_bull_king` opens the 鹰7部队委托 event in the hall. Completing it directly adds 橘千樱 to the character roster.

### 可入队格尔达

- Character data file: `src/original/data-new-characters.js`
- Skill logic file: `src/original/gerda-skills.js`
- Unlock event file: `src/original/new-character-unlock-events.js`
- Identity: 格尔达 is female, the 兽人公主, and the granddaughter of 兽人王邦迪.
- Base stats: attack 2, magic 2, speed 4, hp 40, bloodlust 1, hand limit 4, draw per turn base 2 + 1, initial draw base 4 + 1.
- 萌虎慰劳: during 格尔达's end phase, after her discard phase has completed or been skipped, the player may choose one other living ally regardless of gender; 格尔达 and that ally each draw 2 cards. The player may decline. Its locked battle prompt must keep every other living ally portrait and the decline button interactive. It is a trigger skill, not a play-phase active skill.
- 萌虎跑跑: when a kill card targets 格尔达, its source must discard exactly one visible response card or that kill is invalid against her. One kill-card instance pays at most once for the same 格尔达 target, including multi-hit continuation. This self-paid cost appears in the public play trail with the source identified, but remains a normal discard and must not be marked as a forced discard from another unit.
- Unlock: the first recorded defeat of `demon_king_bakaar` opens her hall event. Completing it opens 格尔达 in the nursery for 20 精华宝珠; it does not unlock her for free.

### 可入队星野依

- Character data file: `src/original/data-new-characters.js`
- Skill logic files: `src/original/hoshino-yi-skills.js`, exposed through `src/original/hoshino-skills.js`
- Unlock event file: `src/original/new-character-unlock-events.js`
- Identity: 星野依 is female, an XX型凋零者, and a daughter of 混沌女神.
- Base stats: attack 2, magic 3, speed 3, hp 34, bloodlust 1, hand limit 4, draw per turn base 2 + 3, initial draw base 4 + 2.
- Level-15 growth: hp +78, attack +10.5, magic +10.5, speed +11.25. Her attack and magic growth remain evenly split because 巨蛋演出 and successful 梦想真理 scale both offensive stats together; their total growth remains skill-budgeted because her skills already provide repeated composite damage and temporary dual-stat growth.
- 偶像之星: after 星野依 uses a colored card whose color differs from the previous colored card used during that same turn, she draws 1; a living allied 诺诺卡 also draws 1. Her end phase clears the color-comparison effect and displayed suit, so the next turn starts with no retained color or suit record. The player-facing wording does not expose the internal markers.
- Player-visible 偶像之星 wording omits the internal suit display/update/record explanation. Player-visible 梦想真理 wording explicitly states that resolution switches the portrait to the Witherer form, while its resolution log remains concise.
- 巨蛋演出: 星野依 records standard suits only during her current turn. Her battlefield portrait and active portrait display the current set as `巨蛋 ♥♦...`. Each time she completes a set containing ♥, ♦, ♠, and ♣ in that turn, she deals attack + magic composite damage to every living enemy and clears that suit set so another same-turn cycle can begin. Any incomplete set and its portrait marker are cleared at her turn end. Suit-preserving relic conversions count through the generated card; 军令状's virtual 【魔王军入侵】 inherits the identical suit paid by its two cards.
- 梦想真理 counts cards successfully used by 星野依 and her own completed turns. It succeeds immediately upon reaching 20 cards within her first three turns; otherwise it fails when her third turn ends.
- Before 梦想真理 resolves, the battle portrait displays the current successfully used-card count as `使命 n/20`. The display and internal mission counter are removed after success or failure and must not be recreated by later card uses.
- When 梦想真理 resolves, her current battle portrait and avatar switch to `publish/assets/new-portraits/hoshino-yi-witherer.webp`. The transformed portrait is battle-only.
- Success: after each later standard-suit card whose suit differs from her previous standard-suit card during the same turn, 星野依 gains +1 temporary attack and +1 temporary magic for the current turn. Normal turn cleanup removes the temporary stat bonuses and all Hoshino Yi color/suit/巨蛋 tracking state.
- Failure: every later four-suit completion makes each living enemy discard one non-pending hand card. The same completion still triggers 巨蛋演出's attack + magic composite damage to every living enemy.
- Unlock: the first successful clear of `orc_dungeon` on `adventure` difficulty queues the family event after run rewards are banked. Party composition does not affect this condition. Completing the event unlocks 星野依 and 星野海一 together.

### 可入队星野海一

- Character data file: `src/original/data-new-characters.js`
- Skill logic files: `src/original/hoshino-kaiichi-skills.js`; 半魅魔血队列与提示 live in `src/original/hoshino-kaiichi-share-queue.js`, card transfer and completion live in `src/original/hoshino-kaiichi-share-resolution.js`, and `src/original/hoshino-kaiichi-share.js` is their compatibility facade; all are exposed through `src/original/hoshino-skills.js`
- Identity: 星野海一 is male, the 艾伦格私生子 and the son of 星野依 and 艾伦格.
- Base stats: attack 1, magic 2, speed 2, hp 46, bloodlust 1, hand limit 4, draw per turn base 2 + 2, initial draw base 4 + 2.
- 半魅魔血: after each separate actual hp-loss event, 星野海一 draws 2 and pauses the unfinished pursuit/counter reaction chain for one transfer picker. The picker lock must be established in the same damage-resolution call stack before a multi-hit loop can apply its next hit; while that hidden lock waits for the current damage animations, it blocks input without dimming the battlefield or hand panel. Its skill caption, visible hand controls, and central prompt appear together only after that hit's damage, floating-number, and draw animations finish. The caption clears immediately when that picker is resolved or declined. If no transfer picker can be offered, the caption still appears after the current damage animations finish. A deferred timer may only be a fallback for an already locked battle and must not let later hp loss, draws, logs, or animations resolve early. Like 郭嘉's 遗计 flow, he may select up to 2 hand cards and transfer the selected cards together to one other living ally, or decline. Resolving that picker resumes the exact pending reaction action; another later hp-loss event opens another independent picker before following reactions continue. The interrupted enemy uid is captured when damage occurs; enemy AI resumes only after the reaction queue and all transfer prompts are empty, and only while that same enemy still owns phase 4. A changed active unit or settlement lock must never resume stale enemy actions. Transferred status cards still pass through recipient relic rules, including immediate consumption by 盖亚妮丝护符.
- If a living allied 星野依 is present when 半魅魔血 triggers, her current-magic healing enters the same reaction queue after that damage event's transfer picker and uses the normal healing pipeline. Healing interception may cause another real damage event and therefore another independent 半魅魔血 picker.
- 半魅魔精华 is once per play phase and targets one living allied female. That target deals magic-value magic damage to 星野海一, then draws cards equal to his current total per-turn draw count. 星野依 deals no damage when selected.
- When 半魅魔精华 targets one of the seven sisters, the corresponding living son gains one 绿帽 mark; when it targets 娜娜莉 or 贝丝妲, living 罗卡尔 gains one. This is the shared 绿帽 counter used by the existing 绿帽 system: each unit can hold at most 5, and every mark permanently adds +1 hand limit, +1 bloodlust limit, and +30% attack for the current battle. Attack bonuses stack additively from the unit's attack immediately before its first 绿帽 mark, so 5 marks grant +150%.
- Unlock: 星野海一 unlocks automatically with 星野依. Save migration also unlocks him if an older or repaired save already has 星野依 unlocked.

### 凋零者1124号分裂体

- Data file: `src/original/data-future-orc-enemies.js`, aggregated by `src/original/data-future-enemies.js`
- Draw settings: 每回合摸牌数 is base 2 + 1; 初始摸牌数 is base 4 + 1.
- AI: uses 杀欲窥视 once per turn when an enemy has visible cards; at zero intent it may use 战争号角 even if it still holds kill cards. It must never use 暴走与极速.
- Relics: 凋零者胸部 only triggers while its wearer survives the damage, heals one other living ally by the wearer's magic, and follows normal recovery prevention and after-heal triggers. 凋零者长舌头 transfers exactly 1 hand limit after kill-card damage and stops when the target reaches 0 hand limit.

### 兽人王邦迪

- Data file: `src/original/data-orc-bondi.js`
- Skill logic file: `src/original/bondi-skills.js`
- Encounter: an elite group in 兽人地下城, appearing alone as an alternative to the two 凋零者1124号分裂体 group.
- Stats at normal difficulty: attack 10, magic 5, speed 10, hp 220, bloodlust 1, hand limit 4, draw per turn base 2 + 2, initial draw base 4 + 1.
- 兽王之吼: when 邦迪 uses a kill card and his kill-card count, including the card being used, is greater than his remaining non-kill count, every enemy discards one card.
- 以牙还牙: after an entity card causes hp damage to 邦迪, he takes that card from its discard pile unless it has consume/void handling. The acquired card deals double damage when he uses it.
- AI: prioritize cards acquired by 以牙还牙, then 蓄力 when a playable kill card is available, then the best playable kill card.
- First defeat shop unlock: 佯攻.
- 借刀杀人 is an initial shop card and a normal repeatable card drop. It must not be locked behind 邦迪 or any other encounter.
- Relic drops: 影王斧 and 黑曜石铠甲.
- 影王斧: black kill-card damage is doubled.
- 黑曜石铠甲: kill cards are invalid against the wearer, without consuming response cards or resolving pre-damage kill effects; tactic-card damage is doubled.

### 魔王巴卡尔

- Data file: `src/original/data-bakar-enemy.js`, aggregated by `src/original/data-future-enemies.js`
- Skill logic files: `src/original/bakar-core-skills.js` and `src/original/bakar-fire-skills.js`; `src/original/bakar-skills.js` is the compatibility facade and also exposes the existing relic-skill operations from `src/original/bakar-relic-skills.js`
- Encounter: a boss candidate in 兽人地下城, selected as an alternative final lord to XX型凋零者1124号. His boss group is 魔王军机械三头犬 + 魔王巴卡尔, in that order.
- Stats at normal difficulty: male, attack 11, magic 7, speed 11, hp 330, bloodlust 2, hand limit 4, draw per turn base 2 + 2, initial draw base 4 + 2.
- Opening line is stored under `demon_king_bakaar` in `src/original/battle-line-data.js`.
- When the real 贝丝妲 character is in the party, the six-line special exchange in `src/original/battle-line-intro.js` replaces the standard opening. It follows the 安洁莉卡/伊迪斯 presentation: one speaker bubble at a time for 3.6 seconds per line, with combat locked until the full exchange finishes. 贝丝妲魔偶 must not trigger it.
- 魔王军统领: 【魔王军入侵】 does not affect 巴卡尔. After another character uses an entity 【魔王军入侵】, 巴卡尔 moves that used card from its pile into his hand. 巴卡尔 cannot recapture an invasion he used himself, and virtual invasions cannot be captured. Immunity and capture are one locked-skill activation for 天赋异能.
- 天赋异能: whenever 巴卡尔 activates a character skill, he draws one card. Locked-skill triggers such as 魔王军统领 and 炎拳 activate this effect automatically. Active relic skills, including 军令状, do not trigger it.
- 炎拳: 巴卡尔's kill cards gain fire damage. Each kill-card instance that deals hp damage queues one +30% additive kill multiplier stack; queued stacks become active at the beginning of 巴卡尔's next turn and remain until battle end.
- AI: prioritize an entity 【魔王军入侵】 in hand, then use 蓄力 before kill cards when possible. AI behavior must not be written into player-visible skill descriptions.
- First-defeat shop unlock: 火杀 (600).
- 火杀: deals attack-value fire damage with no base damage. After the attack hits without being dodged, one random non-burning card in the target's hand gains the battle-long 燃烧 property; armor or defense-system prevention does not stop the card property.
- 燃烧: each burning card currently held causes 1 hp loss at its holder's preparation phase. A holder with at least one burning card takes double fire damage. Burning stays on that card until battle end, including after zone or holder changes.
- Burning UI: burning hand cards use an orange-red fire edge effect, and a unit currently holding a burning card displays a fire status icon beside the portrait.
- Relic drops: 军令状 and 女勇者鲁妮的戒指.
- 军令状: during the play phase, choose exactly two cards with the identical standard suit symbol and use them as a virtual 【魔王军入侵】. Only ♥+♥, ♦+♦, ♠+♠, or ♣+♣ are legal; every unequal-suit pair, including same-color pairs, is illegal. It has no once-per-turn runtime limit, but its player-visible description must not include “无限次数”.
- 军令状 counts as one card-use trigger: after-card passives resolve on the generated virtual 【魔王军入侵】, while the outer relic activation must not trigger them a second time. The generated card inherits the standard suit shared by the two paid cards.
- 军令状生成的虚拟【魔王军入侵】属于可响应的虚拟战术牌，可以被【看破】无效化。
- 女勇者鲁妮的戒指: while the holder is at or below 30% hp, damage-card damage is doubled.
- During 【与我一战】 or 【魔法对决】, the ring only doubles damage when its holder is both the duel card's user and the current damage source; merely playing a response card inside another character's duel does not borrow the ring multiplier.
- Under 模仿之音, the ring does not transfer to the substituted damage source, and the original card user's ring also stops applying because that user is no longer the current damage source.

### 艾伦格

- Data file: `src/original/data-characters-extra.js`
- Skill logic files: `src/original/guest-aileng-skills.js`, exposed through `src/original/guest-characters-skills.js`
- 征服欲望的角色面板与图鉴必须展开显示衍生技能【战斗之勇】和【充能精华】的完整描述。
- 充能精华: 艾伦格指定一名友方女性角色，自身弃置所有红桃牌并令目标摸等量牌；目标为贝丝妲时，改为艾伦格弃置所有手牌并令贝丝妲摸等量牌。对七位姐姐之一发动时，若其对应儿子在队伍中且存活，该儿子获得1枚“绿帽”标记；对娜娜莉或贝丝妲发动时，若罗卡尔在队伍中且存活，罗卡尔获得1枚“绿帽”标记。对贝丝妲发动时，艾伦格随后承受等同于贝丝妲当前魔力的伤害；若伤害结算后仍存活，艾伦格翻面并跳过下一个完整回合。角色详情、战斗技能和技能牌描述统一读取该规范效果，旧版动态技能对象也必须刷新。
- “绿帽”标记与洛基的青春草原使用相同效果和上限：至多5枚，每枚令手牌上限、杀意上限各+1，并按首次获得标记前的攻击力增加30%；多枚加算，5枚共增加150%攻击力。
- 充能精华台词固定为：普通目标“我这个……能补充魔力”；贝丝妲魔偶目标“很久没用你了”；娜娜莉目标“你看起来好像……二姐……”，娜娜莉回应“看来，受姨妈催熟记忆影响，我还是比较喜欢舅舅大人你”；贝丝妲目标“大姐，我还是很喜欢你，因为你真的很像母亲”，贝丝妲回应“是吗？那就把存货，全部交出来吧”。
- 贝丝妲魔偶对艾伦格发动榨取精华时，台词固定为“哥哥，好久没见到你了，什么时候让我回到你身边？”。
- 临时衍生技能【取粮】只在战斗操作区提供给符合条件的其他友方角色，不在这些角色的详情面板或图鉴中追加为固有技能；【快速生长】本身必须展开显示【取粮】的完整描述。

### 特坚组护卫凯丽

- Data file: `src/original/data-guard-kelly.js`
- Skill logic file: `src/original/guard-kelly-skills.js`
- Encounter: an elite group in 兽人地下城 with 魔王军猛兽部队 + 特坚组护卫凯丽 + 魔王军魔女.
- Stats at normal difficulty: attack 8, magic 8, speed 12, hp 210, bloodlust 1, hand limit 4, draw per turn base 2 + 3, initial draw base 4 + 2.
- 坚守阵地: at the end phase, 凯丽 turns face-down, then draws cards equal to the number of cards she used that turn. Face-down skips her next complete turn but does not disable responses.
- 突破重围: her black cards may be played as 看破 and her red cards may be played as 佯攻.
- 精灵守护: after another ally takes hp damage, that ally gains armor equal to 凯丽's magic.
- Canonical 三国杀-style descriptions:
  - 坚守阵地: `锁定技，结束阶段，你将武将牌翻面，然后摸X张牌（X为你本回合使用过的牌数）。`
  - 突破重围: `你可以将一张黑色牌当【看破】使用或打出；你可以将一张红色牌当【佯攻】使用或打出。`
  - 精灵守护: `锁定技，当一名其他友方角色受到生命值伤害后，若其存活，你令其获得X点护甲（X为你的魔力值）。`
- AI: prioritize 蓄力 when a kill is available, then kill cards; preserve remaining cards for 突破重围 responses.
- 凯丽's AI reserves one black and one red card when other playable cards are available.
- 感电造成的额外生命伤害也会独立触发精灵守护；转换响应动画显示看破或佯攻，而不是原始牌名。
- First defeat shop unlocks: 武装 (1400) and 撞杀 (1100).
- 武装: gain armor equal to attack.
- 撞杀: deal attack plus current armor damage; if the user still has armor when the hit resolves, turn the target face-down.
- Relic drops: 精灵女神守护之剑 and 精灵女神守护之盾.
- 兽人地下城讨伐/羁绊 task bonus gold range is 1200-2000 and the amount is visible in the task list.
- 坚守阵地 counts cards actually used during Kelly's turn; an extra tactic resolution from 克罗研究记录 is not another card use.
- 精灵女神守护 only grants armor when the damaged teammate survives the damage.
- 精灵女神守护之剑 triggers from any single-target 【杀】 that deals HP damage, including virtual cards.
- 精灵女神守护之剑 checks the original card user, not a substituted damage source from 模仿之音, and it does not trigger from 借刀杀人's forced slash.
- 精灵女神守护之盾 triggers only when a tactic card is used from hand; character and relic active skill cards do not trigger it.
- Kelly skill icons: 坚守阵地 and 精灵守护 use ⭐ for locked skills; 突破重围 uses 🔵.

### 内英组杀手樱羽丽莎

- Data file: `src/original/data-sakura-risa.js`
- Skill logic files: `src/original/sakura-risa-combat-skills.js` for response, backflip, revenge, and AI combat behavior; `src/original/sakura-risa-lifecycle-skills.js` for eye redirection, revival, and damage lifecycle; `src/original/sakura-risa-skills.js` is the compatibility facade.
- Encounter: an elite group in 兽人地下城 with 魔王军魔女 + 内英组杀手樱羽丽莎 + 魔王军魔女.
- Stats at normal difficulty: attack 9, magic 7, speed 14, hp 190, bloodlust 2, hand limit 3, draw per turn base 2 + 2, initial draw base 4 + 3.
- Standard opening line is stored under `assassin_sakura_risa` in `src/original/battle-line-data.js`.
- When 艾尔拉娜 is in the party, the five-line special exchange in `src/original/battle-line-intro.js` replaces the standard opening. It follows the 安洁莉卡/伊迪斯 presentation: one speaker bubble at a time for 3.6 seconds per line, with combat locked until the full exchange finishes.
- 轻身飞翼: after 丽莎 uses or plays each response card, she draws one card. When her response-card count is greater than the selected target's response-card count, her kill becomes unresponsive.
- 轻身飞翼可响应普通/手动闪避、看破、后空翻、佯攻、无谋冲拳、转换响应、代理闪避和为我护驾响应。
- 吸魔邪眼: the player-visible description uses optional wording: `敌方一名角色出牌阶段开始时，你可以与该角色进行猜拳。` At each player character's play-phase start, every living opposing 丽莎 checks in battle order and opens a visible rock-paper-scissors choice popup. Ties keep the popup open until a winner is produced; a bounded repeated-tie guard must still produce a winner. If 丽莎 wins, only cards drawn while that character remains the active unit in phase 4 are transferred to her. Non-player opposing turns continue to resolve automatically.
- 吸魔邪眼摸牌范围: marked characters transfer every actual draw resolved during their phase 4 to the winning 丽莎, including draw cards, character/relic skills, team draws, and filtered deck draws such as 战争号角. Cards that are generated, copied, gained, given, or stolen are not draws and are not transferred. 丽莎进入`待复活`后仍不算阵亡，已建立的吸魔邪眼标记继续把本出牌阶段的实际摸牌转交给她。The mark clears immediately when phase 4 ends, before end-phase effects resolve.
- Guessing-game UI rule: 吸魔邪眼 and 弹反 must always show their three-choice rock-paper-scissors popup when the player is making the choice, regardless of the global manual-response setting. A forced automatic 弹反 cannot be cancelled or switched to another response card.
- Guessing-game result rule: after every player-facing 吸魔邪眼 or 弹反 choice, keep combat locked and show both participants' names, both gestures, and the winner or tie in a result popup. Ties return to gesture selection only after confirmation; final damage, card consumption, draw redirection, and turn continuation occur only after the player confirms the result.
- 不死食尸鬼: when 丽莎 reaches 0 hp with at least one hand card, including a card already drawn but still waiting for its animation, she enters `待复活` instead of dying. She remains untargetable at 0 hp, keeps her hand, does not count as defeated, grants no death/kill rewards, does not play a death animation, and prevents battle victory until her next turn begins. If this occurs during her own play phase, that turn finishes normally instead of leaving the battle flow suspended.
- At the beginning of her next eligible turn, 不死食尸鬼 removes `待复活`, restores her to full hp, and then proceeds through the normal turn. If she had no hand card when reaching 0 hp, she dies normally.
- AI: when both are available, use 蓄力 before a kill card, then continue with normal kill targeting.
- First-defeat shop unlocks: 后空翻 (response, 1100) and 仇杀 (kill, 800).
- 后空翻 cancels a single-target tactic against its user and draws two cards. For a multi-target tactic, every targeted holder may respond even when not the primary target; each 后空翻 removes only its own user from that tactic's target list.
- 仇杀 deals 2 + attack damage and doubles once for each truly dead friendly character; a 丽莎 waiting to revive is not dead for this calculation.
- Relic drops: 写给艾尔拉娜的情书 and 血色刺伞.
- 写给艾尔拉娜的情书: after a friendly female character takes hp damage, each living or pending-revival friendly female character draws one card.
- 血色刺伞: after its holder uses or plays a response card, that holder uses a virtual 机枪扫杀. Recursion protection is tracked per holder, so another holder may trigger once in the same response chain while the same holder cannot loop indefinitely. Nested forced-response sweeps resolve 为我护驾 automatically and must not create overlapping manual-response locks. If the nested sweep reduces the original attacker to 0 hp or causes victory or defeat, the terminal result takes priority: stale response prompts are cleared, the old response flow must not unlock combat, and the original attacker's 霹雳之锤 cannot trigger afterward. This also applies while 丽莎 is in `待复活`: she is not defeated for battle settlement, but cannot perform response-after effects at 0 hp.

### 翻面 Mechanism

- Status meaning: 翻面 is a full-turn control effect. A face-down unit skips its next complete turn, including the preparation, judgement, draw, play, discard, and end phases.
- Turn timing: immediately before the skipped unit's next turn would begin, turn its portrait face-up, then skip that entire turn. The unit takes no active action during the skipped turn.
- Non-stacking rule: 翻面 cannot stack into multiple skipped turns. Applying it to an already face-down unit keeps it face-down and refreshes the same face-down state; it never queues a second skipped turn.
- Response rule: being face-down does not disable response cards. The unit may still respond normally outside its own turn, including while waiting for or resolving its skipped turn.
- Persistent effects: equipment, relics, passive skills, attribute bonuses, armor, and other continuously active effects remain effective while the unit is face-down.
- Targetability: 翻面 is not defeat or incapacitation. A face-down unit can still be attacked, healed, gain armor, and receive marks or statuses.
- Difference from 眩晕: 眩晕 resolves during the judgement phase and, on a black result, skips only the play phase; the draw phase and other phases proceed normally. 翻面 skips the entire turn.
- Difference from direct turn skipping: effects such as a successful 母亲敕令 suit clash that directly skip the next turn are mechanically equivalent to 翻面 for turn resolution, but do not turn the portrait over or use the 翻面 visual state.
- Universal card-back rule: all hidden hand cards and unrevealed judgement cards use `GameAssets.cardBack` (`publish/assets/generated/succubus-card-back.cca22db5.webp`), a black, crimson, and antique-gold succubus sigil. Do not use question marks, color blocks, or separate hidden-card back designs without an explicit setting change.
- Judgement overlays use the same card footprint as the single-card reveal used by 【魔弹特攻】: `104×160` at the `1280×720` baseline, with the same compact-height reductions as reveal cards. Judgement card content must not stretch the popup beyond that footprint.
- Visual rule: while face-down, both the half-body portrait in the team area and the active-unit portrait reuse the universal `GameAssets.cardBack` instead of the normal art. `GameAssets.faceDownCardBack` remains a compatibility alias. Turning face-down and face-up each use an approximately 0.3-second rotation animation.
- Skill wording: use `令一名角色翻面` as the standard effect phrase. A complete basic description is `指定一名角色翻面，该角色跳过其下一个回合。`; additional effects should keep timing, target, and result explicit, for example `你可以指定一名角色翻面，然后该角色摸两张牌。`
- Planned trigger example: 为我护驾 may later let the selected guard become face-down after the guard has no 闪 and takes the redirected damage. This is a recorded integration example only; the current skill text and `src/original/guest-ophelia-guard.js` do not yet implement it.

### Battle Intro Pause

- File: `src/original/battle-lines.js`
- Elite and boss opening dialogue pauses combat for 10 seconds unless dismissed manually.
- Multi-line special exchanges use the 安洁莉卡/伊迪斯 sequential speaker-bubble flow instead: each line lasts 3.6 seconds and combat resumes after the final line.

### Battle Record And Soul Chain

- 牌局记录必须包含角色出牌、角色技能、饰品技能以及每次伤害的明确来源、目标和结果；模仿之音只显示生效后的伤害来源，不重复拼接原使用者。
- 当一名锁魂角色受到杀牌伤害时，伤害会按受伤角色所在阵营分别传导给其他所有仍存活且带有锁魂状态的角色，每名目标只承受一次该次传导伤害。

### 机械牛头王

- Data file: `src/original/data-machine-factory-enemies.js`
- 歼灭模式 is an awakening skill and uses the same `💰` awakening icon as 艾伦格's 征服欲望; do not use `袋` or `觉`.
- 歼灭模式准备阶段的狂热机枪固定视为使用一张虚拟【机枪扫杀】；必须从机械牛头王战场立绘飞入公共出牌区，显示`虚拟`标记，并显示指向全部存活敌方角色的红色目标线。
- An attack that reduces the defense system to 0 activates annihilation combat rules immediately, but the annihilation status, dialogue, log, and BGM switch commit only when the defense-break float reaches its presentation step. The BGM must not change while the breaking attack is still visually travelling.

### 内英组杀手伊迪斯

- 伊迪斯的机制型身份名称固定为`连锁追击封疗Boss`；角色定位必须按实际技能概括实体杀牌连锁追击、超出手牌上限的原目标追加结算、无限暗刃恢复封锁与拷贝魔眼实体牌复制，不得使用组织头衔或“蓄力链锯追杀Boss”作为战斗身份。
- 伊迪斯当前默认战场与角色详情立绘使用压缩资源`./assets/images/pursuer-edis.715fedea.webp`，保持`2048×2048`方形构图；旧`pursuer-edith.webp`不再保留。
- 伊迪斯普通难度基础攻击力为`3`、基础魔力为`2`。
- 伊迪斯三项角色技能的图标固定为锁定技星形`⭐`；无限暗刃不得使用蓝色触发图标。
- 伊迪斯的每回合摸牌数固定为基础`2`加角色加成`2`，初始摸牌数固定为基础`4`加角色加成`1`。
- 伊迪斯AI在已有可执行的蓄力或实体单体【杀】计划时，将摸牌、团队摸牌、偷牌与灵魂锁链归入同一前置战术优先组，在蓄力和【杀】之前按现有战术评分选择合法牌；偷牌必须存在有手牌的目标，灵魂锁链必须存在合法目标及后续【杀】。
- 无限暗刃在敌方角色即将恢复生命值时只生成一张虚拟【机枪扫杀】，固定指定伊迪斯全部存活敌方角色。该牌必须从伊迪斯战场立绘飞入公共出牌区，显示`虚拟`标记，并同时显示指向全部目标的敌方红色目标线；群体恢复也只生成一次扫射，不得按恢复目标重复生成公共牌。该动画可能在恢复牌、饰品或连锁反应的嵌套结算中触发，播放前必须同步当前战场并重新解析全部目标节点，不能因重绘节流或目标节点暂时缺失而省略红线。
- 拷贝魔眼生成的牌保留正常响应规则和稳定的生成技能来源；复制的【杀】可以被【闪】响应，也可以打出响应【与我一战】或【魔王军入侵】。所有复制牌无论正常使用、作为响应打出、在对决中打出、弃置或以其他方式离开手牌，都进入消耗牌堆；复制的【魔王军入侵】不会被魔王巴卡尔回收。
- `伊迪斯电锯剑` makes each eligible entity single-target Slash deal damage twice, but its second damage instance does not start `狂暴链锯` again for that same Slash.
- 若`伊迪斯电锯剑`第一段伤害触发星野海一的半魅魔血，第二段不可响应伤害必须保留并在该次分牌后优先继续；第二段再次造成生命值伤害时独立触发半魅魔血，完成后才继续狂暴链锯等后续反应。
- 伊迪斯电锯剑的第2次伤害从半魅魔血等暂停中恢复时，必须从已完成响应与伤害修正的命中阶段继续；不得重新执行目标选定钩子、响应检查或出入伤害倍率。
- `狂暴链锯`按超出手牌上限的数量令触发它的原实体单体【杀】对当前目标额外结算，不视为再次使用另一张牌；每次额外结算保留该实体【杀】的伤害与响应规则，并在造成生命伤害后各自触发一次对其他目标的虚拟【杀】追击。多名其他目标必须按结算顺序逐张展示独立虚拟【杀】，每张只显示指向当前单一目标的敌方红线；播放前须同步战场目标节点，不能合并成群体目标线或因嵌套结算重绘而漏线。
- `狂暴链锯` calculates X from the visible hand count immediately before the triggering entity Slash leaves the hand, including that Slash itself.
- Chain target tracking and the pre-play hand snapshot belong only to the current card use. If the same entity Slash returns to hand and is used again, both values are recalculated from the new use.
- `为我护驾`选定的护驾者只适用于当前一次杀牌结算，承伤开始前即消费该选择。护驾承伤与放弃护驾后的原目标承伤都必须进入统一伤害生命周期，同一次受伤的全部伤害后触发完成后再续跑反应队列。若伊迪斯的后续虚拟追击再次指定奥菲莉亚，必须重新打开独立护驾选择并暂停反应队列；当前提示完成后从原位置继续，不得自动复用上次护驾者、抢在半魅魔血等同次受伤触发前结算，或丢失后续追击目标。护驾状态必须在命中判定时立即锁住战斗，但中央提示、友方目标高亮和输入只能在当前追击牌及伤害动画全部结束后出现；隐藏等待期间不得提前切换交互模式或继续伊迪斯追击。

### Audio Feedback

- Files: `src/original/battle-fx.js` is the public feedback/audio facade, floating numbers and slash fallback live in `src/original/battle-float-fx.js`, and rerender-stable hit/heal/armor reactions live in `src/original/battle-bump-fx.js`; card DOM is owned by `src/original/battle-effect-card-dom.js`, shared whole-card movement and transfer timing by `src/original/battle-effect-card-motion.js`, and turn-trail queueing by `src/original/battle-card-animation-events.js`. `src/original/battle-effect-cards.js` combines transfer orchestration from `src/original/battle-effect-card-transfers.js` with played-card orchestration from `src/original/battle-effect-card-plays.js` and flight geometry in `src/original/battle-effect-played-card-flight.js`; direct player-card flow remains in `src/original/battle-effect-play.js`.
- Card flight animations should play a light move tone when the card starts flying and a light land tone when it reaches the target or public zone.
- Damage, hp loss, healing, and armor sounds stay synchronized to floating number feedback, not to the card flight itself, to avoid duplicate impact sounds.
- Magic-attack damage uses the dedicated local sample `publish/assets/sounds/magic-hit.mp3`; its first clear impact transient must begin within 40ms so it remains synchronized with the damage visual and floating number. Physical and elemental impact routing remains unchanged, and hybrid physical-plus-magic damage still emits only one magic hit cue at the initial impact.
- Battle Web Audio effects must wait until `AudioContext.resume()` has completed and the context is actually running. A delayed unlock must queue the requested effect instead of silently scheduling it on a suspended context.
- Battle animation speed is a settings-only preference with fixed choices `1x / 1.5x / 2x`, defaulting to `1x`. `src/original/battle-effect-animation.js` divides Web Animation durations, queue waits, finite queue-owned CSS animations, chained effect delays, and presentation cleanup timers by the selected speed without removing asynchronous boundaries or changing commit, damage, reaction, or settlement order. Follow-up card events marked as an extra Slash resolution, repeated tactic, soul-blade replay, explicit compact follow-up, or hidden virtual Slash follow-up keep their full flight but use 45% of the normal hit/trail hold before the selected speed is applied; the initiating play remains full length. Existing `prefers-reduced-motion` behavior remains active, and its finite battle-effect durations use the same speed clock while ambient infinite animations remain independent.
- Card movement animation policy: every effect that draws, gains, gives, steals, robs, discards, seals, or returns real hand cards must queue the matching visible movement event (`drawBatch`, `gainCards`, `giveCards`, `stealCard`, `discardBatch`, or `sealCards`). Played and response cards use their existing play/response flight instead of a duplicate discard animation. Every entity response path, including converted, proxy, counter, backflip, feint, reckless, and guard responses, must enqueue through `BattleCards.queueResponse` so hand counts advance with each response flight rather than jumping to the final count. Response events apply relative hand-count deltas, and later draw/gain/give/steal arrivals must increment that held visual count immediately, so response-triggered draws never leave the displayed count stale until the whole queue drains. Arrival reconciliation counts only cards still present in the receiver's hand; cards intercepted or consumed before arrival must not increase the display.
- Battle-opening draw policy: after both teams are created, every character's initial draw batch starts concurrently instead of waiting for another character's full batch to finish. Each character still uses its own initial-draw count and side-owned pile, and later draw events keep their normal ordered animation flow.
- Unified card-flight policy: card movement always renders a complete card, never fragments. Draw, give, gain, steal, and robbery events fly card backs with approximately 100ms stagger between cards; allied arrivals flip to their readable fronts, while enemy draws remain hidden and only update the visible hand count. Play, response, discard, dismantle, seal, and consume events fly readable card fronts. Player plays originate at the selected hand card, targeted cards retain their target line and target pause, and enemy plays retain the red target line from the enemy portrait. Ordinary public turn cards fly to their discard pile when the turn ends; consumed cards pause in the public zone, then immediately fly to the consumed pile with the burn effect and remove their public snapshot so they cannot exit twice. Cards generated into hand by 【解答迷惑】, 【狂战意志】, 【杀欲窥视】, or 【拷贝魔眼】 are the exception: each keeps a stable generation-source marker, and after its burn reaches the consumed pile, its settled public snapshot remains for the rest of the turn without flying again during turn cleanup. Every transient play mirror must bind its animation identity back to the source card before resolution, so its resolved trail snapshot reuses the same identity even when `打出了` and `使用了` wording differs. A transient mirror and its resolved record are one logical public card and must not display twice; 【组合进攻】 therefore remains beside its two `协攻` Slashes. 同一张【杀】的每次额外结算必须完整重复该牌的飞牌动画，重新显示大号“杀”字及指向当前结算目标的阵营色目标线，但不得重复生成公共出牌区牌面；该规则统一覆盖双重打杀、刺刀AK47、三头齐攻、红缨连鬼斩、伊迪斯电锯剑、狂暴链锯，以及聚焦喷火器对每名目标的第2次伤害。追魂之刃、格林机枪等明确“再次使用另一张牌或重用原牌”的效果仍按独立出牌展示，不属于额外结算。
- 【刺杀】的弃牌与伤害共用该牌首次指向目标的飞行和目标线；【神速之袭】生成的虚拟【刺杀】复用技能牌飞行，不得在弃牌后再次显示目标线；音速刺客皮肤的【神速飞剑】由专属绿色斩线承担攻击指示，不再叠加通用目标线，其他皮肤仍显示一次通用目标线。
- 主动饰品【1124号长舌头】生成的虚拟【勒杀】复用饰品牌已经完成的同目标飞行，不得再次显示通用目标线。枪之魅魔皮肤的【刺刀AK47】受伤反击由专属反击枪火承担攻击指示，不再叠加通用目标线；其他皮肤的反击仍显示一次通用目标线。
- Front-facing flying cards use eager `<img>` nodes for their otherwise lazy card artwork, but movement starts immediately without waiting for load or decode. Failed primary URLs are remembered and switch once to the matching generic card-art fallback while the flight continues.

### 属性伤害反馈

- 实现文件：`src/original/battle-damage-attributes.js`、`src/original/battle-damage-fx.js`、`publish/battle-damage-fx.css`
- 角色受击反馈固定为类似三国杀的短促左右衰减抖动，不使用上下跳动；保留受击亮度闪烁、每段伤害浮字和同步音效。同一目标在一次短抖动尚未结束时继续受击，复用当前抖动并更新幅度，不通过同步布局强制重启；属性伤害装饰每个目标最多同时保留两组，伤害浮字最多同时保留三个。每段浮字都必须创建并可见，极高速连击只允许让最旧浮字提前退场，音效不得丢失。
- 战斗速度同时缩放视觉等待、采样音效延迟以及合成音效的延迟和持续时间；连锁音符、命中声与对应动画必须使用同一时钟，切换到1.5倍或2倍速度后不得仍按1倍速度拖尾或错拍。
- 属性伤害先在目标半身像中心播放特效，再弹出伤害数字。多段伤害的特效起播间隔为150毫秒，每个特效约0.5秒后消散。
- 属性优先级固定为：物理、毒、雷、火、圣、暗、预留冰。同一次伤害具有多种属性时，必须按此顺序依次播放，互不覆盖。
- 物理使用白色斩击和红色数字；毒使用绿色毒液与染色；雷使用蓝白闪电；火使用橙红升腾火焰；圣使用金色光柱与白色羽毛；暗使用吸收光线的紫黑雾气；冰预留冰晶蔓延与碎裂表现。
- 暴击时属性特效放大至1.3倍，伤害数字放大至1.5倍；保留对应属性的数字颜色，并附加金色闪光。
- 毒属性来源包括毒杀、中毒结算及毒针持有者造成的杀牌伤害。雷属性来源包括雷杀、电磁反制装置及感电额外伤害。火属性来源包括聚焦喷火器。圣属性来源包括圣杀、圣剑无双、圣天破军剑及圣痕增伤。暗属性来源包括贝丝妲的黑色伤害牌及终焉鬼影斩生成的魔杀。其他杀牌（包括虚拟杀）默认属于物理属性。
- 长期维护规则：以后新增任何伤害属性，必须同步加入正式属性优先级和来源判定，并补齐半身像动画、专属伤害数字颜色、同步音效、暴击表现及取消清理。只增加玩法数据而未实现完整反馈的属性，视为未完成。
- 魔力伤害使用独立于属性的反馈层。纯魔力伤害不播放默认物理斩击，目标脚下播放约0.5秒的紫罗兰旋转扩散魔法阵、三道上升光束与飘落星芒，并使用亮紫色发光伤害数字和水晶共鸣音；暴击时魔法阵放大至1.3倍、光束增加为六道、数字放大至1.5倍并叠加紫金闪光。
- 魔力伤害的正式攻击类别固定为“魔法攻击”。伤害结算事件必须携带`attackType: "magic"`，卡牌伤害预览必须显示“魔法攻击”；保留`magicDamage`仅用于兼容旧事件，不再作为唯一规则字段。
- 榨取精华使用蓝色触发图标；发动后，本回合所有原本属于物理攻击的攻击牌均转换为魔法攻击，但保留各牌原本的伤害公式与属性。
- 魔力反馈覆盖魔力缩放卡牌、榨取精华转换后的物理攻击牌、魔法对决、魔弹特攻、魔王军入侵，以及锁魂镰刀、终焉鬼影斩、鬼牌狂欢、爱之鞭挞、充能精华反伤、自爆倒计时、贝丝妲与奥菲莉娅的魔力转换杀、莫娜的圣属性杀等以魔力或魔法技能结算的伤害。魔王军入侵固定为物理+魔法复合攻击：每次伤害依次显示物理与魔法特效，但只播放一次同步命中音效。
- 娜娜莉的魔刀阿波罗适用于实体、转换和虚拟的单体【杀】，以使用前的手牌数计算扣置数量；实体【杀】须包含刚刚离开手牌的该牌，转换【杀】须包含刚刚作为转换费用离开手牌的来源牌。同一张【杀】对同一目标至多触发一次魔刀阿波罗。目标未被扣空时，手牌数量也必须在扣置飞牌动画开始前立即刷新，不能等动画结束后才显示减少；连击或连续反击多次触发时，每次封牌动画必须显示该次独立扣减，不能提前跳到最终手牌数。
- 娜娜莉技能实效固定：魔刀阿波罗只响应单体【杀】且扣置牌于任意角色回合结束时返还并恢复状态牌标记；虚弱斩杀只对单体【杀】和无手牌目标翻倍；复仇之刃仅在敌方造成实际生命伤害后触发，罗卡尔受伤时逐个反击所有当时存活的敌人，娜娜莉在反击链中阵亡后停止后续反击。
- 敌我双方角色受到致死伤害或致死生命流失时，必须先完成对应浮字与死亡动画，再执行死亡弃牌和胜负检查，不得在玩家仍看到角色存活时提前清空手牌。
- 我方角色在自己的出牌阶段获得实际摸牌后，手牌横向滚动自动跟随到最右侧的新牌；其他阶段与没有新增手牌的重绘继续保留玩家阅读位置。重绘后的下一帧补偿恢复不得覆盖玩家在该帧前已经进行的手牌、公共出牌区或牌局记录滚动。
- 手牌选择反馈固定为无布局位移的上移动画：新选中的牌平滑抬起并轻微回弹，取消选择时平滑落回；多选时只动画本次变化的牌，已经选中的牌在战斗重绘后保持原位，不得重复弹跳或闪烁。短屏按可用高度降低抬起距离，并尊重系统减少动态效果设置。
- 战斗手牌区的全部操作按钮，包括“确定/使用”“确认弃置”“取消”“结束出牌”以及技能产生的跳过、放弃、不交和直接弃置按钮，必须使用同一套放大规格；短屏可降低高度但不得缩回难以点击的小按钮。
- 玩家点击“确定/使用”后，目标线和飞牌必须在同一次交互帧立即出现，不得保留起飞前瞄准等待；从点击开始到飞牌收尾结束必须冻结战斗 DOM 重绘，实际牌效果固定在飞牌首次命中目标时提交，无目标牌在飞入公共区时提交。玩家指定目标的牌与敌方指定目标的牌统一从行动者战场立绘起飞，采用约280ms飞向目标、90ms命中停顿和170ms飞入公共区的同一套轨迹；无目标牌约300ms飞入公共区。命中提交时仅局部同步本回合出牌记录，不得等待飞牌收尾或全战场重绘；状态提交后由飞牌收尾统一恢复其余重绘和动画队列，伤害、治疗、消耗牌燃烧及其他特效必须继续完整播放。
- 消耗牌燃烧动画在约820ms燃尽后直接完成重绘与动画队列结算，不再附加已废弃的瞄准等待；正常燃烧不得进入“战斗动画异常”补偿路径。
- `魔弹特攻`的同花色费用选择、被`魔弹特攻`指定后的强制展示，以及手动使用`闪`、`杀`、`看破`等响应牌，统一在底部手牌区显示与选择，不再复制到中央卡牌弹层。可取消流程的“取消”按钮固定占用“结束出牌”所在的手牌区操作位并使用同一套放大规格；强制响应流程不得显示取消按钮。短屏桌面窗口中的响应牌必须跟随普通牌缩放，包含选中上移状态时也不得超出手牌面板。
- 战斗中凡是让玩家从我方某名角色的实体手牌中选择具体牌，默认必须把底部手牌区切换为该角色的真实手牌并直接点击选择，禁止再复制一套中央选牌弹窗。只有玩法规则明确要求“展示、查看或翻开目标手牌”的流程才可使用展示弹窗；当前明确例外为对友方使用【偷窃】【拆解】时的正面展示选择。
- 新月之歌、收获分享、半魅魔血与指挥官责任等非正常出牌阶段的交牌提示，必须将手牌区切换为技能发动者的真实手牌；即使当前行动权属于敌方或其他角色，也不得继续显示当前行动者手牌。交牌点击与选择上限必须按提示记录的发动者 uid 处理，禁止回退到当前行动角色；点击携带的手牌归属与当前提示 uid 不一致时必须拒绝输入并刷新，不得把旧手牌 DOM 的索引套用到新的发动者。收获分享必须同时保存原选牌对象引用与用于显示的派生下标；等待动画期间手牌插入、移除或重排后只能交出仍存在的原对象，任一原选牌失效时清空整组选择并留在提示中要求重选，交牌动画完全结束后才可推进弃牌阶段。半魅魔血、指挥官责任与次元转移在等待当前卡牌、伤害、摸牌或浮字动画期间提示尚不可见，此时必须保留逻辑锁但不得提前切换手牌区、目标模式或技能字幕，并拒绝所有相关输入；动画队列完全空闲后才同时显示提示与可操作控件。指挥官责任直接点击该手牌区完成逐张交付，不再使用独立弹窗复制一套牌按钮。若异步动作在重绘出下一张交牌、次元转移或萌虎慰劳提示后仍处于收尾阶段，新提示的点击必须绑定当前 state 与 prompt 身份并排队到动作守卫空闲；不得显示可点击控件却静默丢弃输入，也不得让旧提示回调落入新提示。
- 全体攻击牌在出牌动画中必须从所用牌显示指向所有存活敌方目标的目标线；除机枪扫杀与魔王军入侵外，疯狂射击、聚焦喷火器、火力压制及未来在结算前由单体牌转换成全体攻击的效果同样适用。
- 地下城地图节点必须显示层数；已完成的当前节点明确显示“已完成”并保持不可重复点击，下一层开放节点保持可点击，避免把正常推进误判为跳层。所有副本、难度和随机地图中的每个节点必须从起点可达、能继续到达最终BOSS、只连接下一层且能从任一合法前驱点击进入；挂起结算时全部节点禁用，中断恢复后仍须开放正确的下一层节点。离线延迟加载完成后必须直接进入地图，不得借用中断恢复分支；地图入场动画不得移动可点击节点，玩家进入副本后的第一次按下与松开必须能触发对应节点。
- 贝丝妲的终焉回旋斩在【闪】抵消【杀】后，按手牌中的黑色【杀】数量使用指定所有敌方角色为目标的虚拟【魔杀】，伤害按贝丝妲当前魔力结算。
- 魔力反馈与属性反馈独立兼容。同一伤害附带毒、雷、火、圣、暗或冰属性时，先按既有属性优先级播放全部属性特效，再播放魔力魔法阵；例如暗属性魔力伤害固定为暗雾后叠加魔法阵，互不覆盖。范围魔力伤害沿用多目标预排队机制，以短间隔触发各目标形成连锁节奏。

### Save And Runtime Robustness

- Gameplay persistence is milestone-based: spending, unlocks, dungeon entry, reward banking, a successful formal battle-start checkpoint, each completed gameplay operation that returns to a stable allied play phase, battle exit, retreat, and settlement may save. Battle loading, animations, prompts, selections, and unfinished response or settlement chains never auto-save. Multiple completed operations in the same turn use a monotonic checkpoint sequence so a later action cannot be mistaken for the already saved turn state. Opening or closing panels, changing filters, inspecting portraits, dismissing dialogue, and cancelling prompts must also never save.
- Startup initializes a fresh in-memory state and must not automatically load progress. Continue and save-slot loading remain explicit player actions.
- Startup loading copy must describe game/resource initialization and must not claim that a save is being read.
- Startup failure handling covers state initialization, critical preload orchestration, the initial `render()`, and first-frame scheduling. Any fatal failure before `loading.ready()` reports `BOOT_FAILED`, replaces the game view with a retry control, blocks resize/status rerenders from overwriting that state, and invalidates the failed attempt so late work cannot report ready. Each explicit retry begins a new `start` loading phase. After the first interactive frame, uncaught errors and unhandled promise rejections instead enter the runtime error boundary: it records `source/code/message/stack`, advances a runtime generation before resetting action guards and transient busy/loading state, invalidates stale sortie/test-battle/battle-create/media-retry continuations, rolls back an interrupted pre-battle dungeon node, safely releases non-prompt battle locks, recovers battle presentation, and shows `返回重试` as the focus-trapped top child of the global modal stack without calling `loading.error()` or automatically replaying the failed action. Errors emitted after a failed boot but before an explicit retry remain available to the browser's default diagnostics instead of being silently cancelled.
- The start screen has no continue-game or exit command because the production iframe cannot reliably close its host. Its commands are 新游戏、读档、设置, plus the separately visible 制作名单 entry; all use visible names instead of icon-only controls.
- A fresh save shows one compact first-expedition objective in the hall, changes the primary command to `开始首次远征`, and marks 魔国机械工厂·普通 as `推荐首战`. The hint is completed only after a dungeon run is successfully created; test battles do not complete it. Saves created before this flag existed migrate as already completed so established players do not receive new-player onboarding.
- Save snapshots exclude transient interface fields, including hall modals, info and portrait overlays, codex/filter selections, confirmation dialogs, settled reward presentation, loading flags, battle dialogue, animation queues, and public-card presentation trails. Recoverable battle checkpoints retain complete battle card data, store each side's shared pile exactly once, and restore unit references instead of using the compact non-resumable battle-start representation. The resume marker exists only while a stable snapshot is prepared; live battle state tracks admitted turns outside the serialized object so later same-turn manual saves cannot authorize an unsafe mid-turn resume. Checkpoint compaction reuses the store's already-isolated clone rather than cloning the expanded battle again, and the local fallback skips validation/serialization entirely when sandboxed local storage is unavailable.
- During damaged-save character reconstruction, valid character IDs retained in the original party are authoritative unlock evidence. Reconstructed party members, including 娜娜莉 and 艾伦格, must be restored before party filtering and must remain in that party.
- Hall-only navigation (`livingRoom`, legacy `training`, `nursery`, and `furnace`) is normalized to `hall` in save snapshots, or to `dungeon` when an expedition remains active. Durable unlock flags must reconstruct interrupted event modals after load and after a higher-priority transient modal closes; the post-underwater-train Ophelia/Besta chain and pending Orc Dungeon unlock must never depend on `hallModal` persistence.
- Versioned saves distinguish an unlock event being triggered from its story being completed through `unlockEvents.completed[eventId]`. First/second-defeat settlement may already unlock its roster target while queuing the story, so loading and later hall renders must reopen an incomplete story instead of inferring completion from the roster, log text, or transient modal state. Saves predating the versioned ledger use defeat counts, seen flags, and unlocked defeat rewards only to restore pending stories; because old saves have no durable completion evidence, an already acknowledged defeat story may replay once, without duplicating its reward. Unlock ledger version 2 also treats version 1 defeat completion bits as ambiguous trigger evidence because the first implementation could infer them from pre-acknowledgement rewards; unambiguous version 1 event markers remain completed. The one-time migration requests an automatic-save rewrite. For non-defeat events whose unlocked character or dungeon flag is unambiguous terminal evidence, migration may also repair a missing versioned completion marker; 星野依 remaining unlocked continues to repair 星野海一.
- Relic equipment persistence occurs only when the equipped slot actually changes; selecting the same relic in the same slot is a no-op and must not write the full save.
- Relic equipment slots use direct click behavior: clicking an equipped slot unequips it immediately, while clicking an empty slot opens/selects that slot for equipping.
- The hall relic library uses the same two-button slot layout as test-battle relic equipment. Clicking an empty slot opens the exact slot picker and returns the underlying relic modal to its top scroll position; clicking an equipped slot still removes it directly.
- Test enemy selection is derived from every canonical `GameData.enemies` dungeon group after all split enemy data loads. Battle setup gives allies and enemies matching copies of the selected shared deck composition, each shuffled independently.
- Audio, battle-animation-speed, and response-card settings use separate settings-only persistence, load on startup, survive starting a new game, and remain included in manual save slots. Loading the automatic or current main save keeps the independently loaded preferences instead of replacing them with an older snapshot; loading a manual slot restores that slot's preferences and waits for the settings-only write to settle. A failed restore keeps the loaded gameplay state, opens the settings warning with an explicit retry action, and must never be overwritten by an older pending settings change.
- Equipped skin choices also use the settings-only queue so an in-battle change can persist while main-save writes remain disabled. Appearance records carry their own update time: only a newer settings selection may override an older main-save selection, only skins owned by that save may be restored, and settings-save failure must keep the change visibly pending with an explicit retry action. Load-time appearance arbitration must finish before scene bundle/style selection so a restored battle loads the final equipped skin's required CSS.
- Character unlock, story completion, battle exit, victory settlement, and other durable milestones keep their action guard active until `persist({ flush: true })` settles. A failed write leaves the dirty snapshot and visible retry command instead of reporting the action as durably saved.
- Settings reads must distinguish an explicit empty cloud value from a failed or invalid cloud read. A valid local settings copy may be used while cloud state is unknown, but the settings UI must show the error and retry action and block physical writes until a strict retry succeeds; an explicit settings restore attempted during that block remains only as a pending in-memory snapshot and is synchronized after the strict read. A damaged cloud settings copy may be repaired only after retry confirms it is still invalid and a valid local or pending snapshot exists. Without either valid source, defaults may be displayed only as a locked temporary fallback and must never be persisted over the unknown cloud value. Only the latest accepted settings intent may remain pending: failure of an older queued write must not overwrite, requeue, or display a false failure for a newer setting. Settings normalization and validation live in `src/original/store-settings-schema.js`, retry-state ownership lives in `src/original/store-settings-state.js`, versioned write ordering and lifecycle pausing live in `src/original/store-settings-writer.js`, and `src/original/store-settings.js` owns strict KV selection and repair orchestration.
- Host save lifecycle actions are mandatory when `window.dzmm?.save?.onAction` exists. Main save, manual slots 1-3, and settings keys are centrally registered; `reset` and `prepareDeleteRecord` retain queued writes while pausing settings and slot admission before the dependent main queue, capture the selected direct-KV/local copies, delete every owned browser-KV key, clear accessible local copies and pending in-memory settings, and honor the host deadline. A timed-out pause generation must be invalidated so its late continuation cannot pause the main queue again after recovery. If any required browser-KV deletion fails, restore every already-attempted captured value through direct KV before resuming queues. Local storage unavailability inside the opaque sandbox is not a deletion failure after browser KV succeeds; any real delete or restore failure must return `{ ok: false }` and block the host action.
- Replacing state through manual load must cancel the previous battle's animation queue, dialogue timers, action lock, enemy thinking, and manual-response continuations. Every continuation after an async wait, preload callback, delayed error recovery, and control unlock must verify its state/runtime generation; stale battle tasks must never commit or alter the replacement battle UI. Enemy thinking interrupted by state replacement, active-unit change, settlement lock, pending reaction, or death must clear the marker on the battle object that started the wait.
- Delayed battle FX, float retries, slash retries, sound-loading callbacks, temporary skill popups, test-recovery notices, dungeon battle entry, and hall battle startup must use the runtime/state and battle object captured when they began. State or battle replacement must clear old FX classes and all connected controls marked as processing, including when the replacement screen renders identical HTML and reuses the existing DOM.
- Split dungeon enemy data is required startup data. `data-machine-factory-enemies.js` and `data-underwater-train-enemies.js` must load before `data-world.js`; missing or empty arrays fail fast instead of silently creating an empty dungeon enemy pool.
- Split machine-factory and underwater-train enemies must remain included in `tools/validate-data.js` schema validation, not only relation and asset checks.
- Script dependency validation treats each dependency entry as an ordered chain and checks every adjacent pair.
- External entry scripts use `defer` in their declared dependency order so downloads do not block HTML parsing; offline loading keeps the same ordered classic-script execution.
- Same-screen rerenders reuse matching image and video elements instead of decoding them again. Entry animations for existing modal, dungeon, battle overlay, log, credits, and victory elements are completed rather than restarted; newly opened elements still play their normal entrance once. Active battle skill and relic captions preserve their timed animation progress across rerenders. Media, animation, caption, and hand-selection continuity live in `src/original/app-render-preservation.js`; focused-control and modal-opener restoration live in `src/original/app-render-focus-preservation.js`. Browsers without `Element.getAnimations()` must keep rendering normally, using the no-animation-progress fallback.
- Battle movement effects and the main-save queue must tolerate browsers without `Element.animate()` or `Array.prototype.at()`: apply the final keyframe, wait the configured duration, continue settlement, and merge queued saves through basic array indexing. If `animate()` returns an object without a `finished` promise, use the same duration fallback so the animation queue cannot remain blocked.
- Enemy thinking tasks are single-owner async work. State replacement, active-unit changes, settlement locks, pending reactions, and death must clear the originating battle's `thinkingUid`; if an interruption resumes before the old thinking delay settles, the resumed task supersedes the old task. Once `autoEnemy` starts, ownership remains exclusive until it exits so no recovery path can run the same enemy concurrently or trigger duplicate actions.
- Main cloud-save reads must distinguish an empty cloud value from a failed KV request. When a valid local main copy exists, a failed cloud read may load that local copy; without a valid local copy, continuation remains blocked and must never create or save a fresh game implicitly.
- Save-slot listing and loading expose valid local copies during a cloud read failure and label the cloud state as unknown. While cloud state is unknown, saving and deletion are blocked, explicit cloud-copy loading still fails, and loading a local slot updates only the local main copy until the player explicitly retries cloud synchronization.
- If neither cloud KV nor local storage can be read, both Continue and New Game must fail closed instead of treating storage as empty.
- Save-slot deletion is cloud-first when the SDK is available. A cloud deletion failure must preserve the local copy, keep the current slot selection unchanged, and show a retryable error.
- Main-save loading validates local and cloud copies independently. A structurally damaged cloud copy must be marked as damaged and must not block a valid local copy; the in-game warning provides an explicit repair action for the damaged copy.
- Save validation rejects non-object roots and invalid core container types before migration. Main-copy repair shares the normal versioned write queue and uses the newest known snapshot, so an older repair cannot race with and overwrite newer progress.
- Persisted physical cards contain only their canonical card name/identity and suit. Loading rebuilds every card from `GameData` and never preserves stored combat fields such as power or skill flags; unknown card names and invalid suits fail structural validation instead of entering migration.
- Manual save-slot writes use one versioned transaction snapshot for the slot and main save, retain per-copy local/cloud results, and report recoverable partial success instead of claiming that nothing was written.
- A partially written manual save remains visible in the global save warning after its dialog is dismissed, with a retry action that reuses the exact transaction snapshot. Deleting that slot or starting a newer save clears the obsolete pending transaction.
- Retrying an older pending slot transaction must not roll back newer in-memory save metadata or progress. A main write skipped because a newer main snapshot exists must return an explicit superseded result instead of an ambiguous empty result.
- Loading a save slot, including an explicitly selected local or cloud conflict copy, must flush that loaded snapshot to the main save before completing. If only the cloud-main flush remains pending, the loaded game continues with a visible retry warning.
- Save-slot loading captures both the originating runtime state and runtime-error generation before its first asynchronous read. Every later read, bundle load, main-save promotion, migration write, settings write, state replacement, and UI commit must stop when that ownership becomes stale. After adopting the loaded state, the settings-sync tail captures a new guard for that loaded object so another replacement cannot close dialogs, log success, or rerender stale UI.
- Battle UI async actions use `src/original/battle-action-guard.js` so rejected animation or settlement work restores controls, recovers effects, rerenders, and gives a visible retry message.
- Hall, shop, save-retry, and dungeon async actions use `src/original/app-action-guard.js`. Unexpected rejection must produce a visible retry message and release the originating control in `finally`; render and persistence after an await require the captured runtime state and dungeon run to still be current. Dungeon node entry additionally requires the captured node to remain the run's pending node before rendering, saving, or rolling back. The guard blocks duplicate submissions from the same control or explicit action key, while unrelated actions and successor-scene controls remain independently usable.
- Gameplay-affecting random choices use the persisted `state.random` seed and cursor, including dungeon generation, enemy groups, rewards, shop stock, bounty generation, battle piles, AI choices, and random skill outcomes. Durable run/task IDs derive from that seed/cursor without consuming it. Every shuffle uses Fisher-Yates. Animation/DOM IDs and synthesized audio noise are isolated from this stream so presentation timing cannot change later gameplay results.
- BGM source changes invalidate older pending `play()` requests; their stale rejection must not be reported as a playback failure. In blob or opaque-origin game frames, battle sample audio must skip CORS-sensitive `fetch()` preloading and use warmed media-element playback; a failed Web Audio sample preload switches once to that fallback without repeated requests or warning spam.
- Battle BGM priming uses the final selected encounter track after the mission and enemy group are known. A mission, elite, or boss-specific track must be warmed directly without first assigning the default battle track.
- Music-volume changes cancel any active BGM fade. If a track switch is pending, the selected track and new volume take effect together; changing volume while victory or settlement is stopping BGM must never revive the previous track.
- At zero sound-effects volume, sampled and synthesized battle audio is fully silent and synthesized elemental or magic impacts must not allocate oscillators, noise buffers, or gain nodes.
- 敌方行动期间若被反击类效果击杀，只结束该敌人的出牌阶段并继续执行回合清理、胜负检查与后续角色推进；若已进入胜负结算锁定，则由结算流程接管。反击、追击与半魅魔血同时触发时，每次海一实际损失生命后立即暂停尚未结算的反应队列，完成该次分牌后从原位置继续；不得丢失后续伤害、重启整段敌方 AI 或串到其他角色。全部反应与分牌结束后，恢复前仍必须确认是同一战斗、行动权属于触发时记录的原敌人且仍处于出牌阶段。该规则统一覆盖终焉回旋斩、复仇反击、复仇之刃、刺刀AK47反击、弹反、血色刺伞、剑盾反攻、电磁反制装置、伊迪斯狂暴链锯追击及未来同类反应伤害。
- 半魅魔血的逐次暂停还必须保留同一攻击尚未结算的次数、全体攻击后续目标和当前回合阶段。机械牛王狂热机枪/恐怖巨锤、鲨影鱼雷、无限暗刃和自爆倒计时等非普通出牌循环也必须在分牌后从原目标序列继续；准备阶段恢复后继续判定与摸牌，结束阶段恢复后完成胜负检查并推进回合。
- Background asset warming is limited to the current party in the hall. Each battle preloads only its selected allies and encounter enemies; all other art remains lazy-loaded. Every explicit detached `Image` preload uses eager loading; assigning `loading="lazy"` to a detached preloader can suppress the request, time out valid portraits, and incorrectly poison the session failure cache.
- Battle setup must consume the preload failure list. Failed portraits render a labeled fallback instead of a broken media element, failed battle illustrations use their canonical fallback where available, and the battle HUD keeps a visible explicit retry action until every failed asset loads or the player leaves the battle. Asset retry owns an in-flight key scoped to its captured battle object, never blocks card or turn actions or a replacement battle's retry, and must stop all progress, mutation, and rerender callbacks after the runtime state or battle object is replaced.
- Battle victory CSS is deferred with the core battle scene instead of loading at startup. Special Nonoka, Manny, Bertis, Lokar, and Besta skin CSS is selected from the pending party, restored battle units, test configuration, or an explicit in-battle skin change. A style failure must abort that scene/change without committing a partially styled skin and remain explicitly retryable.
- Publish media keeps `publish/assets` below 40 MiB, long audio below 21 MiB total, every published file below 2 MiB, and the one BGM selected by any scene below 1.75 MiB. Long BGM uses 48 kbps AAC-LC in `.m4a`; short impact samples may remain MP3. BGM stays lazy through `Audio.preload = "none"` and battle startup primes only the final selected encounter track. Any future large asset addition must pass these budgets instead of consuming emergency headroom.

### Character And Enemy Skill Contracts

- 角色与怪物技能的完整名称、类型、图标、公开描述和衍生技能以角色/敌人数据源为准；运行时技能模块实现这些公开设定，`game-settings.md`记录跨模块展示与交互契约。新增或修改技能时必须同步数据、运行时和本节契约，不能只改其中一处。
- 当前正式内容包括26名可玩角色、71项角色技能、27类敌人、54项敌人技能和30件正式饰品；30件饰品均须保留独立运行契约，其中3件为主动饰品、1件为触发饰品。增删内容时必须同步更新数据总数和技能展示契约。
- 所有我方角色主动技能必须只匹配一个规范主动技能身份，并由当前战斗中仍存活、持有同名且携带对应规范技能牌的当前行动角色发动；同时携带多个主动技能标记的混合伪造牌、只有同名但缺失规范技能牌的损坏技能对象、没有当前行动权的角色都直接拒绝。准备阶段技能只接受其准备窗口，出牌阶段技能只接受出牌阶段。自用技能只接受发动者本人，敌方目标、任意其他角色、其他友方、友方男性和友方女性目标分别按技能公开描述校验，倒下或不属于当前战斗的目标一律拒绝。需要单张费用或多张费用的技能必须确认所选实体手牌仍存在、可见且满足花色/牌型要求。任一角色、技能所有权、行动权、阶段、目标、次数、资源或费用校验失败，都必须在公共出牌区、战斗日志、出牌计数、手牌移动、使用标记和派生效果之前返回失败。上述统一契约由`src/original/character-skill-access.js`、`battle-card-playability.js`与`battle-combat.js`共同负责。
- 受限手牌费用必须在同一共享规则下同时约束手牌禁用态、点击/拖拽选择和最终结算，不得只在发动末端报错。当前规则为：【偶像之吻】仅可选`♥`牌，【疯狂射击】仅可选`♥/♦`红牌，【战场指挥官】仅可选【杀】或战术牌，【鬼王扑克】仅可选非战术牌，【军令状】首张必须为标准花色且第二张必须与其花色完全相同；已选的【军令状】费用牌仍可点击取消。非法候选不得改写已选索引、待定目标或多选列表，脚本调用和旧状态仍须在最终结算再次拒绝。
- 曼妮军火库衍生的`巴特雷`属于角色衍生技能，来源固定为`derived`，不得伪装成饰品技能或进入饰品主动技选择链。诺诺卡的`新月之歌`固定为被动技能，角色主动技可用性与AI不得保留不存在的`newMoonSong`主动牌分支。
- 索尼娅与凋零者的`杀欲窥视`为主动技且每回合限一次；指定一名敌方角色后，直接复制其每张可见【杀】为同名同花色的临时消耗牌，不打开或排队任何展示手牌界面。复制牌保留`generatedBySkill`来源且不消耗杀意。首次执行后，可用性层、AI与执行器都必须读取`usedWithererPeek`并拒绝同回合再次发动，重复调用不得再次生成临时【杀】。
- 技能图标按已确认语义保持：普通主动技`⚔️`、自动锁定技默认`⭐`、可选触发/响应技可使用`🔵`、限定技`🔺`、觉醒/使命技`💰`、转换技`🔄`。已记录的专用图标优先，例如榨取精华固定为`🔵`；不能仅根据`type`字段批量覆盖这些例外。
- 芙萝娅的`神速之翼`、`神速飞剑`，卡迪西斯的`重火力支援`，娜娜莉的`复仇之刃`，拉芙的`鬼牌狂欢`，莫娜的`剑盾反攻`均为自动锁定技，固定使用`⭐`。机器魅魔的`爱之鞭挞`由准备阶段自动执行，数据类型固定为`passive`并使用`⭐`，不得显示为可主动发动的`⚔️`技能。
- 卡迪西斯的`战场指挥官`记录【杀】或战术牌牌名；其他友方角色使用同名【杀】或战术牌时，该牌不可被响应且其造成的每次伤害翻倍。公开技能与技能牌描述必须同时覆盖这两类牌，不能继续只写同名【杀】。
- 卡迪西斯的`重火力支援`只由其使用实体【杀】触发，对所有存活敌人造成等同于其攻击力的无视护甲伤害。该附加伤害继承触发【杀】的毒、雷、火、圣、暗、冰等伤害属性及物理/魔法类别，用于伤害反馈和对应防御判定；不重复附加原【杀】的中毒、感电、圣痕等后续状态效果。
- 拉芙的`鬼牌狂欢`必须在判定动画结束后保存该次实际标准花色，并在她的战场头像与行动区头像上同步显示对应`♥/♦/♠/♣`圆形徽记；判定动画播放期间不得提前显示新花色。红色花色与黑色花色使用不同牌面配色，悬停提示同时说明当前大鬼牌或小鬼牌模式。后续判定在动画结束时替换旧花色，不得因同屏重绘丢失。
- 杰洛特的`爆头一击`适用于实体、虚拟、转换、单体与群体【杀】。每张【杀】在首次未被【闪】抵消且即将造成伤害时只进行一次判定；若该【杀】与判定牌颜色相同，该【杀】本次造成的伤害固定变为2倍，群体与多段结算沿用同一次判定结果。
- 所有公开描述为“视为使用/打出”或“当作/转化为”另一张牌的技能牌流程，必须保留`virtual`或`convertedFrom`来源，并在公共出牌区分别显示`虚拟`或`转换`。二者不得显示为技能牌。仅用于伤害属性、范围或触发矩阵的内部结算载体不额外生成公共牌；真实主动技能牌和敌方主动技能才显示`技能`。
- 同一牌流程只能有一个来源分类：没有实体来源的“视为”牌使用`virtual`，由单张实体牌转化的牌使用`convertedFrom`，不得同时设置两者。疯狂射击属于实体红牌转换；军令状消耗两张同花色牌后生成的【魔王军入侵】按既有规则属于带军令状来源的虚拟牌。
- `神速之翼`将被弃置的实体手牌当【闪】使用；`暴走与极速`的极速模式将黑色实体牌当【闪】或【看破】使用；两者在自动与手动响应流程中都必须显示`转换`并保留原实体牌名，原牌仍按正常响应规则进入弃牌堆或消耗牌堆。神速之翼连续响应连击时，手牌数必须随每张响应牌的飞牌逐次减少，不得在第一张动画开始前提前跳到最终数量。凯丽的`突破重围`遵循同一实体来源规则。
- 贝丝妲的`终焉鬼影斩`逐张将黑色实体手牌当【魔杀】使用，每张公共牌均显示`转换`、保留对应原牌名并显示指向实际随机目标的目标线，不得显示为`虚拟`【魔杀】。
- 拉芙的`控神魔眼`必须先由被强制行动的最高攻击力角色向另一名角色展示一张虚拟【与我一战】，公共出牌区显示`虚拟`并绘制双方目标线，再结算双方依次打出的实体【杀（普攻）】。
- 技能生成、转换或在结算前改为全体目标的牌，必须携带完整范围字段，并从行动者战场立绘显示指向全部存活目标的目标线；虚拟/转换来源不得成为省略公共出牌区或目标线的理由。
- 目标线颜色只由实际行动者阵营决定：我方角色出手固定使用普通白线，敌方角色出手固定使用红线，不能根据目标阵营、多选状态或牌的虚拟/转换来源推断。虚拟出牌事件未显式携带颜色时必须从行动者`uid`回查阵营；控神魔眼等强制我方角色互相出牌的流程仍使用普通白线。
- 正式卡牌固定分为杀牌（`slash`）、响应牌（`response`）、战术牌（`tactic`）、消耗牌（`consume`）、障碍牌（`obstacle`）五种牌型；牌型与作用范围相互独立。作用范围固定区分单体与全体，`targetless`仅可作为无需手选目标的操作标记，不能据此把全体杀牌判定为非杀牌。障碍牌不是战术牌，不能被【看破】响应。
- 正式卡牌图鉴当前固定为42张。【束缚陷阱】与【封印术】均为初始商店牌和普通可重复掉落牌，价格均为1500莉莉丝元；前者花色为`♥×1 ♦×1`并生成【眩晕】，后者花色为`♣×1 ♠×1`并生成【封魔】。两张障碍牌的公开描述必须同时写明所生成状态牌的虚无属性、判定阶段、成功颜色与阶段限制，以及状态牌在持有者回合结束后的消耗时机；描述中的消耗对象必须明确为生成的状态牌。未打出的障碍牌继续留在持有者手牌中，不会在回合结束时自动消耗。
- 【灵魂锁链】的实体牌每次使用只显示1张公开牌和1次飞牌；双目标线由该实体牌自身展示，不得再生成同名虚拟牌。锁魂传导保留原伤害的属性和物理/魔法攻击类别，并继续使用既有护甲与受伤修正规则；传导伤害不重复附加原【杀】的中毒、感电或圣痕等后续状态，也不得再次触发锁魂传导。
- 同一角色最多持有每种状态牌各1张，不同类型状态牌可同时存在；当前规范状态类型包括【眩晕】【封魔】【粘液】。只有规范状态牌本体参与状态身份、唯一性与移除规则，带`statusKey`的【束缚陷阱】【封印术】仍是障碍牌而不是状态牌。任何生成、给予、转移或旧状态修复路径若形成同类重复，只保留1张并将多余状态牌送入消耗牌堆。
- 【眩晕】与【封魔】均具有虚无属性并在持有者的判定阶段逐张判定。【眩晕】判定为黑色时跳过本回合出牌阶段；【封魔】判定为红色时跳过摸牌阶段，并禁止该角色在本回合通过卡牌、技能或其他效果摸牌，包括【战争号角】等从牌堆定向获得牌的效果。封魔期间任何摸牌入口都不得改变牌堆、手牌或摸牌动画队列；相关战报必须按实际摸牌数记录，明确显示封魔阻断，群体摸牌需分别反映正常与被封魔角色。封魔锁覆盖完整结束阶段，在本回合全部结束阶段效果和交互完成后解除；不得继续阻止该角色在其他角色后续回合中获得摸牌。两者在持有者回合结束时进入消耗牌堆。
- 所有`elite`与`boss`敌人在战斗初始化时自动获得可见专属触发技【霸王色抗性】，未来新增的精英与BOSS同样由类型统一注入。该技能在准备阶段自动触发；若自身持有任意状态牌且另有至少2张可见手牌，必须先弃置其中2张其他手牌，再消耗并移除1张状态牌，随后继续后续准备流程；其他手牌不足2张时不得移除状态牌，该状态牌照常进入判定阶段。
- 【机枪扫杀】固定属于全体杀牌。描述为一般“【杀】”的效果同时覆盖单体杀与全体杀；只有明确写“单体【杀】”的效果才排除全体杀。
- 贝丝妲魔偶的`锁魂镰刀`仅在她使用单体【杀】造成生命值伤害后触发；实体、虚拟和转换单体杀均可触发，全体杀与无目标杀不能触发。
- 全体杀必须按每名实际目标分别触发“成为【杀】的目标”与“使用【杀】指定目标”类效果，不得对结算用的使用者自身占位目标触发。铁甲红怒对全体杀逐目标分别判定：铁甲黑色判定的防伤与无需出闪只绑定对应牛头怪目标，红怒红色判定产生的不可出闪效果只绑定对应目标，任一目标的判定结果不得泄漏到其他目标。
- 杀牌技能判定固定使用独立的“牌型×范围×来源”规则矩阵：一般`【杀】`覆盖单体、全体、实体、虚拟和转换杀；`单体【杀】`只限制目标范围，仍覆盖实体、虚拟和转换单体杀；`全体【杀】`只限制目标范围，仍覆盖实体、虚拟和转换全体杀。只有文案明确写出`实体`或`非虚拟`时才限制牌的来源。
- `sweep`、`allTargets`或`aoeLineShown`表示全体范围；单独带有`targetless`且没有全体标记的杀牌不属于单体杀。技能的实际效果若只能处理一个目标，文案和运行时必须明确使用`单体【杀】`；未写`单体`的通用杀牌效果必须同时覆盖单体杀与全体杀。
- 诺诺卡的`新月之歌` must let the player select the exact X visible hand cards to give. A teammate cannot be selected until exactly X valid cards are chosen; cancelling the transfer remains allowed.
- 诺诺卡的每回合摸牌数固定为基础`2`加角色加成`2`，初始摸牌数固定为基础`4`加角色加成`1`。
- 艾伦格的`计算下注` resets intent to the current intent maximum, including temporary maximum bonuses. `战斗演练` moves the resolved original card if another effect returned it to hand before the transfer choice; it must never duplicate that card.
- 艾斯的`急逃` is limited once per global character turn, not once per 艾斯 turn. It may trigger again when the next unit's turn begins.
- 魔王军魔兽部队的`快速装弹` does not make the full-target Slash that first triggers it free. Only later same-suit Slashes during that turn consume no intent.
- `索敌雷达` doubles every damage instance of a matching-suit multi-hit Slash while logging the lock trigger once for that card.
- 机甲牛头怪攻击力固定为4；`铁甲红怒`的防守判定为黑色时不再获得护甲，而是防止该【杀】对机甲牛头怪造成的全部伤害，且机甲牛头怪无需为这次已被防止的伤害使用【闪】；其进攻判定仍以红色为成功，成功时目标不能打出【闪】抵消该【杀】。
- 机械哥布林与骷髅巡逻机攻击力固定为3；机器魅魔攻击力固定为3、魔力固定为4；机甲牛头怪攻击力固定为4。机械工厂保持新手副本的低速度和低输出定位，但恢复技能感知耐久并随更高角色速度成长上调先手值；再生、伤害翻倍、连斩、防御系统等技能按实际效果分配个体面板，不设置多段、连锁、群攻或高难首回合爆发上限。
- 机器魅魔的`爱之鞭挞`在准备阶段从存活敌方角色中随机指定一名目标；玩家可见技能描述只写规则，不披露内部AI选目标逻辑。
- `魔弹特攻`要求我方目标展示手牌时属于强制选择流程；关闭按钮、右键背景和空选择均不得取消提示或跳过后续结算。
- 所有`拼花`统一为双方各亮出自己摸牌堆顶1张牌比较标准花色，亮出的牌分别置入各自弃牌堆；不得再从手牌选择、弃置或消耗拼花牌。摸牌堆为空时先按既有规则随机洗回弃牌堆，再亮出牌堆顶牌；不得按弃牌堆原顺序直接移回而产生固定结果。
- `爱之鞭挞`等拼花结果弹窗必须显示在技能标题之上，且战斗锁定时不得被压暗。
- 战斗单位节点本身不使用浏览器原生`title`属性；战场立绘与行动区立绘使用和测试战斗角色立绘一致的原生技能说明浮字，内容读取角色技能摘要，不渲染额外自绘悬停面板。角色详情继续通过点击面板查看。
- 角色与怪物按实战功能统一分为`输出`、`控制`、`辅助/续航`、`防御/嘲讽`、`成长/资源`五类，每个单位只保留一项主定位。战场姓名不显示定位；点击战斗头像打开角色详情后，在详情名字右侧显示完整主定位，技能按钮的原生悬停浮字同步显示该定位。旧战斗存档即使保存了多项定位，也优先按角色或怪物规范ID回查当前单一主定位；未知单位最多显示其首项定位。
- 顶栏莉莉丝元显示名为`据点余额`；副本探索期间仍显示当前可消费的据点数值，并在旁边同步显示本次探索的`待结算 +N`金币与精华宝珠。副本顶部累计收入显示名为`本次探索待结算`，通关或撤退执行入账后才并入据点余额。
- 副本节点结算成功后必须校验真实奖励载荷，并可从当前副本奖励收据账本或待结算资源增量恢复兼容返回；不得在奖励字段缺失或异常时静默显示莉莉丝元0、精华宝珠0。无法确认真实奖励时暂停节点完成并显示可重试错误。
- 角色最大生命值只按各自成长配置自动提升，不再存在生命值加点或通用固定换算。
- Generic single-target Slash effects that accept virtual Slashes include 洛基`智障力大`, 卡洛斯`疯狂刺刀`, 芙萝娅`神速飞剑`, 曼妮`巴特雷`/`反坦克炮`/`聚焦喷火器`, 狂鲨海盗团船员`穿透锚枪`, 狂鲨海盗团掠夺者`冲锋掠夺`, 莫迪奥`粉碎破坏者`, and 莫娜`圣剑无双`/`圣天破军剑`.
- Skills explicitly written as entity or non-virtual, including 曼妮`刺刀AK47`, 莫娜`剑盾反攻`, and other `实体单体【杀】` effects, continue to reject virtual Slashes.
### 战斗技能特效定位

- 战斗技能特效需要锚定角色行动区时，统一使用`src/original/battle-effect-anchors.js`，不得在具体技能里重复手写行动区选择器和坐标计算。
- 自身强化、蓄力、变身、核心充能等以行动角色本人为主体的特效使用`action-first`：优先定位右下角色行动区的当前立绘，行动区不存在、角色并非当前行动者或尺寸无效时回退到战场单位立绘。
- 目标受击、治疗、束缚、裂痕与状态附着仍定位目标的战场单位立绘；从行动者发射到目标的飞行、光束和拖尾可使用行动区起点与战场目标终点。
- 特效节点应挂到`document.body`并使用锚点测得的视口坐标，避免被行动区`overflow: hidden`裁切。持续特效在重绘、全屏切换或视口尺寸变化后必须重新同步定位。
- 专属皮肤以行动者本人为主体的瞬时技能特效在行动区显示时，必须同时复制到该角色的战场头像；目标受击层和行动者到目标的连线仍保持各自单一锚点。
- `battlefield`、`action`、`action-first`和`battlefield-first`是固定定位模式；新增技能优先复用这些模式，不为单个技能建立另一套位置规则。
- 专属皮肤的立绘 class、技能特效控制器和胜利演出统一以当前实际装备皮肤为准；战斗单位上缓存的`skinDynamicEffect`只作缺少装备状态时的兼容回退。战斗内切换到默认皮肤必须立即停用专属效果，重新切回专属皮肤后入场与常驻效果可以重新同步，不能因旧的已播放标记永久失效。
- 专属皮肤立绘 class 上的绝对定位装饰必须以立绘容器自身为定位上下文；战场、行动区和胜利结算中的装饰均不得越出角色画面覆盖技能、按钮或结算数据。
- 测试战斗存档配置只保留当前正式角色、有效怪物索引、正式卡牌、正式饰品、匹配角色的有效皮肤和当前角色名下的测试装备；删除内容后加载旧存档必须清理对应测试项并请求回写。

### 温蒂皮肤：慈爱教师

- 皮肤 ID：`wendy_benevolent_teacher`；品质固定为史诗，兑换价格固定为10精华宝珠，仅属于温蒂；`wendy_default`保留原立绘并允许随时切回。默认立绘使用正式压缩素材`publish/assets/images/wendy-portrait.f262b034.webp`；慈爱教师素材固定为`publish/assets/generated/wendy-benevolent-teacher-desert-school.bcfc0372.webp`，专属动态特效标识固定为`wendy-teacher`。
- 等级特殊立绘 ID：`wendy_level_10_special`；品质固定为特殊，价格为0，`unlockLevel`固定为10，使用正式压缩素材`publish/assets/generated/wendy-level-10-special.8b3d47ab.webp`。达到Lv.10后自动加入已拥有皮肤并允许装备、放大查看和作为正式战斗立绘；测试战斗不得无视等级和拥有状态试用，未解锁时显示等级锁定占位。
- 形象固定为与默认立绘一致的成年恶魔教师：深翠绿色长发向发梢渐变为鲜明黄绿色，金黄色眼眸佩戴金丝圆框眼镜；保留黑色金尖弯角、尖耳、收束在身后的黑色金棕翼膜蝠翼与黑色心形尾刺。服装固定为深翠绿色金边教师西装、扣合的米白衬衫、同色及膝裙、深色丝袜与黑色低跟鞋，胸前佩戴金色学院徽章。
- 左臂固定托举深棕皮革魔法教案，书脊嵌有发光魔力书签；右手引导金色战术字符和抽象魔法图。背景固定为沙漠边缘学校庭院，包含砂岩教学楼、遮阳连廊、教学黑板和远处沙丘。不得改成棕发、紫瞳、红角红尾、学生制服、少女体型、无角无尾、无教案、展开攻击姿态蝠翼、哥特城堡或普通现代教室。
- 出场演出显示漂浮黑板展开、粉笔公式自动写入并裂开，温蒂从金光中现身，魔力书签飞出后归入教案；待机显示推眼镜、翻阅批改、金色字符与黑板弱点笔记更新。常驻光环与书签保持静态装饰，待机动作由控制器周期性播放的有界批改特效承担，不对立绘、光环或阴影装饰执行无限逐帧动画。
- `飘浮掩体`将本次弃牌表现为被金色字符包裹的灰白石板，并在所有友方立绘前形成带真实护甲增量数字的屏障；芙萝娅仍按当前技能规则显示双倍护甲，卡迪西斯在队伍中时获得更大的加固石板视觉但不改变数值。
- `读书的智慧`显示教案自动翻页、战术魔法阵与金色字符凝成新牌，并在眼镜位置闪过书页反光。
- `解答迷惑`显示高举教案、巨大金色魔法阵与环形战术牌虚影；将临时牌交给其他角色时显示学识符文丝带，交给卡迪西斯或芙萝娅时丝带表现增强。
- 胜利结算显示温蒂合上教案、黑板浮现“下课”、书签归位，并在教案总结区显示本次实际伤害、由该技能累计授予的护甲和由`读书的智慧`累计摸到的牌数。与其他专属皮肤同队时，仍只展示实际贡献排名最高者的一套专属胜利画面和音效。

### 罗卡尔皮肤：恋母勇者

- 皮肤 ID：`lokar_motherbound`；正式素材固定为`publish/assets/generated/lokar-motherbound-refined-bg.235e8f11.webp`，专属动态特效标识固定为`lokar-motherbound`。
- 形象固定为成年男性恶魔战士：凌乱银白短发、红色眼睛、黑红弯角、宽大的黑红破损蝠翼；穿黑色皮革战斗长衣、束带长裤、手套和长靴，胸前佩戴红色晶石。
- 武器固定为黑红魔纹双手大剑，剑身与护手带红色能量纹路；背景固定为红光照明的黑暗哥特工业要塞。不得改成少年体型、无角无翼、浅色圣骑士、现代便装或无剑形象。
- 专属技能特效保持现有规则：战斗之勇使用深红气焰、摸牌飞行和恢复杀意时的金色粒子红眼反馈；热血契约显示燃烧手牌、贝丝妲轮廓持剑虚影和本回合攻击红色拖尾；狂风绝息斩显示杀牌剑刃风暴、冲击波、暗紫命中、落地裂痕与击倒后的残留紫色电弧。

### 贝丝妲魔偶皮肤：机铠魔偶

- 皮肤 ID：`besta_doll_energy_queen`；正式立绘固定为`publish/assets/generated/besta-doll-fullbody-heels-bg.56c37ce5.webp`，大破立绘固定为`publish/assets/generated/besta-doll-critical-damage.99e0ac86.webp`，专属动态特效标识固定为`besta-mecha`。
- 形象必须保持小型女性机械魔偶身份：银白齐颈短发、红色眼睛、黑红小角、机械耳部组件；全身为黑亮金属机体与红色能量节点，胸口具有醒目的红色心形核心。
- 背部固定为黑红机械蝠翼，腰后保留分节机械尾巴；武器固定为高于角色的大型黑红机械镰刀，脚部固定为黑红机械高跟长靴，背景固定为红光机械工厂。不得改成人类肉身、普通女仆装、无翼无尾、平底鞋或小型手持武器。
- 仅装备该皮肤时，发动`榨取精华`后，在本回合物理攻击牌转为魔法攻击的持续状态内，战场与行动区立绘统一切换为大破立绘；该状态于回合结束清除后恢复正常立绘。大破立绘不再由生命值阈值触发，也不播放6秒或其他全屏大图演出；既有榨取精华能量触须、核心充能、武器光晕和持续状态特效全部保留。
- 专属技能特效保持现有规则：追魂之刃显示核心闪光、虚拟杀与锁链束缚；锁魂镰刀显示玫红魔力镰刀、环形横扫和目标裂痕；榨取精华显示能量触须、核心充能和武器光晕，并对非罗卡尔男性使用更深紫红和更强束缚表现。

### 诺诺卡皮肤：偶像明日星

- 皮肤 ID：`nonoka_idol_rising_star`；品质固定为史诗，兑换价格固定为10精华宝珠，仅属于诺诺卡；`nonoka_default`保留原立绘并允许随时切回。
- 正式压缩素材固定为`publish/assets/generated/nonoka-idol-rising-star-star-eyes.97cc2566.webp`，专属动态特效标识固定为`nonoka-idol`。
- 立绘必须以诺诺卡原立绘为身份基准，保留金色长发、带明亮白色五角星瞳光的蓝眼、粉色恶魔角翼与尾巴、粉色耳机，以及带白色星纹和连接线的粉色电吉他；偶像服使用星蓝与洋红舞台配色，背景固定为暗黑幻想演出舞台。不得改成白发、双马尾、麦克风支架或无吉他的形象。
- 装备该皮肤进入战斗时播放聚光灯旋转登场与星蓝光波；战斗待机保留静态星光与手环三色识别层，动态反馈集中在登场、技能和胜利演出，不持续重绘立绘或光环。
- `新月之歌`首次记录花色时播放对应颜色音符：红桃粉红、方块金色、黑桃深蓝、梅花绿色；音符在复杂立绘上必须保留深色衬底、描边或等效对比处理，不能与背景混为一体。
- `模仿之音`发动时显示目标角色虚影融入诺诺卡，并短暂显示目标色调的眼部闪光。
- `偶像之吻`发动时从诺诺卡向目标飞出粉红爱心，命中后爆成星芒并播放清脆亲吻音。
- 胜利结算时显示诺诺卡舞台聚光、飞吻与多色烟花专属演出；这些效果只在该皮肤实际装备时触发。

### 曼妮皮肤：枪之魅魔

- 皮肤 ID：`manny_gun_succubus`；品质固定为史诗，兑换价格固定为12精华宝珠，仅属于曼妮；`manny_default`保留原立绘并允许随时切回。正式压缩素材固定为`publish/assets/generated/manny-gun-succubus-weapon-skeleton.3696a917.webp`，专属动态特效标识固定为`manny-gun`。
- 曼妮等级特殊立绘 ID 固定为`manny_level_10_special`，素材固定为`publish/assets/generated/manny-level-10-special.a8c2eeed.webp`。达到`Lv.10`后按统一等级特殊立绘机制自动解锁；其与“枪之魅魔”的购买、装备和专属特效互相独立。
- 形象固定为成年枪械魅魔，整体保持左右不对称：黑色短发与黑红恶魔角，左眼为蓝色，右眼被红色瞄准镜替代；左半身保留黑色紧身战斗服、完整蝠翼和心形尾刺，左臂缠绕从手腕延伸至肩膀的弹链。
- 右半边身体必须由手枪、步枪、霰弹枪、重型枪管与机匣层叠为庞大枪械骨架，从右腿、躯干和右臂延伸至右脸，并在肩背汇聚为枪管组成的残破机械羽翼；弹链与弹壳链像机械肋骨和触须般垂落。头顶不再设置漂浮枪械光环，腰部不再设置圆形弹药仓或固定传送门装置；移动伴随硝烟拖尾、弹壳和机械装填表现。
- 不得改成对称机械装甲、双眼正常、双侧机械翼、无弹链、无心形尾刺、无瞄准镜眼、漂浮枪械光环、腰部圆形弹药装置或普通持枪人类。枪械不得使用现实品牌标识。
- 战斗待机装饰不得在立绘外额外绘制常驻扇形红色枪管条纹；立绘未加载时，皮肤容器只可保留不暴露武器轮廓的烟雾或光晕，不得出现伪造的红条武器层。
- 出场演出固定为右半身枪械骨架在硝烟中逐节展开并交织开火，随后回收至身体右侧，并将弹壳捏碎为黑色粒子；战斗待机保留静态枪械骨架与硝烟识别层，机械伸缩、弹匣回装和瞄准反馈只在有界技能演出中出现。
- `次元转移`使用枪管围成的成对临时传送门转移【杀】，关闭时枪管统一退膛并洒落弹壳；`次元军火库`扩张右半身枪械骨架并展示枪械虚影，随后按刺刀AK47、巴特雷、反坦克炮、聚焦喷火器切换为突击步枪、巨型狙击枪、重炮或橙红喷火器主题，四种形态必须具有可直接辨认且彼此不同的武器轮廓，不能只用同一枪管扇形换色。
- `刺刀AK47`显示红色曳光弹、额外攻击的密集弹幕和受伤后由右肩枪械阵列自动转向的反击枪火；`巴特雷`显示瞄准镜红色判定激光、全枪锁定、巨型狙击枪虚影、慢动作弹头和暗红冲击云。
- `反坦克炮`显示重型穿甲炮弹；施加刺弹时目标显示红色闪烁标记，爆炸时必须从被标记者体内向其同阵营角色放射红色光束。`聚焦喷火器`将右臂枪械切为喷火模式，火焰覆盖全部敌方目标，并显示灼烧纹理、二次伤害爆燃与短暂地面余火。
- 胜利演出固定为右半身枪械骨架朝天齐射并产生连续后坐，脚边堆积弹壳，随后所有外伸枪管逐节收回身体右侧。所有专属演出只在该皮肤实际装备时触发。
- 同一队伍同时装备“偶像明日星”和“枪之魅魔”时，胜利结算只展示实际贡献排名更高者的专属画面并播放对应音效，避免两套演出与音效重叠。

### 贝尔蒂丝皮肤：傲慢女王

- 皮肤 ID：`bertis_arrogant_queen`；品质固定为史诗，兑换价格固定为10精华宝珠，仅属于贝尔蒂丝；`bertis_default`保留原立绘并允许随时切回。正式素材固定为`publish/assets/generated/bertis-arrogant-queen-mist-gothic.cd523966.webp`，大破立绘固定为`publish/assets/generated/bertis-arrogant-queen-critical-damage.e0a10370.webp`，专属动态特效标识固定为`bertis-queen`。
- 形象必须保留银白色双马尾、红色眼睛与恶魔角、黑色蝠翼和心形尾刺；表情固定为眯眼、抬起下巴、露出一颗小虎牙的成年恶魔女王式得意挑衅笑容。服装固定为黑紫蔷薇哥特长裙、深红缎带与荆棘心脏胸针，脚穿带银色脚踝铃铛的黑色厚底玛丽珍鞋，武器固定为黑色荆棘皮鞭。
- 背景固定为黑紫蔷薇环绕的暗色荆棘王座场景。不得改成黑发、无角无翼、无尾、无鞭、普通现代服装或纯色无场景立绘。
- 仅装备该皮肤时，`傲慢雌小鬼`增益失效后，战场与行动区立绘统一切换为大破立绘；角色恢复满生命并重新获得该增益时恢复正常立绘。战斗数值状态在伤害或治疗结算时立即更新，但立绘、皇冠光环和专属切换反馈必须跟随该次`visualHp`伤害/治疗动画提交，群体攻击尚未播放到贝尔蒂丝时不得提前换图。大破立绘不再按50%生命值阈值触发，也不播放6秒或其他全屏大图演出。
- 出场演出显示黑紫蕾丝蔷薇环、荆棘座椅碎裂与响鞭；战斗待机以静态蔷薇光环、王冠和立绘轮廓保持身份，受到生命值伤害时显示有界鼓脸怒意反馈。
- `傲慢雌小鬼`满血增益显示歪戴的黑金小王冠与持续暗紫蔷薇光环，受到伤害或增益结束后同步消失。
- `苦肉鞭笞`显示行动区至目标战场立绘的暗紫鞭弧、荆棘束缚和摸牌虚影；对杰洛特或诺诺卡发动时显示交叉X形双鞭痕。
- `快速生长`回合结束获得1枚粮食时显示幼苗成长为金色麦穗；角色死亡获得3枚粮食时显示荆棘蔷薇结出三颗暗红果实；`取粮`显示麦穗与果实化作两张卡牌飞向使用者。
- 胜利结算显示哥特屈膝礼、敲击歪戴皇冠、蔷薇花瓣与收鞭演出。与其他专属皮肤同队时，仍只展示实际贡献排名最高者的一套专属胜利画面和音效。

### 芙萝娅皮肤：音速刺客

- 默认皮肤 ID `flora_default`固定使用上传的方形素材`publish/assets/images/flora-portrait.71c5d516.webp`并允许随时切回。`flora_sonic_assassin`品质固定为史诗，兑换价格固定为10精华宝珠，仅属于芙萝娅；正式素材固定为`publish/assets/generated/flora-sonic-assassin.8543df2c.webp`，胜利素材固定为`publish/assets/generated/flora-sonic-assassin-victory.7ab2b6cd.webp`，专属动态特效标识固定为`flora-sonic`。
- 芙萝娅等级特殊立绘 ID 固定为`flora_level_10_special`，素材固定为`publish/assets/generated/flora-level-10-special.075896ea.webp`。达到`Lv.10`后按统一等级特殊立绘机制自动解锁；其与“音速刺客”的购买、装备和专属特效互相独立。
- 形象必须保留芙萝娅的成年绿色长发魅魔身份、向后弯曲的恶魔角、黑红蝠翼、心形尾刺和双匕首战斗轮廓。音速刺客造型固定为高马尾、荧光翠绿渐变发梢、紫色眼眸、深色半面罩、眼角绿色斜纹油彩与深墨绿色哑光夜行装；肩胛骨处固定延伸两道半透明绿色音波光刃，腕部和小腿护具刻有消音符文，双匕首使用无实体刀身的高频绿色声波刃口。
- 背景固定为月夜下的黑暗哥特工业战场，并以少量绿色残影提示高速移动轨迹。不得改成无角无翼、无尾、短发、无面罩、普通实体匕首、明亮日间环境或不具音波光刃的普通忍者形象。
- 出场演出显示绿色残影凝实、短暂信号干扰式消失重现、落地音波环和反握匕首划出的绿色声波弧；待机以静态低重心、声波刃和音场装饰保持身份，并约每6秒播放一次有界短距离横向瞬移残影。
- `神速之袭`显示原位音波环、冲向目标的绿色残影、目标身后的横斩声波和高频裂痕；击杀目标时追加后空翻回位与绿色卡牌虚影回收。
- `神速之翼`显示环形绿色音波屏障震碎杀牌、碎片向伤害来源反弹，以及芙萝娅的短距离横移残影。
- `神速飞剑`显示芙萝娅高速切入目标身侧、双匕首交叉形成X形绿色声波斩痕并瞬移回位。
- 胜利结算使用专用胜利素材显示双匕首绿色弧线、面罩解除后的浅笑姿态和挥砍、瞬移、后空翻、俯身冲刺四道残影；额外动态残影必须裁切在左侧角色画面内，不得覆盖结算数据。与其他专属皮肤同队时，仍只展示实际贡献排名最高者的一套专属胜利画面和音效。

### 艾尔拉娜皮肤：堕落医师

- 皮肤 ID：`elrana_fallen_physician`；品质固定为史诗，兑换价格固定为10精华宝珠，仅属于艾尔拉娜；`elrana_default`保留原立绘并允许随时切回。正式素材固定为`publish/assets/generated/elrana-fallen-physician.5fb5e43a.webp`，专属动态特效标识固定为`elrana-fallen-physician`。
- 艾尔拉娜等级特殊立绘 ID 固定为`elrana_level_10_special`；品质固定为特殊，价格为0，`unlockLevel`固定为10，使用正式压缩素材`publish/assets/generated/elrana-level-10-special.3a5bcd18.webp`。达到Lv.10后自动加入已拥有皮肤并允许装备、放大查看和作为正式战斗立绘；测试战斗不得无视等级和拥有状态试用，未解锁时显示等级锁定占位。该立绘与“堕落医师”的购买、装备和专属特效互相独立。
- 形象固定为成年艾尔拉娜的原身份延伸：银紫色长发盘成松散发髻、紫色眼睛、紫黑恶魔角、深紫蝠翼与心形尾巴；服装为白色医师短大褂、暗红腰带和黑色内层，手持大型注射器，身后固定有三枚绿色炼金培养罐。不得改成无角无翼、非艾尔拉娜发色、普通现代护士或缺少注射器与培养罐的形象。
- 出场演出显示培养罐升起、绿色炼金雾气和蛇杖式医疗符文；待机通过有界注射器、数据环与培养罐反馈体现身份，不执行持续逐帧重绘。
- `回春之手`显示绿色液流、暗红生命核心和目标治疗环；全体治疗时对所有存活友方显示同一套培养罐治疗反馈。`疗后护理`显示绿色十字、病历卡和飞向目标的红绿医疗丝线。
- `再生肉体`在结束阶段显示红色再生丝线与核心脉冲；生命值已满改为摸牌时显示培养罐牵引卡牌的抽牌反馈。以上效果只在实际装备该皮肤时触发，不改变治疗、摸牌或再生数值。
- 胜利结算使用艾尔拉娜当前皮肤立绘、左侧培养罐和跳动生命核心装饰，结算数据保持在右侧并置于装饰层之上；与其他专属皮肤同队时，只展示实际贡献排名最高者的一套专属胜利画面和音效。

## Update Protocol

When a setting changes:

1. Update the canonical gameplay/data source under `src/original/` and rebuild
   the published bundles when required.
2. Update any visible role positioning, skill text, tooltip, or battle line
   that describes the setting.
3. Replace superseded wording here with the current rule; do not append a
   development diary entry.
4. Follow `docs/original/qa-workflow.md`.
5. Run the publish path compliance check before saving.
6. Use the Game Studio git save endpoint after edits.
