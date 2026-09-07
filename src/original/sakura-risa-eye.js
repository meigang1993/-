window.SakuraRisaEye = (() => {
  const choices = ["石头", "剪刀", "布"];
  const isRisa = unit => unit?.id === "assassin_sakura_risa" || unit?.ai === "assassin_sakura_risa";
  const beats = (a, b) => a === "石头" && b === "剪刀" || a === "剪刀" && b === "布" || a === "布" && b === "石头";
  const foesOf = (battle, unit) => unit?.side === "enemy" ? battle.allies : battle.enemies;
  const unitByUid = (battle, uid) => battle.allies.concat(battle.enemies).find(unit => unit.uid === uid);

  function orderedRisas(battle, unit) {
    const foes = new Set(foesOf(battle, unit));
    const ordered = window.BattleSystem?.order?.(battle) || battle.allies.concat(battle.enemies);
    return ordered.filter(risa => foes.has(risa) && isRisa(risa) && risa.hp > 0);
  }

  function autoResolve(state, unit, risas, random) {
    const battle = state.battle;
    for (const risa of risas) {
      window.BattleLines?.skill(state, risa, "吸魔邪眼", unit);
      for (let attempt = 0; attempt < 32; attempt += 1) {
        let eye = choices[Math.floor(random() * choices.length)];
        const foe = choices[Math.floor(random() * choices.length)];
        if (eye === foe && attempt === 31) eye = choices[(choices.indexOf(foe) + (random() < 0.5 ? 1 : 2)) % choices.length];
        if (eye === foe) {
          window.BattleLog.add(state, `${risa.name} 与${unit.name}猜拳：${eye}对${foe}，平局，继续猜拳。`);
          continue;
        }
        const won = beats(eye, foe);
        window.BattleLog.add(state, `${risa.name} 与${unit.name}猜拳：${eye}对${foe}，${won ? `${risa.name}获胜` : `${unit.name}获胜`}。`);
        if (won) battle.risaEye = { ownerUid: risa.uid, targetUid: unit.uid };
        break;
      }
      if (battle.risaEye) return battle.risaEye;
    }
    return null;
  }

  function showCurrent(state) {
    const battle = state.battle, prompt = battle?.risaEyePrompt;
    if (!prompt) return false;
    while (prompt.index < prompt.risaUids.length) {
      const risa = unitByUid(battle, prompt.risaUids[prompt.index]);
      if (risa?.hp > 0) {
        window.BattleLines?.skill(state, risa, "吸魔邪眼", unitByUid(battle, prompt.targetUid));
        return true;
      }
      prompt.index += 1;
    }
    battle.risaEyePrompt = null;
    battle.locked = false;
    return false;
  }

  function playPhaseStart(state, unit, random = () => window.GameRandom.value(state)) {
    const battle = state?.battle;
    if (!battle || !unit || unit.hp <= 0) return null;
    battle.risaEye = null;
    battle.risaEyePrompt = null;
    const risas = orderedRisas(battle, unit);
    if (!risas.length) return null;
    if (unit.side !== "ally") return autoResolve(state, unit, risas, random);
    battle.risaEyePrompt = { targetUid: unit.uid, risaUids: risas.map(risa => risa.uid), index: 0, attempts: 0, tied: false, result: null };
    battle.locked = true;
    battle.selectedCardIndex = null;
    battle.selectedCostCardIndex = null;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = null;
    showCurrent(state);
    return null;
  }

  function resolveChoice(state, targetChoice, random = () => window.GameRandom.value(state)) {
    const battle = state?.battle, prompt = battle?.risaEyePrompt;
    if (!prompt || prompt.result || !choices.includes(targetChoice)) return false;
    const target = unitByUid(battle, prompt.targetUid), risa = unitByUid(battle, prompt.risaUids[prompt.index]);
    if (!target || target.hp <= 0 || !risa || risa.hp <= 0) {
      prompt.index += 1;
      prompt.attempts = 0;
      prompt.tied = false;
      return showCurrent(state);
    }
    let eyeChoice = choices[Math.floor(random() * choices.length)];
    if (eyeChoice === targetChoice && prompt.attempts >= 31) {
      const alternatives = choices.filter(choice => choice !== targetChoice);
      eyeChoice = alternatives[Math.floor(random() * alternatives.length)];
    }
    prompt.result = { eyeChoice, targetChoice, outcome: eyeChoice === targetChoice ? "tie" : beats(eyeChoice, targetChoice) ? "risa" : "target" };
    if (eyeChoice === targetChoice) {
      prompt.attempts += 1;
      prompt.tied = false;
      window.BattleLog.add(state, `${risa.name} 与${target.name}猜拳：${eyeChoice}对${targetChoice}，平局，继续猜拳。`);
      return true;
    }
    const won = beats(eyeChoice, targetChoice);
    window.BattleLog.add(state, `${risa.name} 与${target.name}猜拳：${eyeChoice}对${targetChoice}，${won ? `${risa.name}获胜` : `${target.name}获胜`}。`);
    return true;
  }

  function confirmResult(state) {
    const battle = state?.battle, prompt = battle?.risaEyePrompt, result = prompt?.result;
    if (!prompt || !result) return false;
    const target = unitByUid(battle, prompt.targetUid), risa = unitByUid(battle, prompt.risaUids[prompt.index]);
    if (result.outcome === "tie") {
      prompt.result = null;
      prompt.tied = true;
      return true;
    }
    if (result.outcome === "risa" && target && risa) {
      battle.risaEye = { ownerUid: risa.uid, targetUid: target.uid };
      battle.risaEyePrompt = null;
      battle.locked = false;
      return true;
    }
    prompt.index += 1;
    prompt.attempts = 0;
    prompt.tied = false;
    prompt.result = null;
    showCurrent(state);
    return true;
  }

  return { playPhaseStart, resolveChoice, confirmResult };
})();
