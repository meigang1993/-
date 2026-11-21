// 全部属性取整严格检查：34 名可玩角色 + 全部 36 名怪物，覆盖基值、25 级成长表、
// 0~20 级插值结果、角色强化加成、四副本五难度缩放与升级/重算路径。
// REVERT 为源码级反向验证：把改动撤回后必须精准报红，确认断言不是空转。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const REVERT = process.env.REVERT || "";
const KEYS = ["maxHp", "attack", "magic", "speed"];
const ENEMY_KEYS = ["hp", "attack", "magic", "speed"];
const FILES = [
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

const isFrac = v => typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v);
const isBad = v => !Number.isFinite(v) || isFrac(v) || v < 0;
const src = f => fs.readFileSync(path.join(ROOT, "src/original", f), "utf8");

let CODE = {};
const codeOf = f => CODE[f] !== undefined ? CODE[f] : src(f);

function loadAll(mut) {
  CODE = {};
  const ctx = {
    console, Math, Number, Object, Array, JSON, String, Boolean,
    isNaN, parseInt, parseFloat, Set, Map, Error, Date, RegExp,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) {
    let code = src(f);
    if (mut && mut[f]) code = mut[f](code);
    CODE[f] = code;
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
}

function mutators() {
  if (!REVERT) return null;
  const m = {};
  if (REVERT === "statsAt") {
    m["character-progression.js"] = s => {
      const from = "stats[key] = Math.round(raw);";
      if (!s.includes(from)) throw new Error("REVERT=statsAt must hit statsAt line");
      return s.replace(from,
        'stats[key] = key === "maxHp" ? Math.round(raw) : Math.round(raw * 100) / 100;');
    };
  }
  if (REVERT === "withBonus") {
    m["character-enhance.js"] = s => {
      const from = "const value = Number.isFinite(raw) ? Math.round(raw) : 0;\n      out[key] = Math.round(value + bonus[key]);";
      if (!s.includes(from)) throw new Error("REVERT=withBonus must hit withBonus line");
      return s.replace(from,
        "const value = Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;\n      out[key] = Math.round((value + bonus[key]) * 100) / 100;");
    };
  }
  if (REVERT === "base") {
    m["data-characters-core.js"] = s => {
      const from = "attack: 10, magic: 5, speed: 11, maxHp: 124";
      if (!s.includes(from)) throw new Error("REVERT=base must hit lokar stats");
      return s.replace(from, "attack: 9.6, magic: 5, speed: 11, maxHp: 124");
    };
  }
  if (REVERT === "growth") {
    m["character-progression.js"] = s => {
      const from = "lokar: { maxHp: 280, attack: 67";
      if (!s.includes(from)) throw new Error("REVERT=growth must hit lokar growth");
      return s.replace(from, "lokar: { maxHp: 280.42, attack: 67");
    };
  }
  if (REVERT === "notice") {
    m["update-notice-recent.js"] = s => {
      const line = s.split("\n").find(l => l.includes("属性口径调整：34 名可玩角色"));
      if (!line) throw new Error("REVERT=notice must hit integer notice");
      return s.replace(line + "\n", "");
    };
  }
  return m;
}

let total = 0, pass = 0;
const reds = [];
function T(name, cond, extra) {
  total += 1;
  if (cond) pass += 1;
  else {
    reds.push(name);
    console.log("  RED", name, extra === undefined ? "" : JSON.stringify(extra));
  }
}

const ctx = loadAll(mutators());
const chars = ctx.GameDataCharacters || [];
const P = ctx.CharacterProgression;
const E = ctx.CharacterEnhance;
const W = ctx.GameDataWorld;

// ---------- A. 34 角色基值 ----------
T("A1 可玩角色总数 34", chars.length === 34, chars.length);
T("A2 34 角色基值四项全为整数",
  chars.every(c => KEYS.every(k => Number.isInteger(c.stats?.[k]))),
  chars.filter(c => KEYS.some(k => isFrac(c.stats?.[k]))).map(c => c.id));
T("A3 基值有限且非负", chars.every(c => KEYS.every(k => Number.isFinite(c.stats[k]) && c.stats[k] >= 0)));
T("A4 淫气/手牌/摸牌字段同样是整数",
  chars.every(c => ["bloodlust", "handLimit", "drawPerTurn", "initialDraw"]
    .every(k => Number.isInteger(c.stats[k]))));
T("A5 角色 id 唯一", new Set(chars.map(c => c.id)).size === 34);

// ---------- B. 成长表 ----------
const growthEntries = Object.entries(P.growth);
T("B1 成长表覆盖 34 名角色", growthEntries.length === 34, growthEntries.length);
T("B2 成长表四项全为整数",
  growthEntries.every(([, g]) => KEYS.every(k => Number.isInteger(g[k]))),
  growthEntries.filter(([, g]) => KEYS.some(k => isFrac(g[k]))).map(([id]) => id));
T("B3 fallback 成长全为整数",
  KEYS.every(k => Number.isInteger(P.profile("__missing__")[k])));
T("B4 成长值有限且非负",
  growthEntries.every(([, g]) => KEYS.every(k => Number.isFinite(g[k]) && g[k] >= 0)));
T("B5 成长仍落在原档位网格（整数化允许 0.15 tier 偏差）",
  growthEntries.every(([id, g]) => {
    const grid = { maxHp: 11.684, attack: 7.491, magic: 8.163, speed: 3.648 };
    return KEYS.every(k => Math.abs(g[k] / grid[k] - Math.round(g[k] / grid[k])) < 0.15);
  }), growthEntries.filter(([id, g]) => {
    const grid = { maxHp: 11.684, attack: 7.491, magic: 8.163, speed: 3.648 };
    return KEYS.some(k => Math.abs(g[k] / grid[k] - Math.round(g[k] / grid[k])) >= 0.15);
  }).map(([id]) => id));

// ---------- C. 0~25 级插值（等级上限 25 / 成长 ×1.3） ----------
const levelBad = [], monoBad = [], zeroBad = [], twentyBad = [];
for (const c of chars) {
  let prev = null;
  for (let level = 0; level <= P.maxLevel; level += 1) {
    const s = P.statsAt(c, level);
    for (const k of KEYS) if (isBad(s[k])) levelBad.push(`${c.id}@${level}.${k}=${s[k]}`);
    if (prev) for (const k of KEYS) if (s[k] < prev[k]) monoBad.push(`${c.id}@${level}.${k}`);
    prev = s;
  }
  const zero = P.statsAt(c, 0);
  if (KEYS.some(k => zero[k] !== c.stats[k])) zeroBad.push(c.id);
  const capped = P.statsAt(c, P.maxLevel);
  const g = P.profile(c.id);
  if (KEYS.some(k => capped[k] !== Math.round(c.stats[k] + g[k] * P.growthScale))) twentyBad.push(c.id);
}
T("C1 34×26×4 全部等级属性均为有限非负整数", levelBad.length === 0, levelBad.slice(0, 6));
T("C2 属性随等级单调不减", monoBad.length === 0, monoBad.slice(0, 6));
T("C3 0 级属性等于角色基值", zeroBad.length === 0, zeroBad);
T("C4 满级属性 = 基值 + 成长表×1.3（四舍五入）", twentyBad.length === 0, twentyBad);
T("C5 罗卡尔 0/25 级生命 124/488",
  P.statsAt(chars[0], 0).maxHp === 124 && P.statsAt(chars[0], P.maxLevel).maxHp === Math.round(124 + P.growth.lokar.maxHp * P.growthScale));

// ---------- D. 角色强化加成 ----------
const bonusBad = [];
for (const n of [0, 1, 7, 70]) {
  for (const c of chars) {
    const character = { enhance: Object.fromEntries(KEYS.map(k => [k, n])) };
    const base = P.statsAt(c, 7);
    const out = E.withBonus(base, character);
    for (const k of KEYS) {
      if (!Number.isInteger(out[k]) || out[k] !== base[k] + E.BONUS[k] * n)
        bonusBad.push(`${c.id}@${n}.${k}=${out[k]}`);
    }
  }
}
T("D1 四项 × 4 种次数 × 34 角色强化后仍为整数且等于基值+加成", bonusBad.length === 0, bonusBad.slice(0, 6));
T("D2 小数基数输入按整数口径收敛（40.82 + 1 → 42）",
  E.withBonus({ maxHp: 100, attack: 40.82, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack === 42,
  E.withBonus({ maxHp: 100, attack: 40.82, magic: 5, speed: 11 }, { enhance: { attack: 1 } }).attack);
T("D3 NaN/Infinity 基数归零后仍为整数",
  KEYS.every(k => Number.isInteger(E.withBonus({ [k]: NaN }, { enhance: { [k]: 2 } })[k])));

// ---------- E. 全部怪物 + 难度缩放 ----------
const allEnemies = [
  ...ctx.GameDataMachineFactoryEnemies, ...ctx.GameDataUnderwaterTrainEnemies,
  ...ctx.GameDataFutureEnemies.orc_dungeon, ...ctx.GameDataRuinsSandCityEnemies,
];
const diffs = Object.values(W.difficulties);
T("E1 四副本 canonical 怪物 36 只", allEnemies.length === 36, allEnemies.length);
T("E2 怪物基础四项全为整数且为正",
  allEnemies.every(en => ENEMY_KEYS.every(k => Number.isInteger(en[k]) && en[k] > 0)),
  allEnemies.filter(en => ENEMY_KEYS.some(k => isFrac(en[k]))).map(en => en.id));
const scaledBad = [];
for (const en of allEnemies) {
  for (const d of diffs) {
    const s = W.scaleEnemyStats(en, d, en.type);
    for (const k of ENEMY_KEYS) if (isBad(s[k])) scaledBad.push(`${en.id}/${d.name}.${k}=${s[k]}`);
  }
}
T("E3 36×5 难度缩放全部为有限非负整数", scaledBad.length === 0, scaledBad.slice(0, 6));
T("E4 五档难度数量正确", diffs.length === 5, diffs.length);

// ---------- F. 静态源码/文案 ----------
const statsRe = /(attack|magic|speed|maxHp)\s*:\s*(-?\d+\.\d+)/;
T("F1 statsAt 统一 Math.round(raw)", codeOf("character-progression.js").includes("stats[key] = Math.round(raw);"));
T("F2 withBonus 统一 Math.round",
  codeOf("character-enhance.js").includes("const value = Number.isFinite(raw) ? Math.round(raw) : 0;"));
T("F3 角色数据 stats 块内无小数属性",
  ["data-characters-core.js", "data-characters-extra.js", "data-future-characters.js", "data-new-characters.js"]
    .every(f => [...src(f).matchAll(/stats:\s*\{([^}]*)\}/g)].every(m => !statsRe.test(m[1]))));
T("F4 成长表无小数字面量",
  !statsRe.test(codeOf("character-progression.js").match(/const growth = Object\.freeze\(\{([\s\S]*?)\}\);/)[1]));
T("F5 怪物数据文件无小数基础属性",
  ["data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
    "data-ruins-sand-city-enemies.js", "data-future-enemies.js"]
    .every(f => !/(hp|attack|magic|speed)\s*:\s*\d+\.\d+/.test(src(f))));
T("F6 公告写明全部属性取整",
  codeOf("update-notice-recent.js").includes("属性口径调整：34 名可玩角色")
  && codeOf("update-notice-recent.js").includes("全部角色与怪物属性统一四舍五入取整"));

// ---------- G. 升级重算后仍为整数且加成不丢 ----------
const gChar = {
  level: 0, exp: 0, hp: 100,
  enhance: { maxHp: 2, attack: 3, magic: 1, speed: 4 },
};
P.grant(gChar, 100000, chars[0]);
const gBase = P.statsAt(chars[0], P.maxLevel);
T("G1 升到满级后属性全为整数",
  KEYS.every(k => Number.isInteger(gChar.stats[k])), gChar.stats);
T("G2 强化加成在升级重算后仍在且不重复叠加",
  KEYS.every(k => gChar.stats[k] === gBase[k] + E.BONUS[k] * gChar.enhance[k]),
  { stats: gChar.stats, base: gBase, enhance: gChar.enhance });

console.log(`${pass}/${total}` + (reds.length ? `  REDS=${reds.length}` : ""));
if (REVERT) console.log(`REVERT=${REVERT} REDS=${JSON.stringify(reds)}`);
