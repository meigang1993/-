window.BattleSession = ({
  setup,
  cleanupBattlePrompts,
  clearBattleLog,
  record,
  wait,
  waitEffects,
  isCurrentState,
  initialDrawCount,
  revealPending,
  nextAnim,
  getCombat,
  getAdvanceToInput,
}) => {
  function draw(unit, count, battle, eventCollector = null) {
    if (unit?.drawLockedThisTurn) return [];
    const cards = [];
    const batches = new Map();
    for (let index = 0; index < count; index += 1) {
      window.BattlePileStats?.reshuffle(unit, setup.shuffle);
      if (!unit.deck.length) continue;
      const card = unit.deck.pop();
      const recipient = window.SakuraRisaSkills?.drawRecipient?.(unit, battle) || unit;
      if (battle?.animQueue) card._pendingDraw = true;
      recipient.hand.push(card);
      cards.push(card);
      if (!batches.has(recipient)) batches.set(recipient, []);
      batches.get(recipient).push(card);
    }
    batches.forEach((batch, recipient) => {
      const queue = eventCollector || battle?.animQueue;
      if (queue) {
        queue.push({
          id: `db${nextAnim()}`,
          type: "drawBatch",
          uid: recipient.uid,
          side: recipient.side,
          count: batch.length,
          cards: batch,
        });
      }
      window.SakuraRisaSkills?.onDrawRedirected?.(
        battle, unit, recipient, batch.length);
    });
    window.RuinsRelicEffects?.afterDraw?.(
      window.state?.battle === battle ? window.state : { battle },
      unit, cards, draw, { getCombat });
    return cards;
  }

  const finishBattle = window.BattleSessionSettlement({
    cleanupBattlePrompts,
    clearBattleLog,
    getCombat,
  });

  async function start(state, missionId, onStep, context = {}) {
    const current = () => isCurrentState(state)
      && (!context.isCurrent || context.isCurrent());
    const { allies, enemies } = await setup.create(state, missionId, onStep, context);
    if (!current()) return;
    clearBattleLog(state);
    const initialDrawBatches = [];
    [...allies, ...enemies].forEach(unit =>
      draw(unit, initialDrawCount(unit), state.battle, initialDrawBatches));
    if (initialDrawBatches.length && state.battle?.animQueue) {
      state.battle.animQueue.push({
        id: `idg${nextAnim()}`,
        type: "initialDrawGroup",
        batches: initialDrawBatches,
        cards: initialDrawBatches.reduce(
          (all, batch) => all.concat(batch.cards || []), []),
      });
    }
    state.view = "battle";
    const mission = GameData.missions.find(item => item.id === missionId);
    record(state, context.test ? "进入测试战斗。" : `进入战斗：${mission.name}`);
    const introWait = window.BattleLines?.intro(state) || 0;
    if (introWait) state.battle.locked = true;
    onStep?.();
    window.BattleFX?.playBattleStart?.(() => {
      if (!current() || !state.battle) return;
      state.battle.introSfxPending = false;
      window.GameBGM?.unlock?.();
      window.GameBGM?.update(state);
      window.GameBGM?.playCurrent?.();
    });
    await waitEffects();
    if (!current()) return;
    if (introWait) {
      await (typeof introWait.then === "function" ? introWait : wait(introWait));
    }
    if (!current() || !state.battle) return;
    state.battle.locked = false;
    enemies
      .filter(enemy => enemy.ai === "mechanical_bull_king" && enemy.defenseSystem > 0)
      .forEach(enemy => window.BattleLines?.skill(state, enemy, "防御模式"));
    revealPending([...allies, ...enemies]);
    onStep?.();
    await getAdvanceToInput()(state, onStep, current);
  }

  return { draw, finishBattle, start };
};
