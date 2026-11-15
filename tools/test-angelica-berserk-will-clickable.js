// 【狂战意志】主动技「可点击 / 发动一次后置灰 / 新台词」严格检查（纯 Node）
//   A 点击链路：登记表 SPECIAL → canUseBerserkWill → canPlay → skillState → DOM disabled
//   B 台词：新台词入表、旧台词 0 残留、公告/文档/注释/技能执行块注释同步
//   C 置灰表现：disabled 类 + aria-disabled + 移除 data-skill-index + CSS 灰度
//   D 反向：REVERT=line|guard|disabled|notice 撤掉对应改动必须精准打红
// 用真实源码静态断言 + vm 加载真实模块，不用自写等价式。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const ORIG = path.join(ROOT, "src/original");
const REVERT = process.env.REVERT || "";
const NEW_LINE = "游戏结束了，看我全力进攻。";
const OLD_LINE = "接下来，老子使出全力了！";
let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function raw(file, dir = ORIG) { return fs.readFileSync(path.join(dir, file), "utf8"); }
function patched(file) {
  let s = raw(file);
  const hit = (before, after, tag) => {
    assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
    return after;
  };
  if (REVERT === "line" && file === "battle-line-data.js") {
    return hit(s, s.replace(`"狂战意志": "${NEW_LINE}"`, `"狂战意志": "${OLD_LINE}"`), "line table");
  }
  if (REVERT === "guard" && file === "skill-once-per-turn.js") {
    return hit(s, s.replace('    ["berserkWill", actor => !window.AngelicaLukaSkills?.canUseBerserkWill?.(actor)],\n', ""),
      "once-per-turn SPECIAL guard");
  }
  if (REVERT === "disabled" && file === "ui-common-skill-view.js") {
    return hit(s, s.replace('${disabled ? "disabled" : ""}', '""')
      .replace('${disabled ? "aria-disabled=\\"true\\"" : ""}', '""'), "disabled render");
  }
  if (REVERT === "notice" && file === "update-notice-recent.js") {
    return hit(s, s.replace(`「${NEW_LINE}」（主动发动台词已由「${OLD_LINE}」更换）`, `「${OLD_LINE}」`), "notice line");
  }
  return s;
}
const src = file => patched(file);

console.log("\n【A】点击链路：登记表 / 技能访问 / canUse / canPlay / skillState");
const registry = src("skill-once-per-turn.js");
const access = src("character-skill-access.js");
const angelica = src("angelica-luka-skills.js");
const playability = src("battle-card-playability.js");
const model = src("ui-common-skill-model.js");
const view = src("ui-common-skill-view.js");
const units = src("ui-battle-units.js");
const bindings = src("battle-action-hand-bindings.js");
T("A1 一次性登记表把 berserkWill 接到 canUseBerserkWill",
  /\["berserkWill",\s*actor => !window\.AngelicaLukaSkills\?\.canUseBerserkWill\?\.\(actor\)\]/.test(registry));
T("A2 技能访问表把狂战意志登记为 self 目标主动技",
  /flags:\s*\["berserkWill"\],\s*name:\s*"狂战意志",\s*target:\s*"self"/.test(access));
T("A3 canUseBerserkWill 三条件：本角色 / 本回合未发动（含旧档）/ 有标记",
  /function canUseBerserkWill\(actor\)[\s\S]{0,320}?actor\?\.ref === "angelica"[\s\S]{0,320}?!actor\.usedBerserkWill[\s\S]{0,320}?!actor\.usedCrimsonRampage[\s\S]{0,320}?\(actor\.rageMarks \|\| 0\) > 0/.test(angelica));
T("A4 发动函数置 usedBerserkWill 且由 canUse 守卫",
  /if \(!canUseBerserkWill\(actor\)\) return true;\s*actor\.usedBerserkWill = true;/.test(angelica));
T("A5 canPlay 经 blockedByUsage 消费统一登记表",
  /const blockedByUsage = \(actor, card, battle\) =>\s*oncePerTurnRegistry\(\)\.blocked\(actor, card, battle\)/.test(playability)
  && /if \(blockedByUsage\(actor, card, battle\) \|\| blockedByHand\(actor, card, hasHand\)\) return false;/.test(playability));
T("A6 skillState 对主动技以 canPlay 判定 usable，否则给「次数…不足」",
  /if \(!window\.BattleSystem\?\.canPlay\?\.\(actor, card, battle\)\) \{\s*return \{ usable: false, reason: "次数、手牌、杀意或目标条件不足" \};/.test(model));
T("A7 activeInfo 把 !usable 传成 disabled，clickable 传 usable",
  /U\.skillName\(\s*skill, index, skillState\.usable,[\s\S]{0,260}?shown\.side === "ally" && skill\.type === "active" && !skillState\.usable/.test(units));

console.log("\n【B】台词：新台词入表、旧台词残留、公告/文档/注释同步");
const lineData = src("battle-line-data.js");
const notice = src("update-notice-recent.js");
const doc = raw("安洁莉卡技能重制.txt", path.join(ROOT, "docs"));
const comment = src("angelica-luka-skills.js");
T("B1 台词表 angelica.狂战意志 = 新台词",
  new RegExp(`"狂战意志": "${NEW_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(lineData));
T("B2 台词表无旧台词",
  !lineData.includes(OLD_LINE));
T("B3 运行时源码除公告外无旧台词残留",
  fs.readdirSync(ORIG).filter(f => f.endsWith(".js"))
    .filter(f => !["update-notice-recent.js", "update-notice-archive.js"].includes(f))
    .every(f => !raw(f).includes(OLD_LINE)));
T("B4 今日公告写明新台词并注明旧台词已更换",
  notice.includes(`「${NEW_LINE}」（主动发动台词已由「${OLD_LINE}」更换）`));
T("B5 设定文档标注主动发动台词为新台词",
  doc.includes(`主动发动台词：${NEW_LINE}`) && !doc.includes(OLD_LINE));
T("B6 技能执行块注释不再引用旧台词",
  comment.includes(`「${NEW_LINE}」是【狂战意志】主动发动台词`) && !comment.includes(OLD_LINE));
T("B7 主动发动仍调用 line(state, actor, \"狂战意志\") 播台词",
  /function berserkWill[\s\S]{0,1200}?line\(state, actor, "狂战意志"\)/.test(angelica));

console.log("\n【C】置灰表现：DOM 属性 / CSS / 点击绑定");
T("C1 disabled 时输出 disabled 类、aria-disabled=true，且不给 data-skill-index",
  /const data = clickable && skill\?\.type === "active" && !disabled/.test(view)
  && /\$\{disabled \? "disabled" : ""\}/.test(view)
  && /\$\{disabled \? "aria-disabled=\\"true\\"" : ""\}/.test(view));
T("C2 点击只绑定 data-skill-index 按钮（置灰后自然点不动）",
  /document\.querySelectorAll\("\[data-skill-index\]"\)\.forEach/.test(bindings)
  && /BattleSystem\.selectSkill\(state, Number\(skill\.dataset\.skillIndex\)\)/.test(bindings));
T("C3 selectSkill 二次调用被 canPlay 拦下（置灰不是只砍样式）",
  /if \(skill\?\.type !== "active" \|\| b\.locked \|\| !canUseSkillNow[\s\S]{0,200}?!canPlay\(actor, card, b\)\) return false;/.test(raw("battle-combat-targeting.js")));
const css = raw("battle-cards.css", path.join(ROOT, "publish"));
T("C4 CSS .skill.disabled 有透明度 + 灰度 + not-allowed",
  /\.skill\.disabled \{[^}]*opacity:[^}]*filter:\s*grayscale\(1\)[^}]*cursor:\s*not-allowed/.test(css));

console.log("\n【D】真实模块 vm：发动前可点 / 发动后置灰 / 二次无效");
global.window = global;
global.BattleLines = { skill: () => {} };
global.BattleLog = { add: () => {} };
global.BattleStats = { heal: () => {} };
global.BattleHpValue = {
  healCap: (_u, a) => Math.max(0, Math.round(a)),
  applyHeal: u => u.hp,
};
global.BattleDrawFeedback = { action: () => "摸0张牌" };
global.CardUtils = { isKillCard: () => false };
vm.runInThisContext(src("skill-once-per-turn.js"), { filename: "skill-once-per-turn.js" });
vm.runInThisContext(src("angelica-luka-skills.js"), { filename: "angelica-luka-skills.js" });
const skill = { name: "狂战意志", type: "active", card: { name: "狂战意志", type: "tactic", berserkWill: true, targetless: true, _skill: true } };
const actor = {
  uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally",
  hp: 80, maxHp: 154, rageMarks: 3, usedBerserkWill: false, usedCrimsonRampage: false,
  skills: [skill], hand: [],
};
const battle = { allies: [actor], enemies: [{ uid: "e0", side: "enemy", hp: 30 }], phase: 4, activeUid: "a0", locked: false, turn: 1 };
const state = { battle };
global.state = state;
const card = { ...skill.card };
T("D1 发动前 canUseBerserkWill=true / blocked=false（按钮可点）",
  window.AngelicaLukaSkills.canUseBerserkWill(actor) === true
  && window.SkillOncePerTurn.blocked(actor, card, battle) === false);
const r1 = window.AngelicaLukaSkills.handleSpecialCard(state, actor, null, card, { draw: () => 0 }, { pushFloat() {} });
T("D2 第一次发动成功，标记清零且一次性标记置位",
  r1 === true && actor.rageMarks === 0 && actor.usedBerserkWill === true);
T("D3 发动后 canUse=false / blocked=true（按钮置灰）",
  window.AngelicaLukaSkills.canUseBerserkWill(actor) === false
  && window.SkillOncePerTurn.blocked(actor, card, battle) === true);
const before = { rage: actor.rageMarks, used: actor.usedBerserkWill };
const r2 = window.AngelicaLukaSkills.handleSpecialCard(state, actor, null, { ...skill.card }, { draw: () => 0 }, { pushFloat() {} });
T("D4 直接再调执行块也无效（守卫不依赖 DOM）",
  r2 === true && actor.rageMarks === before.rage && actor.usedBerserkWill === before.used);
// 下一回合自动清理后恢复可点（beginTurn 不重置 usedBerserkWill，由 battle-turn-state 统一清）
actor.rageMarks = 2;
T("D5 旧档 usedCrimsonRampage 仍拦住发动（置灰口径兼容旧档）",
  (() => {
    const old = { ...actor, usedBerserkWill: false, usedCrimsonRampage: true, rageMarks: 2 };
    return window.AngelicaLukaSkills.canUseBerserkWill(old) === false
      && window.SkillOncePerTurn.blocked(old, card, battle) === true;
  })());

console.log(`\nRESULT ${pass}/${pass + reds.length}  REVERT=${REVERT || "none"}`);
if (REVERT) {
  console.log(`REVERT_OK=${reds.length > 0 ? "YES" : "NO"} expected_red_group=${REVERT} reds=${JSON.stringify(reds)}`);
} else if (reds.length) {
  reds.forEach(r => console.log(`  ❌ ${r}`));
  process.exitCode = 1;
}
