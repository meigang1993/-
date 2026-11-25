// 技能牌图删除 / 出牌区不显示技能牌 / 读书的智慧文案 专项检查
// REVERT=art|trail|desc|refs 对源码做真实替换（或注入），要求对应组精准打红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const CARDS = path.join(ROOT, "publish", "assets", "generated", "cards");
const REVERT = process.env.REVERT || "";
const EXPECT = { art: ["B"], trail: ["C"], desc: ["D"], refs: ["E"] };
const read = f => fs.readFileSync(path.join(SRC, f), "utf8");
const patch = (f, s) => {
  if (REVERT === "art" && f === "card-art.js") s = s.replace('    if (isSkill(card)) return "";\n', "");
  if (REVERT === "trail" && f === "ui-battle-trail.js") s = s
    .replace("    const played = (battle.played || []).filter(card => !isSkillCard(card));", "    const played = battle.played || [];")
    .replace("      if (isSkillCard(card)) return false;\n", "");
  if (REVERT === "desc" && f === "data-characters-core.js") s = s.replace(
    "使用一张战术牌时，你摸1张牌。", "使用一张非技能战术牌时，你摸1张牌。");
  if (REVERT === "refs" && f === "card-art.js") s = s.replace(
    "  const isSkill =", '  const injectedRef = "./assets/generated/cards/skill-art-leak.webp";\n  const isSkill =');
  return s;
};
const results = [];
const check = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });

// ---------- A 文件层 ----------
const all = fs.readdirSync(CARDS);
const skills = all.filter(f => /^skill-art-.*\.webp$/.test(f));
const cards = all.filter(f => /^card-art-.*\.webp$/.test(f));
check("A", "A1 53 张技能牌图已全部删除", skills.length === 0, `left=${skills.length}`);
check("A", "A2 59 张卡牌图案全部保留（未误删）", cards.length === 59, `card-art=${cards.length}`);
check("A", "A3 目录里没有其它 skill-art 形态文件", !all.some(f => /skill/i.test(f) && f.endsWith(".webp")));

// ---------- B 卡图解析 ----------
global.window = global;
vm.runInThisContext(patch("card-art.js", read("card-art.js")), { filename: "card-art.js" });
const skill = { name: "终极刀魔", type: "tactic", _skill: true, skillName: "终极刀魔" };
const normal = { name: "杀", type: "slash" };
check("B", "B1 技能牌 isSkill 仍为 true（数据身份不变）", window.CardArt.isSkill(skill) === true);
check("B", "B2 技能牌 url / fallbackUrl 一律为空串",
  window.CardArt.url(skill) === "" && window.CardArt.fallbackUrl(skill) === "",
  `url=${window.CardArt.url(skill)} fb=${window.CardArt.fallbackUrl(skill)}`);
check("B", "B3 实体牌仍解析到 card-art 卡牌图案", /card-art-/.test(window.CardArt.url(normal)),
  window.CardArt.url(normal));
check("B", "B4 状态牌 / 战术牌仍解析到卡牌图案或兜底",
  /card-art-/.test(window.CardArt.url({ name: "眩晕", type: "status" }))
  && /card-art-/.test(window.CardArt.url({ name: "蓄力", type: "tactic" })));

// ---------- C 出牌区 ----------
const trailSrc = patch("ui-battle-trail.js", read("ui-battle-trail.js"));
vm.runInThisContext(trailSrc, { filename: "ui-battle-trail.js" });
const api = window.GameUIBattleTrail({ trailCard: c => c });
const battle = {
  played: [{ name: "杀", type: "slash" }, skill, { name: "闪", type: "response" }],
  shownPlayed: [{ name: "眩晕", type: "status" }, skill],
};
const visible = api.cards(battle).map(c => c.name);
check("C", "C1 出牌区视觉轨迹过滤全部技能牌", !visible.includes("终极刀魔"), JSON.stringify(visible));
check("C", "C2 普通牌 / 状态牌 / 响应牌照常显示",
  ["杀", "闪", "眩晕"].every(n => visible.includes(n)), JSON.stringify(visible));
check("C", "C3 数据层 played / shownPlayed 仍完整保留技能牌",
  battle.played.includes(skill) && battle.shownPlayed.includes(skill));
check("C", "C4 过滤判据走 CardArt.isSkill 单一源", /isSkillCard/.test(trailSrc)
  && /window\.CardArt\?\.isSkill/.test(trailSrc));

// ---------- D 读书的智慧 ----------
const chars = patch("data-characters-core.js", read("data-characters-core.js"));
const wendy = /\{ name: "读书的智慧"[^}]*text: "([^"]+)"/.exec(chars)?.[1] || "";
check("D", "D1 描述已删除「非技能」三个字", !/非技能/.test(wendy), wendy);
check("D", "D2 描述为「使用一张战术牌时，你摸1张牌」",
  wendy === "锁定技，当一名友方角色使用一张战术牌时，你摸1张牌。", wendy);
const doc03 = fs.readFileSync(path.join(ROOT, "docs/03-角色与角色技能.txt"), "utf8");
const docDeep = fs.readFileSync(path.join(ROOT, "docs/deepseek-rebuild/02-characters.md"), "utf8");
check("D", "D3 docs/03 与 deepseek 文档同步", !/非技能战术牌/.test(doc03) && !/非技能战术牌/.test(docDeep));
check("D", "D4 实现仍排除技能生成的牌（技能发动不算「使用一张牌」）",
  /card\._skill\) return;/.test(read("wendy-skills.js")));

// ---------- E 全库引用 ----------
const jsFiles = fs.readdirSync(SRC).filter(f => f.endsWith(".js"));
const leaked = jsFiles.filter(f => /assets\/generated\/cards\/skill-art-[a-z0-9.-]+\.webp/.test(patch(f, read(f))));
check("E", "E1 源码无任何 skill-art 文件路径引用", leaked.length === 0, JSON.stringify(leaked));
const bundles = fs.readdirSync(path.join(ROOT, "publish", "bundles")).filter(f => f.endsWith(".min.js"));
check("E", "E2 构建产物无 skill-art 路径（重建后校验）",
  !bundles.some(f => /assets\/generated\/cards\/skill-art-/.test(
    fs.readFileSync(path.join(ROOT, "publish", "bundles", f), "utf8"))), `bundles=${bundles.length}`);
check("E", "E3 卡牌图案引用仍全部有效（无悬空）", (() => {
  const art = read("card-art.js");
  const refs = [...art.matchAll(/"([^"]+)": "(\.\/assets\/generated\/cards\/card-art-[^"]+)"/g)].map(m => m[2]);
  return refs.length >= 59 && refs.every(r => fs.existsSync(path.join(ROOT, "publish", r.replace(/^\.\//, ""))));
})());

const failed = results.filter(r => !r.ok);
if (REVERT) {
  const want = EXPECT[REVERT] || [];
  const own = failed.filter(r => want.includes(r.g)).length;
  const other = failed.filter(r => !want.includes(r.g)).length;
  console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
  failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n} ${r.d}`));
  process.exit(own > 0 && other === 0 ? 0 : 1);
}
results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
console.log(`RESULT ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
