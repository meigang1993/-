// 非锁定技术语统一 / 榨取精华 / 次元转移「跳过（不发动）」专项检查。
// REVERT=term|prefix|skip|bind 为源码级反向验证，要求精准打红对应组、无关组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const REVERT = process.env.REVERT || "";
const results = [];
const check = (g, n, ok, d = "") => {
  results.push({ g, n, ok: !!ok, d });
  console.log(`${ok ? "OK  " : "FAIL"} ${g} ${n}${ok ? "" : " — " + JSON.stringify(d)}`);
  return !!ok;
};
const PATCH = {
  term: { "src/original/battle-response-ui.js": [["非锁定技", "触" + "发技"]] },
  prefix: { "src/original/data-characters-core.js": [
    ["非锁定技，准备阶段限一次", "准备阶段限一次"],
    ["非锁定技，当一名友方角色", "当一名友方角色"]] },
  skip: { "src/original/ui-hand-controls.js": [
    // 顺序要紧：先删长提示句（此时按钮文字未动），再只改按钮标签，最后去 title。
    ["；也可跳过（不发动），本次伤害仍由原目标承受", "。"],
    [">跳过（不发动）</button>", ">放弃发动</button>"],
    [' title="不发动次元转移，本次伤害仍由原目标承受"', ""]] },
  bind: { "src/original/battle-action-prompt-bindings.js": [
    ["() => tryDimensionTransfer(null)", "() => tryDimensionTransfer(undefined)"]] },
  icon: { "src/original/data-characters-core.js": [
    ['name: "次元转移", type: "trigger", icon: "🔵"', 'name: "次元转移", type: "trigger", icon: "⭐"']] },
};
function read(rel) {
  let s = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const [from, to] of (PATCH[REVERT]?.[rel] || [])) {
    if (!s.includes(from)) throw new Error(`REVERT=${REVERT} 目标未命中: ${rel} / ${from.slice(0, 60)}`);
    s = s.replace(from, to);
  }
  return s;
}

// ── A 术语层：独立词「触发技」全库 0 残留（「触发技能」是复合词，不算） ──
{
  const files = [];
  const walk = dir => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isDirectory()) {
        if (!["node_modules", ".git", "bundles"].includes(f.name)) walk(path.join(dir, f.name));
      } else if (/\.(js|txt|md|html|css)$/.test(f.name)) files.push(path.join(dir, f.name));
    }
  };
  ["src/original", "docs", "tools"].forEach(walk);
  // 正则与反向注入都拆字书写，避免检查脚本自身被自己的扫描命中。
  const TERM = new RegExp("触发" + "技(?!能)");
  // 本脚本注释/断言文字里必须能写出这个术语，扫描时排除自身，避免自指恒红。
  const SELF = "tools/check-nonlocked-skill-and-transfer-skip.js";
  const left = files.filter(f => f !== SELF && TERM.test(read(f)));
  check("A1", "独立词「触发技」全库 0 残留（复合词「触发技能」排除）", left.length === 0, left);
  const settings = read("docs/original/game-settings.md");
  check("A2", "图标语义段已同步为「非锁定技」", /非锁定技/.test(settings));
  const rules = read("src/original/update-notice-rules.js");
  check("A3", "规则说明与霸王色抗性文案已同步", /专属非锁定技【霸王色抗性】/.test(rules));
}

// ── B 技能描述层 ──
{
  const core = read("src/original/data-characters-core.js");
  // 技能对象里先有自身 text、后有 card.text；必须非贪婪，否则会误取到 card 描述。
  const extract = /name: "榨取精华"[^}]*?text: "([^"]+)"/.exec(core)?.[1] || "";
  const transfer = /name: "次元转移"[^}]*?text: "([^"]+)"/.exec(core)?.[1] || "";
  check("B1", "【榨取精华】描述以「非锁定技，」开头", /^非锁定技，准备阶段限一次/.test(extract), extract.slice(0, 60));
  check("B2", "【次元转移】描述以「非锁定技，」开头", /^非锁定技，当一名友方角色/.test(transfer), transfer.slice(0, 60));
  check("B3", "两份设定文档同步标注非锁定技",
    /非锁定技/.test(read("docs/03-角色与角色技能.txt"))
    && /非锁定技/.test(read("docs/deepseek-rebuild/02-characters.md"))
    && /非锁定技/.test(read("docs/original/game-settings.md")));
  const notice = read("src/original/update-notice-recent.js");
  check("B4", "公告写明本期术语调整且未增行",
    /非锁定技/.test(notice) && /跳过（不发动）/.test(notice) && notice.split("\n").length <= 150,
    { lines: notice.split("\n").length });
  check("B5", "【次元转移】图标为🔵（蓝色非锁定技）",
    /name: "次元转移", type: "trigger", icon: "🔵"/.test(core));
  check("B6", "设定文档与公告同步记录图标调整",
    /次元转移.*⭐.*🔵/.test(read("docs/original/game-settings.md"))
    && /图标由⭐改为🔵/.test(notice));
}

// ── C 跳过按钮层（源码装配） ──
{
  const controls = read("src/original/ui-hand-controls.js");
  const binds = read("src/original/battle-action-prompt-bindings.js");
  check("C1", "提示条渲染「跳过（不发动）」按钮且带后果 title",
    /data-dimension-transfer-skip="1"[^>]*>跳过（不发动）<\/button>/.test(controls)
    && /title="不发动次元转移，本次伤害仍由原目标承受"/.test(controls));
  check("C2", "提示文案写明不发动的后果",
    /；也可跳过（不发动），本次伤害仍由原目标承受/.test(controls));
  check("C3", "按钮绑定 tryDimensionTransfer(null)（不发动分支）",
    /\[data-dimension-transfer-skip\]/.test(binds) && /\(\) => tryDimensionTransfer\(null\)/.test(binds));
  check("C4", "公告写明新增跳过入口", /跳过（不发动）/.test(read("src/original/update-notice-recent.js")));
}

// ── D 真实 UI 渲染：手牌区提示条确实产出可点的跳过按钮 ──
{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(read("src/original/ui-hand-controls.js"), ctx, { filename: "ui-hand-controls.js" });
  const html = ctx.window.GameUIHandControls({ selectionTip: () => "" }).renderControls(
    { battle: { dimensionTransfer: { costIndex: null } }, actor: { name: "曼妮" },
      modes: { dimensionTransfer: true }, picks: {}, picked: false }, { esc: s => s });
  check("D1", "真实 renderControls 产出「跳过（不发动）」按钮",
    html.includes("data-dimension-transfer-skip") && html.includes("跳过（不发动）")
    && html.includes("本次伤害仍由原目标承受"), html.slice(0, 220));
  check("D2", "按钮未被 disabled / aria-disabled 挡住",
    !/data-dimension-transfer-skip="1"[^>]*disabled/.test(html));
}

const EXPECT = {
  term: ["A1"], prefix: ["B1", "B2"], skip: ["C1", "C2", "D1"], bind: ["C3"],
  icon: ["B5"],
};
if (REVERT) {
  const red = [...new Set(results.filter(r => !r.ok).map(r => r.g))].sort();
  const want = [...(EXPECT[REVERT] || [])].sort();
  const precise = want.length > 0 && JSON.stringify(red) === JSON.stringify(want);
  console.log(`\nREVERT=${REVERT} RED=${JSON.stringify(red)} EXPECTED=${JSON.stringify(want)} ${precise ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  process.exit(precise ? 0 : 1);
}
const bad = results.filter(r => !r.ok);
console.log(`\nRESULT ${results.length - bad.length}/${results.length}`);
if (bad.length) process.exit(1);
