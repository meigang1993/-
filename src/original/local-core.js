window.LocalCore = (() => {
  const { sanitize, outcomes } = window.LocalCoreUtils;
  const operations = {
    ...window.LocalCoreCharacterOps,
    ...window.LocalCoreCommerceOps,
    ...window.LocalCoreBountyOps,
    ...window.LocalCoreDungeonOps,
    ...window.LocalCoreEventOps,
  };
  function handle(method, args, state) {
    const core = sanitize(state, method);
    const result = run(core, method, args || {});
    const changed = result?.changed === true;
    const accepted = changed || result?.accepted === true;
    return { core, changed, apply: result?.apply === true, error: accepted ? null : operationError(method) };
  }
  function operationError(method) {
    const messages = {
      unlockChar: "孕育未生效：角色条件或精华宝珠不满足要求。",
      shopBuy: "购买未生效：商品无效、已售出或莉莉丝元不足。",
      shopDelete: "删除未生效：卡牌无效、牌库过小或莉莉丝元不足。",
      smeltRelic: "拆解未生效：饰品不存在。",
      settleDungeon: "副本结算未生效：节点状态或战斗结果无效。",
      claimBounty: "任务奖励未生效：没有可结算的有效奖励。",
      unlockEvent: "剧情解锁未生效：事件无效或已经完成。",
      buySkin: "皮肤兑换未生效：条件不满足或精华宝珠不足。",
      equipSkin: "皮肤装备未生效：尚未拥有、角色未解锁或已装备。",
    };
    return { code: "NO_CHANGE", message: messages[method] || "操作未生效：参数无效或条件不满足。" };
  }
  function run(core, method, args) {
    if (method === "sync") return outcomes.accepted;
    const operation = operations[method];
    if (!operation) throw new Error(`未知本地方法：${method}`);
    return operation(core, args);
  }
  return { handle };
})();
