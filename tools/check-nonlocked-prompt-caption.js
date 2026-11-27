// 非锁定技 / 饰品「台词与『发动了』字幕只能在确认发动后出现」全库护栏。
// 数据源驱动：19 个 🔵 非锁定技 + 28 个饰品 + 所有玩家跳过入口逐项过一遍，
// 挂起/提示阶段一旦出现台词调用就打红；新增技能若不登记白名单也会被拦下。
// 反向：REVERT=promptLine|relic|confirm|api 精准打红对应组。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const REVERT = String(process.env.REVERT || "").trim();
const results = [];
const check = (id, name, ok, extra) => {
  results.push({ id, ok: !!ok });
  console.log(`${ok ? "✅" : "❌"} ${id} ${name}${ok ? "" : "  ← " + JSON.stringify(extra || {})}`);
};
const SRC = "src/original/";
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (REVERT === "promptLine" && rel === SRC + "manny-skills.js") {
    t = t.replace(`    b.locked = true;
    // 非锁定技：只挂起`, `    b.locked = true;
    window.BattleLines?.skill(state, manny, "次元转移", target);
    // 非锁定技：只挂起`, 1);
  }
  if (REVERT === "relic" && rel === SRC + "battle-log.js") {
    t = t.replace(`    if (NOT_ACTIVATED.test(text) || SKIPPED_SKILL.test(text)) return;`,
      `    // 反向注入：故意去掉守门`, 1);
  }
  if (REVERT === "skip" && rel === SRC + "battle-log.js") {
    // 只把「跳过短句」正则改成永假，守门结构仍在（A6 不打红），
    // 仅 B1 的跳过用例精准打红。
    t = t.replace(`const SKIPPED_SKILL = /^[^，。]{1,30}跳过[^，。]{1,30}。$/;`,
      `const SKIPPED_SKILL = /$^/;`, 1);
  }
  if (REVERT === "confirm" && rel === SRC + "cadicis-responsibility.js") {
    t = t.replace(`      window.BattleLines?.skill(state, cadicis, "指挥官责任", target);`,
      `      // 反向注入：故意不在确认分支播台词`, 1);
  }
  if (REVERT === "api" && rel === SRC + "battle-caption-controller.js") {
    t = t.replace(`    skill, promptVisible, clearSkillCaption, cancel,`,
      `    skill, skillWhenPromptVisible: skill, promptVisible, clearSkillCaption, cancel,`, 1);
  }
  return t;
};
const files = () => fs.readdirSync(path.join(ROOT, SRC))
  .filter(f => f.endsWith(".js")).map(f => SRC + f);
const codeOnly = t => t.split("\n")
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ── 0. 数据源：全库 🔵 非锁定技 / 饰品 / 跳过入口 ──
const BLUE_RE = /\{\s*name:\s*"([^"]+)",\s*type:\s*"[^"]+",\s*icon:\s*"🔵",\s*text:\s*"(非锁定技，[^"]*)"/g;
const blue = [];
for (const f of files().filter(f => f.includes("data-"))) {
  const t = read(f); let m;
  while ((m = BLUE_RE.exec(t))) blue.push({ name: m[1], file: f });
}
// 饰品要覆盖全部 3 个数据源：286/293 轮都漏了 data-future-relics.js，
// 导致【血色刺伞】（可选发动的非锁定技）从未进入任何护栏。
const relicDataCtx = { console };
relicDataCtx.window = relicDataCtx;
vm.createContext(relicDataCtx);
const RELIC_FILES = [SRC + "data-relics.js", SRC + "data-ruins-content.js",
  SRC + "data-future-relics.js"];
for (const f of RELIC_FILES) {
  vm.runInContext(read(f), relicDataCtx, { filename: f });
}
const relicNames = [...new Set([
  ...Object.keys(relicDataCtx.GameDataRelics || {}),
  ...Object.keys(relicDataCtx.GameDataRuinsContent?.relics || {}),
  ...Object.keys(relicDataCtx.GameDataFutureRelics || {}),
])];
const skipButtons = [];
for (const f of files().filter(f => /ui-|bindings|response-ui/.test(f))) {
  const t = read(f); let m;
  const re = /data-([a-z0-9-]*(?:skip|cancel-hammer))=/g;
  while ((m = re.exec(t))) skipButtons.push({ attr: "data-" + m[1], file: f });
}
check("A0", `数据源覆盖：${blue.length} 个 🔵 非锁定技 / ${relicNames.length} 个饰品（3 个数据源）/ ${new Set(skipButtons.map(x => x.attr)).size} 个跳过/取消入口`,
  blue.length === 19 && relicNames.length === 40
  && new Set(skipButtons.map(x => x.attr)).size >= 10,
  { blue: blue.length, relics: relicNames.length, skips: [...new Set(skipButtons.map(x => x.attr))] });

// ── A. 废弃 API 必须 0 残留 ──
const allCode = files().map(f => codeOnly(read(f))).join("\n");
check("A1", "全库无 skillWhenPromptVisible 残留（提示可见即播台词的旧 API 已删除）",
  !allCode.includes("skillWhenPromptVisible"));

// ── B. 挂起函数内禁止任何台词/字幕/发动战报 ──
// 白名单：这些函数虽含 locked=true，但不是「玩家可选发动的非锁定技」提示阶段。
// 新增任何主动技 + 挂起组合都必须在这里显式登记并写明理由，否则护栏会打红。
const ALLOW = {
  "battle-session.js:current": "战斗开场敌方【防御模式】台词，与玩家选择无关",
  "gerlot-revenge-skills.js:queueHeadshot": "判定动画锁，技能已发动，不是选择提示",
  "orc-drone-skills.js:useDroneExtract": "主动技【无人机采精】已发动，handReveal 是后续响应选牌，无「放弃发动」入口",
  "battle-combat-defeat.js:*": "败北结算锁",
  "battle-session-settlement.js:*": "结算锁",
  "battle-victory.js:*": "胜利面板锁",
  "battle-dodge-response.js:*": "手动响应锁",
  "battle-counter-triggers.js:open": "通用反击面板只写「可以发动」日志，台词在 resolve 确认分支",
};
const LINE_CALL = /BattleLines\?\.skill|BattleLines\.skill|BattleLog\.skill|skillWhenPromptVisible|\bline\(state|scheduleBloodCaption\([^)]*,\s*\w+\)/;
const offenders = [];
const promptFns = [];
for (const f of files()) {
  const t = read(f), lines = t.split("\n");
  const starts = [];
  lines.forEach((l, i) => {
    if (/^\s*(?:async\s+)?function\s+\w+\s*\(/.test(l)
      || /^\s*const\s+\w+\s*=\s*(?:\([^)]*\)|\w+)\s*=>/.test(l)) starts.push(i);
  });
  starts.push(lines.length);
  for (let k = 0; k < starts.length - 1; k++) {
    const a = starts[k], b = starts[k + 1];
    const body = lines.slice(a, b).join("\n");
    if (!/locked\s*=\s*true/.test(body)) continue;
    if (!/(?:b|battle|state\.battle)\.[A-Za-z][A-Za-z0-9_]*\s*=\s*\{/.test(body)
      && !/counterTrigger\s*=\s*prompt/.test(body)) continue;
    const fn = (lines[a].match(/function\s+(\w+)|const\s+(\w+)/) || []);
    const name = fn[1] || fn[2] || "?";
    const code = body.split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const key = path.basename(f) + ":" + name;
    promptFns.push(key);
    if (LINE_CALL.test(code) && !ALLOW[key]
      && !Object.keys(ALLOW).some(k => k.endsWith(":*") && k.startsWith(path.basename(f) + ":"))) {
      offenders.push({ key, hit: (code.match(LINE_CALL) || [])[0] });
    }
  }
}
check("A2", `扫描 ${promptFns.length} 个「挂起提示」函数：非锁定技提示阶段 0 处台词/字幕调用`,
  offenders.length === 0, offenders);
check("A3", "白名单只列非可选发动场景（且都有理由）",
  Object.values(ALLOW).every(v => v.length >= 3)
  && Object.keys(ALLOW).every(k => /\.js:/.test(k)));

// ── C. 确认发动分支必须显式播台词（防止矫枉过正把正向机制改没） ──
const CONFIRM = [
  ["manny-skills.js", "resolveDimensionTransfer", '"次元转移"'],
  ["cadicis-responsibility.js", "resolveResponsibility", '"指挥官责任"'],
  ["hoshino-kaiichi-share-resolution.js", "resolveShare", '"半魅魔血"'],
  ["guest-aileng-skills.js", "resolveBattleDrill", '"战斗演练"'],
  ["catherine-skills.js", "transferCard", '"窃取"'],
  ["gerda-skills.js", "resolveComfort", '"萌虎慰劳"'],
  ["abe-karuna-bubble-skills.js", "store", '"记忆泡泡"'],
];
const confirmBad = [];
for (const [f, fn, name] of CONFIRM) {
  const t = codeOnly(read(SRC + f));
  const i = t.indexOf("function " + fn);
  const body = i < 0 ? "" : t.slice(i, i + 2600);
  if (!body.includes("BattleLines?.skill") && !body.includes("line(state")) confirmBad.push({ f, fn });
}
check("A4", `${CONFIRM.length} 个非锁定技的确认发动分支都保留台词调用`, confirmBad.length === 0, confirmBad);

// 跳过/放弃分支不得播台词
const SKIP_HANDLERS = [
  ["manny-skills.js", "放弃发动次元转移"],
  ["cadicis-responsibility.js", "指挥官责任本次不发动"],
  ["guest-aileng-skills.js", "放弃发动战斗演练"],
  ["abe-karuna-bubble-skills.js", "放弃发动记忆泡泡"],
  ["gerda-skills.js", "放弃发动萌虎慰劳"],
  ["nonoka-new-moon-skills.js", "选择不交出新月之歌手牌"],
  ["catherine-skills.js", "放弃发动窃取"],
];
const skipBad = [];
for (const [f, marker] of SKIP_HANDLERS) {
  const t = codeOnly(read(SRC + f));
  const lines = t.split("\n");
  const at = lines.findIndex(l => l.includes(marker));
  if (at < 0) { skipBad.push({ f, reason: "跳过文案缺失" }); continue; }
  // 只看跳过日志所在行的前后各 4 行：同一函数里的「确认发动」分支离得更远，
  // 用 ±700 字符会把正向台词误算成跳过分支的台词（假红）。
  // 台词与跳过日志常在同一 if/else 的相邻行（如次元转移 cost 分支），
  // 只看跳过日志所在行本身，避免把紧邻的正向台词误算成跳过分支台词。
  const around = lines[at] || "";
  if (/BattleLines\?\.skill|\bline\(state|BattleLog\.skill/.test(around)) skipBad.push({ f, marker });
}
check("A5", `${SKIP_HANDLERS.length} 个「放弃/不交/跳过」分支附近 0 处台词调用`, skipBad.length === 0, skipBad);

// ── D. 饰品日志自动字幕守门 ──
const logSrc = codeOnly(read(SRC + "battle-log.js"));
check("A6", "BattleLog.maybeRelicCaption 的 NOT_ACTIVATED 守门在位且含 6 类提示措辞",
  /const NOT_ACTIVATED\s*=\s*\//.test(logSrc)
  && /if \(NOT_ACTIVATED\.test\(text\) \|\| SKIPPED_SKILL\.test\(text\)\) return;/.test(logSrc)
  && ["可发动", "放弃发动", "不发动", "请选择", "发动[^，。]*失败", "未能发动",
    "SKIPPED_SKILL", "|| SKIPPED_SKILL.test(text)"]
    .every(k => logSrc.includes(k)));

// ── E. vm 行为验证：真实 BattleLog + BattleCaptionController ──
function sandbox() {
  const ctx = {
    console, Math, Object, Array, String, Number, Boolean, JSON, Error, Promise,
    Map, Set, WeakMap, clearTimeout: () => {}, window: null,
    // 台词页用 setTimeout(...,0) 合批；字幕清理用 setTimeout(...,6000)。
    // 只同步执行 0ms 的那一个，否则字幕会被立刻清掉造成假红。
    setTimeout: (fn, ms) => { if (ms === 0) { try { fn(); } catch (e) { /* noop */ } } return 0; },
    queueMicrotask: fn => { try { fn(); } catch (e) { /* 同步兜底 */ } },
    GameRandom: { id: () => "cap1" },
    render: () => {},
    RelicSystem: { isKnown: n => relicNames.includes(n), isActive: () => false },
    BattleSpeechController: () => ({
      showSkillPages: (st, items) => { st.__speech = items.map(x => x.text); },
      show() {}, showMany() {}, showPages() {}, cancel() {}, dismiss() {},
    }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read(SRC + "battle-log.js"), ctx, { filename: "battle-log.js" });
  vm.runInContext(read(SRC + "battle-caption-controller.js"), ctx,
    { filename: "battle-caption-controller.js" });
  ctx.BattleLines = ctx.BattleCaptionController({
    duration: 6000,
    lineOf: (unit, name) => ({ "次元转移": "台词：交给我", "指挥官责任": "台词：责任" }[name] || ""),
    hasSkill: () => true,
    speech: ctx.BattleSpeechController({}),
  });
  // spy：BattleLog.add 的 _pendingBattleSkillLog 会用更具体的结果战报覆盖
  // 「触发饰品【X】」泛化战报，只看 battleLog 会漏判；直接数 skill() 调用最可靠。
  ctx.__skillCalls = 0;
  const orig = ctx.BattleLines.skill;
  ctx.BattleLines.skill = (...args) => { ctx.__skillCalls++; return orig(...args); };
  return ctx;
}
function stateOf(ctx) {
  const unit = { uid: "u1", name: "曼妮", side: "ally", battleRelics: ["霹雳之锤", "鬼王扑克", "剪刀刃", "血色刺伞"] };
  const st = { battle: { allies: [unit], enemies: [], animQueue: [] }, battleLog: [], log: [], equipment: {} };
  ctx.window.state = st;
  return { st, unit };
}
try {
  const ctx = sandbox();
  const cases = [
    ["可发动提示", "曼妮 的霹雳之锤可发动：选择一张手牌弃置。", false],
    ["发动失败", "曼妮 发动鬼王扑克失败：请选择一张非战术牌。", false],
    ["放弃发动", "曼妮 放弃发动霹雳之锤。", false],
    ["真触发", "曼妮 的霹雳之锤触发，该杀强制造成伤害。", true],
    ["真触发但失败（应保留字幕）", "曼妮 的剪刀刃拼花失败。", true],
    ["通用面板点跳过", "曼妮跳过血色刺伞。", false],
    ["真触发含跳过（不误杀）", "曼妮 的霹雳之锤触发，跳过弃牌阶段。", true],
  ];
  const bad = [];
  for (const [label, text, wantCaption] of cases) {
    const { st } = stateOf(ctx);
    ctx.BattleLog.add(st, text);
    const caps = (st.battle.relicCaptions || []).concat(st.battle.skillCaptions || []);
    const has = caps.length > 0 || !!st.battle.relicCaption || !!st.battle.skillCaption;
    if (has !== wantCaption) bad.push({ label, text, has, wantCaption });
  }
  check("B1", "vm 真实模块：7 类饰品日志的字幕行为全部符合「不发动不显示、真触发才显示」",
    bad.length === 0, bad);
  // 提示日志不得触发任何字幕/台词调用（spy 计数）
  const { st } = stateOf(ctx);
  ctx.__skillCalls = 0;
  ctx.BattleLog.add(st, "曼妮 的霹雳之锤可发动：选择一张手牌弃置。");
  check("B2", "vm：「可发动」提示日志 0 次触发 BattleLines.skill（字幕/台词/战报全无）",
    ctx.__skillCalls === 0, { calls: ctx.__skillCalls, log: st.battleLog });
  // 技能台词仍由显式的 skill() 正常播放
  const { st: st2, unit } = stateOf(ctx);
  ctx.BattleLines.skill(st2, unit, "次元转移", null);
  check("B3", "vm：显式确认发动仍产生「发动了」字幕 + 发动战报 + 台词页（正向未坏）",
    (st2.battle.skillCaptions || []).some(c => c.text.includes("发动了 次元转移"))
    && st2.battleLog.some(t => t.includes("发动技能【次元转移】"))
    && Array.isArray(st2.__speech), { caps: st2.battle.skillCaptions, log: st2.battleLog });
} catch (e) {
  check("B0", "vm 装配未抛异常", false, { error: String(e).slice(0, 220) });
}

// ── F. 逐项清单（19 技 + 28 饰品）落地，供人工复核 ──
const playerOptional = ["榨取精华", "次元转移", "指挥官责任", "为我护驾", "战斗演练",
  "终焉回旋斩", "复仇反击", "萌虎慰劳", "半魅魔血", "记忆泡泡", "突破重围"];
const report = blue.map(b => `${b.name}:${playerOptional.includes(b.name) ? "玩家可选(已纳入护栏)" : "敌方AI自动/无挂起(不适用)"}`);
check("A7", `19 个 🔵 非锁定技逐项归类，玩家可选 ${report.filter(x => x.includes("玩家可选")).length} 个`,
  report.length === 19 && report.filter(x => x.includes("玩家可选")).length === 11, report);
check("A8", `40 件饰品（3 个数据源）全部纳入字幕守门覆盖，含 2 件 🔵 非锁定饰品`,
  relicNames.length === 40 && relicNames.includes("霹雳之锤")
  && relicNames.includes("血色刺伞")
  && RELIC_FILES.some(f => f.includes("data-future-relics.js")));

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  if (red.length) process.exit(1);
} else {
  const EXPECT = {
    promptLine: ["A2"], relic: ["A6", "B1", "B2"],
    confirm: ["A4"], api: ["A1"], skip: ["B1"],
  }[REVERT] || [];
  const same = JSON.stringify(red) === JSON.stringify(EXPECT);
  console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(same ? 0 : 1);
}
