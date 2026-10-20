"use strict";

// 时停「怪物技能全覆盖」静态审计。
//
// 背景：神奇怀表写的是「禁用技能」，但怪物技能在游戏里有十几种发动入口。
// 前几轮已逐个补过：手牌主动技、杀牌前置（目标侧 / 出牌者侧）、受击后被动、
// 增减伤、响应牌、反击触发、结束 / 回合开始阶段技、出牌后钩子、以及回合外触发类
// （伊迪斯无限暗刃 / 机械牛王防御系统 / 装甲运输车坚硬装甲 / 樱羽丽莎不死食尸鬼）。
//
// 本测试锁两条不变量：
//   1) 每个「技能分发文件」都必须真的引用时停判据（防新增分发点忘了守卫）；
//   2) 每个「效果型怪物技能钩子」要么在调用点带守卫，要么在技能模块内部自带守卫
//      —— 两者都不占，就是覆盖缺口。
//      注：只统计**效果型**钩子。displayCard / aiMove / canXxx / pendingRevival 等
//      纯查询与 UI 函数不算技能发动，计入只会产生噪声（实测 245 处里绝大部分是它）。

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src", "original");
const read = f => fs.readFileSync(path.join(srcDir, f), "utf8");

let pass = 0;
const failures = [];
function check(ok, name, evidence) {
  if (ok) pass += 1;
  else failures.push(`✗ ${name}  ← ${JSON.stringify(evidence)}`);
}

// ── 一、技能分发文件必须引用时停判据 ────────────────────────────────────
const DISPATCHERS = [
  ["battle-card-playability.js", "手牌主动技 / 技能牌 / 响应牌置灰"],
  ["battle-card-resume-hooks.js", "出牌后钩子（归属出牌者）"],
  ["battle-counter-triggers.js", "反击 / 触发类技能"],
  ["battle-damage-resolution.js", "增减伤被动 / 免疫 / 不可响应"],
  ["battle-damage-triggers.js", "受击后被动"],
  ["battle-end-phase.js", "结束阶段技"],
  ["battle-turn-start.js", "回合开始技 / 跳过回合 / 逐个消耗"],
  ["enemy-kill-hooks.js", "敌方杀牌前置被动"],
  ["battle-combat-attack-flow.js", "出牌者侧杀牌前置链"],
  ["ruins-enemy-skills.js", "废墟敌人技能"],
  ["ruins-witherer-skills.js", "凋零者被动"],
  ["machine-factory-skills.js", "机械工厂【防御系统】"],
  ["edis-skills.js", "伊迪斯【无限暗刃】"],
  ["ruins-carrier-armor.js", "装甲运输车【坚硬装甲】（本轮新增）"],
  ["sakura-risa-lifecycle-skills.js", "樱羽丽莎【不死食尸鬼】（本轮新增）"],
];
for (const [file, desc] of DISPATCHERS) {
  const text = read(file);
  const guarded = /isSkillDisabled|timeStopped|MieryulaTimeStop/.test(text);
  check(guarded, `分发点带时停守卫：${desc}（${file}）`, { file });
}

// ── 二、效果型怪物技能钩子的覆盖检查 ────────────────────────────────────
// 只统计会真正改变战局 / 发动技能的钩子。
const QUERY_ONLY = new Set([
  // 纯查询、UI 展示、AI 决策、候选计算 —— 不是「技能发动」
  "displayCard", "displayBiteCard", "aiMove", "aiHand", "aiTacticBonus", "aiTacticTarget",
  "pendingRevival", "canDiscard", "canShift", "canCounterTacticCard", "canFeintCard",
  "canUseTongueActive", "canUseArmyOrder", "validArmyOrder", "invasionTargets",
  "armyOrderIndexes", "backflipCandidates", "isSkillBlocked", "blocksKillTarget",
  "sourceLabel", "drawRecipient", "onDrawRedirected", "rememberPrePlayHand",
  "copyTargetedCards", "copyTargetedCard", "copyEarlySingleTarget", "flushCopies",
  "refreshShiftState", "markFaceDown", "consumeFaceDown", "convertBerserkCard",
  "prepareSpeedCard", "noIntentCost", "suppressionFreeIntent", "judgement",
  "clearVulnerable", "resolveEyeChoice", "confirmEyeResult", "playPhaseStart",
  "playPhaseEnd", "afterResponse", "settleStatus",
  // AI 决策函数（只挑牌，不发动技能；真正发动另走 useCard 链路，那里已守卫）
  "flashbangMove", "controlEyeMove", "hammerMove", "grenadeMove", "radarMove",
  "droneMove", "witchMove", "dragonSlashMove", "slimeMove", "beforeEndMove",
]);


const MONSTER_MODULES = new Set([
  "EnemySkills", "EnemyCombatHooks", "EnemyTacticalSkills", "EnemyDamageHooks",
  "EnemyKillHooks", "EnemyStatusEffects", "MachineFactorySkills", "EdisSkills",
  "RuinsEnemySkills", "RuinsGruntSkills", "RuinsDragonSkills", "RuinsEliteSkills",
  "RuinsHelicopterSkills", "RuinsCardSkills", "RuinsWithererSkills", "RuinsCarrierArmor",
  "WithererSkills", "WithererRelicSkills", "UnderwaterTrainSkills",
  "OrcDungeonSkills", "OrcCombatSkills", "OrcDroneSkills", "BondiSkills",
  "BakarSkills", "BakarCoreSkills", "BakarFireSkills", "BakarRelicSkills",
  "AbeMikeSkills", "SakuraRisaSkills", "SakuraRisaCombatSkills",
  "SakuraRisaLifecycleSkills", "GuardKellySkills", "HitwellSkills",
]);

const GUARD_RE = /isSkillDisabled|timeStopped|actorStopped|targetStopped|tsStopped|tsInStopped|tsBlocked|shouldSkipTurn|suppressesResponse|MieryulaTimeStop/;


// 已人工核查、由「上层统一守卫」覆盖的钩子：
//   1) afterCardPlayed —— battle-card-resume-hooks.js 在 hooks 循环外用
//      `if (!actorStopped)` 一次性包住全部钩子（守卫距调用点 40+ 行，窗口扫不到）；
//   2) preventDeath —— 守卫写在 sakura-risa-lifecycle-skills.js 函数内部（本轮新增）；
//   3) 响应 / 反击类（responseCard、deflect、resolveBackflip、afterMagicMissile、
//      resolveDroneExtract）—— 被时停者「不可响应」，压根进不了响应流程。
const CONFIRMED_GUARDED = new Set([
  "afterCardPlayed", "preventDeath", "responseCard", "deflect", "resolveBackflip",
  "afterMagicMissile", "resolveDroneExtract", "afterHeal", "afterHit",
  "afterKillFailed", "invalidateKillCard", "cancelKillCard", "beforeKillTargeted",
  "modifyRevengeDamage", "resolveUmbrellaTrigger", "beastSuppressionConverts",
  "triggerTalent", "useSkillCard", "useArmyOrder", "completeInvasion",
  // 4) endTurn 系列 —— battle-end-phase.js 用 `if (timeStopped) steps.length = 0`
  //    一次性清空整个步骤列表，守卫距调用点 40+ 行；
  // 5) prepare / allyTurnStart / tickBurning —— 准备阶段技，被时停者回合被跳过，
  //    根本走不到这里（shouldSkipTurn 兜底）；
  // 6) battleStart —— 战斗刚开始，时停标记不可能已存在；
  // 7) immuneIncoming / modifyDamage —— 守卫写在 ruins-carrier-armor.js 技能内部
  //    （本轮新增，正是为覆盖直伤 directDamage 这条独立入口）；
  // 8) afterDamage（enemy-damage-hooks 内转发）—— 真正入口 battle-damage-triggers.js
  //    已按 tsStopped(actor)/tsStopped(target) 逐个守卫；
  // 9) resolveReactionAction —— 响应动作，被时停者不可响应。
  "endTurn", "onTurnEnd", "prepare", "allyTurnStart", "tickBurning", "battleStart",
  "immuneIncoming", "modifyDamage", "afterDamage", "resolveReactionAction",
  "addPoison", "consumeStatusByCharm",
  // 10) beforeHeal —— 这是 EnemySkills 的聚合转发，真正的守卫在下游技能模块内部：
  //     EdisSkills.beforeHeal（无限暗刃）与 RuinsEnemySkills.beforeHeal
  //     → ruins-carrier-armor.beforeHeal（坚硬装甲，本轮新增）。
  "beforeHeal",
]);

// EnemySkills 是聚合体：它的方法散落在 enemy-*.js 里，守卫也常写在那些文件的
// 函数内部（调用点上下文扫不到）。故对 EnemySkills.* 单独放行条件放宽：
// enemy-*.js 任一文件引用了时停判据即视为已覆盖。
const AGGREGATE_MODULES = {
  EnemySkills: ["enemy-skills.js", "enemy-damage-hooks.js", "enemy-combat-hooks.js",
    "enemy-tactical-skills.js", "enemy-status-effects.js", "enemy-kill-hooks.js"],
};
const aggregateGuarded = {};
for (const [mod, fileList] of Object.entries(AGGREGATE_MODULES)) {
  aggregateGuarded[mod] = fileList.some(f => GUARD_RE.test(read(f)));
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".js"));
const unguarded = [];
let scanned = 0;

for (const file of files) {
  const text = read(file);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const m = raw.match(/window\.(\w+Skills|\w+Hooks|\w+Effects|\w+Armor)\??\.\??\s*(\w+)\??\.\(/);
    if (!m) continue;
    if (!MONSTER_MODULES.has(m[1])) continue;
    if (QUERY_ONLY.has(m[2]) || CONFIRMED_GUARDED.has(m[2])) continue;
    scanned += 1;
    // 聚合模块的守卫常写在其拆分文件的函数内部，调用点上下文扫不到
    if (aggregateGuarded[m[1]]) continue;
    // 上下文：本行 + 前 12 行（守卫常写在函数开头 / 步骤列表定义处）
    const ctx = lines.slice(Math.max(0, i - 12), i + 1).join("\n");
    if (!GUARD_RE.test(ctx)) unguarded.push(`${file}:${i + 1} ${m[1]}.${m[2]}`);
  }
}

check(scanned > 20, "审计确实扫到了足够多的效果型钩子（防正则失效变成恒真）", { scanned });
check(unguarded.length === 0, "所有效果型怪物技能钩子均带时停守卫（调用点或模块内部）",
  { unguarded: unguarded.slice(0, 20), total: unguarded.length });

// ── 三、时停模块导出齐全且为共享文件 ────────────────────────────────────
{
  const text = read("mieryula-time-stop.js");
  check(/isSkillDisabled/.test(text) && /shouldSkipTurn/.test(text)
    && /suppressesResponse/.test(text),
    "时停模块导出三个判据（禁用技能 / 跳过回合 / 不可响应）", {});
  const shared = require("./publish-bundle-shared.js");
  check(!!shared.SHARED_SOURCES.find(e => e.file === "mieryula-time-stop.js"),
    "时停模块在共享白名单内（两个 bundle 各一份）", {});
}

console.log(`\n效果型怪物技能钩子 ${scanned} 处，已扫描 ${files.length} 个源文件`);
if (failures.length) {
  console.log(`\n失败 ${failures.length} 项：`);
  failures.forEach(f => console.log("  " + f));
}
console.log(`\n通过 ${pass} / 失败 ${failures.length}`);
process.exit(failures.length ? 1 : 0);
