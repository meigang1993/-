// 天日国鹰7研究所 · 解锁剧情与触发链（阶段性占位，2026-11-21）
// 触发口径：普雷希 + 米尔尤拉已解锁，且首次通关废墟沙城·冒险级后回到大厅。
// 复用 orc-unlock-events.js 的 pending → hallModal → ServerCore.unlockEvent 范式；
// 对话渲染复用 AdvDialogue，登场角色直接取角色栏里的橘千樱与罗卡尔。
// 剧情只解锁「剧情标记」，副本入口仍由 mission.devLocked 挡住，显示「未开发完成」。
window.TenriInstituteUnlockEvents = (() => {
  const EVENT_ID = "tenri_institute";
  const FLAG = "tenriInstituteUnlocked";
  const PENDING = "tenriInstituteUnlockPending";
  const SEEN = "tenriInstituteUnlockSeen";
  const MODAL = "tenriInstituteUnlock";

  // 台词按策划原文逐句录入；「那我也准备一提」为原文用字，未作改字。
  const LINES = [
    ["橘千樱", "好了，我帮你做完了事，接下来帮我了"],
    ["罗卡尔", "去天日国吗？那我也准备一提，那个研究所看起来很危险"],
    ["橘千樱", "确实，不过，小心魔族的特务，我们行踪他们每次都精准找到，我们这里有内鬼，你没有发现吗？笨蛋！"],
    ["罗卡尔", "我看出来了，难道又是艾尔拉娜姐姐干的？"],
    ["橘千樱", "那个魅魔医生看起来大概率就是，一直神神秘秘的，看来我们要小心"],
    ["橘千樱", "你大姐安洁莉卡，把这件事告诉我了，听说她与魔后有勾结"],
    ["罗卡尔", "我听妈妈说过，艾尔拉娜姐姐背叛了妈妈，导致妈妈那个……不能说的计划失败了"],
    ["橘千樱", "是吗？看起来不是什么好东西，你的母亲也有问题。"],
    ["橘千樱", "算了，我也去做好明天出发的准备"],
  ];

  function tenriInstituteUnlock(state) {
    return window.AdvDialogue.render({
      key: MODAL,
      title: "天日国鹰7研究所 · 出发前夜",
      cast: window.AdvDialogue.cast(state, ["chiyo", "lokar"]),
      lines: LINES,
      note: "事件结束后，「天日国鹰7研究所」剧情解锁；副本内容仍在开发，入口暂显示「未开发完成」。",
      buttonAttribute: "data-tenri-institute-unlock-complete",
      buttonText: "各自准备，明天出发",
    });
  }

  // 通关结算挂点：条件满足只写 pending；若此刻已有别的剧情弹窗占着，
  // 不覆盖 hallModal，交给 triggerPending 在下次回大厅时补上。
  window.triggerTenriInstituteUnlockEvent = function triggerTenriInstituteUnlockEvent(state, run) {
    state.flags = state.flags || {};
    if (state.flags[FLAG] || state.flags[SEEN] || state.flags[PENDING]) return false;
    if (!window.GameDataTenriInstitute?.unlockCastReady?.(state)) return false;
    if (!window.GameDataTenriInstitute?.clearedRuinsAdventure?.(state, run)) return false;
    state.flags[PENDING] = true;
    if (!state.hallModal) state.hallModal = MODAL;
    return true;
  };

  function triggerPending(state) {
    if (state.view !== "hall" || state.hallModal || state.battle || state.explore) return false;
    if (!state.flags?.[PENDING] || state.flags?.[FLAG] || state.flags?.[SEEN]) return false;
    state.hallModal = MODAL;
    return true;
  }

  window.completeTenriInstituteUnlockEvent = async function completeTenriInstituteUnlockEvent() {
    const ok = await window.ServerCore.call("unlockEvent", { id: EVENT_ID }, state);
    if (ok.stale) return false;
    if (!ok.ok) { state.log.unshift("剧情解锁失败，请重试。"); render(); persist(); return false; }
    state.log.unshift("天日国鹰7研究所剧情已解锁，橘千樱与罗卡尔约定明天出发。副本入口暂未开发完成。");
    state.hallModal = null;
    const saved = await persist({ flush: true });
    render();
    return saved;
  };

  return { EVENT_ID, FLAG, PENDING, SEEN, MODAL, LINES, tenriInstituteUnlock, triggerPending };
})();
