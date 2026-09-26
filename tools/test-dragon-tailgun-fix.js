// 机械AI龙 机尾机枪 三处修复：
//  1) 触发阈值应为「当前手牌数」，此前写成 visible().length || dragon.handLimit，
//     手牌数为 0 时 0 是 falsy，阈值退化为手牌上限 → 变成「攒够手牌上限次攻击」。
//  2) 虚拟牌必须以实体牌【机枪扫杀】为模板建，此前手搓 { name:"机尾机枪",
//     type:"skill" } 既不是杀牌也没有 allTargets/aoeLineShown → 无全体目标线、
//     群体牌判定（isGroupTargetCard）全失效。
//  3) 描述里的「（此虚拟牌可被【闪】响应）」文案删除（静态检查见 check:docs）。
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
[
  "ruins-dragon-skills.js",
].forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"),
  { filename: file },
));

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed += 1; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { failed += 1; console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
};

const CARD = { name: "杀（普攻）", type: "slash", suit: "♠" };

// handCount 张手牌的龙。作弊：直接铺等量占位牌，不走摸牌流程，缩短测试时间。
const mkDragon = handCount => ({
  uid: "d1", name: "机械AI龙", ai: "ruins_dragon", hp: 342, side: "enemy",
  hand: Array.from({ length: handCount }, () => ({ name: "占位", type: "slash" })),
  handLimit: 4, block: 0,
  stats: { attack: 13, magic: 8, speed: 15 },
  ruinsHitsThisTurn: 0, ruinsGunFired: false,
});

// 打一次龙。返回本次是否开火。
function hit(state, dragon, captured) {
  const damage = (s, target, amount, source, actor, card) => {
    captured.push(card);
    return { hpLoss: amount };
  };
  window.RuinsDragonSkills.afterDamage(
    state, { uid: "a1", side: "ally" }, dragon, { ...CARD }, 5, damage, () => ({}));
  return captured.length > 0;
}

function mkState(dragon, allyCount) {
  const allies = Array.from({ length: allyCount }, (_, i) => ({
    uid: `a${i + 1}`, name: `友方${i + 1}`, side: "ally", hp: 300, block: 0,
  }));
  return { battle: { allies, enemies: [dragon], animQueue: [] }, log: [] };
}

// ---------- 场景A：阈值为「当前手牌数」，不是手牌上限 ----------
// 手牌 2（≠ 上限 4）：第 2 次受击触发
{
  const dragon = mkDragon(2), cap = [], state = mkState(dragon, 2);
  const f1 = hit(state, dragon, cap);
  const f2 = hit(state, dragon, cap);
  check("A1 手牌2·第1次受击不触发", f1 === false, `hits=${dragon.ruinsHitsThisTurn}`);
  check("A2 手牌2·第2次受击触发（阈值=手牌数2）", f2 === true,
    `hits=${dragon.ruinsHitsThisTurn}`);
}

// 手牌 0：阈值为 1，第 1 次受击即触发
// 旧 BUG 下阈值退化成 handLimit=4，第 1 次不会触发 —— 这是最关键的区分点
{
  const dragon = mkDragon(0), cap = [], state = mkState(dragon, 2);
  const f1 = hit(state, dragon, cap);
  check("A3 手牌0·第1次受击即触发（旧BUG需凑满手牌上限4次）", f1 === true,
    `hits=${dragon.ruinsHitsThisTurn} 手牌=${dragon.hand.length} 上限=${dragon.handLimit}`);
}

// 手牌 4（= 上限 4）：第 4 次才触发，第 3 次仍不触发
{
  const dragon = mkDragon(4), cap = [], state = mkState(dragon, 2);
  hit(state, dragon, cap); hit(state, dragon, cap);
  const f3 = hit(state, dragon, cap);
  const f4 = hit(state, dragon, cap);
  check("A4 手牌4·第3次受击不触发", f3 === false, `hits=${dragon.ruinsHitsThisTurn}`);
  check("A5 手牌4·第4次受击触发", f4 === true, `hits=${dragon.ruinsHitsThisTurn}`);
}

// ---------- 场景B：虚拟牌继承原牌【机枪扫杀】效果 ----------
{
  const dragon = mkDragon(0), cap = [], state = mkState(dragon, 3);
  hit(state, dragon, cap);
  const card = cap[0];
  check("B1 虚拟牌取原牌模板【机枪扫杀】", card?.name === "机枪扫杀",
    `name=${card?.name}`);
  check("B2 虚拟牌是杀牌（旧为 type:skill 非杀牌）", card?.type === "slash",
    `type=${card?.type}`);
  check("B3 继承原牌 sweep:true", card?.sweep === true, `sweep=${card?.sweep}`);
  check("B4 继承原牌 targetless:true", card?.targetless === true,
    `targetless=${card?.targetless}`);
  check("B5 带 allTargets（全体目标线所需）",
    Array.isArray(card?.allTargets) && card.allTargets.length === 3,
    `allTargets=${JSON.stringify(card?.allTargets)}`);
  check("B6 带 aoeLineShown:true（全体目标线标记）", card?.aoeLineShown === true,
    `aoeLineShown=${card?.aoeLineShown}`);
  check("B7 判定为群体牌（AOE）",
    window.CardUtils?.isGroupTargetCard?.(card) === true,
    `isGroupTargetCard=${window.CardUtils?.isGroupTargetCard?.(card)}`);
  check("B8 判定为杀牌", window.CardUtils?.isKillCard?.(card) === true);
  check("B9 仍是虚拟牌（不触发外神之眼等实体牌判定）", card?.virtual === true,
    `virtual=${card?.virtual}`);
  check("B10 可被【闪】响应（responseKind:dodge）", card?.responseKind === "dodge",
    `responseKind=${card?.responseKind}`);

  // 全体目标线动画：与无限暗刃同一范式推 virtualPlay
  const anim = (state.battle.animQueue || []).find(a => a?.type === "virtualPlay");
  check("B11 推入 virtualPlay 动画（全体目标线）", !!anim,
    `animQueue=${JSON.stringify(state.battle.animQueue?.map(a => a?.type))}`);
  check("B12 目标线覆盖全部存活我方",
    anim && ["a1", "a2", "a3"].every(uid => (anim.targetUids || []).includes(uid)),
    `targetUids=${JSON.stringify(anim?.targetUids)}`);
  check("B13 目标线归属龙", anim?.uid === "d1", `uid=${anim?.uid}`);

  // 护甲按对每名角色造成的伤害量累加：3 名 × 13 = 39
  check("B14 护甲=对每名角色伤害量之和（3×13=39）", dragon.block === 39,
    `block=${dragon.block}`);
}

// ---------- 场景C：伤害仍为攻击力，未因改用实体模板而翻倍 ----------
{
  const dragon = mkDragon(0), cap = [], state = mkState(dragon, 2);
  const amounts = [];
  const damage = (s, t, amount, source, actor, card) => {
    cap.push(card); amounts.push(amount); return { hpLoss: amount };
  };
  window.RuinsDragonSkills.afterDamage(
    state, { uid: "a1", side: "ally" }, dragon, { ...CARD }, 5, damage, () => ({}));
  check("C1 每段伤害=攻击力13（未被模板加成放大）",
    amounts.length === 2 && amounts.every(a => a === 13),
    `amounts=${JSON.stringify(amounts)}`);
  check("C2 每段用同一张虚拟牌", cap.length === 2 && cap[0]?.name === "机枪扫杀");
}

// ---------- 场景D：副作用修复 —— 与实体【机枪扫杀】口径完全一致 ----------
{
  const dragon = mkDragon(0), cap = [], state = mkState(dragon, 3);
  hit(state, dragon, cap);
  const card = cap[0];
  const real = window.CardUtils?.fromEntity?.("机枪扫杀", {});
  // ① skipDamageModify 已移除：此前虚拟牌跳过伤害修正，与实体牌口径不一致
  check("D1 虚拟牌不再带 skipDamageModify（与实体牌一致）",
    card?.skipDamageModify === undefined,
    `skipDamageModify=${JSON.stringify(card?.skipDamageModify)}`);
  check("D2 实体【机枪扫杀】也不带 skipDamageModify",
    real?.skipDamageModify === undefined,
    `real=${JSON.stringify(real?.skipDamageModify)}`);
  // ② 暴击表现：改用实体模板后 isKillCard 成立、攻击力 13 ≥ 5，会命中
  //    battle-damage-hit 的 critical 判定 → 飘字放大 1.3 倍并加粒子。
  //    本牌是技能产物（锁定技造成技能伤害），不应套用普通杀牌的暴击表现。
  check("D3 虚拟牌与实体牌同为杀牌（会命中暴击判定式）",
    window.CardUtils?.isKillCard?.(card) === true
    && window.CardUtils?.isKillCard?.(real) === true,
    `virtual=${window.CardUtils?.isKillCard?.(card)} real=${window.CardUtils?.isKillCard?.(real)}`);
  check("D3a 虚拟牌带 skipCriticalFx（抑制暴击飘字）",
    card?.skipCriticalFx === true,
    `skipCriticalFx=${JSON.stringify(card?.skipCriticalFx)}`);
  check("D3b battle-damage-hit 的 critical 判定已排除 skipCriticalFx",
    /isKillCard\(card\)\s*&&\s*amount\s*>=\s*5\s*&&\s*!card\.skipCriticalFx/.test(
      fs.readFileSync("./src/original/battle-damage-hit.js", "utf8")));
  check("D3c 实体【机枪扫杀】不带 skipCriticalFx（正常出牌仍可暴击）",
    real?.skipCriticalFx === undefined,
    `real=${JSON.stringify(real?.skipCriticalFx)}`);
  ["sweep", "targetless", "scale", "type"].forEach(key => {
    check(`D4 虚拟牌继承实体牌 ${key}`,
      JSON.stringify(card?.[key]) === JSON.stringify(real?.[key]),
      `virtual=${JSON.stringify(card?.[key])} real=${JSON.stringify(real?.[key])}`);
  });
  // ③ 护甲：按对每名角色造成的伤害量累加，3 名 × 13 = 39
  check("D5 造成伤害后仍获得护甲值（3×13=39）", dragon.block === 39,
    `block=${dragon.block}`);
}

console.log(`\n通过 ${passed}/${passed + failed}`);
process.exit(failed ? 1 : 0);
