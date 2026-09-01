# Original Art And Presentation Memory

This file is the visual routing index. Exact screen composition, interaction
states, visual tokens, and art roles are recorded in
`interaction-visual-reference.md`. Exact skin appearance, asset paths, prices,
effect sequences, audio timing, and combat presentation contracts remain
canonical in the matching sections of `game-settings.md`.

## Global Direction

- Desktop gothic succubus card-battle presentation.
- Primary composition baseline: `1280x720`.
- The interface should remain dense, readable, and operational rather than
  becoming a marketing-style page.
- The title, character identity, cards, battlefield state, and current action
  should remain visually dominant.
- Preserve the established mixed gothic palette and gold/crimson accents; do not
  replace the game with an unrelated one-note palette.
- Use current shipped assets as identity references. Do not change a character's
  core anatomy, signature weapon, color markers, or silhouette without updating
  the canonical setting and asset together.

## Canonical Visual Sources

- Global theme: `publish/gothic-theme.css`, `publish/gothic-start.css`
- Hall and modal presentation: `publish/villa*.css`
- Battle presentation: `publish/battle*.css`, `publish/info-victory.css`
- Skins and ownership: `src/original/skins.js`
- Asset resolution: `src/original/assets.js`
- Generated art: `publish/assets/generated/`
- Character portraits: character data files and `publish/assets/new-portraits/`
- Exact visual contracts: skin and presentation sections in
  `docs/original/game-settings.md`
- Screen and interaction reference:
  `docs/original/interaction-visual-reference.md`
- Adult-oriented skin generation policy:
  `docs/original/r18-art-policy.md`

## Fixed Skin Identity Index

- 罗卡尔 `lokar_motherbound`: adult male demon warrior, silver hair, red eyes,
  black-red horns and damaged wings, black-red greatsword.
- 贝丝妲魔偶 `besta_doll_energy_queen`: small female mechanical doll, silver
  bob, red eyes, black-red horns, heart core, mechanical wings and tail, large
  mechanical scythe and heeled mechanical boots.
- 诺诺卡 `nonoka_idol_rising_star`: blonde, blue-eyed pink demon idol with
  headphones and the signature pink electric guitar.
- 诺诺卡 `nonoka_level_10_special`: square stage illustration preserving her
  blonde hair, blue eyes, pink horns, headphones, and pink wings.
- 曼妮 `manny_gun_succubus`: asymmetric gun-fused succubus with blue left eye,
  scope right eye, ammunition belt, heart tail, a massive right-side firearm
  skeleton, and a broken gun-barrel wing.
- 曼妮 `manny_level_10_special`: square uploaded level-10 illustration,
  independent from the Gun Succubus epic skin and its effects.
- 贝尔蒂丝 `bertis_arrogant_queen`: silver twin tails, red eyes, demon horns,
  black wings, heart tail, black-purple rose gothic dress, thorn whip, ankle
  bells, platform Mary Jane shoes, and thorn-rose throne setting.
- 芙萝娅 `flora_default`: square uploaded default illustration with adult green
  hair, backward-curving black-red horns, black-red bat wings, heart tail,
  fitted black combat wear, and paired red-edged daggers in a ruined city.
- 芙萝娅 `flora_sonic_assassin`: adult green-haired succubus assassin with a
  high ponytail, violet eyes, dark half mask, backward-curving horns, black-red
  bat wings, heart tail, matte ink-green stealth suit, shoulder sonic blades,
  and paired green sound-wave daggers.
- 芙萝娅 `flora_level_10_special`: square uploaded level-10 illustration,
  independent from the Sonic Assassin epic skin and its effects.
- 温蒂 `wendy_benevolent_teacher`: adult emerald-to-lime-haired demon teacher
  matching her default golden eyes, black horns with gold tips, black wings
  with amber membranes, black heart tail, round gold glasses, emerald teacher
  suit, leather lesson book, desert school, chalkboard and golden tactical
  glyphs.
- 温蒂 `wendy_level_10_special`: square uploaded level-10 illustration,
  independent from the Benevolent Teacher epic skin and its effects.
- 艾尔拉娜 `elrana_fallen_physician`: adult silver-purple-haired demon
  physician with purple eyes, black-purple horns and wings, heart tail, fitted
  white physician coat, dark red waist band, oversized syringe, and three green
  alchemical culture tanks.
- 艾尔拉娜 `elrana_level_10_special`: square uploaded level-10 illustration,
  independent from the Fallen Physician epic skin and its effects.

The full constraints and prohibited substitutions are in the named skin
sections of `game-settings.md`; those sections override this short index.

## Combat Presentation

- Action-area effects use `src/original/battle-effect-anchors.js`; self buffs,
  charging, and transformations prefer the active action portrait and fall back
  to the battlefield portrait.
- Target damage, healing, binding, and status effects remain anchored to the
  target battlefield portrait.
- Card movement renders complete cards. Draw/gain/give/steal use card backs
  where hidden information requires it; play, response, discard, dismantle,
  and other face-up movement reuse the same named card illustration shown in
  hand and in the public play area. Card art is illustration-only: suit, name,
  type, and effect copy remain live HTML overlays. Slash cards use red frames,
  response cards blue, tactics purple, consumables flame-orange, status cards
  mist-gray, and the suitless 狼牙杀 uses a translucent silver frame.
  seal, and consume use readable fronts.
- Card flight audio is separate from damage, hp-loss, heal, and armor audio to
  prevent duplicate impact cues.
- Attribute effects and magic-attack effects are separate presentation layers.
- Rerendering must preserve existing portrait/media DOM and active animation
  progress when the represented object did not change.

## Asset Workflow

- Uploaded-image privacy: when the requested operation is only compression,
  transcoding, copying, or runtime integration, handle the uploaded image as
  opaque binary data. Do not preview, screenshot, OCR, classify, visually
  inspect, or submit it to an image-generation/review service. Only mechanical
  metadata needed for processing may be read; integrate the resulting asset
  directly unless a separate task explicitly requires visual analysis.
- Store runtime assets under ASCII-only, space-free paths in `publish/assets/`.
- Use relative paths and bind media `src` only to validated URLs or real assets.
- Keep critical first-screen assets small; warm only the current party and
  encounter art.
- New large media must respect the repository asset budget: 40 MiB total,
  21 MiB for long audio, and 1.75 MiB for the single BGM selected by a scene.
- Update `skins.js`, manifests, data references, and `game-settings.md` together.
- For every future adult-oriented skin request, read and follow
  `docs/original/r18-art-policy.md` before writing prompts or replacing assets.
