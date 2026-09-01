window.NewCharacterUnlockEvents = (() => {
  const U = () => window.UICommon;
  const defeated = (state, id) => (state.defeatedElites || []).includes(id);
  function portrait(state, id) {
    const character = state.chars.find(item => item.id === id);
    const art = character?.avatar || character?.art;
    return character && art ? `<div class="portrait vn-loki"><img src="${U().esc(art)}" alt="${U().esc(character.name)}" loading="lazy" decoding="async"></div>` : "";
  }
  function eventView(state, title, ids, lines, note, button, action) {
    const portraits = ids.map(id => portrait(state, id)).join("");
    const dialogue = lines.map(([name, text]) => `<div class="vn-line"><b>${U().esc(name)}</b><span>${U().esc(text)}</span></div>`).join("");
    return `<div class="first-defeat-event"><h2>${U().esc(title)}</h2><div class="vn-stage">${portraits}</div><div class="vn-lines">${dialogue}</div><p class="muted">${U().esc(note)}</p><div class="actions"><button data-${action}="1">${U().esc(button)}</button></div></div>`;
  }
  function gerdaUnlock(state) {
    const lines = [
      ["兽人王邦迪", "你们打败了巴卡尔，兽人城终于有了重建的机会。"],
      ["格尔达", "爷爷，我也要和他们一起战斗。我跑得快，还能照顾队友。"],
      ["罗卡尔", "欢迎你，格尔达。不过出发前要先准备好殿堂的魔力。"],
      ["格尔达", "那就快点准备吧，下一场战斗我可不想错过。"],
    ];
    return eventView(state, "兽人公主格尔达", ["gerda", "lokar"], lines, "事件结束后，格尔达会在孕育殿堂开放兑换，价格20精华宝珠。", "开放格尔达兑换", "gerda-nursery-unlock-complete");
  }
  function hoshinoUnlock(state) {
    const lines = [
      ["艾伦格", "这股魔力反应……和我过去认识的人一模一样。"],
      ["星野依", "我保留了她的记忆和愿望。现在，我要继续完成那场没有结束的演出。"],
      ["星野海一", "不管你现在是什么样子，我都愿意相信你。"],
      ["罗卡尔", "既然你们决定同行，就一起回殿堂吧。"],
    ];
    return eventView(state, "未完的巨蛋演出", ["hoshino_yi", "hoshino_kaiichi", "aileng"], lines, "事件结束后，星野依与星野海一会同时加入角色栏。", "邀请星野一家入队", "hoshino-family-unlock-complete");
  }
  function ruinsSandCityUnlock(state) {
    const lines = [
      ["反抗军指挥官", "感谢你们击退兽人地下城的魔王军。世界贵族已经把废墟沙城变成了战争机器的前线。"],
      ["亚缇娜", "我是魅影突击队的亚缇娜。请让我们加入，一起夺回沙城。"],
      ["玛利亚", "我会为队伍提供支援，直到那些侵略者全部撤退。"],
      ["罗卡尔", "好，我们现在就出发。"],
    ];
    return eventView(state, "废墟沙城的反攻", ["artina", "maria", "lokar"], lines,
      "事件结束后，副本“废墟沙城”开放，亚缇娜与玛利亚加入角色栏。",
      "解锁废墟沙城并邀请新角色", "ruins-sand-city-unlock-complete");
  }
  function recordDungeonClear(state) {
    if (run?.missionId !== "orc_dungeon" || run?.difficultyId !== "adventure" || run?.complete !== true) return false;
    if (state.flags?.hoshinoFamilyUnlockSeen || state.flags?.hoshinoFamilyUnlockPending) return false;
    state.flags ||= {};
    state.flags.hoshinoFamilyUnlockPending = true;
    return true;
  }
  function triggerPending(state) {
    if (state.view !== "hall" || state.hallModal || state.battle || state.explore) return false;
    const artina = state.chars.find(character => character.id === "artina");
    if (artina?.locked && state.flags?.ruinsSandCityUnlockPending && !state.flags.ruinsSandCityUnlockSeen) {
      state.hallModal = "ruinsSandCityUnlock";
      return true;
    }
    const yi = state.chars.find(character => character.id === "hoshino_yi");
    if (yi?.locked && state.flags?.hoshinoFamilyUnlockPending && !state.flags.hoshinoFamilyUnlockSeen) {
      state.hallModal = "hoshinoFamilyUnlock";
      return true;
    }
    const gerda = state.chars.find(character => character.id === "gerda");
    if (gerda?.locked && defeated(state, "demon_king_bakaar") && !state.flags?.gerdaNurseryUnlocked) {
      state.hallModal = "gerdaNurseryUnlock";
      return true;
    }
    return false;
  }
  async function complete(id, message, flashId) {
    const result = await window.ServerCore.call("unlockEvent", { id }, state);
    if (result.stale) return false;
    if (!result.ok) {
      state.log.unshift("剧情解锁失败，请重试。");
      render();
      persist();
      return;
    }
    state.codexFlashId = flashId;
    state.log.unshift(message);
    state.hallModal = null;
    const saved = await persist({ flush: true });
    render();
    return saved;
  }
  window.completeGerdaNurseryUnlockEvent = () => complete("gerda_nursery", "格尔达已在孕育殿堂开放兑换。", "gerda");
  window.completeHoshinoFamilyUnlockEvent = () => complete("hoshino_family", "星野依与星野海一加入角色栏。", "hoshino_yi");
  window.completeRuinsSandCityUnlockEvent = () => complete("ruins_sand_city", "废墟沙城已解锁，亚缇娜与玛利亚加入角色栏。", "artina");
  return { gerdaUnlock, hoshinoUnlock, ruinsSandCityUnlock, recordDungeonClear, triggerPending };
})();
