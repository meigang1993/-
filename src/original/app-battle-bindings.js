window.bindBattleActionButtons = function bindBattleActionButtons() {
  const runStagedAction = (label, task, control) => {
    const actionState = state;
    const actionBattle = state.battle;
    const runtimeCurrent = window.AppRuntimeErrors?.guard?.(actionState) || (() => true);
    BattleActionGuard.whenIdle().then(() => {
      if (!runtimeCurrent() || actionState.battle !== actionBattle) return;
      BattleActionGuard.run(label, task, {
        control: control.isConnected ? control : null,
        isCurrent: runtimeCurrent,
      });
    });
  };
  document.querySelector("[data-retry-battle-assets]")?.addEventListener("click", e => {
    const actionState = state, actionBattle = state.battle;
    AppActionGuard.run("战斗素材重试失败", async ({ isCurrent }) => {
      const result = await BattleSystem.retryAssets(actionState, render);
      if (!isCurrent() || actionState.battle !== actionBattle || result.stale) return false;
      if (result.ok) window.dzmm?.toast?.success?.("战斗素材已恢复");
      else window.dzmm?.toast?.warning?.(`仍有${result.failed.length}项素材加载失败`);
      render();
      return result.ok;
    }, { state: actionState, control: e.currentTarget, busyText: "重试中…", captureRun: false, key: actionBattle });
  });
  document.querySelector("[data-end-play]")?.addEventListener("click", e => BattleActionGuard.run("结束出牌阶段失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.endPlay(actionState, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }));
  const updateHandScroll = hand => {
    const wrap = hand.closest(".hand-scroll-wrap"), max = hand.scrollWidth - hand.clientWidth;
    if (!wrap) return;
    wrap.classList.toggle("no-scroll", max <= 2);
    wrap.querySelector(".left")?.toggleAttribute("disabled", hand.scrollLeft <= 2);
    wrap.querySelector(".right")?.toggleAttribute("disabled", hand.scrollLeft >= max - 2);
  };
  document.querySelectorAll(".hand-scroll-wrap .hand").forEach(hand => { updateHandScroll(hand); hand.onscroll = () => updateHandScroll(hand); });
  document.querySelectorAll("[data-hand-scroll]").forEach(b => b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); const hand = b.closest(".hand-scroll-wrap")?.querySelector(".hand"); if (hand) { hand.scrollBy({ left: Number(b.dataset.handScroll) * Math.max(140, hand.clientWidth * .8), behavior: "smooth" }); requestAnimationFrame(() => updateHandScroll(hand)); } });
  document.querySelector("[data-cancel-hammer]")?.addEventListener("click", e => BattleActionGuard.run("取消雷神之锤失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.cancelThunderHammer(actionState, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }));
  document.querySelectorAll("[data-manual-dodge-pick]").forEach(b => b.onclick = e => { e.stopPropagation(); if (state.battle?.manualDodge) state.battle.manualDodge.selectedIndex = Number(b.dataset.manualDodgePick); render(); });
  document.querySelector("[data-manual-dodge-use]")?.addEventListener("click", e => { e.stopPropagation(); BattleActionGuard.run("手动闪避处理失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveManualDodge(actionState, true, actionState.battle?.manualDodge?.selectedIndex || 0, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  document.querySelectorAll("[data-deflect-choice]").forEach(b => b.onclick = e => { e.stopPropagation(); runStagedAction("弹反处理失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveManualDodge(actionState, true, actionState.battle?.manualDodge?.selectedIndex || 0, render, b.dataset.deflectChoice); if (!isCurrent()) return false; persist({ battleOperation: true }); }, b); });
  document.querySelector("[data-deflect-result-confirm]")?.addEventListener("click", e => { e.stopPropagation(); runStagedAction("弹反结果确认失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.confirmDeflectResult(actionState, render); if (!isCurrent()) return false; persist({ battleOperation: true }); }, e.currentTarget); });
  document.querySelectorAll("[data-risa-eye-choice]").forEach(b => b.onclick = e => { e.stopPropagation(); runStagedAction("吸魔邪眼猜拳处理失败", ({ state: actionState, isCurrent }) => { BattleSystem.resolveRisaEye(actionState, b.dataset.risaEyeChoice, render); if (!isCurrent()) return false; persist({ battleOperation: true }); }, b); });
  document.querySelector("[data-risa-eye-result-confirm]")?.addEventListener("click", e => { e.stopPropagation(); runStagedAction("吸魔邪眼结果确认失败", ({ state: actionState, isCurrent }) => { BattleSystem.confirmRisaEye(actionState, render); if (!isCurrent()) return false; persist({ battleOperation: true }); }, e.currentTarget); });
  document.querySelector("[data-manual-dodge-cancel]")?.addEventListener("click", e => { e.stopPropagation(); BattleActionGuard.run("取消手动闪避失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveManualDodge(actionState, false, 0, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  document.querySelectorAll("[data-manual-counter-pick]").forEach(b => b.onclick = e => { e.stopPropagation(); if (state.battle?.manualCounter) state.battle.manualCounter.selectedIndex = Number(b.dataset.manualCounterPick); render(); });
  document.querySelector("[data-manual-counter-use]")?.addEventListener("click", e => { e.stopPropagation(); BattleActionGuard.run("手动看破处理失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveManualCounter(actionState, true, actionState.battle?.manualCounter?.selectedIndex || 0, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  document.querySelector("[data-manual-counter-cancel]")?.addEventListener("click", e => { e.stopPropagation(); BattleActionGuard.run("取消手动看破失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveManualCounter(actionState, false, 0, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  const bindCounterTrigger = (selector, use, label) => {
    const control = document.querySelector(selector);
    if (!control) return;
    let fired = false;
    let pointerHandled = false;
    const run = e => {
      e.preventDefault(); e.stopPropagation();
      if (e.type === "click" && pointerHandled) {
        pointerHandled = false;
        return;
      }
      pointerHandled = e.type === "pointerdown";
      if (fired) return;
      fired = true;
      BattleActionGuard.run(label, async ({ state: actionState, isCurrent }) => {
        const resolved = await BattleSystem.resolveCounterTrigger(actionState, use, render);
        if (!resolved || !isCurrent()) return false;
        render(); persist({ battleOperation: true }); return true;
      }, { control }).finally(() => { fired = false; });
    };
    control.addEventListener("pointerdown", run);
    control.addEventListener("click", run);
  };
  bindCounterTrigger("[data-counter-trigger-use]", true, "触发技发动失败");
  bindCounterTrigger("[data-counter-trigger-skip]", false, "触发技跳过失败");
  document.querySelectorAll("[data-hand-reveal-pick]").forEach(b => b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); BattleActionGuard.run("展示牌处理失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveHandReveal(actionState, Number(b.dataset.handRevealPick), render); if (!isCurrent()) return false; render(); await BattleEffects.whenIdle?.(); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: b }); });
  document.querySelector("[data-hand-reveal-close]")?.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); BattleActionGuard.run("关闭展示牌失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveHandReveal(actionState, null, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  document.querySelectorAll("[data-reckless-pick]").forEach(b => b.onclick = e => { e.stopPropagation(); if (state.battle?.recklessPrompt) state.battle.recklessPrompt.selectedIndex = Number(b.dataset.recklessPick); render(); });
  document.querySelector("[data-reckless-use]")?.addEventListener("click", e => { e.stopPropagation(); BattleActionGuard.run("无谋冲拳处理失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveReckless(actionState, true, actionState.battle?.recklessPrompt?.selectedIndex || 0, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  document.querySelector("[data-reckless-cancel]")?.addEventListener("click", e => { e.stopPropagation(); BattleActionGuard.run("取消无谋冲拳失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.resolveReckless(actionState, false, 0, render); if (!isCurrent()) return false; render(); persist({ battleOperation: true }); }, { control: e.currentTarget }); });
  document.querySelector("[data-retreat]")?.addEventListener("click", () => { if (state.battle?.locked && !state.battle?.test && !state.battle?.testComplete) return; askGameConfirm({ title: state.battle?.test ? "结束测试" : "确认撤退", text: state.battle?.test ? "结束测试并返回配置？" : "已获资源将带回据点，全体恢复满血。", confirmText: state.battle?.test ? "结束测试" : "撤退", danger: true, persistAfter: true, onConfirm: () => BattleSystem.retreat(state) }); });
  document.querySelector("[data-return-hall]")?.addEventListener("click", e => BattleActionGuard.run("返回据点失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.returnHall(actionState); if (!isCurrent()) return false; await persist({ flush: true }); if (isCurrent()) render(); }, { control: e.currentTarget, allowBattleExit: true }));
  document.querySelector("[data-return-test]")?.addEventListener("click", e => { if (!lockControl(e.currentTarget)) return; window.BattleFX?.leave?.(state); state.battle = null; state.view = "hall"; state.hallModal = "testBattle"; render(); persist(); });
  document.querySelector("[data-victory-hall], [data-victory-continue], [data-victory-test]")?.addEventListener("click", e => { e.stopPropagation(); if (!e.currentTarget.closest(".victory-screen.ready")) return; BattleActionGuard.run("胜利结算失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.continueVictory(actionState); if (!isCurrent()) return false; await persist({ flush: true }); if (isCurrent()) render(); }, { control: e.currentTarget, allowBattleExit: true }); });
  document.querySelector(".victory-screen.ready[data-victory-screen]")?.addEventListener("click", e => BattleActionGuard.run("胜利结算失败", async ({ state: actionState, isCurrent }) => { await BattleSystem.continueVictory(actionState); if (!isCurrent()) return false; await persist({ flush: true }); if (isCurrent()) render(); }, { control: e.currentTarget, allowBattleExit: true }));
  window.bindGerdaComfortActions?.();
};
