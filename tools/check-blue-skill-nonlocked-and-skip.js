// 🔵 图标技能口径审计：
//   A 所有 🔵 技能的公开描述以「非锁定技，」开头（card.text 卡面说明除外）
//   B 玩家可选择发动的 🔵 技能必须有跳过 / 放弃 / 不交 / 取消入口
//   C 复用现状：通用反击面板被多个技能共用；次元转移专用按钮未被其它技能复用
//   D 公告与设定契约同步
// 反向：REVERT=prefix|skip|panel|notice 精准打红对应组。
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};

// 反向注入表：只改内存中的文本，不落盘
const INJECT = {
  prefix: { "src/original/data-characters-core.js": [
    ['name: "指挥官责任", type: "trigger", icon: "🔵", text: "非锁定技，',
     'name: "指挥官责任", type: "trigger", icon: "🔵", text: "']] },
  skip: { "src/original/ui-hand-controls.js": [
    ['data-cadicis-responsibility-skip="1"', 'data-cadicis-responsibility-XX="1"']] },
  panel: { "src/original/battle-response-ui.js": [
    ['data-counter-trigger-skip="1"', 'data-counter-trigger-XX="1"']] },
  notice: { "src/original/update-notice-recent.js": [
    ['全库 19 个🔵技能公开描述统一补齐', '全库 19 个🔵技能公开描述未补齐']] },
  guard: { "src/original/ui-hand.js": [
    ['data-ophelia-guard-skip="1"', 'data-ophelia-guard-XX="1"']] },
  relic: { "src/original/data-relics.js": [
    ['effect: "非锁定技，当你使用的实体单体【杀】被【闪】抵消后',
     'effect: "当你使用的实体单体【杀】被【闪】抵消后']] },
  lock: { "src/original/data-ruins-content.js": [
    ['"螺旋桨": { icon: "旋", stats: {}, effect: "锁定技，',
     '"螺旋桨": { icon: "旋", skillType: "trigger", stats: {}, effect: "非锁定技，']] },
  panelBack: { "src/original/ruins-relic-propeller.js": [
    ["  function openPropeller(state, unit, ctx) {",
     '  function openPropeller(state, unit, ctx) {\n    if (window.BattleCounterTriggers?.open?.(state, { skill: "螺旋桨", unitUid: unit.uid })) return true;']] },
};
function read(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const [a, b] of (INJECT[REVERT] || {})[rel] || []) s = s.replace(a, b);
  return s;
}
const exists = rel => fs.existsSync(path.join(ROOT, rel));

// ── A. 数据源里所有 🔵 技能本体 ──
const DATA = [
  "src/original/data-characters-core.js", "src/original/data-characters-extra.js",
  "src/original/data-guard-kelly.js", "src/original/data-new-characters.js",
  "src/original/data-ruins-sand-city-enemies.js", "src/original/data-sakura-risa.js",
  "src/original/data-underwater-train-enemies.js",
];
const SKILL_RE = /\{\s*name:\s*"([^"]+)",\s*type:\s*"([^"]+)",\s*icon:\s*"🔵",\s*text:\s*"([^"]*)"/g;
const skills = [];
for (const rel of DATA) {
  const t = read(rel);
  let m;
  while ((m = SKILL_RE.exec(t))) skills.push({ rel, name: m[1], type: m[2], text: m[3] });
}
check("A1", `共 ${skills.length} 个 🔵 技能本体（预期 19）`, skills.length === 19, { got: skills.length });
const missing = skills.filter(s => !s.text.startsWith("非锁定技，")).map(s => s.name);
check("A2", "全部以「非锁定技，」开头", missing.length === 0, { missing });
const core = read("src/original/data-characters-core.js");
const cardText = (core.match(/card:\s*\{[^}]*?text:\s*"([^"]*)"/) || [])[1] || "";
check("A3", "榨取精华 card.text 是卡面说明、不加前缀", cardText.length > 10 && !cardText.startsWith("非锁定技"), { head: cardText.slice(0, 30) });

// ── A'. 饰品数据源的 🔵 effect（286 轮只覆盖 skills[].text，这里补上漏网之鱼） ──
// relics.js 的 skillsForNames/skillIcon 按 skillType === "trigger" 动态挂 🔵 图标，
// 饰品的公开描述字段是 effect（不是 skills[].text），必须单独审计。
const RELIC_FILES = ["src/original/data-relics.js", "src/original/data-ruins-content.js"];
const RELIC_RE = /"([^"]+)":\s*\{[^\n]*?skillType:\s*"trigger"[^\n]*?effect:\s*"([^"]*)"/g;
const relicTriggers = [];
for (const rel of RELIC_FILES) {
  const txt = read(rel);
  let m;
  while ((m = RELIC_RE.exec(txt))) relicTriggers.push({ rel, name: m[1], effect: m[2] });
}
// 290 起螺旋桨改为锁定技（⭐），全库只剩霹雳之锤一个 🔵 饰品。
check("A4", "全库 1 个 🔵 饰品（霹雳之锤）effect 以「非锁定技，」开头",
  relicTriggers.length === 1
  && relicTriggers.every(r => r.effect.startsWith("非锁定技，"))
  && relicTriggers[0]?.name === "霹雳之锤",
  { got: relicTriggers.map(r => [r.name, r.effect.slice(0, 14)]) });
check("A5", "图鉴与技能栏展示路径直接消费 effect（补前缀即可生效）",
  read("src/original/relics.js").includes("text: d.effect")
  && read("src/original/ui-common-relics.js").includes("效果：${esc(relic.effect)}"));

const ruins = read("src/original/data-ruins-content.js");
const propEntry = (ruins.match(/"螺旋桨":\s*\{[^\n]*\}/) || [])[0] || "";
check("A6", "螺旋桨已改为 ⭐ 锁定技：effect 以「锁定技，」开头、无 skillType:trigger、无「你可以」",
  /effect:\s*"锁定技，/.test(propEntry) && !propEntry.includes("你可以")
  && !/skillType:\s*"trigger"/.test(propEntry), { propEntry: propEntry.slice(0, 160) });
const propellerSrc = read("src/original/ruins-relic-propeller.js");
check("A7", "螺旋桨不再走玩家选择面板（无 BattleCounterTriggers.open），锁定技自动触发",
  !propellerSrc.includes("BattleCounterTriggers?.open")
  && propellerSrc.includes("triggerPropeller(state, unit, ctx)")
  && !read("src/original/battle-counter-triggers.js").includes("非锁定技（复仇反击/终焉回旋斩/螺旋桨"));

// ── B. 玩家侧跳过入口映射（描述含「你可以」= 可选择发动） ──
// 护驾提示条渲染在手牌区「空态面板」ui-hand.js，其余 9 个在 ui-hand-controls.js
const ui = read("src/original/ui-hand-controls.js") + "\n" + read("src/original/ui-hand.js");
const binds = read("src/original/battle-action-prompt-bindings.js")
  + read("src/original/battle-action-special-bindings.js")
  + read("src/original/app-battle-bindings.js");
const response = read("src/original/battle-response-ui.js");
const appBind = read("src/original/app-battle-bindings.js");

// 专属提示条按钮 → 绑定，两者都要在
const SKIP_MAP = [
  ["榨取精华",     "data-skip-extract"],
  ["次元转移",     "data-dimension-transfer-skip"],
  ["指挥官责任",   "data-cadicis-responsibility-skip"],
  ["战斗演练",     "data-aileng-drill-skip"],
  ["萌虎慰劳",     "data-gerda-comfort-skip"],
  ["半魅魔血",     "data-kaiichi-share-skip"],
  ["记忆泡泡",     "data-karuna-bubble-skip"],
  ["新月之歌",     "data-new-moon-skip"],
  ["渴血杀戮",     "data-mieryula-skip"],
  ["为我护驾",     "data-ophelia-guard-skip"],
];
let badSkip = [];
for (const [name, attr] of SKIP_MAP) {
  if (!ui.includes(attr) || !binds.includes(attr)) badSkip.push(name + ":" + attr);
}
check("B1", "10 个专属提示条按钮在渲染与绑定两侧齐全", badSkip.length === 0, { badSkip });

// 通用反击面板：多个 🔵 技复用同一「发动 / 跳过」
const counter = read("src/original/battle-counter-triggers.js");
check("B2", "通用反击面板含「发动 / 跳过」双按钮",
  response.includes('data-counter-trigger-use="1"') && response.includes('data-counter-trigger-skip="1"')
  && response.includes("的非锁定技") && response.includes("🔵"));
const PANEL_SKILLS = ["复仇反击", "终焉回旋斩", "护母反击", "贝尔蒂丝受伤反击", "刺刀AK47", "血色刺伞"];
const registered = PANEL_SKILLS.filter(n => counter.includes(n) || response.includes(n));
check("B3", "通用面板复用给 ≥4 个技能", registered.length >= 4, { registered });
check("B4", "通用面板跳过按钮有绑定",
  appBind.includes('bindCounterTrigger("[data-counter-trigger-skip]"'));

// 语义上不需要独立跳过的两项（如实固化，避免以后误加）
check("B5", "为我护驾已按非锁定技补独立跳过按钮；仅转换技（突破重围）按语义不设",
  SKIP_MAP.some(([n, a]) => n === "为我护驾" && a === "data-ophelia-guard-skip")
  && !SKIP_MAP.some(([n]) => n === "突破重围")
  && ui.includes("data-ophelia-guard-skip")
  && /为我护驾/.test(read("src/original/data-characters-extra.js")));
check("B6", "为我护驾描述取消「且没有【闪】时」并改为「你可以指定」",
  (() => {
    const d = read("src/original/data-characters-extra.js");
    const m = d.match(/name:\s*"为我护驾"[^\n]*?text:\s*"([^"]*)"/);
    return !!m && m[1].startsWith("非锁定技，") && !m[1].includes("且没有【闪】时")
      && m[1].includes("你可以指定");
  })());

// ── C. 复用现状：次元转移那套是专用的，没有被其它技能复用 ──
const dtFiles = [];
for (const rel of [
  "src/original/ui-hand-controls.js", "src/original/battle-action-prompt-bindings.js",
  "src/original/battle-response-ui.js", "src/original/app-battle-bindings.js",
  "src/original/battle-action-special-bindings.js", "src/original/ui-battle-pickers.js",
]) if (read(rel).includes("data-dimension-transfer-skip")) dtFiles.push(rel);
check("C1", "次元转移专用按钮只出现在提示条与其绑定两处", dtFiles.length === 2, { dtFiles });
const otherSkips = [...new Set((ui.match(/data-[a-z-]*(?:skip|cancel)[a-z-]*="1"/g) || []))];
check("C2", "其余技能各用各的 data-* 属性（≥9 种），未按次元转移那套统一",
  otherSkips.length >= 9, { n: otherSkips.length, attrs: otherSkips.slice(0, 14) });

// ── D. 同步 ──
const notice = read("src/original/update-notice-recent.js");
const settings = read("docs/original/game-settings.md");
check("D1", "公告写明前缀统一与跳过入口复查",
  notice.includes("全库 19 个🔵技能公开描述统一补齐") && notice.includes("没有缺失")
  && notice.split("\n").length <= 150, { lines: notice.split("\n").length });
check("D2", "设定契约写明 🔵 文案口径与三类跳过入口",
  settings.includes("所有带 `🔵` 图标的技能") && settings.includes("不强行复用次元转移"));

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = {
    prefix: ["A2"], skip: ["B1"], panel: ["B2"], notice: ["D1"],
    guard: ["B1", "B5"], relic: ["A4"], lock: ["A4", "A6"], panelBack: ["A7"],
  }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
