/* global BattleAIHelpers, BertisGerlotSkills, MannySkills */

module.exports = ({ assert, card, unit, incoming }) => {
  const bertis = unit("bertis", "ally", {
    ref: "bertis", hp: 38, maxHp: 38,
    stats: { attack: 3, magic: 3, bloodlust: 2, handLimit: 3 },
    skills: [{ name: "傲慢雌小鬼" }],
  });
  const state = { battle: { allies: [bertis], enemies: [] } };
  BertisGerlotSkills.refreshArrogance(state);
  assert(bertis.stats.attack === 6 && bertis.stats.magic === 6,
    "Bertis full-health attack and magic must be 2 times their base values");
  assert(bertis.stats.bloodlust === 4 && bertis.stats.handLimit === 6,
    "Bertis full-health bloodlust and hand limits must remain doubled");
  bertis.hp = 37;
  BertisGerlotSkills.refreshArrogance(state);
  assert(bertis.stats.attack === 3 && bertis.stats.magic === 3
    && bertis.stats.bloodlust === 2 && bertis.stats.handLimit === 3,
  "Bertis arrogance stats must return to base values after losing full health");
  require("./skill-audit-headshot-tests")({ assert, card, unit });

  const plainTarget = unit("plain-target", "enemy");
  const manny = unit("manny", "ally", { ref: "manny", mannyWeapon: "cannon" });
  const virtualSingle = { ...incoming };
  MannySkills.beforeSlash({ battle: {} }, manny, plainTarget, virtualSingle);
  assert(!virtualSingle.ignoreBlock,
    "Anti-tank Cannon must reject virtual single Slashes");
  const entityCannon = card("杀（普攻）", "slash", { suit: "♠" });
  MannySkills.beforeSlash({ battle: {} }, manny, plainTarget, entityCannon);
  assert(entityCannon.ignoreBlock,
    "Anti-tank Cannon must still apply to entity single Slashes");
  const virtualGroup = { ...incoming, allTargets: ["x"] };
  MannySkills.beforeSlash({ battle: {} }, manny, plainTarget, virtualGroup);
  assert(!virtualGroup.ignoreBlock,
    "Single-target weapon effects must not apply to group slashes");
  const barrett = unit("barrett-manny", "ally", {
    ref: "manny", mannyWeapon: "barrett", mannyBarrettSuit: "♠",
  });
  const virtualBarrett = { ...incoming, suit: "♠" };
  MannySkills.beforeSlash({ battle: {} }, barrett, plainTarget, virtualBarrett);
  assert(!virtualBarrett.mannyDouble && !virtualBarrett.ignoreResponse,
    "Barrett must reject virtual single Slashes");
  const entityBarrett = card("杀（普攻）", "slash", { suit: "♠" });
  MannySkills.beforeSlash({ battle: {} }, barrett, plainTarget, entityBarrett);
  assert(entityBarrett.mannyDouble && entityBarrett.ignoreResponse,
    "Barrett must still double entity single Slashes");
  assert(BattleAIHelpers.singleKill({ ...incoming }),
    "AI single-Slash selection must accept virtual cards");
  assert(BattleAIHelpers.singleKill(card("Converted Slash", "slash", {
    convertedFrom: "闪",
  })), "AI single-Slash selection must accept converted cards");
  assert(!BattleAIHelpers.singleKill(card("Group Slash", "slash", {
    allTargets: ["x"],
  })), "AI single-Slash selection must reject group cards");

  require("./skill-audit-transfer-tests")({
    assert, card, unit, incoming, manny, plainTarget,
  });
};
