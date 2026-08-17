if (!window.BattleDamageHit) require("../src/original/battle-damage-hit.js");

module.exports = ({ assert, unit }) => {
  const saved = {
    BattleDamageRelics: window.BattleDamageRelics,
    BattleStats: window.BattleStats,
    BertisGerlotSkills: window.BertisGerlotSkills,
    EnemySkills: window.EnemySkills,
    FloraSonicSkinFX: window.FloraSonicSkinFX,
    GuardKellySkills: window.GuardKellySkills,
    MannySkills: window.MannySkills,
    NonokaLokiSkills: window.NonokaLokiSkills,
    SakuraRisaSkills: window.SakuraRisaSkills,
  };
  try {
    window.BattleDamageRelics = { resolveEdisSwordHit: () => null };
    window.BattleStats = { damage() {} };
    window.BertisGerlotSkills = {
      queueHeadshot: () => false,
      modifyIncomingDamage: (_state, _actor, amount) => amount,
    };
    window.EnemySkills = {
      absorbDefense: (_state, _target, amount) =>
        ({ absorbed: 0, rest: amount }),
    };
    window.FloraSonicSkinFX = { assault() {}, assaultDefeat() {} };
    window.GuardKellySkills = {
      afterHit() {},
      markFaceDown(_state, actor) {
        actor.faceDown = true;
        if (!actor.statuses.includes("翻面")) actor.statuses.push("翻面");
      },
    };
    window.MannySkills = { transferSlash: () => false };
    window.NonokaLokiSkills = {
      sourceActor: (_battle, actor) => actor,
      sourceLabel: (_battle, _actor, source) => source,
    };
    window.SakuraRisaSkills = {
      preventDeath(_state, target) {
        if (target.testPendingRevival && target.hp <= 0) {
          target.risaRevivePending = true;
        }
      },
      pendingRevival: target => !!target?.risaRevivePending,
    };

    function runCase({ hp = 2, phase = 6, chainKill = false, pending = false } = {}) {
      const actor = unit("assault-actor", "ally", {
        ref: "flora", stats: { attack: 3, initialDraw: 2 },
      });
      const target = unit("assault-target", "enemy", {
        hp, maxHp: hp, testPendingRevival: pending,
      });
      const battle = {
        phase, allies: [actor], enemies: [target], animQueue: [],
        hitFxId: 0, defeatedEnemyIds: [],
      };
      const state = { battle, log: [] };
      let drawn = 0;
      const ctx = {
        checkDefeat() {},
        holdVisual() {},
        pushFloat(current, uid, kind, value, critical, delay, visual) {
          current.animQueue.push({
            type: "float", uid, kind, value, critical, delay, ...visual,
          });
        },
        queueSlashText() {},
        visualOf: current => ({ visualHp: current.hp, visualBlock: 0 }),
      };
      const lifecycle = {
        markDefeated() {},
        finalizeDamage() {},
      };
      const hit = window.BattleDamageHit({
        deps: { isKillCard: card => card?.type === "slash" },
        ctx,
        lifecycle,
        getTriggers: () => ({
          afterDamage(current, _actor, damaged) {
            if (!chainKill) return;
            damaged.hp = 0;
            current.battle.animQueue.push({
              type: "float", uid: damaged.uid, kind: "damage", visualHp: 0,
            });
          },
        }),
        logSource: (_actor, source) => source,
      });
      window.FloraCarlosSkills.handleSpecialCard(
        state, actor, target, { speedAssault: true },
        {
          draw(_actor, count) {
            drawn += count;
            return Array.from({ length: count }, () => ({}));
          },
        },
        {
          damage(current, damaged, amount, source, sourceActor, damageCard) {
            return hit.hitWithoutDodge(
              current, sourceActor, damaged, amount, source, damageCard);
          },
        },
      );
      return { actor, target, state, battle, drawn: () => drawn };
    }

    const lethal = runCase();
    const lethalCommit = lethal.battle.animQueue.at(-1);
    assert(lethalCommit?.type === "battleCommit"
      && lethal.battle.animQueue[0].type === "float",
    "Speed Assault settlement must follow its lethal damage animation");
    assert(lethal.drawn() === 0 && !lethal.actor.faceDown,
      "Speed Assault must not reward or turn face-down before animation commit");
    lethalCommit.commit();
    lethalCommit.commit();
    assert(lethal.drawn() === 6 && lethal.actor.faceDown,
      "A final-enemy direct kill must reward and turn face-down exactly once");

    const chained = runCase({ hp: 5, chainKill: true, phase: 1 });
    assert(chained.battle.animQueue.at(-1)?.type === "battleCommit"
      && chained.battle.animQueue.filter(event =>
        event.type === "float" && event.kind === "damage").length >= 2,
    "Speed Assault settlement must remain after synchronous chain damage");
    chained.battle.animQueue.at(-1).commit();
    assert(chained.drawn() === 0,
      "Chain damage after a nonlethal direct hit must not grant a kill reward");

    const reviving = runCase({ pending: true, phase: 1 });
    reviving.battle.animQueue.at(-1).commit();
    assert(reviving.target.risaRevivePending && reviving.drawn() === 0,
      "A pending-revival lethal hit must not grant a kill reward");

    const stale = runCase();
    const staleCommit = stale.battle.animQueue.at(-1);
    stale.state.battle = {
      phase: 4, allies: [], enemies: [], animQueue: [],
    };
    staleCommit.commit();
    assert(stale.drawn() === 0 && !stale.actor.faceDown,
      "A replaced battle must reject stale Speed Assault settlement");
  } finally {
    Object.assign(window, saved);
  }
};
