window.BattleHpValue = (() => {
  // 角色属性允许两位小数（魔力 40.82、攻击 9.6），但连续加减会留下
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
  return { clean, maxHp, hp, healCap, applyHeal, applyDamage };
})();
