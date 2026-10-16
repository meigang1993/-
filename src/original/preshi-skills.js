window.PreshiSkills = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isPreshi = unit => unit?.ref === "preshi" || unit?.id === "preshi";
  const hasSkill = (unit, name) =>
    (unit?.skills || []).some(skill => skill.name === name);
  const magicOf = unit => (unit?.stats?.magic || 0) + (unit?.tempMagic || 0);
  const allUnits = battle => (battle?.allies || []).concat(battle?.enemies || []);
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);
  // 手牌数按「打出之后」计：响应判定发生在牌已离手的时点，
  // 若把正在使用的这张牌也算进自己的手牌数，会比玩家看到的多算 1 张。
  const handSize = (unit, exclude) =>
    visible(unit).filter(card => card !== exclude).length;

  // 女王威压·手牌压制：使用的牌指定敌方角色为目标时，若手牌数多于该角色，
  // 该角色不可响应。
  //
  // 这里刻意不把结果写成 card.ignoreResponse：
  //   1）牌上的标记是「整张牌」级别的，群体牌（机枪扫杀等）结算给每个目标时
  //      共用同一个牌对象，一旦打标记就会把手牌更多的目标也一并压制，
  //      与「若你的手牌数大于该角色」的逐角色口径不符；
  //   2）弃牌堆会被重洗回摸牌堆并复用同一批牌对象（BattlePileStats.reshuffle
  //      直接 splice），而 clearPlayFlags 只在置了 _tempIgnoreResponse 时才清
  //      ignoreResponse，残留的标记会让这张牌此后永久不可被响应。
  // 故改为在响应判定前按「当前目标」实时计算，见 suppressesResponse。
  function beforeCardPlayed(state, actor, card, target) {
    if (!isPreshi(actor) || !alive(actor)) return;
    if (!hasSkill(actor, "女王威压")) return;
    if (!target || target.side === actor.side || !alive(target)) return;
    const mine = handSize(actor, card), theirs = handSize(target, null);
    if (mine <= theirs) return;
    line(state, actor, "女王威压");
    window.BattleLog.add(state,
      `${actor.name} 触发女王威压，${target.name}手牌更少，不可响应此牌。`);
  }

  // 响应判定的唯一判据：逐目标计算，与 beforeCardPlayed 同一口径（手牌按打出后计）。
  function suppressesResponse(state, actor, target, card) {
    if (!isPreshi(actor) || !alive(actor)) return false;
    if (!hasSkill(actor, "女王威压")) return false;
    if (!target || target.side === actor.side || !alive(target)) return false;
    return handSize(actor, card) > handSize(target, null);
  }

  // 女王威压·全场最多手牌：并列最多同样计入（与凯瑟琳【魔力增幅】同口径）。
  function topHand(state, unit) {
    const others = allUnits(state?.battle)
      .filter(item => alive(item) && item.uid !== unit?.uid);
    if (!others.length) return false;
    return handSize(unit, null) >= Math.max(...others.map(item => handSize(item, null)));
  }
  function doubling(state, unit) {
    return !!unit && alive(unit) && isPreshi(unit)
      && hasSkill(unit, "女王威压") && topHand(state, unit);
  }
  // 只有实体牌造成的伤害才触发女王威压翻倍：技能伤害（含女王榨取）、技能生成的牌、
  // 虚拟牌一律不翻倍。此前用 card.preshiDrain 单独给女王榨取开洞，规则没有通用化，
  // 其他技能伤害同样不该被翻倍，故改为统一判据（与凋零者【外神之眼】同口径）。
  const isEntityCard = card => !!window.CardUtils?.isEntityCard?.(card);
  function modifyOutgoingDamage(state, actor, amount, card) {
    if (!doubling(state, actor) || !(amount > 0)) return amount;
    if (!isEntityCard(card)) return amount;
    line(state, actor, "女王威压造成伤害");
    return amount * 2;
  }
  function modifyIncomingDamage(state, target, amount, card) {
    if (!doubling(state, target) || !(amount > 0)) return amount;
    if (!isEntityCard(card)) return amount;
    line(state, target, "女王威压受到伤害");
    return amount * 2;
  }

  // 女王榨取：指定我方一名男性角色，造成魔力值伤害，弃置其所有手牌并摸等量牌。
  // 伤害恒等于魔力值，两道保障：一是女王威压的翻倍只认实体牌，本技能的伤害载荷为
  // type:"skill" 不触发；二是按贝尔蒂丝【苦肉鞭笞】同口径走 skipDamageModify，
  // 友方承受的技能伤害不再被后续修正链二次放大，避免偏离「等同于魔力值」的描述。
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (!card?.preshiDrain || !isPreshi(actor) || !alive(actor)) return false;
    if (actor.usedPreshiDrain) return true;
    const battle = state?.battle;
    if (!battle) return false;
    if (!target || target.side !== actor.side || target.uid === actor.uid
      || target.gender !== "male" || !alive(target)) return true;
    actor.usedPreshiDrain = true;
    line(state, actor, "女王榨取", target);
    const amount = magicOf(actor);
    ctx.damage(state, target, amount, "女王榨取", actor,
      { name: "女王榨取", type: "skill", preshiDrain: true, ignoreResponse: true, skipDamageModify: true });
    // 先整批摘出再逐张入弃牌堆：边遍历边 splice 会在含 _pendingDraw 的牌上漏删。
    const dumped = visible(target);
    dumped.forEach(item => {
      const index = target.hand.indexOf(item);
      if (index >= 0) target.hand.splice(index, 1);
      window.BattleCards?.put?.(battle, target, item, "discard",
        { forcedDiscard: true });
    });
    if (dumped.length) window.BattleCards?.afterHandLost?.(battle, target);
    const drawn = dumped.length ? deps.draw(actor, dumped.length, battle) : 0;
    window.BattleLog.add(state,
      `${actor.name} 发动女王榨取，对${target.name}造成${amount}点伤害，弃置其${dumped.length}张手牌`
      + (dumped.length ? `，${window.BattleDrawFeedback.action(actor, dumped.length, drawn)}。` : "。"));
    return true;
  }

  return {
    beforeCardPlayed, suppressesResponse, modifyOutgoingDamage, modifyIncomingDamage,
    handleSpecialCard, topHand,
  };
})();
