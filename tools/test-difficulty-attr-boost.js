// 验证「冒险级及以上难度，敌人属性倍率整体 +20%」。
//
// 关键点：不能只核对配置数字，必须走 GameData.scaleEnemyStats 算出
// 真实敌人的 hp/attack/magic/speed，确认提升真的落地到数值上；
// 同时核对界面 attrText 文案与实际倍率一致（不能改了数值忘了改文案）。

const fs = require("fs");
const vm = require("vm");

global.window = global;
global.console = console;
function load(file) {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file });
}
[
  "game-random.js",
  "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js", "data-ruins-content.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
].forEach(load);

const D = window.GameData.difficulties;

// 本次调整前的原始倍率（改动前 data-world.js 的值）
const OLD = {
  normal:    { hp: 1,    power: 1,    speed: 1 },
  adventure: { hp: 1.25, power: 1.20, speed: 1.12 },
  warrior:   { hp: 1.55, power: 1.42, speed: 1.26 },
  king:      { hp: 1.95, power: 1.68, speed: 1.42 },
  hell:      { hp: 2.45, power: 1.98, speed: 1.58 },
};

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? "  ← " + JSON.stringify(extra) : ""}`); }
}
// speed 保留两位小数，允许 0.6% 舍入误差；hp/power 精确
function near(a, b, tol) { return Math.abs(a / b - 1) <= tol; }

console.log("=== A. 倍率表：冒险级及以上各 +20%，普通级不动 ===");
for (const id of ["normal", "adventure", "warrior", "king", "hell"]) {
  for (const type of ["normal", "elite", "boss"]) {
    const cur = D[id].enemy[type];
    const old = OLD[id];
    if (id === "normal") {
      ok(cur.hp === 1 && cur.power === 1 && cur.speed === 1,
        `普通级/${type} 保持基础倍率 1`, cur);
    } else {
      ok(near(cur.hp, old.hp * 1.2, 0.006), `${id}/${type} hp 提升 20%`, { cur: cur.hp, expect: +(old.hp * 1.2).toFixed(4) });
      ok(near(cur.power, old.power * 1.2, 0.006), `${id}/${type} power 提升 20%`, { cur: cur.power, expect: +(old.power * 1.2).toFixed(4) });
      ok(near(cur.speed, old.speed * 1.2, 0.006), `${id}/${type} speed 提升 20%`, { cur: cur.speed, expect: +(old.speed * 1.2).toFixed(4) });
    }
  }
}

console.log("=== B. 同一难度内 normal/elite/boss 倍率一致 ===");
for (const id of ["adventure", "warrior", "king", "hell"]) {
  const { normal: n, elite: e, boss: b } = D[id].enemy;
  ok(n.hp === e.hp && e.hp === b.hp && n.power === e.power && e.power === b.power && n.speed === e.speed && e.speed === b.speed,
    `${id} 三种敌人类型倍率一致`, { n, e, b });
}

console.log("=== C. 真实敌人属性：+20% 真的落到数值上 ===");
// 机械工厂真实精英：hp 90 / attack 7 / magic 8 / speed 9
const base = (window.GameData.enemies.machine_factory || []).find(e => e.id === "elrana_clone")
  || { hp: 90, attack: 7, magic: 8, speed: 9, bloodlust: 3, handLimit: 3, drawPerTurn: 2 };
console.log(`  基准敌人 hp=${base.hp} attack=${base.attack} magic=${base.magic} speed=${base.speed}`);
// 说明：hp 走 ceil、attack/magic/speed 走 round，小基数取整会放大实际比值。
// 例：magic=8 时 round(8×1.42)=11 → round(8×1.704)=14，比值 1.273。
// 所以 hp（基数大）断言比例贴近 1.2，其余只断言“确有提升且幅度合理”。
const TIGHT = ["hp"], LOOSE = ["attack", "magic", "speed"];
for (const id of ["adventure", "warrior", "king", "hell"]) {
  for (const type of ["normal", "elite", "boss"]) {
    const oldStats = window.GameData.scaleEnemyStats(base, { enemy: { [type]: OLD[id] } }, type);
    const newStats = window.GameData.scaleEnemyStats(base, D[id], type);
    for (const k of [...TIGHT, ...LOOSE]) {
      if (!Number.isFinite(oldStats[k]) || !Number.isFinite(newStats[k])) continue;
      const r = newStats[k] / oldStats[k];
      const [lo, hi] = TIGHT.includes(k) ? [1.18, 1.22] : [1.05, 1.35];
      ok(r > 1.0 && r >= lo && r <= hi,
        `${id}/${type} ${k}: ${oldStats[k]} → ${newStats[k]}（比值 ${r.toFixed(3)}）`, { old: oldStats[k], now: newStats[k] });
    }
  }
}

console.log("=== C2. 大基数 BOSS：hp 比例应精准贴近 1.2 ===");
const boss = (window.GameData.enemies.machine_factory || []).find(e => e.id === "pursuer_edis")
  || { hp: 220, attack: 6, magic: 5, speed: 10 };
console.log(`  基准 BOSS hp=${boss.hp}`);
for (const id of ["adventure", "warrior", "king", "hell"]) {
  const o = window.GameData.scaleEnemyStats(boss, { enemy: { boss: OLD[id] } }, "boss");
  const n = window.GameData.scaleEnemyStats(boss, D[id], "boss");
  const r = n.hp / o.hp;
  ok(Math.abs(r - 1.2) <= 0.01, `${id} BOSS hp: ${o.hp} → ${n.hp}（比值 ${r.toFixed(4)}）`, { old: o.hp, now: n.hp });
}

console.log("=== C3. 四个副本的敌人全部生效（倍率是全局表，逐副本实测）===");
const MISSIONS = Object.keys(window.GameData.enemies || {});
console.log(`  副本: ${MISSIONS.join(", ")}`);
let covered = 0;
for (const mid of MISSIONS) {
  const pool = window.GameData.enemies[mid] || [];
  if (!pool.length) continue;
  const e = pool[0];
  for (const id of ["adventure", "warrior", "king", "hell"]) {
    const o = window.GameData.scaleEnemyStats(e, { enemy: { normal: OLD[id] } }, "normal");
    const n = window.GameData.scaleEnemyStats(e, D[id], "normal");
    covered++;
    ok(n.hp > o.hp && n.attack >= o.attack && n.speed >= o.speed,
      `${mid}/${id} ${e.name || e.id}: hp ${o.hp}→${n.hp} atk ${o.attack}→${n.attack} spd ${o.speed}→${n.speed}`,
      { old: o, now: n });
  }
}
ok(covered >= 16, `至少覆盖 16 组（4 副本 × 4 难度）`, covered);

console.log("=== D. 界面 attrText 与实际倍率一致（文案不骗人）===");
for (const id of ["adventure", "warrior", "king", "hell"]) {
  const m = String(D[id].attrText).match(/生命(\d+)%/);
  const p = String(D[id].attrText).match(/输出(\d+)%/);
  const s = String(D[id].attrText).match(/速度(\d+)%/);
  ok(m && Math.abs(+m[1] - D[id].enemy.normal.hp * 100) <= 1, `${id} attrText 生命值与实际一致`, { text: D[id].attrText, real: D[id].enemy.normal.hp * 100 });
  ok(p && Math.abs(+p[1] - D[id].enemy.normal.power * 100) <= 1, `${id} attrText 输出值与实际一致`, { text: D[id].attrText, real: D[id].enemy.normal.power * 100 });
  ok(s && Math.abs(+s[1] - D[id].enemy.normal.speed * 100) <= 1, `${id} attrText 速度值与实际一致`, { text: D[id].attrText, real: D[id].enemy.normal.speed * 100 });
}

console.log("=== E. 非属性项未被误改（奖励/精英率/掉落/经验）===");
const EXPECT_OTHER = {
  adventure: { eliteRate: .3, reward: 1.35, xp: 1.15, dropRate: .4 },
  warrior:   { eliteRate: .4, reward: 1.75, xp: 1.35, dropRate: .5 },
  king:      { eliteRate: .5, reward: 2.2, xp: 1.6, dropRate: .6 },
  hell:      { eliteRate: .6, reward: 2.75, xp: 1.9, dropRate: .7 },
};
for (const [id, exp] of Object.entries(EXPECT_OTHER)) {
  for (const [k, v] of Object.entries(exp)) {
    ok(D[id][k] === v, `${id}.${k} 仍为 ${v}`, D[id][k]);
  }
}

console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
