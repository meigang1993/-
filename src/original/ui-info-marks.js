// 角色信息面板的状态标记片段（绿帽 / 粮食 / 狂暴 / 战车 / 任务 / 各套装 / 玛丽亚数字与祝福）。
// 从 ui-info.js 拆出，避免该文件超过 200 行硬约束；标记之间互不依赖，仅被面板函数引用。
window.GameUIInfoMarks = () => {
  function greenHatMark(u) {
    const count = Math.min(5, (u?.greenHat || 0) + (u?.envy || 0));
    return count ? `<span class="green-hat-badge" title="绿帽标记：${count}/5">绿帽×${count}</span>` : "";
  }
  function foodMark(u) { return u.food ? `<span class="green-hat-badge" title="快速生长粮食标记：${u.food}">粮食×${u.food}</span>` : ""; }
  function rageMark(u) {
    const count = Math.max(0, Math.min(10, u?.rageMarks || 0));
    return count
      ? `<span class="green-hat-badge rage-mark-badge" title="狂战标记：${count}/10">狂战×${count}</span>`
      : "";
  }
  function tankShellMark(u) {
    // 梅尔卡坦克：装填完毕后到下回合准备阶段发射前，头像上显示炮弹标记
    return u?.ruinsTankShellReady
      ? `<span class="green-hat-badge tank-shell-badge" title="炮弹标记：下回合准备阶段对所有敌方角色造成攻击力2倍伤害，每名角色需打出2张【闪】抵消">炮弹</span>`
      : "";
  }
  function missionMark(u) {
    if (u?.ref !== "hoshino_yi" || u.hoshinoMissionResult) return "";
    const count = Math.max(0, Math.min(20, u.hoshinoMissionCards || 0));
    return `<span class="green-hat-badge mission-badge" title="梦想真理：已使用${count}/20张牌">使命 ${count}/20</span>`;
  }
  function idolSuitMark(u) {
    const suit = ["♥", "♦", "♠", "♣"].includes(u?.hoshinoLastSuit) ? u.hoshinoLastSuit : "";
    return suit ? `<span class="green-hat-badge idol-suit-badge" title="偶像之星：上一张标准花色牌为${suit}">偶像 ${suit}</span>` : "";
  }
  function domeSuitMark(u) {
    if (u?.ref !== "hoshino_yi") return "";
    const suits = ["♥", "♦", "♠", "♣"].filter(suit => (u.hoshinoSuitSet || []).includes(suit));
    return suits.length ? `<span class="green-hat-badge dome-suit-badge" title="巨蛋演出：已记录${suits.join("、")}">巨蛋 ${suits.join("")}</span>` : "";
  }
  function jokerSuitMark(u) {
    if (u?.ai !== "raff_assassin" || !["♥", "♦", "♠", "♣"].includes(u.jokerSuit)) return "";
    const red = u.jokerSuit === "♥" || u.jokerSuit === "♦";
    const mode = u.jokerMode === "red" ? "大鬼牌模式：惩罚红色牌" : "小鬼牌模式：惩罚黑色牌";
    return `<span class="joker-suit-badge ${red ? "red" : "black"}" title="鬼牌狂欢判定：${u.jokerSuit}；${mode}">${u.jokerSuit}</span>`;
  }
  function artinaSuitMark(u) {
    if (u?.ref !== "artina") return "";
    const suits = ["♥", "♦", "♠", "♣"].filter(suit => (u.artinaSuits || {})[suit]);
    return suits.length
      ? `<span class="green-hat-badge dome-suit-badge" title="蓄力子弹：已记录${suits.join("、")}，下一张实体单体【杀】伤害×${1 + suits.length}">蓄力 ${suits.join("")}</span>`
      : "";
  }
  function deathWaveSuitMark(u) {
    // 机械AI龙：死亡音波记录的花色，显示在头像上
    if (u?.ai !== "ruins_dragon") return "";
    const recorded = Array.isArray(u?.ruinsDeathWaveSuits)
      ? u.ruinsDeathWaveSuits : [u?.ruinsDeathWaveSuit];
    const list = ["♥", "♦", "♠", "♣"].filter(suit => recorded.includes(suit));
    return list.length
      ? `<span class="green-hat-badge death-wave-badge" title="死亡音波：已记录${list.join("、")}花色；敌方角色回合内未使用其中任一花色，回合结束时受到等同于攻击力的伤害">音波 ${list.join("")}</span>`
      : "";
  }
  function vulnerableMark(u) {
    return u?.vulnerable
      ? `<span class="green-hat-badge vulnerable-badge" title="脆弱标记：受到的伤害提升50%">脆弱</span>`
      : "";
  }
  function mariaNumberMark(u) {
    if (u?.ref !== "maria") return "";
    // 显示「标记数/目标数」：本阶段使用的牌数达到目标数时摸等量牌，
    // 之后重新计数且目标数 +1（1 → 2 → 3 …）。
    const used = u?.mariaUseCount || 0;
    const target = Math.max(1, u?.mariaNext || 1);
    const bonus = Math.min(u?.mariaMarks || 0, target);
    const remain = Math.max(1, target - used);
    const tip = `神数咒语：再使用${remain}张牌后摸${target}张牌；当前攻击力与魔力各+${bonus}`;
    return `<span class="green-hat-badge" title="${tip}">神数 ${bonus}/${target}</span>`;
  }
  function mariaBlessingMark(u) {
    // 荣誉祝福作用于我方全体，因此每个受益角色都显示剩余花色。
    const suits = Array.isArray(u?.mariaBlessingSuits) ? u.mariaBlessingSuits : [];
    if (!suits.length) return "";
    const bonus = u.mariaBlessing || {};
    const gain = `攻击+${bonus.attack || 0}、魔力+${bonus.magic || 0}、速度+${bonus.speed || 0}`;
    return `<span class="green-hat-badge dome-suit-badge" title="荣誉祝福：${gain}；剩余花色${suits.join("、")}，每回合消失一个，全部消失后属性提升失效">祝福 ${suits.join("")}</span>`;
  }  return { greenHatMark, foodMark, rageMark, tankShellMark, missionMark, idolSuitMark, domeSuitMark, jokerSuitMark, artinaSuitMark, deathWaveSuitMark, vulnerableMark, mariaNumberMark, mariaBlessingMark };
};
