window.Onboarding = (() => {
  const VERSION = 1;
  // 引导步骤只前进，不回退：hall → prep → map → battle → reward → 完成。
  const ORDER = ["hall", "prep", "map", "battle", "reward"];
  const COPY = {
    hall: { title: "首次目标", target: "前往魔国机械工厂·普通级", sub: "完成第一场战斗并带回奖励" },
    prep: "初始队伍已经就绪。先从普通级熟悉战斗。",
    map: "从发光节点中选择路线。先点击标记“推荐”的战斗节点。",
    battle: {
      hand: "轮到罗卡尔。点击一张亮起的【杀（普攻）】。",
      target: "点击发光的敌人，将其设为目标。",
      confirm: "点击“确定”发动卡牌。",
      afterHit: "使用【杀】会消耗杀意。没有合适行动时，点击“结束出牌”。",
      enemyAttack: "【闪】目前会自动响应。可稍后在设置中开启手动响应。",
    },
    reward: "节点奖励会暂存在本次探索中。继续深入可以获得更多奖励，撤退可以带回当前所得。",
  };
  const fresh = () => ({ version: VERSION, step: "hall", completed: false, skipped: false });
  const done = () => ({ version: VERSION, step: "hall", completed: true, skipped: false });
  function ensure(state) {
    const flags = state?.flags;
    if (!flags || typeof flags !== "object") return null;
    if (!flags.onboarding || typeof flags.onboarding !== "object") flags.onboarding = done();
    const o = flags.onboarding;
    if (typeof o.step !== "string") o.step = "hall";
    return o;
  }
  function active(state) {
    const o = state?.flags?.onboarding;
    return !!o && o.version === VERSION && !o.completed && !o.skipped;
  }
  function stepOf(state) { return active(state) ? state.flags.onboarding.step : null; }
  function at(state, step) { return stepOf(state) === step; }
  function advance(state, step) {
    const o = ensure(state);
    if (!o || o.completed || o.skipped) return false;
    const cur = ORDER.indexOf(o.step), next = ORDER.indexOf(step);
    if (cur < 0 || next <= cur) return false;
    o.step = step;
    return true;
  }
  function skip(state) {
    const o = ensure(state);
    if (!o || o.completed) return false;
    o.skipped = true;
    return true;
  }
  function complete(state) {
    const o = ensure(state);
    if (!o) return false;
    o.completed = true;
    return true;
  }
  // 战斗内锚点提示：一次只显示一句；锁定或动画期间不提示。
  function battleHint(context) {
    const state = window.state;
    if (!active(state) || stepOf(state) !== "battle") return "";
    const { battle, actor, picked } = context || {};
    if (!battle || battle.locked) return "";
    const copy = COPY.battle;
    // 是否已指定目标决定第二句/第三句：仅"已选牌但未选目标"时才提示选目标。
    // 不能用 context.ready（它表示能否发动，选牌后即真，会跳过选目标这一句）。
    const hasTarget = !!battle.pendingTargetUid;
    const text = actor?.side === "enemy" ? copy.enemyAttack
      : !picked ? (battle.played?.length ? copy.afterHit : copy.hand)
        : hasTarget ? copy.confirm : copy.target;
    return `<p class="onboarding-tip" role="status">${text}</p>`;
  }
  return { VERSION, ORDER, COPY, fresh, done, ensure, active, stepOf, at, advance, skip, complete, battleHint };
})();
