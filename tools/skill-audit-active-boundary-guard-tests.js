module.exports = ({
  assert, unit, access, definitions, makeCard, makeOwner,
}) => {
  definitions.forEach(def => {
    const actor = makeOwner(def);
    const allyMale = unit(`male-${def.flags[0]}`, "ally", { gender: "male" });
    const allyFemale = unit(`female-${def.flags[0]}`, "ally", {
      gender: "female",
    });
    const enemy = unit(`enemy-${def.flags[0]}`, "enemy");
    const battle = {
      phase: def.prepare ? 1 : 4,
      activeUid: actor.uid,
      allies: [actor, allyMale, allyFemale],
      enemies: [enemy],
      selectedCardIndex: 0,
      selectedBagIndexes: [0],
    };
    if (def.prepare) battle[def.prepare] = actor.uid;
    window.state = { battle };
    const skillCard = makeCard(def);
    const targets = {
      self: actor,
      other: enemy,
      enemy,
      friendly: actor,
      friendlyOther: allyMale,
      friendlyMale: allyMale,
      friendlyFemale: allyFemale,
    };
    assert(access.canActor(battle, actor, skillCard),
      `${def.name} must accept its living current-battle owner`);
    assert(access.canResolve(
      window.state, actor, targets[def.target], skillCard, () => true),
    `${def.name} must accept its canonical target boundary`);
    const stateInfo = window.UICommon.skillState(actor, actor.skills[0], battle);
    assert(stateInfo.usable,
      `${def.name} UI state must accept its canonical phase`);
    if (skillCard.speedAssault) {
      battle.phase = 6;
      assert(access.canResolve(
        window.state, actor, enemy, skillCard, () => true),
      "Speed Assault must resolve during its end-phase window");
      battle.phase = 1;
    }
    battle.phase = def.prepare ? 4 : 1;
    assert(!access.canResolve(
      window.state, actor, targets[def.target], skillCard, () => true),
    `${def.name} must reject execution outside its canonical phase`);
    assert(!window.UICommon.skillState(actor, actor.skills[0], battle).usable,
      `${def.name} UI state must reject its non-canonical phase`);
    battle.phase = def.prepare ? 1 : 4;
    battle.activeUid = allyMale.uid;
    assert(!access.canResolve(
      window.state, actor, targets[def.target], skillCard, () => true),
    `${def.name} must reject a living owner without the current action`);
    battle.activeUid = actor.uid;

    const forged = makeOwner(def);
    forged.skills = [];
    const forgedBattle = {
      ...battle,
      allies: [forged, allyMale, allyFemale],
    };
    assert(!access.canActor(forgedBattle, forged, skillCard),
      `${def.name} must reject an actor that does not own the skill`);

    actor.hp = 0;
    assert(!access.canActor(battle, actor, skillCard),
      `${def.name} must reject a defeated owner`);
    actor.hp = actor.maxHp;
    assert(!access.canActor(
      { ...battle, allies: [allyMale, allyFemale] }, actor, skillCard),
    `${def.name} must reject an out-of-battle owner`);

    const invalid = def.target === "self" ? enemy
      : def.target === "enemy" ? allyMale
        : def.target === "other" ? actor
          : def.target === "friendly" ? enemy
            : def.target === "friendlyOther" ? actor
              : def.target === "friendlyMale" ? allyFemale : allyMale;
    assert(!access.canResolve(window.state, actor, invalid, skillCard, () => true),
      `${def.name} must reject an invalid target relation`);
    const deadTarget = targets[def.target];
    if (deadTarget !== actor) {
      deadTarget.hp = 0;
      assert(!access.canResolve(
        window.state, actor, deadTarget, skillCard, () => true),
      `${def.name} must reject a defeated target`);
      deadTarget.hp = deadTarget.maxHp;
      const outside = { ...deadTarget, uid: `outside-${def.flags[0]}` };
      assert(!access.canResolve(
        window.state, actor, outside, skillCard, () => true),
      `${def.name} must reject an out-of-battle target`);
    }
  });

  const playability = window.BattleCardPlayability({
    isKillCard: testCard => window.CardUtils.isKillCard(testCard),
  });
  const speedDef = definitions.find(def => def.flags.includes("speedAssault"));
  const speedActor = makeOwner(speedDef);
  const speedEnemy = unit("speed-window-enemy", "enemy");
  const speedBattle = {
    phase: 1,
    activeUid: speedActor.uid,
    awaitingSpeedAssaultUid: speedActor.uid,
    allies: [speedActor],
    enemies: [speedEnemy],
  };
  const speedCard = makeCard(speedDef);
  speedActor.usedSpeedAssault = true;
  speedActor.usedSpeedAssaultPrepare = true;
  assert(!playability.canPlay(speedActor, speedCard, speedBattle),
    "Speed Assault must remain limited to once in the preparation window");
  speedBattle.phase = 6;
  assert(playability.canPlay(speedActor, speedCard, speedBattle),
    "Preparation use must not consume Speed Assault's end-phase window");
  speedActor.usedSpeedAssaultEnd = true;
  assert(!playability.canPlay(speedActor, speedCard, speedBattle),
    "Speed Assault must remain limited to once in the end-phase window");

  definitions.forEach(def => {
    const actor = makeOwner(def);
    actor.skills = [];
    const battle = {
      phase: 4,
      allies: [
        actor,
        unit(`ally-${def.flags[0]}`, "ally", { gender: "male" }),
      ],
      enemies: [unit(`foe-${def.flags[0]}`, "enemy")],
    };
    window.state = { battle };
    assert(!playability.canPlay(actor, makeCard(def), battle),
      `${def.name} forged active card must be unplayable`);
  });

  const mixedActor = makeOwner(definitions[0]);
  const mixedCard = {
    ...makeCard(definitions[0]),
    mimicVoice: true,
  };
  const mixedTarget = unit("mixed-target", "ally");
  const mixedBattle = {
    phase: 4,
    allies: [mixedActor, mixedTarget],
    enemies: [],
  };
  window.state = { battle: mixedBattle };
  assert(!access.canActor(mixedBattle, mixedActor, mixedCard),
    "A card carrying multiple character active-skill identities must fail closed");

  const corruptActor = makeOwner(definitions[0]);
  corruptActor.skills[0].card = { name: "错误技能牌", type: "tactic" };
  const corruptBattle = {
    phase: 4,
    activeUid: corruptActor.uid,
    allies: [corruptActor],
    enemies: [],
  };
  assert(!access.canActor(
    corruptBattle, corruptActor, makeCard(definitions[0])),
  "A same-name active skill without its canonical card identity must fail closed");
};
