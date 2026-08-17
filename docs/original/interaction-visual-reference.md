# Original Interaction, Visual, And Art Reference

## Authority And Scope

This document records the shipped HTML game's presentation and interaction
identity. It describes what the player sees, how controls respond, how layers
and scrolling behave, and which art or audio roles must remain recognizable.

- Runtime and data sources remain authoritative under `src/original/`; the
  executable release authority is the generated bundle set under `publish/`.
- Exact gameplay values and mechanical exceptions remain in
  `game-settings.md`.
- CSS and render modules remain authoritative when a visual detail is not
  described here.
- A future visual refresh must update the runtime and this document together.

## Product Presentation

`魅魔杀` is a dense desktop gothic card battler with villa management. The
presentation combines:

- a near-black gothic shell;
- crimson command surfaces;
- muted antique-gold borders and headings;
- pink, magenta, and violet magical highlights;
- full character and enemy art as primary identity;
- light physical card faces against the dark battlefield;
- compact operational layouts designed for repeated use, not marketing copy.

The player should always be able to identify the current place, available
resources, active character, legal action, and blocking modal without reading
an instruction page.

## Global Shell

### Viewport And Scrolling

- The primary baseline is `1280x720`.
- `html`, `body`, and `.game-shell` remain fitted to the current dynamic
  viewport with no document-level scrolling.
- The root uses safe-area padding and `100dvh` with a `100vh` fallback.
- Long content scrolls inside its owning panel: modal body, codex grid, shop,
  task list, dungeon map, battle hand, public card trail, battle log, or
  character detail.
- Same-stage battle picker rerenders preserve the picker option list's internal
  scroll position. Moving to a different picker stage starts that new list at
  its own initial position.
- Internal scroll areas use `min-height: 0` and contained overscroll. Header,
  bottom navigation, and scene chrome do not move with long content.
- Compact landscape windows reduce spacing and media dimensions without
  switching to a portrait or touch-only layout.

### Standard Hall Chrome

- The top bar is a three-part strip:
  - left: the large `魅魔杀` title plaque and the subtitle
    `魅魔卡牌战斗 · 据点经营`;
  - center: separate counters for 莉莉丝元, 精华宝珠, and 饰品;
  - right: build version and a circular settings button.
- The bottom navigation has three equal commands: `殿堂`, `客厅`, and `熔炉`.
  The active destination uses a crimson fill, gold border, and gold underline.
- Hall modal content sits between the fixed top and bottom chrome. Background
  controls become inert while a modal or global overlay is active.
- Dungeon and battle hide the bottom navigation. Battle also hides the top bar
  to maximize the combat surface.

### Title Mode

- Title mode removes the standard top and bottom chrome.
- The central emblem uses the villa heroine art inside an octagonal clipped
  frame, with the literal title `魅魔杀` over the lower darkened image.
- The primary commands are `新游戏`, `读档`, and `设置`. The credits command is
  isolated in the lower-right corner.
- The title background uses restrained framing lines, a dark vignette, the
  succubus card-back motif, and no separate explanatory panel.
- A storage boot failure replaces the normal commands with a readable error
  and explicit retry action.

## Visual System

### Core Palette

The canonical CSS variables are:

| Role | Value | Use |
| --- | --- | --- |
| Gothic crimson | `#a8193f` | active controls, command emphasis, battle focus |
| Bone text | `#e8dcc8` | normal foreground text |
| Antique gold | `#c9a764` | borders, headings, selected outlines |

Supporting colors are semantic rather than a single-hue palette:

- near-black backgrounds: `#08070a`, `#17131a`, `#260913`;
- bright selection pink: approximately `#ff5cab`;
- warm highlight gold: approximately `#ffd88d`;
- violet magic: purple card frames, skill glows, and magic damage;
- blue response and armor feedback;
- orange consumable and fire feedback;
- green success or available progression states;
- red danger, hp loss, retreat, and destructive confirmation states.

Do not recolor the complete UI into one purple, blue, beige, or red family.
Gold, crimson, violet, neutral black, and semantic combat colors must remain
visibly distinct.

### Surfaces And Geometry

- Standard buttons and repeated cards use restrained `4px` to `8px` radii.
- Large narrative, codex, info, and confirmation overlays may use `18px` to
  `32px` radii to distinguish them from operational cards.
- Main panels use dark translucent fills, one-pixel gold borders, inset crimson
  light, and deep black shadows.
- Hover increases border contrast and inner crimson light without changing
  layout.
- Active state uses crimson fill plus gold outline. Selection uses a brighter
  pink or gold outer glow.
- Disabled state lowers opacity, removes glow, often applies grayscale, and
  keeps the label readable.
- Destructive actions use deeper red, while neutral cancel/back actions use
  charcoal `ghost` styling.
- The succubus card back appears as a low-opacity decorative watermark in
  settings, confirmation, save, and modal surfaces.

### Typography And Information Hierarchy

- Runtime typography uses the system UI stack:
  `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, sans-serif.
- Hero title type is reserved for `魅魔杀`, major scene names, and victory.
- Modal and page headings use gold; normal copy uses bone; secondary copy uses
  muted gray-violet; warning and reward values use semantic accent colors.
- Dense cards keep names and stats compact. Long names use ellipsis rather than
  resizing surrounding controls.
- Letter spacing remains `0`. Vertical writing is reserved for the three
  character-info tabs.

### Motion

- Modal entry is a short fade and scale/slide, normally around `160-320ms`.
- Standard battle portraits remain static while idle. Dedicated skins retain
  their authored portrait, halo, field, smoke, and crown idle
  loops; active-unit identity still uses the existing crimson and gold outline
  and glow rather than changing those loops.
- Entry, skill, hit, status, and victory feedback may animate when it is
  bounded by the owning gameplay or presentation state.
- Hand selection lifts the changed card without moving surrounding cards.
- Existing selected cards remain stable across rerenders; only newly selected
  or deselected cards animate.
- Character, media, modal, battle-log, and timed caption animations preserve
  progress across same-screen rerenders.
- Reduced-motion preference disables repeating selection and response pulses
  where required.
- Gameplay settlement order never depends exclusively on animation support.

## Overlay And Input Contract

### Layer Priority

The expected close priority for `Escape` is:

1. art zoom;
2. confirmation or notice dialog;
3. save-slot confirmation or save panel;
4. character detail;
5. hall modal;
6. battle log;
7. settings;
8. credits.

The highest visible blocking layer receives input. Lower layers are marked
`inert`; visual dimming alone is not an input lock.

### Closing Behavior

- Every blocking panel has a visible close, cancel, back, or confirmation path.
- Credits close by the close button, outside click, or `Escape`.
- Update and bounty hall modals may close by clicking their backdrop.
- Dense management modals use their explicit close button to avoid accidental
  dismissal.
- Battle log closes through its close button, right-clicking the log panel, or
  `Escape`.
- Character art zoom closes from the overlay or close button; the image frame
  itself stops propagation.

### Pointer And Keyboard Behavior

- Controls use click or Pointer Events so mouse input remains primary and
  unified pointer behavior remains available.
- Interactive cards and portraits expose stable labels or ARIA names.
- Save slots support keyboard focus and activation.
- Credits move focus to the close button after opening.
- Targetable battle units preview on pointer enter and clear on pointer leave.
- Test-battle retreat remains directly clickable above battle prompts,
  dismissible dialogue, and hovered unit layers, and opens the explicit
  end-test confirmation without consuming the click as a background dismissal.
- Relics support both direct click and drag/drop:
  - click an empty slot to open the picker for that exact slot;
  - click an equipped slot to unequip immediately;
  - drag inventory relics to slots to equip;
  - drag equipped relics back to the pool to unequip.
- Hand and public-card horizontal scroll keep explicit arrow controls or native
  contained scrolling. Scroll arrows disappear when no overflow exists.
- Player-facing choices from a friendly character's concrete battle hand use
  the bottom hand area, temporarily switching its owner and disabling illegal
  cards in place. A central hand overlay is reserved for rules that explicitly
  require revealing or inspecting a target hand, such as friendly Theft or
  Dismantle. `杀欲窥视` copies matching Slashes directly and must not open that
  overlay or enqueue a reveal-cards presentation.
- `借刀杀人` always asks the player to choose the assisting ally's exact card:
  a single-target Slash when available, otherwise the card handed to the user.
- `组合进攻` selects the assisting ally before the enemy target, then confirms from the `使用` command or a second click on the selected enemy, and remains visible as the source tactic in the public card trail
  beside its two required virtual Slashes. Those Slashes use the `协攻` marker
  and source explanation instead of an unexplained generic `虚拟` marker.
- Cards generated into hand by `解答迷惑`, `狂战意志`, `杀欲窥视`, and
  `拷贝魔眼` keep one settled public source card after their consumed-pile burn
  animation. A transient play mirror and its resolved record merge into one
  logical card; follow-up virtual cards and response cards remain separate.

### Async And Failure Feedback

- A submitted async control becomes locked and changes to a task-specific busy
  label such as `出征中…`, `保存中…`, `同步中…`, or `重试中…`.
- Duplicate activation of the same action is rejected while unrelated current
  controls remain usable.
- Loading, empty, error, and retry states are visually distinct.
- Failed save, settings, settlement, or battle-media work leaves a persistent
  warning with an explicit retry command.
- An uncaught runtime exception or detached promise rejection opens a topmost
  blocking error dialog, reports a stable error code, and offers `返回重试`
  after transient busy controls and non-prompt locks have been recovered. The
  dialog is the last child of the global overlay stack, traps keyboard focus,
  prevents `Escape` from dismissing a lower settings/save/info layer, and
  restores focus to the exact prior control after `返回重试`, including when
  the first retry render itself fails and the boundary must remain open.
- Destructive or state-replacing actions use a confirmation overlay.
- Success is reflected in the changed screen state and status/log copy, not
  only by a transient toast.

## Screen Reference

The following table records the current screen families.

| Screen | Composition | Interaction And State |
| --- | --- | --- |
| Title Screen | Centered heroine emblem, literal title, three command buttons, isolated credits command | New game is primary; load and settings remain peers; first user action unlocks audio |
| Title Settings | Narrow centered settings panel over a blurred title | Save/load/fullscreen, retreat, two volume sliders, `1x/1.5x/2x` segmented speed, manual-response checkbox, return command; unavailable retreat is visibly disabled; the retired desktop ZIP download command is absent |
| Credits | Pink parchment-like centered panel with corner ornaments | Close button, backdrop close, `Escape`, and focused close control; content credits development, AI assistance, music sources, and generated character art |
| Villa Hall | Fixed top resource bar, left action rail, full-bleed villa heroine background, objective and primary expedition command, bottom nav | Rail opens relics/shop/deck/tasks/save; update notice sits top-right; active modal makes hall inert |
| Update Notice | Large dark scrollable modal with date, sections, and bullet lists | Internal vertical scrolling; explicit close and backdrop close; hall remains visible but blurred and blocked |
| Expedition Setup | Centered preparation modal with current party strip, roster/test commands, dungeon blocks, and difficulty cards | Party count is `1-4`; difficulty shows locked/recommended states; final command changes among locked, select party, confirm, and busy |
| Party Roster | Scrollable roster cards with portrait, role, skin action, and selected outline | Clicking a card toggles party membership; full party blocks unselected cards; at least one member remains; back returns to expedition |
| Shop | Six-stock card grid, resource/capacity tags, card text, prices, and delete-service section | Sold slots stay visible as sold; insufficient currency/capacity disables purchase; purchase and deletion use guarded async states and visible retry |
| Deck | Four-column dense card collection with type filters, suit inventory, counts, and codex command | Filters do not alter the stored deck; grouped cards preserve physical suit counts; internal modal scrolling retains surrounding shell |
| Card Codex | Same deck shell with codex mode selected | Shows discovery rather than physical ownership; unknown entries remain unavailable; card details and art use the canonical card renderer |
| Relic Inventory | Two-column party equipment layout with inventory summary and codex command | Each character has two direct-action slots; picker remains anchored to the opened character and preserves modal scroll position |
| Relic Codex | Topmost purple relic codex dialog with a four-column name grid and a fixed detail pane | Opens only from the hall relic inventory; the Living Room character-detail Relics tab contains equip controls but no second codex entry; grid and detail scroll independently; owned entries glow and unknown entries remain gray; focus is trapped and restored; `Escape`, backdrop, or close dismisses only the codex |
| Bounty Board | Large task list on the left and sticky accepted-task summary on the right | Acceptable, accepted, completed, blocked, and auto-settled states remain distinct; task actions are guarded and retryable |
| Save Slots | Centered save manager over a blurred game scene, automatic save summary, three manual slots | Loading/error/empty states are explicit; slot activation opens confirmation; processing blocks the panel; partial sync exposes repair/retry |
| Nursery | Full content page with heading band and a horizontal gallery of character art | Character cards are image-led; return and character-codex commands remain in the heading; long galleries scroll within the page |
| Character Codex | Purple codex page with title summary, character grid, right jump rail, centered skill detail | Locked characters use desaturated/silhouette treatment; hover or click reveals role/skill detail; selected detail does not obscure global navigation |
| Training | Full-page `别墅客厅`, explanatory heading, and unlocked-character growth cards | Cards show level, current experience, and the four growing core stats; opening a character shows level-0/current/level-15 values and preserves page scroll. The full position description appears on Attributes and is omitted from Skills. No upgrade, allocation, reset, or recommendation controls remain |
| Relic Furnace | Full page with heading, inventory count, return command, and relic dismantle list or empty message | Equipped relics are excluded; destructive dismantle uses confirmation and visible reward result; empty inventory remains readable |
| Dungeon Map | Full-width bottom-to-top route graph with header stats, retreat, inventory, nodes, connectors, and layer labels | Completed/current/open/blocked nodes are visually distinct; only legal next-layer nodes are clickable; pending settlement disables the map |
| Test Battle Setup | Centered setup modal with difficulty tabs and parallel ally/enemy selectors | Select `1-4` per side; locked allies remain marked; difficulty affects test enemies only; cards, skins, and relics use dedicated nested controls |
| Battle | Six-band battlefield: enemies, enemy piles, public trail, player piles, allies, hand/action area with active portrait | Cards, skills, targets, phase commands, retreat, log, settings, and horizontal hand scrolling remain simultaneously legible |
| Battle Character Info | Large three-column detail overlay with vertical tabs, stats/skills/skins content, and full portrait | Clicking battlefield or active portraits opens it; background battle is inert; portrait supports zoom; close restores battle focus and scroll |
| Battle Settings | Same settings panel as title over a blurred battle | Battle remains paused/blocked; save/load and preferences are available; retreat is enabled only when the current battle state permits it |
| Victory Settlement | Centered purple-gold settlement panel with victory summary, MVP strip, party ranking, metrics, and continuation command | Entry remains locked until settlement presentation is ready; clicking the ready panel or explicit command continues exactly once |

## Hall And Management Interaction Details

- Hall left-rail commands are operational, not decorative cards. Each combines a
  noun and a short purpose line.
- The first expedition objective is a bordered strip over the background art.
  The primary expedition button is the strongest hall command.
- Hall background art remains inspectable. Dark overlays protect text but do
  not hide the heroine's face, costume, throne, wings, or pose.
- Shop cards show suit, name, type, full effect text, and price in the same
  card. Sold inventory never silently disappears.
- Deck view groups physical cards by identity while showing actual suit
  composition and owned count.
- Codex views distinguish discovery from ownership and preserve unknown
  silhouettes or gray states.
- Bounty detail is sticky while the task list scrolls.
- Living room and nursery are page destinations rather than nested cards inside
  the hall hero.
- Save UI reports automatic-save metadata, party summary, resources, sync
  status, and key milestone behavior before presenting manual slots.

## Dungeon Presentation

- The route reads from bottom to top.
- Node icons use semantic line icons rather than emoji blocks:
  start, battle, elite, chest, rest, event, and boss.
- Connectors remain behind nodes and connect only adjacent layers.
- Current and available nodes use bright crimson/pink with gold borders.
  Completed nodes explicitly show `已完成`; future nodes are dimmed.
- Layer number and node type are visible in the node label.
- Header tags expose total layers, reward multiplier, pending gold, and essence.
- Retreat and inventory cleanup are always visually separate from route nodes.
- Reward and event overlays cover the map without changing its stored scroll or
  route position.

## Battle Presentation And Interaction

### Battlefield Composition

- Enemy units occupy the top row; allies occupy the lower battlefield row.
- Each unit shows portrait, name, hand count, action count, hp, armor, defense,
  and state badges without opening a detail panel. Combat-role labels do not
  compete with battlefield names.
- Clicking the active battle portrait opens the character detail panel. Its
  title shows one full primary combat-role label beside the name, and skill
  hover wording repeats that same role.
- The active unit uses a crimson/gold glow; selectable targets use a white lift
  and outline; enemy thinking uses a static violet glow and label.
- The center public zone contains round number and face-up action history.
- Enemy and player pile summaries show draw, discard, consume, total, hand, and
  wash counts in separate bands.
- The lower panel owns the real hand, phase prompt, main action command, skill
  column, and active-character portrait.

### Card Identity

- Card faces are `104x160` at the baseline and contain:
  suit, live name, illustration, type, effect summary, conversion/source label,
  and damage preview where relevant.
- The illustration is an asset layer. Suit, name, type, effect text, and damage
  remain live HTML and must never be baked into the bitmap.
- Red suits use warm ivory/pink faces; black suits use neutral ivory/gray faces.
- Type borders are fixed:
  - slash: red;
  - response: blue;
  - tactic: purple;
  - consume: orange;
  - status: gray;
  - suitless 狼牙杀: translucent silver.
- Hidden cards use the canonical succubus card back.
- Public history uses smaller complete face-up cards and explicit `虚拟`,
  `转换`, `拆解`, or `技能` identity where applicable.

### Selection And Targeting

- Clicking a playable card selects it and lifts it about `18px` with a pink and
  violet glow. Clicking again cancels selection.
- Disabled cards remain visible but desaturated and cannot lift.
- Targetable units preview on hover; selected targets retain a white outline.
- Confirming a targeted card shows the target line and starts card flight in
  the same interaction frame.
- Ally action lines are white; enemy action lines are red.
- Multi-target attacks draw one line to every living target.
- The relevant confirm, cancel, skip, or end-phase action occupies the enlarged
  hand command area. Forced prompts omit cancel when cancellation is illegal.

### Battle Overlays And Feedback

- Battle log is a right-side translucent drawer with numbered entries and
  contained scrolling.
- Settings is a centered blocking panel over a blurred battle.
- Character info is a large art-led overlay with `属性`, `技能`, `饰品`,
  `皮肤`, and character-specific `特殊立绘` tabs. A level-gated special
  illustration uses the art pane after unlock and shows its exact level
  requirement in the same pane before unlock.
- Manual response, clash, judgment, reveal, armory, target, sharing, and reward
  prompts preserve the battlefield context while blocking unrelated controls.
- Damage-interception prompts remain visually hidden while the incoming card,
  damage, draw, or floating-number effect is still finishing; the battlefield
  stays undimmed but noninteractive until the prompt and its controls appear
  together.
- Skill captions appear near screen center. Ally captions use violet light;
  enemy captions use red; relic captions use warm gold.
- Damage, hp loss, heal, armor, elemental attribute, and magic effects use
  separate visual and audio layers.
- A missing critical portrait or card image renders a labeled fallback and a
  persistent `重试素材` action rather than a broken media element.

## Art Asset Roles

### Primary Identity Art

- `publish/assets/generated/besta-villa-new.webp` is the title and villa hero
  image. Its white-haired red-eyed horned heroine, black-red gothic costume,
  throne, wings, and crimson lighting are first-viewport identity signals.
- `publish/assets/generated/succubus-card-back.cca22db5.webp` is the canonical
  hidden-card face and a low-opacity gothic watermark.
- Character and enemy portraits are sourced through canonical data and skin
  resolution. The repository currently contains:
  - 38 files under `publish/assets/images/`;
  - 15 files under `publish/assets/new-portraits/`;
  - generated skin and damaged-state art under
    `publish/assets/generated/`.
- Portrait crops prioritize face, silhouette, signature weapon, wings, horns,
  and costume markers. Full-body art must remain available in detail or zoom
  views when the source supports it.
- `publish/assets/generated/bertis-level-10-special.022dd113.webp` is Bertis's
  square level-10 special illustration. It appears in her character-detail
  special-art and skin views, uses the existing full-screen art zoom, and may
  be equipped as her battle portrait after unlock. Before unlock, battle skin
  switching uses the same level-lock placeholder as the skin shop and does not
  reveal the source image.
- `publish/assets/generated/nonoka-level-10-special.ba4c8ff8.webp` is Nonoka's
  compressed square level-10 stage illustration. It follows the same locked
  special-art, zoom, formal equipment, and battle skin-switch lock
  presentation; it is not available as a test-battle trial.
- `publish/assets/generated/manny-level-10-special.a8c2eeed.webp` and
  `publish/assets/generated/flora-level-10-special.075896ea.webp` are Manny
  and Flora's compressed square level-10 special illustrations. Before unlock,
  each special-art pane and battle skin switch shows the exact level gate
  without revealing the source image; after unlock, the art supports zoom and
  formal equipment. Their separate Gun Succubus and Sonic Assassin skins
  retain their own art, purchase rules, and dedicated effects.
- `publish/assets/generated/elrana-level-10-special.3a5bcd18.webp` is Elrana's
  compressed square level-10 special illustration. Before unlock, the
  special-art pane and battle skin switch show the exact level gate; after
  unlock it supports zoom, formal equipment, and battle use. The Fallen
  Physician epic skin remains independent.

### Card And Skill Art

- `publish/assets/generated/cards/` contains 79 current WebP illustrations:
  43 distinct formal/status card images and 36 named active-skill images.
- `src/original/card-art.js` is the mapping authority.
- Unknown formal cards use a same-type fallback illustration.
- Unknown real skill cards use the crimson/purple charge crest fallback.
- Virtual and converted cards retain the formal card illustration they
  represent; they do not become generic skill art.

### Skins

- `src/original/skins.js` owns skin identity, ownership, price, art, damaged art,
  and dynamic-effect name.
- The seven fixed special identities remain:
  - 罗卡尔 `恋母勇者`;
  - 贝丝妲魔偶 `机铠魔偶`;
  - 诺诺卡 `偶像明日星`;
  - 曼妮 `枪之魅魔`;
  - 贝尔蒂丝 `傲慢女王`.
  - 芙萝娅 `音速刺客`.
  - 温蒂 `慈爱教师`.
- `机铠魔偶` switches to its alternate art only while Extract Essence's
  turn-long conversion state is active; `傲慢女王` switches only while
  Arrogant Brat is inactive. These state portraits are exclusive to their
  matching equipped skins, and no skin uses the former six-second full-screen
  damage-art presentation.
- Special skin CSS/effects load only when that skin is selected or restored.
- 艾尔拉娜“堕落医师”使用正式素材
  `publish/assets/generated/elrana-fallen-physician.5fb5e43a.webp`；其培养罐、
  绿色炼金液、红色再生丝线和胜利左侧装饰均由
  `src/original/elrana-fallen-physician-skin-fx.js`与
  `publish/elrana-fallen-physician-skin.css`负责，并按当前实际装备状态启用。
- Battle-idle portrait and decorator layers stay static. Authored motion is
  reserved for bounded controller pulses and entry, skill, hit, state-change,
  victory, or settlement feedback so dedicated skins do not repaint every
  frame.
- Replacing skin art requires matching the anatomy, weapon, palette, silhouette,
  effect hooks, and skill-state behavior documented in `game-settings.md`.

### Audio

- Scene BGM roles are:
  - title: `op.m4a`;
  - villa: `villa.m4a`;
  - dungeon: `dungeon-map.m4a`;
  - default machine-factory battle: `machine-factory-battle.m4a`;
  - mission, elite, boss, and character-specific overrides from canonical data.
- BGM starts only after player interaction, loops, and crossfades between
  scenes. Victory and completed test battles stop battle BGM.
- Core sampled feedback includes armor, heal, hp hit, hp loss, and magic hit.
- Card movement, landing, burn, judgment, and elemental feedback may use
  synthesized Web Audio when available.
- Audio layers must avoid duplicate impact cues. Card movement sound is not a
  damage sound.

## Media Loading And Fallback

- Critical startup art is limited to the villa heroine and card back.
- Hall warming loads only current-party art and skips aggressive work on slow
  or data-saver connections.
- Battle preload includes only selected allies, encounter enemies, and their
  damaged variants.
- Card and skill illustrations remain battle-deferred and lazy.
- Media uses real relative URLs only. Player text, AI text, and arbitrary data
  must never be assigned to media `src`.
- Failed loads are remembered for the session to avoid request loops.
- Portrait fallback is a labeled gothic panel; card fallback keeps the proper
  card type and readable live text.
- Same-screen rerenders preserve matching image and video nodes to avoid flash,
  decode churn, and restarted animation.

## Preservation Checklist

Before accepting an original presentation change, verify:

- the literal title, heroine art, and gothic palette remain first-viewport
  identity signals;
- all 24 documented screen families still have recognizable equivalents;
- top bar, bottom nav, modal stack, and scene-specific chrome retain their
  ownership;
- body scrolling remains disabled and long content scrolls internally;
- active, hover, selected, disabled, busy, empty, error, and retry states are
  visible;
- modal background controls are inert, not merely dimmed;
- every long or destructive action has a lock, status, and recovery path;
- card faces preserve live text and canonical type colors;
- character art preserves signature anatomy, weapon, costume, and silhouette;
- battle target lines, card movement, damage, healing, armor, and audio remain
  synchronized;
- startup art and audio budgets remain within `art-bible.md` and
  `game-settings.md` limits;
