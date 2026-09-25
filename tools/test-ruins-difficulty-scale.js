// 专项：废墟沙城 四个普通怪 在各难度下的属性缩放是否正确
// 缩放实现见 data-world.js 的 scaleEnemyStats：
//   hp      = ceil(base * raw.hp)
//   attack  = round(base * raw.power)      magic 同理
//   speed   = round(base * raw.speed)
//   bloodlust / handLimit / drawPerTurn = base + raw[k]（ difficulties 未提供 → 保持基础值 ）
//   initialDraw 不在缩放列表 → 保持基础值
// 本次只改基础属性，不碰技能机制、难度倍率、节点数量、组队规则。
const assert = require("assert");

global.window = global;
[
  "economy-config.js",
  "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-ruins-sand-city.js",
  "data-future-dungeons.js",
  "data-world.js",
].forEach(file => require(`../src/original/${file}`));

let pass = 0, total = 0;
const T = (name, fn) => {
  total++;
  try { fn(); pass++; console.log(`✅ ${name}`); }
  catch (e) { console.log(`❌ ${name}  ← ${e.message}`); }
};

const W = window.GameDataWorld;
const diffs = W.difficulties;
const ruins = W.enemies.ruins_sand_city;
const GRUNTS = ["noble_soldier", "noble_sniper", "merca_tank", "attack_drone"];
const grunts = ruins.filter(e => GRUNTS.includes(e.id));

// 期望基础值（2026-09-25 调整后）
const BASE = {
  noble_soldier: { hp: 60, attack: 9, magic: 7, speed: 14, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  noble_sniper:  { hp: 52, attack: 10, magic: 7, speed: 17, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
  merca_tank:    { hp: 80, attack: 8, magic: 8, speed: 12, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  attack_drone:  { hp: 44, attack: 8, magic: 8, speed: 18, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
};

console.log("=== 基础值核对 ===");
grunts.forEach(e => {
  const b = BASE[e.id];
  console.log(`  ${String(e.name).padEnd(12)} hp=${e.hp} 攻=${e.attack} 魔=${e.magic} 速=${e.speed}`
    + ` 杀意=${e.bloodlust} 手牌=${e.handLimit} 摸牌=2+${e.drawPerTurn} 初始=4+${e.initialDraw}`);
});

console.log("\n=== 各难度缩放结果（废墟沙城普通怪） ===");
Object.entries(diffs).forEach(([key, d]) => {
  const r = d.enemy.normal;
  console.log(`\n[${d.name}] hp×${r.hp} power×${r.power} speed×${r.speed}`);
  grunts.forEach(e => {
    const s = W.scaleEnemyStats(e, d, "normal");
    console.log(`   ${String(e.name).padEnd(12)} hp=${String(s.hp).padStart(3)}`
      + ` 攻=${String(s.attack).padStart(2)} 魔=${String(s.magic).padStart(2)} 速=${String(s.speed).padStart(2)}`
      + ` 杀意=${s.bloodlust} 手牌=${s.handLimit}`);
  });
});

console.log("\n=== 断言 ===");

// 1. 四个普通怪都在且基础值与设定一致
GRUNTS.forEach(id => {
  const e = grunts.find(x => x.id === id);
  T(`基础值 ${id} 与设定一致`, () => {
    assert.ok(e, `未找到 ${id}`);
    const b = BASE[id];
    assert.strictEqual(e.hp, b.hp, `hp ${e.hp}≠${b.hp}`);
    assert.strictEqual(e.attack, b.attack, `attack ${e.attack}≠${b.attack}`);
    assert.strictEqual(e.magic, b.magic, `magic ${e.magic}≠${b.magic}`);
    assert.strictEqual(e.speed, b.speed, `speed ${e.speed}≠${b.speed}`);
    assert.strictEqual(e.bloodlust, b.bloodlust, `bloodlust ${e.bloodlust}≠${b.bloodlust}`);
    assert.strictEqual(e.handLimit, b.handLimit, `handLimit ${e.handLimit}≠${b.handLimit}`);
    assert.strictEqual(e.drawPerTurn, b.drawPerTurn, `drawPerTurn ${e.drawPerTurn}≠${b.drawPerTurn}`);
    assert.strictEqual(e.initialDraw, b.initialDraw, `initialDraw ${e.initialDraw}≠${b.initialDraw}`);
  });
});

// 2. 平均值符合设计
T("四项平均值符合设计（HP59 攻8.75 魔7.5 速15.25）", () => {
  const avg = k => grunts.reduce((s, e) => s + e[k], 0) / grunts.length;
  assert.strictEqual(avg("hp"), 59, `HP 均值 ${avg("hp")}`);
  assert.strictEqual(avg("attack"), 8.75, `攻击均值 ${avg("attack")}`);
  assert.strictEqual(avg("magic"), 7.5, `魔力均值 ${avg("magic")}`);
  assert.strictEqual(avg("speed"), 15.25, `速度均值 ${avg("speed")}`);
});

// 3. 缩放公式逐难度验证（hp=ceil, 攻魔速=round）
Object.entries(diffs).forEach(([key, d]) => {
  const r = d.enemy.normal;
  T(`${d.name}：四怪 hp/攻/魔/速 缩放公式正确`, () => {
    grunts.forEach(e => {
      const s = W.scaleEnemyStats(e, d, "normal");
      assert.strictEqual(s.hp, Math.ceil(e.hp * r.hp), `${e.name} hp ${s.hp}≠${Math.ceil(e.hp * r.hp)}`);
      assert.strictEqual(s.attack, Math.round(e.attack * r.power), `${e.name} attack ${s.attack}`);
      assert.strictEqual(s.magic, Math.round(e.magic * r.power), `${e.name} magic ${s.magic}`);
      assert.strictEqual(s.speed, Math.round(e.speed * r.speed), `${e.name} speed ${s.speed}`);
    });
  });
});

// 4. 非缩放字段在各难度下保持不变
Object.entries(diffs).forEach(([key, d]) => {
  T(`${d.name}：杀意/手牌/摸牌/初始摸牌 不被缩放`, () => {
    grunts.forEach(e => {
      const s = W.scaleEnemyStats(e, d, "normal");
      ["bloodlust", "handLimit", "drawPerTurn", "initialDraw"].forEach(k => {
        assert.strictEqual(s[k], e[k], `${e.name}.${k} 被缩放为 ${s[k]}，应为 ${e[k]}`);
      });
    });
  });
});

// 5. HP 随难度单调递增
T("HP 随难度严格递增（普通→英雄）", () => {
  grunts.forEach(e => {
    const hps = ["normal", "adventure", "warrior", "king", "hell"]
      .map(k => W.scaleEnemyStats(e, diffs[k], "normal").hp);
    for (let i = 1; i < hps.length; i++) {
      assert.ok(hps[i] > hps[i - 1], `${e.name} HP 未递增: ${hps.join("→")}`);
    }
  });
});

// 6. 坦克炮弹 = 攻击力 2 倍，各难度每人伤害
T("坦克炮弹伤害 = 攻击力×2（普通级每人 16）", () => {
  const tank = grunts.find(e => e.id === "merca_tank");
  const normal = W.scaleEnemyStats(tank, diffs.normal, "normal");
  assert.strictEqual(normal.attack * 2, 16, `普通级炮弹 ${normal.attack * 2}≠16`);
  const hell = W.scaleEnemyStats(tank, diffs.hell, "normal");
  console.log(`\n   坦克炮弹：普通级每人 ${normal.attack * 2}，英雄级每人 ${hell.attack * 2}`);
  console.log(`   四坦克齐射：普通级每人 ${normal.attack * 2 * 4}，英雄级每人 ${hell.attack * 2 * 4}`);
  assert.strictEqual(normal.attack * 2 * 4, 64, `四坦克齐射 ${normal.attack * 2 * 4}≠64`);
});

// 7. 无人机杀意降为 1（限制同回合连施毒+麻痹）
T("攻击型无人机杀意 = 1", () => {
  const drone = grunts.find(e => e.id === "attack_drone");
  assert.strictEqual(drone.bloodlust, 1, `无人机杀意 ${drone.bloodlust}≠1`);
});

// 8. 缩放不得改变技能机制（技能数量与文本保持一致）
T("缩放未改动技能机制（技能名与数量不变）", () => {
  grunts.forEach(e => {
    Object.values(diffs).forEach(d => {
      const s = W.scaleEnemyStats(e, d, "normal");
      assert.strictEqual(s.skills.length, e.skills.length, `${e.name} 技能数被改`);
      s.skills.forEach((sk, i) => {
        assert.strictEqual(sk.name, e.skills[i].name, `${e.name} 技能名被改`);
        assert.strictEqual(sk.text, e.skills[i].text, `${e.name} 技能描述被改`);
      });
    });
  });
});

// 9. 对照：废墟普通怪不应强于同副本精英/Boss
T("废墟普通怪 HP 均低于同副本精英与 Boss", () => {
  const eliteBoss = ruins.filter(e => !GRUNTS.includes(e.id));
  assert.ok(eliteBoss.length, "未找到精英/Boss");
  grunts.forEach(e => {
    eliteBoss.forEach(b => {
      assert.ok(e.hp < b.hp, `普通怪 ${e.name}(${e.hp}) 不低于 ${b.name}(${b.hp})`);
    });
  });
});

// 10. 对照：其他副本普通怪不应被本次改动影响
const OTHER = ["machine_factory", "underwater_train"];
T("其他副本普通怪属性未被本次改动影响", () => {
  OTHER.forEach(key => {
    const list = (W.enemies[key] || []).filter(e => e.type === "normal");
    assert.ok(list.length, `${key} 无普通怪，对照失效`);
    console.log(`\n   ${key} 普通怪 ${list.length} 个：`
      + list.map(e => `${e.name}(hp${e.hp}/攻${e.attack})`).join("、"));
    list.forEach(e => {
      assert.ok(!GRUNTS.includes(e.id), `${key} 里混入了废墟怪 ${e.id}`);
    });
  });
});

// 11. 定位校验：废墟普通怪应强于前置副本普通怪（后期副本耐久）
T("废墟普通怪强度高于机械工厂与水下列车", () => {
  OTHER.forEach(key => {
    const list = (W.enemies[key] || []).filter(e => e.type === "normal");
    const avg = k => list.reduce((s, e) => s + e[k], 0) / list.length;
    const ruinsAvg = k => grunts.reduce((s, e) => s + e[k], 0) / grunts.length;
    assert.ok(ruinsAvg("hp") > avg("hp"), `${key} HP 均值 ${avg("hp")} 未低于废墟 ${ruinsAvg("hp")}`);
    assert.ok(ruinsAvg("attack") > avg("attack"), `${key} 攻击均值 ${avg("attack")} 未低于废墟 ${ruinsAvg("attack")}`);
    console.log(`   ${key}: HP均值 ${avg("hp").toFixed(1)} / 攻击均值 ${avg("attack").toFixed(2)}`
      + `  ← 废墟 ${ruinsAvg("hp").toFixed(1)} / ${ruinsAvg("attack").toFixed(2)}`);
  });
});

console.log(`\n通过 ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
