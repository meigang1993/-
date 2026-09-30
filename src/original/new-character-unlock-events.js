window.NewCharacterUnlockEvents = (() => {
  const defeated = (state, id) => (state.defeatedElites || []).includes(id);
  function eventView(key, state, title, ids, lines, note, button, action) {
    return window.AdvDialogue.render({
      key, title, cast: window.AdvDialogue.cast(state, ids), lines, note,
      buttonAttribute: `data-${action}`, buttonText: button,
    });
  }
  function gerdaUnlock(state) {
    const lines = [
      ["兽人王邦迪", "你们打败了巴卡尔，兽人城终于有了重建的机会。"],
      ["格尔达", "爷爷，我也要和他们一起战斗。我跑得快，还能照顾队友。"],
      ["罗卡尔", "欢迎你，格尔达。不过出发前要先准备好殿堂的魔力。"],
      ["格尔达", "那就快点准备吧，下一场战斗我可不想错过。"],
    ];
    /* 邦迪是精英怪、不在角色栏，按名字直接挂他的立绘，否则这句台词无人对应。 */
    const bondi = { name: "兽人王邦迪", art: "./assets/new-portraits/orc-king-bondi.2f15201d.webp" };
    return eventView("gerdaNurseryUnlock", state, "兽人公主格尔达", [bondi, "gerda", "lokar"], lines,
      "事件结束后，格尔达会在孕育殿堂开放兑换，价格20精华宝珠。", "开放格尔达兑换", "gerda-nursery-unlock-complete");
  }
  function hoshinoUnlock(state) {
    const lines = [
      ["艾伦格", "这股魔力反应……和我过去认识的人一模一样。"],
      ["星野依", "我保留了她的记忆和愿望。现在，我要继续完成那场没有结束的演出。"],
      ["星野海一", "不管你现在是什么样子，我都愿意相信你。"],
      ["罗卡尔", "既然你们决定同行，就一起回殿堂吧。"],
    ];
    return eventView("hoshinoFamilyUnlock", state, "未完的巨蛋演出", ["aileng", "hoshino_yi", "hoshino_kaiichi", "lokar"], lines,
      "事件结束后，星野依与星野海一会同时加入角色栏。", "邀请星野一家入队", "hoshino-family-unlock-complete");
  }
  function ruinsSandCityUnlock(state) {
    const lines = [
      ["贝丝妲", "罗卡尔，有件事要交给你和姐姐们去做。"],
      ["罗卡尔", "又要我去做什么？妈妈。"],
      ["贝丝妲", "你那双胞胎姐姐，还有卡迪西斯，都去加撒地区打仗了，我很担心他们的安危。"],
      ["罗卡尔", "为什么要去这么危险的地方？"],
      ["贝丝妲", "因为卡迪西斯那位姑娘——她的家乡被世界贵族侵略了，我们不能坐视不管。"],
      ["罗卡尔", "我去就行。不过妈妈，事情结束后，我想好好陪你吃顿饭。"],
      ["贝丝妲", "妈妈答应你。为了以防万一，我请普雷希派了两位魅魔国的军方人员，她们打仗很专业，能帮你对付贵族军队。"],
      ["罗卡尔", "队里人已经够多了，又来两位……"],
      ["贝丝妲", "一位是狙击手，一位是支援兵，正好补上你的短板。"],
      ["罗卡尔", "安洁莉卡姐姐那边没问题吗？"],
      ["贝丝妲", "她有自己的想法，我们尊重就好。"],
      ["亚缇娜", "魅影突击队狙击手亚缇娜，前来报到。"],
      ["玛利亚", "支援兵玛利亚，会保证队伍的后勤与治疗。"],
      ["罗卡尔", "这样啊。那明天一早出发，先去加撒地区和姐姐们会合。"],
      ["贝丝妲", "路上小心，别让我担心。"],
    ];
    return eventView("ruinsSandCityUnlock", state, "加撒地区的战事", ["besta", "lokar", "artina", "maria"], lines,
      "事件结束后，副本“废墟沙城”开放，亚缇娜与玛利亚加入角色栏。",
      "解锁废墟沙城并邀请新角色", "ruins-sand-city-unlock-complete");
  }
  function hitwellUnlock(state) {
    const lines = [
      ["贝丝妲", "回来了？"],
      ["罗卡尔", "妈妈，我赢了。"],
      ["贝丝妲", "很好，我把他也带来了。"],
      ["罗卡尔", "谁呀，这小弟弟？"],
      ["希特威", "我是贝丝妲姐姐的奴隶……希特威。"],
      ["罗卡尔", "我怎么没听说过他？"],
      ["贝丝妲", "以前在黑市买的玩具，因为是天使很贵的，被我调教好了。你出生后我就把他交给曼妮了，不需要了。如今曼妮因为诅咒睡了，只好把他放了。"],
      ["罗卡尔", "这样啊，他是天使会魔法吗？"],
      ["贝丝妲", "嗯，而你继承了他一点能力。"],
      ["罗卡尔", "啊，妈妈你的意思是，他是我爸爸。"],
      ["贝丝妲", "对，我都舍不得榨死，你带着他去冒险吧，他的能力很好用。"],
      ["罗卡尔", "好，知道了。"],
    ];
    return eventView("hitwellUnlock", state, "贝丝妲的玩具", ["besta", "lokar", "hitwell"], lines,
      "事件结束后，希特威加入角色栏。", "带希特威同行", "hitwell-unlock-complete");
  }
  function recordDungeonClear(state, run) {
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
    // 首次击败伊迪斯后回到别墅触发；伊迪斯在 eliteUnlocks 内，击败即写入 defeatedElites。
    const hitwell = state.chars.find(character => character.id === "hitwell");
    if (hitwell?.locked && defeated(state, "pursuer_edis") && !state.flags?.hitwellUnlockSeen) {
      state.hallModal = "hitwellUnlock";
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
  return { gerdaUnlock, hoshinoUnlock, ruinsSandCityUnlock, hitwellUnlock, recordDungeonClear, triggerPending };
})();
