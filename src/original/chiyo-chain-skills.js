// 【红缨连鬼斩】连击链：停止判定后，按红色判定牌数量额外使用等量虚拟【杀（普攻）】。
// 与旧实现的区别：旧版把整张【杀】重复结算 X+1 次，目标一死剩余次数全部作废；
// 现在逐张独立结算，原目标阵亡时把剩余次数指定给另一名存活敌方角色。
window.ChiyoChainSkills = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const unitsOf = battle => (battle?.allies || []).concat(battle?.enemies || []);

  // 虚拟杀绕过了 UI 选目标层，必须自己向统一判定源询问「能否被指定」。
  // 探针是虚拟【杀】，按新口径不受暗幕隐身限制（隐身只挡实体单体【杀】），
  // 与妖刀村雨自动斩同一判定源、同一探针牌；判定源若拦下别的目标仍会跳过。
  // 判定源或探针缺失时按「可指定」降级，不让某个 bundle 分组漏装就整链哑火。
  function killProbe() {
    return window.CardUtils?.fromEntity?.("杀（普攻）", {
      temporary: true, void: true, noIntentCost: true,
      generatedBySkill: "红缨连鬼斩",
    });
  }
  const targetable = (unit, probe) =>
    !window.RuinsEnemySkills?.blocksKillTarget?.(unit, probe);

  function foesOf(battle, side, probe) {
    const list = side === "ally" ? battle?.enemies : battle?.allies;
    return (list || []).filter(alive).filter(unit => targetable(unit, probe));
  }

  // 虚拟杀不消耗淫气、不进手牌；关闭响应判定与 afterCardPlayed 钩子链，
  // 否则每张虚拟杀都会再触发一批技能（含本链自身）并可能把回合挂死。
  // 用 _skipPlayedSlashFlag 窄标记只抑制 prepareSlash 里的 playedSlashThisTurn
  // 置真（母亲怀表 / 震感手炮的「本回合未出杀」判据不被污染）；不再挂
  // _skipUseKillTriggers，派生杀照常触发【武士铠甲】【精灵女神守护之剑】
  // 等「使用杀牌」类饰品。妖刀村雨 / 借刀杀响应仍用旧宽标记，口径不变。
  function virtualSlash(chain) {
    return window.CardUtils?.fromEntity?.("杀（普攻）", {
      temporary: true, void: true, noIntentCost: true,
      ignoreResponse: true, skipAfterCardPlayed: true,
      skipMvpCardCount: true, _skipHandMove: true,
      _skipPlayedSlashFlag: true,
      _chiyoChainVirtual: true, ...(chain?.marker ? { [chain.marker]: true } : {}),
      generatedBySkill: chain?.skillName || "红缨连鬼斩",
      sourceName: chain?.skillName || "红缨连鬼斩",
    });
  }

  function useVirtual(state, actorUid, targetUid, probe, chain) {
    const battle = state.battle;
    const actor = unitsOf(battle).find(unit => unit.uid === actorUid);
    const target = unitsOf(battle).find(unit => unit.uid === targetUid);
    // 二次防御：chain.targetUid 可能来自存档/恢复，落到这里再向统一判定源
    // 问一次（虚拟杀不受暗幕隐身限制，但别的「不可指定」机制仍要生效）。
    if (!alive(actor) || !alive(target) || !targetable(target, probe)) return false;
    const card = virtualSlash(chain);
    const use = window.BattleSystem?.useVirtualKill
      || window.BattleCombat?.useVirtualKill;
    if (!card || typeof use !== "function") return false;
    use(state, actor, target, card);
    return true;
  }

  function run(state, chain) {
    const battle = state?.battle;
    if (!battle || battle.locked || battle.ended) return;
    const probe = killProbe();
    while (chain.remaining > 0 && !battle.locked && !battle.ended) {
      const foes = foesOf(battle, chain.side, probe);
      if (!foes.length) {
        const empty = chain.skillName
          ? `${chain.skillName}已无可指定的存活敌方`
          : "红缨连鬼斩已无可指定的存活敌方";
        log(state, `${empty}，剩余${chain.remaining}次${chain.word || "连击"}终止。`);
        chain.remaining = 0;
        break;
      }
      let target = foes.find(unit => unit.uid === chain.targetUid);
      if (!target) {
        // 原目标阵亡或被统一判定源判为不可指定：剩余次数转移给另一名
        // 可指定的存活敌方，优先血量最低者以连贯收割残局。
        const previous = unitsOf(battle).find(unit => unit.uid === chain.targetUid);
        const reason = alive(previous)
          ? `${previous.name}不可被单体【杀】指定`
          : `${previous?.name || "原目标"}已阵亡`;
        target = foes.slice().sort((a, z) => a.hp - z.hp)[0];
        const label = chain.skillName || "红缨连鬼斩";
        log(state, `${reason}，${label}剩余`
          + `${chain.remaining}次${chain.word || "连击"}转移至${target.name}。`);
        chain.targetUid = target.uid;
      }
      if (!useVirtual(state, chain.actorUid, target.uid, probe, chain)) {
        chain.remaining = 0;
        break;
      }
      chain.remaining -= 1;
    }
    const chainKey = chain.chainKey || "chiyoChain";
    if (chain.remaining > 0) battle[chainKey] = chain;
    else delete battle[chainKey];
  }

  function afterCardPlayed(state, actor, target, card) {
    const battle = state?.battle;
    const extra = card?._chiyoExtra || 0;
    if (!battle || !actor || extra <= 0 || card._chiyoChainDone) return;
    card._chiyoChainDone = true;
    delete card._chiyoExtra;
    if (!window.CardUtils?.fromEntity) return;
    run(state, {
      actorUid: actor.uid, side: actor.side,
      targetUid: alive(target) ? target.uid : null,
      remaining: extra, turn: battle.turn,
    });
  }

  // 兜底：虚拟杀若意外触发了玩家响应提示，恢复后把剩余次数继续跑完。
  function resume(state, chainKey = "chiyoChain") {
    const battle = state?.battle;
    const chain = battle?.[chainKey];
    if (!chain || chain.remaining <= 0) return;
    // 链只在挂起它的那个回合内有效。换回合、战斗结束、出牌者阵亡都直接作废，
    // 否则残留链会跨回合补打，甚至随存档带到别的时点凭空打出一串虚拟杀。
    const actor = unitsOf(battle).find(unit => unit.uid === chain.actorUid);
    if (battle.ended || chain.turn !== battle.turn || !alive(actor)) {
      delete battle[chainKey];
      return;
    }
    run(state, chain);
  }

  return { afterCardPlayed, resume, run };
})();
