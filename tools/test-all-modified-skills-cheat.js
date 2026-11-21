// 作弊压测：本批所有修改过的技能效果。真实加载产品源码模块，跳过随机/动画/UI，
// 直接构造超大 state（234 目标 / 200 连打 / 1000 份 / 1e6 属性）验证数值与链路。
// REVERT=revive|phase|berserk|greenhat|heal|enhance|notice 为源码级反向验证，须精准打红。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "none";
const rawCache = {};
const raw = f => rawCache[f] || (rawCache[f] = fs.readFileSync(path.join(SRC, f), "utf8"));
const rootText = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 反向替换只动目标文件，保证每组只打红对应段落。
const REVERTS = {
  revive: { "ruins-elite-skills.js": [["enemy.hp = window.BattleHpValue.maxHp(enemy);", "enemy.hp = Math.max(1, Math.ceil((enemy.maxHp || 1) * 0.4));"]] },
  phase: { "battle-end-phase.js": [['() => { if (unit?.ref === "wendy") window.WendyCadicisSkills?.floatingCover?.(state, unit, { pushFloat: combat.pushFloat }); return true; },', "() => true,"]] },
  berserk: { "battle-combat-attack-values.js": [["const gain = H.pctStacks(actor.berserkBaseAttack, 10, 1);", "const gain = 1;"]] },
  greenhat: { "green-hat.js": [["window.BattleHpValue.pctStacks(unit.greenHatAttackBase, 30, 1)", "1"]] },
  heal: { "hp-value.js": [["const healPctStacks = (actor, pct, n) => pctStacks(currentMaxHp(actor), pct, n);", "const healPctStacks = (actor, pct, n) => 1;"]] },
  enhance: { "character-enhance.js": [["out[key] = Math.round(value + bonus[key]);", "out[key] = value;"]] },
};
function read(f) {
  let s = raw(f);
  for (const [o, n] of (REVERTS[REVERT]?.[f] || [])) {
    if (!s.includes(o)) throw new Error(`REVERT=${REVERT} target missing in ${f}`);
    s = s.replace(o, n);
  }
  return s;
}
// 公告反向：把已删除的旧说明注入回去，验证 J 段断言不是空转。
function noticeText(rel) {
  let s = rootText(rel);
  if (REVERT === "notice") {
    if (rel.endsWith("update-notice-recent.js")) s += "\n// 每份 +10% 基础属性 ·（后续口径已调整：旧口径回归）\n";
    if (rel.endsWith("update-notice-archive.js")) s += "\n// （后续口径已调整：旧口径回归）\n";
    if (rel.endsWith("update-notice.js")) s += "\n// 此前新增第 34 名可玩角色 · 本次再把【技能倍率】\n";
  }
  return s;
}

let pass = 0;
const reds = {};
function T(seg, name, cond, extra) {
  if (cond) { pass += 1; return; }
  (reds[seg] ||= []).push(name);
  console.log(`  RED [${seg}] ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
const finiteInt = n => Number.isFinite(n) && Number.isInteger(n) && n >= 0;

// ---------- 沙箱：显式桩 + 未定义全局的万能惰性桩 ----------
function makeBox() {
  const logs = [];
  const noop = () => {};
  const target = {};
  const lazy = () => new Proxy({}, {
    get(o, k) { return k in o ? o[k] : (typeof k === "string" ? (o[k] = () => undefined) : undefined); },
  });
  const win = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "string" && /^[A-Z]/.test(k)) return (t[k] = lazy());
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
  const ctx = { window: win, console, Math, JSON, Number, Array, Object, String,
    Boolean, Symbol, Date, RegExp, Error, Infinity, NaN, parseInt, parseFloat, isNaN };
  vm.createContext(ctx);
  // 显式桩：真实链路会不带 ?. 直接调用的全局
  Object.assign(win, {
    BattleLog: { add: (s, text) => { logs.push(String(text)); } },
    BattleLines: { skill: noop, line: noop },
    BattleSystem: { pushFloat: noop },
    BattlePileStats: { reshuffle: noop },
    GameRandom: { id: () => "cheat" },
    BattleTurnState: { cleanupTurn: noop },
    MieryulaTimeStop: { isSkillDisabled: () => false },
    WendyTeacherSkinFX: {},
    CardUtils: { isKillCard: c => c?.type === "slash", isSingleKill: c => !!c && !c.sweep && !c.allTargets,
      isEntityCard: c => !c?.virtual && !c?.generatedBySkill && c?.type !== "skill", damageStatKey: () => "attack" },
    GameDataMachineFactoryEnemies: [{ id: "m" }],
    GameDataUnderwaterTrainEnemies: [{ id: "u" }],
    GameDataRuinsSandCityEnemies: [{ id: "r" }],
    GameDataFutureEnemies: [{ id: "f" }],
    GameDataFutureDungeons: [],
  });
  const load = f => vm.runInContext(read(f), ctx, { filename: f });
  return { ctx, win, logs, load };
}
const box = makeBox();
[
  "hp-value.js", "card-utils.js", "economy-config.js", "data-world.js",
  "character-enhance.js", "green-hat.js", "wendy-skills.js",
  "wendy-cadicis-skills.js", "battle-end-phase.js", "ruins-elite-skills.js",
  "battle-combat-attack-values.js", "elrana-healing-skills.js",
].forEach(box.load);
const W = box.win;
const H = W.BattleHpValue;

// ---------- A：统一公式（作弊规模，性质断言，非等价式复写） ----------
{
  const bases = [0, 1, 9, 10, 99, 100, 999, 1e6];
  const pcts = [10, 30, 50];
  const ns = [0, 1, 2, 7, 100, 1000];
  let ok = true, count = 0;
  for (const b of bases) for (const p of pcts) {
    const one = H.pctStacks(b, p, 1);
    for (const n of ns) {
      const r = H.pctStacks(b, p, n);
      count += 1;
      if (!finiteInt(r) || r !== one * n) { ok = false; }
    }
  }
  T("A", `8×3×6=${count} 组公式：有限整数且严格线性`, ok);
  T("A", "单份至少 1 点", H.pctStacks(0, 50, 1) === 1 && H.pctStacks(1, 10, 1) === 1);
  T("A", "0/负份数归零", H.pctStacks(100, 10, 0) === 0 && H.pctStacks(100, 10, -9) === 0);
  T("A", "NaN/Infinity 安全", H.pctStacks(NaN, 10, 3) === 3 && H.pctStacks(Infinity, 10, 1) === 1);
  T("A", "currentStat 含 temp 与强化写回", H.currentStat({ stats: { attack: 100 }, tempAttack: 27 }, "attack") === 127);
  T("A", "currentStat 扣自身贡献防自激", H.currentStat({ stats: { attack: 100 }, tempAttack: 30 }, "attack", 30) === 100);
  T("A", "多个百分比来源不链式累乘",
    H.pctStacks(100, 10, 3) === 3 * H.pctStacks(100, 10, 1)
    && H.pctStacks(100, 30, 2) !== H.pctStacks(100 + H.pctStacks(100, 30, 1), 30, 1) + H.pctStacks(100, 30, 1));
}

// ---------- B：增援部队满血复活（234 死亡目标，真实 prepare） ----------
{
  const carrier = { uid: "carrier", name: "装甲运输车", ai: "ruins_carrier", side: "enemy", hp: 50000, maxHp: 100 };
  const enemies = [carrier];
  for (let i = 0; i < 234; i += 1) {
    enemies.push({ uid: `e${i}`, name: `敌${i}`, side: "enemy", hp: 0,
      maxHp: [1, 2, 7, 13, 40, 99, 100, 127, 999][i % 9] });
  }
  const state = { battle: { enemies, allies: [], turn: 1, animQueue: [] } };
  W.RuinsEliteSkills.prepare(state, carrier);
  const revived = enemies.slice(1);
  T("B", "234 个死亡目标全部满血", revived.every(e => e.hp === H.maxHp(e)) && revived.length === 234);
  T("B", "奇数/小数/1 点上限都精确满血", revived.every(e => e.hp === e.maxHp || e.hp === H.clean(e.maxHp)));
  T("B", "施术者不被自己复活", carrier.hp < 50000);
  const loss = 234 * Math.ceil(100 * 0.1);
  T("B", `代价=人数×10%上限（${loss}）`, carrier.hp === 50000 - loss, { hp: carrier.hp, loss });
  T("B", "战报写明满血复活", box.logs.some(t => t.includes("满血复活234名友军")));
  const snapshot = carrier.hp;
  W.RuinsEliteSkills.prepare(state, carrier);
  T("B", "二次调用幂等（无死者不再结算）", carrier.hp === snapshot);
  T("B", "不含施术者自己", revived.every(e => e !== carrier));
  box.logs.length = 0;
}

// ---------- C：温蒂掩体（234 我方，真实结束阶段执行器） ----------
{
  const allies = [];
  for (let i = 0; i < 234; i += 1) allies.push({ uid: `a${i}`, name: `队友${i}`, ref: i === 8 ? "cadicis" : `u${i}`,
    side: "ally", hp: 100, maxHp: 100, block: 0, stats: { magic: 5 } });
  const wendy = allies[0];
  wendy.ref = "wendy";
  wendy.stats.magic = 1000;
  const other = allies[1];
  const battle = { allies, enemies: [{ uid: "x", hp: 10, side: "enemy" }], turn: 7, phase: 4, animQueue: [] };
  const state = { battle };
  const end = W.BattleEndPhase({ allUnits: () => [...battle.allies, ...battle.enemies],
    combat: { damage: () => {}, pushFloat: () => {} }, draw: () => {} });
  const done = end.run(state, wendy);
  T("C", "结束阶段跑完未被 false 挂起", done === true && !("endPhaseStep" in battle) && !("endPhaseUnitUid" in battle));
  T("C", "234 名我方各得温蒂魔力护甲", allies.every((a, i) => a.block === (i === 8 ? 2000 : 1000)));
  T("C", "卡迪西斯恰好 2 倍", allies[8].block === 2 * allies[0].block);
  T("C", "只在温蒂自己的结束阶段触发", (() => {
    const before = allies.map(a => a.block);
    battle.turn = 8;
    const r = end.run(state, other);
    return r === true && allies.every((a, i) => a.block === before[i]);
  })());
  T("C", "回合号守卫：同回合不叠甲、跨回合才再触发", (() => {
    battle.turn = 9;
    const first = end.run(state, wendy);
    const afterFirst = allies[0].block;
    const second = end.run(state, wendy); // 同回合重复进入 steps（挂起恢复场景）
    const sameTurn = allies[0].block === afterFirst;
    battle.turn = 10;
    const third = end.run(state, wendy);
    return first === true && second === true && third === true && sameTurn
      && allies[0].block === afterFirst + 1000;
  })());
  T("C", "怀表跳弃牌的回合结束阶段照常加甲", (() => {
    battle.turn = 10;
    battle.skipDiscard = true;
    wendy._floatingCoverTurn = 8;
    const b = allies[2].block;
    const r = end.run(state, wendy);
    return r === true && allies[2].block === b + 1000;
  })());
  T("C", "战报写结束阶段触发", box.logs.some(t => t.includes("结束阶段触发飘浮掩体")));
  box.logs.length = 0;
}

// ---------- D：暴走杀 10%（200 连打，真实成长函数） ----------
{
  const V = W.BattleCombatAttackValues({});
  const actor = { name: "罗卡尔", stats: { attack: 100 }, tempAttack: 0 };
  const state = { battle: { turn: 1 } };
  const seq = [];
  for (let i = 0; i < 200; i += 1) {
    V.applyBerserkGrowth(state, actor, { berserkKill: true });
    seq.push(actor.stats.attack);
    state.battle.turn += 1; // 作弊跨越 200 个回合，验证「本场战斗」不清零
  }
  const gains = seq.map((v, i) => v - (i === 0 ? 100 : seq[i - 1]));
  T("D", "200 次每次增量相同（线性不累乘）", gains.every(g => g === gains[0]), { first: gains.slice(0, 4) });
  T("D", "10% 快照固定 +10/次", gains[0] === 10 && actor.stats.attack === 100 + 200 * 10);
  T("D", "首次快照不随攻击增长漂移", actor.berserkBaseAttack === 100);
  T("D", "全程整数写回", seq.every(finiteInt));
  T("D", "同一牌对象不会重复成长", (() => {
    const card = { berserkKill: true };
    const before = actor.stats.attack;
    V.applyBerserkGrowth(state, actor, card);
    V.applyBerserkGrowth(state, actor, card);
    return actor.stats.attack === before + 10;
  })());
  T("D", "战报写明按当前属性 +10%", box.logs.some(t => t.includes("按当前属性+10%")));
  box.logs.length = 0;
}

// ---------- E：绿帽 30%（真实 grant，作弊堆到上限） ----------
{
  const unit = { stats: { attack: 100, handLimit: 4, bloodlust: 1 }, greenHat: 0, intent: 0 };
  const gains = [];
  for (let i = 0; i < 5; i += 1) { const before = unit.stats.attack; W.GreenHat.grant(unit); gains.push(unit.stats.attack - before); }
  T("E", "5 枚每枚 +30% 同基数线性", gains.every(g => g === gains[0]) && gains[0] === 30 && unit.stats.attack === 250);
  T("E", "上限 5 枚后不再成长", W.GreenHat.grant(unit) === false && unit.stats.attack === 250);
  T("E", "基数取「当前属性」且扣自身贡献", unit.greenHatAttackBase === 100);
  T("E", "写回整数", finiteInt(unit.stats.attack));
}

// ---------- F：角色强化（作弊 150 次，固定点数且与百分比解耦） ----------
{
  const C = W.CharacterEnhance;
  const ch = { id: "x" };
  for (let i = 0; i < 50; i += 1) C.step(ch, "attack");
  const mid = C.bonusOf(ch).attack;
  for (let i = 50; i < 150; i += 1) C.step(ch, "attack");
  const bonus = C.bonusOf(ch);
  T("F", "中间档线性累计固定整数", mid === 50 * C.BONUS.attack && Number.isInteger(mid));
  T("F", "作弊 150 次按 MAX_LEVEL 封顶不溢出", Number.isInteger(bonus.attack) && bonus.attack === C.MAX_LEVEL * C.BONUS.attack);
  T("F", "withBonus 叠加固定点数（不参与百分比）", C.withBonus({ attack: 100, magic: 5, speed: 11, maxHp: 124 }, { enhance: { attack: 1, magic: 1, speed: 1, maxHp: 1 } }).attack === 101);
  T("F", "副本 / 战斗 / 大厅判定", C.blockedReason({ explore: {}, view: "hall" }) === "副本中不可强化"
    && C.blockedReason({ view: "battle" }) === "战斗中不可强化"
    && C.blockedReason({ view: "hall" }) === "");
  T("F", "旧档 enhanceLevel 还原四项各 n", (() => {
    const legacy = { enhanceLevel: 3 };
    const lv = C.levelsOf(legacy);
    return ["attack", "magic", "speed", "maxHp"].every(k => lv[k] === 3);
  })());
  T("F", "强化模块不引用百分比公式", !raw("character-enhance.js").includes("pctStacks"));
}

// ---------- G：难度倍率与副本金币（36 怪物 × 5 难度 × 3 类型） ----------
{
  const D = W.GameDataWorld.difficulties;
  const keys = ["normal", "adventure", "warrior", "king", "hell"];
  const types = ["normal", "elite", "boss"];
  const bases = Array.from({ length: 36 }, (_, i) => ({ hp: 90 + i * 7, attack: 3 + i, magic: 2 + i, speed: 5 + i }));
  let allInt = true, monotone = true, count = 0;
  for (const b of bases) for (const t of types) {
    const vals = keys.map(k => W.GameDataWorld.scaleEnemyStats(b, D[k], t));
    count += 1;
    vals.forEach(v => { if (![v.hp, v.attack, v.magic, v.speed].every(finiteInt)) allInt = false; });
    ["hp", "attack", "magic", "speed"].forEach(f => { for (let i = 1; i < 5; i += 1) if (vals[i][f] < vals[i - 1][f]) monotone = false; });
  }
  T("G", `36×3=${count} 组缩放全为整数`, allInt);
  T("G", "四档属性随难度单调不降", monotone);
  T("G", "150/200/250/300 精确生效", (() => {
    const base = { hp: 101, attack: 7, magic: 9, speed: 11 };
    return keys.map(k => W.GameDataWorld.scaleEnemyStats(base, D[k], "normal").attack)
      .join(",") === "7,11,14,18,21";
  })());
  T("G", "精英/BOSS 与普通怪同倍率", types.every(t => W.GameDataWorld.scaleEnemyStats({ attack: 10 }, D.hell, t).attack === 30));
  const g = W.GameEconomy.dungeonGold;
  T("G", "副本金币四类节点均 -30%", g.normal[0] === Math.round(90 * .7) && g.normal[1] === Math.round(130 * .7)
    && g.elite === 280 * .7 && g.boss === 500 * .7 && g.chest === 220 * .7);
  T("G", "悬赏/商店售价不受影响", W.GameEconomy.shop.refreshCost === 500 && W.GameEconomy.bounty.refreshCost === 500);
}

// ---------- H：回血基数统一施术者当前最大生命（1000 张牌作弊） ----------
{
  const actor = { maxHp: 127, hp: 10, stats: { maxHp: 124 } };
  const target = { maxHp: 9999, hp: 1 };
  T("H", "healPctStacks 按施术者当前最大生命（多份）",
    H.healPctStacks({ maxHp: 127, stats: { maxHp: 124 } }, 10, 3) === 39);
  T("H", "按施术者而非目标最大生命", H.healPctStacks(actor, 30, 1) === H.pctStacks(127, 30, 1)
    && H.healPctStacks(actor, 30, 1) !== Math.ceil(target.maxHp * .3));
  T("H", "强化后的当前上限作基数", H.healPctStacks({ maxHp: 130 }, 10, 1) === 13);
  T("H", "1000 张牌仍有限、整数、线性", (() => {
    const one = H.healPctStacks(actor, 10, 1);
    return finiteInt(one) && H.healPctStacks(actor, 10, 1000) === one * 1000;
  })());
  T("H", "30%/10%/30% 三档牌各自按同一基数", (() => {
    const a = H.healPctStacks(actor, 30, 1), b = H.healPctStacks(actor, 10, 1);
    return a === H.pctStacks(127, 30, 1) && b === H.pctStacks(127, 10, 1);
  })());
  T("H", "applyHeal 不超上限", H.applyHeal(actor, 1e6) === 127);
}

// ---------- I：其它修改技能的接线仍在（静态，防止压测绕过真实链路） ----------
{
  const has = (f, x) => raw(f).includes(x);
  T("I", "所有 10% 技能走统一当前属性公式", [
    ["artina-maria-skills.js", 'H.pctStacks(H.currentStat(actor, "attack", grantAtk), 10, actor.mariaMarks)'],
    ["hoshino-yi-skills.js", 'H.pctStacks(H.currentStat(actor, "attack", actor.hoshinoGrantAttack || 0), 10, 1)'],
    ["catherine-skills.js", 'H.pctStacks(H.currentStat(unit, "magic", grant), 10, tacticCount(unit))'],
    ["battle-card-specials.js", 'pctStacks(window.BattleHpValue.currentStat(actor, "attack"), 10, actor.consumed.length)'],
  ].every(([f, x]) => has(f, x)));
  T("I", "榨取 50% / 绿帽 30% 走同一公式", has("battle-card-specials.js", 'currentStat(actor, "magic"), 50, n'));
  T("I", "回血技能统一 healPctStacks", ["elrana-healing-skills.js", "nonoka-loki-skills.js", "enemy-skills.js", "angelica-luka-skills.js"]
    .every(f => has(f, "healPctStacks")));
  T("I", "满血目标不可指定仍生效", has("heal-target-rules.js", "满血") || rootText("src/original/heal-target-rules.js").includes("满血"));
  T("I", "终极刀魔 X 只数实体单体杀", has("noa-ultimate-blade-skills.js", "isCountedKill"));
  T("I", "狂战意志主动限一次与新台词", has("angelica-luka-skills.js", "canUseBerserkWill")
    && rootText("src/original/battle-line-data.js").includes("游戏结束了，看我全力进攻。"));
  T("I", "连鬼斩虚拟杀与隐身口径", has("chiyo-chain-skills.js", "blocksKillTarget") && has("ruins-elite-skills.js", "entitySingleKill"));
}

// ---------- J：公告旧说明已删除 ----------
{
  const recent = noticeText("src/original/update-notice-recent.js");
  const archive = noticeText("src/original/update-notice-archive.js");
  const meta = noticeText("src/original/update-notice.js");
  T("J", "早批 239 口径整条已删", !recent.includes("每份 +10% 基础属性") && !recent.includes("均按原口径不变"));
  T("J", "recent / archive 无「后续口径已调整」注脚", !/后续口径已调整/.test(recent) && !/后续口径已调整/.test(archive));
  T("J", "摘要不再复述旧批次", !meta.includes("此前新增第 34 名可玩角色") && !meta.includes("本次再把【技能倍率】"));
  T("J", "当前生效条目齐全", ["【增援部队】", "【飘浮掩体】", "【暴走杀】", "「当前属性」口径（A）"].every(x => recent.includes(x)));
  T("J", "历史事实条目保留", recent.includes("【改造副作用】实装") && archive.includes("安洁莉卡新增主动技【猩红暴走】"));
}

const total = pass + Object.values(reds).reduce((n, a) => n + a.length, 0);
console.log(`\nRESULT ${pass}/${total}  REVERT=${REVERT}`);
if (REVERT !== "none") {
  const target = { revive: "B", phase: "C", berserk: "D", greenhat: "E", heal: "H", enhance: "F", notice: "J" }[REVERT];
  const hit = (reds[target] || []).length;
  const other = Object.entries(reds).filter(([k]) => k !== target).reduce((n, [, a]) => n + a.length, 0);
  console.log(hit > 0 && other === 0 ? `REVERT_OK ${REVERT}: ${hit} targeted red(s)` : `REVERT_FAIL ${REVERT}: target=${hit} other=${other}`);
  process.exit(hit > 0 && other === 0 ? 0 : 1);
}
process.exit(Object.keys(reds).length ? 1 : 0);
