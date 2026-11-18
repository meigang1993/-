window.BattleHpValue = (() => {
  // 角色属性已统一为整数，但伤害/HP 中间值仍可能是小数，连续加减会留下
  // 49.00000000000001 / 48.99999999999999 这类 IEEE754 尾巴。低血量时
  // maxHp - hp 把尾巴带进恢复量，战报与飘字就会显示成一长串小数。
  // 统一收敛到两位小数：整数仍是整数，合法的两位小数属性原样保留。
  const clean = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  };
  const maxHp = unit => clean(unit?.maxHp ?? unit?.stats?.maxHp ?? 0);
  const hp = unit => clean(unit?.hp ?? 0);
  const healCap = (unit, amount) =>
    Math.max(0, clean(Math.min(maxHp(unit) - hp(unit), clean(amount))));
  const applyHeal = (unit, healed) => {
    unit.hp = clean(Math.min(maxHp(unit), hp(unit) + clean(healed)));
    return unit.hp;
  };
  const applyDamage = (unit, loss) => {
    unit.hp = clean(Math.max(0, hp(unit) - clean(loss)));
    return unit.hp;
  };
  // 「当前属性」统一口径（A）：stats.*（含角色强化、装备、绿帽等已写回的固定加成）
  // + temp* 中除本技能自身贡献外的部分。调用方把自身贡献扣回后取同一快照，
  // 多个百分比来源以该快照线性相加、不链式累乘；角色强化是固定点数，不参与百分比。
  const SKILL_PCT = 10;
  const tempOf = (unit, key) => key === "attack" ? (unit?.tempAttack || 0)
    : key === "magic" ? (unit?.tempMagic || 0) : 0;
  const currentStat = (unit, key, selfGrant = 0) => Math.max(0, clean(
    (unit?.stats?.[key] || 0) + tempOf(unit, key) - clean(selfGrant)));
  // 当前最大生命：maxHp 已含角色强化与装备等写回加成。
  const currentMaxHp = unit => Math.max(0, clean(unit?.maxHp ?? unit?.stats?.maxHp ?? 0));
  // 任意 N% 的线性叠加：单份四舍五入且至少 1 点，n 份同基数相加。
  const pctStacks = (base, pct, n) => Math.max(1, Math.round(
    clean(base) * Math.max(0, clean(pct)) / 100)) * Math.max(0, Math.round(clean(n)));
  const statStacks = (base, n) => pctStacks(base, SKILL_PCT, n);
  const healStacks = (maxHpValue, cards) => pctStacks(maxHpValue, SKILL_PCT, cards);
  // 回血基数统一：所有 N% 恢复都按施术者当前最大生命值计算，单份至少 1 点。
  const healPctStacks = (actor, pct, n) => pctStacks(currentMaxHp(actor), pct, n);
  return { clean, maxHp, hp, healCap, applyHeal, applyDamage,
           currentStat, currentMaxHp, pctStacks, statStacks, healStacks,
           healPctStacks, SKILL_PCT };
})();
