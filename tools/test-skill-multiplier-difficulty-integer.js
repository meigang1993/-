// 技能倍率 / 难度曲线整数百分比化 · 严格检查
// 运行：node tools/test-skill-multiplier-difficulty-integer.js
//       REVERT=pct|round|notice node ... （源码级反向验证：撤掉改动必须精准报红）
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "src", "original");
const REVERT = process.env.REVERT || "";
const src = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let pass = 0, total = 0; const reds = [];
const T = (name, ok, extra) => { total++; if (ok) pass++; else { reds.push(name); if (extra !== undefined) console.log("  RED", name, JSON.stringify(extra)); } };
const isInt = v => Number.isInteger(v) && Number.isFinite(v);
const mk = () => { const c = { console, Math, Number, Object, Array, JSON, String, Boolean, isNaN, parseInt, parseFloat, Set, Map, Error, Date, RegExp }; c.window = c; vm.createContext(c); return c; };

// 源码级反向：把某一处改动撤回，确认断言不是恒真
let CODE = {};
function codeOf(f) {
  if (CODE[f] !== undefined) return CODE[f];
  let s = src(f);
  if (REVERT === "pct" && f === "data-world.js") {
    const from = "Math.ceil(base.hp * pct(cfg.hp) / 100)";
    if (!s.includes(from)) throw new Error("REVERT=pct must hit hp scale line");
    s = s.replace(from, "Math.ceil(base.hp * pct(cfg.hp) / 1)");
  }
  if (REVERT === "round" && f === "bertis-gerlot-skills.js") {
    const from = "Object.keys(multipliers).forEach(k => u.stats[k] = Math.round(b[k] * multipliers[k] / 100));";
    if (!s.includes(from)) throw new Error("REVERT=round must hit arrogance line");
    s = s.replace(from, "Object.keys(multipliers).forEach(k => u.stats[k] = b[k] * multipliers[k]);");
  }
  if (REVERT === "notice" && f === "update-notice.js") s = s.replace('iso: "2026-11-17"', 'iso: "2026-11-13"');
  return (CODE[f] = s);
}

// ---------- A. 难度曲线：整数百分比 + 等价倍率 + 整数输出 ----------
const ctx = mk();
const LOAD = [
  "economy-config.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js", "character-enhance.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js", "data-orc-bondi.js", "data-guard-kelly.js",
  "data-sakura-risa.js", "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js", "data-ruins-sand-city-enemies.js",
  "data-ruins-content.js", "data-world.js", "update-notice-recent.js",
];
for (const f of LOAD) vm.runInContext(codeOf(f), ctx, { filename: f });
const W = ctx.GameDataWorld;
const diffKeys = ["normal", "adventure", "warrior", "king", "hell"];
const OLD = {
  normal: { hp: 1, power: 1, speed: 1 }, adventure: { hp: 1.4, power: 1.3, speed: 1.2 },
  warrior: { hp: 1.8, power: 1.6, speed: 1.4 }, king: { hp: 2.2, power: 1.9, speed: 1.6 },
  hell: { hp: 2.6, power: 2.2, speed: 1.8 },
};
T("A1 五档难度齐备", diffKeys.length === 5 && diffKeys.every(k => W.difficulties[k]));
diffKeys.forEach(k => {
  const d = W.difficulties[k], cfg = d.enemy.normal;
  T(`A2 ${d.name} 配置全为整数百分比`, ["eliteRate", "reward", "xp", "dropRate"].every(key => isInt(d[key]))
    && ["hp", "power", "speed"].every(key => isInt(cfg[key])),
    { eliteRate: d.eliteRate, reward: d.reward, xp: d.xp, dropRate: d.dropRate, cfg });
  T(`A3 ${d.name} 百分比还原后等于原倍率`,
    cfg.hp / 100 === OLD[k].hp && cfg.power / 100 === OLD[k].power && cfg.speed / 100 === OLD[k].speed);
  T(`A4 ${d.name} 概率与奖励还原在合法区间`,
    d.eliteRate / 100 > 0 && d.eliteRate / 100 <= 1 && d.dropRate / 100 > 0 && d.dropRate / 100 <= 1
    && d.reward / 100 >= 1 && d.xp / 100 >= 1);
});
const allEnemies = Object.values(W.enemies || {}).flat().filter(e => e && typeof e === "object");
const bad = [], mismatch = [];
for (const e of allEnemies) {
  for (const k of diffKeys) {
    const s = W.scaleEnemyStats(e, W.difficulties[k], e.type);
    for (const key of ["hp", "attack", "magic", "speed"]) if (Number.isFinite(e[key]) && !isInt(s[key])) bad.push(`${e.id}/${k}.${key}=${s[key]}`);
    const cfg = W.difficulties[k].enemy.normal;
    if (Number.isFinite(e.hp) && s.hp !== Math.ceil(e.hp * cfg.hp / 100)) mismatch.push(`${e.id}/${k}.hp ${s.hp}`);
    if (Number.isFinite(e.attack) && s.attack !== Math.round(e.attack * cfg.power / 100)) mismatch.push(`${e.id}/${k}.attack ${s.attack}`);
    if (Number.isFinite(e.speed) && s.speed !== Math.round(e.speed * cfg.speed / 100)) mismatch.push(`${e.id}/${k}.speed ${s.speed}`);
  }
}
T("A5 全部怪物×5档缩放输出为整数", bad.length === 0, bad.slice(0, 5));
T("A6 缩放结果与原小数倍率逐项一致", mismatch.length === 0, mismatch.slice(0, 5));
T("A7 怪物池覆盖三副本且非空", allEnemies.length >= 30, allEnemies.length);

// ---------- B. 消费方与金币倍率 ----------
const consumers = {
  "dungeon-reward-core.js": "(diff.reward || 100) / 100",
  "local-core-dungeon.js": "(diff.dropRate ?? 20) / 100",
  "dungeon-map.js": "(diff.eliteRate ?? 0) / 100",
  "character-progression.js": "(Number(difficulty?.xp) || 100) / 100",
  "economy-config.js": "goldMultiplier: 230",
};
Object.entries(consumers).forEach(([f, needle]) => T(`B1 ${f} 已按整数百分比折算`, codeOf(f).includes(needle)));
const mults = [...codeOf("economy-config.js").matchAll(/goldMultiplier:\s*(\d+)/g)].map(m => Number(m[1]));
T("B2 四个金币倍率全为整数百分比", mults.length === 4 && mults.every(isInt), mults);
T("B3 金币倍率还原后等于原 1 / 1.25 / 1.7 / 2.3",
  JSON.stringify(mults.map(v => v / 100)) === JSON.stringify([1, 1.25, 1.7, 2.3]), mults);
const OLDRW = { 100: 1, 135: 1.35, 175: 1.75, 220: 2.2, 275: 2.75 }, OLDGM = { 100: 1, 125: 1.25, 170: 1.7, 230: 2.3 };
T("B4 金币/经验奖励折算后与原口径逐项一致且为整数",
  [[700, 135, 125], [900, 275, 230], [220, 100, 100], [500, 175, 170]].every(([base, rw, gm]) => {
    const now = Math.round(base * (rw / 100) * (gm / 100)), old = Math.round(base * OLDRW[rw] * OLDGM[gm]);
    return isInt(now) && now === old;
  }));

// ---------- C. 技能倍率 ----------
const bertis = codeOf("bertis-gerlot-skills.js"), angelica = codeOf("angelica-luka-skills.js"), ruins = codeOf("ruins-card-skills.js");
T("C1 傲慢雌小鬼倍率为 150/200 整数百分比", bertis.includes("attack: 150, magic: 150, bloodlust: 200, handLimit: 200"));
T("C2 傲慢雌小鬼输出四舍五入为整数", bertis.includes("Math.round(b[k] * multipliers[k] / 100)"));
const rawHalf = 9 * 1.5;
T("C3 奇数攻击力×1.5 不再产生小数属性", !isInt(rawHalf) && Math.round(9 * 150 / 100) === 14);
T("C4 力量爆发仍按 +50% 逐张累积", angelica.includes("+ 0.5;") && angelica.includes("${Math.round(actor.angelicaMightBonus * 100)}%"));
T("C5 力量爆发伤害出口四舍五入", angelica.includes("Math.round(amount * (1 + bonus))"));
T("C6 力量爆发 10 点伤害 +50% = 15", Math.round(10 * (1 + 0.5)) === 15);
T("C7 废墟脆弱受击 1.5 倍改为整数百分比", ruins.includes("Math.round(amount * 150 / 100)"));
T("C8 废墟脆弱 10→15", Math.round(10 * 150 / 100) === 15);
const actx = mk();
vm.runInContext(codeOf("angelica-luka-skills.js"), actx, { filename: "angelica-luka-skills.js" });
const A = actx.AngelicaLukaSkills;
T("C9 真实 modifyOutgoingDamage 输出整数且等价", A.modifyOutgoingDamage({}, { ref: "angelica", angelicaMightBonus: 0.5 }, 10) === 15);
T("C12 奇数伤害 ×1.5 不再漏出 13.5 小数", A.modifyOutgoingDamage({}, { ref: "angelica", angelicaMightBonus: 0.5 }, 9) === 14 && 9 * 1.5 === 13.5);
const bctx = mk();
bctx.GerlotRevengeSkills = () => ({ resolveRevengeTrigger() {}, queueHeadshot() {}, modifyIncomingDamage() {} });
vm.runInContext(codeOf("bertis-gerlot-skills.js"), bctx, { filename: "bertis-gerlot-skills.js" });
const unit = { ref: "bertis", side: "ally", hp: 50, maxHp: 50, skills: [{ name: "傲慢雌小鬼" }], stats: { attack: 9, magic: 7, bloodlust: 1, handLimit: 3 }, intent: 0 };
bctx.BertisGerlotSkills.refreshArrogance({ battle: { allies: [unit], enemies: [] } });
T("C10 真实傲慢雌小鬼满血后属性全为整数", ["attack", "magic", "bloodlust", "handLimit"].every(k => isInt(unit.stats[k])), unit.stats);
T("C11 满血加成等价 1.5 倍四舍五入", unit.stats.attack === 14 && unit.stats.magic === 11 && unit.stats.bloodlust === 2, unit.stats);

// ---------- D. 公告 ----------
const notice = codeOf("update-notice.js"), recent = codeOf("update-notice-recent.js");
T("D1 最新日期三处均为 2026-11-17", /iso: "2026-11-17"/.test(notice) && /label: "2026年11月17日"/.test(notice) && /badge: "2026\.11\.17"/.test(notice));
T("D2 首期标题为 11月17日", recent.includes('title: "2026年11月17日 · 今日更新"'));
T("D3 summary 写进【终极刀魔】", notice.includes("【终极刀魔】"));
T("D4 summary 写进【角色强化】四选一", notice.includes("【角色强化】") && notice.includes("四选一"));
T("D5 首期保留诺亚新技能完整条目", recent.includes("新增主动技【终极刀魔】（怪面诺亚）"));
T("D6 首期保留角色强化完整条目", recent.includes("新增【角色强化】系统"));
T("D7 首期新增本轮倍率/曲线条目", recent.includes("技能倍率与难度曲线统一改为整数百分比参数"));
T("D8 行数未超归档阈值", recent.split("\n").length <= 150 && notice.split("\n").length <= 189);

// ---------- E. 配置零小数护栏 ----------
["data-world.js", "economy-config.js", "bertis-gerlot-skills.js", "angelica-luka-skills.js", "ruins-card-skills.js"].forEach(f => {
  const badLines = [];
  codeOf(f).split("\n").forEach((l, i) => {
    if (l.trim().startsWith("//") || l.trim().startsWith("*")) return;
    for (const m of l.matchAll(/\b(eliteRate|reward|xp|dropRate|hp|power|speed|goldMultiplier):\s*(-?\d+\.\d+)/g)) badLines.push(`${i + 1}:${m[1]}=${m[2]}`);
  });
  T(`E ${f} 数值配置无小数`, badLines.length === 0, badLines.slice(0, 4));
});

console.log(`${pass}/${total}` + (reds.length ? `  REDS=${reds.length}` : ""));
if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
if (reds.length && !REVERT) process.exit(1);
