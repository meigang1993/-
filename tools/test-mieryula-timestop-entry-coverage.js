"use strict";

// 时停「全入口覆盖」穷举护栏。
//
// 背景：神奇怀表写的是「禁用技能」，但技能在游戏里有十来种发动入口——手牌主动技、
// 杀牌前置钩子、受击后被动、增减伤、响应牌、反击触发、结束/回合开始阶段技、出牌后
// 钩子、AI 主动行为……漏掉任何一条，都会变成「看着生效、敌人该干嘛还干嘛」。
// 上一轮补的是杀牌前置（enemy-kill-hooks），本轮补的是出牌者侧的杀牌前置链
// （水下列车 / 兽人地下城 / 聚焦喷火器 / 邦迪 / 曼妮）。
//
// 本测试锁住两条不变量：
//   1) 每个技能分发文件都必须真的引用时停判据（防止有人新增分发点却忘了守卫）；
//   2) attack-flow 里每一条 Skills 钩子调用都必须带时停守卫（逐行扫描，防回退）。

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

// ── 一、分发文件必须引用时停判据 ─────────────────────────────────────────
// 每个文件对应一类技能发动入口，缺任一即为覆盖缺口。
const DISPATCHERS = [
  ["battle-card-playability.js", "手牌主动技 / 技能牌 / 响应牌置灰"],
  ["battle-card-resume-hooks.js", "出牌后钩子（归属出牌者）"],
  ["battle-counter-triggers.js", "反击 / 触发类技能"],
  ["battle-damage-resolution.js", "增减伤被动 / 不可响应"],
  ["battle-damage-triggers.js", "受击后被动"],
  ["battle-end-phase.js", "结束阶段技"],
  ["battle-turn-start.js", "回合开始技 / 跳过回合 / 逐个消耗"],
  ["enemy-kill-hooks.js", "敌方杀牌前置被动"],
  ["battle-combat-attack-flow.js", "出牌者侧杀牌前置链（本轮新增）"],
  ["ruins-enemy-skills.js", "废墟敌人技能"],
];
for (const [file, desc] of DISPATCHERS) {
  const text = read(file);
  const guarded = /isSkillDisabled|timeStopped|MieryulaTimeStop/.test(text);
  check(guarded, `分发点带时停守卫：${desc}（${file}）`, { file });
}

// ── 二、attack-flow 内每条 Skills 钩子调用都必须带守卫 ──────────────────
// 逐行扫描：调用形如 `window.XxxSkills?.hook?.(...)` 的行，必须以
// `if (!actorStopped` / `if (!targetStopped` 开头，否则就是漏网。
// EnemySkills 例外——它的守卫在 enemy-kill-hooks.js 内部（按归属方逐个判）。
{
  const text = read("battle-combat-attack-flow.js");
  const lines = text.split("\n");
  const unguarded = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!/window\.\w+Skills\??\.\w+\??\.\(/.test(line)) continue;
    if (line.includes("EnemySkills")) continue; // 内部已按归属方守卫
    if (/^if \(!actorStopped/.test(line) || /^if \(!targetStopped/.test(line)) continue;
    // 也接受内联写法：`if (!stopped(actor)) ...` / `(!stopped(actor) && ...)`
    if (/!stopped\(actor\)/.test(line) || /!stopped\(target\)/.test(line)) continue;
    unguarded.push(line.slice(0, 90));
  }
  check(unguarded.length === 0, "attack-flow 内所有技能钩子均带时停守卫", { unguarded });

  // 守卫本身必须存在且按归属方取值
  check(/const actorStopped = stopped\(actor\)/.test(text)
    && /const targetStopped = stopped\(target\)/.test(text),
    "attack-flow 按出牌者 / 目标分别取时停状态", {});
}

// ── 三、时停表是共享文件（两个 bundle 各一份，不依赖跨包顺序）───────────
{
  const { SHARED_SOURCES } = require("./publish-bundle-shared.js");
  const entry = SHARED_SOURCES.find(e => e.file === "mieryula-time-stop.js");
  check(!!entry, "时停表在共享白名单内", {});
  const manifest = JSON.parse(fs.readFileSync(
    path.join(__dirname, "publish-bundles.json"), "utf8"));
  const groupsWith = f => Object.keys(manifest)
    .filter(n => Array.isArray(manifest[n]) && manifest[n].includes(f));
  for (const consumer of (entry?.consumers || [])) {
    for (const group of groupsWith(consumer)) {
      check(groupsWith("mieryula-time-stop.js").includes(group),
        `时停表已打进 ${group}（消费方 ${consumer} 所在包）`, { group, consumer });
    }
  }
  // 米尔尤拉技能模块同样是 playability 的跨包依赖，必须共享
  check(SHARED_SOURCES.some(e => e.file === "mieryula-skills.js"),
    "米尔尤拉技能模块在共享白名单内", { got: SHARED_SOURCES.map(e => e.file) });
  for (const group of groupsWith("battle-card-playability.js")) {
    check(groupsWith("mieryula-skills.js").includes(group),
      `米尔尤拉技能模块已打进 ${group}（置灰判据所在包）`, { group });
  }
}

// ── 四、置灰判据不得用可选链静默放行（缺模块必须抛错）───────────────────
{
  const play = read("battle-card-playability.js");
  check(!/window\.MieryulaSkills\?\./.test(play),
    "置灰判据：米尔尤拉技能模块取值不得用可选链静默放行", {});
  check(/\[mieryula-skills\] 米尔尤拉技能模块未装配/.test(play),
    "置灰判据：缺米尔尤拉技能模块时抛错", {});
}

// ── 五、specials 里属于「技能」的钩子，调用处同样必须带守卫 ──────────────
// 第二节只扫 `window.XxxSkills?.hook?.()` 形式，扫不到 specials.xxx()。
// 判断「是不是技能」看 specials 定义内是否用 ctx.hasSkill（饰品用的是 hasEquipped，
// 按口径不算技能，不在本节管辖内）。名单自动派生，将来新增技能型 specials 会被抓到。
{
  const specText = read("battle-card-specials.js");
  const skillSpecials = [];
  for (const line of specText.split("\n")) {
    const m = line.match(/function (\w+)\(/);
    if (m && /hasSkill\(/.test(line)) skillSpecials.push(m[1]);
  }
  check(skillSpecials.length > 0, "specials 中存在技能型钩子（名单非空，断言非恒真）",
    { skillSpecials });

  const flow = read("battle-combat-attack-flow.js");
  const unguarded = [];
  for (const name of skillSpecials) {
    for (const raw of flow.split("\n")) {
      const line = raw.trim();
      if (!new RegExp(`specials\\.${name}\\(`).test(line)) continue;
      if (/!actorStopped/.test(line) || /!targetStopped/.test(line)
        || /!stopped\(actor\)/.test(line) || /!stopped\(target\)/.test(line)) continue;
      unguarded.push(line.slice(0, 90));
    }
  }
  check(unguarded.length === 0, "技能型 specials 钩子均带时停守卫", { unguarded });
}

// ── 六、兽人地下城全族技能入口 ───────────────────────────────────────────
// 兽人地下城（data-future-orc-enemies.js / data-orc-bondi.js）此前没被单独扫过。
// 逐个核对后确认：只有【以牙还牙】的两条备用伤害路径漏判，已补。本节锁住它防回退，
// 并把「兽人模块必须挂在带守卫的分发点下」这条不变量固化。
//
//   无人机采精(active, AI 决策)     → 跳过回合挡住
//   自爆倒计时(passive, endTurn)    → battle-end-phase.js steps 清空
//   火力压制 / 三头齐攻(passive)    → enemy-kill-hooks.js !actorStopped
//   魔法巡飞弹(active, AI 决策)     → 跳过回合挡住
//   兽王之吼(passive)               → attack-flow.js !actorStopped
//   以牙还牙(passive, afterDamage)  → 三处调用点，两处备用分支本轮补判
{
  // 6.1 两条 noAfterDamageTriggers 备用分支必须各自带守卫
  for (const file of ["battle-damage-hit.js", "battle-damage-lifecycle.js"]) {
    const lines = read(file).split("\n");
    const bad = [];
    lines.forEach((raw, i) => {
      if (!/window\.BondiSkills\?\.afterDamage\?\.\(/.test(raw.trim())) return;
      // 往上找最近一条「非注释、非空」的代码行：注释里提到时停不算守卫
      // （第一版只看前一行，被本轮自己写的说明注释骗过，反向验证时没报错）。
      let prev = "";
      for (let k = i - 1; k >= 0; k--) {
        const t = (lines[k] || "").trim();
        if (t === "" || t.startsWith("//") || t.startsWith("/*")) continue;
        prev = t;
        break;
      }
      if (/MieryulaTimeStop|isSkillDisabled|timeStopped/.test(prev)) return;
      bad.push({ file, line: i + 1, prev: prev.slice(0, 60) });
    });
    check(bad.length === 0, `兽人王邦迪【以牙还牙】备用分支带时停守卫（${file}）`, { bad });
  }
  // 6.2 兽人模块必须挂在带守卫的分发点下（防止将来新增兽人技能却忘了守卫）
  check(/MieryulaTimeStop/.test(read("battle-end-phase.js")),
    "自爆倒计时所在分发点（end-phase）带时停守卫", {});
  check(/timeStopped|MieryulaTimeStop/.test(read("ruins-witherer-common.js")),
    "凋零者（含1124号）技能链带时停判据", {});
}

if (failures.length) {
  console.log(`FAIL ${pass} passed, ${failures.length} failed`);
  for (const line of failures) console.log("  " + line);
  process.exit(1);
}
console.log(`PASS ${pass}/${pass}`);
