// 【反击类触发口径】统一护栏（306 版）。
//
// 规则：纳入统一口径的 6 类反击技能只由【杀】牌触发，且实体杀 / 虚拟杀都算；
// 战术牌、纯技能伤害载荷（type:"skill"，即便名字带「杀」）、状态 DOT 一律不触发；
// 反击自身生成的虚拟杀打 counterattack 标记，不二次触发其它反击。
// 例外：【心血之咒】【以牙还牙】按需求回原版口径，不接统一判据（B5/B6 专职守住）。
//
// 正向：node tools/check-counterattack-triggers.js
// 反向：REVERT=module|revenge|manny|besta|machine|hitwell|bondi|mona|umbrella|chain|mark|doc
//       node tools/check-counterattack-triggers.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const SRC = "src/original/";
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const M = SRC + "battle-counterattack-rules.js";
  if (REVERT === "module" && rel === M) {
    t = t.replace("    if (!U || !card || card.type === \"skill\") return false;",
      "    if (!U || !card) return false;", 1)
      .replace("    if (card.counterattack || card.revengeCounter || card.mannyCounter) return false;\n", "", 1);
  }
  if (REVERT === "revenge" && rel === SRC + "bertis-gerlot-skills.js") {
    t = t.replace("  const hasTargetLine = c => !!window.BattleCounterattackRules?.isSingleTriggerCard?.(c);",
      "  const hasTargetLine = c => isKill(c) && !c?.virtual && !c?.sweep && !c?.targetless;", 1);
  }
  if (REVERT === "manny" && rel === SRC + "manny-skills.js") {
    t = t.replace("      && !card?.mannyCounter && window.BattleCounterattackRules?.isSingleTriggerCard?.(card)) {",
      "      && !card?.mannyCounter) {", 1);
  }
  if (REVERT === "besta" && rel === SRC + "guest-characters-skills.js") {
    t = t.replace("      || !window.BattleCounterattackRules?.isTriggerCard?.(card)) return;", ") return;", 1);
  }
  if (REVERT === "machine" && rel === SRC + "machine-factory-skills.js") {
    t = t.replace("      || !window.BattleCounterattackRules?.isTriggerCard?.(damageCard)) return;", ") return;", 1);
  }
  if (REVERT === "hitwell" && rel === SRC + "hitwell-skills.js") {
    // 反向：把回原版的判据改回 306 统一判据，B5 应打红。
    t = t.replace("    if (!window.CardUtils?.isEntityOrVirtualCard?.(card)) return;",
      "    if (!window.BattleCounterattackRules?.isTriggerCard?.(card)) return;", 1);
  }
  if (REVERT === "bondi" && rel === SRC + "bondi-skills.js") {
    // 反向：把回原版的单条件守门改回 306 统一判据，B6 应打红。
    t = t.replace("    if (!hpLoss || target?.ai !== \"orc_king_bondi\"",
      "    if (!window.BattleCounterattackRules?.isTriggerCard?.(card)\n      || !hpLoss || target?.ai !== \"orc_king_bondi\"", 1);
  }
  if (REVERT === "mona" && rel === SRC + "underwater-train-target-counters.js") {
    t = t.replace("    if (!window.BattleCounterattackRules?.isSingleTriggerCard?.(incoming)) return;",
      "    if (!window.CardUtils.isEntitySingleKill(incoming)) return;", 1);
  }
  if (REVERT === "umbrella" && rel === SRC + "sakura-risa-combat-skills.js") {
    t = t.replace("    if (!window.BattleCounterattackRules?.isTriggerCard?.(threat)) return;\n", "", 1);
  }
  if (REVERT === "chain" && rel === SRC + "battle-dodge-cards.js") {
    t = t.replace("{ ...deps, responseTo: threat }", "deps", 1);
  }
  if (REVERT === "mark" && rel === SRC + "gerlot-revenge-skills.js") {
    t = t.replaceAll(", counterattack: true", "", 1);
  }
  if (REVERT === "doc" && rel === SRC + "data-characters-extra.js") {
    t = t.replace("当你成为单体【杀】（实体或虚拟）的目标并使用【闪】后",
      "当你成为实体单体【杀】的目标并使用【闪】后", 1);
  }
  return t;
};
const codeOnly = t => t.split("\n")
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ── A. 统一模块与装配 ──
const mod = read(SRC + "battle-counterattack-rules.js");
check("A0", "模块存在、全局名正确、行数未超硬约束、判据排除 skill 载荷且防反击自生成杀",
  mod.includes("window.BattleCounterattackRules = (() => {")
  && mod.split("\n").length < 190
  && mod.includes('card.type === "skill"')
  && mod.includes("card.counterattack || card.revengeCounter || card.mannyCounter")
  && mod.includes("U.isEntityOrVirtualCard?.(card)"));
const manifest = JSON.parse(read("tools/publish-bundles.json"));
const groups = Object.values(manifest).flat();
const idxMod = groups.indexOf("battle-counterattack-rules.js");
const idxTriggers = groups.indexOf("battle-damage-triggers.js");
const idxFirstSkill = Math.min(...["manny-skills.js", "bertis-gerlot-skills.js",
  "machine-factory-skills.js", "hitwell-skills.js", "bondi-skills.js",
  "guest-characters-skills.js", "sakura-risa-combat-skills.js",
  "underwater-train-target-counters.js"].map(f => groups.indexOf(f)));
check("A1", "bundle 顺序：模块在战斗伤害中枢与全部 8 个反击技能模块之前",
  idxMod >= 0 && idxMod < idxTriggers && idxMod < idxFirstSkill,
  { idxMod, idxTriggers, idxFirstSkill });
check("A2", "runtime-globals / harness / fixtures 三处装配登记齐备",
  read(SRC + "runtime-globals.js").includes('"BattleCounterattackRules"')
  && read("tools/kaiichi-reaction-harness.js").includes("battle-counterattack-rules.js")
  && read("tools/skill-coverage-fixtures.js").includes("battle-counterattack-rules.js"));

// ── B. 6 个触发点 + 2 个回原版例外 ──
const points = [
  ["B1", "复仇反击 / 贝尔蒂丝受伤反击", "bertis-gerlot-skills.js",
    "isSingleTriggerCard", "card?.counterattack"],
  ["B2", "刺刀AK47", "manny-skills.js", "isSingleTriggerCard", "mannyCounter: true, counterattack: true"],
  ["B3", "终焉回旋斩", "guest-characters-skills.js", "isTriggerCard", ""],
  ["B4", "电磁反制装置", "machine-factory-skills.js", "isTriggerCard?.(damageCard)", ""],
  ["B5", "心血之咒（回原版）", "hitwell-skills.js", "isEntityOrVirtualCard?.(card)", "", true],
  ["B6", "以牙还牙（回原版）", "bondi-skills.js", 'if (!hpLoss || target?.ai !== "orc_king_bondi"', "", true],
  ["B7", "剑盾反攻", "underwater-train-target-counters.js", "isSingleTriggerCard", "counterattack: true"],
  ["B8", "血色刺伞", "sakura-risa-combat-skills.js", "isTriggerCard?.(threat)", ""],
];
for (const [id, name, file, needle, mark, legacy] of points) {
  const t = codeOnly(read(SRC + file));
  let ok = legacy
    ? t.includes(needle) && !t.includes("BattleCounterattackRules")
    : t.includes("BattleCounterattackRules") && t.includes(needle);
  if (mark) ok = ok && t.includes(mark);
  if (file === "bertis-gerlot-skills.js") {
    ok = ok && (t.match(/card\?\.counterattack/g) || []).length >= 2;
  }
  check(id, `${name}：调用统一判据${mark ? " + 反击虚拟杀打 counterattack 标记" : ""}`, ok,
    { file, needle, mark });
}
check("B9", "响应链把触发源传给血色刺伞：afterDodged / 闪避 play / 护驾 / 神速之翼 / 看破分支",
  codeOnly(read(SRC + "battle-damage-triggers.js")).includes("triggerCard: card")
  && codeOnly(read(SRC + "battle-dodge-cards.js")).includes("responseTo: threat")
  && codeOnly(read(SRC + "guest-ophelia-guard.js")).includes("responseTo: card")
  && codeOnly(read(SRC + "battle-damage-resolution.js")).includes("responseTo: effectiveCard")
  && (codeOnly(read(SRC + "battle-card-counter-interactions.js")).match(/triggerCard: card/g) || []).length === 2
  && (codeOnly(read(SRC + "battle-combat-responses.js")).match(/triggerCard: p\.card/g) || []).length === 2);
check("B10", "反击执行体虚拟杀统一防连锁：复仇反击两处 / 刺刀AK47 / 剑盾反攻",
  (read(SRC + "gerlot-revenge-skills.js").match(/counterattack: true/g) || []).length === 2
  && read(SRC + "manny-skills.js").includes("mannyCounter: true, counterattack: true")
  && read(SRC + "underwater-train-target-counters.js").includes("counterattack: true"));

// ── C. 描述与记忆同步（新技能也靠这些文档口径） ──
const extra = read(SRC + "data-characters-extra.js");
const bondi = read(SRC + "data-orc-bondi.js");
const mona = read(SRC + "data-underwater-train-enemies.js");
const machine = read(SRC + "data-machine-factory-enemies.js");
const future = read(SRC + "data-future-relics.js");
const doc03 = read("docs/03-角色与角色技能.txt");
const doc05 = read("docs/05-怪物与怪物技能与饰品.txt");
const settings = read("docs/original/game-settings.md");
const notice = read(SRC + "update-notice-recent.js");
const agents = read(".ohmyagent/AGENTS.md");
const diary = read("docs/开发日记.md");
const qa = read("tools/qa-test-catalog.js");
check("C1", "公开描述全部同步为「实体杀或虚拟杀」：复仇反击 / 心血之咒 / 终焉回旋斩 / 剑盾反攻 / 以牙还牙 / 电磁反制 / 血色刺伞",
  extra.includes("单体【杀】（实体或虚拟）的目标")
  && extra.includes("受到实体牌或虚拟牌造成的伤害后")
  && extra.includes("抵消实体或虚拟【杀】后")
  && mona.includes("单体【杀】（实体或虚拟）")
  && bondi.includes("受到实体牌伤害后")
  && machine.includes("仅由【杀】（实体或虚拟）触发")
  && future.includes("为响应实体或虚拟【杀】")
  && doc03.includes("改由实体或虚拟单体【杀】触发")
  && doc05.includes("单体【杀】（实体或虚拟）的目标")
  && doc05.includes("为响应实体或虚拟【杀】")
  && !settings.includes("306 unified counterattack rule")
  && settings.includes("按需求回原版口径")
  && doc05.includes("当你受到实体牌伤害后"));
check("C4", "心血之咒 / 以牙还牙 回原版：公告与 AGENTS 写明例外、名单只剩 6 处",
  notice.includes("【心血之咒】【以牙还牙】按需求回原版口径")
  && notice.includes("六处统一走")
  && !notice.includes("【电磁反制装置】【心血之咒】")
  && agents.includes("6 个触发点")
  && agents.includes("不接统一判据")
  && diary.includes("按用户要求回原版"));
check("C2", "公告 149 行未增行且写明统一口径；AGENTS / 开发日记 / QA 登记齐备",
  notice.trimEnd().split(/\r?\n/).length === 149
  && notice.includes("反击类触发口径统一")
  && agents.includes("反击类触发口径")
  && diary.includes("反击类触发口径统一")
  && qa.includes("check-counterattack-triggers.js")
  && qa.includes("test-counterattack-triggers-live.js"));
check("C3", "静态护栏 + 实机脚本都落盘且实机含 RESULT",
  fs.existsSync(path.join(ROOT, "tools/test-counterattack-triggers-live.js"))
  && read("tools/test-counterattack-triggers-live.js").includes("RESULT"));

// ── D. vm 真实模块：触发矩阵 ──
try {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read(SRC + "card-utils.js"), ctx, { filename: "card-utils.js" });
  vm.runInContext(read(SRC + "battle-counterattack-rules.js"), ctx,
    { filename: "battle-counterattack-rules.js" });
  const R = ctx.BattleCounterattackRules;
  const entity = { name: "杀（普攻）", type: "slash", suit: "♠" };
  const cases = [
    ["实体单体杀", { ...entity }, true, true],
    ["实体杀带转换标记", { ...entity, convertedFrom: "刺杀", _entityConversion: true }, true, true],
    ["虚拟单体杀", { ...entity, virtual: true }, true, true],
    ["虚拟群体杀", { ...entity, virtual: true, sweep: true }, true, false],
    ["实体群体杀", { ...entity, allTargets: true }, true, false],
    ["战术牌", { name: "魔弹特攻", type: "tactic" }, false, false],
    ["技能伤害载荷（名字带杀）", { name: "锁魂杀", type: "skill" }, false, false],
    ["状态 DOT", { name: "燃烧", type: "skill", burningTick: true }, false, false],
    ["技能生成非虚拟杀", { ...entity, generatedBySkill: "偷袭" }, false, false],
    ["反击生成虚拟杀", { ...entity, virtual: true, counterattack: true }, false, false],
    ["复仇反击生成虚拟杀", { ...entity, virtual: true, revengeCounter: true }, false, false],
    ["刺刀AK47生成虚拟杀", { ...entity, virtual: true, mannyCounter: true }, false, false],
    ["无牌", null, false, false],
    ["空对象", {}, false, false],
  ];
  const bad = [];
  for (const [label, card, want, wantSingle] of cases) {
    const got = R.isTriggerCard(card), gotSingle = R.isSingleTriggerCard(card);
    if (got !== want || gotSingle !== wantSingle) bad.push({ label, got, want, gotSingle, wantSingle });
  }
  check("D1", `vm 真实 CardUtils + 模块：${cases.length} 类伤害载荷矩阵全部符合口径`,
    bad.length === 0, bad);
  const marked = R.markCounterCard({ ...entity, virtual: true }, { revengeCounter: true });
  check("D2", "vm：markCounterCard 打统一标记后不再触发（防 A→B→A 连锁）",
    marked.counterattack === true && marked.revengeCounter === true
    && R.isTriggerCard(marked) === false);
} catch (e) {
  check("D0", "vm 装配未抛异常", false, { error: String(e).slice(0, 220) });
}

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  process.exit(red.length ? 1 : 0);
}
const EXPECT = {
  module: ["A0", "D1", "D2"], revenge: ["B1"], manny: ["B2"], besta: ["B3"],
  machine: ["B4"], hitwell: ["B5"], bondi: ["B6"], mona: ["B7"],
  umbrella: ["B8"], chain: ["B9"], mark: ["B10"], doc: ["C1"],
}[REVERT] || [];
const same = JSON.stringify(red) === JSON.stringify(EXPECT);
console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
process.exit(same ? 0 : 1);
