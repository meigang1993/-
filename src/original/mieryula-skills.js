// 米尔尤拉（嗜血公主）技能：渴血杀戮 / 无谋霸姬 / 神奇怀表。
// 独立成模块是为了不让 battle-combat.js 等大文件继续膨胀；
// 时停标记在 mieryula-time-stop.js，本文件只负责技能逻辑。
window.MieryulaSkills = (() => {
  // 与 skill-once-per-turn 同一口径：缺文件时直接抛错，而不是静默放行。
  function TS() {
    const stop = window.MieryulaTimeStop;
    if (!stop?.mark) throw new Error(
      "[mieryula-time-stop] 时停模块未装配：mieryula-time-stop.js 必须先于 mieryula-skills.js 加载");
    return stop;
  }
  const alive = unit => !!unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isMieryula = unit => unit?.ref === "mieryula" || unit?.id === "mieryula";
  const hasSkill = (unit, name) =>
    (unit?.skills || []).some(skill => skill.name === name);
  const attackOf = unit => (unit?.stats?.attack || 0) + (unit?.tempAttack || 0);
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);
  const isTactic = card => !!card && card.type === "tactic";

  // ------------------------------------------------------- 无谋霸姬（锁定）
  // 战术牌对她无效：指定她的战术牌不产生效果。
  function immunizesTactic(state, target, card) {
    if (!isMieryula(target) || !alive(target)) return false;
    if (!hasSkill(target, "无谋霸姬") || !isTactic(card) || card._skill) return false;
    return true;
  }
  // 她无法使用战术牌：手牌区的战术牌一律不可打出。
  function blocksTactic(actor, card) {
    if (!isMieryula(actor) || !alive(actor)) return false;
    // 技能牌（渴血杀戮/神奇怀表）本身是战术牌类型，不受「无法使用战术牌」限制。
    if (!hasSkill(actor, "无谋霸姬") || !isTactic(card) || card._skill) return false;
    return true;
  }
  // 战术牌指定她时的统一拦截入口：返回 true 表示这张牌对她完全不产生效果。
  // 此前源码里没有任何地方调用 immunizesTactic —— 只有测试直接调它，
  // 于是「战术牌对你无效」这条锁定技实际完全不生效（手牌照样被弃、伤害照常结算）。
  function interceptTactic(state, actor, target, card) {
    if (!immunizesTactic(state, target, card)) return false;
    line(state, target, "无谋霸姬", actor);
    window.BattleLog?.add(state, `${actor?.name || "对方"} 对${target.name}使用${card?.name || "战术牌"}，`
      + `但${target.name}免疫战术牌，此牌没有任何效果。`);
    return true;
  }
  const hasTacticInHand = unit => visible(unit).some(isTactic);
  // 手牌中没有战术牌时，实体牌与虚拟牌造成的伤害翻倍。
  function modifyOutgoingDamage(state, actor, amount, card) {
    if (!isMieryula(actor) || !alive(actor) || !(amount > 0)) return amount;
    if (!hasSkill(actor, "无谋霸姬") || hasTacticInHand(actor)) return amount;
    if (!card) return amount;
    // 技能伤害（type:"skill"）不属于「实体牌或虚拟牌」，不翻倍。
    if (card.type === "skill") return amount;
    line(state, actor, "无谋霸姬造成伤害");
    return amount * 2;
  }

  // ------------------------------------------------------- 渴血杀戮（主动）
  // 可选牌名：全部正式【杀】牌（与温蒂【解答迷惑】的牌池同源）。
  function slashPool(state) {
    const byName = new Map();
    const codex = window.GameData?.cardCodex || [];
    const sources = codex.length ? codex
      : [...(state?.deck || []), ...(state?.explore?.earned?.cards || [])];
    sources.filter(card => card.type === "slash" && !card._skill
      && !card.virtual && !card.temporary).forEach(card => {
      if (!byName.has(card.name)) byName.set(card.name, card);
    });
    return [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }
  // 本回合每项限一次：已选过的牌名不再出现在选项里。
  function availableSlashNames(state, actor) {
    const used = actor?.mieryulaBloodthirstUsed || {};
    return slashPool(state).filter(card => !used[card.name]).map(card => card.name);
  }
  function openBloodthirst(state, actor) {
    if (!availableSlashNames(state, actor).length) return false;
    state.battle.mieryulaBloodthirstPicker = { uid: actor.uid, cardName: null };
    state.battle.locked = true;
    return true;
  }
  function chooseBloodthirstCard(state, name) {
    const battle = state?.battle;
    const picker = battle?.mieryulaBloodthirstPicker;
    const actor = picker && allUnits(battle).find(u => u.uid === picker.uid);
    if (!picker || !actor || picker.cardName) return false;
    if (!availableSlashNames(state, actor).includes(name)) return false;
    picker.cardName = name;
    return true;
  }
  // 玩家点敌方角色后真正打出这张虚拟牌；不消耗杀意。
  function useBloodthirstVirtual(state, targetUid, ctx) {
    const battle = state?.battle;
    const picker = battle?.mieryulaBloodthirstPicker;
    const actor = picker && allUnits(battle).find(u => u.uid === picker.uid);
    if (!picker?.cardName || !actor) return false;
    const target = (battle.enemies || []).find(u => u.uid === targetUid && alive(u));
    if (!target) return false;
    const name = picker.cardName;
    const card = window.CardUtils?.fromEntity(name, {
      virtual: true, _skill: true, _skipHandMove: true,
      mieryulaBloodthirstVirtual: true, noBloodlustCost: true,
    });
    if (!card) return false;
    battle.mieryulaBloodthirstPicker = null;
    battle.locked = false;
    actor.mieryulaBloodthirstUsed ||= {};
    actor.mieryulaBloodthirstUsed[name] = true;
    line(state, actor, "渴血杀戮", target);
    window.BattleLog?.add(state,
      `${actor.name} 将鲜血化作${name}，视为使用一张虚拟${name}且不消耗杀意。`);
    ctx?.useCard?.(state, actor, target, card);
    return true;
  }
  function cancelBloodthirst(state) {
    const battle = state?.battle;
    if (!battle?.mieryulaBloodthirstPicker) return false;
    battle.mieryulaBloodthirstPicker = null;
    battle.locked = false;
    return true;
  }

  // ------------------------------------------------- 技能牌入口（战斗分发）
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (!isMieryula(actor) || !alive(actor)) return false;
    if (!state?.battle) return false;

    // 神奇怀表：限定技，指定所有敌方角色并施加时停。
    if (card?.mieryulaTimeStop) {
      if (actor.usedMieryulaTimeStop) return true;
      actor.usedMieryulaTimeStop = true;
      line(state, actor, "神奇怀表");
      const count = TS().mark(state, actor);
      window.BattleLog?.add(state, count
        ? `${actor.name} 发动神奇怀表，${count}名敌方角色被时停，将跳过其回合且技能失效。`
        : `${actor.name} 发动神奇怀表，但没有可时停的敌方角色。`);
      return true;
    }

    // 渴血杀戮：对友方男性造成攻击力伤害，随后选择一项杀牌牌名。
    if (card?.mieryulaBloodthirst) {
      if (!target || target.side !== actor.side || target.uid === actor.uid
        || target.gender !== "male" || !alive(target)) return true;
      line(state, actor, "渴血杀戮", target);
      const amount = attackOf(actor);
      // 与女王榨取同口径：技能伤害不再被后续修正链二次放大。
      ctx?.damage?.(state, target, amount, "渴血杀戮", actor,
        { name: "渴血杀戮", type: "skill", mieryulaBloodthirst: true,
          ignoreResponse: true, skipDamageModify: true });
      window.BattleLog?.add(state,
        `${actor.name} 发动渴血杀戮，对${target.name}造成${amount}点伤害。`);
      // 敌方拿到该技能时自动完成，不锁定界面等待玩家替它选牌。
      return actor.side === "ally" ? openBloodthirst(state, actor) : true;
    }
    return false;
  }

  // ------------------------------------------------------------ 回合流转
  // 米尔尤拉的下个回合开始时解除时停，并清空「本回合每项限一次」的记录。
  function onTurnStart(state, unit) {
    const battle = state?.battle;
    if (!battle) return;
    // 兜底：时停拥有者一旦阵亡，就永远等不到「她的下一个回合开始」，
    // 标记会永久留在敌人身上、BGM 的 suspend 也永不 resume（整局静音）。
    // 所以每个回合开始都检查一次拥有者是否还活着。
    const ownerUid = battle.mieryulaTimeStopOwner;
    if (ownerUid) {
      const owner = allUnits(battle).find(item => item.uid === ownerUid);
      if (!owner || owner.hp <= 0) TS().clear(state);
    }
    if (!isMieryula(unit)) return;
    unit.mieryulaBloodthirstUsed = {};
    const owner = battle.mieryulaTimeStopOwner;
    if (owner === unit.uid || !owner) TS().clear(state);
  }

  return {
    immunizesTactic, interceptTactic, blocksTactic, hasTacticInHand, modifyOutgoingDamage,
    slashPool, availableSlashNames, chooseBloodthirstCard, useBloodthirstVirtual,
    cancelBloodthirst, handleSpecialCard, onTurnStart,
  };
})();
