// 废墟沙城 10 张卡牌：AI 使用决策 + 商店/掉落链路回归
// 覆盖两个已修 BUG：
//   1. 枪林弹雨（hybridAttack 战术牌）AI 原本完全不使用
//   2. 物资私分（allyTarget+excludeSelf）AI 原本把目标指定为自己，导致队友摸牌不触发
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const {
  card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "battle-status-card-registry.js", "battle-status-card-storage.js",
  "battle-status-card-triggers.js", "battle-status-cards.js",
  "data-ruins-content.js", "ruins-card-skills.js",
  "battle-card-playability.js", "battle-ai-helpers.js",
  "battle-ai-slash-planner.js", "battle-ai-skill-planner.js",
  "battle-ai-tactics.js", "battle-ai.js",
  "battle-combat-targeting.js", "card-utils.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

const deps = {
  isKillCard: c => c?.type === "slash",
  isSingleKillCard: c => c?.type === "slash" && !c.sweep,
  active: b => b.enemies[0],
};
const { canPlay } = window.BattleCardPlayability(deps);
const cards = window.GameDataRuinsContent.cards;

function mkBattle(allyCount = 2) {
  const allies = [...Array(allyCount)].map((_, i) => {
    const u = unitFromCharacter(GameData.characters[i], `a${i}`);
    u.side = "ally";
    u.hand = [card("杀（普攻）", "slash", { suit: "♠" })];
    u.stats.attack = 3; u.stats.magic = 3; u.skills = [];
    return u;
  });
  const actor = unitFromCharacter(GameData.characters[0], "e0");
  actor.side = "enemy"; actor.ai = "grunt"; actor.intent = 3;
  actor.stats.attack = 4; actor.stats.magic = 4;
  actor.handLimit = 6; actor.skills = []; actor.battleRelics = [];
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

function aiPick(def, allyCount = 2) {
  const { battle, actor } = mkBattle(allyCount);
  const testCard = { ...def, suit: Object.keys(def.suits)[0] };
  actor.hand = [testCard];
  const result = window.BattleAI.choose(
    battle, actor, (a, c) => canPlay(a, c, battle));
  return { card: result?.card?.name || null, target: result?.target, raw: result };
}

// ---------- 1. AI 应当会使用的 8 张（主动出牌阶段） ----------
const shouldUse = ["拼杀", "魔之连杀", "魅惑术", "魅杀",
  "冰冻术", "流星杀", "吸魔杀", "物资私分", "枪林弹雨"];
shouldUse.forEach(name => {
  const def = cards.find(c => c.name === name);
  const picked = aiPick(def);
  assert.strictEqual(picked.card, name, `AI 应当会使用「${name}」，实际选择 ${picked.card}`);
});

// ---------- 2. 偷袭是响应牌，出牌阶段本就不该主动打出 ----------
{
  const def = cards.find(c => c.name === "偷袭");
  const { battle, actor } = mkBattle(2);
  const ambush = { ...def, suit: "♠" };
  actor.hand = [ambush];
  assert.strictEqual(canPlay(actor, ambush, battle), false,
    "偷袭为响应牌，出牌阶段 canPlay 应为 false");
}

// ---------- 3. 枪林弹雨：hybridAttack 战术牌 AI 必须使用（已修 BUG） ----------
{
  const def = cards.find(c => c.name === "枪林弹雨");
  const picked = aiPick(def, 3);
  assert.strictEqual(picked.card, "枪林弹雨",
    "枪林弹雨：AI 必须能打出（hybridAttack 评分分支缺失会导致 AI 完全不用）");
}

// ---------- 4. 物资私分：目标必须是队友，不能是自己（已修 BUG） ----------
{
  const def = cards.find(c => c.name === "物资私分");
  const { card: name, target, raw } = aiPick(def);
  assert.strictEqual(name, "物资私分", "AI 应当会使用物资私分");
  assert.ok(target && target.uid !== "e0",
    `物资私分 excludeSelf=true，目标不能是自己，实际 ${target?.uid}`);
  assert.strictEqual(target.uid, "e1", "物资私分应当指定队友 e1");
}

// ---------- 5. 商店/掉落链路：10 张牌均须可解锁 ----------
{
  const codex = window.GameData?.cardCodex || [];
  const eliteCards = window.GameData?.eliteCards || [];
  const unlocks = window.GameData?.eliteUnlocks || {};
  const codexNames = new Set(codex.map(c => c.name || c));
  cards.forEach(def => {
    assert.ok(codexNames.has(def.name), `「${def.name}」必须在图鉴 cardCodex 中`);
    assert.ok(eliteCards.some(c => c.name === def.name),
      `「${def.name}」必须在 eliteCards 卡池中，否则解锁后买不到`);
    const enemy = Object.entries(unlocks)
      .find(([, list]) => (list || []).includes(def.name))?.[0];
    assert.ok(enemy, `「${def.name}」必须挂载掉落敌人`);
  });
}

console.log("[PASS] AI 废墟沙城卡牌决策 + 商店掉落链路全部通过");
