window.UnderwaterTrainTargetCounters = ({ stat }) => {
  function swordShieldCounter(state, mona, source, incoming) {
    if (!window.CardUtils.isEntitySingleKill(incoming)) return;
    const drawn = window.BattleSystem?.draw?.(mona, 2, state.battle) || [];
    window.BattleLines?.skill(state, mona, "剑盾反攻", source);
    window.BattleLog.add(state, `${mona.name} 触发剑盾反攻，${window.BattleDrawFeedback.action(mona, 2, drawn)}。`);
    const slash = drawn.find(card => window.CardUtils.isSingleKill(card));
    if (!slash || source.hp <= 0) return;
    delete slash._pendingDraw;
    mona.hand.splice(mona.hand.indexOf(slash), 1);
    window.BattleCards?.put(state.battle, mona, slash, "discard", { skipAnim: true });
    const counterCard = {
      ...slash, virtual: true, holy: true, twoDodgesRequired: true,
    };
    state.battle.animQueue?.push({
      type: "virtualPlay",
      id: window.GameRandom.id("mc"),
      uid: mona.uid,
      side: mona.side,
      targetUid: source.uid,
      card: counterCard,
      enemyLine: mona.side === "enemy",
      slashText: true,
    });
    window.BattleLines?.skill(state, mona, "圣剑无双", source);
    const amount = stat(mona, slash.scale === "magic" ? "magic" : "attack");
    window.BattleSystem?.damage?.(
      state, source, amount, "剑盾反攻", mona, counterCard);
  }

  function scissorBlade(state, actor, target, card) {
    const clash = window.BattlePileStats.clash(actor, target);
    state.battle.animQueue?.push({
      type: "clash",
      ...window.BattlePileStats.clashSnapshot(clash),
      a: clash.actorCard?.suit || "无",
      t: clash.targetCard?.suit || "无",
      result: clash.success ? "成功" : "抵抗",
      targetUid: clash.success ? null : actor.uid,
      id: window.GameRandom.id("cl"),
      uid: actor.uid,
    });
    if (clash.success) {
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      card.ignoreResponse = true;
      window.BattleLog.add(state,
        `${actor.name} 的剪刀刃拼花成功，本次杀不可响应。`);
    } else {
      window.BattleLog.add(state, `${actor.name} 的剪刀刃拼花失败。`);
    }
  }

  return { swordShieldCounter, scissorBlade };
};
