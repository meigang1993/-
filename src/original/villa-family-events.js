window.VillaFamilyEvents = (() => {
  const renderer = window.VillaEventRenderer;
  const character = (state, id) => state.chars.find(item => item.id === id);

  function gerlotUnlock(state) {
    const lines = [
      ["贝尔蒂丝", "你这个杂鱼女王！竟敢偷袭本小姐！"],
      ["普雷希", "这不是小外甥女吗，你醒了。"],
      ["贝尔蒂丝", "少废话，把杰洛特还给本小姐！"],
      ["普雷希", "还你可以。再跟妾身玩一次，让妾身开心开心。"],
      ["贝尔蒂丝", "那本小姐不客气了。"],
      ["普雷希", "你还是比不过妾身呀。不过妾身很开心，放人吧。"],
      ["魅魔女大臣", "女王殿下，不能再放了。贝丝妲手里已经有三个男魅魔孙子，再加上杰洛特就是第四个。"],
      ["普雷希", "大臣大人，大可放心。优秀的咒术师多萝西，他的诅咒无人可解。"],
      ["魅魔女大臣", "我就怕万一。"],
      ["普雷希", "出了什么事，妾身一人承担。"],
    ];
    return renderer.render({
      title: "贝尔蒂丝苏醒后的归还",
      cast: [
        { character: renderer.besta, className: "vn-besta" },
        { character: character(state, "bertis"), className: "vn-loki" },
        { character: character(state, "gerlot"), className: "vn-loki" },
      ],
      lines,
      note: "事件结束后，杰洛特将加入角色栏。",
      buttonAttribute: "data-gerlot-unlock-complete",
      buttonText: "结束剧情，解锁杰洛特",
    });
  }

  function cadicisUnlock(state) {
    const lines = [
      ["卡迪西斯", "母亲……你醒过来了，那我就放心了。"],
      ["贝丝妲", "普雷希不知道在搞什么名堂，又放一个回来。"],
      ["温蒂", "卡迪西斯，妈妈沉睡期间，你有没有好好读书？"],
      ["卡迪西斯", "我都考上了魅魔国军校。"],
      ["温蒂", "你怎么去读军校了？"],
      ["卡迪西斯", "个人兴趣而已。对了，母亲，我打算以雇佣兵身份前去加萨，加入反抗军打仗。"],
      ["温蒂", "你为什么要去打仗？不好好珍惜自己的生命吗？"],
      ["贝丝妲", "艾伦格告诉我，这孩子爱上了一位人类女孩。那个女孩的家乡正在遭受世界贵族军侵略，她的全家全部被贵族军空袭炸死了。"],
      ["温蒂", "妈妈你劝劝卡迪西斯……"],
      ["贝丝妲", "这是他自己决定的，我也拦不住。为了自己的恋人而战，应该的——就像罗卡尔为了我一样。"],
      ["温蒂", "好吧。必须答应我……好好活着回来。一定要活着回来。"],
      ["卡迪西斯", "我会回来的，母亲。不要为我担心。我想为他死去的家人报仇。"],
    ];
    return renderer.render({
      title: "温蒂苏醒后的战地来客",
      cast: [
        { character: renderer.besta, className: "vn-besta" },
        { character: character(state, "wendy"), className: "vn-loki" },
        { character: character(state, "cadicis"), className: "vn-loki" },
      ],
      lines,
      note: "事件结束后，卡迪西斯将加入角色栏。",
      buttonAttribute: "data-cadicis-unlock-complete",
      buttonText: "结束剧情，解锁卡迪西斯",
    });
  }

  function lukaUnlock(state) {
    const lines = [
      ["安洁莉卡", "喂，臭婊子，给老子解释一下。"],
      ["贝丝妲魔偶", "我不是你母亲。我是她的复制品。"],
      ["安洁莉卡", "难怪。那副表情——妈妈从来不会用这种眼神看老子。"],
      ["贝丝妲", "你还是一点都没变，对我还是这种态度。"],
      ["安洁莉卡", "少废话。你把我们当实现野心的工具，你认为我还认你这个母亲吗？"],
      ["鲁卡", "老妈，醒了！等你很久了！"],
      ["安洁莉卡", "大人说话，小孩别插嘴。"],
      ["贝丝妲", "认不认，无所谓。你中了普雷希的咒术师诅咒，就连你妹妹们也一样。我也中了别的诅咒，永久丧失了魔力。罗卡尔不在别墅——他在外面收集宝珠。我求了曼妮推我过来，是为了求你一件事。"],
      ["安洁莉卡", "什么事？"],
      ["贝丝妲", "帮助罗卡尔收集宝珠，唤醒你其他妹妹。这不是命令。"],
      ["安洁莉卡", "我知道。妹妹们有难我当然要帮。事情结束之后我还要找普雷希算账，还要找盖伊决斗。"],
      ["贝丝妲", "随便你，你就等着罗卡尔回来吧。不过我听说，盖伊可是魔王军四大将之一，你敢跟他打？"],
      ["安洁莉卡", "跟他战斗很多次了，一直没有分出胜负。肚子饿了，我出去一下。"],
      ["鲁卡", "老妈，等等我，我有钱，一起去买东西。"],
      ["曼妮", "妈妈，大姐她还是这样……"],
      ["贝丝妲", "不要紧。她从来没有对任何人温柔过——除了鲁卡。推我回卧室吧，曼妮。妈妈累了。"],
    ];
    return renderer.render({
      title: "安洁莉卡苏醒后的别墅重逢",
      cast: [
        { character: renderer.besta, className: "vn-besta" },
        { character: character(state, "besta_doll"), className: "vn-loki" },
        { character: character(state, "angelica"), className: "vn-loki" },
        { character: character(state, "luka"), className: "vn-loki" },
        { character: character(state, "manny"), className: "vn-loki" },
      ],
      lines,
      note: "事件结束后，鲁卡将加入角色栏。",
      buttonAttribute: "data-luka-unlock-complete",
      buttonText: "结束剧情，解锁鲁卡",
    });
  }

  return { gerlotUnlock, cadicisUnlock, lukaUnlock };
})();
