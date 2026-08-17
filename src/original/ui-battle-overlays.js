window.GameUIBattleOverlays = U => {
  function testComplete() {
    return `<div class="defeat-popup"><div class="defeat-card"><h2>测试完成</h2><p>敌方已全灭。测试战斗不结算任何资源。</p><button data-return-test="1">返回测试配置</button></div></div>`;
  }

  function defeatPopup() {
    return `<div class="defeat-popup"><div class="defeat-card"><h2>全军覆没</h2><p>本次探索获得的资源和卡牌全部丢失，出战角色返回据点后恢复满血，可立即再次出征。</p><button data-return-hall="1">返回据点</button></div></div>`;
  }

  function speech(data) {
    const dismiss = data.dismissible
      ? ` data-dismiss-speech="1" title="点击关闭"` : "";
    if (data.lines?.length) {
      const lines = data.lines.map(line =>
        `<div><b>${U.esc(line.name)}：</b>${U.esc(line.text)}</div>`).join("");
      return `<div class="battle-subtitle multi"${dismiss}>${lines}</div>`;
    }
    return `<div class="battle-subtitle"${dismiss}>${U.esc(data.text)}</div>`;
  }

  function judgement(battle) {
    if (!battle.judgement) return "";
    const result = battle.judgement;
    const card = result.card
      ? { ...result.card, suit: result.suit || result.card.suit,
        name: result.name || result.card.name }
      : { suit: result.suit, name: result.name, type: "tactic" };
    return `<div class="judgement-popup ${result.success ? "success" : "fail"}"><b>${U.esc(result.skill)}<span>${result.success ? "成功" : "失败"}</span></b><div class="judge-card-wrap">${U.card(card, false)}</div></div>`;
  }

  function clash(battle) {
    if (!battle.lastClash) return "";
    const result = battle.lastClash;
    const actor = result.actorCard
      || { suit: result.a, name: "使用方", type: "tactic", text: "拼花对决" };
    const target = result.targetCard
      || { suit: result.t, name: "目标方", type: "response", text: "翻面判定" };
    return `<div class="clash-popup ${result.result === "成功" ? "success" : "resist"}"><b>拼花对决：<span>${U.esc(result.result)}</span></b><div class="clash-cards"><div class="clash-card-side"><span>使用方</span>${U.card(actor, false)}</div><div class="clash-card-side"><span>目标方</span>${U.card(target, false)}</div></div></div>`;
  }

  function revealCards(battle) {
    if (!battle.revealCards) return "";
    const reveal = battle.revealCards;
    const cards = (reveal.cards || [])
      .map(card => `<div class="reveal-card-wrap">${U.card(card, false)}</div>`)
      .join("");
    return `<div class="reveal-popup"><b>${U.esc(reveal.title || "展示牌")}</b><div class="reveal-cards">${cards}</div></div>`;
  }

  function render(state, battle, P) {
    return `${judgement(battle)}${clash(battle)}${revealCards(battle)}${P.armoryPicker(battle)}${P.wendyTutorPicker(battle)}${P.ailengDrillPicker(battle)}${P.cadicisResponsibilityPicker(battle)}${P.dimensionPicker(battle)}${P.opheliaGuardPicker(battle)}${P.newMoonPicker(battle)}${P.gerdaComfortPicker(battle)}${P.kaiichiSharePicker(battle)}${P.millerSlot(battle)}${window.BattleResponseUI.handReveal(battle)}${window.BattleResponseUI.manualDodgePrompt(battle)}${window.BattleResponseUI.manualCounterPrompt(battle)}${window.BattleResponseUI.recklessPrompt(battle)}${window.BattleResponseUI.evilEyePrompt(battle)}${battle.speech?.global ? speech(battle.speech) : ""}${battle.testRecovery ? `<div class="test-toast">测试模式·生命恢复</div>` : ""}${battle.testComplete ? testComplete() : ""}${battle.defeat ? defeatPopup() : ""}${state.explore?.rewardPopup?.battleOverlay ? DungeonSystem.rewardPopup(state.explore) : ""}`;
  }

  return { render };
};
