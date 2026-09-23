// 废墟沙城 · 贵族军士兵【地雷猜拳】小游戏（参考樱羽丽莎·吸魔邪眼）
// 再拆分自 ruins-grunt-landmine.js（原 landmine 文件曾逼近 200 行上限）。
// 依赖 landmine.js 的 landmineOf / consumeLandmine，经 window.RuinsGruntLandmine 惰性转发。
// 对外仍经 window.RuinsGruntSkills 转发，调用方无需改动。
window.RuinsGruntRPS = (() => {
  // 惰性解析：加载顺序变化时直接取值会静默拿到 undefined，Proxy 可规避。
  const C = new Proxy({}, { get: (_, key) => window.RuinsGruntCommon?.[key] });
  const L = new Proxy({}, { get: (_, key) => window.RuinsGruntLandmine?.[key] });

  // 持有者赢 → 地雷直接消耗，不受伤；来源赢 → 持有者受伤，地雷消耗
  function settleLandmineRps(state, holder, mine, holderWon) {
    const source = C.unitByUid(state.battle, mine?.landmineSourceUid);
    L.consumeLandmine(state, holder);
    if (holderWon) {
      window.BattleLines?.skill?.(state, holder, "地雷");
      C.log(state, `${holder.name} 猜拳获胜，拆除地雷。`);
      return;
    }
    const amount = mine?.landmineAttack || 0;
    if (amount > 0) {
      const before = holder.hp;
      holder.hp = Math.max(0, holder.hp - amount);
      const loss = before - holder.hp;
      if (loss > 0) {
        window.BattleSystem?.pushFloat?.(state.battle, holder.uid, "hp-loss", loss);
        C.log(state, `${holder.name} 猜拳落败，地雷引爆，受到${amount}点伤害。`);
      }
    }
    window.BattleStatusCardRegistry?.sync?.(holder, state.battle);
  }

  // AI 持有地雷时主动发起猜拳
  function landmineRpsMove(state, actor) {
    if (!actor || actor.usedRuinsLandmineRps) return null;
    if (!L.landmineOf(actor)) return null;
    // target 用 actor 占位：自动出牌循环要求 target 非空，否则该 move 会被直接跳过
    return { card: { name: "地雷猜拳", _skill: true, ruinsLandmineRps: true, targetless: true }, target: actor };
  }

  function useLandmineRps(state, actor) {
    if (actor?.usedRuinsLandmineRps) return true;
    actor.usedRuinsLandmineRps = true;
    const mine = L.landmineOf(actor);
    if (!mine) return true;
    const source = C.unitByUid(state.battle, mine.landmineSourceUid);
    window.BattleLines?.skill?.(state, actor, "地雷");
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const mineChoice = C.RPS[Math.floor(window.GameRandom.value(state) * C.RPS.length)];
      const holderChoice = C.RPS[Math.floor(window.GameRandom.value(state) * C.RPS.length)];
      if (mineChoice === holderChoice) {
        C.log(state, `${actor.name} 与${source?.name || "地雷"}猜拳：${mineChoice}对${holderChoice}，平局，继续猜拳。`);
        continue;
      }
      // mineChoice 代表地雷（来源方）出手
      const holderWon = C.beats(holderChoice, mineChoice);
      C.log(state, `${actor.name} 与${source?.name || "地雷"}猜拳：${holderChoice}对${mineChoice}，${holderWon ? `${actor.name}获胜` : `${source?.name || "地雷"}获胜`}。`);
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
    const mine = L.landmineOf(unit);
    if (!mine) return false;
    const source = C.unitByUid(battle, mine.landmineSourceUid);
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
    const mine = L.landmineOf(unit);
    if (!mine) return null;
    if (state?.battle?.landmineRpsPrompt) return null;
    C.log(state, `${unit.name} 手牌区的【地雷】可以点击发起猜拳：赢了直接拆除，输了受到 ${mine.landmineAttack || 0} 点伤害。`);
    return null;
  }

  function resolveLandmineRpsChoice(state, holderChoice) {
    const battle = state?.battle;
    const prompt = battle?.landmineRpsPrompt;
    if (!prompt || prompt.result || !C.RPS.includes(holderChoice)) return false;
    const holder = C.unitByUid(battle, prompt.holderUid);
    const source = C.unitByUid(battle, prompt.sourceUid);
    if (!holder || holder.hp <= 0) { battle.landmineRpsPrompt = null; battle.locked = false; return false; }
    // sourceChoice/eyeChoice 代表地雷（来源方）出手
    let sourceChoice = C.RPS[Math.floor(window.GameRandom.value(state) * C.RPS.length)];
    if (sourceChoice === holderChoice) {
      window.BattleLines?.skill?.(state, holder, "地雷");
      C.log(state, `${holder.name} 与${source?.name || "地雷"}猜拳：${holderChoice}对${sourceChoice}，平局，继续猜拳。`);
      prompt.result = { holderChoice, sourceChoice, outcome: "tie" };
      prompt.tied = false;
      return true;
    }
    const holderWon = C.beats(holderChoice, sourceChoice);
    window.BattleLines?.skill?.(state, holder, "地雷");
    C.log(state, `${holder.name} 与${source?.name || "地雷"}猜拳：${holderChoice}对${sourceChoice}，${holderWon ? `${holder.name}获胜` : `${source?.name || "地雷"}获胜`}。`);
    prompt.result = { holderChoice, sourceChoice, outcome: holderWon ? "holder" : "source" };
    return true;
  }

  function confirmLandmineRps(state) {
    const battle = state?.battle;
    const prompt = battle?.landmineRpsPrompt;
    const result = prompt?.result;
    if (!prompt || !result) return false;
    const holder = C.unitByUid(battle, prompt.holderUid);
    if (result.outcome === "tie") {
      prompt.result = null;
      prompt.tied = true;
      return true;
    }
    const mine = holder ? L.landmineOf(holder) : null;
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

  return {
    settleLandmineRps, landmineRpsMove, useLandmineRps, playPhaseStart,
    openLandmineRps, resolveLandmineRpsChoice, confirmLandmineRps, skipLandmineRps,
  };
})();
