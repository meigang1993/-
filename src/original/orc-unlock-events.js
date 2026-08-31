window.OrcUnlockEvents = (() => {
  const U = () => window.UICommon;
  function portrait(c) {
    return c ? `<div class="portrait vn-loki"><img src="${U().esc(c.avatar || c.art)}" alt="${U().esc(c.name)}" loading="lazy" decoding="async"></div>` : "";
  }
  function orcDungeonUnlock(state) {
    const lines = [
      ["贝丝妲", "哎呀，我可爱的小贱人，你怎么又来了？"],
      ["普雷希", "姐姐，兽人王孙女昨天向我求助，兽人城被魔王军占领了，希望我出面与魔王谈判。但是兽人城已经被完全占领了，见不到魔王。"],
      ["贝丝妲", "区区魔王军，以你的实力应该没有问题，为什么还要叫我？"],
      ["普雷希", "我身为魅魔女王，如果主动攻击魔王军，相当于宣战，我不想冒这个险，破坏两国关系。"],
      ["贝丝妲", "魔王目的是什么？兽人王跟魔王应该没什么过节，80年前圣魔战争，兽人族好歹帮助过魔王军与天使军打仗。"],
      ["普雷希", "不清楚，大概率是魔后的阴谋，不知道她又在进行什么邪恶计划。"],
      ["贝丝妲", "哼，那个小妮子，派了这么危险的内英组特务找我儿子麻烦，我真想去攻打魔王城。我再帮你一次吧，我也想找魔王问个清楚。"],
      ["普雷希", "姐姐，有些事告诉你。凋零者已经潜伏在世界各地了。"],
      ["贝丝妲", "世界政府不是严防死守着时空裂缝吗？还有不得了的怪物跑出来了？"],
      ["普雷希", "可能是最高级别凋零者，他们都会时空魔法，来到这个世界很容易。他们目的好像寻找什么混沌之子。"],
      ["贝丝妲", "混沌之子？我知道了，我会告诉孩子们注意凋零者。我这就出发。"]
    ];
    const besta = state.chars.find(c => c.id === "besta") || { name: "贝丝妲", avatar: "./assets/generated/besta-villa-new.webp" };
    const preshi = { name: "普雷希", avatar: "./assets/images/besta-portrait.png" };
    return `<div class="first-defeat-event"><h2>兽人地下城求援</h2><div class="vn-stage">${portrait(besta)}${portrait(preshi)}</div><div class="vn-lines">${lines.map(([n, t]) => `<div class="vn-line"><b>${U().esc(n)}</b><span>${U().esc(t)}</span></div>`).join("")}</div><p class="muted">事件结束后，副本“兽人地下城”开放；任务接取上限提高至10个。</p><div class="actions"><button data-orc-dungeon-unlock-complete="1">出发前往兽人领地</button></div></div>`;
  }
  async function unlockEvent(state, id) {
    const ok = await window.ServerCore.call("unlockEvent", { id }, state);
    if (ok.stale) return false;
    if (!ok.ok) { state.log.unshift("剧情解锁失败，请重试。"); render(); persist(); return false; }
    return true;
  }
  window.completeOrcDungeonUnlockEvent = async function completeOrcDungeonUnlockEvent() {
    if (!await unlockEvent(state, "orc_dungeon")) return;
    state.log.unshift("兽人地下城已解锁。任务接取上限提高至10个。");
    state.hallModal = null;
    const saved = await persist({ flush: true });
    render();
    return saved;
  };
  window.triggerOrcDungeonUnlockEvent = function triggerOrcDungeonUnlockEvent(state, run) {
    state.flags = state.flags || {};
    if (run?.missionId !== "underwater_train" || run?.difficultyId !== "adventure") return false;
    if (state.flags.orcDungeonUnlocked || state.flags.orcDungeonUnlockSeen) return false;
    state.flags.orcDungeonUnlockPending = true;
    state.hallModal = "orcDungeonUnlock";
    return true;
  };
  window.triggerRuinsSandCityUnlockEvent = function triggerRuinsSandCityUnlockEvent(state, run) {
    state.flags = state.flags || {};
    if (run?.missionId !== "orc_dungeon" || run?.difficultyId !== "warrior") return false;
    if (state.flags.ruinsSandCityUnlocked || state.flags.ruinsSandCityUnlockSeen) return false;
    state.flags.ruinsSandCityUnlockPending = true;
    state.hallModal = "ruinsSandCityUnlock";
    return true;
  };
  function triggerPending(state) {
    if (state.view !== "hall" || state.hallModal || state.battle || state.explore) return false;
    if (!state.flags?.ruinsSandCityUnlockPending || state.flags.ruinsSandCityUnlocked || state.flags.ruinsSandCityUnlockSeen) return false;
    state.hallModal = "ruinsSandCityUnlock";
    return true;
  }
  return { orcDungeonUnlock, triggerPending };
})();
