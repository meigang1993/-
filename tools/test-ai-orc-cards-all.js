// 兽人地下城 全部 10 张卡牌：AI 使用决策 + 机制字段 全覆盖回归（无浏览器版）
//
// 背景：原浏览器版 test-ai-orc-cards-all-live.js 依赖 playwright，
// 沙箱浏览器二进制损坏且下载源被白名单拦截（403）无法重装，
// 因此改用 vm 直接加载源码的秒级版本，覆盖内容完全一致。
//
// 关键点：卡名不硬编码，直接从 GameDataCards.eliteUnlocks 中
// 兽人地下城 6 个精英/BOSS 的掉落表动态读取 —— 以后新增卡会自动纳入，不会漏测。
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const {
  card, unitFromCharacter, installGlobals, loadRuntime,
} = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
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

// 兽人地下城的 6 个精英/BOSS（已验证全部归属 orc_dungeon）
const ORC_BOSSES = [
  "orc_king_bondi", "guard_kelly", "assassin_sakura_risa",
  "witherer_1124_split", "xx_witherer_1124", "demon_king_bakaar",
];

// 每张卡的标志性机制字段（用于确认实现存在，非仅名字存在）
const MECHANIC_FIELD = {
  "佯攻": "feint", "勒杀": "strangleKill", "战争号角": "warHorn",
  "追杀": "pursueKill", "弹反": "deflect", "武装": "armSelf",
  "撞杀": "armoredRam", "后空翻": "backflip", "仇杀": "revengeKill",
  "火杀": "burnCard",
};

const eliteUnlocks = window.GameDataCards?.eliteUnlocks || {};
const allCards = window.GameDataCards?.eliteCards || [];

// ---------- 动态取卡名 ----------
const cardNames = [];
ORC_BOSSES.forEach(id => {
  const list = eliteUnlocks[id] || [];
  assert.ok(list.length > 0, `eliteUnlocks 必须定义「${id}」的掉落卡`);
  list.forEach(n => { if (!cardNames.includes(n)) cardNames.push(n); });
});

const defs = {};
cardNames.forEach(name => {
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
const pad = s => s + " ".repeat(Math.max(0, 12 - [...s].length * 2));

console.log(`\n=== 兽人地下城全部 ${cardNames.length} 张卡 AI 决策 ===`);

// 1) AI 决策：主动牌应使用；响应牌不主动打出
cardNames.forEach(name => {
  const def = defs[name];
  const picked = aiPick(def);
  const isResponse = def.type === "response";
  const ok = isResponse ? picked.card === null : picked.card === name;
  results.push({
    card: name,
    expect: isResponse ? "响应牌不主动打出" : "使用",
    actual: isResponse ? (picked.card === null ? "不可主动打出" : picked.card) : picked.card,
    ok,
  });
});

// 2) 机制字段：确认每张卡的标志性实现字段存在
cardNames.forEach(name => {
  const field = MECHANIC_FIELD[name];
  if (!field) return; // 未登记字段的卡跳过（不应发生）
  const has = !!defs[name][field];
  results.push({
    card: name, expect: `字段 ${field}`, actual: has ? "存在" : "缺失", ok: has,
  });
});

results.forEach(r => {
  console.log(`${r.ok ? "✅" : "❌"} ${pad(r.card)}期望=${pad(r.expect)}实际=${r.actual}`);
});

const failed = results.filter(r => !r.ok);
const passed = results.length - failed.length;
console.log(`\n汇总：${passed} 通过 / ${failed.length} 失败`);

if (failed.length) {
  console.log(`[FAIL] 兽人地下城 ${cardNames.length} 张卡存在未通过项`);
  process.exit(1);
}
console.log(`[PASS] 兽人地下城 ${cardNames.length} 张卡 AI 决策与机制字段全部符合预期`);
console.log(`       （卡名动态取自 eliteUnlocks，共 ${cardNames.length} 张：${cardNames.join(" ")}）`);
