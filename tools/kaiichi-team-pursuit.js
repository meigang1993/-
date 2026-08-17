const {
  assert,
  card,
  unit,
  scenario,
  trackedCombat,
} = require("./kaiichi-reaction-harness");

function runKaiichiTeamPursuit() {
  const slash = card("杀（普攻）");
  const edis = unit("edis", "enemy", [slash, card("蓄力")]);
  const teamPursuitDraws = [];
  const teamPursuitCombat = trackedCombat(teamPursuitDraws);
  Object.assign(edis, {
    id: "pursuer_edis",
    ref: "pursuer_edis",
    ai: "pursuer_edis",
    name: "内英组杀手伊迪斯",
    stats: { attack: 1, magic: 0, speed: 4, handLimit: 1 },
  });

  const nanali = unit("nanali", "ally", []);
  Object.assign(nanali, {
    ref: "nanali",
    name: "娜娜莉",
    stats: { attack: 1, magic: 0, speed: 3, handLimit: 3 },
  });

  const kaiichi = unit("kaiichi", "ally", [card("伤口处理"), card("蓄力")]);
  Object.assign(kaiichi, {
    ref: "hoshino_kaiichi",
    name: "星野海一",
    stats: { attack: 0, magic: 0, speed: 3, handLimit: 3 },
    skills: [{ name: "半魅魔血" }],
  });

  const state = scenario([], []).state;
  Object.assign(state.battle, {
    allies: [nanali, kaiichi],
    enemies: [edis],
    activeUid: edis.uid,
    phase: 4,
  });
  window.state = state;

  const scheduled = [];
  const nativeSetTimeout = global.setTimeout;
  try {
    global.setTimeout = callback => {
      scheduled.push(callback);
      return scheduled.length;
    };

    window.EdisSkills.beforeSlash(state, edis, nanali, slash);
    teamPursuitCombat.useCard(state, edis, nanali, slash);
    assert(state.battle.locked && state.battle.kaiichiShare,
      "Kaiichi's first pursuit hit must pause immediately for Half-Succubus Blood");
    assert.strictEqual(nanali.hp, 29,
      "Edis's entity repeat must remain pending during Kaiichi's first transfer");
    assert.strictEqual(kaiichi.hp, 29,
      "only the first pursuit may hit Kaiichi before the first transfer");
    assert(window.BattleReactionQueue.pending(state.battle),
      "the unfinished Nanali counter and Edis repeat must remain queued");

    const first = window.HoshinoSkills.resolveShare(state, null);
    assert(first.ok && first.resumeEnemyUid === edis.uid,
      "the first transfer must retain the interrupted Edis turn");
    assert.strictEqual(window.BattleReactionQueue.flush(state, teamPursuitCombat.damage), false,
      "resuming the chain must pause again when the repeat pursues Kaiichi");
    assert(state.battle.locked && state.battle.kaiichiShare,
      "Kaiichi's second pursuit hit must open a second independent transfer");
    assert.strictEqual(nanali.hp, 28,
      "Edis's queued entity repeat must resume only after the first transfer");
    assert.strictEqual(kaiichi.hp, 28,
      "the second pursuit must deal exactly one additional damage before pausing");

    const second = window.HoshinoSkills.resolveShare(state, null);
    assert(second.ok && second.resumeEnemyUid === edis.uid,
      "the second transfer must still point to the same interrupted enemy");
    assert.strictEqual(window.BattleReactionQueue.flush(state, teamPursuitCombat.damage), true,
      "the exact pending pursuit and counter chain must finish after the second transfer");
    while (scheduled.length) scheduled.shift()();

    assert(!state.battle.locked && !window.BattleReactionQueue.pending(state.battle),
      "the battle must unlock with no stale reaction after the full chain");
    const bloodLogs = state.log.filter(text => text.includes("半魅魔血令其"));
    assert.strictEqual(bloodLogs.length, 2,
      "each separate Kaiichi HP-loss event must produce one Half-Succubus Blood result");
    assert(bloodLogs.every(text => text.includes("未摸到牌")),
      "the empty draw stub must retain accurate Half-Succubus Blood feedback");
    assert.deepStrictEqual(teamPursuitDraws, [
      { uid: kaiichi.uid, count: 2 },
      { uid: kaiichi.uid, count: 2 },
    ], "Edis attacking a teammate must make both Berserk Chainsaw pursuits draw two cards for Kaiichi");
    assert.strictEqual(edis.hp, 26,
      "all four Nanali revenge attacks must resume instead of being lost");
  } finally {
    global.setTimeout = nativeSetTimeout;
  }
}

module.exports = { runKaiichiTeamPursuit };
