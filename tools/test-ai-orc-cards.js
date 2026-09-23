// 兽人地下城 7 张卡牌：AI 使用决策回归
// 覆盖卡牌：佯攻 / 勒杀 / 战争号角 / 武装 / 撞杀 / 后空翻 / 仇杀
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const {
  card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
// 注意：loadRuntime 已加载 data-cards.js / battle-ai.js / battle-ai-tactics.js /
// card-utils.js，重复加载会触发 "already declared"，此处只补未加载的两项。
[
  "battle-card-playability.js", "battle-combat-targeting.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

const deps = {
  isKillCard: c => c?.type === "slash",
  isSingleKillCard: c => c?.type === "slash" && !c.sweep,
  active: b => b.enemies[0],
};
const { canPlay } = window.BattleCardPlayability(deps);

// data-cards.js 中兽人地下城 7 张牌的卡名
const ORC_CARDS = ["佯攻", "勒杀", "战争号角", "武装", "撞杀", "后空翻", "仇杀"];
const allCards = window.GameDataCards?.eliteCards || [];
const defs = {};
ORC_CARDS.forEach(name => {
  const def = allCards.find(c => c.name === name);
  assert.ok(def, `卡池定义中必须存在「${name}」`);
  defs[name] = def;
});

function mkBattle(allyCount = 2, opts = {}) {
  const allies = [...Array(allyCount)].map((_, i) => {
    const u = unitFromCharacter(GameData.characters[i], `a${i}`);
    u.side = "ally";
    u.hand = [card("杀（普攻）", "slash", { suit: "♠" })];
    u.stats.attack = 3; u.stats.magic = 3; u.skills = [];
    return u;
  });
  const actor = unitFromCharacter(GameData.characters[0], "e0");
  actor.side = "enemy"; actor.ai = "grunt"; actor.intent = opts.intent ?? 3;
  actor.stats.attack = 4; actor.stats.magic = 4;
  actor.handLimit = 6; actor.skills = []; actor.battleRelics = [];
  actor.block = opts.block || 0;
  const mate = unitFromCharacter(GameData.characters[1], "e1");
  mate.side = "enemy"; mate.hand = []; mate.handLimit = 6;
  mate.skills = []; mate.battleRelics = [];
  const battle = {
    allies, enemies: [actor, mate], activeUid: "e0", phase: 4, animQueue: [], played: [],
  };
  window.state = {
    battle,
    random: window.GameRandom ? window.GameRandom.create(1124) : undefined,
  };
  return { battle, actor, mate, allies };
}

function aiPick(def, allyCount = 2, opts = {}) {
  const { battle, actor } = mkBattle(allyCount, opts);
  const testCard = { ...def, suit: Object.keys(def.suits || { "♠": 1 })[0] };
  actor.hand = [testCard];
  const result = window.BattleAI.choose(
    battle, actor, (a, c) => canPlay(a, c, battle));
  return { card: result?.card?.name || null, target: result?.target, raw: result };
}

const results = [];

// ---------- 1. 主动出牌阶段应当会使用的 4 张（杀 / 战术） ----------
const shouldUse = ["勒杀", "战争号角", "武装", "撞杀", "仇杀"];
shouldUse.forEach(name => {
  const picked = aiPick(defs[name]);
  const ok = picked.card === name;
  results.push({ card: name, expect: "使用", actual: picked.card, ok });
});

// ---------- 2. 响应牌 2 张：出牌阶段不该主动打出 ----------
["佯攻", "后空翻"].forEach(name => {
  const { battle, actor } = mkBattle(2);
  const c = { ...defs[name], suit: "♠" };
  actor.hand = [c];
  const playable = canPlay(actor, c, battle);
  results.push({
    card: name, expect: "响应牌不主动打出",
    actual: playable ? "可主动打出" : "不可主动打出",
    ok: playable === false,
  });
});

console.log("\n=== 兽人地下城 7 张卡 AI 决策 ===");
results.forEach(r => {
  console.log(`${r.ok ? "✅" : "❌"} ${r.card.padEnd(6)} 期望=${r.expect.padEnd(16)} 实际=${r.actual}`);
});
const failed = results.filter(r => !r.ok);
console.log(`\n汇总：${results.length - failed.length} 通过 / ${failed.length} 失败`);
if (failed.length) {
  console.log("FAIL_DETAIL=" + JSON.stringify(failed));
  process.exit(1);
}
console.log("[PASS] 兽人地下城 7 张卡 AI 决策全部符合预期");
