// 天日国鹰7研究所 · 解锁事件按键静态严格检查（255 版）
// 覆盖：ADV 对话框按钮生成 → 事件委托绑定 → 关闭/完成映射 → ServerCore 解锁 → 视图登记 → 入口守卫。
// REVERT=<组> 时把对应源码守卫撤掉并重载文本，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "src", "original");
const cssPath = path.join(root, "publish", "villa-modal.css");
const REVERT = process.env.REVERT || "";

const raw = name => fs.readFileSync(path.join(dir, name), "utf8");
const cssRaw = () => fs.readFileSync(cssPath, "utf8");
const REPL = {
  bind: ["app-hall-bindings.js",
    '    bind("[data-tenri-institute-unlock-complete]", window.completeTenriInstituteUnlockEvent);',
    "    "],
  advnext: ["app-hall-bindings.js",
    '    click("[data-adv-next]", () => window.AdvDialogue?.next());',
    "    "],
  attr: ["tenri-institute-unlock-events.js",
    '      buttonAttribute: "data-tenri-institute-unlock-complete",',
    '      buttonAttribute: "",'],
  core: ["tenri-institute-unlock-events.js",
    '    const ok = await window.ServerCore.call("unlockEvent", { id: EVENT_ID }, state);',
    '    const ok = await window.ServerCore.call("unlockEvent", { id: "wrong_id" }, state);'],
  map: ["app-modal-actions.js",
    '    tenriInstituteUnlock: window.completeTenriInstituteUnlockEvent,',
    "    "],
  view: ["villa.js",
    '      tenriInstituteUnlock: state => window.TenriInstituteUnlockEvents?.tenriInstituteUnlock?.(state) || "",',
    "    "],
  pending: ["local-core-events.js",
    '    else if (id === "tenri_institute" && core.flags.tenriInstituteUnlockPending && character(core, "preshi") && character(core, "mieryula")) { setFlag("tenriInstituteUnlockSeen"); setFlag("tenriInstituteUnlocked"); clearFlag("tenriInstituteUnlockPending"); }',
    "    "],
  advgen: ["adv-dialogue.js",
    '      ? `<p class="muted">${U().esc(note)}</p><div class="actions"><button ${U().esc(buttonAttribute)}="1">${U().esc(buttonText)}</button></div>`',
    '      ? `<p class="muted">${U().esc(note)}</p>`'],
};
const EXPECT_GROUPS = {
  bind: ["B"], advnext: ["B"], attr: ["A"], core: ["D"], map: ["C"],
  view: ["E"], pending: ["E"], advgen: ["A"], css: ["E"],
};

const patched = name => {
  const text = raw(name);
  if (!REVERT || !REPL[REVERT] || REPL[REVERT][0] !== name) return text;
  const [, from, to] = REPL[REVERT];
  if (!text.includes(from)) throw new Error(`REVERT=${REVERT} 目标未命中：${from}`);
  return text.replace(from, to);
};
const source = name => patched(name);
const css = () => REVERT === "css"
  ? cssRaw() + "\n.adv-actions button { pointer-events: none; }\n.villa-modal .actions button { pointer-events: none; }\n"
  : cssRaw();
const has = (name, text) => source(name).includes(text);

const results = [];
const check = (group, name, ok) => results.push({ group, name, ok: !!ok });

// A ADV 按钮生成：末句出完成按钮，非末句出继续/上一句/跳到结尾，对话框可点
const adv = source("adv-dialogue.js");
check("A", "末句按 buttonAttribute 生成完成按钮", adv.includes("<button ${U().esc(buttonAttribute)}=\"1\">${U().esc(buttonText)}</button>"));
check("A", "非末句生成继续按钮", adv.includes('data-adv-next="1"'));
check("A", "非末句生成上一句按钮且首句禁用", adv.includes('data-adv-prev="1"${i === 0 ? " disabled" : ""}'));
check("A", "非末句生成跳到结尾按钮", adv.includes('data-adv-skip="1"'));
check("A", "对话框带 data-adv-advance 与 tabindex", adv.includes('data-adv-advance="1" tabindex="-1"'));
check("A", "进度显示 i+1 / total", adv.includes("${i + 1} / ${total}"));
const ev = source("tenri-institute-unlock-events.js");
check("A", "研究所事件传 buttonAttribute", ev.includes('buttonAttribute: "data-tenri-institute-unlock-complete"'));
check("A", "研究所事件按钮文案", ev.includes('buttonText: "各自准备，明天出发"'));
check("A", "研究所台词 9 句", (ev.match(/^    \["(?:橘千樱|罗卡尔)"/gm) || []).length === 9);

// B 事件委托绑定
const bind = source("app-hall-bindings.js");
check("B", "完成按钮绑定到 completeTenriInstituteUnlockEvent", bind.includes('bind("[data-tenri-institute-unlock-complete]", window.completeTenriInstituteUnlockEvent)'));
check("B", "继续 / 上一句 / 跳到结尾三个 click 委托", ["click(\"[data-adv-next]\"", "click(\"[data-adv-prev]\"", "click(\"[data-adv-skip]\""].every(t => bind.includes(t)));
check("B", "对话框 onclick 推进且排除 button", bind.includes("advance.onclick") && bind.includes('e.target.closest("button")'));
check("B", "空格/回车/方向键推进", bind.includes('e.key === " " || e.key === "Enter" || e.key === "ArrowRight"'));
check("B", "每次 render 后重绑（bind 内调用 bindUnlockCompletes/bindAdvDialogue）", bind.includes("bindUnlockCompletes();") && bind.includes("bindAdvDialogue();"));
check("B", "AppActionGuard key 统一为 unlock-event-completion", bind.includes('key: "unlock-event-completion"'));

// C 关闭 / 完成动作映射
const modal = source("app-modal-actions.js");
check("C", "actions 表含 tenriInstituteUnlock", modal.includes("tenriInstituteUnlock: window.completeTenriInstituteUnlockEvent"));
check("C", "closeHallModal 先走 completeClosableEventModal", modal.includes("if (completeClosableEventModal()) return;"));
check("C", "data-close-modal 委托到 closeHallModal", modal.includes('target.closest("[data-close-modal]")') && modal.includes("closeHallModal();"));
check("C", "完成动作经 AppActionGuard 防重复", modal.includes('AppActionGuard.run("剧情完成失败"'));

// D 完成函数真实链路
check("D", "complete 调 ServerCore unlockEvent 且 id 为事件常量", ev.includes('window.ServerCore.call("unlockEvent", { id: EVENT_ID }, state)'));
check("D", "失败分支提示重试且不关闭", ev.includes("剧情解锁失败，请重试。") && ev.includes("return false;"));
check("D", "成功后清 hallModal 并 flush 存档", ev.includes("state.hallModal = null;") && ev.includes("persist({ flush: true })"));
check("D", "成功后 render 且写日志", ev.includes("render();") && ev.includes("剧情已解锁"));
check("D", "触发条件写 pending + 不覆盖已有弹窗", ev.includes("state.flags[PENDING] = true;") && ev.includes("if (!state.hallModal) state.hallModal = MODAL;"));

// E 核心解锁 / 视图 / 挂点 / CSS
const core = source("local-core-events.js");
check("E", "LocalCoreEventOps tenri_institute 分支写 Unlocked/Seen 清 Pending", core.includes('id === "tenri_institute"') && core.includes('setFlag("tenriInstituteUnlocked")') && core.includes('clearFlag("tenriInstituteUnlockPending")'));
check("E", "isSatisfied 登记 tenri_institute", core.includes('tenri_institute: () => !!flags.tenriInstituteUnlocked'));
const prog = raw("unlock-event-progress.js");
check("E", "UnlockEventProgress.ids 注册", prog.includes('"tenri_institute"'));
const villa = source("villa.js");
check("E", "villa modal 视图映射", villa.includes("tenriInstituteUnlock: state =>"));
check("E", "villa 剧情键白名单", villa.includes('"tenriInstituteUnlock"'));
check("E", "hall triggerAll 补挂点", raw("hall-unlock-events.js").includes("TenriInstituteUnlockEvents?.triggerPending"));
check("E", "通关结算挂点", raw("dungeon-run-rewards.js").includes("triggerTenriInstituteUnlockEvent?.(state, run)"));
const cssText = css();
check("E", "CSS 未禁用对话/完成按钮点击", !/\.adv-actions button\s*\{[^}]*pointer-events\s*:\s*none/.test(cssText)
  && !/\.villa-modal \.actions button\s*\{[^}]*pointer-events\s*:\s*none/.test(cssText));

// F 入口占位守卫（剧情解锁不改变入口状态）
const data = raw("data-tenri-institute.js");
check("F", "mission.devLocked / devHint 保持", data.includes("devLocked: true") && data.includes('devHint: "未开发完成"'));
check("F", "大厅面板按 devLocked 置灰", raw("villa-team.js").includes("mission.devLocked") && raw("villa-team.js").includes("未开发完成"));
check("F", "客户端出征守卫", raw("hall-party-actions.js").includes('if (m.devLocked) return log(m.devHint || "未开发完成"), render();'));

const bad = results.filter(r => !r.ok);
if (REVERT) {
  const own = bad.filter(r => (EXPECT_GROUPS[REVERT] || []).includes(r.group));
  const other = bad.filter(r => !own.includes(r));
  const ok = own.length > 0 && other.length === 0;
  console.log(`REVERT=${REVERT} ${ok ? "OK" : "FAILED"} own=${own.length} other=${other.length} [${other.map(r => r.group + ":" + r.name).join(" | ")}]`);
  process.exit(ok ? 0 : 1);
}
console.log(`研究所解锁事件按键静态检查 通过 ${results.length - bad.length} / ${results.length}（${new Set(results.map(r => r.group)).size} 组）`);
bad.forEach(r => console.log(`  ❌ [${r.group}] ${r.name}`));
process.exit(bad.length ? 1 : 0);
