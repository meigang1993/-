// 【狂战意志】合并【猩红暴走】后的表现层严格检查：
//   A 卡图：技能卡/出牌区快照都命中 skill-art-berserker-will，旧猩红暴走图无残留引用
//   B 出牌区：snapshot 保留 skillName / 「发动了」，CardArt 仍按技能图取图
//   C 皮肤特效：原独立主动技的 8 段特效、CSS、音效在合并后仍由 berserkWill 触发
//   D 原技能口径：运行时源码无「猩红暴走」判定残留，台词/技能表/登记表同步
//   E 反向：REVERT=art|fx|trail 撤掉对应修复，断言必须精准变红
//
// 用 vm 直接加载 src/original 真实模块（不是自写等价式）；REVERT 模式加载
// 「撤回后」的源码，验证断言不是空转。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const srcPath = f => path.join(ROOT, "src/original", f);
const src = f => fs.readFileSync(srcPath(f), "utf8");
const css = fs.readFileSync(path.join(ROOT, "publish/angelica-berserker-skin.css"), "utf8");
const REVERT = process.env.REVERT || "";

let pass = 0, fail = 0;
const T = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  ← ${detail}` : ""}`);
};

global.window = global;
const mounted = [], tones = [], logs = [], lines = [];
class FakeEl {
  constructor() {
    this.className = ""; this.innerHTML = "";
    this.style = { setProperty() {}, cssText: "" };
    this.classList = { add() {}, remove() {} };
  }
}
global.document = {
  createElement: () => new FakeEl(),
  querySelectorAll: () => [],
};
window.BattleEffectAnchors = {
  place: () => ({ element: new FakeEl() }),
  action: () => new FakeEl(),
  mirror: () => null,
  measure: () => null,
};
window.SkinFXRuntime = {
  create: () => ({
    active: () => true,
    hasDocument: () => true,
    later: task => { task(); return 1; },
    mount: (_state, node) => { mounted.push(String(node.className)); return () => true; },
    cancel: () => {},
  }),
};
window.BattleAudio = { tone: (...args) => tones.push(args) };
window.BattleLines = { skill: (_s, _u, name) => lines.push(name) };
window.BattleLog = { add: (_s, msg) => logs.push(msg) };
window.BattleHpValue = {
  healPctStacks: (unit, pct, n) => Math.max(1, Math.round((unit?.maxHp ?? unit?.stats?.maxHp ?? 0) * Math.max(0, pct) / 100)) * Math.max(0, Math.round(n)),
  healCap: (_u, amount) => Math.max(0, Math.round(amount)),
  applyHeal: (u, amount) => { u.hp = Math.min(u.maxHp || 9999, (u.hp || 0) + amount); return amount; },
};
window.BattleStats = { heal() {} };

const transform = {
  "card-art.js": s => REVERT === "art"
    ? s.replace(/"狂战意志": "[^"]+",\n/, "")
    : s,
  "angelica-luka-skills.js": s => REVERT === "fx"
    ? s.replace("window.AngelicaBerserkerSkinFX?.berserkWill?.(state, actor, spent);", "")
    : s,
  "battle-combat-trail.js": s => REVERT === "trail"
    ? s.replace("if (skillName) base.skillName = skillName;\n    else delete base.skillName;",
      "delete base.skillName;")
    : s,
};
const load = f => {
  const code = (transform[f] || (s => s))(src(f));
  vm.runInThisContext(code, { filename: f });
};
["card-utils.js", "card-art.js", "ui-common-skill-model.js",
  "battle-combat-trail.js", "angelica-berserker-skin-fx.js",
  "angelica-luka-skills.js"].forEach(load);
window.UICommon = window.UICommonSkillModel();

const SKILL_ART = "./assets/generated/cards/skill-art-berserker-will.51f36fec.webp";
const OLD_ART = "skill-art-crimson-rampage.ba43cf6a.webp";
const skillCard = () => ({
  name: "狂战意志", type: "tactic", berserkWill: true, targetless: true,
  _skill: true, skillName: "狂战意志", icon: "⚔️",
  text: "弃置所有“狂战”标记，摸等量的牌，然后回复X点生命值。",
});
const actor = {
  uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally",
  hp: 80, maxHp: 154, rageMarks: 3, usedBerserkWill: false,
  skills: [{ name: "狂战意志", type: "active", card: skillCard() }],
};
const battle = { allies: [actor], enemies: [], turn: 1, played: [] };
const state = { battle };
global.state = state;
const trail = window.BattleCombatTrail({ allUnits: b => b.allies.concat(b.enemies) });

console.log("\n【A】卡图：狂战意志技能卡 / 出牌区快照");
const card = skillCard();
const skillUrl = window.CardArt.url(card);
T("A1 技能卡命中狂战意志专属卡图（非技能兜底图）",
  skillUrl === SKILL_ART && skillUrl !== window.CardArt.fallbackUrl(card), skillUrl);
T("A2 卡图文件真实存在且是 WebP",
  fs.existsSync(path.join(ROOT, "publish", SKILL_ART.replace(/^\.\//, "")))
  && fs.readFileSync(path.join(ROOT, "publish", SKILL_ART.replace(/^\.\//, ""))).slice(0, 4).toString() === "RIFF");
T("A3 skillArt 已无「猩红暴走」键、旧图文件已删除、全库无旧图引用",
  !/"猩红暴走"\s*:/.test(src("card-art.js"))
  && !fs.existsSync(path.join(ROOT, "publish/assets/generated/cards", OLD_ART))
  && !fs.readdirSync(path.join(ROOT, "src/original")).some(f =>
    f.endsWith(".js") && src(f).includes(OLD_ART)));

console.log("\n【B】出牌区：发动主动技后的战报快照");
const snap = trail.snapshot(card, actor, battle);
T("B1 快照牌名/技能名/动作文案正确",
  snap.name === "狂战意志" && snap._playedAction === "发动了"
  && snap._playedByName === "安洁莉卡", JSON.stringify({
    name: snap.name, action: snap._playedAction, by: snap._playedByName }));
T("B2 快照保留 skillName（CardArt 据此识别技能图）",
  snap.skillName === "狂战意志", `skillName=${snap.skillName}`);
T("B3 出牌区快照仍取狂战意志卡图，不退回兜底图",
  window.CardArt.url(snap) === SKILL_ART, window.CardArt.url(snap));
T("B4 useCard 链路：handleSpecialCard 命中后置 _countAsPlayed（trailEntry 保留）",
  /if \(window\.AngelicaLukaSkills\?\.handleSpecialCard\?\.\(state, actor, target, card, deps, specialCtx\)\) \{ card\._countAsPlayed = true;/.test(src("battle-combat.js"))
  && /const counted = !!card\?\._countAsPlayed/.test(src("battle-combat.js"))
  && /if \(counted && state\.battle === battleAtStart\)/.test(src("battle-combat.js")));

console.log("\n【C】皮肤特效：原【猩红暴走】8 段特效在合并后保留");
const RAMPAGE = ["armor", "burst", "shock", "giant", "heal", "pulse", "rain", "core"]
  .map(k => `angelica-berserker-rampage-${k}`);
T("C1 fx 模块导出 berserkWill（不再是独立 crimsonRampage）",
  typeof window.AngelicaBerserkerSkinFX.berserkWill === "function"
  && /berserkWill, sync, cancel/.test(src("angelica-berserker-skin-fx.js"))
  && !/function crimsonRampage/.test(src("angelica-berserker-skin-fx.js")));
T("C2 CSS 为 8 段特效各保留规则与动画",
  RAMPAGE.every(c => new RegExp(`\\.${c}\\b`).test(css))
  && (css.match(/@keyframes/g) || []).length >= 40);
mounted.length = 0; tones.length = 0; lines.length = 0; logs.length = 0;
const ok = window.AngelicaLukaSkills.handleSpecialCard(
  state, actor, null, card, { draw: () => 0 }, { pushFloat() {} });
const seen = new Set(mounted.join(" ").split(/\s+/));
T("C3 发动狂战意志时逐段挂载全部 8 段原特效",
  ok === true && RAMPAGE.every(c => seen.has(c)),
  `seen=${RAMPAGE.filter(c => seen.has(c)).length}/8`);
T("C4 原特效音效链保留（每段 tone 都在）",
  tones.length >= 15, `tone calls=${tones.length}`);
T("C5 主动发动播「狂战意志」台词，不播已删除的「猩红暴走」",
  lines.includes("狂战意志") && !lines.includes("猩红暴走"), JSON.stringify(lines));
T("C6 合并后效果完整：标记清零 / 摸牌 / 回血 / 战报",
  actor.rageMarks === 0 && logs.some(m => m.includes("发动狂战意志，弃置3枚"))
  && logs.some(m => m.includes("摸")) && logs.some(m => m.includes("恢复")),
  JSON.stringify(logs.slice(0, 4)));

console.log("\n【D】原技能口径残留扫描");
const runtimeFiles = fs.readdirSync(path.join(ROOT, "src/original"))
  .filter(f => f.endsWith(".js"));
const whitelist = new Set(["store-merged-skills-repair.js", "store-repairs.js", "update-notice-archive.js", "update-notice-recent.js"]);
const offenders = runtimeFiles.filter(f => !whitelist.has(f) && src(f).includes("猩红暴走"));
T("D1 运行时源码无「猩红暴走」判定/特效挂点残留",
  offenders.length === 0, JSON.stringify(offenders));
T("D2 角色表只剩 2 个技能，狂战意志为 active 且带 berserkWill 卡",
  /name: "狂战意志", type: "active"/.test(src("data-characters-extra.js"))
  && /card: \{ name: "狂战意志"[^\n]*berserkWill: true/.test(src("data-characters-extra.js"))
  && !/name: "猩红暴走"/.test(src("data-characters-extra.js"))
  && (src("data-characters-extra.js").match(/id: "angelica"[\s\S]*?skills: \[([\s\S]*?)\n    \]/)?.[1].match(/\n      \{ name: "/g) || []).length === 2);
T("D3 登记表 / 技能访问 / 一次性限制 / 台词表均同步",
  /flags: \["berserkWill"\], name: "狂战意志"/.test(src("character-skill-access.js"))
  && /\["berserkWill", actor => !window\.AngelicaLukaSkills\?\.canUseBerserkWill\?\.\(actor\)\]/.test(src("skill-once-per-turn.js"))
  && /"狂战意志": "游戏结束了，看我全力进攻。"/.test(src("battle-line-data.js"))
  && !/"狂战意志": "接下来，老子使出全力了！"/.test(src("battle-line-data.js"))
  && !/"猩红暴走"/.test(src("battle-line-data.js")));

console.log(`\nRESULT ${pass}/${pass + fail}  REVERT=${REVERT || "none"}`);
if (REVERT) {
  console.log(`REVERT_OK=${fail > 0 ? "YES" : "NO"} expected_red_group=${REVERT}`);
} else if (fail) {
  process.exitCode = 1;
}
