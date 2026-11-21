// 更新公告面板：顶部固定说明段已删除，所有更新内容一律进下方可滚动的分期列表。
// 该约定长期有效：新增/修改公告只改三个数据文件，不再往 update-notice.js 顶部写摘要。
// REVERT=summary 为源码级反向验证（把摘要段注回去，预期精准打红）。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const REVERT = process.env.REVERT || "";
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
let pass = 0; const reds = [];
function T(name, cond, extra) {
  if (cond) pass++; else { reds.push(name); console.log("  ❌ " + name + (extra === undefined ? "" : "  ← " + JSON.stringify(extra).slice(0, 180))); }
}

const meta = read("src/original/update-notice.js");
const css = read("publish/villa-modal.css");
const recent = read("src/original/update-notice-recent.js");
const archive = read("src/original/update-notice-archive.js");
const rules = read("src/original/update-notice-rules.js");
const doc = read("docs/01-完整项目.txt");

console.log("=== A. 源码与样式：顶部摘要段不再存在 ===");
T("A1 update-notice.js 无 update-notice-summary", !/update-notice-summary/.test(meta));
T("A2 update-notice.js 无旧摘要正文", !/本次更新统一数值口径/.test(meta));
T("A3 渲染模板含可滚动分期列表容器", /class="update-notice-list"/.test(meta));
T("A4 注释写明「新增/修改公告只改数据文件」", /新增 \/ 修改公告只改上面三个数据文件/.test(meta));
T("A5 CSS 无顶部摘要样式", !/\.update-notice-summary\s*\{/.test(css));
T("A6 列表容器独立占满剩余高度并可滚动",
  /\.update-notice-list\s*\{[^}]*flex:\s*1[^}]*overflow-y:\s*auto/.test(css));
T("A7 文档口径为「可滚动弹窗中展示」", /在可滚动弹窗中展示/.test(doc));
T("A8 三个数据文件仍全部显式装配且无静默兜底",
  ["UpdateNoticeRules", "UpdateNoticeRecent", "UpdateNoticeArchive"].every(k => meta.includes(k))
  && (meta.match(/throw new Error/g) || []).length === 3 && !meta.includes("|| []"));

console.log("=== B. 真实 render() 输出：头部之下直接是分期列表 ===");
let src = meta;
if (REVERT === "summary") {
  const needle = `<div class="update-notice-list">`;
  if (!src.includes(needle)) throw new Error("REVERT=summary must hit render template");
  src = src.replace(needle, `<p class="update-notice-summary">反向注入的顶部固定说明段</p>\n        ${needle}`);
}
const ctx = vm.createContext({ window: {}, console });
for (const f of ["update-notice-rules.js", "update-notice-recent.js", "update-notice-archive.js"]) {
  vm.runInContext(read(`src/original/${f}`), ctx, { filename: f });
}
vm.runInContext(src, ctx, { filename: "update-notice.js" });
const html = ctx.window.UpdateNotice.render();
const sectionCount = (html.match(/class="update-notice-section"/g) || []).length;
const expected = ctx.window.UpdateNoticeRecent.length + ctx.window.UpdateNoticeArchive.length + ctx.window.UpdateNoticeRules.length;
T("B1 render 输出不含任何顶部摘要段", !/update-notice-summary/.test(html));
T("B2 render 输出含 update-notice-head 与 update-notice-list",
  /class="update-notice-head"/.test(html) && /class="update-notice-list"/.test(html));
T("B3 头部与列表之间没有其它段落/容器",
  /<\/header>\s*<div class="update-notice-list">/.test(html));
T("B4 分期条目数与三个数据文件一致", sectionCount === expected, { sectionCount, expected });
T("B5 首期标题与当期条目都在列表内",
  html.includes("2026年11月19日 · 今日更新") && html.includes("【终极刀魔】")
  && html.indexOf("2026年11月19日 · 今日更新") > html.indexOf('class="update-notice-list"'));
T("B6 顶部只有标题与日期，无长段说明",
  !/<p\b/.test(html) && (html.match(/<h2\b/g) || []).length === 1);
T("B7 当前生效口径仍在分期列表里（未被误删）",
  /5000 莉莉丝元/.test(html) && /各最多强化 50 次/.test(html) && /【淫气】/.test(html));
T("B8 列表容器不写死 max-height，滚动高度由 flex 决定",
  /class="update-notice-list"/.test(html) && !/max-height:\s*\d/.test(css.split(".update-notice-list")[1]?.split("}")[0] || ""));

console.log("=== C. 反向验证有效性 ===");
if (REVERT === "summary") {
  T("C1 注入摘要段后 B1/B3/B6 应打红", reds.some(r => r.startsWith("B1")) || reds.some(r => r.startsWith("B3")));
} else {
  T("C1 正常态无红项", reds.length === 0);
}

console.log(`\n合计 ${pass} 通过 / ${reds.length} 失败`);
if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
if (reds.length && REVERT !== "summary") process.exit(1);
if (REVERT === "summary" && !reds.some(r => r.startsWith("B"))) process.exit(1);
