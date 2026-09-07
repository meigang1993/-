/* global BattleDamageTriggers, CardUtils */

module.exports = ({ assert, card, unit }) => {
  const hookNames = [
    "EnemySkills", "SakuraRisaSkills", "MannySkills", "FloraCarlosSkills",
    "EdisSkills", "BertisGerlotSkills", "AngelicaLukaSkills",
    "ElranaAceNanaliSkills", "GuestCharacterSkills", "HoshinoSkills",
    "WithererSkills", "BondiSkills", "BakarSkills",
  ];
  const originals = Object.fromEntries(hookNames.map(name => [name, window[name]]));
  const originalSkinFx = window.CharacterSkinFX;
  const noopHooks = {
    afterDamage() {},
    afterSlashDamage() {},
    refreshArrogance() {},
    afterAnyDeath() {},
  };
  hookNames.forEach(name => { window[name] = { ...noopHooks }; });
  window.CharacterSkinFX = { soulScythe() {} };

  try {
    const actor = unit("soul-scythe-user", "ally", {
      ref: "besta_doll",
      skills: [{ name: "锁魂镰刀" }],
      stats: { attack: 3, magic: 3 },
    });
    const targets = [
      unit("soul-scythe-target-a", "enemy", { hp: 20 }),
      unit("soul-scythe-target-b", "enemy", { hp: 20 }),
    ];
    const state = {
      battle: { allies: [actor], enemies: targets, animQueue: [] },
      log: [],
    };
    const hits = [];
    const triggers = BattleDamageTriggers({
      deps: { isKillCard: CardUtils.isKillCard, draw() {} },
      ctx: {
        hasSkill: (owner, name) =>
          owner.skills.some(skill => skill.name === name),
        statOf: owner => owner.stats.magic,
        queueSlashPlay() {},
        pushFloat() {},
      },
      damage: {},
      directDamage(_state, target, amount) {
        hits.push(target.uid);
        target.hp -= amount;
      },
    });

    const rejected = [
      card("机枪扫杀", "slash", {
        sweep: true, targetless: true, allTargets: targets.map(target => target.uid),
      }),
      card("无目标杀", "slash", { targetless: true }),
      card("普通战术", "tactic"),
    ];
    rejected.forEach(usedCard => {
      hits.length = 0;
      triggers.afterDamage(state, actor, targets[0], usedCard, 2, 0);
      assert(hits.length === 0,
        `Soul Scythe must reject non-single Slash: ${usedCard.name}`);
    });

    const accepted = [
      card("实体单体杀", "slash"),
      card("虚拟单体杀", "slash", { virtual: true }),
      card("转换单体杀", "slash", { convertedFrom: "闪" }),
    ];
    accepted.forEach(usedCard => {
      hits.length = 0;
      targets.forEach(target => { target.hp = 20; });
      triggers.afterDamage(state, actor, targets[0], usedCard, 2, 0);
      assert(hits.length === targets.length,
        `Soul Scythe must accept single Slash source: ${usedCard.name}`);
    });
  } finally {
    Object.assign(window, originals);
    window.CharacterSkinFX = originalSkinFx;
  }
};
