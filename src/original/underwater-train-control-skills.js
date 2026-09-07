window.UnderwaterTrainControlSkills = (shared) => {
  const { alive, visible, stat } = shared;
  function flashbangMove(state, actor) {
    if (actor.ai !== "shark_captain_mordio" || actor.usedFlashbang || !sameSuitPair(actor)) return null;
    return { card: { name: "震感闪光弹", _skill: true, flashbang: true, targetless: true }, target: actor };
  }
  function controlEyeMove(state, actor) {
    if (actor.ai !== "raff_assassin" || actor.usedControlEye) return null;
    const heart = visible(actor).find(c => c.suit === "♥"), foes = alive(state.battle.allies);
    if (!heart || foes.length < 2) return null;
    return { card: { name: "控神魔眼", _skill: true, controlEye: true, targetless: true }, target: actor };
  }
  function useFlashbang(state, actor) {
    if (actor.usedFlashbang) return true; const pair = sameSuitPair(actor);
    if (!pair) { window.BattleLog.add(state, `${actor.name} 发动震感闪光弹失败：没有两张同花色牌。`); return true; }
    actor.usedFlashbang = true;
    window.BattleCards?.putMany?.(state.battle, actor, pair.map(x => x.i).sort((a, b) => b - a).map(i => actor.hand.splice(i, 1)[0]), "discard", { showDiscard: true }); alive(state.battle.allies).forEach(u => addStun(state, actor, u));
    window.BattleLines?.skill(state, actor, "震感闪光弹"); window.BattleLog.add(state, `${actor.name} 发动震感闪光弹，我方全体获得眩晕状态牌。`); return true;
  }
  function useControlEye(state, actor, damage, draw) {
    if (actor.usedControlEye) return true;
    const foes = alive(state.battle.allies), heartIndex = actor.hand.findIndex(c => c.suit === "♥" && !c._pendingDraw);
    if (heartIndex < 0 || foes.length < 2) return true;
    actor.usedControlEye = true;
    const [heart] = actor.hand.splice(heartIndex, 1); window.BattleCards?.put(state.battle, actor, heart, "discard", { showDiscard: true });
    const first = foes.slice().sort((a, b) => stat(b, "attack") - stat(a, "attack") || b.hp - a.hp)[0];
    const second = foes.filter(u => u.uid !== first.uid).sort((a, b) => b.hp - a.hp)[0];
    window.BattleLines?.skill(state, actor, "控神魔眼", first); window.BattleLog.add(state, `${actor.name} 发动控神魔眼，令${first.name}向${second.name}发起与我一战。`);
    const duel = window.CardUtils.fromEntity("与我一战", { _skipHandMove: true, skillName: "控神魔眼" });
    state.battle.animQueue?.push({ type: "virtualPlay", id: window.GameRandom.id("cd"), uid: first.uid, side: first.side, targetUid: second.uid, card: duel, enemyLine: false, show: true });
    const n = resolveControlDuel(state, first, second, damage);
    if (n) { const drawn = draw(actor, n, state.battle); window.BattleLog.add(state, `${actor.name} 因控神魔眼${window.BattleDrawFeedback.action(actor, n, drawn)}。`); }
    return true;
  }
  function sameSuitPair(actor) {
    const groups = visible(actor).reduce((m, c) => (c.suit && ((m[c.suit] = m[c.suit] || []).push({ c, i: actor.hand.indexOf(c) })), m), {});
    return Object.values(groups).find(list => list.length >= 2)?.slice(0, 2) || null;
  }
  function addStun(state, actor, target) {
    const card = window.BattleStatusCards?.create?.("stun");
    window.BattleStatusCards?.add?.(state, target, card);
  }
  function resolveControlDuel(state, first, second, damage) {
    if (!second.hand.some(c => c.name === "杀（普攻）" && !c._pendingDraw)) { damage(state, second, stat(first, "attack"), "控神魔眼·与我一战", first, { name: "与我一战", type: "tactic", ignoreResponse: true, _skill: true }); return 0; }
    let holder = second, other = first, last = first, count = 0;
    while (true) {
      const i = holder.hand.findIndex(c => c.name === "杀（普攻）" && !c._pendingDraw);
      if (i < 0) break;
      const slash = holder.hand.splice(i, 1)[0]; window.BattleCards?.put(state.battle, holder, slash, "discard", { skipAnim: true });
      state.battle.animQueue?.push({ type: "virtualPlay", id: window.GameRandom.id("ce"), uid: holder.uid, side: holder.side, targetUid: other.uid, card: slash, enemyLine: false, slashText: true });
      slash._playedByName = holder.name; slash._playedAction = "打出了"; state.battle.played.unshift({ ...slash });
      window.BattleLog.add(state, `${holder.name} 在控神魔眼决斗中打出${slash.suit || ""}${slash.name}。`);
      count += 1; last = holder; [holder, other] = [other, holder];
    }
    damage(state, holder, stat(last, "attack"), "控神魔眼·与我一战", last, { name: "与我一战", type: "tactic", ignoreResponse: true, _skill: true });
    return count;
  }
  return { flashbangMove, controlEyeMove, useFlashbang, useControlEye };
};
