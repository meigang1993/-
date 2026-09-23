// 专项：废墟沙城 金币（莉莉丝元）倍率 与 难度属性倍率 是否生效
// 对照副本：魔国机械工厂 1 / 水下列车 1.25 / 兽人地下城 1.7
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

const missions = window.GameDataWorld.missions;
const find = id => missions.find(m => m.id === id);

console.log("=== 各副本金币倍率 ===");
missions.forEach(m => {
  console.log(`  ${String(m.id).padEnd(20)} goldMultiplier=${m.reward?.goldMultiplier}`
    + `  bounty=${JSON.stringify(m.reward?.bountyGoldRange)}`
    + `  legacy=${JSON.stringify(m.reward?.bountyLegacyGoldRanges)}`);
});

console.log("\n=== 断言 ===");

// 1. 废墟沙城 mission 是否在 missions 列表里（否则 multiplier 会 fallback 成 1）
T("废墟沙城 mission 已注册到 GameData.missions", () => {
  const m = find("ruins_sand_city");
  assert.ok(m, "未找到 ruins_sand_city");
  assert.ok(m.reward, "reward 缺失");
});

// 2. 金币倍率存在且 > 1
T("废墟沙城 goldMultiplier 存在且生效（非 fallback 1）", () => {
  const mult = find("ruins_sand_city").reward.goldMultiplier;
  assert.strictEqual(typeof mult, "number", `类型异常: ${typeof mult}`);
  assert.ok(mult !== 1, `倍率为 1，说明未配置或 fallback`);
});

// 3. 对照：副本倍率应递增（越后期越高）
T("副本倍率递增：机械工厂 < 水下列车 < 兽人", () => {
  const a = find("machine_factory").reward.goldMultiplier;
  const b = find("underwater_train").reward.goldMultiplier;
  const c = find("orc_dungeon").reward.goldMultiplier;
  assert.ok(a < b && b < c, `${a} < ${b} < ${c} 不成立`);
});

// 4. 废墟沙城是否仍是兽人的同值（复制遗留检测）
const ruinsMult = find("ruins_sand_city")?.reward?.goldMultiplier;
const orcMult = find("orc_dungeon")?.reward?.goldMultiplier;
console.log(`\n⚠️  废墟沙城 goldMultiplier=${ruinsMult}，兽人地下城=${orcMult}`
  + `  ${ruinsMult === orcMult ? "（完全相同 → 疑似复制兽人配置）" : "（不同）"}`);
const ruinsBounty = JSON.stringify(find("ruins_sand_city")?.reward?.bountyGoldRange);
const orcBounty = JSON.stringify(find("orc_dungeon")?.reward?.bountyGoldRange);
console.log(`⚠️  废墟沙城 bounty=${ruinsBounty}，兽人=${orcBounty}`
  + `  ${ruinsBounty === orcBounty ? "（完全相同 → 疑似复制）" : "（不同）"}`);
const ruinsLegacy = JSON.stringify(find("ruins_sand_city")?.reward?.bountyLegacyGoldRanges);
const orcLegacy = JSON.stringify(find("orc_dungeon")?.reward?.bountyLegacyGoldRanges);
console.log(`⚠️  废墟沙城 legacy=${ruinsLegacy}，兽人=${orcLegacy}`
  + `  ${ruinsLegacy === orcLegacy ? "（完全相同 → 疑似复制）" : "（不同）"}`);

// 4b. 硬断言：废墟沙城必须高于兽人（已确认改为 2.3，不再是复制遗留）
T("废墟沙城金币倍率高于兽人地下城（非复制遗留）", () => {
  assert.ok(ruinsMult > orcMult, `废墟沙城 ${ruinsMult} 未高于兽人 ${orcMult}`);
  assert.notStrictEqual(ruinsBounty, orcBounty, `bounty 区间仍与兽人相同: ${ruinsBounty}`);
  assert.notStrictEqual(ruinsLegacy, orcLegacy, `legacy 区间仍与兽人相同: ${ruinsLegacy}`);
});

// 4c. 递增链条完整：机械工厂 < 水下列车 < 兽人 < 废墟沙城
T("副本倍率递增：机械工厂 < 水下列车 < 兽人 < 废墟沙城", () => {
  const a = find("machine_factory").reward.goldMultiplier;
  const b = find("underwater_train").reward.goldMultiplier;
  const c = find("orc_dungeon").reward.goldMultiplier;
  assert.ok(a < b && b < c && c < ruinsMult, `${a} < ${b} < ${c} < ${ruinsMult} 不成立`);
});

// 4d. 旧存档兼容：legacy 保留曾与兽人相同的 [1200,2000]
T("废墟沙城 legacy 保留旧区间 [1200,2000] 兼容旧存档", () => {
  const legacy = find("ruins_sand_city").reward.bountyLegacyGoldRanges || [];
  assert.ok(legacy.some(r => r[0] === 1200 && r[1] === 2000),
    `未找到 [1200,2000] 兼容区间: ${JSON.stringify(legacy)}`);
});

// ===== 难度属性倍率 =====
console.log("\n=== 难度属性倍率（废墟沙城敌人） ===");
const ruinsEnemies = window.GameDataRuinsSandCityEnemies;
const diffKeys = Object.keys(window.GameDataWorld.difficulties);
console.log("  难度:", diffKeys.join(", "));

// 5. 每个敌人的 type 都能在 difficulties.enemy 里找到（否则 ?? 1 导致倍率失效）
T("废墟沙城所有敌人的 type 都在难度表中有定义", () => {
  ruinsEnemies.forEach(e => {
    assert.ok(["normal", "elite", "boss"].includes(e.type),
      `${e.id} 的 type="${e.type}" 不在难度表中，倍率会 fallback 成 1`);
  });
});

// 6. 逐个难度逐属性验证缩放
diffKeys.forEach(dk => {
  const diff = window.GameDataWorld.difficulties[dk];
  T(`难度 ${diff.name}：废墟沙城敌人属性按倍率缩放`, () => {
    ruinsEnemies.forEach(e => {
      const s = window.GameDataWorld.scaleEnemyStats(e, diff, e.type);
      const cfg = diff.enemy[e.type];
      if (Number.isFinite(e.hp)) {
        assert.strictEqual(s.hp, Math.ceil(e.hp * cfg.hp), `${e.id} hp ${e.hp}→${s.hp} 期望 ${Math.ceil(e.hp * cfg.hp)}`);
      }
      ["attack", "magic"].forEach(k => {
        if (Number.isFinite(e[k])) {
          assert.strictEqual(s[k], Math.round(e[k] * cfg.power), `${e.id} ${k} 期望 ${Math.round(e[k] * cfg.power)} 实得 ${s[k]}`);
        }
      });
      if (Number.isFinite(e.speed)) {
        assert.strictEqual(s.speed, Math.round(e.speed * cfg.speed), `${e.id} speed 期望 ${Math.round(e.speed * cfg.speed)} 实得 ${s.speed}`);
      }
    });
  });
});

// 7. 抽样打印：机械AI龙在各难度下的属性
console.log("\n=== 机械AI龙（boss）各难度属性 ===");
const dragon = ruinsEnemies.find(e => e.id === "mech_ai_dragon");
diffKeys.forEach(dk => {
  const diff = window.GameDataWorld.difficulties[dk];
  const s = window.GameDataWorld.scaleEnemyStats(dragon, diff, dragon.type);
  console.log(`  ${diff.name.padEnd(4)} hp=${String(s.hp).padStart(4)}`
    + ` attack=${String(s.attack).padStart(3)} magic=${String(s.magic).padStart(3)}`
    + ` speed=${String(s.speed).padStart(3)}`);
});

// 8. 金币结算链路：rollGold 是否真的乘了 multiplier
T("rollGold 公式含 mission goldMultiplier（源码级确认）", () => {
  const src = require("fs").readFileSync(`${__dirname}/../src/original/dungeon-reward-core.js`, "utf8");
  assert.ok(/mission\?\.reward\?\.goldMultiplier/.test(src), "未找到 multiplier 参与计算");
  assert.ok(/diff\.reward/.test(src), "未找到难度倍率");
});

console.log(`\n=== ${pass}/${total} 通过 ===`);
process.exit(pass === total ? 0 : 1);
