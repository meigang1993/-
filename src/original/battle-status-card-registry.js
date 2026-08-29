window.BattleStatusCardRegistry = (() => {
  const definitions = Object.freeze({
    stun: {
      name: "眩晕", flag: "stun", text:
        "状态牌，带有虚无属性。判定阶段进行判定；若结果为黑色，跳过本回合出牌阶段。回合结束后消耗此牌。",
    },
    seal: {
      name: "封魔", flag: "seal", text:
        "状态牌，带有虚无属性。判定阶段进行判定；若结果为红色，跳过摸牌阶段，且本回合无法摸牌。回合结束后消耗此牌。",
    },
    slime: { name: "粘液", flag: "slime" },
    confusion: {
      name: "混乱", flag: "confusion", text:
        "状态牌。判定阶段若结果为黑色，随机对己方其他角色视为使用一张虚拟【杀】；没有其他目标时对自己造成攻击力伤害。",
    },
    freeze: {
      name: "冰冻", flag: "freeze", text:
        "状态牌。判定阶段若结果为红色，本回合不能使用【杀】；回合结束后消耗。",
    },
    paralysis: {
      name: "麻痹", flag: "paralysis", text:
        "状态牌。判定阶段若结果为红桃或黑桃，本回合无法使用牌；回合结束后消耗。",
    },
  });
  const fixedLabels = Object.values(definitions).map(item => item.name);

  function keyOf(card) {
    if (!card) return "";
    const found = Object.entries(definitions)
      .find(([, definition]) => card[definition.flag]);
    if (found) return found[0];
    if (card.type !== "status") return "";
    return String(card.statusKey || card.name || "");
  }

  function isStatus(card) {
    return !!keyOf(card);
  }

  function labelOf(card) {
    return definitions[keyOf(card)]?.name || String(card?.name || "");
  }

  function has(unit, cardOrKey) {
    const key = typeof cardOrKey === "string" ? cardOrKey : keyOf(cardOrKey);
    return !!key && (unit?.hand || []).some(card => keyOf(card) === key);
  }

  function canReceive(unit, card) {
    return !isStatus(card) || !has(unit, card);
  }

  function sync(unit, battle = window.state?.battle) {
    if (!unit) return [];
    const seen = new Set();
    const kept = [];
    const duplicates = [];
    (unit.hand || []).forEach(card => {
      const key = keyOf(card);
      if (key && seen.has(key)) duplicates.push(card);
      else {
        if (key) seen.add(key);
        kept.push(card);
      }
    });
    if (duplicates.length) {
      unit.hand = kept;
      duplicates.forEach(card => {
        if (battle && window.BattleCards?.put) {
          window.BattleCards.put(battle, unit, card, "consumed", {
            skipAfterHandLost: true,
          });
        } else {
          (unit.consumed ||= []).push(card);
        }
      });
    }
    const labels = [...seen].map(key => definitions[key]?.name || key);
    unit.statuses = (unit.statuses || [])
      .filter(status => !fixedLabels.includes(status) && !labels.includes(status));
    unit.statuses.push(...labels);
    return duplicates;
  }

  function create(key) {
    const definition = definitions[key];
    if (!definition) return null;
    return {
      name: definition.name,
      type: key === "slime" ? "consume" : "status",
      statusKey: key,
      [definition.flag]: true,
      targetless: true,
      suit: "",
      void: key !== "slime",
      statusExpiresEndTurn: key !== "slime",
      text: definition.text || "",
    };
  }

  return { canReceive, create, has, isStatus, keyOf, labelOf, sync };
})();
