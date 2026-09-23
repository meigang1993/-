// 水下列车 全部 8 张卡牌：AI 使用决策 + 机制字段 全覆盖回归（无浏览器版）
//
// 与兽人地下城版（test-ai-orc-cards-all.js）同构：用 vm 直接加载源码，秒级完成。
// 背景：战争号角曾因 AI 评分函数缺 warHorn 分支导致「有卡但 AI 从不使用」，
// 本脚本正是为防止同类问题出现在水下列车卡牌上。
//
// 卡名不硬编码：从 GameDataCards.eliteUnlocks 中水下列车 4 个精英/BOSS
// 的掉落表动态读取，新增卡会自动纳入。
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

// 水下列车的 4 个精英/BOSS（已验证位于 data-underwater-train-enemies.js）
const UW_BOSSES = [
  "raff_assassin", "abe_mike", "shark_captain_mordio", "mona_eagle_captain",
];

// 每张卡的标志性机制字段（确认实现存在，非仅名字存在）
const MECHANIC_FIELD = {
  "魔法对决": "magicDuel",
  "魔弹特攻": "magicBullet",
  "双重打杀": "fixedRepeats",
  "暴走杀": "berserkKill",
  "咬杀": "biteKill",
  "放血": "bloodletting",
  "圣杀": "holy",
  "怒杀": "rageKill",
};

const eliteUnlocks = window.GameDataCards?.eliteUnlocks || {};
const allCards = window.GameDataCards?.eliteCards || [];

// ---------- 动态取卡名 ----------
const cardNames = [];
UW_BOSSES.forEach(id => {
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
  actor.side = "enemy"; actor.ai = "grunt"; actor.intent = opts.intent ?? 0;
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
  // 杀牌需要杀意（intent）才能打出，而【放血】的 AI 判据恰好相反：
  // 它要求 intent 尚有缺口（needsIntent = intent < 上限）才值得用。
  // 两者互斥，故按卡类型给不同的 intent，避免把构造缺陷误判为游戏 BUG。
  const intent = opts.intent ?? (def.type === "slash" ? 3 : 0);
  const { battle, actor } = mkBattle(allyCount, { ...opts, intent });
  const testCard = { ...def, suit: Object.keys(def.suits || { "♠": 1 })[0] };
  // 辅助手牌：魔弹特攻的 AI 判据要求「手中除本卡外还有其他花色」
  // （magicBulletTarget 统计 actor.hand 除 used 外的花色集合），
  // 只给一张待测卡会让它恒无目标 —— 那是测试构造缺陷，不是游戏 BUG。
  // 用 response 牌作辅助：AI 不主动打出，不会干扰选牌结果。
  actor.hand = [
    testCard,
    card("闪", "response", { suit: "♠" }),
    card("闪", "response", { suit: "♥" }),
    card("闪", "response", { suit: "♦" }),
  ];
  const result = window.BattleAI.choose(
    battle, actor, (a, c) => canPlay(a, c, battle));
  return { card: result?.card?.name || null, target: result?.target, raw: result };
}

const results = [];
const pad = s => s + " ".repeat(Math.max(0, 12 - [...s].length * 2));

console.log(`\n=== 水下列车全部 ${cardNames.length} 张卡 AI 决策 ===`);

// 1) AI 决策：主动牌应使用；响应牌不主动打出
cardNames.forEach(name => {
  const def = defs[name];
  const picked = aiPick(def);
  const isResponse = def.type === "response";
  const ok = isResponse ? picked.card === null : picked.card === name;
  const actual = isResponse
    ? (picked.card === null ? "不可主动打出" : picked.card)
    : (picked.card || "null(不选)");
  console.log(`  ${ok ? "✅" : "❌"} ${pad(name)} ${isResponse ? "响应牌不主动打出" : "AI会使用"} → ${actual}`);
  results.push({
    card: name,
    expect: isResponse ? "响应牌不主动打出" : "使用",
    actual,
    ok,
  });
});

// 2) 机制字段：确认每张卡的标志性实现字段存在
console.log("\n=== 机制字段（确认实现非仅名字） ===");
cardNames.forEach(name => {
  const field = MECHANIC_FIELD[name];
  if (!field) {
    console.log(`  ⚠️  ${name} 未登记机制字段，跳过`);
    return;
  }
  const has = !!defs[name][field];
  console.log(`  ${has ? "✅" : "❌"} ${pad(name)} ${field}=${defs[name][field]}`);
  results.push({ card: name, expect: `字段 ${field}`, actual: has, ok: has });
});

// 3) 归属检查：这些卡不应出现在非水下列车的掉落表里
console.log("\n=== 归属检查（是否只属于水下列车） ===");
const otherDungeons = Object.keys(eliteUnlocks)
  .filter(id => !UW_BOSSES.includes(id));
const crossRef = [];
cardNames.forEach(name => {
  otherDungeons.forEach(id => {
    if ((eliteUnlocks[id] || []).includes(name)) crossRef.push(`${name}→${id}`);
  });
});
console.log(crossRef.length === 0
  ? "  ✅ 8 张卡均只归属水下列车，无跨副本引用"
  : "  ⚠️  跨副本引用：" + crossRef.join(", "));

const pass = results.filter(r => r.ok).length;
const fail = results.length - pass;
console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
