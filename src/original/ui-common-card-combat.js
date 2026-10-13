window.UICommonCardCombat = ({ statValue }) => {
  function combatBar(unit) {
    // 血条高度（hpPct）早就做了 clamp，但 <b> 里的数字和 title 没有——两者不对称。
    // 一旦 visualHp 被任何路径写成异常值（典型如字符串拼接产生的大数），就会出现
    // "血条看着正常、数字却爆成 999999" 的错位，而 unit.hp 本身始终是对的。
    // 血量在语义上不可能超过 maxHp，故在此强制收敛；护甲可合法高于 maxHp，
    // 只做"必须是有限数字"的保护，不压上限。
    const max = Math.max(1, Number(unit.maxHp || unit.stats?.maxHp) || 1);
    const num = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const hp = Math.max(0, Math.min(max, Math.round(num(unit.visualHp ?? unit.hp))));
    const block = Math.max(0, Math.round(num(unit.visualBlock ?? unit.block)));
    const hasDefense = unit.ai === "mechanical_bull_king";
    const defenseValue = hasDefense
      ? Math.max(0, Math.round(num(unit.visualDefense ?? unit.defenseSystem))) : 0;
    const hpPct = Math.max(0, Math.min(100, (hp / max) * 100));
    const armorPct = block > 0
      ? Math.max(8, Math.min(100, (block / max) * 100)) : 0;
    const defensePct = defenseValue > 0
      ? Math.max(8, Math.min(100, (defenseValue / max) * 100)) : 0;
    const defense = defenseValue > 0
      ? `<strong class="defense-count" title="防御系统：${defenseValue}">防${defenseValue}</strong>`
      : "";
    return `<div class="combat-bar" title="生命值：${hp}/${max} 护甲值：${block}${hasDefense ? ` 防御系统：${defenseValue || 0}` : ""}"><span class="bar-hp" style="height:${hpPct}%"></span><span class="bar-defense" style="top:0;height:${defensePct}%"></span><span class="bar-armor" style="top:0;height:${armorPct}%"></span><b>${hp}</b><em>${block || ""}</em>${defense}</div>`;
  }

  function previewDamage(actor, card) {
    if (!actor || !card) return "";
    const attack = statValue(actor, "attack");
    const magic = statValue(actor, "magic");
    const battle = window.state?.battle;
    const fallbackMagic = card.attackType === "magic" || card.magicDamage
      || card.scale === "magic" || card.magicBullet || card.magicDuel
      || card.demonInvasion;
    const isSlash = card.type === "slash"
      || /杀(?:（[^）]*）)?$/.test(card.name || "");
    const statKey = window.CardUtils?.damageStatKey?.(actor, card)
      || (actor.extractMagicAttack && (isSlash || card.reckless || card.duel)
        || actor.ref === "ophelia" && isSlash && card.name !== "杀（普攻）"
        ? "magic" : fallbackMagic ? "magic" : "attack");
    const attackType = window.BattleDamageAttributes?.attackType?.(
      card, card.name || "", actor
    ) || (statKey === "magic" ? "magic" : "physical");
    let amount = null;
    if (isSlash) {
      const base = 0;
      const total = statKey === "magic" ? magic : attack;
      const mult = actor.charge ? Math.pow(2, actor.charge) : 1;
      amount = card.armoredRam
        ? total + (actor.block || 0)
        : Math.round((base + total) * mult);
    } else if (card.reckless) amount = statKey === "magic" ? magic : attack;
    else if (card.magicBullet) amount = magic;
    else if (card.demonInvasion) amount = attack + magic;
    else if (card.duel) amount = statKey === "magic" ? magic : attack;
    else if (card.magicDuel) amount = magic;
    else if (card.comboAttack) {
      const partner = battle?.allies.concat(battle.enemies)
        .find(unit => unit.uid === battle.comboPartnerUid && unit.hp > 0);
      amount = partner
        ? `${attack}/${statValue(partner, "attack")}`
        : `${attack}/队友`;
    }
    if (amount == null) return "";
    const attackName = card.hybridAttack
      ? "物理+魔法攻击"
      : window.BattleDamageAttributes?.attackNames?.[attackType]
        || (attackType === "magic" ? "魔法攻击" : "物理攻击");
    return `<small class="damage-preview ${attackType}-attack">${attackName} · 伤害 ${amount}</small>`;
  }

  return { combatBar, previewDamage };
};
