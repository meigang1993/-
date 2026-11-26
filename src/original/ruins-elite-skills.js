window.RuinsEliteSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const black = card => card?.suit === "♠" || card?.suit === "♣";
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const singleKill = card => window.CardUtils?.isSingleKill?.(card) || (isSlash(card) && !card?.sweep && !card?.allTargets);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  // 准备阶段两技能（影舞步 / 增援部队）拆分到 ruins-elite-prepare-skills.js
  // （主文件逼近 189 行硬约束）。显式抛错：子模块漏加载时立刻失败，不允许静默兜底。
  if (!window.RuinsElitePrepareSkills) {
    throw new Error("ruins-elite-skills: 缺少子模块 RuinsElitePrepareSkills（ruins-elite-prepare-skills.js 必须先于本文件加载）");
  }
  const { shadowDance, reinforce } = window.RuinsElitePrepareSkills;

  // 暗幕隐身（锁定技）：有黑色牌时不会成为「实体单体【杀】牌」的目标。
  // 只挡实体牌：虚拟杀（技能/饰品「视为使用一张杀」、fromEntity / useVirtualKill
  // 生成的牌）带 virtual，按 CardUtils.isEntityCard 口径不是实体牌，可正常指定。
  // 转换杀（convertAs，convertedFrom）无 virtual，仍算实体牌，照常不可指定。
  // 实时判定而非回合制缓存：缓存只在她自己准备阶段刷新，我方回合会读到
  // 上回合的过期值，锁定技便时灵时不灵。
  // 时停：暗幕隐身归属「希尔德本人」，被标记时失效。
  // 守卫写在技能内部而非调用点 —— 它有三个互不重合的入口：目标选择逻辑
  // （battle-combat-targeting）、饰品自动斩（battle-relic-turns）、UI 敌方可选高亮
  // （ui-battle-targeting），在调用点逐个加判必然漏掉一条。
  // 时停模块在本文件之前的同一 bundle 分组内，必然已装配。
  const stopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);
  const stealthOn = unit => !stopped(unit) && unit?.ai === "ruins_hilde"
    && visible(unit).some(black);
  const entitySingleKill = card => !!card && singleKill(card)
    && (window.CardUtils?.isEntityCard?.(card)
      ?? (!card.virtual && !card.generatedBySkill && card.type !== "skill"));
  const blocksKillTarget = (unit, card) => entitySingleKill(card) && stealthOn(unit);

  function prepare(state, unit, damage) {
    if (!unit) return;
    if (unit.ai === "ruins_hilde") shadowDance(state, unit);
    if (unit.ai === "ruins_carrier") reinforce(state, unit);
  }

  // 潜影背刺：结束阶段发动（描述即为「结束阶段」）。
  // 此前挂在出牌阶段的 aiMove 上，与描述不符；且出牌阶段不限次会反复触发，
  // 故旧实现加了「每回合一次」守卫。结束阶段本身每回合只跑一次
  // （battle-end-phase 用 endPhaseStep 保证步骤不重入），限次由阶段天然保证，
  // 不再需要 usedRuinsBackstab 标记。
  function backstabEndPhase(state, unit, damage) {
    if (unit?.ai !== "ruins_hilde" || unit.hp <= 0) return false;
    // 每回合一次：以 battle.turn 为键（与 abe-mike 的 abeMikeDanceTurn 同一范式），
    // 不依赖准备阶段清零，避免准备阶段被跳过时永久失效。
    if (unit.ruinsBackstabTurn === state?.battle?.turn) return false;
    if (!visible(unit).some(black)) return false;
    unit.ruinsBackstabTurn = state?.battle?.turn;
    const targets = alive(state.battle.allies);
    const target = targets.sort((left, right) => left.hp - right.hp)[0];
    if (!target) return false;
    useBackstab(state, unit, target, damage);
    return true;
  }

  function useBackstab(state, actor, target, damage) {
    const amount = stat(actor, "attack");
    window.BattleLines?.skill?.(state, actor, "潜影背刺", target);
    damage(state, target, amount, "潜影背刺", actor,
      { name: "潜影背刺", type: "skill", ignoreResponse: true, skipDamageModify: true });
    log(state, `${actor.name} 发动潜影背刺，对${target.name}造成${amount}点物理伤害。`);
    return true;
  }

  // 战场扫射（⚔️）与继续压制（⭐）：实现拆到 ruins-helicopter-skills.js
  // （本文件超 200 行硬约束），此处仅代理。
  // 注：战场扫射的产物必须以实体牌【机枪扫杀】为模板（与机尾机枪同一范式）。
  // 此前手搓 { name:"战场扫射", sweep:true }，既无 type:"slash" 也无 scale / responseKind，
  // 攻击流程的 attacks 判定不成立，实测打出后伤害恒为 0。
  const helicopter = () => window.RuinsHelicopterSkills;
  function helicopterMove(state, actor) {
    return helicopter()?.helicopterMove?.(state, actor) ?? null;
  }
  function afterDodged(state, actor, target, card) {
    helicopter()?.afterDodged?.(state, actor, target, card);
  }

  // 坚硬装甲（锁定技）：不会受到任何伤害，且无法恢复自身生命值。
  // 实现拆到 ruins-carrier-armor.js（本文件超 200 行硬约束），此处仅代理。
  // 注意：代理为惰性取值，要求 ruins-carrier-armor.js 已注册进同一 bundle 分组。
  const carrierArmor = () => window.RuinsCarrierArmor;

  const immuneIncoming = (state, target, card) =>
    carrierArmor()?.immuneIncoming?.(state, target, card) ?? false;

  function modifyDamage(state, target, amount, card) {
    return carrierArmor()?.modifyDamage?.(state, target, amount, card) ?? amount;
  }

  // 增援部队的满血复活与 10% 生命损失都是直接改写 unit.hp（不走治疗链），故不受本条影响。
  function beforeHeal(state, target, amount) {
    return carrierArmor()?.beforeHeal?.(state, target, amount) ?? amount;
  }

  // 无脑冲撞（锁定技）：实现拆到 ruins-carrier-ram.js（本文件超 200 行硬约束），此处仅代理。
  // 代理为惰性取值，要求 ruins-carrier-ram.js 已注册进同一 bundle 分组且先于本文件加载。
  function carrierRamMove(state, actor) {
    return window.RuinsCarrierRam?.carrierRamMove?.(state, actor) ?? null;
  }

  function endTurn(state, unit, damage) {
    if (unit?.ai === "ruins_hilde") backstabEndPhase(state, unit, damage);
    if (unit?.ai === "ruins_helicopter") {
      unit.ruinsSuppressDraws = 0;
    }
  }

  return {
    prepare, backstabEndPhase, useBackstab, stealthOn,
    blocksKillTarget, helicopterMove, afterDodged, modifyDamage,
    immuneIncoming, beforeHeal,
    carrierRamMove, endTurn,
  };
})();
