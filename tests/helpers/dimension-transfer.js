async function setupSelectionScenario(page) {
  return page.evaluate(() => {
    const battle = window.state.battle;
    const protectedUnit = battle.allies[0];
    const manny = battle.allies[1];
    const enemy = battle.enemies[0];
    manny.ref = "manny";
    manny.name = "曼妮";
    manny.hand = [
      { name: "红色保留牌", type: "tactic", suit: "♥", text: "不能作为次元转移费用。" },
      { name: "黑色转移牌", type: "response", suit: "♠", text: "用于次元转移。" },
    ];
    enemy.hand = [];
    battle.activeUid = manny.uid;
    battle.phase = 4;
    battle.animQueue = [];
    window.MannySkills.transferSlash(window.state, enemy, protectedUnit, 4, "测试单体杀", {
      name: "杀（普攻）", type: "slash", suit: "♦", power: 1, scale: "attack",
    });
    window.render();
    return {
      mannyUid: manny.uid,
      enemyUid: enemy.uid,
      enemyHp: enemy.hp,
      protectedUid: protectedUnit.uid,
      protectedHp: protectedUnit.hp,
    };
  });
}

async function startSkipScenario(page, setup) {
  await page.evaluate(({ protectedUid, enemyUid }) => {
    const battle = window.state.battle;
    const manny = battle.allies[1];
    const protectedUnit = battle.allies.find(unit => unit.uid === protectedUid);
    const enemy = battle.enemies.find(unit => unit.uid === enemyUid);
    manny.hand.push({ name: "放弃时保留", type: "tactic", suit: "♣", text: "放弃发动时不弃置。" });
    window.MannySkills.transferSlash(window.state, enemy, protectedUnit, 3, "第二次测试杀", {
      name: "杀（普攻）", type: "slash", suit: "♣", power: 1, scale: "attack",
    });
    window.render();
  }, setup);
}

async function setupMultiHitScenario(page, mode = "enemy-turn") {
  return page.evaluate(scenarioMode => {
    const battle = window.state.battle;
    const protectedUnit = battle.allies[0];
    const manny = battle.allies[1];
    const enemy = battle.enemies[0];
    const allyTurn = scenarioMode === "ally-turn";
    const fatal = scenarioMode === "fatal";
    Object.assign(manny, {
      ref: "manny",
      name: "曼妮",
      hand: fatal ? [
        { name: "反杀费用", type: "response", suit: "♠", text: "转移当前伤害。" },
      ] : [
        { name: allyTurn ? "反击转移A" : "第一张黑牌", type: "response", suit: "♠", text: "第一次转移费用。" },
        { name: allyTurn ? "反击转移B" : "第二张黑牌", type: "response", suit: "♣", text: "第二次转移费用。" },
      ],
    });
    protectedUnit.hand = [];
    enemy.hand = [];
    enemy.stats.attack = 2;
    enemy.tempAttack = 0;
    if (fatal) {
      enemy.hp = 2;
      battle.enemies[1].hp = Math.max(1, battle.enemies[1].hp);
    }
    const activeUnit = allyTurn ? protectedUnit : enemy;
    battle.activeUid = activeUnit.uid;
    battle.phase = 4;
    battle.locked = false;
    battle.animQueue = [];
    const enemyHp = enemy.hp;
    const protectedHp = protectedUnit.hp;
    window.BattleSystem.useCard(window.state, enemy, protectedUnit, {
      name: fatal ? "反杀续跑测试" : allyTurn ? "友方回合反击测试" : "双段转移测试",
      type: "slash", power: 0, scale: "attack", virtual: true, gatlingRepeats: 2,
    });
    if (allyTurn) {
      const originalResolve = window.BattleSystem.resolveDimensionTransfer.bind(window.BattleSystem);
      window.__dimensionOriginalResolve = originalResolve;
      window.BattleSystem.resolveDimensionTransfer = async (...args) => {
        const result = await originalResolve(...args);
        if (!window.__dimensionActionHeld) {
          window.__dimensionActionHeld = true;
          if (!window.__dimensionReleaseRequested) {
            await new Promise(resolve => { window.__releaseDimensionAction = resolve; });
          }
        }
        return result;
      };
    }
    window.render();
    return {
      activeUid: activeUnit.uid,
      enemyUid: enemy.uid,
      enemyHp,
      mannyUid: manny.uid,
      protectedUid: protectedUnit.uid,
      protectedHp,
    };
  }, mode);
}

async function releaseAllyTurnScenario(page) {
  await page.evaluate(() => {
    window.__dimensionReleaseRequested = true;
    window.BattleSystem.resolveDimensionTransfer = window.__dimensionOriginalResolve;
    window.__releaseDimensionAction?.();
  });
}

async function readTransferResult(page, setup) {
  return page.evaluate(({ activeUid, enemyUid, protectedUid }) => {
    const battle = window.state.battle;
    const enemy = battle.enemies.find(unit => unit.uid === enemyUid);
    const protectedUnit = battle.allies.find(unit => unit.uid === protectedUid);
    const manny = battle.allies.find(unit => unit.ref === "manny");
    return {
      activeUid: battle.activeUid,
      expectedActiveUid: activeUid,
      enemyHp: enemy.hp,
      hand: manny.hand.map(card => card.name),
      pending: !!battle.manualDodgeResume,
      phase: battle.phase,
      protectedHp: protectedUnit.hp,
      promptCleared: !battle.dimensionTransfer,
    };
  }, setup);
}

module.exports = {
  readTransferResult,
  releaseAllyTurnScenario,
  setupMultiHitScenario,
  setupSelectionScenario,
  startSkipScenario,
};
