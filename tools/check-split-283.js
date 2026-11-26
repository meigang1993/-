// 2026-11-26 三组预防性拆分专项回归
// 回答：拆完有没有丢方法 / 漏加载会不会静默退化 / 导出接口是否与拆分前完全一致 / 行为是否不变。
// REVERT=<组> 改真实源码后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");
const lines = n => raw(n).split("\n").length;

const REPL = {
  dropGuard: ["ruins-dragon-skills.js",
    '    throw new Error("ruins-dragon-skills: 缺少子模块 RuinsDragonTailGun（ruins-dragon-tailgun.js 必须先于本文件加载）");',
    "    /* no explicit throw */;"],
  reorder: ["publish-bundles.json",
    '"ruins-dragon-tailgun.js",\n    "ruins-dragon-skills.js",',
    '"ruins-dragon-skills.js",\n    "ruins-dragon-tailgun.js",'],
  dropNotice: ["update-notice-recent.js", "同批对 3 个逼近 189 行硬约束的低风险源码文件做预防性拆分", "同批"],
};
const EXPECT = { dropGuard: ["A1.0", "B2"], reorder: ["A3.0"], dropNotice: ["A6"] };
const patched = n => {
  let s = n === "publish-bundles.json"
    ? fs.readFileSync(path.join(ROOT, "tools", n), "utf8") : raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 70)}`);
    s = s.replace(r[1], r[2], 1);
  }
  return s;
};
const results = [];
const check = (n, ok, d = "") => { results.push({ n, ok: !!ok, d }); console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " — " + d : ""}`); };

// ── A 源码 / 清单静态断言 ──────────────────────────────────────────────
const PAIRS = [
  ["ruins-dragon-skills.js", "ruins-dragon-tailgun.js", "RuinsDragonTailGun", "battle-skills"],
  ["local-core-dungeon.js", "local-core-dungeon-settlement.js", "LocalCoreDungeonSettlement", "startup-store"],
  ["ruins-elite-skills.js", "ruins-elite-prepare-skills.js", "RuinsElitePrepareSkills", "battle-skills"],
];
const bundles = JSON.parse(patched("publish-bundles.json"));
PAIRS.forEach(([main, sub, dep, bundle], i) => {
  const m = patched(main), s = patched(sub);
  const refLine = m.split("\n").find(l => l.includes(dep) && l.includes("if"));
  check(`A1.${i} ${main} 装配点显式 throw、无静默兜底`,
    !!refLine && !/\|\|\s*\{\s*\}/.test(refLine)
    && /throw\s+new\s+Error/.test(m.slice(Math.max(0, m.indexOf(refLine) - 200), m.indexOf(refLine) + 600)));
  check(`A2.${i} ${sub} 独立挂载 ${dep}`,
    s.includes(`window.${dep} =`) && lines(sub) <= 150);
  const arr = bundles[bundle] || [];
  check(`A3.${i} ${bundle} 中 ${sub} 排在 ${main} 之前`,
    arr.indexOf(sub) >= 0 && arr.indexOf(sub) < arr.indexOf(main),
    `sub=${arr.indexOf(sub)} main=${arr.indexOf(main)}`);
  check(`A4.${i} ${main} 拆后低于 150 行`, lines(main) < 150, `${lines(main)} 行`);
});
const guard = fs.readFileSync(path.join(ROOT, "tools", "check-split-assembly.js"), "utf8");
check("A5 装配护栏 SPLITS 与 depFiles 各登记 3 组",
  ["RuinsDragonTailGun", "LocalCoreDungeonSettlement", "RuinsElitePrepareSkills"]
    .every(dep => guard.includes(`deps: ["${dep}"]`))
  && ["ruins-dragon-tailgun.js", "local-core-dungeon-settlement.js", "ruins-elite-prepare-skills.js"]
    .every(f => guard.includes(`"${f}"`)));
const notice = patched("update-notice-recent.js");
check("A6 公告写明本次三组拆分且未新增条目",
  notice.includes("同批对 3 个逼近 189 行硬约束的低风险源码文件做预防性拆分")
  && (notice.match(/^        "/gm) || []).length === (raw("update-notice-recent.js").match(/^        "/gm) || []).length);

// ── B vm 装配：导出等价 + 漏加载快速失败 ─────────────────────────────
function sandbox(extra = {}) {
  const logs = [], enq = [], floats = [];
  const ctx = {
    console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Proxy, Promise,
    window: null,
    GameData: {
      missions: [{ id: "m1", kind: "dungeon", reward: {} }],
      difficulties: { normal: { reward: 100, dropRate: 0 } },
      eliteUnlocks: {}, eliteCards: [], enemies: {}, characters: [],
    },
    __logs: logs, __enq: enq, __floats: floats,
    ...extra,
  };
  ctx.window = ctx;
  ctx.BattleLog = { add: (_s, t) => logs.push(String(t)) };
  ctx.BattleLines = { skill: () => {} };
  ctx.BattleSystem = { pushFloat: (...a) => floats.push(a), draw: () => [] };
  ctx.GameRandom = { int: () => 3, id: () => "id", value: () => .5, chance: () => false, sample: a => a?.[0] };
  ctx.CardUtils = {
    fromEntity: (name, opts) => ({ name, type: "slash", sweep: true, targetless: true, scale: "attack", ...opts }),
    isSingleKill: () => false, isKillCard: c => c?.type === "slash",
    isEntityCard: c => !c?.virtual, copyPlayable: c => ({ ...c }),
  };
  ctx.BattleReactionQueue = {
    enqueue: (_s, actions) => { enq.push(...(Array.isArray(actions) ? actions : [actions])); return true; },
    flush: () => { ctx.__flushed = (ctx.__flushed || 0) + 1; },
    directDamageAction: (...a) => ({ kind: "directDamage", args: a }),
  };
  ctx.MieryulaTimeStop = { isSkillDisabled: () => false };
  ctx.RuinsDragonDeathWave = {};
  ctx.RuinsHelicopterSkills = {}; ctx.RuinsCarrierArmor = {}; ctx.RuinsCarrierRam = {};
  ctx.LocalCoreUtils = {
    n: v => Number(v) || 0, uniq: a => [...new Set(a || [])], sample: a => a?.[0],
    outcomes: { rejected: "rejected", changed: "changed", reconciled: "reconciled" },
    addResource: (a, b) => (Number(a) || 0) + (Number(b) || 0),
    assertInventoryCapacity: () => {},
  };
  ctx.GameEconomy = { dungeonGold: {} };
  ctx.RelicSystem = { isFormalId: () => true, randomElite: () => null };
  ctx.ReceiptLedger = { claim: () => ({ status: "granted", ledger: {} }) };
  ctx.CharacterProgression = { rewardFor: () => 10, grant: c => c };
  ctx.BattleHpValue = { maxHp: u => u.maxHp || 100, applyDamage: (u, n) => { u.hp -= n; } };
  ctx.BattleCards = { putMany: () => {} };
  ctx.BattlePileStats = { reshuffle: () => {} };
  ctx.NoaSideEffectSkills = { handLimit: () => 3 };
  vm.createContext(ctx);
  return ctx;
}
function load(ctx, src, name) { vm.runInContext(src, ctx, { filename: name }); }
// HEAD 版（拆分前，281）作为导出接口基线
function headSrc(file) {
  return cp.execFileSync("git", ["show", `HEAD:src/original/${file}`], {
    cwd: ROOT, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: ROOT },
  });
}
const exportKeys = api => Object.keys(api).sort().join("|");
for (const [main, sub, dep] of PAIRS) {
  const oldCtx = sandbox();
  // 旧版主文件不含新子模块引用；给旧版环境补上惰性代理避免误报
  load(oldCtx, headSrc(main), `HEAD:${main}`);
  const oldApi = oldCtx[main.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/\.js$/, "")];
  // 用更稳的方式取挂载名
  const mount = Object.keys(oldCtx).find(k => /^(RuinsDragonSkills|LocalCoreDungeonOps|RuinsEliteSkills)$/.test(k));
  const newCtx = sandbox();
  load(newCtx, patched(sub), sub);
  load(newCtx, patched(main), main);
  const newMount = Object.keys(newCtx).find(k => /^(RuinsDragonSkills|LocalCoreDungeonOps|RuinsEliteSkills)$/.test(k));
  check(`B1 ${main} 拆分前后导出接口逐项一致`,
    !!mount && !!newMount && exportKeys(oldCtx[mount]) === exportKeys(newCtx[newMount]),
    `old=${mount}:${Object.keys(oldCtx[mount] || {}).sort().join(",")} new=${newMount}:${Object.keys(newCtx[newMount] || {}).sort().join(",")}`);
  // 漏加载子模块 → 必须抛含子模块名的显式错误
  const only = sandbox();
  let msg = "";
  try { load(only, patched(main), main); } catch (e) { msg = e.message; }
  check(`B2 ${main} 漏加载子模块立即显式报错且点名 ${dep}`,
    msg.includes("缺少子模块") && msg.includes(dep), msg.slice(0, 110));
}

// ── B3 物理位置精确锁定 ──────────────────────────────────────────────
// 22 个历史测试固件改走「主+子拼接视图」后，静态断言的作用域从单个文件放宽到模块簇。
// 这里补一道精确检查：被搬走的关键逻辑必须只在子模块里、主文件里不得残留，
// 且装配点确实引用了该子模块——避免拼接视图掩盖装配关系被破坏的情况。
const MOVED = [
  ["ruins-dragon-tailgun.js", "ruins-dragon-skills.js",
    ["tailGunArmor: true", "BattleReactionQueue.flush(state, damage)", "我方全体遭到扫射"]],
  ["local-core-dungeon-settlement.js", "local-core-dungeon.js",
    ["CharacterProgression.rewardFor(kind, diff, run.missionId)",
      "mission?.reward?.goldMultiplier", "|| mission?.devLocked) return outcomes.rejected"]],
  ["ruins-elite-prepare-skills.js", "ruins-elite-skills.js",
    ["cleanRefill: true", "enemy.hp = window.BattleHpValue.maxHp(enemy)", "delete enemy.deathDiscarded"]],
];
MOVED.forEach(([sub, main, keys], i) => {
  const s = patched(sub), m = patched(main);
  check(`B3.${i} ${sub} 承载全部已搬走逻辑`, keys.every(k => s.includes(k)));
  check(`B3.${i} ${main} 不含已搬走逻辑（拼接视图不会掩盖残留）`,
    keys.every(k => !m.includes(k)));
});

// ── C 行为等价：机尾机枪 / 结算 / 准备阶段 ────────────────────────────
{
  const ctx = sandbox();
  load(ctx, patched("ruins-dragon-tailgun.js"), "sub");
  load(ctx, patched("ruins-dragon-skills.js"), "main");
  const R = ctx.RuinsDragonSkills;
  const allies = [1, 2, 3, 4].map(i => ({ uid: `a${i}`, side: "ally", hp: 100, hand: [] }));
  const dragon = { uid: "d1", side: "enemy", ai: "ruins_dragon", name: "机械AI龙",
    hp: 100, stats: { attack: 6 }, hand: [{ name: "杀" }], ruinsHitsThisTurn: 0, ruinsGunFired: false };
  const state = { battle: { allies, enemies: [dragon], animQueue: [], locked: false } };
  R.afterDamage(state, { uid: "atk", side: "ally", ai: "normal", stats: {} }, dragon,
    { name: "杀（普攻）", type: "slash" }, 10, () => ({ hpLoss: 0 }));
  check("C1 机尾机枪仍触发且 4 个全体目标全部入队",
    dragon.ruinsGunFired && ctx.__enq.length === 4 && ctx.__flushed === 1,
    `enq=${ctx.__enq.length} flushed=${ctx.__flushed}`);
  check("C2 全体目标线与战报照常产出",
    state.battle.animQueue.length === 1 && ctx.__logs.some(t => t.includes("我方全体遭到扫射")));
}
{
  const ctx = sandbox();
  load(ctx, patched("local-core-dungeon-settlement.js"), "sub");
  load(ctx, patched("local-core-dungeon.js"), "main");
  const api = ctx.LocalCoreDungeonSettlement;
  const core = { pendingRun: { gold: 0, essence: 0, cards: [], relics: [] },
    localRunState: { rewards: {} }, resources: { gold: 0, essence: 0, relics: [] },
    defeatedElites: [], unlockedShopCards: [], chars: [], flags: {}, defeatLedger: {} };
  const r = api.settleDungeon(core, { run: { missionId: "m1", difficultyId: "normal" }, nodeId: "nope" });
  check("C3 结算子模块可装配并正常早返回（无节点→rejected）",
    typeof api.settleDungeon === "function" && r === "rejected", `r=${r}`);
  check("C4 主文件四条入口全部可调用",
    ["startDungeon", "settleDungeon", "bankRun", "settleDefeat"]
      .every(k => typeof ctx.LocalCoreDungeonOps[k] === "function"));
}
{
  const ctx = sandbox();
  load(ctx, patched("ruins-elite-prepare-skills.js"), "sub");
  load(ctx, patched("ruins-elite-skills.js"), "main");
  const api = ctx.RuinsElitePrepareSkills;
  const hilde = { uid: "h1", ai: "ruins_hilde", name: "希尔德", side: "enemy", hp: 100,
    deck: [{ suit: "♠", name: "杀" }, { suit: "♥", name: "闪" }], discard: [], hand: [] };
  ctx.state = { battle: { enemies: [hilde], animQueue: [] } };
  api.shadowDance(ctx.state, hilde);
  check("C5 影舞步拆出后仍按判定停牌并产出动画事件",
    hilde.discard.length >= 1 && ctx.state.battle.animQueue.length >= 1,
    `discard=${hilde.discard.length} anim=${ctx.state.battle.animQueue.length}`);
  const carrier = { uid: "c1", ai: "ruins_carrier", name: "运输车", side: "enemy", hp: 100, maxHp: 100 };
  ctx.state = { battle: { enemies: [carrier], animQueue: [] } };
  api.reinforce(ctx.state, carrier);
  check("C6 增援部队无阵亡友军时正常早返回（不误伤施术者）", carrier.hp === 100);
  check("C7 主文件 prepare 仍能调度两个拆出的技能",
    typeof ctx.RuinsEliteSkills.prepare === "function"
    && typeof api.shadowDance === "function" && typeof api.reinforce === "function");
}

const bad = results.filter(r => !r.ok);
const red = bad.map(r => r.n);
if (REVERT) {
  const exp = EXPECT[REVERT] || [];
  const ok = exp.length && exp.every(e => red.some(n => n.startsWith(e)))
    && red.every(n => exp.some(e => n.startsWith(e)));
  console.log(`REVERT=${REVERT} RED=${JSON.stringify(red)} EXPECTED=${JSON.stringify(exp)} ${ok ? "PRECISE_OK" : "PRECISE_FAIL"}`);
  if (!ok) process.exit(1);
} else {
  console.log(`RESULT ${results.length - bad.length}/${results.length}`);
  if (bad.length) { bad.forEach(b => console.log("  FAILED", b.n, b.d)); process.exit(1); }
}
