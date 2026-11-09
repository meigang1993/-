// 验证「全角色/全怪物基础属性翻倍后，难度倍率改为线性加成」。
//
// 规格：冒险 +40%/+30%/+20%（生命/输出/速度），其后逐档 +40/+30/+20 个百分点，
// 即 hp 1.4→1.8→2.2→2.6、power 1.3→1.6→1.9→2.2、speed 1.2→1.4→1.6→1.8，
// 普通级保持 1.00。精英与首领使用同一套倍率。
//
// 关键点：不能只核对配置数字，必须走 GameData.scaleEnemyStats 算出
// 真实敌人的 hp/attack/magic/speed，确认倍率真的落地到数值上；
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

// 新规格：生命/输出/速度逐档线性加成（普通级不动）
const SPEC = {
  normal:    { hp: 1,   power: 1,   speed: 1 },
  adventure: { hp: 1.4, power: 1.3, speed: 1.2 },
  warrior:   { hp: 1.8, power: 1.6, speed: 1.4 },
  king:      { hp: 2.2, power: 1.9, speed: 1.6 },
  hell:      { hp: 2.6, power: 2.2, speed: 1.8 },
};
const TIERS = ["adventure", "warrior", "king", "hell"];
const STEP = { hp: 0.4, power: 0.3, speed: 0.2 };

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra !== undefined ? "  ← " + JSON.stringify(extra) : ""}`); }
}

console.log("=== A. 倍率表：四档线性加成，普通级不动 ===");
for (const id of ["normal", ...TIERS]) {
  for (const type of ["normal", "elite", "boss"]) {
    const cur = D[id].enemy[type];
    const exp = SPEC[id];
    ok(cur.hp === exp.hp && cur.power === exp.power && cur.speed === exp.speed,
      `${id}/${type} 倍率 = ${exp.hp}/${exp.power}/${exp.speed}`, cur);
  }
}
// 线性步长：每档比上一档恰好 +0.4 / +0.3 / +0.2
for (const k of Object.keys(STEP)) {
  const seq = [D.normal.enemy.normal[k], ...TIERS.map(id => D[id].enemy.normal[k])];
  ok(seq.every((v, i) => i === 0 || Math.abs(v - seq[i - 1] - STEP[k]) < 1e-9),
    `${k} 逐档步长 = ${STEP[k]}`, seq);
}

console.log("=== B. 同一难度内 normal/elite/boss 倍率一致 ===");
for (const id of TIERS) {
  const { normal: n, elite: e, boss: b } = D[id].enemy;
  ok(n.hp === e.hp && e.hp === b.hp && n.power === e.power && e.power === b.power && n.speed === e.speed && e.speed === b.speed,
    `${id} 三种敌人类型倍率一致`, { n, e, b });
}

console.log("=== C. 真实敌人属性：倍率确实落到数值上 ===");
// 机械工厂真实精英（基础属性已翻倍：hp 180 / attack 14 / magic 16 / speed 18）
const base = (window.GameData.enemies.machine_factory || []).find(e => e.id === "elrana_clone")
  || { hp: 180, attack: 14, magic: 16, speed: 18, bloodlust: 3, handLimit: 3, drawPerTurn: 2 };
console.log(`  基准敌人 hp=${base.hp} attack=${base.attack} magic=${base.magic} speed=${base.speed}`);
const KEYS = ["hp", "attack", "magic", "speed"];
for (const id of TIERS) {
  for (const type of ["normal", "elite", "boss"]) {
    const scaled = window.GameData.scaleEnemyStats(base, D[id], type);
    const mult = SPEC[id];
    for (const k of KEYS) {
      const factor = k === "hp" ? mult.hp : (k === "speed" ? mult.speed : mult.power);
      const expected = k === "hp" ? Math.ceil(base[k] * factor) : Math.round(base[k] * factor);
      ok(scaled[k] === expected,
        `${id}/${type} ${k}: ${base[k]} × ${factor} → ${scaled[k]}`, { scaled: scaled[k], expected });
    }
  }
}

console.log("=== C2. 大基数 BOSS：hp 比值贴近难度倍率 ===");
const boss = (window.GameData.enemies.machine_factory || []).find(e => e.id === "pursuer_edis")
  || { hp: 440, attack: 12, magic: 10, speed: 20 };
console.log(`  基准 BOSS hp=${boss.hp}`);
for (const id of TIERS) {
  const n = window.GameData.scaleEnemyStats(boss, D[id], "boss");
  const r = n.hp / boss.hp;
  ok(Math.abs(r - SPEC[id].hp) <= 0.01, `${id} BOSS hp: ${boss.hp} → ${n.hp}（比值 ${r.toFixed(4)}）`, { now: n.hp, expect: SPEC[id].hp });
}

console.log("=== C3. 四个副本的敌人全部生效（逐副本实测且随难度递增）===");
const MISSIONS = Object.keys(window.GameData.enemies || {});
console.log(`  副本: ${MISSIONS.join(", ")}`);
let covered = 0;
for (const mid of MISSIONS) {
  const pool = window.GameData.enemies[mid] || [];
  if (!pool.length) continue;
  const e = pool[0];
  const seq = ["normal", ...TIERS].map(id => window.GameData.scaleEnemyStats(e, D[id], "normal"));
  covered++;
  ok(KEYS.every(k => seq.every((s, i) => i === 0 || s[k] > seq[i - 1][k])),
    `${mid} ${e.name || e.id}: ${KEYS.map(k => seq.map(s => s[k]).join("→")).join(" | ")}`,
    seq.map(s => ({ hp: s.hp, attack: s.attack, speed: s.speed })));
}
ok(covered >= 4, `至少覆盖 4 个副本`, covered);

console.log("=== D. 界面 attrText 与实际倍率一致（文案不骗人）===");
for (const id of TIERS) {
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
