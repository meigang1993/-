// 战斗单位状态徽章渲染：从 ui-battle-units.js 拆出，保持对外行为完全一致。
// 只依赖注入的 U（转义与工具），加载期零副作用；缺文件时主文件显式抛错。
window.GameUIBattleUnitStatus = (U) => {
  function statusIcons(unitData) {
    const timerCount = status => /^计时(\d+)$/.exec(status)?.[1] || "";
    const statusTip = status => status === "毒" ? `毒：${unitData.poison || 0}层；回合开始时每枚标记造成施加者攻击力30%的毒属性伤害（至少1点，按施加时快照叠加）`
      : status === "感电" ? `感电：${unitData.shock || 0}层，每层按施加者攻击力30%追加伤害`
        : status === "歼灭" ? "歼灭模式"
          // 时停是米尔尤拉限定技【神奇怀表】的状态，说明写全三个负面效果，
          // 避免玩家只看到一个字却不知道发生了什么。
          : status === "时停" ? "时停：跳过其回合、不可响应且技能失效，跳过一次回合后标记消失"
            : status === "锁魂" ? "锁魂：杀牌伤害会传导给另一名锁魂目标"
              : timerCount(status) ? `自爆倒计时：${timerCount(status)}` : status;
    // 时停此前走 status[0] 兜底，只显示一个「时」字 —— 与「计时」的「计」
    // 同为单字且同样走默认粉色圆点样式，混在一起根本分不清，等于没有徽章。
    const statusText = status => status === "毒" ? `毒${unitData.poison || 0}`
      : status === "感电" ? `电${unitData.shock || 0}`
        : status === "锁魂" ? "锁"
          : status === "时停" ? "停"
            : timerCount(status) ? `计${timerCount(status)}` : status[0];
    const statusClass = status => `${status === "感电" ? "shock" : ""}`
      + ` ${status === "时停" ? "time-stop" : ""}`
      + ` ${timerCount(status) ? "timer" : ""}`;
    const burning = (unitData.hand || []).some(card => card.burning && !card._pendingDraw)
      ? `<span class="status-icon burning-hand" title="燃烧：每个准备阶段每张燃烧牌按施加者攻击力30%造成伤害，受到火属性伤害翻倍">火</span>`
      : "";
    const lock = unitData.lockSuit
      ? `<span class="status-icon lock-suit" title="锁定标记：${U.esc(unitData.lockSuit)}">${U.esc(unitData.lockSuit)}</span>`
      : "";
    // 判定已生效的状态不再重复显示"持牌"图标（持牌图标与生效标记会并排出现两次）
    const lockedNames = [];
    if (unitData.skipPlayPhase && unitData.skipPlayReason === "麻痹") lockedNames.push("麻痹");
    if (unitData.skipPlayPhase && unitData.skipPlayReason === "眩晕") lockedNames.push("眩晕");
    if (unitData.skipDrawPhase || unitData.drawLockedThisTurn) lockedNames.push("封魔");
    if (unitData.frozenSlash) lockedNames.push("冰冻");
    const statuses = (unitData.statuses || []).filter(status => status !== "妒火"
      && !lockedNames.includes(status))
      .map(status => `<span class="status-icon ${statusClass(status)}" title="${U.esc(statusTip(status))}">${U.esc(statusText(status))}</span>`)
      .join("");
    const paralysis = unitData.skipPlayPhase && unitData.skipPlayReason === "麻痹"
      ? `<span class="status-icon paralysis-locked" title="麻痹：本回合跳过出牌阶段，且无法使用或打出响应牌">麻</span>` : "";
    const stun = unitData.skipPlayPhase && unitData.skipPlayReason === "眩晕"
      ? `<span class="status-icon stun-locked" title="眩晕：本回合跳过出牌阶段">晕</span>` : "";
    const seal = unitData.skipDrawPhase || unitData.drawLockedThisTurn
      ? `<span class="status-icon seal-locked" title="封魔：本回合跳过摸牌阶段，且无法摸牌">魔</span>` : "";
    const freeze = unitData.frozenSlash
      ? `<span class="status-icon freeze-locked" title="冰冻：本回合无法使用【杀】牌">冻</span>` : "";
    // 【离子导弹】蓄力技计数器：未满置灰、满 4 点亮，图标上显示当前点数。
    const charge = window.TenriJaminSkills?.chargeBadge?.(unitData, U) || "";
    return `<div class="status-icons">${charge}${burning}${lock}${statuses}${paralysis}${stun}${seal}${freeze}</div>`;
  }
  return { statusIcons };
};
