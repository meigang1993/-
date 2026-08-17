window.RecruitUnlockEvents = (() => {
  const U = () => window.UICommon;
  const defeated = (state, id) => (state.defeatedElites || []).includes(id);
  function portrait(character) {
    if (!character) return "";
    const art = character.avatar || character.art;
    return `<div class="portrait vn-loki"><img src="${U().esc(art)}" alt="${U().esc(character.name)}" loading="lazy" decoding="async"></div>`;
  }
  function eventView(state, title, ids, lines, note, button, action) {
    const portraits = ids.map(id => portrait(state.chars.find(character => character.id === id))).join("");
    const dialogue = lines.map(([name, text]) => `<div class="vn-line"><b>${U().esc(name)}</b><span>${U().esc(text)}</span></div>`).join("");
    return `<div class="first-defeat-event"><h2>${U().esc(title)}</h2><div class="vn-stage">${portraits}</div><div class="vn-lines">${dialogue}</div><p class="muted">${U().esc(note)}</p><div class="actions"><button data-${action}="1">${U().esc(button)}</button></div></div>`;
  }
  function soniaUnlock(state) {
    const lines = [
      ["XX型凋零者1124号", "父亲大人，转生成了魅魔都这么厉害。"],
      ["罗卡尔", "为什么叫我爸爸，我没有和别的女人，哪来的长得奇怪女儿？"],
      ["XX型凋零者1124号", "你没有前世记忆没关系，母亲大人灵魂检测系统错不了，你就是混沌之子。"],
      ["罗卡尔", "我听不懂，但我大受震撼。但你看起来非常危险，必须消灭。"],
      ["XX型凋零者1124号", "别别，我们来到这个世界就是为了寻找混沌之子，没有其他恶意。跟我走吧，父亲大人，回到你前世母亲混沌女神身边吧。"],
      ["罗卡尔", "妈妈说不要相信陌生人。你说的混沌女神跟盖亚妮丝是一个级别吗？"],
      ["XX型凋零者1124号", "混沌女神是万物之母，这个世界上的神明都是混沌女神造物。你不信没关系，我就待在你身边。"],
      ["罗卡尔", "你长成这样吓死人，你能不能变得像个人？"],
      ["XX型凋零者1124号", "魔力耗尽了，变不了身。给我精华宝珠，我去魔国买东西。对了，我的名字叫1124。"],
      ["罗卡尔", "连名字都不像人，还是我给你取名吧……你就叫索尼娅吧。"],
      ["XX型凋零者1124号", "好吧，知道了，快去准备宝珠。"],
    ];
    return eventView(state, "混沌之女索尼娅", ["sonia", "lokar"], lines, "事件结束后，索尼娅会在孕育殿堂开放兑换，价格50精华宝珠。", "开放索尼娅兑换", "sonia-nursery-unlock-complete");
  }
  function chiyoUnlock(state) {
    const lines = [
      ["橘千樱", "真行呀，小弟弟。"],
      ["罗卡尔", "又是你！（警惕）"],
      ["橘千樱", "我这次跟你玩够了，不要这么警惕我。我有委托交给你。"],
      ["罗卡尔", "什么委托？"],
      ["橘千樱", "我找到了克罗博士，得到了鹰7部队情报。"],
      ["罗卡尔", "鹰7部队！听妈妈说，很久以前天日国对钟龙国发动了侵略战争，鹰7部队抓了很多钟龙国人做惨无人道的人体实验！"],
      ["橘千樱", "原来你们魅魔知道这个历史呀，在天日国，这段历史就像根本不存在一样。"],
      ["罗卡尔", "他们是军国主义，怎么可能会承认历史？你这个委托跟这个有关吗？"],
      ["橘千樱", "鹰7部队还存在。我需要你这样有实力的魔族摧毁鹰7部队研究所，收集证据，曝光拥鹰派罪行。"],
      ["罗卡尔", "拥鹰派？好像是天日国的党派，听说他们都是极右翼。你为什么要做到这种地步？"],
      ["橘千樱", "我的母亲是钟龙国人，父亲是天日国人。母亲的家族是侵略战争受害者，母亲在天日国工作，有空时就宣传反战，让民众知道这段历史。"],
      ["橘千樱", "后来母亲被右翼分子杀害了，父亲也失踪了。我为了复仇才变成这个样子。"],
      ["罗卡尔", "……告诉我，研究所在哪里，我去打烂它。"],
      ["橘千樱", "就在天日国，那里非常危险。这几天我跟你一起冒险，让我看看你有没有这个实力去。"],
      ["罗卡尔", "好吧，我一定不会让你失望的。"],
    ];
    return eventView(state, "鹰7部队的线索", ["chiyo", "lokar"], lines, "事件结束后，橘千樱直接加入角色栏。", "接受委托，邀请橘千樱入队", "chiyo-recruit-unlock-complete");
  }
  function triggerPending(state) {
    if (state.view !== "hall" || state.hallModal || state.battle || state.explore) return false;
    const chiyo = state.chars.find(character => character.id === "chiyo");
    if (chiyo?.locked && defeated(state, "mechanical_bull_king") && !state.flags?.chiyoRecruitUnlockSeen) {
      state.hallModal = "chiyoRecruitUnlock";
      return true;
    }
    const sonia = state.chars.find(character => character.id === "sonia");
    if (sonia?.locked && defeated(state, "xx_witherer_1124") && !state.flags?.soniaNurseryUnlocked) {
      state.hallModal = "soniaNurseryUnlock";
      return true;
    }
    return false;
  }
  async function complete(id, message, flashId = null) {
    const result = await window.ServerCore.call("unlockEvent", { id }, state);
    if (result.stale) return false;
    if (!result.ok) {
      state.log.unshift("剧情解锁失败，请重试。");
      render();
      persist();
      return;
    }
    if (flashId) state.codexFlashId = flashId;
    state.log.unshift(message);
    state.hallModal = null;
    const saved = await persist({ flush: true });
    render();
    return saved;
  }
  window.completeSoniaNurseryUnlockEvent = () => complete("sonia_nursery", "索尼娅已在孕育殿堂开放兑换。混沌之女事件已完成。");
  window.completeChiyoRecruitUnlockEvent = () => complete("chiyo_recruit", "橘千樱加入角色栏。鹰7部队的线索事件已完成。", "chiyo");
  return { soniaUnlock, chiyoUnlock, triggerPending };
})();
