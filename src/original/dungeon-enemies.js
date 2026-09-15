window.DungeonEnemyGroups = (() => {
  const sample = (list, state) => window.GameRandom.sample(list, state);
  const rand = (min, max, state) => window.GameRandom.int(min, max, state);
  function bossGroup(pool, diff, bosses, state = window.state) {
    if (bosses.length === 1 && bosses[0].id === "xx_witherer_1124") return fixedGroup(pool, diff, "boss", [bosses[0].id], state);
    if (bosses.length === 1 && bosses[0].id === "demon_king_bakaar") return fixedGroup(pool, diff, "boss", ["demon_mecha_cerberus", bosses[0].id], state);
    if (bosses.length === 1 && bosses[0].id === "shark_captain_mordio") return fixedGroup(pool, diff, "boss", ["shark_pirate_raider", bosses[0].id, "shark_pirate_crew", "shark_pirate_crew"], state);
    if (bosses.length === 1 && bosses[0].id === "mona_eagle_captain") return fixedGroup(pool, diff, "boss", [bosses[0].id], state);
    if (bosses.length === 1 && bosses[0].id !== "pursuer_edis") return fixedGroup(pool, diff, "boss", ["mecha_minotaur", bosses[0].id, "skeleton_patrol"], state);
    return fixedGroup(pool, diff, "boss", bosses.map(b => b.id), state);
  }
  function eliteGroup(pool, diff, id, state = window.state) {
    const groups = { elrana_clone: ["skeleton_patrol", "elrana_clone", "skeleton_patrol"], krow_doctor: ["krow_doctor", "machine_succubus", "machine_succubus", "machine_succubus"], invader_chiyo: ["invader_chiyo"], guard_kelly: ["demon_beast_unit", "guard_kelly", "demon_witch"] };
    return fixedGroup(pool, diff, "elite", groups[id] || [id], state);
  }
  function enemiesFor(run, type, state = window.state) {
    const diff = GameData.difficulties[run.difficultyId], pool = GameData.enemies[run.missionId] || [];
    if (run.missionId === "underwater_train") return underwaterEnemies(pool, diff, type, state);
    if (run.missionId === "orc_dungeon") return orcDungeonEnemies(pool, diff, type, state);
    if (run.missionId === "ruins_sand_city") return ruinsEnemies(pool, diff, type, state);
    if (type === "boss") {
      const boss = sample(pool.filter(e => e.type === "boss"), state);
      return boss?.id === "pursuer_edis" ? fixedGroup(pool, diff, type, [boss.id], state) : fixedGroup(pool, diff, type, ["mecha_minotaur", boss?.id || "mechanical_bull_king", "skeleton_patrol"], state);
    }
    if (type === "elite") return fixedGroup(pool, diff, type, sample([
      ["skeleton_patrol", "elrana_clone", "skeleton_patrol"],
      ["krow_doctor", "machine_succubus", "machine_succubus", "machine_succubus"],
      ["invader_chiyo"],
    ], state), state);
    const count = rand(1, 4, state), picked = [], normalPool = pool.filter(e => e.type === "normal");
    for (let i = 0; i < count; i++) picked.push(pickRepeatable(normalPool, picked, state));
    return withLabels(picked.map(e => scaleEnemy(e, diff, type)));
  }
  function underwaterEnemies(pool, diff, type, state) {
    if (type === "boss") return fixedGroup(pool, diff, type, sample([["shark_pirate_raider", "shark_captain_mordio", "shark_pirate_crew", "shark_pirate_crew"], ["mona_eagle_captain"]], state), state);
    if (type === "elite") return fixedGroup(pool, diff, type, sample([["raff_assassin"], ["abe_mike"]], state), state);
    const count = rand(1, 4, state), picked = [], normalPool = pool.filter(e => e.type === "normal");
    for (let i = 0; i < count; i++) picked.push(pickRepeatable(normalPool, picked, state));
    return withLabels(picked.map(e => scaleEnemy(e, diff, type)));
  }
  function orcDungeonEnemies(pool, diff, type, state) {
    if (type === "boss") return fixedGroup(pool, diff, type, sample([["xx_witherer_1124"], ["demon_mecha_cerberus", "demon_king_bakaar"]], state), state);
    if (type === "elite") return fixedGroup(pool, diff, type, sample([["witherer_1124_split", "witherer_1124_split"], ["orc_king_bondi"], ["demon_beast_unit", "guard_kelly", "demon_witch"], ["demon_witch", "assassin_sakura_risa", "demon_witch"]], state), state);
    const count = rand(1, 4, state), picked = [], normalPool = pool.filter(e => e.type === "normal");
    for (let i = 0; i < count; i++) picked.push(pickRepeatable(normalPool, picked, state));
    return withLabels(picked.map(e => scaleEnemy(e, diff, type)));
  }
  function ruinsEnemies(pool, diff, type, state) {
    if (type === "boss") return fixedGroup(pool, diff, type, sample([
      ["mech_ai_dragon", "noble_soldier", "noble_sniper"],
      ["witherer_1312", "noble_soldier", "attack_drone"],
    ], state), state);
    if (type === "elite") return fixedGroup(pool, diff, type, sample([
      ["merca_tank", "attack_helicopter"],
      ["merca_tank", "armored_carrier", "noble_soldier", "noble_soldier"],
      ["hilde"],
    ], state), state);
    const count = rand(1, 4, state), picked = [], normalPool = pool.filter(e => e.type === "normal");
    for (let i = 0; i < count; i++) picked.push(pickRepeatable(normalPool, picked, state));
    return withLabels(picked.map(e => scaleEnemy(e, diff, type)));
  }
  function fixedGroup(pool, diff, type, ids, state) {
    return withLabels(ids.map(id => scaleEnemy(pool.find(e => e.id === id) || sample(pool, state), diff, type)));
  }
  function fromIds(run, type, ids, state = window.state) {
    const diff = GameData.difficulties[run.difficultyId], pool = GameData.enemies[run.missionId] || [];
    return fixedGroup(pool, diff, type, ids || [], state);
  }
  function pickRepeatable(pool, picked, state) {
    const available = pool.filter(e => picked.filter(x => x.id === e.id).length < 4);
    return sample(available.length ? available : pool, state);
  }
  function withLabels(list) {
    const counts = list.reduce((m, e) => (m[e.id] = (m[e.id] || 0) + 1, m), {}), seen = {};
    return list.map(e => ({ ...e, label: counts[e.id] > 1 ? String.fromCharCode(65 + ((seen[e.id] = (seen[e.id] || 0) + 1) - 1)) : "" }));
  }
  function scaleEnemy(base, diff, type) {
    const enemy = GameData.scaleEnemyStats(base, diff, type);
    if (diff.enemyRelics && ["elite", "boss"].includes(base?.type)) enemy.battleRelics = window.RelicSystem?.enemyRelics?.(base.id) || [];
    return enemy;
  }
  return { enemiesFor, bossGroup, eliteGroup, fromIds };
})();
