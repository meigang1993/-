"use strict";

// 247 版：【神奇怀表】时停「禁用所有怪物技能」独立复查。
// 不依赖 test-timestop-monster-skill-audit.js 的 QUERY_ONLY / CONFIRMED_GUARDED 白名单：
// 自动发现所有怪物侧技能模块，沿「模块 → 引用者 → 再引用者」的聚合链做守卫可达性检查，
// 任何一条链都摸不到时停守卫的模块即为覆盖缺口。
// REVERT=guard|hub|desc 为源码级反向验证，期望红项精准落在 C/D 段。
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "none";
const GUARD_RE = /isSkillDisabled|timeStopped|actorStopped|targetStopped|tsStopped|tsInStopped|tsBlocked|shouldSkipTurn|suppressesResponse|MieryulaTimeStop/;

let pass = 0, total = 0;
const fails = [];
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  fails.push(name);
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}
function read(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (REVERT === "guard" && rel === "src/original/battle-card-playability.js") {
    return s.split("isSkillDisabled").join("__NO_GUARD__");
  }
  if (REVERT === "hub" && rel === "src/original/battle-end-phase.js") {
    return s.split("timeStopped").join("__NO_GUARD__");
  }
  if (REVERT === "desc" && rel === "src/original/data-characters-extra.js") {
    return s.replace("禁用技能等负面效果", "若干负面效果");
  }
  return s;
}

const srcFiles = fs.readdirSync(SRC).filter(f => f.endsWith(".js")).sort();
const texts = {};
for (const f of srcFiles) texts[f] = read("src/original/" + f);

// 怪物侧文件（排除饰品效果、我方可玩角色技能与纯 UI）
const MON_FILE_RE = /^(enemy-|ruins-|orc-|edis-|witherer-|machine-|sakura-|bondi-|bakar-|kelly-|guard-kelly|underwater-|hitwell-|abe-mike-|dragon-|slime-|carrier-|helicopter-)/;
const monsterFiles = srcFiles.filter(f => MON_FILE_RE.test(f) && !f.includes("relic"));

// 自动发现怪物技能模块定义
const mods = new Map();
for (const f of monsterFiles) {
  for (const m of texts[f].matchAll(/window\.(\w+(?:Skills|Hooks|Effects|Armor))\s*=/g)) {
    if (!mods.has(m[1])) mods.set(m[1], []);
    mods.get(m[1]).push(f);
  }
}

// 引用关系：文件 f 的文本里出现模块名 → f 引用该模块的定义文件
const referencedBy = new Map();
for (const f of srcFiles) referencedBy.set(f, new Set());
for (const [mod, defs] of mods) {
  for (const f of srcFiles) {
    if (defs.includes(f)) continue;
    if (texts[f].includes(mod)) for (const d of defs) referencedBy.get(d).add(f);
  }
}
const guarded = f => GUARD_RE.test(texts[f] || "");

// 从定义文件出发，沿「被引用」方向最多 4 跳找守卫文件
function coverage(defFile) {
  if (guarded(defFile)) return `module:${defFile}`;
  const seen = new Set([defFile]);
  let frontier = [defFile];
  for (let hop = 0; hop < 4; hop += 1) {
    const next = [];
    for (const f of frontier) {
      for (const ref of referencedBy.get(f) || []) {
        if (seen.has(ref)) continue;
        seen.add(ref);
        if (guarded(ref)) return `ref@${hop + 1}:${ref}`;
        next.push(ref);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}

// ---------- A 自动发现（防正则失效恒真） ----------
check("A1 扫描源文件 > 400", srcFiles.length > 400, { n: srcFiles.length });
check("A2 怪物侧文件 > 25", monsterFiles.length > 25, { n: monsterFiles.length });
check("A3 自动发现怪物技能模块 > 25", mods.size > 25,
  { n: mods.size, list: [...mods.keys()].slice(0, 40) });

// ---------- B 守卫可达性（覆盖所有怪物技能模块，含聚合子模块） ----------
const uncovered = [];
const evidence = [];
for (const [mod, defs] of mods) {
  const ev = defs.map(coverage).find(Boolean) || null;
  if (!ev) uncovered.push({ mod, defs });
  else evidence.push({ mod, ev });
}
check("B1 所有怪物技能模块均可达时停守卫（零缺口）", uncovered.length === 0,
  { uncovered: uncovered.slice(0, 12), total: uncovered.length });
check("B2 覆盖证据 > 25（防恒真）", evidence.length > 25, { n: evidence.length });
check("B3 水下列车拆分出的 5 个子模块均在覆盖链内",
  ["UnderwaterTrainBiteSkills", "UnderwaterTrainControlSkills", "UnderwaterTrainDamageSkills",
    "UnderwaterTrainPrepareSkills", "UnderwaterTrainTargetSkills"]
    .every(n => mods.has(n) && evidence.some(e => e.mod === n)),
  { found: [...mods.keys()].filter(n => n.startsWith("UnderwaterTrain")) });

// ---------- C 独立名单：分发点守卫 ----------
const DISPATCHERS = [
  "battle-card-playability.js", "battle-card-resume-hooks.js", "battle-counter-triggers.js",
  "battle-damage-resolution.js", "battle-damage-triggers.js", "battle-end-phase.js",
  "battle-turn-start.js", "enemy-kill-hooks.js", "battle-combat-attack-flow.js",
  "ruins-enemy-skills.js", "ruins-witherer-skills.js", "machine-factory-skills.js",
  "edis-skills.js", "ruins-carrier-armor.js", "sakura-risa-lifecycle-skills.js",
  "ruins-elite-skills.js",
];
for (const f of DISPATCHERS) check(`C 分发点守卫 ${f}`, guarded(f), { f });

// ---------- D 时停本体与技能语义 ----------
const ts = texts["mieryula-time-stop.js"] || "";
check("D1 时停模块导出三判据", /isSkillDisabled/.test(ts) && /shouldSkipTurn/.test(ts)
  && /suppressesResponse/.test(ts));
check("D2 mark 对全部存活敌方施加标记", /battle\.enemies/.test(ts) && /filter\(alive\)/.test(ts));
check("D3 技能描述含「禁用技能」", (texts["data-characters-extra.js"] || "").includes("禁用技能等负面效果"));
check("D4 canPlay 分发真实引用时停判据", /isSkillDisabled/.test(texts["battle-card-playability.js"] || ""));
check("D5 结束阶段整体压制（steps 清空）",
  /timeStopped/.test(texts["battle-end-phase.js"] || "")
  && /steps\.length\s*=\s*0/.test(texts["battle-end-phase.js"] || ""));
check("D6 时停标记逐个消耗（跳过一次才解除）", /consume/.test(ts)
  && /statuses\.filter\(item\s*=>\s*item\s*!==\s*KEY\)/.test(ts));

// ---------- H 反向验证有效性 ----------
if (REVERT === "none") {
  check("H1 none 模式零失败", fails.length === 0, { fails });
} else {
  const expect = { guard: "CD", hub: "CD", desc: "D" }[REVERT];
  check(`H2 REVERT=${REVERT} 至少 1 红`, fails.length > 0, { fails });
  check(`H3 红项只落在 ${expect} 段`, fails.every(f => expect.includes(f[0])), { fails });
}

console.log(`\n怪物技能模块 ${mods.size} 个 / 覆盖证据 ${evidence.length} 个 / 通过 ${pass} / ${total}${REVERT === "none" ? "" : `  REVERT=${REVERT}`}`);
if (fails.length && REVERT === "none") process.exit(1);
if (REVERT !== "none" && fails.length === 0) process.exit(1);
