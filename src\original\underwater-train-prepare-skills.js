window.UnderwaterTrainPrepareSkills = ({
  alive, black, visible, stat, drawJudgeAny,
}) => {
  const drawJudge = (battle, actor, skill) =>
    drawJudgeAny(battle, actor, skill, card => card.suit === "♥");

  function prepare(state, unit, damage) {
    if (unit.ai === "terror_slime") {
      devour(state, unit, damage);
      return true;
    }
    if (unit.ai === "shark_pirate_crew") {
      anchorGun(state, unit, damage);
      return true;
    }
    if (unit.ai === "raff_assassin") {
      jokerCarnival(state, unit);
      return true;
    }
  }

  function jokerCarnival(state, unit) {
    const battle = state.battle;
    const { card, event } = drawJudgeAny(battle, unit, "鬼牌狂欢", item => !black(item));
    unit.jokerMode = black(card) ? "black" : "red";
    event.commit = () => {
      if (state.battle === battle) unit.jokerSuit = card.suit;
    };
    window.BattleLines?.skill(state, unit, "鬼牌狂欢");
    window.BattleLog.add(state,
      `${unit.name} 鬼牌狂欢判定：${card.suit}${card.name}，进入${unit.jokerMode === "red" ? "大鬼牌" : "小鬼牌"}模式。`);
  }

  function devour(state, unit, damage) {
    const targets = alive(state.battle.allies)
      .filter(target => visible(target).some(card => card.slime));
    if (!targets.length) return;
    const target = window.GameRandom.sample(targets, state);
    const { card, success } = drawJudge(state.battle, unit, "吞食");
    window.BattleLines?.skill(state, unit, "吞食", target);
    window.BattleLog.add(state,
      `${unit.name} 对${target.name}发动吞食判定：${card.suit}${card.name}，${success ? "目标立即死亡" : "未触发"}。`);
    if (success) {
      damage(state, target, target.hp, "吞食", unit, {
        name: "吞食",
        type: "skill",
        ignoreResponse: true,
        ignoreBlock: true,
        skipDamageModify: true,
      });
    }
  }

  function anchorGun(state, unit, damage) {
    const mark = unit.anchorGun;
    if (!mark) return;
    unit.anchorGun = null;
    const target = alive(state.battle.allies).find(item => item.uid === mark.uid);
    if (!target || !mark.amount) return;
    window.BattleLines?.skill(state, unit, "穿透锚枪", target);
    damage(state, target, mark.amount, "穿透锚枪", unit, {
      name: "穿透锚枪",
      type: "skill",
      ignoreResponse: true,
      ignoreBlock: true,
      skipDamageModify: true,
    });
  }

  function afterCardPlayed(state, actor, card, damage, draw) {
    if (!actor || actor.side !== "ally" || !card?.suit || card._jokerChecked) return;
    const raff = alive(state.battle.enemies)
      .find(enemy => enemy.ai === "raff_assassin" && enemy.jokerMode);
    if (!raff) return;
    const hit = raff.jokerMode === "red" ? !black(card) : black(card);
    if (!hit) return;
    card._jokerChecked = true;
    window.BattleLines?.skill(state, raff, "鬼牌狂欢");
    const amount = stat(raff, "magic");
    damage(state, actor, amount, "鬼牌狂欢", raff, {
      name: "鬼牌狂欢",
      type: "skill",
      magicDamage: true,
      ignoreResponse: true,
      skipDamageModify: true,
    });
    const drawn = draw?.(raff, 1, state.battle);
    window.BattleLog.add(state,
      `${raff.name} 的鬼牌狂欢触发，${actor.name}受到${amount}点伤害，${raff.name}${window.BattleDrawFeedback.action(raff, 1, drawn)}。`);
  }

  return { prepare, afterCardPlayed };
};
