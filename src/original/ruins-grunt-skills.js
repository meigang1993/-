window.RuinsGruntSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isResponse = card => card?.type === "response" || card?.name === "闪";
  const isStatus = card => window.BattleStatusCards?.isStatus?.(card);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const isSingleSlash = card => isSlash(card) && !card?.sweep;
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const attackOf = unit => unit?.stats?.attack ?? unit?.attack ?? 0;
  const unitByUid = (battle, uid) => (battle?.allies || []).concat(battle?.enemies || [])
    .find(unit => unit.uid === uid);
  const RPS = ["石头", "剪刀", "布"];
  const beats = (a, b) => a === "石头" && b === "剪刀"
    || a === "剪刀" && b === "布" || a === "布" && b === "石头";

  function landmineMove(state, actor) {
    if (actor?.ai !== "ruins_soldier" || actor.usedRuinsLandmine) return null;
    const targets = alive(state.battle.allies).filter(unit => visible(unit).length);
    if (!targets.length) return null;
    // 目标选择：响应牌最多者优先；数量相同时血量低者优先。
    // 注意：即使当前无人持有响应牌也要埋雷——地雷持续存在，等对方摸到闪时再触发。
    const target = targets.sort((left, right) =>
      visible(right).filter(isResponse).length
      - visible(left).filter(isResponse).length || left.hp - right.hp)[0];
    return { card: { name: "放置地雷", _skill: true, ruinsPlaceLandmine: true }, target };
  }

  function usePlaceLandmine(state, actor, target) {
    actor.usedRuinsLandmine = true;
    // 描述：将敌方一张手牌转换为地雷状态牌 → 目标手牌数不变（替换，不新增）
    const landmine = window.BattleStatusCardRegistry?.create?.("landmine", actor);
    if (!landmine) return false;
    // 先加入地雷，成功后再移除被替换的那张牌，避免加不进去时白扣对方一张手牌
    if (!window.BattleStatusCards?.add?.(state, target, landmine, actor.name)) return false;
    const replaced = visible(target).filter(card => !isStatus(card))[0];
    if (replaced) {
      const index = target.hand.indexOf(replaced);
      if (index >= 0) target.hand.splice(index, 1);
      window.BattleStatusCards?.sync?.(target, state.battle);
    }
    window.BattleLines?.skill?.(state, actor, "放置地雷", target);
    log(state, `${actor.name} 对${target.name}发动放置地雷，`
      + `将其手牌${replaced ? `【${replaced.name}】` : "一张牌"}转换为【地雷】。`);
    return true;
  }

  // ---------- 地雷：猜拳小游戏（参考樱羽丽莎·吸魔邪眼） ----------
  function landmineOf(unit) {
    return (unit?.hand || []).find(card =>
      window.BattleStatusCardRegistry?.keyOf?.(card) === "landmine");
  }

  function consumeLandmine(state, holder) {
    const mine = landmineOf(holder);
    if (!mine) return null;
    const index = holder.hand.indexOf(mine);
    if (index >= 0) holder.hand.splice(index, 1);
    window.BattleCards?.put?.(state.battle, holder, mine, "consumed");
    return mine;
  }

  // 持有者赢 → 地雷直接消耗，不受伤；来源赢 → 持有者受伤，地雷消耗
  function settleLandmineRps(state, holder, mine, holderWon) {
    const source = unitByUid(state.battle, mine?.landmineSourceUid);
    consumeLandmine(state, holder);
    if (holderWon) {
      window.BattleLines?.skill?.(state, holder, "地雷");
      log(state, `${holder.name} 猜拳获胜，拆除地雷。`);
      return;
    }
    const amount = mine?.landmineAttack || 0;
    if (amount > 0) {
      const before = holder.hp;
      holder.hp = Math.max(0, holder.hp - amount);
      const loss = before - holder.hp;
      if (loss > 0) {
        window.BattleSystem?.pushFloat?.(state.battle, holder.uid, "hp-loss", loss);
        log(state, `${holder.name} 猜拳落败，地雷引爆，受到${amount}点伤害。`);
      }
    }
    window.BattleStatusCardRegistry?.sync?.(holder, state.battle);
  }

  // AI 持有地雷时主动发起猜拳
  function landmineRpsMove(state, actor) {
    if (!actor || actor.usedRuinsLandmineRps) return null;
    if (!landmineOf(actor)) return null;
    // target 用 actor 占位：自动出牌循环要求 target 非空，否则该 move 会被直接跳过
    return { card: { name: "地雷猜拳", _skill: true, ruinsLandmineRps: true, targetless: true }, target: actor };
  }

  function useLandmineRps(state, actor) {
    actor.usedRuinsLandmineRps = true;
    const mine = landmineOf(actor);
    if (!mine) return true;
    const source = unitByUid(state.battle, mine.landmineSourceUid);
    window.BattleLines?.skill?.(state, actor, "地雷");
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const mineChoice = RPS[Math.floor(window.GameRandom.value(state) * RPS.length)];
      const holderChoice = RPS[Math.floor(window.GameRandom.value(state) * RPS.length)];
      if (mineChoice === holderChoice) {
        log(state, `${actor.name} 与${source?.name || "地雷"}猜拳：${mineChoice}对${holderChoice}，平局，继续猜拳。`);
        continue;
      }
      // mineChoice 代表地雷（来源方）出手
      const holderWon = beats(holderChoice, mineChoice);
      log(state, `${actor.name} 与${source?.name || "地雷"}猜拳：${holderChoice}对${mineChoice}，${holderWon ? `${actor.name}获胜` : `${source?.name || "地雷"}获胜`}。`);
      settleLandmineRps(state, actor, mine, holderWon);
      return true;
    }
    return true;
  }

  // 打开猜拳窗口（点击手牌区的地雷牌触发）
  function openLandmineRps(state, unit) {
    if (!unit || unit.hp <= 0) return false;
    const battle = state?.battle;
    if (!battle || battle.landmineRpsPrompt) return false;
    const mine = landmineOf(unit);
    if (!mine) return false;
    const source = unitByUid(battle, mine.landmineSourceUid);
    battle.landmineRpsPrompt = {
      holderUid: unit.uid,
      sourceUid: source?.uid || "",
      amount: mine.landmineAttack || 0,
      tied: false,
      result: null,
    };
    battle.locked = true;
    battle.selectedCardIndex = null;
    battle.selectedCostCardIndex = null;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = null;
    return true;
  }

  // 出牌阶段：不自动弹窗（避免打断出牌），只提示可点击地雷发起猜拳
  function playPhaseStart(state, unit) {
    if (!unit || unit.hp <= 0 || unit.side === "enemy") return null;
    const mine = landmineOf(unit);
    if (!mine) return null;
    if (state?.battle?.landmineRpsPrompt) return null;
    log(state, `${unit.name} 手牌区的【地雷】可以点击发起猜拳：赢了直接拆除，输了受到 ${mine.landmineAttack || 0} 点伤害。`);
    return null;
  }

  function resolveLandmineRpsChoice(state, holderChoice) {
    const battle = state?.battle;
    const prompt = battle?.landmineRpsPrompt;
    if (!prompt || prompt.result || !RPS.includes(holderChoice)) return false;
    const holder = unitByUid(battle, prompt.holderUid);
    const source = unitByUid(battle, prompt.sourceUid);
    if (!holder || holder.hp <= 0) { battle.landmineRpsPrompt = null; battle.locked = false; return false; }
    // sourceChoice/eyeChoice 代表地雷（来源方）出手
    let sourceChoice = RPS[Math.floor(window.GameRandom.value(state) * RPS.length)];
    if (sourceChoice === holderChoice) {
      window.BattleLines?.skill?.(state, holder, "地雷");
      log(state, `${holder.name} 与${source?.name || "地雷"}猜拳：${holderChoice}对${sourceChoice}，平局，继续猜拳。`);
      prompt.result = { holderChoice, sourceChoice, outcome: "tie" };
      prompt.tied = false;
      return true;
    }
    const holderWon = beats(holderChoice, sourceChoice);
    window.BattleLines?.skill?.(state, holder, "地雷");
    log(state, `${holder.name} 与${source?.name || "地雷"}猜拳：${holderChoice}对${sourceChoice}，${holderWon ? `${holder.name}获胜` : `${source?.name || "地雷"}获胜`}。`);
    prompt.result = { holderChoice, sourceChoice, outcome: holderWon ? "holder" : "source" };
    return true;
  }

  function confirmLandmineRps(state) {
    const battle = state?.battle;
    const prompt = battle?.landmineRpsPrompt;
    const result = prompt?.result;
    if (!prompt || !result) return false;
    const holder = unitByUid(battle, prompt.holderUid);
    if (result.outcome === "tie") {
      prompt.result = null;
      prompt.tied = true;
      return true;
    }
    const mine = holder ? landmineOf(holder) : null;
    if (holder && mine) settleLandmineRps(state, holder, mine, result.outcome === "holder");
    battle.landmineRpsPrompt = null;
    battle.locked = false;
    return true;
  }

  function skipLandmineRps(state) {
    const battle = state?.battle;
    if (!battle?.landmineRpsPrompt) return false;
    battle.landmineRpsPrompt = null;
    battle.locked = false;
    return true;
  }

  function sniperMove(state, actor) {
    if (actor?.ai !== "ruins_sniper" || actor.usedRuinsSnipe) return null;
    const targets = alive(state.battle.allies).filter(unit => visible(unit).length);
    if (!targets.length) return null;
    const target = targets.sort((left, right) =>
      visible(right).filter(isSlash).length - visible(left).filter(isSlash).length
      || left.hp - right.hp)[0];
    return { card: { name: "狙击目标", _skill: true, ruinsSnipe: true }, target };
  }

  function useSnipe(state, actor, target) {
    actor.usedRuinsSnipe = true;
    const shown = visible(target)[0];
    if (!shown) {
      log(state, `${actor.name} 发动狙击目标失败：${target.name}没有可展示的手牌。`);
      return true;
    }
    const suit = shown.suit;
    const own = visible(actor).filter(card => card.suit === suit).length;
    const foe = visible(target).filter(card => card.suit === suit).length;
    actor.ruinsSniperTargetUid = target.uid;
    actor.ruinsSniperSuit = suit;
    actor.ruinsSniperLocked = own > foe;
    state.battle?.animQueue?.push({
      type: "revealCards", id: window.GameRandom?.id?.("rsn") || "rsn",
      title: "狙击目标", cards: [{ ...shown }],
    });
    window.BattleLines?.skill?.(state, actor, "狙击目标", target);
    log(state, `${actor.name} 展示${target.name}的${suit}${shown.name}，双方${suit}花色手牌为${own}/${foe}，${actor.ruinsSniperLocked ? "后续单体杀不可响应" : "未取得优势"}。`);
    return true;
  }

  function beforeKillTargeted(state, actor, target, card) {
    if (actor?.ai !== "ruins_sniper" || !actor.ruinsSniperLocked) return;
    if (!target || target.uid !== actor.ruinsSniperTargetUid) return;
    if (!window.CardUtils?.isSingleKill?.(card) && !(isSlash(card) && !card?.sweep)) return;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    log(state, `${actor.name} 的狙击目标触发，对${target.name}的单体杀不可响应。`);
  }

  // 锁定技：攻击型无人机单体【杀】转为毒属性
  function beforeKillUsed(state, actor, card) {
    if (actor?.ai !== "ruins_drone") return;
    if (!isSingleSlash(card)) return;
    card.poison = true;
  }

  function afterDamage(state, actor, target, card, hpLoss) {
    if (!hpLoss || !actor) return;
    if (actor.ai === "ruins_drone" && isSlash(card) && !card?._soulChain) {
      const paralyze = () => window.BattleStatusCards?.add?.(state, target,
        window.BattleStatusCardRegistry?.create("paralysis"), actor.name);
      const poison = () => {
        if (!card?.poison) return;
        window.EnemySkills?.addPoison?.(state, target, 1, actor);
      };
      if (!window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, () => {
        paralyze();
        poison();
      })) { paralyze(); poison(); }
    }
  }

  // ---------- 梅尔卡坦克 · 坦克炮弹 ----------
  function tankMove(state, actor) {
    if (actor?.ai !== "ruins_tank" || actor.usedRuinsTankShell) return null;
    const singles = visible(actor).filter(isSingleSlash);
    if (singles.length < 2) return null;
    // target 用 actor 占位：自动出牌循环要求 target 非空，否则该 move 会被直接跳过
    return { card: { name: "坦克炮弹", _skill: true, ruinsTankShell: true, targetless: true }, target: actor };
  }

  function useTankShell(state, actor) {
    actor.usedRuinsTankShell = true;
    const singles = visible(actor).filter(isSingleSlash).slice(0, 2);
    singles.forEach(card => {
      const index = actor.hand.indexOf(card);
      if (index >= 0) actor.hand.splice(index, 1);
    });
    if (singles.length) {
      window.BattleCards?.putMany?.(state.battle, actor, singles, "discard", { showDiscard: true })
        || singles.forEach(card => window.BattleCards?.put?.(state.battle, actor, card, "discard", { showDiscard: true }));
    }
    actor.ruinsTankShellReady = true;
    window.BattleLines?.skill?.(state, actor, "坦克炮弹");
    log(state, `${actor.name} 弃置${singles.map(card => card.name).join("、")}装填坦克炮弹，下回合准备阶段发射。`);
    return true;
  }

  // 准备阶段：消耗标记，对所有敌方角色造成攻击力2倍伤害，每人需2张【闪】抵消
  function tankPrepare(state, unit, damage) {
    if (unit?.ai !== "ruins_tank" || !unit.ruinsTankShellReady) return;
    unit.ruinsTankShellReady = false;
    const amount = attackOf(unit) * 2;
    const targets = alive(state.battle.allies);
    if (!targets.length) return;
    window.BattleLines?.skill?.(state, unit, "坦克炮弹");
    log(state, `${unit.name} 发射坦克炮弹，对所有敌方角色各造成${amount}点伤害（每人需打出2张闪抵消）。`);
    const card = {
      name: "坦克炮弹", type: "skill", sweep: true, targetless: true,
      twoDodgesRequired: true, virtual: true, scale: "attack",
    };
    const actions = targets.map(target =>
      window.BattleReactionQueue?.damageAction?.(unit, target, amount, "坦克炮弹", card) || {
        kind: "damage", actorUid: unit.uid, targetUid: target.uid,
        amount, source: "坦克炮弹", card,
      });
    if (actions.length && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, damage);
    } else {
      actions.forEach(action => damage(
        state,
        state.battle.allies.find(target => target.uid === action.targetUid),
        action.amount, action.source, unit, action.card,
      ));
    }
  }

  function endTurn(_state, unit) {
    if (unit?.ai === "ruins_drone") unit.ruinsLockedTarget = null;
    if (unit?.ai === "ruins_sniper") {
      unit.ruinsSniperTargetUid = null;
      unit.ruinsSniperSuit = null;
      unit.ruinsSniperLocked = false;
    }
    // 出牌阶段限一次 → 每回合重置
    unit.usedRuinsLandmine = false;
    unit.usedRuinsSnipe = false;
    unit.usedRuinsTankShell = false;
    unit.usedRuinsLandmineRps = false;
  }

  return {
    landmineMove, usePlaceLandmine, sniperMove, useSnipe,
    beforeKillTargeted, beforeKillUsed, afterDamage, endTurn,
    landmineRpsMove, useLandmineRps, playPhaseStart, openLandmineRps,
    resolveLandmineRpsChoice, confirmLandmineRps, skipLandmineRps,
    tankMove, useTankShell, tankPrepare,
  };
})();
