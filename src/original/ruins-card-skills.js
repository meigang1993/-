window.RuinsCardSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0)
    + (key === "magic" ? unit.tempMagic || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const isKillCard = card => !!card && (card.type === "slash"
    || /杀(?:（[^）]*）)?$/.test(card.name || ""));
  const slashCount = unit => visible(unit).filter(isKillCard).length;
  const foesOf = (state, actor) => alive(actor?.side === "ally"
    ? state.battle?.enemies : state.battle?.allies);
  const sample = (state, list) => window.GameRandom?.sample?.(list, state) || list[0];

  // 标记/偷牌必须等这一段受击动画演完再发放，否则会在挥砍动画播放期间
  // 就提前跳徽章、提前把牌偷走（与混乱/窒息等既有状态同一套挂接方式）。
  function afterHitSettled(state, fn) {
    if (typeof fn !== "function") return;
    if (window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, fn)) return;
    fn();
  }

  // 打出后本牌已离开手牌，但文案口径是「指定目标时」手里的【杀】牌数，
  // 需要把这张正被结算的杀牌补回来，否则只剩这一张杀时会误判为 0。
  function slashCountWithPlayed(actor, card) {
    const held = visible(actor).includes(card);
    const bonus = card && isKillCard(card) && !held && card._playedFromHand ? 1 : 0;
    return slashCount(actor) + bonus;
  }

  // 卡片效果开关一律读数据标志位，卡名仅作旧数据兜底。
  // 直接写死卡名时，一旦卡牌改名效果会静默失效且无任何报错。
  const FLAG_BY_NAME = { 拼杀: "clashResponse", 魔之连杀: "chainBySlash" };
  function flagOn(card, flag) {
    if (!card) return false;
    if (card[flag] !== undefined) return !!card[flag];
    const legacy = FLAG_BY_NAME[card.name];
    return legacy ? legacy === flag : false;
  }

  // 拼杀：指定目标时，若我方【杀】牌数多于目标，则此杀不可响应
  function beforeResponseCheck(state, actor, target, card) {
    if (!card || card._clashChecked) return;
    if (!flagOn(card, "clashResponse")) return;
    card._clashChecked = true;
    if (!target || target.hp <= 0) return;
    const mine = slashCountWithPlayed(actor, card);
    const theirs = slashCount(target);
    if (mine > theirs) {
      card.ignoreResponse = true;
      log(state, `${actor.name} 的【杀】牌数（${mine}）多于${target.name}（${theirs}），此拼杀不可响应。`);
    }
  }

  // 魔之连杀：根据使用者的【杀】牌数量，额外随机指定目标
  function chainExtraTargets(state, actor, target, card, damage) {
    if (!card || card._chainExtra) return;
    if (!flagOn(card, "chainBySlash")) return;
    if (typeof damage !== "function" || !actor) return;
    if (card._chainDone) return;
    card._chainDone = true;
    const extra = slashCountWithPlayed(actor, card);
    if (extra <= 0) return;
    const pool = foesOf(state, actor).filter(unit => unit !== target);
    if (!pool.length) return;
    const amount = stat(actor, "magic");
    const picks = [];
    while (picks.length < extra && picks.length < pool.length) {
      const pick = sample(state, pool.filter(unit => !picks.includes(unit)));
      if (!pick) break;
      picks.push(pick);
    }
    if (!picks.length) return;
    window.BattleLines?.skill?.(state, actor, "魔之连杀");
    log(state, `${actor.name} 的魔之连杀触发，根据【杀】牌数额外随机指定${picks.length}个目标。`);
    picks.forEach(pick => damage(state, pick, amount, "魔之连杀", actor, {
      name: "魔之连杀", type: "slash", scale: "magic", attackType: "magic",
      magicDamage: true, _chainExtra: true, _skill: true,
    }));
  }

  // 魅杀：造成伤害后为目标施加脆弱标记（受到伤害+50%）
  function applyVulnerable(state, actor, target, card) {
    if (!card || card.name !== "魅杀" || card._chainExtra) return;
    if (!target || target.hp <= 0) return;
    if (target.vulnerable) return;
    afterHitSettled(state, () => {
      if (!target || target.hp <= 0 || target.vulnerable) return;
      target.vulnerable = true;
      window.BattleLines?.skill?.(state, actor, "魅杀", target);
      log(state, `${target.name} 获得脆弱标记，受到的伤害提升50%。`);
    });
  }

  function modifyIncomingDamage(state, target, amount, card) {
    if (!target?.vulnerable || !amount) return amount;
    return amount * 1.5;
  }

  // 吸魔杀：伤害结算、受击动画结束后才获得目标一张牌
  function stealAfterHit(state, actor, target, card) {
    if (!card || card.name !== "吸魔杀" || card._stealDone) return;
    if (!target || target.hp <= 0) return;
    card._stealDone = true;
    const steal = window.BattleCardStealApi;
    if (typeof steal !== "function") return;
    afterHitSettled(state, () => {
      if (!target || target.hp <= 0) return;
      steal(state, actor, target, card);
    });
  }

  function clearVulnerable(_state, unit) {
    if (unit) delete unit.vulnerable;
  }

  return {
    beforeResponseCheck, chainExtraTargets, applyVulnerable, stealAfterHit,
    modifyIncomingDamage, clearVulnerable,
  };
})();
