// 敌方「出牌阶段限一次」技能回归——统一登记表接入后的专项验证
//
// 背景：全项目「出牌阶段限一次」已收归 SkillOncePerTurn 单一登记表，
// 敌方技能（废墟三杂兵、索敌雷达、毒气手雷、恐怖巨锤、无人机采精、魔法飞弹）
// 一并纳入。风险有两条：
//   1. 登记表漏登记 → 技能卡落到我方手上不会置灰（未来复制技能类角色）
//   2. 登记表误判   → 敌方 AI 不再使用这些技能（技能被"用过"误判）
// 本文件两条都查：AI 未用时会产出该 move、用过后不再产出、重置后恢复。
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { unitFromCharacter, installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "skill-once-per-turn.js", "mieryula-time-stop.js", "mieryula-tactic-immunity.js", "mieryula-skills.js", "battle-card-playability.js", "card-utils.js",
  "enemy-tactical-skills.js", "machine-factory-skills.js",
  // 废墟杂兵依赖 RuinsGruntCommon（C.alive / C.visible 的宿主），缺了会抛
  // "C.alive is not a function"，必须与其使用者一起加载。
  "data-ruins-sand-city-enemies.js", "ruins-grunt-common.js",
  "ruins-grunt-skills.js", "ruins-grunt-landmine.js", "ruins-grunt-rps.js",
  "ruins-enemy-skills.js", "enemy-skills.js",
  "orc-drone-skills.js", "orc-combat-skills.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (e) {
    console.log(`❌ ${name} — ${String(e.message).slice(0, 160)}`);
    process.exitCode = 1;
  }
};

function mkBattle(ai, extra = {}) {
  const allies = [0, 1].map(i => {
    const u = unitFromCharacter(GameData.characters[i], `a${i}`);
    u.side = "ally";
    u.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
    u.stats.attack = 3; u.stats.magic = 3; u.skills = [];
    return u;
  });
  const actor = unitFromCharacter(GameData.characters[0], "e0");
  actor.side = "enemy"; actor.ai = ai;
  actor.stats = Object.assign({}, actor.stats, { attack: 5, magic: 5, speed: 5 });
  actor.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" },
    { name: "闪", type: "dodge", suit: "♠" },
    { name: "杀（普攻）", type: "slash", suit: "♠" }];
  actor.handLimit = 6; actor.skills = [];
  Object.assign(actor, extra);
  const battle = {
    allies, enemies: [actor], activeUid: "e0", phase: 4, animQueue: [], played: [],
    log: [],
  };
  const state = { battle, log: battle.log, random: undefined };
  return { battle, state, actor, allies };
}

// ---------- 1. 废墟三杂兵：AI 未用过时产出 move，用过后不再产出 ----------
const ruinsCases = [
  { ai: "ruins_soldier", flag: "usedRuinsLandmine", cardFlag: "ruinsPlaceLandmine", label: "废墟士兵·放置地雷" },
  { ai: "ruins_sniper", flag: "usedRuinsSnipe", cardFlag: "ruinsSnipe", label: "废墟狙击手·狙击" },
  { ai: "ruins_tank", flag: "usedRuinsTankShell", cardFlag: "ruinsTankShell", label: "废墟坦克·坦克炮弹" },
];
ruinsCases.forEach(({ ai, flag, cardFlag, label }) => {
  check(`${label}：AI 未用过时仍会产出该技能`, () => {
    const { state, actor } = mkBattle(ai);
    const move = window.RuinsEnemySkills.aiMove(state, actor);
    assert.ok(move, `AI 应当会使用该技能，实际 ${JSON.stringify(move)}`);
    assert.ok(move.card && move.card[cardFlag],
      `产出的卡必须带 ${cardFlag} 标记，实际 ${JSON.stringify(move.card)}`);
  });
  check(`${label}：用过后 AI 不再产出（限一次生效）`, () => {
    const { state, actor } = mkBattle(ai);
    actor[flag] = true;
    const move = window.RuinsEnemySkills.aiMove(state, actor);
    const stillThis = move && move.card && move.card[cardFlag];
    assert.ok(!stillThis, `用过后不应再产出该技能，实际 ${JSON.stringify(move)}`);
  });
  check(`${label}：统一登记表在未使用时不拦截`, () => {
    const { actor } = mkBattle(ai);
    const blocked = window.SkillOncePerTurn.blocked(actor, { [cardFlag]: true });
    assert.strictEqual(blocked, false, "未使用时不应被拦截");
  });
  check(`${label}：统一登记表在用过后拦截`, () => {
    const { actor } = mkBattle(ai);
    actor[flag] = true;
    const blocked = window.SkillOncePerTurn.blocked(actor, { [cardFlag]: true });
    assert.strictEqual(blocked, true, "用过后应被拦截");
  });
  check(`${label}：isSkillBlocked 走统一登记表且行为一致`, () => {
    const { actor } = mkBattle(ai);
    assert.strictEqual(window.RuinsEnemySkills.isSkillBlocked(actor,
      { [cardFlag]: true }), false, "未使用 → 不拦截");
    actor[flag] = true;
    assert.strictEqual(window.RuinsEnemySkills.isSkillBlocked(actor,
      { [cardFlag]: true }), true, "已使用 → 拦截");
  });
});

// 敌方「每回合一次」的重置点在 EnemySkills.endTurn（回合结束），不是回合开始：
// 敌人出牌阶段结束后才清空标记，下一回合可再用。用 prepare 重置会走到
// machine.prepare 链并依赖大量未加载模块（曾抛 "hit is not a function"）。
const resetTurn = (state, actor) => window.EnemySkills.endTurn(state, actor);

// ---------- 2. 索敌雷达 / 毒气手雷 / 恐怖巨锤 ----------
check("索敌雷达：AI 未用过时产出，用过后不产出", () => {
  const { state, actor } = mkBattle("radar");
  const first = window.EnemySkills.radarMove(state, actor);
  assert.ok(first && first.card && first.card.radar,
    `AI 应产出索敌雷达，实际 ${JSON.stringify(first)}`);
  actor.radarUsed = true;
  assert.strictEqual(window.EnemySkills.radarMove(state, actor), null,
    "用过当回合内不应重复产出");
});

check("索敌雷达：回合结束重置后 AI 可再次使用", () => {
  const { state, actor } = mkBattle("radar");
  actor.radarUsed = true;
    resetTurn(state, actor);
  const move = window.EnemySkills.radarMove(state, actor);
  assert.ok(move && move.card && move.card.radar,
    `重置后应可再次使用，实际 ${JSON.stringify(move)}`);
});

check("毒气手雷：AI 未用过时产出，用过后不产出", () => {
  const { state, actor } = mkBattle("krow_doctor");
  // 毒气手雷需要手里有两张同花色非待摸牌
  actor.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" },
    { name: "杀（普攻）", type: "slash", suit: "♠" }];
  const first = window.EnemySkills.grenadeMove(state, actor);
  assert.ok(first && first.card && first.card.poisonGrenade,
    `AI 应产出毒气手雷，实际 ${JSON.stringify(first)}`);
  actor.grenadeUsed = true;
  assert.strictEqual(window.EnemySkills.grenadeMove(state, actor), null,
    "用过当回合内不应重复产出");
});

check("毒气手雷：回合结束重置后可再次使用", () => {
  const { state, actor } = mkBattle("krow_doctor");
  actor.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" },
    { name: "杀（普攻）", type: "slash", suit: "♠" }];
  actor.grenadeUsed = true;
  resetTurn(state, actor);
  const move = window.EnemySkills.grenadeMove(state, actor);
  assert.ok(move && move.card && move.card.poisonGrenade,
    `重置后应可再次使用，实际 ${JSON.stringify(move)}`);
});

check("恐怖巨锤：湮灭模式下 AI 产出，用过后不产出", () => {
  const { state, actor } = mkBattle("mechanical_bull_king",
    { annihilationMode: true });
  actor.hp = Math.floor(actor.maxHp * 0.5);
  const first = window.EnemySkills.hammerMove(state, actor);
  assert.ok(first && first.card && first.card.bullHammer,
    `湮灭+半血应产出恐怖巨锤，实际 ${JSON.stringify(first)}`);
  actor.hammerUsed = true;
  assert.strictEqual(window.EnemySkills.hammerMove(state, actor), null,
    "用过后不应重复产出");
});

check("恐怖巨锤：回合结束重置后可再次使用", () => {
  const { state, actor } = mkBattle("mechanical_bull_king",
    { annihilationMode: true });
  actor.hp = Math.floor(actor.maxHp * 0.5);
  actor.hammerUsed = true;
  resetTurn(state, actor);
  const move = window.EnemySkills.hammerMove(state, actor);
  assert.ok(move && move.card && move.card.bullHammer,
    `重置后应可再次使用，实际 ${JSON.stringify(move)}`);
});

// ---------- 3. 兽人：无人机采精 / 魔法飞弹 ----------
["droneExtract", "magicMissile"].forEach(flag => {
  const field = flag === "droneExtract" ? "usedDroneExtract" : "usedMagicMissile";
  check(`${flag}：统一登记表未使用时不拦截、用过后拦截`, () => {
    const { actor } = mkBattle("grunt");
    assert.strictEqual(window.SkillOncePerTurn.blocked(actor, { [flag]: true }),
      false, "未使用时不应被拦截");
    actor[field] = true;
    assert.strictEqual(window.SkillOncePerTurn.blocked(actor, { [flag]: true }),
      true, "用过后应被拦截");
  });
  check(`${flag}：标记在回合重置清单中（否则整场只能用一次）`, () => {
    const src = fs.readFileSync("./src/original/battle-turn-state.js", "utf8");
    assert.ok(src.includes(`${field} = false`),
      `${field} 必须出现在回合重置清单，否则与「出牌阶段限一次」不符`);
  });
});

// ---------- 4. 敌方技能卡落到我方手上同样置灰（复制技能类角色的前提） ----------
check("敌方限一次技能卡落到我方角色手上同样被置灰", () => {
  const allies = [0, 1].map(i => {
    const u = unitFromCharacter(GameData.characters[i], `a${i}`);
    u.side = "ally"; u.skills = [];
    u.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠" }];
    return u;
  });
  // 模拟"复制敌人技能"：我方角色持有敌方限一次技能卡
  [["ruinsSnipe", "usedRuinsSnipe"], ["radar", "radarUsed"],
    ["poisonGrenade", "grenadeUsed"], ["bullHammer", "hammerUsed"]]
    .forEach(([cardFlag, field]) => {
      const holder = allies[0];
      assert.strictEqual(window.SkillOncePerTurn.blocked(holder,
        { [cardFlag]: true }), false, `${cardFlag} 未使用时应可用`);
      holder[field] = true;
      assert.strictEqual(window.SkillOncePerTurn.blocked(holder,
        { [cardFlag]: true }), true, `${cardFlag} 用过后应置灰`);
      holder[field] = false;
    });
});

// ---------- 5. 自动推导不得误伤：敌方常见布尔字段不该被当成限一次标记 ----------
check("自动推导不误伤敌方卡的普通布尔字段", () => {
  const { actor } = mkBattle("grunt");
  // targetless / _skill 等通用字段不应触发拦截
  assert.strictEqual(window.SkillOncePerTurn.blocked(actor,
    { _skill: true, targetless: true }), false,
    "无对应 used 字段时不应拦截");
  assert.strictEqual(window.SkillOncePerTurn.blocked(actor,
    { _skill: true, sweep: true }), false,
    "群体标记不应被当成限一次标记");
});

console.log(`\n敌方「出牌阶段限一次」技能：${passed} 项断言通过`);
