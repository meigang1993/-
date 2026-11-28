// 【饰品非锁定技】跳过按键 + 「不发动不显示使用了」专项护栏。
//
// 背景：294~297 修过「非锁定技不发动也播台词 / 显示『你发动了』」BUG，
// 但既有护栏 check-nonlocked-prompt-caption.js 的 vm sandbox 写死
// `isActive: () => false`，从未覆盖 showRelicCaption 的「使用了」字幕分支
// （isActive=true，文案 `${unit.name} 使用了 ${name}`）。本护栏用真实
// RelicSystem.isActive=true 逐件验证：所有「不发动」日志零字幕，
// 真发动才显示；并反向注入证明守门是唯一防线。
//
// 正向：node tools/check-relic-nonlocked-skip.js
// 反向：REVERT=guard|skipBinding|cancelBinding|resolver|isActiveFalse|css
//       node tools/check-relic-nonlocked-skip.js
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
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const read = rel => {
  let t = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (REVERT === "guard" && rel === SRC + "battle-log.js") {
    t = t.replace("if (NOT_ACTIVATED.test(text) || SKIPPED_SKILL.test(text)) return;", "", 1);
  }
  if (REVERT === "skipBinding" && rel === SRC + "app-battle-bindings.js") {
    t = t.replace('bindCounterTrigger("[data-counter-trigger-skip]", false, "非锁定技跳过失败");', "", 1);
  }
  if (REVERT === "cancelBinding" && rel === SRC + "app-battle-bindings.js") {
    t = t.replace('document.querySelector("[data-cancel-hammer]")?.addEventListener',
      'document.querySelector("[data-cancel-hammer-DISABLED]")?.addEventListener', 1);
  }
  if (REVERT === "resolver" && rel === SRC + "battle-counter-triggers.js") {
    t = t.replace(/"血色刺伞": \(\) => window\.SakuraRisaSkills\?\.resolveUmbrellaTrigger\?\.\(state, source, api\),/, "", 1);
  }
  if (REVERT === "isActiveFalse" && rel === "tools/check-nonlocked-prompt-caption.js") {
    t = t.replace("isActive: () => true", "isActive: () => false", 1);
  }
  return t;
};

// ── A. 全库饰品枚举（3 数据源，vm 真实加载，不写死名字清单） ──
const FILES = [SRC + "data-relics.js", SRC + "data-ruins-content.js", SRC + "data-future-relics.js"];
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(read(f), ctx, { filename: f });
const pools = [
  ["data-relics.js", ctx.GameDataRelics],
  ["data-ruins-content.js", ctx.GameDataRuinsContent?.relics],
  ["data-future-relics.js", ctx.GameDataFutureRelics],
];
const seen = new Set(), relics = [];
for (const [file, pool] of pools) {
  for (const [name, d] of Object.entries(pool || {})) {
    if (!d || typeof d !== "object" || !d.effect || seen.has(name)) continue;
    seen.add(name);
    relics.push({ name, file, d,
      icon: d.activeCard ? "⚔️" : d.skillType === "trigger" ? "🔵" : "⭐" });
  }
}
const blue = relics.filter(r => r.icon === "🔵");
const active = relics.filter(r => r.icon === "⚔️");
check("A0", `3 数据源共 ${relics.length} 件饰品，🔵 非锁定技 ${blue.length} 件 / ⚔️ 主动技 ${active.length} 件 / ⭐ 锁定技 ${relics.length - blue.length - active.length} 件`,
  relics.length === 40 && blue.length === 2 && active.length === 6
  && pools.every(([, p]) => p && Object.keys(p).length > 0),
  { total: relics.length, blue: blue.map(r => r.name) });

// ── B. 每件 🔵 饰品都必须有可点击的跳过/放弃入口 ──
const controls = read(SRC + "ui-hand-controls.js");
const bindings = read(SRC + "app-battle-bindings.js");
const counter = read(SRC + "battle-counter-triggers.js");
const responseUI = read(SRC + "battle-response-ui.js");

// 通用反击面板：名字出现在 resolvers 里，且「跳过」按钮渲染 + 绑定齐全
function genericSkip(name) {
  const inResolvers = new RegExp(`"${esc(name)}"\\s*:\\s*\\(\\)`).test(counter);
  return inResolvers
    && responseUI.includes('data-counter-trigger-skip="1"')
    && responseUI.includes('data-counter-trigger-use="1"')
    && bindings.includes('bindCounterTrigger("[data-counter-trigger-skip]", false');
}
// 专属提示条：名字出现在某个 modes 分支，该分支含 data-*skip / data-cancel-* 按钮，
// 且对应属性在绑定文件里有处理器
function dedicatedSkip(name) {
  // split 后每个 block 已经是「一个 modes 分支到下一个分支之前」的完整内容；
  // 饰品名与 data-* 按钮都在 return 的模板串里，不能只取 return 之前。
  const blocks = controls.split(/if \(modes\./).slice(1);
  return blocks.some(block => {
    if (!block.includes(name)) return false;
    const attrs = [...block.matchAll(/data-([a-z0-9-]*(?:skip|cancel)[a-z0-9-]*)="1"/g)].map(m => m[1]);
    if (!attrs.length) return false;
    return attrs.some(a => bindings.includes(`[data-${a}]`));
  });
}
const skipReport = blue.map(r => ({
  name: r.name,
  generic: genericSkip(r.name),
  dedicated: dedicatedSkip(r.name),
}));
check("A1", `${blue.length} 件 🔵 非锁定技饰品逐件都有跳过入口（通用面板「跳过」或专属「放弃发动」+ 绑定齐备）`,
  skipReport.every(x => x.generic || x.dedicated), skipReport);
check("A2", "两类跳过按钮本身都在位：data-counter-trigger-skip 与 data-cancel-hammer",
  responseUI.includes('data-counter-trigger-skip="1">跳过')
  && controls.includes('data-cancel-hammer="1">放弃发动')
  && bindings.includes('bindCounterTrigger("[data-counter-trigger-skip]", false')
  && bindings.includes('document.querySelector("[data-cancel-hammer]")?.addEventListener'));

// ── C. 「使用了」字幕分支的守门 ──
const logSrc = read(SRC + "battle-log.js");
const captionSrc = read(SRC + "battle-caption-controller.js");
const oldGuard = read("tools/check-nonlocked-prompt-caption.js");
check("A3", "BattleLog.maybeRelicCaption 两道守门在位（NOT_ACTIVATED 6 类 + SKIPPED_SKILL 无逗号短句）",
  /if \(NOT_ACTIVATED\.test\(text\) \|\| SKIPPED_SKILL\.test\(text\)\) return;/.test(logSrc)
  && ["可发动", "放弃发动", "不发动", "请选择", "发动[^，。]*失败", "未能发动"]
    .every(k => logSrc.includes(k))
  && /const SKIPPED_SKILL = \/\^\[\^，。\]\{1,30\}跳过/.test(logSrc));
check("A4", "showRelicCaption 存在「使用了」分支（isActive=true 的主动技饰品字幕文案）",
  captionSrc.includes('? "使用了" : "触发了";')
  && captionSrc.includes("${unit.name} ${action} ${name}"));
check("A5", "既有台词护栏已把 vm sandbox 的 isActive 改为真实可切换（不再写死 false，覆盖「使用了」分支）",
  oldGuard.includes("isActive: () => true")
  && !/isActive:\s*\(\)\s*=>\s*false/.test(oldGuard));

// ── D. vm 真实模块：isActive=true 下「不发动」零字幕、真发动有字幕 ──
function sandbox(noGuard = false) {
  const c = {
    console, Math, Object, Array, String, Number, Boolean, JSON, Error, Promise,
    Map, Set, WeakMap, clearTimeout: () => {}, setTimeout: () => 0,
    queueMicrotask: fn => { try { fn(); } catch (e) {} },
    GameRandom: { id: () => "cap1" }, render: () => {}, window: null,
    // 关键：isActive=true 让字幕走「使用了」分支（既有护栏从未覆盖）
    RelicSystem: { isKnown: () => true, isActive: () => true },
    BattleSpeechController: () => ({
      showSkillPages: (st, items) => { st.__speech = items.map(x => x.text); },
      show() {}, showMany() {}, showPages() {}, cancel() {}, dismiss() {},
    }),
  };
  c.window = c;
  vm.createContext(c);
  const logPatch = noGuard
    ? t => t.replace("if (NOT_ACTIVATED.test(text) || SKIPPED_SKILL.test(text)) return;", "")
    : null;
  let logText = read(SRC + "battle-log.js");
  if (logPatch) logText = logPatch(logText);
  vm.runInContext(logText, c, { filename: "battle-log.js" });
  vm.runInContext(read(SRC + "battle-caption-controller.js"), c,
    { filename: "battle-caption-controller.js" });
  c.BattleLines = c.BattleCaptionController({
    duration: 6000, lineOf: () => "", hasSkill: () => true,
    speech: c.BattleSpeechController({}),
  });
  return c;
}
// 所有「不发动」措辞（含通用面板跳过、发动失败、放弃发动），对每件 🔵 / ⚔️ 饰品逐条跑
const NOT_LAUNCH = name => [
  `曼妮 的${name}可发动：选择一张手牌弃置。`,
  `曼妮 可以发动${name}。`,
  `曼妮 放弃发动${name}。`,
  `曼妮跳过${name}。`,
  `曼妮 发动${name}失败：没有满足条件的牌。`,
  `曼妮 的${name}未能发动。`,
];
function captionsOf(st) {
  return [...(st.battle.relicCaptions || []).map(x => x.text),
    ...(st.battle.skillCaptions || []).map(x => x.text)];
}
try {
  const c = sandbox(false);
  const bad = [];
  for (const r of [...blue, ...active]) {
    const unit = { uid: "u1", name: "曼妮", side: "ally", battleRelics: [r.name] };
    for (const text of NOT_LAUNCH(r.name)) {
      const st = { battle: { allies: [unit], enemies: [], animQueue: [] },
        battleLog: [], log: [], equipment: {} };
      c.window.state = st;
      c.BattleLog.add(st, text);
      const caps = captionsOf(st);
      if (caps.some(x => /使用了|触发了|发动了/.test(x)) || st.__speech) {
        bad.push({ name: r.name, text, caps, speech: st.__speech });
      }
    }
  }
  check("B1", `vm 真实模块 isActive=true：${blue.length + active.length} 件可选饰品 × 6 类「不发动」日志，0 处「使用了/触发了/发动了」字幕、0 处台词`,
    bad.length === 0, bad.slice(0, 4));
  // 正向：真发动仍显示「使用了」字幕（守门没有误杀）
  const unit = { uid: "u1", name: "曼妮", side: "ally", battleRelics: ["霹雳之锤"] };
  const st = { battle: { allies: [unit], enemies: [], animQueue: [] },
    battleLog: [], log: [], equipment: {} };
  c.window.state = st;
  c.BattleLog.add(st, "曼妮 的霹雳之锤触发，该杀强制造成伤害。");
  check("B2", "vm 正向：真发动日志仍显示「曼妮 使用了 霹雳之锤」字幕（守门未误杀）",
    captionsOf(st).some(x => x.includes("使用了") && x.includes("霹雳之锤")),
    captionsOf(st));
  // 反向对照：去掉守门，同样的「不发动」日志应立刻产生「使用了」字幕
  const c2 = sandbox(true);
  const wrong = [];
  for (const r of blue) {
    const u = { uid: "u1", name: "曼妮", side: "ally", battleRelics: [r.name] };
    for (const text of NOT_LAUNCH(r.name).slice(0, 4)) {
      const s = { battle: { allies: [u], enemies: [], animQueue: [] },
        battleLog: [], log: [], equipment: {} };
      c2.window.state = s;
      c2.BattleLog.add(s, text);
      if (!captionsOf(s).some(x => x.includes("使用了") && x.includes(r.name))) {
        wrong.push({ name: r.name, text });
      }
    }
  }
  check("B3", "反向对照：去掉守门后，🔵 饰品的「不发动」日志会立刻复现「使用了 XX」字幕（证明守门是唯一防线）",
    wrong.length === 0, wrong.slice(0, 4));
} catch (e) {
  check("B0", "vm 装配未抛异常", false, { error: String(e).slice(0, 220) });
}

// ── E. 配套实机、记忆、QA 登记 ──
const qa = read("tools/qa-test-catalog.js");
const agents = read(".ohmyagent/AGENTS.md");
const settings = read("docs/original/game-settings.md");
check("A6", "专项实机 + QA 登记 + AGENTS / 设定契约记录齐备",
  fs.existsSync(path.join(ROOT, "tools/test-relic-nonlocked-skip-live.js"))
  && qa.includes("check-relic-nonlocked-skip.js")
  && qa.includes("test-relic-nonlocked-skip-live.js")
  && agents.includes("饰品非锁定技跳过")
  && settings.includes("饰品非锁定技跳过"));

const red = results.filter(r => !r.ok).map(r => r.id);
console.log(`\nREVERT=${REVERT || "none"} RED=${JSON.stringify(red)}`);
if (!REVERT) {
  console.log(`RESULT ${results.length - red.length}/${results.length}`);
  process.exit(red.length ? 1 : 0);
}
const EXPECT = {
  guard: ["A3", "B1"], skipBinding: ["A1", "A2"], cancelBinding: ["A1", "A2"],
  resolver: ["A1"], isActiveFalse: ["A5"],
}[REVERT] || [];
const same = JSON.stringify(red) === JSON.stringify(EXPECT);
console.log(`EXPECTED=${JSON.stringify(EXPECT)} ${same ? "PRECISE_OK" : "PRECISE_FAIL"}`);
process.exit(same ? 0 : 1);
