window.VillaStoryEvents = (() => {
  const renderer = window.VillaEventRenderer;
  const character = (state, id) => state.chars.find(item => item.id === id);

  /* 纯剧情事件：不解锁角色，只推进剧情。
     与解锁事件的区别：完成时不调 ServerCore.unlockEvent，仅置 flag 并落盘。
     两个事件都由固定时机主动触发（新游戏 / 首战胜利回大厅），不参与 triggerAll 排队。 */
  const FLAGS = { newGameIntro: "newGameIntroSeen", firstVictory: "firstVictorySeen" };

  function newGameIntro(state) {
    const lines = [
      ["凯瑟琳", "小主人，去执行任务前，了解一下战斗方式"],
      ["凯瑟琳", "去完成首战吧"],
      ["罗卡尔", "你没有翅膀？难道你是低级人类魅魔？"],
      ["凯瑟琳", "小主人，难道你也鄙视我这种魅魔吗？"],
      ["罗卡尔", "不，不是，那我去战斗了 ，妈妈交给你了"],
      ["凯瑟琳", "放心吧，主人由我照顾"],
    ];
    return renderer.render({
      key: "newGameIntro", title: "出发之前",
      cast: [
        { character: character(state, "catherine"), className: "vn-loki" },
        { character: character(state, "lokar"), className: "vn-loki" },
      ],
      lines,
      note: "",
      buttonAttribute: "data-new-game-intro-complete",
      buttonText: "开始首次远征",
    });
  }

  function firstVictory(state) {
    const lines = [
      ["凯瑟琳", "小主人，了解战斗方式了呀，带着主人的魔偶去冒险吧"],
      ["凯瑟琳", "如果把曼妮四小姐唤醒，奴婢，就跟小主人一起去冒险，满足你任何需求，就算是身体方面也可以"],
      ["罗卡尔", "我知道了，我……走了"],
    ];
    return renderer.render({
      key: "firstVictory", title: "首战归来",
      cast: [
        { character: character(state, "catherine"), className: "vn-loki" },
        { character: character(state, "lokar"), className: "vn-loki" },
      ],
      lines,
      note: "",
      buttonAttribute: "data-first-victory-complete",
      buttonText: "结束剧情",
    });
  }

  function trigger(key, state) {
    const flag = FLAGS[key];
    if (!flag || !state) return false;
    state.flags = state.flags || {};
    if (state.flags[flag]) return false;
    state.view = "hall";
    state.hallModal = key;
    return true;
  }

  async function complete(key) {
    const flag = FLAGS[key];
    if (!flag) return false;
    state.flags = state.flags || {};
    state.flags[flag] = true;
    state.hallModal = null;
    const saved = await persist({ flush: true });
    render();
    return saved;
  }

  return { newGameIntro, firstVictory, trigger, complete };
})();

window.triggerNewGameIntroEvent = function triggerNewGameIntroEvent(state) {
  return window.VillaStoryEvents.trigger("newGameIntro", state);
};
window.completeNewGameIntroEvent = function completeNewGameIntroEvent() {
  return window.VillaStoryEvents.complete("newGameIntro");
};
window.triggerFirstVictoryEvent = function triggerFirstVictoryEvent(state) {
  return window.VillaStoryEvents.trigger("firstVictory", state);
};
window.completeFirstVictoryEvent = function completeFirstVictoryEvent() {
  return window.VillaStoryEvents.complete("firstVictory");
};
