window.EnemyStatusEffects = ({ alive, markStatus }) => {
  const RATE = 0.3;
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const stat = (u, key) => {
    const nested = u?.stats?.[key];
    const base = Number.isFinite(Number(nested)) ? Number(nested)
      : (Number.isFinite(Number(u?.[key])) ? Number(u[key]) : 0);
    return base + (key === "attack" ? finite(u?.tempAttack) : 0);
  };
  const allUnits = state => (state?.battle?.allies || []).concat(state?.battle?.enemies || []);
  const actorOf = (state, uid) => uid ? allUnits(state).find(u => u?.uid === uid) || null : null;
  const sourceAttack = source => Math.max(0, stat(source, "attack"));
  const markerAttack = (state, mark) => {
    const snapshot = Number(mark?.attack);
    if (Number.isFinite(snapshot) && snapshot >= 0) return snapshot;
    const actor = actorOf(state, mark?.sourceUid || mark?.uid);
    return sourceAttack(actor);
  };
  const markerDamage = (state, mark) => Math.max(1, Math.round(markerAttack(state, mark) * RATE));
  // 施加者已离场 / uid 失效时，不得把伤害来源回退成受害者自己：
  // 否则 BattleStats 的「同阵营不记」判据会吞掉这次伤害与击杀，战报写成自伤，
  // 且 legacy 感电会按受害者攻击力放大 30%。影子来源保留原 uid 让统计仍落到
  // 原施加者名下，攻击力为 0、阵营与目标相反，只是结算用的占位对象。
  const shadowSource = (unit, uid, label) => ({
    uid: uid || `__${label}__`, name: label,
    side: unit.side === "ally" ? "enemy" : "ally",
    hp: 0, maxHp: 0, stats: { attack: 0 }, tempAttack: 0,
    hand: [], statuses: [], block: 0,
  });

  function normalizeMarks(state, unit) {
    const count = Math.max(0, Math.floor(finite(unit?.poison)));
    // 旧档毒标记缺失施加者时不得回退到目标自己：否则会按目标攻击力算 30%，
    // 目标越强毒伤越高，且战报把施加者记成受害者。留空则由 markerAttack
    // 判为「找不到施加者」→ 0 攻击力 → 至少 1 点。
    const fallbackUid = unit?.poisonSourceUid || null;
    const old = Array.isArray(unit?.poisonMarks) ? unit.poisonMarks.slice() : [];
    while (old.length < count) old.push({ sourceUid: fallbackUid });
    const marks = old.slice(0, count).map(mark => ({
      sourceUid: mark?.sourceUid || fallbackUid,
      ...(Number.isFinite(Number(mark?.attack)) ? { attack: Number(mark.attack) } : {}),
    }));
    unit.poisonMarks = marks;
    unit.poisonSourceUid = marks[0]?.sourceUid || unit.poisonSourceUid || null;
    return marks;
  }

  function addPoison(state, target, count = 1, source = null) {
    if (!alive([target]).length) return;
    const amount = Math.max(0, Math.floor(finite(count)));
    if (!amount) return;
    const marks = normalizeMarks(state, target);
    const sourceUid = source?.uid || null;
    const attack = sourceAttack(source);
    for (let i = 0; i < amount; i += 1) marks.push({ sourceUid, attack });
    target.poison = marks.length;
    target.poisonMarks = marks;
    target.poisonSourceUid = marks[0]?.sourceUid || sourceUid || null;
    markStatus(target, "毒");
    window.BattleLog.add(state, `${target.name} 获得${amount}层毒（当前${target.poison}层）。`);
  }

  function normalizeShockMarks(state, unit) {
    const count = Math.max(0, Math.floor(finite(unit?.shock)));
    const fallbackUid = unit?.shockSourceUid || null;
    const old = Array.isArray(unit?.shockMarks) ? unit.shockMarks.slice() : [];
    while (old.length < count) old.push({ sourceUid: fallbackUid, _legacy: true });
    const marks = old.slice(0, count).map(mark => ({
      sourceUid: mark?.sourceUid || fallbackUid || null,
      ...(mark?._legacy ? { _legacy: true } : {}),
      ...(Number.isFinite(Number(mark?.attack)) ? { attack: Number(mark.attack) } : {}),
    }));
    unit.shockMarks = marks;
    if (marks.length) unit.shockSourceUid = marks[0]?.sourceUid || unit.shockSourceUid || null;
    return marks;
  }

  function addShock(state, target, count = 1, source = null) {
    if (!alive([target]).length) return;
    const amount = Math.max(0, Math.floor(finite(count)));
    if (!amount) return;
    const marks = normalizeShockMarks(state, target);
    const sourceUid = source?.uid || null;
    const attack = sourceAttack(source);
    for (let i = 0; i < amount; i += 1) marks.push({ sourceUid, attack });
    target.shock = marks.length;
    target.shockMarks = marks;
    target.shockSourceUid = marks[0]?.sourceUid || sourceUid || null;
    markStatus(target, "感电");
    window.BattleLog.add(state, `${target.name} 获得${amount}层感电（当前${target.shock}层）。`);
  }

  // 每层感电按施加时攻击力快照各算 30%（四舍五入、至少 1 点）后叠加。
  // 旧档只有 shock 数字，没有施加者信息，降级按本次伤害来源的当前攻击力补齐；
  // 若本次来源恰好就是受害者（上游回退），按 0 攻击力处理，避免自我放大。
  function shockDamage(state, target, actor) {
    const marks = normalizeShockMarks(state, target);
    return marks.reduce((sum, mark) => {
      if (mark?._legacy || !Number.isFinite(Number(mark?.attack))) {
        const legacyActor = actorOf(state, mark?.sourceUid)
          || (actor === target ? null : actor);
        return sum + Math.max(1, Math.round(sourceAttack(legacyActor) * RATE));
      }
      return sum + markerDamage(state, mark);
    }, 0);
  }

  function addHolyScar(state, target) {
    if (!alive([target]).length || target.holyScar) return;
    target.holyScar = true;
    markStatus(target, "圣痕");
    window.BattleLog.add(state, `${target.name} 获得圣痕。`);
  }

  function clearHolyScar(state, unit) {
    if (!unit?.holyScar) return;
    unit.holyScar = false;
    unit.statuses = (unit.statuses || []).filter(status => status !== "圣痕");
    window.BattleLog.add(state, `${unit.name} 恢复生命，圣痕解除。`);
  }

  function onHeal(state, draw) {
    (state.battle?.allies || []).concat(state.battle?.enemies || [])
      .filter(unit => unit.hp > 0 && window.RelicSystem?.hasEquipped?.(state, unit, "母亲照片"))
      .forEach(unit => {
        const drawn = draw?.(unit, 1, state.battle);
        window.BattleLog.add(state, `${unit.name} 的母亲照片触发，${window.BattleDrawFeedback.action(unit, 1, drawn)}。`);
      });
  }

  // 按施加者分组分别结算，与燃烧 tickBurning 对齐：30% 口径下每枚毒标记
  // 各自按施加者攻击力快照计伤，合并成一次结算会把 A/B 两人的伤害与击杀
  // 全部记到首位施加者名下（MVP 统计失真）。分组后每段各自的伤害、统计与
  // 击杀归属落到该施加者，施加者失效时沿用影子来源。
  function tickPoison(state, unit, damage) {
    if (!unit.poison || unit.hp <= 0) return;
    const marks = normalizeMarks(state, unit);
    const groups = new Map();
    marks.forEach(mark => {
      const uid = mark?.sourceUid || "";
      if (!groups.has(uid)) groups.set(uid, []);
      groups.get(uid).push(mark);
    });
    for (const [uid, group] of groups) {
      if (unit.hp <= 0 || state.battle?.locked) break;
      const amount = group.reduce((sum, mark) => sum + markerDamage(state, mark), 0);
      if (!amount) continue;
      const source = actorOf(state, uid) || shadowSource(unit, uid || null, "毒");
      damage(state, unit, amount, "毒", source, {
        name: "毒", type: "skill", poison: true, poisonTick: true,
        ignoreResponse: true, ignoreBlock: true, skipDamageModify: true,
      });
    }
  }

  return { addPoison, addShock, shockDamage, addHolyScar, clearHolyScar, onHeal, tickPoison };
};
