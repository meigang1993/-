window.GameUIHand = (() => {
  function render(state, U) {
    const responseHand = window.BattleResponseUI.responseHand(state.battle);
    if (responseHand) return responseHand;
    const context = window.GameUIHandState.create(state, U);
    if (!context.actor) {
      // 为我护驾发生在敌方回合，当前行动人是敌方单位，手牌区本就渲染空态。
      // 居中浮层已移除，改由这里的底部提示条承载，与交牌类同一口径；
      // 护驾者由玩家点击我方角色行上的队友指定。
      const battle = context.battle;
      const guarding = !!battle?.opheliaGuard
        && (window.GuestCharacterSkills?.guardVisible?.(battle) ?? true);
      const target = guarding && battle.allies
        .find(unit => unit.uid === battle.opheliaGuard?.targetUid);
      if (guarding) {
        // 非锁定技：玩家必须能明确选择「不发动」。按钮与提示文案都写明后果，
        // 与次元转移「跳过（不发动）」同口径，但不复用它那套专用恢复链。
        return `<div class="hand-panel guard-prompting"><div class="hand-head"><span class="discard-prompt">非锁定技·为我护驾：点击一名其他我方角色替${U.esc(target?.name || "奥菲莉亚")}使用【闪】；也可跳过（不发动），本次【杀】仍由原目标承受。</span><button data-ophelia-guard-skip="1" title="不发动为我护驾，本次杀仍由原目标承受">跳过（不发动）</button></div></div>`;
      }
      return `<div class="hand-panel"><span class="muted">${battle.thinkingUid ? "敌方思考中。" : "等待我方回合。"}</span></div>`;
    }
    return window.GameUIHandView.render(context, U);
  }
  return { render };
})();
