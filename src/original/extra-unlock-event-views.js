window.ExtraUnlockEventViews = (() => {
  const U = () => window.UICommon;
  function portrait(c) { return c ? `<div class="portrait vn-loki"><img src="${U().esc(c.avatar || c.art)}" alt="${U().esc(c.name)}" loading="lazy" decoding="async"></div>` : ""; }
  function littleElranaUnlock(state) {
    const lines = [
      ["小艾尔拉娜", "母亲！你怎么在这里，是来接我的吗？"],
      ["艾尔拉娜", "乖孩子，回到我身边吧。你不是克罗博士的工具。"],
      ["小艾尔拉娜", "真的吗？我可以离开工厂，和母亲一起回家吗？"],
      ["艾尔拉娜", "当然。以后你跟着我，也帮罗卡尔他们战斗。"],
      ["小艾尔拉娜", "好的，母亲。我想证明自己不是假的。"],
      ["艾尔拉娜", "你是真的。你是妈妈的乖孩子。"],
    ];
    const elrana = state.chars.find(c => c.id === "elrana"), little = state.chars.find(c => c.id === "little_elrana");
    return `<div class="first-defeat-event"><h2>克隆体归巢</h2><div class="vn-stage">${portrait(elrana)}${portrait(little)}</div><div class="vn-lines">${lines.map(([n, t]) => `<div class="vn-line"><b>${U().esc(n)}</b><span>${U().esc(t)}</span></div>`).join("")}</div><p class="muted">战斗被强制终止，小艾尔拉娜加入角色栏，队伍返回别墅。</p><div class="actions"><button data-little-elrana-unlock-complete="1">带小艾尔拉娜回别墅</button></div></div>`;
  }
  function aceUnlock(state) {
    const lines = [
      ["贝丝妲", "艾尔拉娜，你终于醒了。我有事情想问你，你最好老实回答。"],
      ["艾尔拉娜", "我知道母亲想知道什么。我只不过利用了你的计划。"],
      ["贝丝妲", "你到底想干什么？想害我？自己成为女王？"],
      ["艾尔拉娜", "那是你的野心。我只不过不想让你一错再错，就破坏了你的计划。"],
      ["贝丝妲", "那你为什么还协助我七子归巢计划？用基因改造让你们都生个儿子？"],
      ["艾尔拉娜", "七子归巢——那是普雷希姨妈的计划。"],
      ["贝丝妲", "你说什么！难道一开始我就被你算计了？普雷希有什么目的！"],
      ["艾尔拉娜", "就是为了制造更多王血男魅魔，对抗即将降临这个世界的破灭事象。"],
      ["贝丝妲", "破灭事象？毁灭世界？他们是什么东西？"],
      ["艾尔拉娜", "等普雷希姨妈过来，她会告诉你的。世界各地都出现了时空裂缝的目击报道了。"],
      ["贝丝妲", "我听说了。里面不断出现了名为凋零者的怪物，世界政府也封锁了很多地区。"],
      ["艾尔拉娜", "母亲，艾斯现在在哪？"],
      ["贝丝妲", "差点忘了。艾伦格把他送回来了。他现在在你房间里，你去找他吧。"],
      ["艾尔拉娜", "谢谢，母亲。"]
    ];
    const elrana = state.chars.find(c => c.id === "elrana"), ace = state.chars.find(c => c.id === "ace"), besta = { name: "贝丝妲", avatar: "./assets/generated/besta-villa-new.webp" };
    return `<div class="first-defeat-event"><h2>艾尔拉娜苏醒后的真相</h2><div class="vn-stage">${portrait(besta)}${portrait(elrana)}${portrait(ace)}</div><div class="vn-lines">${lines.map(([n, t]) => `<div class="vn-line"><b>${U().esc(n)}</b><span>${U().esc(t)}</span></div>`).join("")}</div><p class="muted">事件结束后，艾斯将加入角色栏。</p><div class="actions"><button data-ace-unlock-complete="1">结束剧情，解锁艾斯</button></div></div>`;
  }
  function underwaterTrainUnlock(state) {
    const lines = [
      ["贝丝妲", "宝宝，你看，这是妈妈跟你生的，纯血的女儿。"],
      ["贝丝妲", "魅魔近亲生子，生下来的孩子大概率是纯血，纯血意味着这孩子有永生，照顾你老死为止。"],
      ["曼妮", "妈妈不好了！普雷希，艾伦格，他们来了。"],
      ["贝丝妲", "来抓我的吗？反正我已经废人了，让他们进来。"],
      ["普雷希", "好久不见了，姐姐……"],
      ["艾伦格", "大姐，你误会了，二姐想跟你和好。"],
      ["普雷希", "我这次来，想请姐姐孩子们帮我一个忙。人鱼国的列车被狂鲨海盗团劫持，魅魔国和人鱼国航线被切断了。"],
      ["普雷希", "很多我国国民困在了人鱼国。背后的幕后黑手就是世界贵族。"],
      ["贝丝妲", "我会叫孩子们帮你讨伐海盗，不过还有个要求，把艾伦格留下来照顾我。"],
      ["普雷希", "好的…………"]
    ];
    const besta = state.chars.find(c => c.id === "besta") || { name: "贝丝妲", avatar: "./assets/images/besta-portrait.webp" }, nanali = state.chars.find(c => c.id === "nanali"), aileng = state.chars.find(c => c.id === "aileng");
    return `<div class="first-defeat-event"><h2>水下列车求援</h2><div class="vn-stage">${portrait(besta)}${portrait(nanali)}${portrait(aileng)}</div><div class="vn-lines">${lines.map(([n, t]) => `<div class="vn-line"><b>${U().esc(n)}</b><span>${U().esc(t)}</span></div>`).join("")}</div><p class="muted">事件结束后，艾伦格自动加入；副本“水下列车”开放。</p><div class="actions"><button data-underwater-train-unlock-complete="1">接受委托，解锁水下列车</button></div></div>`;
  }
  function opheliaUnlock(state) {
    const lines = [
      ["奥菲莉亚", "你就是帮母亲大人夺回列车的勇者？这么可爱一定很好吃。"],
      ["罗卡尔", "这是什么意思？"],
      ["奥菲莉亚", "没什么，按照母亲大人要求嫁给你，不过你得给本公主彩礼。"],
      ["罗卡尔", "彩礼是什么？"],
      ["奥菲莉亚", "小鬼，这种规矩不懂吗？"],
      ["罗卡尔", "什么规矩？？？"],
      ["艾伦格", "这些够吗？"],
      ["奥菲莉亚", "王子大人！你也来了，很久没见到你了，人家想死你了。"],
      ["艾伦格", "我们婚约已经取消很多年了，我问你这些够不够？"],
      ["奥菲莉亚", "够够，你让我嫁给他，你真的不介意？"],
      ["艾伦格", "抱歉，我有喜欢的人。你跟罗卡尔算联姻，为了两国恢复，所以我二姐叫他讨伐海盗，夺回了列车，打通了航线。"],
      ["奥菲莉亚", "你这样说了，那我跟你们走，不过王子大人至少多陪陪人家嘛。"],
      ["艾伦格", "好……好的。"],
      ["罗卡尔", "什么嘛，原来是拜金女，要不是妈妈要我来，我才不会找别人做我老婆。"],
      ["奥菲莉亚", "罗卡尔……不，亲爱的，海盗背后幕后黑手，是世界贵族，你可要小心，别死在他们手里。"],
      ["罗卡尔", "他们要来，统统打飞就行了。"]
    ];
    const ophelia = state.chars.find(c => c.id === "ophelia"), lokar = state.chars.find(c => c.id === "lokar"), aileng = state.chars.find(c => c.id === "aileng");
    return `<div class="first-defeat-event"><h2>人鱼公主的彩礼</h2><div class="vn-stage">${portrait(ophelia)}${portrait(lokar)}${portrait(aileng)}</div><div class="vn-lines">${lines.map(([n, t]) => `<div class="vn-line"><b>${U().esc(n)}</b><span>${U().esc(t)}</span></div>`).join("")}</div><p class="muted">事件结束后，奥菲莉亚加入角色栏。</p><div class="actions"><button data-ophelia-unlock-complete="1">带奥菲莉亚回别墅</button></div></div>`;
  }
  function bestaNurseryUnlock(state) {
    const lines = [
      ["艾伦格", "大姐，你那个诅咒，我了解一点，我的血精能暂时缓解症状，恢复魔力。"],
      ["贝丝妲", "是吗？之前做的时候，怎么没有？"],
      ["艾伦格", "好像需要宝珠配合。"],
      ["贝丝妲", "这样啊，你怎么不早说？这宝珠是魔国硬通货，还能解除大部分诅咒。"],
      ["艾伦格", "那就又要等你儿子收集了。"],
      ["贝丝妲", "那你去帮帮他吧，曼妮会照顾我的。"],
      ["艾伦格", "好吧，我去帮他。"]
    ];
    const besta = state.chars.find(c => c.id === "besta") || { name: "贝丝妲", avatar: "./assets/images/besta-portrait.webp" }, aileng = state.chars.find(c => c.id === "aileng");
    return `<div class="first-defeat-event"><h2>血精与宝珠</h2><div class="vn-stage">${portrait(aileng)}${portrait(besta)}</div><div class="vn-lines">${lines.map(([n, t]) => `<div class="vn-line"><b>${U().esc(n)}</b><span>${U().esc(t)}</span></div>`).join("")}</div><p class="muted">事件结束后，贝丝妲会在孕育殿堂开放兑换，价格40精华宝珠。</p><div class="actions"><button data-besta-nursery-unlock-complete="1">开放贝丝妲兑换</button></div></div>`;
  }
  return { littleElranaUnlock, aceUnlock, underwaterTrainUnlock, opheliaUnlock, bestaNurseryUnlock };
})();
