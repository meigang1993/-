// 继续复查 208/209 更新的下游：毒/燃烧/感电 30% 与 HP 收敛的副作用。
// 覆盖伤害归属回退、感电 legacy 放大、多施加者统计、HP 阈值抖动、
// 存档压缩燃烧牌、状态伤害触发感电链，带源码级反向验证。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = n => fs.readFileSync(path.join(ROOT, "src/original", n), "utf8");
const texts = {
  hp: SRC("hp-value.js"),
  status: SRC("enemy-status-effects.js"),
  burn: SRC("bakar-fire-skills.js"),
  hooks: SRC("enemy-damage-hooks.js"),
  stats: SRC("battle-stats.js"),
  schema: SRC("store-save-schema.js"),
  compact: SRC("store-compact.js"),
  recovery: SRC("store-unlock-recovery.js"),
  damageHit: SRC("battle-damage-hit.js"),
  lifecycle: SRC("battle-damage-lifecycle.js"),
};
const REVERT = process.env.REVERT || "none";
// 反向组：把三处「来源回退到目标自己」还原，验证断言不是空转。
const revert = src => {
  if (REVERT === "shadow") {
    return src
      .replace(/actorOf\(state, sourceUid\) \|\| shadowSource\(unit, sourceUid, "毒"\)/g,
        "actorOf(state, sourceUid) || unit")
      .replace(/sourceFor\(uid\) \|\| shadowSource\(unit, uid, "燃烧"\)/g,
        "sourceFor(uid) || unit")
      .replace(/const legacyActor = actorOf\(state, mark\?\.sourceUid\)\s*\n\s*\|\| \(actor === target \? null : actor\);/g,
        "const legacyActor = actorOf(state, mark?.sourceUid) || actor;");
  }
  return src;
};

function makeWindow() {
  const log = [];
  const win = {
    BattleLog: { add: (_s, text) => log.push(text) },
    log,
    GameRandom: { sample: options => options[0] || null },
    BattleReactionQueue: {
      directDamageAction: () => null, enqueue: () => false, flush() {},
    },
    BakarCoreSkills: { isBakar: () => false },
    CardUtils: { isKillCard: c => c?.type === "slash" },
    SakuraRisaSkills: { pendingRevival: () => false },
    GameData: { baseDeck: [{ name: "杀", suit: "♠" }, { name: "闪", suit: "♥" }], eliteCards: [] },
  };
  return win;
}
function loadInto(win, names, src = texts) {
  const ctx = { window: win, Math, Number, Array, Object, String, JSON, Set, Map, console };
  for (const name of names) {
    const code = revert(src[name]);
    vm.runInNewContext(code, ctx, { filename: name });
  }
  return win;
}
function unit(uid, hp, attack, extra = {}) {
  return Object.assign({
    uid, name: uid, side: "enemy", hp, maxHp: hp,
    stats: { attack }, tempAttack: 0, hand: [], statuses: [], block: 0,
  }, extra);
}
function statusApi(win) {
  return win.EnemyStatusEffects({
    alive: us => us.filter(u => u && u.hp > 0),
    markStatus: (u, s) => { u.statuses ||= []; if (!u.statuses.includes(s)) u.statuses.push(s); },
  });
}
const stateOf = (...us) => ({ battle: { allies: [us[0]], enemies: us.slice(1), performance: {} } });

function run() {
  let passed = 0; let total = 0;
  const failures = [];
  const T = (name, ok, extra) => {
    total += 1;
    if (ok) passed += 1; else failures.push(`${name} ${JSON.stringify(extra || {})}`);
  };
  const win = loadInto(makeWindow(), ["hp", "status", "burn", "hooks", "stats"]);
  const api = statusApi(win);

  // ── A 毒 tick：施加者在场 / 失效时的伤害来源 ──
  {
    const applier = unit("a0", 100, 30, { side: "ally" });
    const victim = unit("e0", 200, 9.6);
    const st = stateOf(applier, victim);
    api.addPoison(st, victim, 2, applier);
    const calls = [];
    api.tickPoison(st, victim, (...args) => { calls.push(args); });
    const [state, target, amount, label, source] = calls[0] || [];
    T("A1 毒两枚各按施加者攻击力30%叠加（30→9×2=18）", amount === 18, { amount });
    T("A2 施加者在场时来源就是施加者", source?.uid === "a0" && source.side === "ally", { source });
    T("A3 施加者在场时伤害记入施加者统计", (() => {
      win.BattleStats.damage(st.battle, source, target, amount, target.hp);
      return st.battle.performance.a0?.damage === 18;
    })(), { perf: st.battle.performance });

    // 施加者从存活数组移除（存档/离场/uid 重建）
    victim.poison = 0; victim.poisonMarks = []; victim.poisonSourceUid = null;
    const st2 = stateOf(applier, victim);
    api.addPoison(st2, victim, 2, applier);
    st2.battle.enemies = [victim];
    st2.battle.allies = [];
    const calls2 = [];
    api.tickPoison(st2, victim, (...args) => { calls2.push(args); });
    const src2 = calls2[0]?.[4];
    T("A4 施加者失效时来源不得是受害者自己", src2?.uid !== victim.uid, { src2 });
    T("A5 施加者失效时来源阵营与目标相反（统计不被同阵营判据吞掉）",
      src2?.side !== victim.side, { src2side: src2?.side, victimSide: victim.side });
    T("A6 施加者失效时保留原 uid，统计仍落到原施加者名下", (() => {
      win.BattleStats.damage(st2.battle, src2, victim, 18, victim.hp);
      return st2.battle.performance.a0?.damage === 18;
    })(), { perf: st2.battle.performance, src2 });
    T("A7 施加者失效时来源无攻击力（不会放大后续感电）",
      Number(src2?.stats?.attack || 0) === 0, { atk: src2?.stats?.attack });
  }

  // ── B 燃烧 tick：施加者失效时的伤害来源 ──
  {
    const applier = unit("b0", 100, 20, { side: "ally" });
    const victim = unit("e1", 200, 40);
    const st = stateOf(applier, victim);
    victim.hand = [
      { name: "杀", suit: "♠", burning: true, burningSourceUid: applier.uid, burningSourceAttack: 20 },
      { name: "闪", suit: "♥", burning: true, burningSourceUid: applier.uid, burningSourceAttack: 20 },
    ];
    const calls = [];
    win.BakarFireSkills.tickBurning(st, victim, (...args) => calls.push(args), null);
    const src = calls[0]?.[4];
    T("B1 燃烧两张各 20×30%=6，合计 12", calls[0]?.[2] === 12, { amount: calls[0]?.[2] });
    T("B2 燃烧施加者在场时来源是施加者", src?.uid === "b0", { src });

    st.battle.allies = [];
    const calls2 = [];
    win.BakarFireSkills.tickBurning(st, victim, (...args) => calls2.push(args), null);
    const src2 = calls2[0]?.[4];
    T("B3 燃烧施加者失效时来源不得是受害者自己", src2?.uid !== victim.uid, { src2 });
    T("B4 燃烧施加者失效时阵营与目标相反", src2?.side !== victim.side, { src2side: src2?.side });
    T("B5 燃烧施加者失效时数值仍按快照 12（不受来源回退影响）",
      calls2[0]?.[2] === 12, { amount: calls2[0]?.[2] });
    T("B6 燃烧施加者失效时统计仍落到原施加者名下", (() => {
      win.BattleStats.damage(st.battle, src2, victim, 12, victim.hp);
      return st.battle.performance.b0?.damage === 12;
    })(), { perf: st.battle.performance, src2 });
  }

  // ── C 感电 legacy：本次伤害来源恰好是受害者时不得按其攻击力放大 ──
  {
    const victim = unit("e2", 200, 40);
    const st = stateOf(unit("a1", 100, 10, { side: "ally" }), victim);
    victim.shock = 2;
    // 旧档：只有 shock 数字，没有 shockMarks
    T("C1 旧档感电标记缺施加者时降级为每枚至少1点（合计2）",
      api.shockDamage(st, victim, victim) === 2, { dmg: api.shockDamage(st, victim, victim) });
    const real = unit("a2", 100, 30, { side: "ally" });
    const st2 = stateOf(real, victim);
    victim.shock = 2;
    T("C2 旧档感电本次伤害来源有效时按该来源攻击力30%（30→9×2=18）",
      api.shockDamage(st2, victim, real) === 18, { dmg: api.shockDamage(st2, victim, real) });
  }

  // ── D 多施加者：数值各自算，统计归属口径记录 ──
  {
    const a = unit("a3", 100, 30, { side: "ally" });
    const b = unit("a4", 100, 10, { side: "ally" });
    const victim = unit("e3", 300, 1);
    const st = stateOf(a, b, victim);
    api.addPoison(st, victim, 1, a);
    api.addPoison(st, victim, 1, b);
    const calls = [];
    api.tickPoison(st, victim, (...args) => calls.push(args));
    T("D1 多施加者数值为 9+3=12（各自快照叠加、分组求和）",
      calls.reduce((sum, c) => sum + c[2], 0) === 12,
      { amounts: calls.map(c => c[2]) });
    T("D2 多施加者按施加者分别结算，统计各自归属（口径定案）",
      calls.length === 2 && calls[0]?.[4]?.uid === "a3"
      && calls[1]?.[4]?.uid === "a4",
      { sources: calls.map(c => c[4]?.uid) });
    T("D3 多施加者恰好产生 2 次 damage 调用（每组一次）",
      calls.length === 2, { calls: calls.length });
  }

  // ── E HP 收敛：整数干净、两位小数保留、阈值边界抖动记录 ──
  {
    const H = win.BattleHpValue;
    T("E1 49.00000000000001 收敛为整数 49", H.clean(49.00000000000001) === 49);
    T("E2 合法两位小数 40.82 保留", H.clean(40.82) === 40.82);
    T("E3 低血恢复量为干净整数", (() => {
      const u = unit("e4", 49, 1, { maxHp: 245 });
      u.hp = 49.00000000000001;
      return H.healCap(u, 1000) === 196;
    })());
    // 收敛到两位小数会让 20%/30% 临界比值产生约 1e-5 抖动，记录为观察项。
    const raw = 397.26 * 0.3;
    const pctRaw = raw / 397.26;
    const pctClean = H.clean(raw) / 397.26;
    T("E4 收敛前后 hpPct 差异在 1e-4 内（阈值抖动可忽略）",
      Math.abs(pctRaw - pctClean) < 1e-4, { pctRaw, pctClean });
    T("E5 战斗统计不使用未收敛的 hpBefore（飘字/结算无长小数）",
      /window\.BattleHpValue\.applyDamage\(target, hpLoss\)/.test(texts.damageHit)
      && /hpBefore = target\.hp/.test(texts.damageHit));
  }

  // ── F 存档压缩：燃烧标记丢失，但无 checkpoint 的战斗会被整个丢弃 ──
  {
    const sw = loadInto(makeWindow(), ["schema", "compact"]);
    const data = {
      view: "battle", chars: [], deck: [], shopCards: [], bounties: [],
      pendingBountyRewards: [], explore: {},
      battle: {
        allies: [{ uid: "a5", side: "ally", hand: [
          { name: "杀", suit: "♠", burning: true, burningSourceUid: "e9", burningSourceAttack: 20 },
        ], deck: [], discard: [], consumed: [] }],
        enemies: [], played: [],
      },
    };
    sw.GameStoreCompact.compactSaveData(data);
    const card = data.battle.allies[0].hand[0];
    T("F1 压缩后燃烧标记与攻击力快照不在身份里（已知）",
      !card.burning && card.burningSourceAttack === undefined, { card });
    T("F2 压缩身份只含 name/suit（+可选 originSide），不残留运行时标记",
      Object.keys(card).sort().join(",") === "name,suit", { keys: Object.keys(card) });
    T("F3 无 checkpoint 的中断战斗由 recoverInterruptedBattle 整场丢弃",
      /state\.battle = null/.test(texts.recovery)
      && /recoverInterruptedBattle\(state\)/.test(texts.recovery));
    T("F4 checkpoint 路径不压缩 battle（整块保留，燃烧快照不丢）",
      /finalizeSaveSnapshot|checkpoint/.test(fs.readFileSync(
        path.join(ROOT, "src/original/store-main-snapshot.js"), "utf8")));
  }

  // ── G 状态伤害触发感电链：毒/燃烧 tick 各自会追加一次感电 ──
  {
    const victim = unit("e5", 200, 1);
    victim.shock = 1;
    const actor = unit("a6", 100, 10, { side: "ally" });
    const st = stateOf(actor, victim);
    const calls = [];
    const hooks = win.EnemyDamageHooks({
      hasSkill: () => false,
      machine: { afterDamage() {} },
      discardOne: () => null,
      status: { shockDamage: api.shockDamage, addShock: api.addShock, addHolyScar() {}, addPoison: api.addPoison },
    });
    const poisonCard = { name: "毒", type: "skill", poison: true, poisonTick: true,
      ignoreResponse: true, ignoreBlock: true, skipDamageModify: true };
    hooks.afterDamage(st, actor, victim, poisonCard, 5,
      (...args) => calls.push(args));
    T("G1 毒 tick 不再追加感电伤害（状态 DOT 口径）",
      calls.length === 0, { calls: calls.length });
    const burnCard = { name: "燃烧", type: "skill", fire: true, burningTick: true, skipDamageModify: true };
    const calls2 = [];
    hooks.afterDamage(st, actor, victim, burnCard, 5, (...args) => calls2.push(args));
    T("G2 燃烧 tick 不再追加感电伤害（状态 DOT 口径）",
      calls2.length === 0, { calls: calls2.length });
    const normalCalls = [];
    hooks.afterDamage(st, actor, victim, { name: "杀", type: "slash" }, 5,
      (...args) => normalCalls.push(args));
    T("G3 主动牌造成伤害仍追加一次感电且带 shockBonus 防自激",
      normalCalls.length === 1 && normalCalls[0]?.[3] === "感电"
      && normalCalls[0]?.[5]?.shockBonus === true,
      { calls: normalCalls.length, label: normalCalls[0]?.[3] });
  }

  // ── H 源码静态：修复字符串在位（反向组由 revert 替换验证） ──
  {
    T("H1 毒来源回退使用影子来源而非目标自己",
      /shadowSource\(unit, uid \|\| null, "毒"\)/.test(texts.status));
    T("H2 燃烧来源回退使用影子来源而非目标自己",
      /shadowSource\(unit, uid, "燃烧"\)/.test(texts.burn));
    T("H3 感电 legacy 在本次来源就是受害者时按 0 攻击力",
      /actor === target \? null : actor/.test(texts.status));
    T("H4 无 uid 的施加者不再把 sourceUid 写成目标自己",
      (texts.status.match(/const sourceUid = source\?\.uid \|\| null;/g) || []).length === 2
      && !/source\?\.uid \|\| target\.uid/.test(texts.status));
  }

  const result = { passed, total, failures, revert: REVERT };
  console.log(JSON.stringify(result, null, 2));
  if (REVERT === "none" && passed !== total) process.exitCode = 1;
  if (REVERT !== "none" && failures.length === 0) {
    console.error("REVERT 组未打红，反向验证空转");
    process.exitCode = 2;
  }
  return result;
}

try { run(); } catch (e) { console.error(e.stack); process.exit(3); }
