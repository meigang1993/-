// 【魔王军枪炮师杰明】战斗侧：卫星射线每回合雷伤与死亡转移、战地功勋乘区、
// 火龙火箭筒准备阶段齐射、嘲讽 / 支援两张掉落牌。由 tenri-jamin-skills.js 聚合。
window.TenriJaminCombat = (() => {
  const MAX_CHARGE = 4;
  const alive = unit => !!unit && unit.hp > 0;
  const U = () => window.CardUtils;
  const isJamin = unit => unit?.ai === "tenri_jamin" || unit?.id === "tenri_jamin";
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const equipped = (state, unit, name) => !!window.RelicSystem?.hasEquipped?.(state, unit, name);
  const stat = (unit, key) => (unit?.stats?.[key] || 0) + (key === "attack" ? (unit?.tempAttack || 0) : key === "magic" ? (unit?.tempMagic || 0) : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const line = (state, unit, key, target) => window.BattleLines?.skill?.(state, unit, key, target);
  const foesOf = (state, unit) => unit?.side === "ally" ? (state?.battle?.enemies || []) : (state?.battle?.allies || []);
  const visibleHand = unit => (unit?.hand || []).filter(card => card && !card._pendingDraw && !card.virtual);
  const killCards = unit => visibleHand(unit).filter(card => U()?.isKillCard?.(card));
  const topHp = units => (units || []).filter(alive).sort((a, b) => b.hp - a.hp)[0] || null;
  const intentMax = unit => Math.min(99, Math.max(1, (unit?.stats?.bloodlust || 1) + (unit?.intentMaxBonus || 0)));
  const markStatus = (unit, name) => { unit.statuses ||= []; if (!unit.statuses.includes(name)) unit.statuses.push(name); };
  const unmarkStatus = (unit, name) => { if (Array.isArray(unit?.statuses)) unit.statuses = unit.statuses.filter(x => x !== name); };
  const rayCard = () => ({ name: "卫星射线", type: "skill", magicDamage: true, skipDamageModify: true, skipCriticalFx: true });
  const rocketCard = () => ({ name: "火龙火箭筒", type: "skill", magicDamage: true, skipDamageModify: true, skipCriticalFx: true });
  function rayTick(state, unit, damage) {
    const ray = unit.jaminRay;
    if (!ray || unit.hp <= 0) return;
    const source = (state.battle.allies || []).concat(state.battle.enemies || [])
      .find(item => item?.uid === ray.sourceUid) || unit;
    const amount = Number.isFinite(Number(ray.attack)) ? Math.max(0, Number(ray.attack)) : 0;
    log(state, `${unit.name} 身上的“射线”标记生效，受到${amount}点雷属性伤害。`);
    damage?.directDamage?.(state, unit, amount, "卫星射线", source, 0, rayCard());
  }
  function rocketPrepare(state, unit, damage) {
    const entries = window.BattleCharacterCardStorage?.take?.(unit,
      entry => entry.source === "火龙火箭筒") || [];
    if (!entries.length) return;
    const cards = entries.map(entry => entry.card);
    window.BattleCards?.putMany?.(state.battle, unit, cards, "discard", { showDiscard: true });
    const amount = stat(unit, "attack");
    const targets = foesOf(state, unit).filter(alive);
    log(state, `${unit.name} 弃置角色牌上的${cards.length}张存储【杀】，火龙火箭筒齐射：对${targets.length}名敌方各造成${amount}点火属性伤害。`);
    targets.forEach(enemy => damage?.directDamage?.(state, enemy, amount, "火龙火箭筒", unit, 0, rocketCard()));
  }
  function prepare(state, unit, damage) {
    if (!unit || unit.hp <= 0) return;
    rayTick(state, unit, damage);
    rocketPrepare(state, unit, damage);
  }
  function transferRay(state, dead) {
    if (!dead?.jaminRay) return;
    const ray = dead.jaminRay;
    delete dead.jaminRay;
    unmarkStatus(dead, "射线");
    // 「另一名存活的敌方角色」是相对施加者而言：射线挂在施加者的敌方身上，
    // 死者恰是敌方之一，不能用 foesOf(state, dead)（那会取到施加者自己阵营）。
    // 施加者仍在场时按施加者取敌方；已离场则退化为取死者同阵营的其他存活者。
    const units = (state.battle.allies || []).concat(state.battle.enemies || []);
    const source = units.find(item => item?.uid === ray.sourceUid);
    const pool = source ? foesOf(state, source)
      : units.filter(item => item?.side === dead.side);
    const next = topHp(pool.filter(item => item?.uid !== dead.uid));
    if (!next) { log(state, `${dead.name} 死亡，“射线”标记因无存活敌方目标而消失。`); return; }
    next.jaminRay = ray;
    markStatus(next, "射线");
    log(state, `${dead.name} 死亡，“射线”标记自动转移至${next.name}。`);
  }
  function afterDamage(state, actor, target, card, hpLoss) {
    if (!equipped(state, actor, "战地功勋")) return;
    // 「杀死」= 本次实体牌伤害把目标从存活打到 hp<=0；不能写 alive(target)，
    // 死亡后 hp 已 <=0，那样整段恒不触发。hp+hpLoss>0 同时防多段伤害对尸体重复叠加。
    if (!(hpLoss > 0) || target?.hp > 0 || target.hp + hpLoss <= 0) return;
    if (!U()?.isEntityCard?.(card)) return;
    const atk = actor.stats?.attack || 0, mag = actor.stats?.magic || 0;
    actor.tempAttack = (actor.tempAttack || 0) + atk;
    actor.tempMagic = (actor.tempMagic || 0) + mag;
    log(state, `${actor.name} 的战地功勋生效：击倒${target.name}，本场战斗基础攻击力+${atk}、基础魔力+${mag}（可叠加）。`);
  }
  function useTaunt(state, actor, target, api) {
    const victim = alive(target) && target.side !== actor.side ? target : topHp(foesOf(state, actor));
    if (!victim) return true;
    const slash = visibleHand(victim).find(card => U()?.isEntitySingleKill?.(card));
    if (slash) {
      log(state, `${actor.name} 使用嘲讽，令${victim.name}对其使用一张实体单体【杀】（${slash.name}）。`);
      api?.useCard?.(state, victim, actor, slash);
    } else {
      const discard = visibleHand(victim)[0];
      if (discard) {
        const i = victim.hand.indexOf(discard);
        if (i >= 0) victim.hand.splice(i, 1);
        window.BattleCards?.put?.(state.battle, victim, discard, "discard", { showDiscard: true });
        log(state, `${victim.name} 没有实体单体【杀】，${actor.name} 改为弃置其1张手牌。`);
      } else log(state, `${victim.name} 没有【杀】牌也没有手牌，嘲讽无效果。`);
    }
    return true;
  }
  function useSupport(state, actor, target, api) {
    const receiver = alive(target) && target.side === actor.side ? target
      : (state.battle.allies || []).filter(alive).find(unit => unit.uid !== actor.uid) || actor;
    const card = api?.card?._supportCard && visibleHand(actor).includes(api.card._supportCard)
      ? api.card._supportCard : visibleHand(actor)[0];
    if (!card) { log(state, `${actor.name} 使用支援失败：没有可交出的手牌。`); return true; }
    const i = actor.hand.indexOf(card);
    if (i >= 0) actor.hand.splice(i, 1);
    (receiver.hand ||= []).push(card);
    window.BattleCards?.syncStatusCards?.(receiver);
    state.battle.animQueue?.push({ type: "giveCards", uid: actor.uid, side: actor.side,
      toUid: receiver.uid, count: 1, cards: [card], stagger: 0 });
    log(state, `${actor.name} 使用支援，将1张手牌交给${receiver.name}。`);
    return true;
  }
  return { prepare, transferRay, afterDamage, useTaunt, useSupport };
})();
