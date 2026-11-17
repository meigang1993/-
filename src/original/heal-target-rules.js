// 单体恢复生命值牌的目标规则。
//
// 【愈魔瓶】【伤口处理】是「指定一名友方角色，令其恢复 X 点生命值」的单体牌。
// 此前选目标只判「同阵营 + 存活」，满血角色也能被指定：结算时 healCap = 0，
// 牌照样从手牌移出、进弃牌堆，战报写「恢复0点生命」，等于白费一张牌。
// 与【狙击目标】空手牌目标、【窃取】无牌目标同一类「点了静默失败」问题，
// 因此按同一口径在 UI 高亮 / 逻辑选目标 / 出牌结算 / 置灰 / 默认目标五处收口。
//
// 判据刻意收窄到「单体指定友方 + 有恢复量」的牌：
//   - 生命之泉（teamHealPct / targetless）是群体恢复，满血成员本就该跳过；
//   - 咬杀（造成伤害后自己恢复）不是治疗牌；
//   - 主动恢复技能（回春之手 / 偶像之吻）走下面单独的 isHealSkillCard 判据：
//     它们要弃 1 张手牌、占用出牌阶段限一次，判据与「单体牌」不同（可能转
//     全体、双方各恢复、还有绿帽收益），但满血白消耗是同一类问题。
//
// 零依赖、纯声明式，登记在 startup（card-ownership.js 之后）先于所有消费方加载。
window.BattleHealTargetRules = (() => {
  // 与 BattleHpValue 同口径：属性允许两位小数，连续加减会留下 IEEE754 尾巴，
  // 49.00000000000001 必须视作满血，48.99999999999999 必须视作满血而非可治疗。
  const clean = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  };
  const maxHp = unit => clean(unit?.maxHp ?? unit?.stats?.maxHp ?? 0);
  const hp = unit => clean(unit?.hp ?? 0);
  // 存活且未达上限才算「需要恢复」。
  const needsHeal = unit => !!unit && hp(unit) > 0 && hp(unit) < maxHp(unit);
  const isSingleHealCard = card => !!card && !!card.allyTarget && !card.targetless
    && !card.teamHealPct && !card._groupHeal
    && !card.elranaHeal && !card.idolKiss && !card.kaiichiMilk
    && ((Number(card.healPct) || 0) > 0 || (Number(card.heal) || 0) > 0);
  // 双击 / 拖出手牌区时的默认目标：沿用卡面「默认对自己使用」的直觉，
  // 但自己满血时转给第一个受伤的同阵营角色；全员满血返回 null（牌已置灰）。
  const defaultHealTarget = (battle, actor) => {
    const team = actor?.side === "enemy" ? battle?.enemies : battle?.allies;
    if (!Array.isArray(team)) return null;
    const self = team.find(unit => unit?.uid === actor?.uid && needsHeal(unit));
    return self?.uid ?? team.find(unit => needsHeal(unit))?.uid ?? null;
  };
  // ---- 主动恢复技能：回春之手 / 偶像之吻 ----
  // 上一轮只收口了「单体恢复牌」。这两个技能同样要弃 1 张手牌并占用出牌
  // 阶段限一次：满血目标结算时 healCap=0，弃牌与次数照样消耗，战报还按理论
  // 值写「恢复 X 点」，比牌侧更亏。故按同一口径在 UI / chooseTarget /
  // canResolve / canPlay 置灰 / useCard 结算 五处收口。
  const isHealSkillCard = card => !!card && (!!card.elranaHeal || !!card.idolKiss);
  const redSuit = c => c?.suit === "♥" || c?.suit === "♦";
  const visibleHand = unit => (unit?.hand || []).filter(c => !c?._pendingDraw);
  const costCardOf = (battle, actor, card) => {
    if (card?._costCard) return card._costCard;
    if (actor?._activeCostCard) return actor._activeCostCard;
    const i = battle?.selectedCardIndex;
    return i == null ? null : actor?.hand?.[i] || null;
  };
  // 回春之手：弃牌后手牌全红会转「我方全体恢复」，此时指定目标只是战报/台词
  // 里的代表，任意存活友方都可指定；否则只有需要恢复的目标才有收益。
  const healSkillIsGroup = (battle, actor, card) => {
    if (!card?.elranaHeal) return false;
    const rest = visibleHand(actor).slice();
    const cost = costCardOf(battle, actor, card);
    if (!cost) return false;
    const i = rest.indexOf(cost);
    // 弃牌对象定位不到（AI 直接调 useCard 等路径）时按单体口径处理，
    // 不猜「转全体」，避免把满血目标误放行。
    if (i < 0) return false;
    rest.splice(i, 1);
    return rest.length > 0 && rest.every(redSuit);
  };
  const teamOf = (battle, actor) =>
    actor?.side === "enemy" ? battle?.enemies : battle?.allies;
  // 偶像之吻的绿帽收益：目标为存活男性且非洛基、队里有存活洛基时，即使
  // 双方满血也仍有收益，不能按「白费」把既有玩法一起挡掉。
  const greenHatValue = (battle, target) => !!target && target.hp > 0
    && target.gender === "male" && target.ref !== "loki"
    && (battle?.allies || []).some(u => u?.ref === "loki" && u?.hp > 0);
  const healSkillValue = (battle, actor, card, target) => {
    if (!isHealSkillCard(card) || !actor || !target || target.hp <= 0
      || target.side !== actor.side || !Array.isArray(teamOf(battle, actor))) return false;
    if (card.idolKiss) {
      return target.uid !== actor.uid
        && (needsHeal(actor) || needsHeal(target) || greenHatValue(battle, target));
    }
    return healSkillIsGroup(battle, actor, card)
      ? (teamOf(battle, actor) || []).some(needsHeal)
      : needsHeal(target);
  };
  const healSkillHasAnyTarget = (battle, actor, card) => {
    if (!isHealSkillCard(card)) return true;
    return (teamOf(battle, actor) || []).some(target =>
      healSkillValue(battle, actor, card, target));
  };
  return {
    clean, maxHp, hp, needsHeal, isSingleHealCard, defaultHealTarget,
    isHealSkillCard, healSkillIsGroup, healSkillValue, healSkillHasAnyTarget,
  };
})();
