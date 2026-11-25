// 凋零者【外神之眼】与【百眼魅魔】的虚拟杀生成：从 ruins-witherer-skills.js 拆出，
// 保持对外行为完全一致。stat / log 由主文件注入，加载期零副作用；缺文件时主文件显式抛错。
window.RuinsWithererVirtualKill = ({ stat, log }) => {
  // 外神之眼：受伤后令伤害来源对其同阵营其他存活角色视为使用一张虚拟【杀（普攻）】。
  // 「其他敌方」沿用百眼魅魔的措辞口径——从凋零者视角看，其敌方阵营内的其余角色。
  // 外神之眼只响应实体牌：追加段为 type:"skill"，故一次多段攻击仍只触发第一段。
  function eyeOfOuterGod(state, attacker, witherer) {
    if (!attacker || attacker.hp <= 0 || attacker === witherer) return;
    const mates = (attacker.side === "ally"
      ? state.battle?.allies : state.battle?.enemies) || [];
    const others = mates.filter(unit => unit !== attacker && unit.hp > 0);
    window.BattleLines?.skill?.(state, witherer, "外神之眼", attacker);
    if (!others.length) {
      const amount = stat(attacker, "attack");
      const before = attacker.hp;
      window.BattleHpValue.applyDamage(attacker, amount); window.SakuraRisaSkills?.preventDeath?.(state, attacker);
      const loss = before - attacker.hp;
      if (loss > 0) window.BattleSystem?.pushFloat?.(state.battle, attacker.uid, "hp-loss", loss);
      log(state, `${witherer.name} 的外神之眼触发，${attacker.name}无其他敌方角色，对自己造成${amount}点伤害。`);
      return;
    }
    const target = window.GameRandom?.sample?.(others, state) || others[0];
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "外神之眼" });
    if (!virtual) return;
    log(state, `${witherer.name} 的外神之眼触发，使${attacker.name}对${target.name}视为使用一张虚拟【杀】。`);
    window.BattleSystem?.useVirtualKill?.(state, attacker, target, virtual);
  }

  function fireHundredEyes(state, witherer, ally, allies) {
    const others = allies.filter(other => other !== ally && other.hp > 0);
    const target = others.length
      ? (window.GameRandom?.sample?.(others, state) || others[0]) : ally;
    if (target === ally) {
      const amount = stat(ally, "attack");
      const before = ally.hp;
      window.BattleHpValue.applyDamage(ally, amount); window.SakuraRisaSkills?.preventDeath?.(state, ally);
      const loss = before - ally.hp;
      if (loss > 0) window.BattleSystem?.pushFloat?.(state.battle, ally.uid, "hp-loss", loss);
      log(state, `${ally.name} 无可攻击目标，百眼魅魔使其受到自身${amount}点伤害。`);
      return;
    }
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "百眼魅魔" });
    if (!virtual) return;
    log(state, `${witherer.name} 的百眼魅魔使${ally.name}对${target.name}视为使用一张虚拟【杀】。`);
    window.BattleSystem?.useVirtualKill?.(state, ally, target, virtual);
  }
  return { eyeOfOuterGod, fireHundredEyes };
};
