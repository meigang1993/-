window.BattleDamageResolutionModifiers = ({ deps }) => {
  // 统一伤害数值修正链（原 battle-damage-resolution.js 的 46~97 行）。
  // 整段只读写 amount / source，外加时停与来源归属判据，是分辨率最高、
  // 与其它段落耦合最小的一块，故单独拆出以给主文件留出硬约束余量。
  // 计算顺序必须逐条保持：免疫判定在 Math.max(1,...) 之前，否则 0 会被抬成 1。
  function compute(state, target, amount, source, actor, effectiveCard) {
    const effectiveActor =
      window.NonokaLokiSkills?.sourceActor?.(state.battle, actor) || actor;
    // 时停：技能归属方被标记时，其增减伤 / 免疫 / 压制类被动一律失效
    // （主动技另由 canPlay 拦截）。判据按归属方区分，避免误伤非标记方。
    const tsStopped = unit => !!window.MieryulaTimeStop?.isSkillDisabled?.(unit);
    const tsBlocked = tsStopped(actor) || tsStopped(effectiveActor);
    const tsInStopped = tsStopped(target);
    // 智能大脑（战术牌造成的伤害翻倍）：放在统一伤害结算链里，
    // 才能覆盖与我一战 / 魔法对决 / 魔弹特攻 / 魔王军入侵等不走攻击流程的战术牌。
    amount = window.RuinsRelicEffects?.tacticDamage?.(
      state, actor, effectiveCard, amount) ?? amount;
    if (!tsBlocked) amount = window.BakarSkills?.modifyOutgoingDamage?.(
      state, actor, amount, effectiveCard, effectiveActor) ?? amount;
    if (!tsBlocked) amount = window.BondiSkills?.modifyOutgoingDamage?.(
      state, actor, amount, effectiveCard) ?? amount;
    // 力量爆发：实体【杀】结算完成后累积的伤害增益，作用于安洁莉卡造成的所有伤害。
    if (!tsBlocked) amount = window.AngelicaLukaSkills?.modifyOutgoingDamage?.(
      state, effectiveActor, amount, effectiveCard) ?? amount;
    // 魅魔吸精术「对无性别角色造成的伤害为2倍」：需拿到被打者才能判性别，
    // 故与 BakarSkills / BondiSkills 同走 outgoing 链。
    amount = window.RuinsWithererSkills?.modifyOutgoingDamage?.(
      state, actor, target, amount, effectiveCard) ?? amount;
    // 女王威压：手牌为全场最多时，普雷希造成的伤害翻倍。
    if (!tsBlocked) amount = window.PreshiSkills?.modifyOutgoingDamage?.(
      state, effectiveActor, amount, effectiveCard) ?? amount;
    // 无谋霸姬：手牌中没有战术牌时，米尔尤拉的实体牌与虚拟牌伤害翻倍。
    amount = window.MieryulaSkills?.modifyOutgoingDamage?.(
      state, effectiveActor, amount, effectiveCard) ?? amount;
    if (!effectiveCard?.skipDamageModify) {
      amount = window.EnemySkills?.modifyDamage(
        state, target, amount, effectiveCard) ?? amount;
    }
    if (!tsInStopped) amount = window.BondiSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    if (!tsInStopped) amount = window.BakarSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 女王威压：手牌为全场最多时，普雷希受到的伤害同样翻倍。
    if (!tsInStopped) amount = window.PreshiSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    source = window.NonokaLokiSkills?.sourceLabel?.(
      state.battle, actor, source) || source;
    if (!tsInStopped) amount = window.RuinsCardSkills?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 粉色魅魔装（被动）：红色牌对该角色无效。
    if (!tsInStopped) amount = window.RuinsRelicEffects?.modifyIncomingDamage?.(
      state, target, amount, effectiveCard) ?? amount;
    // 坚硬装甲：免疫判定必须放在 Math.max(1,...) 之前，否则 0 会被抬成 1。
    // 也不能只依赖 EnemySkills.modifyDamage——该调用被 skipDamageModify 短路。
    if (!tsInStopped && window.RuinsEliteSkills?.immuneIncoming?.(state, target, effectiveCard)) {
      amount = 0;
    }
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    return { amount, source, effectiveActor, tsBlocked, tsInStopped };
  }
  return { compute };
};
