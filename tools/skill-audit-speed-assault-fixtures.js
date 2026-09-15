if (!window.BattleDamageHit) require("../src/original/battle-damage-hit.js");

function installSpeedAssaultStubs() {
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
}

function createSpeedAssaultCase(unit, {
  hp = 2, phase = 6, chainKill = false, pending = false,
  failDrawOnce = false,
} = {}) {
  const actor = unit("assault-actor", "ally", {
    ref: "flora", stats: { attack: 3, initialDraw: 2 },
  });
  if (failDrawOnce) {
    actor.deck = Array.from({ length: 12 }, (_, index) =>
      ({ name: `Reward ${index}` }));
  }
  const target = unit("assault-target", "enemy", {
    hp, maxHp: hp, testPendingRevival: pending,
  });
  const battle = {
    phase, allies: [actor], enemies: [target], animQueue: [],
    hitFxId: 0, defeatedEnemyIds: [],
  };
  const state = {
    battle, log: ["before"], battleLog: ["before"],
    random: { version: 1, seed: 7, cursor: 3 },
  };
  let drawn = 0;
  let drawAttempts = 0;
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
    scheduleAfterDamage(fn) { fn(); },
    flushAfterDamage() {},
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
      draw(_actor, count, currentBattle) {
        drawAttempts += 1;
        if (failDrawOnce) {
          const cards = actor.deck.splice(-count);
          cards.forEach(card => { card._pendingDraw = true; });
          actor.hand.push(...cards);
          actor.shuffleCount = (actor.shuffleCount || 0) + 1;
          state.random.cursor += 1;
          state.log = ["changed"];
          state.battleLog = ["changed"];
          currentBattle.animQueue.push({
            type: "drawBatch", uid: actor.uid, cards,
          });
          if (drawAttempts === 1) throw new Error("draw failed");
          drawn += cards.length;
          return cards;
        }
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
  return {
    actor, target, state, battle,
    drawn: () => drawn,
    drawAttempts: () => drawAttempts,
  };
}

module.exports = { createSpeedAssaultCase, installSpeedAssaultStubs };
