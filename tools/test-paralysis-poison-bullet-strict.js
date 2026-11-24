// 【麻痹毒子弹】（攻击型无人机）描述 / 实现 / 真实结算 严格检查
// 运行：node tools/test-paralysis-poison-bullet-strict.js
//       REVERT=desc|docs|notice|dup|sweep|attr node ... （源码级反向验证）
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const DOCS = path.join(ROOT, "docs");
const PUBLISH = path.join(ROOT, "publish", "bundles");
const REVERT = process.env.REVERT || "";

const OLD_TEXT = "锁定技，你使用的单体【杀】造成伤害后，令目标获得一张【麻痹】状态牌（多段或连击伤害时逐段结算）；当前实现不额外改变伤害属性。";
const NEW_TEXT = "锁定技，你使用的单体【杀】改为毒属性伤害；造成伤害后，目标获得1层【毒】与一张【麻痹】状态牌（多段或连击伤害时逐段结算，同类【麻痹】状态牌不可叠加）。";
const DOC05_NEW = `技能：麻痹毒子弹（被动/锁定技）- 你使用的单体【杀】改为毒属性伤害；
造成伤害后，目标获得1层【毒】与一张【麻痹】状态牌（多段或连击伤害时逐段结算，
同类【麻痹】状态牌不可叠加）。`;
const DOC05_OLD = `技能：麻痹毒子弹（被动）- 你使用的单体【杀】造成伤害后，
令目标获得一张【麻痹】状态牌。`;
const DOC12_NEW = `- 麻痹毒子弹（被动/锁定技）：你使用的单体【杀】改为毒属性伤害；
  造成伤害后，目标获得1层【毒】与一张【麻痹】状态牌（多段或连击伤害时逐段结算，
  同类【麻痹】状态牌不可叠加）。`;
const DOC12_OLD = `- 麻痹毒子弹（被动）：你使用的单体【杀】造成伤害后，
  令目标获得一张【麻痹】状态牌；当前实现不额外改变伤害属性。`;

const src = f => fs.readFileSync(path.join(SRC, f), "utf8");
const doc = f => fs.readFileSync(path.join(DOCS, f), "utf8");
let CODE = {};
function codeOf(f) {
  if (CODE[f] !== undefined) return CODE[f];
  let s = src(f);
  if (REVERT === "desc" && f === "data-ruins-sand-city-enemies.js") {
    if (!s.includes(NEW_TEXT)) throw new Error("REVERT=desc must hit skill text");
    s = s.replace(NEW_TEXT, OLD_TEXT);
  }
  if (REVERT === "attr" && f === "ruins-grunt-skills.js") {
    if (!s.includes("card.poison = true;")) throw new Error("REVERT=attr must hit poison conversion");
    s = s.replace("card.poison = true;", "card.poison = false;");
  }
  if (REVERT === "sweep" && f === "ruins-grunt-skills.js") {
    const from = "if (actor.ai !== \"ruins_drone\" || !C.isSingleSlash(card) || card?._soulChain) return;";
    if (!s.includes(from)) throw new Error("REVERT=sweep must hit single-slash guard");
    s = s.replace(from, "if (actor.ai !== \"ruins_drone\" || !C.isSlash(card) || card?._soulChain) return;");
  }
  if (REVERT === "downed" && f === "ruins-grunt-skills.js") {
    const from = "window.EnemySkills?.addPoison?.(state, target, 1, actor, true);";
    if (!s.includes(from)) throw new Error("REVERT=downed must hit allowDowned");
    s = s.replace(from, "window.EnemySkills?.addPoison?.(state, target, 1, actor, false);");
  }
  if (REVERT === "split" && f === "ruins-grunt-skills.js") {
    const from = "      window.EnemySkills?.addPoison?.(state, target, 1, actor, true);\n";
    if (!s.includes(from)) throw new Error("REVERT=split must hit self-issued poison");
    s = s.replace(from, "");
  }
  if (REVERT === "self" && f === "ruins-grunt-skills.js") {
    const from = "    card.dronePoisonSelf = true;\n";
    if (!s.includes(from)) throw new Error("REVERT=self must hit dedupe flag");
    s = s.replace(from, "");
  }
  if (REVERT === "dup" && f === "ruins-grunt-skills.js") {
    const from = "      window.EnemySkills?.addPoison?.(state, target, 1, actor, true);";
    if (!s.includes(from)) throw new Error("REVERT=dup must hit self-issued poison");
    s = s.replace(from, from + "\n      window.EnemySkills?.addPoison?.(state, target, 1, actor, true);");
  }
  if (REVERT === "dup" && f === "enemy-damage-hooks.js") {
    const from = '        && !card?.dronePoisonSelf && actor?.ai !== "ruins_drone") {';
    if (!s.includes(from)) throw new Error("REVERT=dup must hit common-hook skip");
    s = s.replace(from, "        ) {");
  }
  return (CODE[f] = s);
}
function docOf(f) {
  let s = doc(f);
  if (REVERT === "docs") {
    if (f === "05-怪物与怪物技能与饰品.txt") {
      if (!s.includes(DOC05_NEW)) throw new Error("REVERT=docs must hit docs/05");
      s = s.replace(DOC05_NEW, DOC05_OLD);
    }
    if (f === "12-新副本素材-废墟沙城.txt") {
      if (!s.includes(DOC12_NEW)) throw new Error("REVERT=docs must hit docs/12");
      s = s.replace(DOC12_NEW, DOC12_OLD);
    }
  }
  return s;
}
function noticeOf() {
  let s = src("update-notice-recent.js");
  if (REVERT === "notice") {
    const before = s.length;
    s = s.replace(/, "【麻痹毒子弹】（攻击型无人机）第一回合毒标记漏发修复：[^"]*"/, "");
    if (s.length === before) throw new Error("REVERT=notice must hit notice item");
  }
  return s;
}

const {
  installGlobals, loadRuntime, createState, enemyFromTemplate, unitFromCharacter, card,
} = require("./skill-coverage-fixtures");
installGlobals();
loadRuntime();

const extra = [
  "skill-once-per-turn.js",
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
  "data-ruins-sand-city-enemies.js",
  "ruins-grunt-common.js",
  "ruins-grunt-landmine.js",
  "ruins-grunt-rps.js",
  "ruins-grunt-skills.js",
  "ruins-enemy-skills.js",
];
extra.forEach(f => vm.runInThisContext(codeOf(f), { filename: f }));

// 让「受击浮字播完后再发放」在 Node 夹具里同步执行，便于精确断言毒层数与状态牌。
window.BattleDamageLifecycle = { delayUntilHitSettled: (_s, fn) => { fn(); return true; } };

let pass = 0, total = 0;
const reds = [];
function T(group, name, ok, detail = "") {
  total += 1;
  if (ok) { pass += 1; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { reds.push({ group, name }); console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
}

const enemies = window.GameDataRuinsSandCityEnemies;
const drone = enemies.find(e => e.id === "attack_drone");
const skill = (drone?.skills || []).find(s => s.name === "麻痹毒子弹");
const doc05 = docOf("05-怪物与怪物技能与饰品.txt");
const doc12 = docOf("12-新副本素材-废墟沙城.txt");
const design = docOf("废墟沙城怪物设计最新版本.txt");
const notice = noticeOf();
const startup = fs.readFileSync(path.join(PUBLISH, "startup.min.js"), "utf8");

// ---------- A 文案 / 产物同步 ----------
T("A", "A1 卡面写明毒属性伤害、1层【毒】、【麻痹】，且不再含实现备注",
  !!skill && /毒属性伤害/.test(skill.text) && /1层【毒】/.test(skill.text)
  && /【麻痹】状态牌/.test(skill.text) && !/不额外改变伤害属性|当前实现/.test(skill.text),
  skill?.text?.slice(0, 60));
T("A", "A2 卡面仍以「锁定技」开头（全库⭐被动技能规范）", /^锁定技/.test(skill?.text || ""));
T("A", "A3 docs/05 与卡面同口径", /毒属性伤害/.test(doc05) && /1层【毒】/.test(doc05)
  && !/不额外改变伤害属性/.test(doc05));
T("A", "A4 docs/12 与卡面同口径", /毒属性伤害/.test(doc12) && /1层【毒】/.test(doc12)
  && !/不额外改变伤害属性/.test(doc12));
T("A", "A5 设计稿原本就是毒属性+毒标记+麻痹（权威口径）",
  /造成毒属性伤害，施加毒标记/.test(design) && /生成一张麻痹状态牌/.test(design));
T("A", "A6 公告首期写入本次订正", /【麻痹毒子弹】（攻击型无人机）描述与实际效果订正/.test(notice));
T("A", "A6b 公告首期写入 265 第一回合漏毒修复", /第一回合毒标记漏发修复/.test(notice));
T("A", "A7 startup 产物已同步新卡面", startup.includes("改为毒属性伤害；造成伤害后，目标获得1层【毒】"));

// ---------- B 实现（源码级） ----------
const gruntSrc = codeOf("ruins-grunt-skills.js");
const hookSrc = codeOf("enemy-damage-hooks.js");
const statusSrc = codeOf("enemy-status-effects.js");
T("B", "B1 单体杀转毒属性：beforeKillUsed 写 card.poison = true",
  /if \(!C\.isSingleSlash\(card\)\) return;\s*card\.poison = true;/.test(gruntSrc)
  && !/card\.poison = false;/.test(gruntSrc));
T("B", "B2 技能内同源发毒且带 allowDowned",
  /EnemySkills\?\.addPoison\?\.\(state, target, 1, actor, true\)/.test(gruntSrc));
T("B", "B3 afterDamage 用 isSingleSlash 收紧，且仍排除锁魂链追加段",
  /!C\.isSingleSlash\(card\) \|\| card\?\._soulChain/.test(gruntSrc));
T("B", "B4 仍真实创建【麻痹】状态牌",
  /BattleStatusCardRegistry\?\.create\("paralysis"\)/.test(gruntSrc));
T("B", "B5 通用钩子对无人机杀跳过发毒（避免叠 2 层）",
  /!card\?\.dronePoisonSelf && actor\?\.ai !== "ruins_drone"/.test(hookSrc));
T("B", "B6 addPoison 支持 allowDowned 且默认口径不变",
  /allowDowned = false/.test(statusSrc)
  && /!allowDowned && !alive\(\[target\]\)\.length/.test(statusSrc));
T("B", "B7 beforeKillUsed 写入 dronePoisonSelf 去重标记",
  /card\.dronePoisonSelf = true;/.test(gruntSrc));

// ---------- C 真实结算链 ----------
const mkActor = () => {
  const u = enemyFromTemplate(drone, "e0");
  u.ai = drone.ai;
  return u;
};
const mkTarget = () => {
  const u = unitFromCharacter(window.GameData.characters[0], "a0");
  u.hand = [];
  u.poison = 0; u.poisonMarks = []; u.statuses = [];
  return u;
};
const mkState = (actor, target) => {
  const st = createState();
  st.battle.enemies = [actor]; st.battle.allies = [target];
  st.log = [];
  return st;
};
const runHit = (overrides = {}) => {
  const actor = mkActor(), target = mkTarget(), st = mkState(actor, target);
  const c = card("杀（普攻）", "slash", { suit: "♠", power: 0, scale: "attack", ...overrides });
  window.RuinsGruntSkills.beforeKillUsed(st, actor, c);
  window.EnemySkills.afterDamage(st, actor, target, c, 5, () => {});
  return { actor, target, st, c };
};
const paraCount = u => (u.hand || []).filter(c => c.name === "麻痹").length;

{
  const r = runHit();
  T("C", "C1 单体杀命中：恰好 1 层毒 + 1 张麻痹",
    (r.target.poison || 0) === 1 && paraCount(r.target) === 1,
    `毒=${r.target.poison || 0} 麻痹=${paraCount(r.target)}`);
  T("C", "C1b 战报写明获得 1 层毒",
    (r.st.log || []).some(l => String(l).includes("获得1层毒")));
}
{
  const r = runHit({ sweep: true, name: "机枪扫杀", targetless: true });
  T("C", "C2 群体杀：不转毒、不发毒、不生成麻痹",
    r.c.poison !== true && (r.target.poison || 0) === 0 && paraCount(r.target) === 0,
    `poison=${r.c.poison} 毒=${r.target.poison || 0} 麻痹=${paraCount(r.target)}`);
}
{
  const r = runHit({ _soulChain: true });
  T("C", "C3 锁魂链追加段：不生成麻痹（毒亦不发放）",
    (r.target.poison || 0) === 0 && paraCount(r.target) === 0,
    `毒=${r.target.poison || 0} 麻痹=${paraCount(r.target)}`);
}
{
  const actor = mkActor(), target = mkTarget(), st = mkState(actor, target);
  const c = card("杀（普攻）", "slash", { suit: "♠", power: 0, scale: "attack" });
  window.RuinsGruntSkills.beforeKillUsed(st, actor, c);
  window.EnemySkills.afterDamage(st, actor, target, c, 5, () => {});
  window.EnemySkills.afterDamage(st, actor, target, c, 5, () => {});
  T("C", "C4 多段逐段结算：毒叠 2 层、麻痹同类不叠加仍 1 张",
    (target.poison || 0) === 2 && paraCount(target) === 1,
    `毒=${target.poison || 0} 麻痹=${paraCount(target)}`);
  T("C", "C4b 第二段麻痹被同类状态牌规则拒绝",
    (st.log || []).some(l => String(l).includes("不能再次获得同类状态牌")));
}

{
  // 265 核心回归：目标 hp<=0（一击濒死 / 随后被保命、复活、测试模式回血救回）时，
  // 毒不再被 addPoison 的存活守卫吞掉，与麻痹保持一致。
  const actor = mkActor(), target = mkTarget(), st = mkState(actor, target);
  target.hp = 0;
  const c = card("杀（普攻）", "slash", { suit: "♠", power: 0, scale: "attack" });
  window.RuinsGruntSkills.beforeKillUsed(st, actor, c);
  window.EnemySkills.afterDamage(st, actor, target, c, 5, () => {});
  T("C", "C5 濒死目标仍获得 1 层毒 + 1 张麻痹",
    (target.poison || 0) === 1 && paraCount(target) === 1,
    `hp=${target.hp} 毒=${target.poison || 0} 麻痹=${paraCount(target)}`);
}

// ---------- D 伤害属性 ----------
{
  const r = runHit();
  const attrs = window.BattleDamageAttributes.resolve(r.c, "", r.actor);
  T("D", "D1 单体杀伤害属性首项为毒（不是物理）",
    attrs[0] === "poison" && !attrs.includes("physical"), JSON.stringify(attrs));
  T("D", "D2 麻痹状态牌判定文案仍为♥/♠跳过出牌且禁响应",
    /♥红桃或♠黑桃/.test(window.BattleStatusCardRegistry.create("paralysis").text)
    && /无法使用或打出响应牌/.test(window.BattleStatusCardRegistry.create("paralysis").text));
}

// ---------- 汇总 / 反向 ----------
console.log(`RESULT ${pass}/${total}`);
if (reds.length) {
  const groups = [...new Set(reds.map(r => r.group))];
  console.log(`REVERT=${REVERT || "none"} REDS=${JSON.stringify(reds.map(r => r.name))} GROUPS=${JSON.stringify(groups)}`);
  const expected = {
    desc: ["A"], docs: ["A"], notice: ["A"],
    dup: ["B", "C"], sweep: ["B", "C"], attr: ["B", "D"],
    downed: ["B", "C"], split: ["B", "C"], self: ["B"],
  }[REVERT];
  if (REVERT) {
    const ok = expected && expected.every(g => groups.includes(g))
      && groups.every(g => expected.includes(g));
    console.log(ok ? `REVERT=${REVERT} OK own>0 other=0` : `REVERT=${REVERT} IMPRECISE`);
    if (!ok) process.exit(1);
  } else process.exit(1);
} else {
  if (REVERT) { console.log(`REVERT=${REVERT} FAILED (no red, assertion is a no-op)`); process.exit(1); }
}
