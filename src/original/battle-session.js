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
  // 摸牌动画去重：连续多次 draw()（补给、技能补牌等）会各推一条 drawBatch，
  // 队列串行播放，张数或次数一多就明显拖长。这里把紧邻的、同一名角色的
  // 摸牌并进队尾那条事件，整批一次飞完；换人则另起一条。
  function mergeDrawBatch(queue, event) {
    const last = queue[queue.length - 1];
    if (last && last.type === "drawBatch" && last.uid === event.uid
      && last.side === event.side) {
      last.count = (last.count || 0) + event.count;
      last.cards = (last.cards || []).concat(event.cards || []);
      return;
    }
    queue.push({ id: `db${nextAnim()}`, ...event });
  }

  function draw(unit, count, battle, eventCollector = null) {
    if (unit?.drawLockedThisTurn) return [];
    const cards = [];
    const batches = new Map();
    for (let index = 0; index < count; index += 1) {
      window.BattlePileStats?.reshuffle(unit, setup.shuffle);
      if (!unit.deck.length) continue;
      const card = unit.deck.pop();
      const recipient = window.SakuraRisaSkills?.drawRecipient?.(unit, battle) || unit;
      // 吸魔邪眼会把摸到的牌转交给另一名角色；跨阵营转交必须记原主，
      // 否则弃置时会落进接收方牌库，等于永久占有对方阵营的牌。
      if (recipient !== unit && !card.stolenFromUid) card.stolenFromUid = unit.uid;
      if (battle?.animQueue) card._pendingDraw = true;
      recipient.hand.push(card);
      cards.push(card);
      if (!batches.has(recipient)) batches.set(recipient, []);
      batches.get(recipient).push(card);
    }
    batches.forEach((batch, recipient) => {
      const queue = eventCollector || battle?.animQueue;
      if (queue) mergeDrawBatch(queue, {
        type: "drawBatch",
        uid: recipient.uid,
        side: recipient.side,
        count: batch.length,
        cards: batch,
      });
      window.SakuraRisaSkills?.onDrawRedirected?.(
        battle, unit, recipient, batch.length);
    });
    // 多角色循环摸牌：队尾一批「不同角色」的 drawBatch 收成一条 drawGroup
    // 由动画层并行播放，避免逐人串行连播 N 段。技能/饰品因此不必各自记得
    // 调用打包器——凡是走到 draw() 的多角色摸牌都自动一次性播放。
    // 开局摸牌走 eventCollector，由 start() 自己包成 initialDrawGroup，
    // 这里不能打包（外层要的是批次数组，不是一个组）。
    if (!eventCollector) window.BattleDrawPacker?.packDrawGroup?.(battle);
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

  function ensureOpeningSlash(unit) {
    if (!unit?.hand) return;
    const isSlash = c => window.CardUtils?.isKillCard?.(c) && !c.virtual;
    if (unit.hand.some(isSlash)) return;
    const deckIdx = (unit.deck || []).findIndex(isSlash);
    if (deckIdx >= 0) { unit.hand.push(unit.deck.splice(deckIdx, 1)[0]); return; }
    const discardIdx = (unit.discard || []).findIndex(isSlash);
    if (discardIdx >= 0) unit.hand.push(unit.discard.splice(discardIdx, 1)[0]);
  }

  async function start(state, missionId, onStep, context = {}) {
    const current = () => isCurrentState(state)
      && (!context.isCurrent || context.isCurrent());
    const { allies, enemies } = await setup.create(state, missionId, onStep, context);
    if (!current()) return;
    clearBattleLog(state);
    const initialDrawBatches = [];
    [...allies, ...enemies].forEach(unit =>
      draw(unit, initialDrawCount(unit), state.battle, initialDrawBatches));
    // 新手保护：首战保证罗卡尔初始手牌至少有一张可使用的实体【杀】。
    if (window.Onboarding?.at?.(state, "battle")) ensureOpeningSlash(allies[0]);
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
