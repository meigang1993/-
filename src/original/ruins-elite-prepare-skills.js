// 废墟沙城精英 · 准备阶段两个技能（影舞步 / 增援部队）
// 从 ruins-elite-skills.js 拆出：两者只由 prepare() 调用，边界完整；主文件保留
// 潜影背刺、暗幕隐身与各代理函数。无状态 helper 在子模块内自带一份，避免跨模块
// 隐式依赖。装配点在主文件显式 throw，本文件必须先于主文件加载。
window.RuinsElitePrepareSkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const black = card => card?.suit === "♠" || card?.suit === "♣";
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  // 摸牌兜底：BattleSystem.draw 未装配时仍按同一口径从本单位摸牌堆补齐。
  const refill = (state, u, n) => { for (let i = 0; i < n; i += 1) { window.BattlePileStats?.reshuffle?.(u); const c = u.deck?.pop(); if (!c) break; if (state.battle?.animQueue) c._pendingDraw = true; u.hand.push(c); } };

  // 影舞步：连续判定直到出现红色牌为止，不再限张数（原实现硬编码上限 6 张）。
  // 判定过的牌先暂存、循环结束再统一进弃牌堆——原写法每判定一张就推进弃牌堆，
  // 洗牌堆会把它重新洗回牌堆，全黑牌库时会无限循环卡死浏览器。
  function shadowDance(state, unit) {
    const judged = [];
    // 兜底上限：牌堆+弃牌堆张数有限，每轮永久消耗一张，理论上必然终止；
    // 留一道硬上限只为防病态数据（如洗牌回调被改动）导致死循环。
    const cap = ((unit.deck?.length || 0) + (unit.discard?.length || 0)) * 2 + 8;
    let drawn = 0;
    while (judged.length <= cap) {
      window.BattlePileStats?.reshuffle(unit);
      const card = unit.deck?.pop();
      if (!card) break;
      if (!card._pendingDraw) judged.push(card);
      state.battle?.animQueue?.push({
        type: "judgement", id: window.GameRandom?.id?.("hd") || "hd",
        skill: "影舞步", suit: card.suit, name: card.name, card,
        discardTo: unit.discard, success: black(card),
        color: black(card) ? "black" : "red", uid: unit.uid,
      });
      if (!black(card)) {
        log(state, `${unit.name} 影舞步判定：${card.suit}${card.name}，停止。`);
        break;
      }
      const gain = window.CardUtils?.copyPlayable?.(card,
        { temporary: true, void: true, noIntentCost: true, generatedBySkill: "影舞步" });
      if (gain) { if (state.battle?.animQueue) gain._pendingDraw = true; unit.hand.push(gain); drawn += 1; }
      log(state, `${unit.name} 影舞步判定：${card.suit}${card.name}，获得该黑色判定牌。`);
    }
    judged.forEach(card => unit.discard.push(card));
    if (drawn) {
      state.battle?.animQueue?.push({ type: "gainCards", uid: unit.uid, side: unit.side, count: drawn, cards: unit.hand.slice(-drawn) });
      window.BattleLines?.skill?.(state, unit, "影舞步");
    }
  }

  function reinforce(state, unit) {
    const dead = (state.battle.enemies || []).filter(enemy => enemy.hp <= 0 && enemy !== unit);
    if (!dead.length) return;
    // 死亡弃牌挂在 checkDefeat 的 hp<=0 过滤上：死亡浮字未播完（pendingFatalAnim）
    // 会整段跳过，而增援先把 hp 抬回正数，那次补弃便永远轮不到；deathDiscarded 残留
    // 还会让再次阵亡不再弃牌。统一在此补弃 + 清标记，再以纯补给摸至手牌上限。
    const draw = window.BattleSystem?.draw;
    dead.forEach(enemy => {
      const cards = (enemy.hand || []).splice(0);
      if (cards.length) window.BattleCards?.putMany?.(state.battle, enemy, cards, "discard", { skipAfterHandLost: true });
      delete enemy.deathDiscarded;
      enemy.hp = window.BattleHpValue.maxHp(enemy);
      const limit = window.NoaSideEffectSkills?.handLimit?.(enemy)
        ?? Math.max(0, Math.floor(Number(enemy.stats?.handLimit) || 0));
      const need = Math.max(0, limit - visible(enemy).length);
      // 纯补给：不触发摸牌类饰品，也不被吸魔邪眼转交或封魔克扣。
      if (need) draw ? draw(enemy, need, state.battle, null, { cleanRefill: true })
        : refill(state, enemy, need);
    });
    const loss = dead.length * Math.ceil((unit.maxHp || 1) * 0.1);
    const before = unit.hp;
    window.BattleHpValue.applyDamage(unit, loss); window.SakuraRisaSkills?.preventDeath?.(state, unit);
    const lost = before - unit.hp;
    if (lost > 0) window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "hp-loss", lost);
    window.BattleLines?.skill?.(state, unit, "增援部队");
    log(state, `${unit.name} 发动增援部队，满血复活${dead.length}名友军，弃置其所有手牌并摸至手牌上限，损失${lost}点生命。`);
  }

  return { shadowDance, reinforce };
})();
