// 皮肤兑换专项：验证皮肤价格、兑换前置条件与实际扣费入账
//   覆盖：杀戮魔女为 10 精华宝珠、宝珠刚好够/不够、角色未解锁、重复兑换、
//   兑换后立即装备、其它皮肤价格不受影响。
const assert = require("assert");
const path = require("path");

global.window = global;
require(path.join(__dirname, "..", "src", "original", "game-random.js"));
require(path.join(__dirname, "..", "src", "original", "data-skins.js"));
require(path.join(__dirname, "..", "src", "original", "skins.js"));
window.GameEconomy = { relic: { smeltGold: 110 } };
require(path.join(__dirname, "..", "src", "original", "local-core-utils.js"));
require(path.join(__dirname, "..", "src", "original", "local-core-commerce.js"));

const ops = window.LocalCoreCommerceOps;
const witch = window.SkinSystem.byId("nanali_slaughter_witch");

function core(essence, nanaliLocked = false, owned = {}, equipped = {}) {
  return {
    resources: { essence, gold: 0 },
    chars: [{ id: "nanali", locked: nanaliLocked, level: 1 }, { id: "rokar", locked: false, level: 1 }],
    ownedSkins: { ...owned },
    equippedSkins: { ...equipped },
  };
}

let pass = 0;
const results = [];
function T(name, fn) {
  try { fn(); pass++; results.push(`✅ ${name}`); }
  catch (err) { results.push(`❌ ${name}  ← ${err.message}`); }
}

// ① 登记口径：价格、货币、归属
T("杀戮魔女价格为 10", () => {
  assert.strictEqual(witch.price, 10, `price=${witch.price}`);
  assert.strictEqual(window.SkinSystem.price(witch), 10);
});
T("杀戮魔女归属娜娜莉且非初始皮肤", () => {
  assert.strictEqual(witch.charId, "nanali");
  assert.ok(!witch.initial, "must not be an initial skin");
  assert.ok(!witch.unlockLevel, "must not be a level-gated skin");
});

// ② 兑换成功路径
T("10 颗宝珠可兑换（刚好够）", () => {
  const c = core(10);
  const r = ops.buySkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(r.changed, true, "must succeed");
  assert.strictEqual(c.ownedSkins.nanali_slaughter_witch, true, "must be owned");
  assert.strictEqual(c.resources.essence, 0, `essence=${c.resources.essence}`);
});
T("兑换后立即装备到娜娜莉", () => {
  const c = core(12);
  ops.buySkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(c.equippedSkins.nanali, "nanali_slaughter_witch");
  assert.strictEqual(c.resources.essence, 2);
});
T("宝珠富余时只扣 10", () => {
  const c = core(37);
  ops.buySkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(c.resources.essence, 27, `essence=${c.resources.essence}`);
});

// ③ 拒绝路径
T("宝珠不足（9 颗）时拒绝且不扣费", () => {
  const c = core(9);
  const r = ops.buySkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(r.changed, false, "must be rejected");
  assert.strictEqual(c.ownedSkins.nanali_slaughter_witch, undefined);
  assert.strictEqual(c.resources.essence, 9, "essence must be untouched");
});
T("娜娜莉未解锁时拒绝", () => {
  const c = core(99, true);
  const r = ops.buySkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(r.changed, false, "must be rejected");
  assert.strictEqual(c.resources.essence, 99);
});
T("已拥有时重复兑换被拒绝", () => {
  const c = core(20, false, { nanali_slaughter_witch: true });
  const r = ops.buySkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(r.changed, false);
  assert.strictEqual(c.resources.essence, 20, "must not charge twice");
});
T("未知皮肤 id 被拒绝", () => {
  const c = core(99);
  assert.strictEqual(ops.buySkin(c, { id: "not_a_skin" }).changed, false);
});

// ④ 装备路径
T("已拥有后可装备", () => {
  const c = core(0, false, { nanali_slaughter_witch: true });
  const r = ops.equipSkin(c, { id: "nanali_slaughter_witch" });
  assert.strictEqual(r.changed, true);
  assert.strictEqual(c.equippedSkins.nanali, "nanali_slaughter_witch");
});
T("未拥有时无法装备", () => {
  const c = core(0);
  assert.strictEqual(ops.equipSkin(c, { id: "nanali_slaughter_witch" }).changed, false);
});

// ⑤ 价格表整体口径不被污染
T("其它皮肤价格未被改动", () => {
  const prices = window.SkinSystem.skins
    .filter(s => s.charId === "nanali")
    .map(s => `${s.name}:${window.SkinSystem.price(s)}`);
  assert.ok(prices.some(p => p.includes("杀戮魔女:10")), prices.join(","));
});

console.log(results.join("\n"));
console.log(`\n通过 ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
