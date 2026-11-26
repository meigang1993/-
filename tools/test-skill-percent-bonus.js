// 严格检查：所有 N% 统一按「当前属性」口径（A）+ 四项本轮改动。
// 口径 A：stats.*（含角色强化/装备/绿帽等已写回的固定加成）+ temp* 中除本技能自身贡献外
// 的部分；多个百分比来源以同一快照线性相加、不链式累乘；单份四舍五入且至少 1 点。
// 四项改动：增援部队满血复活 / 飘浮掩体改温蒂结束阶段 / 暴走杀改 +10%（本场战斗线性） /
// 回血基数统一为施术者当前最大生命值。角色强化固定 +1 按原口径不动。
// REVERT=formula|impl|phase|berserk|revive|heal|notice 为源码级反向验证，须精准打红。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");
const { sourceOf } = require("./split-source-view");
const ROOT = path.join(__dirname, "..", "src", "original");
const REVERT = process.env.REVERT || "none";
const cache = {};
const raw = f => cache[f] || (cache[f] = sourceOf(path.join(ROOT, f)));
const REVERTS = {
  formula: {
    "hp-value.js": [["const pctStacks = (base, pct, n) => Math.max(1, Math.round(\n    clean(base) * Math.max(0, clean(pct)) / 100)) * Math.max(0, Math.round(clean(n)));",
      "const pctStacks = (base, pct, n) => Math.max(0, Math.round(clean(n)));"]],
  },
  impl: {
    "artina-maria-skills.js": [["H.pctStacks(H.currentStat(actor, \"attack\", grantAtk), 10, actor.mariaMarks)", "actor.mariaMarks"]],
    "battle-card-specials.js": [["window.BattleHpValue.pctStacks(window.BattleHpValue.currentStat(actor, \"magic\"), 50, n)", "Math.max(0, Number(actor.stats?.magic) || 0) * .5 * n"]],
    "catherine-skills.js": [["H.pctStacks(H.currentStat(unit, \"magic\", grant), 10, tacticCount(unit))", "tacticCount(unit)"]],
  },
  phase: {
    "battle-end-phase.js": [['() => { if (unit?.ref === "wendy") window.WendyCadicisSkills?.floatingCover?.(state, unit, { pushFloat: combat.pushFloat }); return true; },', "void 0;"]],
  },
  berserk: {
    "battle-combat-attack-values.js": [["const gain = H.pctStacks(actor.berserkBaseAttack, 10, 1);", "const gain = 1;"]],
  },
  revive: {
    "ruins-elite-skills.js": [["enemy.hp = window.BattleHpValue.maxHp(enemy);", "enemy.hp = Math.max(1, Math.ceil((enemy.maxHp || 1) * 0.4));"]],
  },
  heal: {
    "elrana-healing-skills.js": [["window.BattleHpValue.healPctStacks(actor, 10, hand.length)", "hand.length"]],
    "battle-card-specials.js": [["window.BattleHpValue.healPctStacks(actor, pct * 100, 1)", "Math.ceil((target.maxHp || 0) * pct)"]],
  },
  notice: {
    "update-notice-recent.js": [["【增援部队】（装甲运输车）复活口径调整", "【已撤回】"]],
  },
};
function read(f) {
  let s = raw(f);
  for (const [o, n] of (REVERTS[REVERT]?.[f] || [])) {
    if (!s.includes(o)) throw new Error(`REVERT=${REVERT} target missing in ${f}: ${o.slice(0, 60)}`);
    s = s.replace(o, n);
  }
  return s;
}
const has = (f, x) => read(f).includes(x);
const no = (f, x) => !read(f).includes(x);
let pass = 0; const reds = {};
function T(seg, name, cond) {
  if (cond) { pass += 1; return; }
  (reds[seg] ||= []).push(name);
  console.log(`  RED [${seg}] ${name}`);
}
function loadHp() {
  const win = { window: {} };
  vm.createContext(win);
  vm.runInContext(read("hp-value.js"), win);
  return win.window.BattleHpValue;
}
const H = loadHp();

// ---------- A：统一公式 ----------
T("A", "导出当前属性/百分比接口", ["currentStat", "currentMaxHp", "pctStacks", "healPctStacks"].every(k => typeof H[k] === "function"));
T("A", "currentStat 含 temp 加成", H.currentStat({ stats: { attack: 10 }, tempAttack: 3 }, "attack") === 13);
T("A", "currentStat 扣本技能自身贡献", H.currentStat({ stats: { attack: 10 }, tempAttack: 8 }, "attack", 5) === 13);
T("A", "currentStat 不返回负数", H.currentStat({ stats: { magic: 2 }, tempMagic: 0 }, "magic", 99) === 0);
T("A", "currentStat NaN 安全", H.currentStat({ stats: { attack: NaN } }, "attack") === 0);
T("A", "currentMaxHp 含强化加成", H.currentMaxHp({ maxHp: 127, stats: { maxHp: 124 } }) === 127);
T("A", "pctStacks 10% 线性叠加", H.pctStacks(100, 10, 3) === 30);
T("A", "pctStacks 50% 四舍五入", H.pctStacks(25, 50, 2) === 26);
T("A", "pctStacks 30% 整数", H.pctStacks(9, 30, 1) === 3);
T("A", "pctStacks 单份至少 1 点", H.pctStacks(0, 30, 1) === 1);
T("A", "pctStacks 0/负份数为 0", H.pctStacks(100, 10, 0) === 0 && H.pctStacks(100, 10, -5) === 0);
T("A", "pctStacks 不链式累乘", H.pctStacks(100, 10, 1) * 9 === H.pctStacks(100, 10, 9));
T("A", "healPctStacks 按施术者当前最大生命", H.healPctStacks({ maxHp: 124 }, 10, 3) === 36);
T("A", "healPctStacks 单份保底", H.healPctStacks({ maxHp: 1 }, 30, 1) === 1);
T("A", "兼容 statStacks / healStacks", H.statStacks(100, 3) === 30 && H.healStacks(130, 1) === 13);
T("A", "SKILL_PCT 仍为 10", H.SKILL_PCT === 10);
T("A", "原有 healCap/applyHeal 不变", H.healCap({ hp: 10, maxHp: 20 }, 5) === 5 && H.applyDamage({ hp: 10, maxHp: 20 }, 3) === 7);

// ---------- B：所有 N% 调用点 ----------
T("B", "玛利亚按当前属性快照", has("artina-maria-skills.js", 'H.pctStacks(H.currentStat(actor, "attack", grantAtk), 10, actor.mariaMarks)'));
T("B", "玛利亚魔力同源", has("artina-maria-skills.js", 'H.pctStacks(H.currentStat(actor, "magic", grantMag), 10, actor.mariaMarks)'));
T("B", "梦想真理多份同快照记账", has("hoshino-yi-skills.js", "actor.hoshinoGrantAttack") && has("hoshino-yi-skills.js", "各+10%当前属性"));
T("B", "热血契约按当前攻击", has("battle-card-specials.js", 'pctStacks(window.BattleHpValue.currentStat(actor, "attack"), 10, actor.consumed.length)'));
T("B", "凯瑟琳覆盖式记账", has("catherine-skills.js", "unit.catherineGrantMagic = bonus;") && no("catherine-skills.js", "unit.tempMagic = tacticCount(unit);"));
T("B", "榨取精华 50% 走统一公式", has("battle-card-specials.js", 'currentStat(actor, "magic"), 50, n'));
T("B", "榨取旧小数乘法清零", no("battle-card-specials.js", "* .5 * n"));
T("B", "绿帽 30% 走统一公式", has("green-hat.js", "pctStacks(base, 30, count)") && has("green-hat.js", "pctStacks(unit.greenHatAttackBase, 30, 1)"));
T("B", "绿帽写回整数攻击", no("green-hat.js", "rounded(base * ATTACK_RATE * count)"));
T("B", "回春之手统一基数", has("elrana-healing-skills.js", "healPctStacks(actor, 10, hand.length)"));
T("B", "再生肉体统一基数", has("elrana-healing-skills.js", "healPctStacks(unit, 10, visible(unit).filter(red).length)"));
T("B", "偶像之吻统一基数", has("nonoka-loki-skills.js", "healPctStacks(actor, 10, visibleHand(actor).length)"));
T("B", "克隆体再生统一基数", has("enemy-skills.js", "healPctStacks(unit, 10, red)"));
T("B", "单体回血牌统一基数", has("battle-card-specials.js", "healPctStacks(actor, pct * 100, 1)"));
T("B", "群体回血牌统一基数", has("battle-card-specials.js", "healPctStacks(actor, card.teamHealPct * 100, 1)"));
T("B", "牌类旧目标 maxHp 基数清零", no("battle-card-specials.js", "Math.ceil((target.maxHp || 0) * pct)") && no("battle-card-specials.js", "Math.ceil(u.maxHp * card.teamHealPct)"));
T("B", "狂战意志统一基数", has("angelica-luka-skills.js", "healPctStacks(actor, 10, spent)"));
T("B", "狂战旧 0.1 乘法清零", no("angelica-luka-skills.js", "(actor.maxHp || 0) * 0.1"));
T("B", "产品源码不再直接调 statStacks", ["artina-maria-skills.js", "hoshino-yi-skills.js", "battle-card-specials.js", "catherine-skills.js"].every(f => no(f, "BattleHpValue.statStacks")));
T("B", "产品源码不再直接调 healStacks", ["elrana-healing-skills.js", "nonoka-loki-skills.js", "enemy-skills.js"].every(f => no(f, "BattleHpValue.healStacks")));

// ---------- C：四项改动 ----------
T("C", "增援部队满血复活", has("ruins-elite-skills.js", "enemy.hp = window.BattleHpValue.maxHp(enemy);"));
T("C", "增援旧 40% 上限清零", no("ruins-elite-skills.js", "* 0.4"));
T("C", "增援战报写明满血", has("ruins-elite-skills.js", "满血复活${dead.length}名友军"));
T("C", "温蒂改挂结束阶段 steps", has("battle-end-phase.js", 'unit?.ref === "wendy"') && has("battle-end-phase.js", "WendyCadicisSkills?.floatingCover?.("));
T("C", "结束阶段步骤吞掉返回值", /return true; \},/.test(read("battle-end-phase.js")));
T("C", "只在温蒂自己结束阶段触发一次", (read("battle-end-phase.js").match(/unit\?\.ref === "wendy"/g) || []).length === 1);
T("C", "弃牌流程不再调用飘浮掩体", no("battle-discard-flow.js", "floatingCover?.("));
T("C", "温蒂战报改结束阶段", has("wendy-skills.js", "结束阶段触发飘浮掩体"));
T("C", "温蒂描述改结束阶段", has("data-characters-core.js", '"锁定技，结束阶段，我方全体角色获得等同于你魔力值的护甲值。'));
T("C", "暴走杀以首次当前属性为快照", has("battle-combat-attack-values.js", "actor.berserkBaseAttack = H.currentStat(actor, \"attack\");"));
T("C", "暴走杀每次 +10% 线性", has("battle-combat-attack-values.js", "H.pctStacks(actor.berserkBaseAttack, 10, 1)"));
T("C", "暴走杀旧固定 +1 清零", no("battle-combat-attack-values.js", "actor.stats.attack = (actor.stats.attack || 0) + 1;"));
T("C", "暴走杀仍本场战斗保持", has("battle-combat-attack-values.js", "本场战斗攻击力按当前属性+10%"));
T("C", "回血基数统一为施术者", has("hp-value.js", "healPctStacks = (actor, pct, n) => pctStacks(currentMaxHp(actor), pct, n)"));

// ---------- D：描述 / 公告 / 文档 ----------
T("D", "暴走杀卡面写 10%", has("data-cards.js", "本场战斗的攻击力按当前属性+10%"));
T("D", "三张回血牌写施术者当前最大生命", ["你当前最大生命值的30%", "你当前最大生命值的10%"].every(x => has("data-cards.js", x)));
T("D", "热血契约写当前攻击力", has("data-characters-core.js", "按当前攻击力四舍五入"));
T("D", "榨取写当前魔力", has("data-characters-core.js", "按发动时的当前魔力加算"));
T("D", "回血技能写当前最大生命", has("data-characters-extra.js", "按你当前最大生命值10%计算之和"));
T("D", "公告：增援满血", has("update-notice-recent.js", "【增援部队】（装甲运输车）复活口径调整"));
T("D", "公告：温蒂结束阶段", has("update-notice-recent.js", "【飘浮掩体】（温蒂）触发阶段调整"));
T("D", "公告：暴走 10%", has("update-notice-recent.js", "【暴走杀】成长改为百分比"));
T("D", "公告：当前属性 A 与回血统一", has("update-notice-recent.js", "全部属性百分比统一为「当前属性」口径（A）"));
T("D", "公告日期仍为 11-23", has("update-notice.js", 'iso: "2026-11-23"') && has("update-notice-recent.js", "2026年11月23日 · 今日更新"));
T("D", "公告 recent 未超 150 行", raw("update-notice-recent.js").split("\n").length <= 150);
T("D", "设定文档暴走口径同步", fs.readFileSync(path.join(__dirname, "..", "docs", "original", "game-settings.md"), "utf8").includes("按首次发动时的当前攻击力+10%"));
T("D", "设定文档增援满血同步", ["05-怪物与怪物技能与饰品.txt", "12-新副本素材-废墟沙城.txt"].every(f => fs.readFileSync(path.join(__dirname, "..", "docs", f), "utf8").includes("满血复活")));
T("D", "卡牌文档口径同步", fs.readFileSync(path.join(__dirname, "..", "docs", "04-卡牌.txt"), "utf8").includes("你当前最大生命值的30%"));

// ---------- E：角色强化与既有数值不动 ----------
T("E", "角色强化固定 +1 不动", fs.readFileSync(path.join(ROOT, "ui-info.js"), "utf8").includes("攻击力+1 / 魔力+1"));
T("E", "角色强化不走百分比公式", no("character-enhance.js", "pctStacks"));
T("E", "难度整数百分比不变", has("data-world.js", "150") && has("data-world.js", "300"));
T("E", "绿帽 30% / 榨取 50% 数值不变", has("data-characters-core.js", "攻击力+30%") && has("data-characters-core.js", "魔力增加50%"));
T("E", "愈魔瓶 30% / 伤口处理 10% / 生命之泉 30% 数值不变", has("data-cards.js", "healPct: .3") && has("data-cards.js", "healPct: .1") && has("data-cards.js", "teamHealPct: .3"));
T("E", "hp-value 行数未超 180", raw("hp-value.js").split("\n").length <= 180);

const total = pass + Object.values(reds).reduce((n, a) => n + a.length, 0);
console.log(`\nRESULT ${pass}/${total}  REVERT=${REVERT}`);
if (REVERT !== "none") {
  const target = { formula: "A", impl: "B", phase: "C", berserk: "C", revive: "C", heal: "B", notice: "D" }[REVERT];
  const t = (reds[target] || []).length;
  const other = Object.entries(reds).filter(([k]) => k !== target).reduce((n, [, a]) => n + a.length, 0);
  console.log(t > 0 && other === 0 ? `REVERT_OK ${REVERT}: ${t} targeted red(s)` : `REVERT_FAIL ${REVERT}: target=${t} other=${other}`);
  process.exit(t > 0 && other === 0 ? 0 : 1);
} else {
  process.exit(Object.keys(reds).length ? 1 : 0);
}
