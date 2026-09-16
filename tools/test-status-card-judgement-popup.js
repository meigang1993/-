/*
 * 检查：状态牌生效时是否显示判定弹窗（.judgement-popup）
 *
 * 关注点：
 *   1. 五种状态牌判定是否都向 animQueue 推入 type:"judgement" 事件
 *   2. 事件是否携带 UI 渲染所需的字段（skill / suit / name / card / success）
 *   3. 事件被 EventRunner 消费后，battle.judgement 是否被赋值
 *      （ui-battle-overlays.judgement() 依赖它来渲染弹窗）
 *   4. 判定结果文案是否与实际效果一致
 */
const fs = require("fs");
const vm = require("vm");
const {
  assert, card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "battle-prepare-prompts.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const STATUS_CASES = [
  { key: "stun", name: "眩晕", suits: ["♠", "♣"], label: "跳过出牌阶段" },
  { key: "seal", name: "封魔", suits: ["♥", "♦"], label: "跳过摸牌阶段且本回合无法摸牌" },
  { key: "paralysis", name: "麻痹", suits: ["♥", "♠"], label: "本回合无法使用牌" },
  { key: "confusion", name: "混乱", suits: ["♠", "♥"], label: "随机对我方其他角色视为使用虚拟【杀】" },
  { key: "freeze", name: "冰冻", suits: ["♦", "♣"], label: "本回合无法使用【杀】牌" },
];

function makeUnit(side = "ally") {
  const u = unitFromCharacter(GameData.characters[0], `u-${side}`);
  u.side = side;
  u.hp = 80;
  u.deck = [];
  u.discard = [];
  u.hand = [];
  return u;
}

function battleOf(unit) {
  const battle = {
    allies: unit.side === "ally" ? [unit] : [],
    enemies: unit.side === "enemy" ? [unit] : [],
    animQueue: [],
    judgement: null,
  };
  return { battle, state: { battle } };
}

// 用固定花色构造牌堆顶，使判定结果可控
function deckWith(suit) {
  return [card("判定牌", "tactic", { suit })];
}

console.log("=== 状态牌判定弹窗检查 ===");

STATUS_CASES.forEach(({ key, name, suits }) => {
  // 命中情形
  suits.forEach((suit) => {
    const unit = makeUnit();
    unit.hand = [card(name, "status", { statusKey: key, suit: "♦" })];
    unit.deck = deckWith(suit);
    const { state, battle } = battleOf(unit);
    window.BattleStatusCards.judgement(state, unit);

    const events = battle.animQueue.filter(e => e.type === "judgement");
    record(
      `${name} 判定命中(${suit}) 推入弹窗事件`,
      events.length === 1,
      `事件数=${events.length}`,
    );
    const evt = events[0];
    if (evt) {
      record(
        `${name} 命中事件字段完整`,
        evt.skill === name && evt.suit === suit && evt.card && evt.success === true
          && evt.uid === unit.uid && typeof evt.id === "string",
        `skill=${evt.skill} suit=${evt.suit} success=${evt.success}`,
      );
    }
  });

  // 未命中情形
  const missSuit = ["♠", "♥", "♦", "♣"].find(s => !suits.includes(s));
  const unit2 = makeUnit();
  unit2.hand = [card(name, "status", { statusKey: key, suit: "♦" })];
  unit2.deck = deckWith(missSuit);
  const ctx2 = battleOf(unit2);
  window.BattleStatusCards.judgement(ctx2.state, unit2);
  const ev2 = ctx2.battle.animQueue.filter(e => e.type === "judgement");
  record(
    `${name} 判定未命中(${missSuit}) 仍推入弹窗事件`,
    ev2.length === 1 && ev2[0].success === false,
    `事件数=${ev2.length} success=${ev2[0]?.success}`,
  );
});

// 效果与文案一致性
console.log("\n=== 判定效果与文案一致性 ===");
{
  const u = makeUnit();
  u.hand = [card("眩晕", "status", { statusKey: "stun", suit: "♦" })];
  u.deck = deckWith("♠");
  const c = battleOf(u);
  window.BattleStatusCards.judgement(c.state, u);
  record("眩晕命中 → skipPlayPhase", u.skipPlayPhase === true);
}
{
  const u = makeUnit();
  u.hand = [card("封魔", "status", { statusKey: "seal", suit: "♦" })];
  u.deck = deckWith("♥");
  const c = battleOf(u);
  window.BattleStatusCards.judgement(c.state, u);
  record("封魔命中 → skipDrawPhase + drawLockedThisTurn",
    u.skipDrawPhase === true && u.drawLockedThisTurn === true);
}
{
  const u = makeUnit();
  u.hand = [card("冰冻", "status", { statusKey: "freeze", suit: "♦" })];
  u.deck = deckWith("♦");
  const c = battleOf(u);
  window.BattleStatusCards.judgement(c.state, u);
  record("冰冻命中 → frozenSlash", u.frozenSlash === true);
}
{
  const u = makeUnit();
  u.hand = [card("麻痹", "status", { statusKey: "paralysis", suit: "♦" })];
  u.deck = deckWith("♥");
  const c = battleOf(u);
  window.BattleStatusCards.judgement(c.state, u);
  record("麻痹命中 → skipPlayPhase", u.skipPlayPhase === true);
}

// UI 渲染层：battle.judgement 被 EventRunner 消费后应能渲染出弹窗
console.log("\n=== UI 渲染层 ===");
// GameUIBattleOverlays 是工厂函数 U => {...}，测试里注入最小 U（esc / card）
vm.runInThisContext(
  fs.readFileSync("./src/original/ui-battle-overlays.js", "utf8"),
  { filename: "ui-battle-overlays.js" },
);
const mockU = {
  esc: s => String(s ?? ""),
  card: c => `<div class="play-card">${c?.suit || ""}${c?.name || ""}</div>`,
};
// 工厂只导出 render(state, battle, P)；P 是所有 picker 的集合，测试里全部返回空串
const mockP = new Proxy({}, { get: () => () => "" });
const overlays = window.GameUIBattleOverlays(mockU);
record(
  "GameUIBattleOverlays.render 可用",
  typeof overlays?.render === "function",
);
window.BattleResponseUI = window.BattleResponseUI
  || new Proxy({}, { get: () => () => "" });
{
  const u = makeUnit();
  u.hand = [card("眩晕", "status", { statusKey: "stun", suit: "♦" })];
  u.deck = deckWith("♠");
  const c = battleOf(u);
  window.BattleStatusCards.judgement(c.state, u);
  const evt = c.battle.animQueue.find(e => e.type === "judgement");
  // 模拟 EventRunner 消费（handlers.judgement 第一步：battle.judgement = evt）
  c.battle.judgement = evt;
  const html = overlays.render(c.state, c.battle, mockP) || "";
  record(
    "judgement 事件可渲染出 .judgement-popup",
    html.includes("judgement-popup"),
    html ? `片段：${html.slice(0, 70)}…` : "渲染函数未返回内容",
  );
  record(
    "弹窗包含技能名与成功态",
    html.includes("眩晕") && html.includes("success"),
    `含技能名=${html.includes("眩晕")} 含success=${html.includes("success")}`,
  );
}
{
  // 未命中时应渲染 fail 样式，而不是 success
  const u = makeUnit();
  u.hand = [card("冰冻", "status", { statusKey: "freeze", suit: "♦" })];
  u.deck = deckWith("♠");
  const c = battleOf(u);
  window.BattleStatusCards.judgement(c.state, u);
  c.battle.judgement = c.battle.animQueue.find(e => e.type === "judgement");
  const html = overlays.render(c.state, c.battle, mockP) || "";
  record(
    "未命中渲染 fail 态而非 success",
    html.includes("judgement-popup") && html.includes("fail")
      && !html.includes("success"),
    html.slice(0, 70),
  );
}

// 混乱特殊分支：无同伴时自伤，也应先有弹窗
console.log("\n=== 混乱无同伴分支 ===");
{
  const u = makeUnit();
  u.hand = [card("混乱", "status", { statusKey: "confusion", suit: "♦" })];
  u.deck = deckWith("♠");
  const c = battleOf(u);
  const hpBefore = u.hp;
  window.BattleStatusCards.judgement(c.state, u);
  const evt = c.battle.animQueue.find(e => e.type === "judgement");
  record("混乱无同伴仍推入判定事件", !!evt && evt.skill === "混乱");
  record("混乱无同伴自伤", u.hp < hpBefore, `${hpBefore} → ${u.hp}`);
  record("混乱无同伴跳过出牌阶段", u.skipPlayPhase === true);
}

// 架构耦合修复验证：状态牌判定不再依赖副本专属模块转发
console.log("\n=== 调用链解耦检查 ===");
{
  const u = makeUnit();
  u.hand = [card("眩晕", "status", { statusKey: "stun", suit: "\u2666" })];
  u.deck = deckWith("\u2660");
  const c = battleOf(u);
  window.BattlePreparePrompts({ record: () => {} }).resolveJudgement(u, c.state);
  record(
    "resolveJudgement 直接调用通用模块生效",
    c.battle.animQueue.filter(e => e.type === "judgement").length === 1
      && u.skipPlayPhase === true,
  );

  // 反向验证：水下列车模块缺失时仍应生效（修复前会静默失效）
  const saved = window.UnderwaterTrainSkills;
  delete window.UnderwaterTrainSkills;
  const u2 = makeUnit();
  u2.hand = [card("眩晕", "status", { statusKey: "stun", suit: "\u2666" })];
  u2.deck = deckWith("\u2660");
  const c2 = battleOf(u2);
  window.BattlePreparePrompts({ record: () => {} }).resolveJudgement(u2, c2.state);
  record(
    "UnderwaterTrainSkills 缺失时判定仍生效（解耦后）",
    c2.battle.animQueue.filter(e => e.type === "judgement").length === 1
      && u2.skipPlayPhase === true,
    "修复前：通用机制挂在副本专属模块上，模块缺失会静默失效",
  );
  window.UnderwaterTrainSkills = saved;

  // 不能重复判定：解耦后不得同时触发两次
  const u3 = makeUnit();
  u3.hand = [card("眩晕", "status", { statusKey: "stun", suit: "\u2666" })];
  u3.deck = deckWith("\u2660");
  const c3 = battleOf(u3);
  window.BattlePreparePrompts({ record: () => {} }).resolveJudgement(u3, c3.state);
  record(
    "单次回合开始只触发一次判定（无重复）",
    c3.battle.animQueue.filter(e => e.type === "judgement").length === 1,
  );
}

const failed = results.filter(r => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log("失败项：");
  failed.forEach(f => console.log(`  - ${f.name} ${f.detail || ""}`));
  process.exit(1);
}
console.log("Status card judgement popup checks passed");
