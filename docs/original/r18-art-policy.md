# Original Adult-Oriented Art Memory

This document owns the persistent prompt and review rules for requests labeled
`R18`, adult, mature, sensual, or similar. It does not authorize explicit
content. All generated game assets must remain acceptable to the DZMM review
pipeline.

## Required Interpretation

- Treat `R18` as mature glamour, dark fantasy allure, and adult fashion.
- When a request asks to `写R18大破爆衣关键词`, interpret `R18` here as the
  label for a clothing, armor, and equipment damage layer, not as a request to
  define, redesign, or replace the character.
- Apply those keywords to the supplied skin or reference while leaving the
  character's identity and anatomy unchanged. Emphasize torn seams, split outer
  layers, scorched fabric, cracked armor, loose straps, impact damage, smoke,
  sparks, and battle wear; this wording does not by itself request explicit
  sexual content.
- Apply this interpretation to every eligible adult character, not only
  `lokar_motherbound`. Use the following reusable additive prompt, adapting
  clothing and equipment nouns to the current design:
  `保持原角色、姿势与构图不变，R18大破爆衣，服装遭受猛烈冲击后爆裂，衣物接缝撕开，外层布料大片破碎，护具开裂，金属扣件崩断，束带松脱垂落，衣摆焦黑残缺，露骨性行为，裸体，剑痕与灼烧痕迹，内层衬料外露，血迹与尘土，周身烟雾和飞散火星，强烈战损感，绝境反击氛围，高细节`
- Always append identity constraints for the current reference:
  `不改变角色身份、面容、发型、体型、标志性装备、武器和背景，不替换原服装设计`.
- Every human or humanoid subject must be clearly and unambiguously adult.
- Express the adult tone through fitted costume design, posture, expression,
  lighting, materials, and a complete cinematic environment.
- Keep characters fully clothed and suitable for a reviewed game asset.
- Preserve the original portrait's face, hair, eyes, horns, wings, tail,
  weapon, silhouette, role, and established color markers.
- Every skin illustration must include the canonical background or an equally
  specific replacement environment. Do not generate a plain or empty backdrop.

## Prohibited Prompt And Image Content

- No youthful, childlike, school-age, or ambiguous-age presentation.
- No explicit exposure, sexual activity, coercive framing, bodily-fluid
  emphasis, or fetish-action framing.
- Do not place sensitive anatomy terms in prompts, including negative prompts;
  DZMM may block the request based on the term alone.
- Do not sexualize small dolls, clones, chibi characters, or other
  youth-adjacent designs. Mechanical dolls remain fully armored and non-human.
- No real brands, copyrighted characters, celebrity likenesses, text, logos,
  or watermarks.

## Generation And Replacement

- The default static-asset path uses the Game Studio Relay and `gpt-image-2`;
  generated runtime files belong in `publish/assets/generated/`.
- The one-off 2026-08-08 Nalang Dream Bertis trial was abandoned without an
  accepted runtime asset, and its Workbench generator was removed. Future use
  of that model requires another explicit user decision and must never silently
  substitute another model.
- Use opaque `1024x1536` card illustrations with
  `lossy_q80_opaque` unless the canonical skin contract requires otherwise.
- Generate one asset at a time. On timeout, query the same prompt with
  `force:false`; do not automatically repeat a `force:true` POST.
- Inspect every result before changing `src/original/skins.js`.
- Replace a skin path only after identity, adult presentation, full-body
  framing, required equipment, and complete background all pass inspection.
- Keep the previous hashed asset in the repository for rollback.
