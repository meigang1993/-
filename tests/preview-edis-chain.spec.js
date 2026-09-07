const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

function targetOfLine() {
  const line = document.querySelector(".target-line.show");
  if (!line) return null;
  const left = parseFloat(line.style.left);
  const top = parseFloat(line.style.top);
  const width = parseFloat(line.style.width);
  const angle = parseFloat(
    /rotate\(([-0-9.]+)rad\)/.exec(line.style.transform)?.[1] || "0",
  );
  const endX = left + width * Math.cos(angle);
  const endY = top + width * Math.sin(angle);
  return [...document.querySelectorAll("[data-target] .unit-art")]
    .map(element => {
      const rect = element.getBoundingClientRect();
      return {
        uid: element.closest("[data-target]").dataset.target,
        distance: Math.hypot(
          endX - rect.left - rect.width / 2,
          endY - rect.top - rect.height / 2,
        ),
      };
    })
    .sort((leftTarget, rightTarget) =>
      leftTarget.distance - rightTarget.distance)[0];
}

const partySize = 4;
test("Raging Chainsaw renders the longest party pursuit chain", async ({ page }) => {
    test.setTimeout(60_000);
    await startRegressionBattle(page);
    const result = await page.evaluate(async options => {
      const readTarget = new Function(`return (${options.targetReader})`)();
      const battle = window.state.battle;
      window.BattleEffects.cancel(window.state);
      while (battle.allies.length < options.partySize) {
        battle.allies.push({
          ...battle.allies[0],
          uid: `edis-chain-target-${battle.allies.length + 1}`,
          hand: [],
          deck: [],
          discard: [],
          consumed: [],
          statuses: [],
        });
      }
      battle.allies = battle.allies.slice(0, options.partySize);
      battle.allies.forEach((unit, index) => {
        Object.assign(unit, {
          uid: `edis-chain-target-${index + 1}`,
          hp: 100,
          maxHp: 100,
          block: 0,
          hand: [],
        });
        delete unit.lockSuit;
        delete unit.holyScar;
        delete unit.visualHp;
      });
      const edis = battle.enemies[0];
      Object.assign(edis, {
        ai: "pursuer_edis",
        name: "内英组杀手伊迪斯",
        hp: 100,
        maxHp: 100,
        charge: 0,
        tempAttack: 0,
        tempMagic: 0,
        battleRelics: ["伊迪斯电锯剑"],
      });
      edis.stats = { ...edis.stats, attack: 1, handLimit: 6 };
      battle.enemies = [edis];
      battle.animQueue = [];
      battle.shownPlayed = [];
      battle.played = [];
      battle.locked = false;
      battle.hitFxId = 0;
      window.render();
      await new Promise(resolve => setTimeout(resolve, 50));
      window.BattleEffects.cancel(window.state);

      const slash = window.CardUtils.cloneEntity(
        "杀（普攻）", { suit: "♠" });
      edis.hand = [
        slash,
        ...Array.from({ length: 6 }, () =>
          window.CardUtils.cloneEntity("看破", { suit: "♣" })),
      ];
      battle.allies.slice(1).forEach(unit => {
        const uid = unit.uid;
        document.querySelector(`[data-target="${uid}"]`)?.remove();
      });
      const shiftedTargets = [];
      const extraEntityTargets = [];
      const originalShift = window.BattleSystem.shiftAnim;
      window.BattleSystem.shiftAnim = currentBattle => {
        const event = originalShift(currentBattle);
        if (event.type === "virtualPlay" && event.card?.virtual) {
          shiftedTargets.push(event.targetUid);
        }
        if (event.type === "virtualPlay" && event.extraSlashReplay) {
          extraEntityTargets.push(event.targetUid);
        }
        return event;
      };
      let virtualCards = 0;
      const originalReveal = window.BattleSystem.revealPlayed;
      window.BattleSystem.revealPlayed = (currentBattle, card, event) => {
        if (card?.virtual && card.name === "杀（普攻）") virtualCards += 1;
        return originalReveal(currentBattle, card, event);
      };
      const shownTargets = [];
      let activeLine = null;
      const observer = new MutationObserver(() => {
        const line = document.querySelector(".target-line.show");
        if (!line) {
          activeLine = null;
          return;
        }
        if (line === activeLine) return;
        activeLine = line;
        const target = readTarget();
        if (target?.distance < 5) shownTargets.push(target.uid);
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      slash._playedFlightDone = true;
      slash._playedTargetUid = battle.allies[0].uid;
      battle.animQueue.push({
        id: "edis-chain-entity-slash",
        type: "enemyPlay",
        uid: edis.uid,
        side: edis.side,
        targetUid: battle.allies[0].uid,
        card: slash,
        slashText: true,
        commit: () => window.BattleSystem.useCard(
          window.state, edis, battle.allies[0], slash),
      });
      window.render();
      const deadline = performance.now() + 30000;
      while ((window.BattleEffects.draining || battle.animQueue.length)
        && performance.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      observer.disconnect();
      window.BattleSystem.shiftAnim = originalShift;
      window.BattleSystem.revealPlayed = originalReveal;
      return {
        extraEntityTargets,
        shiftedTargets,
        shownTargets,
        hpLosses: battle.allies.map(unit => unit.maxHp - unit.hp),
        virtualCards,
      };
    }, { targetReader: targetOfLine.toString(), partySize });

    const pursuitRound = Array.from(
      { length: partySize - 1 },
      (_, index) => `edis-chain-target-${index + 2}`,
    );
    const expectedTargets = [...pursuitRound, ...pursuitRound];
    const primaryTarget = "edis-chain-target-1";
    expect(result.shiftedTargets).toEqual(expectedTargets);
    expect(result.extraEntityTargets).toEqual(
      [primaryTarget, primaryTarget, primaryTarget]);
    expect(result.shownTargets).toEqual([
      primaryTarget,
      primaryTarget,
      ...pursuitRound,
      primaryTarget,
      primaryTarget,
      ...pursuitRound,
    ]);
    expect(result.hpLosses).toEqual([
      4,
      ...Array(partySize - 1).fill(2),
    ]);
    expect(result.virtualCards).toBe((partySize - 1) * 2);
});
