/* global GameData, GuestCharacterSkills, MannySkills, UICommon */

module.exports = ({ assert, card, unit }) => {
  const access = window.CharacterSkillAccess;
  const definitions = access.definitions;
  assert(definitions.length === 27,
    "Character active-skill boundary catalog must cover 24 base and 3 derived skills");

  const formal = GameData.characters.flatMap(character =>
    character.skills.filter(skill => skill.type === "active" && skill.card));
  assert(formal.length === 24,
    "Character catalog must retain 24 formal active skills");
  formal.forEach(skill => {
    assert(access.definitionOf(skill.card)?.name === skill.name,
      `${skill.name} must be registered in the active-skill boundary catalog`);
  });
  assert(MannySkills.skills({ mannyWeapon: "barrett" })[0]?.source === "derived",
    "Barrett must remain a character-derived skill instead of masquerading as a relic");

  const makeCard = def => card(def.name, "tactic", {
    _skill: true,
    ...Object.fromEntries(def.flags.map(flag => [flag, true])),
  });
  const makeOwner = def => unit(`owner-${def.flags[0]}`, "ally", {
    gender: "female",
    rageMarks: 1,
    skills: [{ name: def.name, type: "active", card: makeCard(def) }],
    hand: [card("红桃战术", "tactic", { suit: "♥" })],
  });
  GameData.characters.forEach(character => {
    character.skills.filter(skill => skill.type === "active" && skill.card)
      .forEach(skill => {
        const actor = unit(`real-${character.id}-${skill.name}`, "ally", {
          ref: character.id,
          gender: character.gender,
          skills: character.skills,
        });
        const battle = { allies: [actor], enemies: [] };
        window.state = { battle };
        assert(access.canActor(battle, actor, { ...skill.card, _skill: true }),
          `${character.name}'s real ${skill.name} data must satisfy ownership`);
      });
  });
  const manny = unit("real-manny-barrett", "ally", {
    ref: "manny",
    skills: GameData.characters.find(character => character.id === "manny").skills,
    mannyWeapon: "barrett",
  });
  const bertis = unit("real-bertis-food", "ally", {
    ref: "bertis",
    skills: GameData.characters.find(character => character.id === "bertis").skills,
    food: 1,
  });
  const foodUser = unit("real-food-user", "ally");
  const aileng = unit("real-aileng-charge", "ally", {
    ref: "aileng",
    skills: [GuestCharacterSkills.chargeSkill()],
  });
  const dynamicBattle = {
    allies: [manny, bertis, foodUser, aileng],
    enemies: [],
  };
  window.state = { battle: dynamicBattle };
  [
    [manny, MannySkills.skills(manny)[0]],
    [foodUser, UICommon.skillsOf(foodUser).find(skill => skill.name === "取粮")],
    [aileng, GuestCharacterSkills.chargeSkill()],
  ].forEach(([actor, skill]) => {
    assert(skill?.card && access.canActor(
      dynamicBattle, actor, { ...skill.card, _skill: true }),
    `${skill?.name || "Derived skill"} must satisfy real runtime ownership`);
  });

  return { access, definitions, makeCard, makeOwner };
};
